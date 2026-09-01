import { describe, expect, it, vi } from "vitest";
import type {
  BrowserControlRequestMessage,
  BrowserOpenTabRequestMessage,
  BrowserTabTarget,
} from "@bb/domain";
import { NotificationHub } from "../../src/ws/hub.js";
import { createMockHubSocket } from "../helpers/mock-hub-socket.js";

const target: BrowserTabTarget = {
  clientId: "client-a",
  windowId: "window-a",
  tabId: "tab-a",
  navigationEpoch: 3,
};

function registerTab(hub: NotificationHub) {
  const socket = createMockHubSocket();
  hub.updateBrowserClient(socket, {
    type: "browser-client-state",
    clientId: target.clientId,
    windowId: target.windowId,
    owners: [
      {
        ownerId: "owner-a",
        threadId: "thread-a",
        projectId: "project-a",
        active: true,
      },
    ],
    tabs: [
      {
        tabId: target.tabId,
        threadId: "thread-a",
        projectId: "project-a",
        url: "https://example.test/",
        title: "Example",
        connected: true,
        active: true,
        navigationEpoch: target.navigationEpoch,
      },
    ],
  });
  return socket;
}

function latestRequest(
  socket: ReturnType<typeof createMockHubSocket>,
): BrowserControlRequestMessage {
  return JSON.parse(
    socket.messages.at(-1) ?? "null",
  ) as BrowserControlRequestMessage;
}

