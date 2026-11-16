import { createHash } from "node:crypto";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { rpcContract, type BotMetadata, type BotStateFile, type ProjectOwner } from "../contract";
import { resetBotPanelBridgeForTest } from "../lib/bot-panel-bridge";
import { resetFieldDraftsForTest } from "../lib/field-drafts";
import { bot as baseBot, personalProjectId } from "./fixtures";

export const sha = (content: string) => createHash("sha256").update(content, "utf8").digest("hex");
const settingsText = (settings: BotMetadata["settings"]) => `${JSON.stringify(settings, null, 2)}\n`;
function content(bot: BotMetadata, file: BotStateFile) {
  return file === "SOUL.md" ? bot.soul : file === "MEMORY.md" ? bot.memory : settingsText(bot.settings);
}
function hashed(bot: BotMetadata): BotMetadata {
  return { ...bot, stateHashes: { "SOUL.md": sha(bot.soul), "AGENTS.md": sha(bot.agents), "MEMORY.md": sha(bot.memory), "settings.json": sha(settingsText(bot.settings)) } };
}

export function resetPanelState() {
  resetFieldDraftsForTest();
  resetBotPanelBridgeForTest();
}

export function panelBackend(seed: Array<Partial<BotMetadata>> = [{}]) {
  const world = {
    bots: seed.map((entry, index) => hashed({ ...baseBot, id: index === 0 ? "bot" : `bot-${index + 1}`, mainThreadId: null, linkedProjectIds: [], defaultProjectId: null, ...entry })),
    sections: [] as { id: string; name: string; order: number }[],
    projects: [{ id: "existing", name: "Existing work" }, { id: "other", name: "Other work" }],
    owners: [] as ProjectOwner[],
    hosts: [{ id: "host", name: "Local", connected: true }, { id: "remote", name: "Remote", connected: true }],
    threadBots: new Map<string, string>(),
    fail: new Map<string, Error>(),
    gate: new Map<string, Promise<void>>(),
  };
  const find = (botId: string) => {
    const found = world.bots.find((entry) => entry.id === botId);
    if (!found) throw new Error("Bot no longer exists");
    return found;
  };
  const replace = (next: BotMetadata) => {
    const stored = hashed({ ...next, updatedAt: next.updatedAt + 1 });
    world.bots = world.bots.map((entry) => entry.id === stored.id ? stored : entry);
    return stored;
  };
  async function guard(method: string) {
    await world.gate.get(method);
    const failure = world.fail.get(method);
    if (failure) { world.fail.delete(method); throw failure; }
  }
  const rpc: Record<string, (input: unknown) => unknown> = {
    bots_list: () => ({ bots: world.bots, hosts: world.hosts, sections: world.sections, projects: world.projects, warnings: [], personalProjectId, threadBindings: [...world.threadBots].map(([threadId, botId]) => ({ threadId, botId })), projectOwners: world.owners }),
    thread_bot: (raw) => {
      const { threadId } = rpcContract.thread_bot.input.parse(raw);
      const botId = world.threadBots.get(threadId);
      const found = botId ? world.bots.find((entry) => entry.id === botId) : undefined;
      return { bot: found ? { id: found.id, name: found.name, avatar: found.avatar } : null };
    },
    bot_patch: async (raw) => {
      const input = rpcContract.bot_patch.input.parse(raw);
      await guard("bot_patch");
      const current = find(input.botId);
      for (const [key, expected] of Object.entries(input.expected)) {
        const actual = key === "defaultProjectId" ? current.defaultProjectId ?? null : current[key as "name"];
        if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${key} changed elsewhere. Review the latest value before saving.`);
      }
      return replace({ ...current, ...input.changes });
    },
    state_read: (raw) => {
      const input = rpcContract.state_read.input.parse(raw);
      const value = content(find(input.botId), input.file);
      return { botId: input.botId, file: input.file, content: value, sha256: sha(value) };
    },
    state_update: async (raw) => {
      const input = rpcContract.state_update.input.parse(raw);
      await guard("state_update");
      const current = find(input.botId);
      if (sha(content(current, input.file)) !== input.expectedSha256) throw new Error(`${input.file} changed. Read it again and merge your update.`);
      const next = replace({ ...current, ...(input.file === "SOUL.md" ? { soul: input.content } : input.file === "MEMORY.md" ? { memory: input.content } : { settings: JSON.parse(input.content) as BotMetadata["settings"] }) });
      const value = content(next, input.file);
      return { botId: input.botId, file: input.file, content: value, sha256: sha(value) };
    },
    state_apply: async (raw) => {
      const input = rpcContract.state_apply.input.parse(raw);
      await guard("state_apply");
      const { change } = input;
      if (change.target !== "project") throw new Error("Unexpected state change");
      const current = find(input.botId);
      const owner = world.owners.find((entry) => entry.projectId === change.projectId);
      if (change.action === "own" && owner && owner.botId !== input.botId) throw new Error("Project already owned by another bot. Release that ownership first.");
      const linked = new Set(current.linkedProjectIds);
      if (change.action === "join" || change.action === "own") linked.add(change.projectId);
      if (change.action === "leave") linked.delete(change.projectId);
      if (change.action !== "join") world.owners = world.owners.filter((entry) => !(entry.projectId === change.projectId && entry.botId === input.botId));
      if (change.action === "own") world.owners = [...world.owners, { projectId: change.projectId, botId: input.botId }];
      const next = replace({ ...current, linkedProjectIds: [...linked], defaultProjectId: current.defaultProjectId && !linked.has(current.defaultProjectId) ? null : current.defaultProjectId });
      return { botId: input.botId, target: "project", changed: true, revision: next.updatedAt, state: {} };
    },
    section_create: (raw) => {
      const { name } = rpcContract.section_create.input.parse(raw);
      const section = { id: `section-${world.sections.length + 1}`, name, order: world.sections.length };
      world.sections = [...world.sections, section];
      return section;
    },
    project_create: async (raw) => {
      const input = rpcContract.project_create.input.parse(raw);
      await guard("project_create");
      const project = { id: "new-project", name: input.name };
      if (!world.projects.some((entry) => entry.id === project.id)) world.projects = [...world.projects, project];
      return project;
    },
    project_browse: (raw) => {
      const input = rpcContract.project_browse.input.parse(raw);
      return { directory: input.path ?? `/home/${input.hostId}`, parent: "/", entries: [{ name: "work", path: "/work" }], truncated: false };
    },
  };
  return {
    world, rpc,
    bot: (botId = "bot") => find(botId),
    agentChange(botId: string, patch: Partial<BotMetadata>) { return replace({ ...find(botId), ...patch }); },
    failNext(method: string, message: string) { world.fail.set(method, new Error(message)); },
    hold(method: string) {
      let release!: () => void;
      world.gate.set(method, new Promise<void>((resolve) => { release = resolve; }));
      return () => { world.gate.delete(method); release(); };
    },
  };
}
export type PanelBackend = ReturnType<typeof panelBackend>;

const app = await loadPluginApp(() => import("../app"));
export const pluginApp = app;
export const botPanelAction = app.threadPanelActions.find((action) => action.id === "bot")!;

export function writes(slot: { inspection: { rpcCalls: { method: string; input: unknown }[] } }) {
  return slot.inspection.rpcCalls.filter((call) => !["bots_list", "thread_bot", "state_read", "project_browse"].includes(call.method));
}

export async function mountBotPanel(backend: PanelBackend, { botId = "bot", threadId = "thread" }: { botId?: string | null; threadId?: string } = {}) {
  const slot = renderSlot(botPanelAction, { threadId, params: botId === null ? null : { botId } }, { rpc: backend.rpc });
  if (botId !== null) await slot.findByRole("region", { name: `${backend.bot(botId).name} bot settings` });
  return slot;
}
