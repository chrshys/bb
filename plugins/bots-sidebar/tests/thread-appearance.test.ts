import { afterEach, expect, it } from "vitest";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { backend, request, simulateSystemSendAvailability } from "./backend-fixture";

const hosts: Awaited<ReturnType<typeof backend>>[] = [];
afterEach(async () => { await Promise.all(hosts.splice(0).map(host => host.harness.lifecycle.dispose())); });
async function setup() { const host = await backend(); hosts.push(host); return host; }

it("resolves saved colors for coordinator, manual roots and inherited children without assigning unbound threads", async () => {
  const host = await setup();
  const bot = await host.create();
  const other = await host.create("Other");
  host.store.save({ ...other, avatar: { ...other.avatar, color: "#ABCDEF" } });
  await host.harness.behavior.callRpc("conversation_create", { botId: bot.id, request: request(), coordinator: true });
  for (const [id, parentThreadId, sourceThreadId] of [["manual", null, null], ["child", "manual", null], ["fork", null, "manual"], ["cross", "manual", null], ["unassigned", null, null]] as const) {
    host.threads.set(id, makeThreadResponse({ id, projectId: "project", parentThreadId, sourceThreadId }));
  }
  host.store.bind("manual", bot.id); host.store.bind("cross", other.id);
  const bindings = host.store.bindings();
  for (const threadId of [host.store.require(bot.id).coordinatorThreadId!, "manual", "child", "fork"]) {
    expect(await host.harness.behavior.callRpc("thread_appearance", { threadId })).toEqual({ state: "assigned", available: true, botId: bot.id, color: bot.avatar.color, revision: host.store.require(bot.id).updatedAt });
  }
  expect(await host.harness.behavior.callRpc("thread_appearance", { threadId: "cross" })).toMatchObject({ state: "assigned", botId: other.id, color: "#ABCDEF" });
  expect(await host.harness.behavior.callRpc("thread_appearance", { threadId: "unassigned" })).toEqual({ state: "unassigned", available: true });
  expect(host.store.bindings()).toEqual(bindings);
  expect(host.harness.inspection.sdk.callsTo("threads.send")).toEqual([]);
  const cli = await host.harness.behavior.runCli(["appearance", "child", "--json"]);
  expect(cli.exitCode).toBe(0);
  expect(JSON.parse(cli.stdout!)).toMatchObject({ state: "assigned", color: bot.avatar.color });
});

it("returns fresh saved colors and rejects discovery failure instead of claiming unassigned", async () => {
  const host = await setup(); const bot = await host.create(); host.store.bind("manual", bot.id);
  expect(await host.harness.behavior.callRpc("thread_appearance", { threadId: "manual" })).toMatchObject({ color: bot.avatar.color });
  host.store.save({ ...bot, avatar: { ...bot.avatar, color: "#123456" }, updatedAt: bot.updatedAt + 1 });
  expect(await host.harness.behavior.callRpc("thread_appearance", { threadId: "manual" })).toMatchObject({ color: "#123456", revision: bot.updatedAt + 1 });
  await expect(host.harness.behavior.callRpc("thread_appearance", { threadId: "missing" })).rejects.toThrow("Thread missing");
});

it("rejects invalid saved color at the appearance boundary", async () => {
  const host = await setup(); const bot = await host.create(); host.store.bind("manual", bot.id);
  host.seedLegacy({ ...bot, avatar: { ...bot.avatar, color: "url(unsafe)" } });
  await expect(host.harness.behavior.callRpc("thread_appearance", { threadId: "manual" })).rejects.toThrow();
});

it.each([true, false, undefined])("preserves native presentation intent %s through new and reused coordinator requests", async (humanMessagePresentation) => {
  const host = await setup(); const bot = await host.create();
  host.harness.inspection.sdk.stub("threads.send", async () => ({ ok: true, delivery: "sent" }));
  const chosen = { ...request(), ...(humanMessagePresentation === undefined ? {} : { humanMessagePresentation }) };
  await host.harness.behavior.callRpc("conversation_create", { botId: bot.id, request: chosen, coordinator: true });
  const spawned = host.harness.inspection.sdk.callsTo("threads.spawn").at(-1)!;
  expect(spawned[0]).toMatchObject({ projectId: chosen.projectId });
  expect(spawned[0]).toMatchObject(humanMessagePresentation === undefined ? {} : { humanMessagePresentation });
  if (humanMessagePresentation === undefined) expect(spawned[0]).not.toHaveProperty("humanMessagePresentation");
  await host.harness.behavior.callRpc("conversation_create", { botId: bot.id, request: chosen, coordinator: true });
  const sent = host.harness.inspection.sdk.callsTo("threads.send").at(-1)!;
  expect(sent[0]).toMatchObject({ input: chosen.input, mode: "queue-if-active" });
  expect(sent[0]).toMatchObject(humanMessagePresentation === undefined ? {} : { humanMessagePresentation });
  if (humanMessagePresentation === undefined) expect(sent[0]).not.toHaveProperty("humanMessagePresentation");
});

it("advertises appearance only when the actual trusted backend wrapper is present", async () => {
  const host = await setup(); const bot = await host.create(); host.store.bind("manual", bot.id);
  let available = false;
  simulateSystemSendAvailability(host.bb, () => available);
  expect(await host.harness.behavior.callRpc("thread_appearance", { threadId: "manual" })).toMatchObject({ available: false });
  available = true;
  expect(await host.harness.behavior.callRpc("thread_appearance", { threadId: "manual" })).toMatchObject({ available: true });
  available = false;
  expect(await host.harness.behavior.callRpc("thread_appearance", { threadId: "manual" })).toMatchObject({ available: false });
});
