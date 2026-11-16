// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type {
  ExperimentalThreadTimelineFooterProps,
  ExperimentalThreadTimelineFooterThreadBadgeProps,
} from "@get-bb/plugin-sdk/app";
import { rpcContract, type ActiveInventory } from "../contract";

const app = await loadPluginApp(() => import("../app"));
const footer = app.threadTimelineFooters[0]!;
const nativeBadge = vi.fn((props: ExperimentalThreadTimelineFooterThreadBadgeProps) => (
  <span data-native-thread={props.threadId}>{props.title}</span>
));
const props: ExperimentalThreadTimelineFooterProps = {
  threadId: "coordinator",
  projectId: "project",
  runtimeDisplayStatus: "idle",
  Original: () => <p>Native child summary</p>,
  ThreadBadge: nativeBadge,
};
const ready = (id: string): ActiveInventory => ({
  state: "ready",
  botId: "bot",
  coordinatorThreadId: "coordinator",
  observedAt: 1,
  issue: null,
  items: [{ threadId: id, projectId: "other-project", title: `Work ${id}`, status: "active" }],
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  nativeBadge.mockClear();
});

it("shows one live inventory using host badges and never falls back while ownership is loading", async () => {
  let resolve!: (value: ActiveInventory) => void;
  const slot = renderSlot(footer, props, {
    rpc: {
      monitoring_inventory: () =>
        new Promise<ActiveInventory>((done) => {
          resolve = done;
        }),
    },
  });
  expect(slot.getByText("Checking active work…")).toBeTruthy();
  expect(slot.queryByText("Native child summary")).toBeNull();
  await act(async () => resolve(ready("manual-root")));
  expect(slot.getByText("Work manual-root")).toBeTruthy();
  expect(nativeBadge.mock.calls[0]?.[0]).toEqual({
    threadId: "manual-root",
    projectId: "other-project",
    title: "Work manual-root",
  });
  expect(slot.getAllByRole("region", { name: "Bot active work" })).toHaveLength(1);
  expect(slot.queryByText("Native child summary")).toBeNull();
  expect(slot.inspection.rpcCalls).toEqual([
    { method: "monitoring_inventory", input: { threadId: "coordinator" } },
  ]);
});

it("refreshes in place each idle minute, responds to lifecycle events and stops after unmount", async () => {
  vi.useFakeTimers();
  let current = ready("one");
  const slot = renderSlot(footer, props, { rpc: { monitoring_inventory: () => current } });
  await act(async () => {});
  current = ready("two");
  await act(async () => vi.advanceTimersByTimeAsync(59_999));
  expect(slot.inspection.rpcCalls).toHaveLength(1);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(slot.queryByText("Work one")).toBeNull();
  expect(slot.getByText("Work two")).toBeTruthy();
  expect(slot.getAllByRole("region", { name: "Bot active work" })).toHaveLength(1);
  current = ready("three");
  await slot.behavior.emitRealtime("bot-work-changed", { threadId: "three" });
  expect(slot.getByText("Work three")).toBeTruthy();
  const calls = slot.inspection.rpcCalls.length;
  slot.lifecycle.unmount();
  await act(async () => vi.advanceTimersByTimeAsync(120_000));
  expect(slot.inspection.rpcCalls).toHaveLength(calls);
  expect(slot.inspection.rpcCalls.every((call) => call.method === "monitoring_inventory")).toBe(
    true,
  );
  expect(slot.inspection.sdkCalls).toEqual([]);
});

it.each(["partial", "unavailable", "rejected"] as const)(
  "keeps %s inventory explicit instead of claiming no work or child-only scope",
  async (state) => {
    const slot = renderSlot(footer, props, {
      rpc: {
        monitoring_inventory: () => {
          if (state === "rejected") throw new Error("Offline");
          return { ...ready("one"), state, items: [], issue: "Discovery incomplete" };
        },
      },
    });
    await act(async () => {});
    expect(slot.queryByText("No active bot work")).toBeNull();
    expect(slot.queryByText("Native child summary")).toBeNull();
    expect(slot.getByRole("status").textContent).toMatch(/incomplete|could not be refreshed/);
  },
);

it("uses native children only for a confirmed non-coordinator and does not poll while active", async () => {
  vi.useFakeTimers();
  const slot = renderSlot(
    footer,
    { ...props, runtimeDisplayStatus: "active" as const },
    {
      rpc: {
        monitoring_inventory: () => ({
          ...ready("one"),
          state: "not-coordinator",
          botId: null,
          coordinatorThreadId: null,
          items: [],
        }),
      },
    },
  );
  await act(async () => {});
  expect(slot.getByText("Native child summary")).toBeTruthy();
  expect(slot.queryByRole("region", { name: "Bot active work" })).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(120_000));
  expect(slot.inspection.rpcCalls).toHaveLength(1);
});

it("ignores a stale response after changing conversations", async () => {
  let resolve!: (value: ActiveInventory) => void;
  const slot = renderSlot(footer, props, {
    rpc: {
      monitoring_inventory: (input) => {
        const request = rpcContract.monitoring_inventory.input.parse(input);
        return "threadId" in request && request.threadId === "coordinator"
          ? new Promise<ActiveInventory>((done) => {
              resolve = done;
            })
          : ready("new-worker");
      },
    },
  });
  const Component = footer.component;
  slot.lifecycle.rerender(<Component {...props} threadId="new-coordinator" />);
  await act(async () => {});
  await act(async () => resolve(ready("old-worker")));
  expect(slot.getByText("Work new-worker")).toBeTruthy();
  expect(slot.queryByText("Work old-worker")).toBeNull();
});
