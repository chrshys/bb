import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { afterEach, expect, it } from "vitest";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { backend, request } from "./backend-fixture";
import { activeInventorySchema } from "../contract";

type Activity = Pick<
  Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["list"]>>[number],
  "activity" | "hasPendingInteraction"
>;
type Host = Awaited<ReturnType<typeof backend>>;
const hosts: Host[] = [];
afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.harness.lifecycle.dispose()));
});
async function setup() {
  const host = await backend();
  hosts.push(host);
  const bot = await host.create();
  await host.harness.behavior.callRpc("conversation_create", {
    botId: bot.id,
    request: request(),
    coordinator: true,
  });
  const coordinatorId = host.store.require(bot.id).coordinatorThreadId!;
  function worker(
    id: string,
    overrides: Parameters<typeof makeThreadResponse>[0] & Partial<Activity> = {},
    bind = true,
  ) {
    const row = makeThreadResponse({
      id,
      projectId: "project",
      title: id,
      status: "active",
      runtime: { displayStatus: "active" },
      ...overrides,
    });
    host.threads.set(id, row);
    if (bind) host.store.bind(id, bot.id);
    return row;
  }
  const inventory = async () => {
    const result = await host.harness.behavior.callRpc("monitoring_inventory", {
      threadId: coordinatorId,
    });
    return activeInventorySchema.parse(result);
  };
  return { host, bot, coordinatorId, worker, inventory };
}

it("discovers independent roots and inherited workers without membership inference, writes or model delivery", async () => {
  const env = await setup();
  env.worker("manual");
  env.worker("child", { parentThreadId: "manual" }, false);
  env.worker("fork", { sourceThreadId: "manual" }, false);
  env.worker("unassigned", {}, false);
  env.worker("archived", { archivedAt: 1 });
  env.worker("deleted", { deletedAt: 1 });
  const other = await env.host.create("Other");
  env.host.store.bind(env.worker("other", { parentThreadId: "manual" }, false).id, other.id);
  env.host.threads.set(env.coordinatorId, {
    ...env.host.threads.get(env.coordinatorId)!,
    status: "active",
    runtime: { displayStatus: "active" },
  });
  await env.host.harness.behavior.callRpc("monitoring_pause", { botId: env.bot.id, paused: true });
  const bindings = env.host.store.bindings();
  const state = await env.host.harness.behavior.callRpc("monitoring_status", { botId: env.bot.id });
  const result = await env.inventory();
  expect(result.state).toBe("ready");
  expect(result.items.map((item) => item.threadId).sort()).toEqual(["child", "fork", "manual"]);
  expect(result.items).toContainEqual({
    threadId: "manual",
    projectId: "project",
    title: "manual",
    status: "active",
  });
  expect(env.host.store.bindings()).toEqual(bindings);
  expect(
    await env.host.harness.behavior.callRpc("monitoring_status", { botId: env.bot.id }),
  ).toEqual(state);
  expect(env.host.harness.inspection.sdk.callsTo("threads.send")).toEqual([]);
  const cli = await env.host.harness.behavior.runCli(["monitor", env.bot.id, "active", "--json"]);
  expect(cli.exitCode).toBe(0);
  expect(activeInventorySchema.parse(JSON.parse(cli.stdout!)).items).toEqual(result.items);
  expect(
    activeInventorySchema.parse(
      await env.host.harness.behavior.callRpc("monitoring_inventory", { threadId: "manual" }),
    ).state,
  ).toBe("not-coordinator");
});

it("normalizes native runtime, pending input and background activity while excluding settled and failed work", async () => {
  const env = await setup();
  for (const status of [
    "active",
    "starting",
    "provisioning",
    "pending",
    "waiting-for-host",
    "stopping",
    "idle",
    "error",
  ] as const) {
    env.worker(status, { status: "idle", runtime: { displayStatus: status } });
  }
  env.worker("input", {
    status: "idle",
    runtime: { displayStatus: "idle" },
    hasPendingInteraction: true,
  });
  env.worker("background", {
    status: "idle",
    runtime: { displayStatus: "idle" },
    activity: {
      activeWorkflowCount: 1,
      activeBackgroundAgentCount: 0,
      activeBackgroundCommandCount: 0,
      activePlanModeCount: 0,
      activeGoalCount: 0,
    },
  });
  const result = await env.inventory();
  expect(Object.fromEntries(result.items.map((item) => [item.threadId, item.status]))).toEqual({
    active: "active",
    starting: "starting",
    provisioning: "provisioning",
    pending: "pending",
    "waiting-for-host": "waiting-for-host",
    stopping: "stopping",
    input: "waiting-for-input",
    background: "active",
  });
});

it("deduplicates overlapping pages and makes failed discovery visibly unavailable or partial", async () => {
  const env = await setup();
  const manual = env.worker("manual");
  let calls = 0;
  env.host.harness.inspection.sdk.stub("threads.list", async () => {
    calls++;
    if (calls === 1) return Array.from({ length: 100 }, () => manual);
    return [manual];
  });
  expect((await env.inventory()).items.map((item) => item.threadId)).toEqual(["manual"]);
  calls = 0;
  env.host.harness.inspection.sdk.stub("threads.list", async () => {
    if (calls++ === 0) return Array.from({ length: 100 }, () => manual);
    throw new Error("offline");
  });
  expect(await env.inventory()).toMatchObject({
    state: "partial",
    items: [{ threadId: "manual" }],
    issue: expect.any(String),
  });
  env.host.harness.inspection.sdk.stub("threads.list", async () => {
    throw new Error("offline");
  });
  expect(await env.inventory()).toMatchObject({
    state: "unavailable",
    items: [],
    issue: expect.any(String),
  });
});

it("bounds scan and output volume instead of reporting a falsely complete inventory", async () => {
  const env = await setup();
  const root = env.worker("root");
  let pages = 0;
  env.host.harness.inspection.sdk.stub("threads.list", async () => {
    pages++;
    return Array.from({ length: 100 }, (_, index) =>
      makeThreadResponse({ ...root, id: `child-${pages}-${index}`, parentThreadId: root.id }),
    );
  });
  const result = await env.inventory();
  expect(result.state).toBe("partial");
  expect(result.issue).toBeTruthy();
  expect(pages).toBeLessThanOrEqual(20);
  expect(result.items).toHaveLength(100);
});

it("does not claim an empty inventory when ancestry cannot be resolved or the coordinator binding conflicts", async () => {
  const env = await setup();
  env.worker("orphan", { parentThreadId: "missing-parent" }, false);
  expect(await env.inventory()).toMatchObject({
    state: "partial",
    items: [],
    issue: expect.any(String),
  });
  const other = await env.host.create("Other");
  env.host.store.save({ ...other, coordinatorThreadId: env.coordinatorId });
  expect(await env.inventory()).toMatchObject({ state: "unavailable", issue: expect.any(String) });
});

it("bounds unknown ancestor reads without capturing or modifying unresolved work", async () => {
  const env = await setup();
  env.worker("orphan", { parentThreadId: "parent-0" }, false);
  let lookups = 0;
  env.host.harness.inspection.sdk.stub("threads.get", async () => {
    const id = `parent-${lookups++}`;
    return makeThreadResponse({ id, parentThreadId: `parent-${lookups}` });
  });
  const bindings = env.host.store.bindings();
  expect(await env.inventory()).toMatchObject({
    state: "partial",
    items: [],
    issue: expect.any(String),
  });
  expect(lookups).toBe(64);
  expect(env.host.store.bindings()).toEqual(bindings);
  expect(env.host.harness.inspection.sdk.callsTo("threads.send")).toEqual([]);
});
