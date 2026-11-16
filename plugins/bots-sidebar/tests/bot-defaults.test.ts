import { afterEach, expect, it } from "vitest";
import { makePluginAgentConfigurationContext, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { backend, project, request } from "./backend-fixture";

const hosts: Awaited<ReturnType<typeof backend>>[] = [];
afterEach(async () => { await Promise.all(hosts.splice(0).map(host => host.harness.lifecycle.dispose())); });
async function setup() { const host = await backend([project(), project("other")]); hosts.push(host); return host; }

it("sets a bot default project through the CLI without claiming ownership and persists it across reload", async () => {
  const host = await setup(); const bot = await host.create();
  const result = await host.harness.behavior.runCli(["project", bot.id, "other", "--json"]);
  expect(result.exitCode).toBe(0);
  expect(host.store.require(bot.id).defaultProjectId).toBe("other");
  expect(host.store.require(bot.id).linkedProjectIds).toEqual(["project", "other"]);
  expect(host.store.projectOwner("other")).toBeUndefined();
  await host.reload();
  expect(host.store.require(bot.id).defaultProjectId).toBe("other");
  const invalid = await host.harness.behavior.runCli(["project", bot.id, "missing"]);
  expect(invalid.exitCode).toBe(1);
  expect(host.store.require(bot.id).defaultProjectId).toBe("other");
});

it("creates one coordinator under concurrent requests with first-turn instructions and preserves old conversations", async () => {
  const host = await setup(); const bot = await host.create();
  host.harness.inspection.sdk.stub("threads.send", async () => ({ ok: true, delivery: "sent" }));
  const ordinary = await host.harness.behavior.callRpc("conversation_create", { botId: bot.id, request: request() });
  const input = { botId: bot.id, request: request(), coordinator: true };
  const [first, second] = await Promise.all([host.harness.behavior.callRpc("conversation_create", input), host.harness.behavior.callRpc("conversation_create", input)]);
  expect(first).toEqual(second);
  expect(first).not.toEqual(ordinary);
  expect(host.threads.size).toBe(2);
  expect(host.harness.inspection.sdk.callsTo("threads.send")[0]?.[0]).toMatchObject({ input: request().input, mode: "queue-if-active" });
  expect(host.initialConfigurations.at(-1)?.instructions).toContain("You are this bot’s coordinator");
  const id = host.store.require(bot.id).coordinatorThreadId!;
  expect(host.store.require(bot.id).mainThreadId).not.toBe(id);
  await host.reload();
  const configuration = await host.harness.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext({ thread: { id }, project: { id: "project" } }));
  expect(configuration.instructions).toContain("You are this bot’s coordinator");
  host.harness.inspection.sdk.stub("threads.send", async () => ({ ok: true, delivery: "sent" }));
  host.threads.set(id, { ...host.threads.get(id)!, archivedAt: Date.now() });
  host.harness.inspection.sdk.stub("threads.unarchive", async ({ threadId }) => { host.threads.set(threadId, { ...host.threads.get(threadId)!, archivedAt: null }); return { ok: true }; });
  await host.harness.behavior.callRpc("conversation_create", input);
  expect(host.store.require(bot.id).coordinatorThreadId).toBe(id);
  expect(host.threads.get(id)?.archivedAt).toBeNull();
  host.threads.set(id, { ...host.threads.get(id)!, deletedAt: Date.now() });
  await expect(host.harness.behavior.callRpc("conversation_create", input)).rejects.toThrow("will not be silently replaced");
  expect(host.store.require(bot.id).coordinatorThreadId).toBe(id);
});


it("uses Sol Medium and the bot default project when opening a coordinator through the CLI", async () => {
  const host = await setup(); const bot = await host.create();
  expect((await host.harness.behavior.runCli(["project", bot.id, "other"])).exitCode).toBe(0);
  const result = await host.harness.behavior.runCli(["coordinator", bot.id, "Organize my work", "--json"]);
  expect(result.exitCode).toBe(0);
  expect(host.harness.inspection.sdk.callsTo("threads.spawn")[0]?.[0]).toMatchObject({ projectId: "other", providerId: "codex", model: "gpt-6.1-sol", reasoningLevel: "medium" });
  const listing = await host.harness.behavior.runCli(["list", "--json"]);
  const value = JSON.parse(listing.stdout!);
  expect(value.bots[0].coordinatorThreadId).toBe(JSON.parse(result.stdout!).threadId);
  expect(value.bots[0].conversations).toHaveLength(1);
});

it("delivers assignment-only policy at creation and reload while inherited workers execute", async () => {
  const host = await setup(); const bot = await host.create();
  await host.harness.behavior.callRpc("conversation_create", { botId: bot.id, request: request(), coordinator: true });
  const id = host.store.require(bot.id).coordinatorThreadId!;
  const initial = host.initialConfigurations.at(-1)!.instructions!;
  const spawn = host.harness.inspection.sdk.callsTo("threads.spawn")[0]![0];
  await host.reload();
  const resumed = await host.harness.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext({ thread: { id }, project: { id: "project" } }));
  for (const instructions of [initial, resumed.instructions!]) {
    for (const rule of ["never do substantive work yourself", "For every ask", "non-archived worker", "Exclude yourself", "bb thread spawn --parent-self", "bb thread tell", "--mode queue", "not in-process subagents", "acceptance criteria", "Agent messages are not user approval", "takes precedence over bot role, SOUL, and memory"]) {
      expect(instructions).toContain(rule);
      expect(spawn).toMatchObject({ input: expect.arrayContaining([expect.objectContaining({ visibility: "agent-only", text: expect.stringContaining(rule) })]) });
    }
  }
  const child = makeThreadResponse({ id: "worker", parentThreadId: id, projectId: "project" });
  host.threads.set(child.id, child);
  await host.harness.behavior.emitThreadEvent("thread.created", { thread: child });
  const worker = await host.harness.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext({ thread: { id: child.id, parentThreadId: id }, project: { id: "project" } }));
  expect(host.store.owner(child.id)).toBe(bot.id);
  expect(worker.instructions).toContain("execution agent, not the coordinator");
  expect(worker.instructions).not.toContain("never do substantive work yourself");
});
