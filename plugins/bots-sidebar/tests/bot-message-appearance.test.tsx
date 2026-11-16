// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { act, cleanup } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { rpcContract, type ThreadAppearance } from "../contract";
const app = await loadPluginApp(() => import("../app"));
const appearance = app.threadMessageAppearances[0]!;
function Consumer({ threadId }: { threadId: string }) {
  const value = appearance.useAppearance({ threadId });
  return <output>{value?.humanMessageBackgroundColor ?? "native"}</output>;
}
const assigned = (color = "#123456", available = true): ThreadAppearance => ({ state: "assigned", botId: "bot", color, revision: 1, available });
afterEach(cleanup);

it("clears color while loading and refreshes saved avatar changes through realtime without writes", async () => {
  let value = assigned();
  const slot = renderSlot({ component: Consumer }, { threadId: "manual" }, { rpc: { thread_appearance: () => value } });
  expect(slot.getByText("native")).toBeTruthy();
  await act(async () => {});
  expect(slot.getByText("#123456")).toBeTruthy();
  value = assigned("#ABCDEF");
  await slot.behavior.emitRealtime("project-bots-changed", {});
  expect(slot.getByText("#ABCDEF")).toBeTruthy();
  expect(slot.inspection.rpcCalls.every(call => call.method === "thread_appearance")).toBe(true);
  slot.lifecycle.unmount();
  await slot.behavior.emitRealtime("project-bots-changed", {});
  expect(slot.inspection.rpcCalls).toHaveLength(2);
});

it.each([assigned("#123456", false), { state: "unassigned", available: true }, { ...assigned(), color: "red" }, null])("keeps native appearance for unavailable, unassigned, malformed or failed responses (%j)", async (value) => {
  const slot = renderSlot({ component: Consumer }, { threadId: "manual" }, { rpc: { thread_appearance: () => { if (value === null) throw new Error("Offline"); return value; } } });
  await act(async () => {});
  expect(slot.getByText("native")).toBeTruthy();
});

it("isolates navigation and ignores a late response for the previous bot", async () => {
  let resolve!: (value: ThreadAppearance) => void;
  const slot = renderSlot({ component: Consumer }, { threadId: "old" }, { rpc: { thread_appearance: input => rpcContract.thread_appearance.input.parse(input).threadId === "old" ? new Promise<ThreadAppearance>(done => { resolve = done; }) : assigned("#ABCDEF") } });
  slot.lifecycle.rerender(<Consumer threadId="new" />);
  expect(slot.getByText("native")).toBeTruthy();
  await act(async () => {});
  expect(slot.getByText("#ABCDEF")).toBeTruthy();
  await act(async () => resolve(assigned()));
  expect(slot.getByText("#ABCDEF")).toBeTruthy();
});
