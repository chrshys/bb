import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { backend, request, simulateSystemSendAvailability } from "./backend-fixture";

type Host = Awaited<ReturnType<typeof backend>>;
type Event = Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["events"]["list"]>>[number];
const hosts: Host[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-15T12:00:00Z")); });
afterEach(async () => { await Promise.all(hosts.splice(0).map(host => host.harness.lifecycle.dispose())); vi.useRealTimers(); });

async function setup() {
  const host = await backend(); hosts.push(host);
  const bot = await host.create();
  await host.harness.behavior.callRpc("conversation_create", { botId: bot.id, request: request(), coordinator: true });
  const coordinatorId = host.store.require(bot.id).coordinatorThreadId!;
  const history = new Map<string, Event[]>();
  let queued: object[] = [];
  const sends: { threadId: string; text: string }[] = [];
  let acceptThenFail = false;
  let acceptedInHistory = false;
  function installStubs() {
    host.harness.inspection.sdk.stub("threads.events.list", async (args: Parameters<BbPluginApi["sdk"]["threads"]["events"]["list"]>[0]) => {
      const { threadId, types, afterSeq, order = "asc", limit = "100" } = args;
      const events = (history.get(threadId) ?? []).filter(event => (!types || types.includes(event.type)) && (afterSeq === undefined || event.seq > Number(afterSeq)));
      return [...events].sort((a, b) => order === "asc" ? a.seq - b.seq : b.seq - a.seq).slice(0, Number(limit));
    });
    host.harness.inspection.sdk.stub("threads.interactions.list", async () => []);
    host.harness.inspection.sdk.stub("threads.queuedMessages.list", async () => queued as Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["queuedMessages"]["list"]>>);
    host.harness.inspection.sdk.stub("threads.experimental_sendSystem", async ({ threadId, input }: Parameters<BbPluginApi["sdk"]["threads"]["experimental_sendSystem"]>[0]) => {
      const text = input.filter(block => block.type === "text").map(block => block.text).join("\n");
      sends.push({ threadId, text });
      if (acceptThenFail) {
        if (acceptedInHistory) history.set(threadId, [message(threadId, 20, text, "userMessage")]);
        else queued = [{ input }];
        throw new Error("Transport lost after accepted send");
      }
      return { ok: true, delivery: "sent" };
    });
  }
  installStubs();
  function worker(id: string, parentThreadId: string | null = null, bind = true) {
    const value = makeThreadResponse({ id, title: id, projectId: "project", parentThreadId, status: "active" });
    host.threads.set(id, value);
    if (bind) host.store.bind(id, bot.id);
    return value;
  }
  const sweep = () => host.harness.behavior.runSchedule("coordinator-monitor");
  const mature = async () => { vi.setSystemTime(Date.now() + 21_000); await sweep(); };
  return { host, bot, coordinatorId, history, sends, worker, sweep, mature, installStubs, failAfterAcceptance(inHistory = false) { acceptThenFail = true; acceptedInHistory = inHistory; } };
}

function message(threadId: string, seq: number, text: string, kind: "agentMessage" | "userMessage" = "agentMessage"): Event {
  return { id: `event-${seq}`, threadId, seq, createdAt: Date.now(), scope: { kind: "turn", turnId: "turn" }, type: "item/completed", data: { providerThreadId: "provider", item: kind === "agentMessage" ? { id: `item-${seq}`, type: kind, text } : { id: `item-${seq}`, type: kind, content: [{ type: "text", text }] } } };
}

it("reconciles already active direct bot chats and inherited workers without capturing shared-project chats or the coordinator", async () => {
  const env = await setup();
  env.worker("manual"); env.worker("descendant", "manual", false);
  env.worker("unassigned", null, false);
  const other = await env.host.create("Other");
  env.host.store.bind(env.worker("other-bot", null, false).id, other.id);
  env.host.threads.set(env.coordinatorId, { ...env.host.threads.get(env.coordinatorId)!, status: "active" });
  await env.sweep(); await env.mature();
  expect(env.sends).toHaveLength(1);
  expect(env.sends[0]!.threadId).toBe(env.coordinatorId);
  expect(env.sends[0]!.text).toContain("@thread:manual");
  expect(env.sends[0]!.text).toContain("@thread:descendant");
  expect(env.sends[0]!.text).not.toContain("@thread:unassigned");
  expect(env.sends[0]!.text).not.toContain("@thread:other-bot");
  expect(env.sends[0]!.text).not.toContain(`@thread:${env.coordinatorId}`);
  await env.host.reload(); env.installStubs();
  await env.sweep(); vi.setSystemTime(Date.now() + 301_000); await env.sweep();
  expect(env.sends).toHaveLength(1);
});

it.each([false, true])("recovers accepted delivery after a lost response using %s history markers and durable cursors", async inHistory => {
  const env = await setup(); env.worker("manual"); env.failAfterAcceptance(inHistory);
  await env.sweep(); await env.mature();
  expect(env.sends).toHaveLength(1);
  expect(await env.host.harness.behavior.callRpc("monitoring_status", { botId: env.bot.id })).toMatchObject({ pendingBatch: true, attempts: 1 });
  await env.host.reload(); env.installStubs();
  vi.setSystemTime(Date.now() + 61_000); await env.sweep();
  expect(env.sends).toHaveLength(1);
  expect(await env.host.harness.behavior.callRpc("monitoring_status", { botId: env.bot.id })).toMatchObject({ pendingBatch: false });
});

it("holds updates across explicit monitoring pause and manual coordinator stop until a later user turn", async () => {
  const env = await setup(); env.worker("manual");
  expect((await env.host.harness.behavior.runCli(["monitor", env.bot.id, "pause", "--json"])).exitCode).toBe(0);
  await env.sweep(); await env.mature(); expect(env.sends).toHaveLength(0);
  await env.host.reload(); env.installStubs();
  expect(await env.host.harness.behavior.callRpc("monitoring_status", { botId: env.bot.id })).toMatchObject({ paused: true });
  env.history.set(env.coordinatorId, [{ id: "stop", threadId: env.coordinatorId, seq: 1, createdAt: Date.now(), scope: { kind: "thread" }, type: "system/thread/interrupted", data: { reason: "manual-stop" } }]);
  await env.host.harness.behavior.runCli(["monitor", env.bot.id, "resume"]);
  await env.sweep(); expect(env.sends).toHaveLength(0);
  env.history.set(env.coordinatorId, [{ id: "start", threadId: env.coordinatorId, seq: 2, createdAt: Date.now(), scope: { kind: "turn", turnId: "turn" }, type: "turn/started", data: { providerThreadId: "provider" } }]);
  await env.sweep(); expect(env.sends).toHaveLength(1);
});

it("coalesces evidence and leaves direct child completion to native parent delivery", async () => {
  const env = await setup(); const direct = env.worker("direct", env.coordinatorId); const manual = env.worker("manual");
  await env.sweep(); await env.mature(); env.sends.length = 0;
  vi.setSystemTime(Date.now() + 121_000);
  for (const thread of [direct, manual]) {
    const idle = { ...thread, status: "idle" as const }; env.host.threads.set(thread.id, idle);
    const result = await env.host.harness.behavior.emitThreadEvent("thread.idle", { thread: idle, lastAssistantText: "The requested fix passed verification." });
    expect(result.errors).toEqual([]);
  }
  await env.mature();
  expect(env.sends).toHaveLength(1);
  expect(env.sends[0]!.text).toContain("@thread:manual");
  expect(env.sends[0]!.text).not.toContain("@thread:direct");
  expect(env.sends[0]!.text).toContain("Latest turn finished");
  await env.host.harness.behavior.emitThreadEvent("thread.idle", { thread: env.host.threads.get("manual")!, lastAssistantText: "The requested fix passed verification." });
  vi.setSystemTime(Date.now() + 121_000); await env.sweep();
  expect(env.sends).toHaveLength(1);
});

it("reports observable progress once and suppresses repeated worker evidence", async () => {
  const env = await setup(); const thread = env.worker("manual");
  await env.sweep(); await env.mature(); env.sends.length = 0;
  vi.setSystemTime(Date.now() + 121_000);
  env.history.set(thread.id, [message(thread.id, 1, "Reproduced the failure and isolated the bad query.")]);
  await env.host.harness.behavior.emitThreadEvent("experimental_thread.events", { thread, sequence: 1 });
  await vi.advanceTimersByTimeAsync(20_001);
  await env.mature();
  expect(env.sends).toHaveLength(1);
  expect(env.sends[0]!.text).toContain("Reproduced the failure");
  env.history.set(thread.id, [message(thread.id, 2, "Reproduced the failure and isolated the bad query.")]);
  await env.host.harness.behavior.emitThreadEvent("experimental_thread.events", { thread, sequence: 2 });
  await vi.advanceTimersByTimeAsync(20_001);
  vi.setSystemTime(Date.now() + 121_000); await env.sweep();
  expect(env.sends).toHaveLength(1);
});


it("reports new failures and pending input while retaining the worker’s native approval boundary", async () => {
  const env = await setup(); const failed = env.worker("failed"); const waiting = env.worker("waiting");
  await env.sweep(); await env.mature(); env.sends.length = 0;
  vi.setSystemTime(Date.now() + 121_000);
  const interaction: Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["interactions"]["list"]>>[number] = {
    id: "approval", threadId: waiting.id, turnId: "turn", status: "pending", statusReason: null, createdAt: Date.now(), resolvedAt: null,
    origin: { kind: "plugin", pluginId: "permission-plugin", rendererId: "approval" }, payload: { kind: "plugin", title: "Approve access", data: {} }, resolution: null,
  };
  env.host.harness.inspection.sdk.stub("threads.interactions.list", async ({ threadId }: { threadId: string }) => threadId === waiting.id ? [interaction] : []);
  await env.host.harness.behavior.emitThreadEvent("interaction.pending", { thread: waiting, interaction });
  const errored = { ...failed, status: "error" as const }; env.host.threads.set(failed.id, errored);
  await env.host.harness.behavior.emitThreadEvent("thread.failed", { thread: errored, error: "Build failed: missing dependency" });
  await env.mature();
  expect(env.sends).toHaveLength(1);
  expect(env.sends[0]!.text).toContain("Build failed: missing dependency");
  expect(env.sends[0]!.text).toContain("Needs user input or approval in the worker conversation");
  expect(env.sends[0]!.text).toContain("never user approval");
  expect(env.host.harness.inspection.sdk.callsTo("threads.interactions.resolve")).toEqual([]);
});

it("holds pending work without trusted system delivery and resumes once available without ordinary user sends", async () => {
  const env = await setup(); env.worker("manual");
  let available = false;
  simulateSystemSendAvailability(env.host.bb, () => available);
  await env.sweep(); await env.mature();
  expect(env.sends).toEqual([]);
  expect(await env.host.harness.behavior.callRpc("monitoring_status", { botId: env.bot.id })).toMatchObject({ attempts: 0 });
  available = true;
  await env.sweep();
  const systemCalls = env.host.harness.inspection.sdk.callsTo("threads.experimental_sendSystem");
  expect(systemCalls).toHaveLength(1);
  expect(systemCalls[0]![0]).toMatchObject({ threadId: env.coordinatorId, mode: "queue-if-active" });
  expect(systemCalls[0]![0]).not.toHaveProperty("senderThreadId");
  expect(systemCalls[0]![0]).not.toHaveProperty("humanMessagePresentation");
  expect(env.host.harness.inspection.sdk.callsTo("threads.send")).toEqual([]);
  await env.sweep(); expect(env.host.harness.inspection.sdk.callsTo("threads.experimental_sendSystem")).toHaveLength(1);
});
