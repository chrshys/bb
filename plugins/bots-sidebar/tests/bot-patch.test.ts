import { afterEach, expect, it } from "vitest";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { backend, hash, project } from "./backend-fixture";
import { rpcContract, type BotMetadata } from "../contract";

const instances: Awaited<ReturnType<typeof backend>>[] = [];
afterEach(async () => { await Promise.all(instances.splice(0).map((host) => host.harness.lifecycle.dispose())); });
async function start(projects = [project()]) {
  const host = await backend(projects); instances.push(host);
  const bot = await host.create();
  const patch = (expected: object, changes: object) => host.harness.behavior.callRpc("bot_patch", { botId: bot.id, expected, changes }) as Promise<BotMetadata>;
  return { host, bot, patch };
}

it("changes only the named field and leaves private state and projects alone", async () => {
  const { host, bot, patch } = await start();
  await host.harness.behavior.callRpc("state_update", { botId: bot.id, file: "MEMORY.md", content: "- Fact.\n", expectedSha256: bot.stateHashes["MEMORY.md"] });
  const saved = await patch({ name: "Atlas" }, { name: "  Atlas Prime  " });
  expect(saved).toMatchObject({ name: "Atlas Prime", role: bot.role, soul: bot.soul, memory: "- Fact.\n", linkedProjectIds: ["project"], avatar: bot.avatar, hostId: bot.hostId });
  expect(saved.stateHashes["MEMORY.md"]).toBe(hash("- Fact.\n"));
  expect(saved.updatedAt).toBeGreaterThan(bot.updatedAt);
  await host.reload();
  expect(host.store.require(bot.id).name).toBe("Atlas Prime");
  expect(host.harness.inspection.sdk.callsTo("projects.update")).toEqual([]);
});

it("refuses to overwrite a field that changed since the edit began, and saves nothing", async () => {
  const { host, bot, patch } = await start();
  await patch({ role: "Research" }, { role: "Reviewer" });
  await expect(patch({ role: "Research", name: "Atlas" }, { role: "Writer", name: "Must not save" })).rejects.toThrow("Role changed elsewhere");
  expect(host.store.require(bot.id)).toMatchObject({ role: "Reviewer", name: "Atlas" });
  await expect(patch({ avatar: { ...bot.avatar, shape: "blob" } }, { avatar: { ...bot.avatar, expression: "happy" } })).rejects.toThrow("Avatar changed elsewhere");
  expect(host.store.require(bot.id).avatar).toEqual(bot.avatar);
});

it("is not blocked by unrelated changes to the same bot", async () => {
  const { host, bot, patch } = await start();
  const ctx = { threadId: "bound", projectId: "project" };
  host.store.bind("bound", bot.id);
  host.threads.set("bound", makeThreadResponse({ id: "bound", projectId: "project" }));
  await host.harness.behavior.callAgentTool("bot_update_state", { target: "memory", action: "append", fact: "Learned meanwhile." }, ctx);
  await host.harness.behavior.callRpc("visibility_set", { botId: bot.id, hiddenUntilActivity: true });
  const saved = await patch({ name: "Atlas" }, { name: "Renamed" });
  expect(saved).toMatchObject({ name: "Renamed", hiddenUntilActivity: true });
  expect(saved.memory).toContain("Learned meanwhile.");
});

it("validates the machine, section and default project before saving", async () => {
  const { host, bot, patch } = await start([project(), project("second")]);
  await expect(patch({ hostId: bot.hostId }, { hostId: "missing" })).rejects.toThrow(/enrolled/);
  await expect(patch({ sectionId: null }, { sectionId: "missing" })).rejects.toThrow("Section no longer exists");
  await expect(patch({ defaultProjectId: "project" }, { defaultProjectId: "second" })).rejects.toThrow("must be linked");
  expect(host.store.require(bot.id)).toMatchObject({ hostId: bot.hostId, sectionId: null });
  const section = await host.harness.behavior.callRpc("section_create", { name: "Team" }) as { id: string };
  expect(await patch({ sectionId: null, defaultProjectId: "project" }, { sectionId: section.id, defaultProjectId: null })).toMatchObject({ sectionId: section.id, defaultProjectId: null });
});

it("does not publish or bump the revision when nothing changes", async () => {
  const { host, bot, patch } = await start();
  const before = host.store.require(bot.id).updatedAt;
  expect((await patch({ name: "Atlas" }, { name: "Atlas" })).updatedAt).toBe(before);
});

it("requires a change and the value each changed field was edited from", () => {
  const parse = (expected: object, changes: object) => rpcContract.bot_patch.input.safeParse({ botId: "bot", expected, changes }).success;
  expect(parse({}, {})).toBe(false);
  expect(parse({}, { name: "New" })).toBe(false);
  expect(parse({ name: "Old", role: "Old" }, { name: "New" })).toBe(false);
  expect(parse({ name: "Old" }, { name: "   " })).toBe(false);
  expect(parse({ name: "Old" }, { name: "New", soul: "Not patchable here" })).toBe(false);
  expect(parse({ sectionId: null }, { sectionId: "team" })).toBe(true);
});

it("resolves the bot of a conversation, including inherited children, without private state", async () => {
  const { host, bot } = await start();
  host.store.bind("root", bot.id);
  host.threads.set("root", makeThreadResponse({ id: "root", projectId: "project" }));
  host.threads.set("child", makeThreadResponse({ id: "child", projectId: "project", parentThreadId: "root" }));
  host.threads.set("loose", makeThreadResponse({ id: "loose", projectId: "project" }));
  const summary = { bot: { id: bot.id, name: "Atlas", avatar: bot.avatar } };
  expect(await host.harness.behavior.callRpc("thread_bot", { threadId: "root" })).toEqual(summary);
  expect(await host.harness.behavior.callRpc("thread_bot", { threadId: "child" })).toEqual(summary);
  expect(await host.harness.behavior.callRpc("thread_bot", { threadId: "loose" })).toEqual({ bot: null });
  expect(host.store.owner("child")).toBeNull();
});
