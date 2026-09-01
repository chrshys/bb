import { describe, expect, it } from "vitest";
import { z } from "zod";
import type {
  BrowserControlAction,
  BrowserTabDescriptor,
  BrowserTabOwnerDescriptor,
  BrowserTabTarget,
} from "@bb/server-contract";
import type { PluginAgentToolContext } from "@get-bb/plugin-sdk";
import {
  browserOperationSchema,
  executeBrowserOperation,
} from "./contracts.js";

const target: BrowserTabTarget = {
  clientId: "client-a",
  windowId: "window-a",
  tabId: "tab-a",
  navigationEpoch: 4,
};

const tab: BrowserTabDescriptor = {
  ...target,
  threadId: "thread-a",
  projectId: "project-a",
  url: "https://example.com",
  title: "Example",
  connected: true,
  active: true,
};

const owner: BrowserTabOwnerDescriptor = {
  active: true,
  clientId: target.clientId,
  windowId: target.windowId,
  ownerId: "owner-a",
  threadId: tab.threadId,
  projectId: tab.projectId,
};

const agentContext: PluginAgentToolContext = {
  threadId: "thread-a",
  projectId: "project-a",
  signal: new AbortController().signal,
};

describe("Browser operation contract", () => {
  it("keeps the agent tool schema nonrecursive", () => {
    expect(
      JSON.stringify(z.toJSONSchema(browserOperationSchema)),
    ).not.toContain('"$ref"');
  });

  it("routes agent operations through the native browser service", async () => {
    const calls: Array<{
      target: BrowserTabTarget;
      action: BrowserControlAction;
      timeoutMs: number | undefined;
    }> = [];
    const openCalls: string[] = [];
    const browser = {
      experimental_browser: {
        listTabs(
          _context: PluginAgentToolContext,
          _filter?: { threadId?: string; projectId?: string; active?: boolean },
        ) {
          return [tab];
        },
        listOwners() {
          return [owner];
        },
        async openTab(
          _context: PluginAgentToolContext,
          url: string,
        ): Promise<BrowserTabTarget> {
          openCalls.push(url);
          return target;
        },
        async run(
          nextTarget: BrowserTabTarget,
          action: BrowserControlAction,
          options: {
            context: PluginAgentToolContext;
            timeoutMs?: number;
          },
        ) {
          calls.push({
            target: nextTarget,
            action,
            timeoutMs: options.timeoutMs,
          });
          return { captured: true };
        },
      },
    };
    const operation = browserOperationSchema.parse({
      operation: "run",
      target,
      action: { kind: "snapshot", mode: "interactive" },
    });

    await executeBrowserOperation({
      browser,
      context: agentContext,
      operation,
    });
    await executeBrowserOperation({
      browser,
      context: agentContext,
      operation: browserOperationSchema.parse({
        operation: "open",
        url: "file:///Users/test/page.html",
      }),
    });

    expect(calls).toEqual([
      {
        target,
        action: { kind: "snapshot", mode: "interactive" },
        timeoutMs: undefined,
      },
    ]);
    expect(openCalls).toEqual(["file:///Users/test/page.html"]);
  });

  it("rejects ambiguous agent targets before service dispatch", () => {
    expect(
      browserOperationSchema.safeParse({
        operation: "run",
        target: {
          clientId: target.clientId,
          windowId: target.windowId,
          tabId: target.tabId,
        },
        action: { kind: "snapshot", mode: "interactive" },
      }).success,
    ).toBe(false);
  });
});