describe("NotificationHub Browser control broker", () => {
  it("lists registered tabs deterministically and resolves an exact response", async () => {
    const hub = new NotificationHub();
    const socket = registerTab(hub);

    expect(hub.listBrowserTabs()).toEqual([
      expect.objectContaining({ ...target, title: "Example" }),
    ]);

    const result = hub.runBrowserControl({
      target,
      action: { kind: "snapshot", mode: "interactive" },
      timeoutMs: 1_000,
    });
    const request = latestRequest(socket);
    expect(request).toMatchObject({
      type: "browser-control-request",
      target,
      action: { kind: "snapshot", mode: "interactive" },
    });
    expect(
      hub.recordBrowserControlResponse(socket, {
        type: "browser-control-response",
        requestId: request.requestId,
        target,
        ok: true,
        value: { nodes: 4 },
      }),
    ).toBe(true);
    await expect(result).resolves.toEqual({ nodes: 4 });
  });

  it("keeps lifecycle actions alive while the source tab is replaced", async () => {
    const hub = new NotificationHub();
    const socket = registerTab(hub);
    const result = hub.runBrowserControl({
      target,
      action: { kind: "activate-tab", tabId: "tab-previous" },
      timeoutMs: 1_000,
    });
    const request = latestRequest(socket);
    const activatedTarget = {
      ...target,
      tabId: "tab-previous",
      navigationEpoch: 9,
    };
    hub.updateBrowserClient(socket, {
      type: "browser-client-state",
      clientId: target.clientId,
      windowId: target.windowId,
      owners: [
        {
          ownerId: "owner-a",
          threadId: "thread-a",
          projectId: "project-a",
          active: true,
        },
      ],
      tabs: [
        {
          tabId: activatedTarget.tabId,
          threadId: "thread-a",
          projectId: "project-a",
          url: "file:///Users/test/page.html",
          title: "Previous",
          connected: true,
          active: true,
          navigationEpoch: activatedTarget.navigationEpoch,
        },
      ],
    });

    expect(
      hub.recordBrowserControlResponse(socket, {
        type: "browser-control-response",
        requestId: request.requestId,
        target,
        ok: true,
        value: activatedTarget,
      }),
    ).toBe(true);
    await expect(result).resolves.toEqual(activatedTarget);
  });

  it("creates the first and subsequent tabs through a tabless panel owner", async () => {
    const hub = new NotificationHub();
    const socket = createMockHubSocket();
    hub.updateBrowserClient(socket, {
      type: "browser-client-state",
      clientId: target.clientId,
      windowId: target.windowId,
      tabs: [],
      owners: [
        {
          ownerId: "owner-a",
          threadId: "thread-a",
          projectId: "project-a",
          active: true,
        },
      ],
    });

    const open = (tabId: string) => {
      const result = hub.openBrowserTab({
        url: `file:///Users/test/${tabId}.html`,
        threadId: "thread-a",
        timeoutMs: 1_000,
      });
      const request = JSON.parse(
        socket.messages.at(-1) ?? "null",
      ) as BrowserOpenTabRequestMessage;
      const openedTarget = {
        clientId: target.clientId,
        windowId: target.windowId,
        tabId,
        navigationEpoch: 0,
      };
      expect(request).toMatchObject({
        type: "browser-open-tab-request",
        ownerId: "owner-a",
        url: `file:///Users/test/${tabId}.html`,
      });
      hub.recordBrowserOpenTabResponse(socket, {
        type: "browser-open-tab-response",
        requestId: request.requestId,
        clientId: target.clientId,
        windowId: target.windowId,
        ownerId: "owner-a",
        ok: true,
        target: openedTarget,
      });
      return { result, openedTarget };
    };

    expect(hub.listBrowserTabs()).toEqual([]);
    expect(hub.listBrowserTabOwners()).toEqual([
      expect.objectContaining({ ownerId: "owner-a", threadId: "thread-a" }),
    ]);
    const first = open("tab-first");
    await expect(first.result).resolves.toEqual(first.openedTarget);
    const second = open("tab-second");
    await expect(second.result).resolves.toEqual(second.openedTarget);
  });

  it("keeps concurrent requests independent", async () => {
    const hub = new NotificationHub();
    const socket = registerTab(hub);
    const first = hub.runBrowserControl({
      target,
      action: { kind: "scroll", deltaY: 100 },
      timeoutMs: 1_000,
    });
    const firstRequest = latestRequest(socket);
    const second = hub.runBrowserControl({
      target,
      action: { kind: "key", key: "Enter" },
      timeoutMs: 1_000,
    });
    const secondRequest = latestRequest(socket);

    hub.recordBrowserControlResponse(socket, {
      type: "browser-control-response",
      requestId: secondRequest.requestId,
      target,
      ok: true,
      value: { pressed: "Enter" },
    });
    hub.recordBrowserControlResponse(socket, {
      type: "browser-control-response",
      requestId: firstRequest.requestId,
      target,
      ok: true,
      value: { y: 100 },
    });

    await expect(first).resolves.toEqual({ y: 100 });
    await expect(second).resolves.toEqual({ pressed: "Enter" });
  });

  it("invalidates pending work on navigation and client disconnect", async () => {
    const hub = new NotificationHub();
    const socket = registerTab(hub);
    const navigating = hub.runBrowserControl({
      target,
      action: { kind: "snapshot", mode: "dom" },
      timeoutMs: 1_000,
    });
    hub.updateBrowserClient(socket, {
      type: "browser-client-state",
      clientId: target.clientId,
      windowId: target.windowId,
      owners: [
        {
          ownerId: "owner-a",
          threadId: "thread-a",
          projectId: "project-a",
          active: true,
        },
      ],
      tabs: [
        {
          tabId: target.tabId,
          threadId: "thread-a",
          projectId: "project-a",
          url: "https://example.test/next",
          title: "Next",
          connected: true,
          active: true,
          navigationEpoch: target.navigationEpoch + 1,
        },
      ],
    });
    await expect(navigating).rejects.toMatchObject({
      name: "BrowserControlTargetChangedError",
    });

    const nextTarget = {
      ...target,
      navigationEpoch: target.navigationEpoch + 1,
    };
    const disconnecting = hub.runBrowserControl({
      target: nextTarget,
      action: { kind: "snapshot", mode: "dom" },
      timeoutMs: 1_000,
    });
    hub.unregisterClient(socket);
    await expect(disconnecting).rejects.toThrow("disconnected");
  });

  it("forwards abort and timeout cancellation to the owning client", async () => {
    vi.useFakeTimers();
    try {
      const hub = new NotificationHub();
      const socket = registerTab(hub);
      const controller = new AbortController();
      const aborted = hub.runBrowserControl({
        target,
        action: { kind: "snapshot", mode: "dom" },
        timeoutMs: 1_000,
        signal: controller.signal,
      });
      controller.abort();
      await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
      expect(JSON.parse(socket.messages.at(-1) ?? "null")).toMatchObject({
        type: "browser-control-cancel",
        reason: "cancelled",
      });

      const timedOut = hub.runBrowserControl({
        target,
        action: { kind: "snapshot", mode: "dom" },
        timeoutMs: 100,
      });
      const rejection = expect(timedOut).rejects.toThrow(
        "Timed out waiting for Browser action",
      );
      await vi.advanceTimersByTimeAsync(100);
      await rejection;
      expect(JSON.parse(socket.messages.at(-1) ?? "null")).toMatchObject({
        type: "browser-control-cancel",
        reason: "timeout",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects stale targets before sending a request", async () => {
    const hub = new NotificationHub();
    const socket = registerTab(hub);
    await expect(
      hub.runBrowserControl({
        target: { ...target, navigationEpoch: 2 },
        action: { kind: "snapshot", mode: "dom" },
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({ name: "BrowserControlUnavailableError" });
    expect(socket.messages).toHaveLength(0);
  });
});
