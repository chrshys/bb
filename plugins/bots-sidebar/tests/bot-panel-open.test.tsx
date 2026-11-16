// @vitest-environment jsdom
import { createElement, Fragment, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { conversationPanelPath } from "../components/conversation-panel";
import { botPanelAction, panelBackend, pluginApp, resetPanelState, writes } from "./bot-panel-fixture";
import { personalEnvironment, personalProjectId, thread } from "./fixtures";

afterEach(() => { cleanup(); resetPanelState(); vi.restoreAllMocks(); });

const header = (threadId: string) => createElement(pluginApp.threadHeaderActions[0]!.component, { key: `header-${threadId}`, threadId, projectId: "project", isCompactViewport: false });
const coordinatorPage = (botId: string) => createElement(pluginApp.navPanels.find((panel) => panel.id === "coordinator")!.component, { key: "page", subPath: botId });
const panelOpen = { method: "openThreadPanel", options: { actionId: "bot", title: "Test bot", params: { botId: "bot" } } };

async function mount({ activeThreadId, coordinatorThreadId = null, accept = true }: { activeThreadId: string | null; coordinatorThreadId?: string | null; accept?: boolean }) {
  const backend = panelBackend([{ coordinatorThreadId }]);
  backend.world.threadBots.set("main", "bot");
  if (coordinatorThreadId) backend.world.threadBots.set(coordinatorThreadId, "bot");
  const onNavigate = vi.fn();
  const sidebarProps = { activeThreadId, activeProjectId: "project", isCompactViewport: false, onNavigate, searchQuery: "" };
  const slot = renderSlot(pluginApp.threadLists[0]!, sidebarProps, {
    sidebarThreads: { projects: [], threads: [thread("main", 100), thread("elsewhere", 90), ...(coordinatorThreadId ? [thread(coordinatorThreadId, 80)] : [])] },
    rpc: { ...backend.rpc, bot_prepare: () => backend.bot() },
    openThreadPanel: () => accept,
    experimental_openFixedTab: () => accept,
  });
  const sidebar = createElement(pluginApp.threadLists[0]!.component, { key: "sidebar", ...sidebarProps });
  const show = (...extra: ReactNode[]) => slot.lifecycle.rerender(createElement(Fragment, null, sidebar, ...extra));
  await slot.findByText("Test bot");
  async function choose(item: string) {
    fireEvent.contextMenu(await slot.findByText("Test bot"));
    fireEvent.click(await slot.findByRole("menuitem", { name: item }));
  }
  const panelOpens = () => slot.inspection.navigateCalls.filter((call) => call.method === "openThreadPanel");
  return { slot, backend, onNavigate, show, choose, panelOpens };
}

it("opens the bot panel beside the conversation when Edit bot is chosen inside one of the bot's conversations", async () => {
  const { slot, onNavigate, show, choose, panelOpens } = await mount({ activeThreadId: "main" });
  show(header("main"));
  await choose("Edit bot…");
  expect(panelOpens()).toEqual([panelOpen]);
  expect(slot.inspection.navigateCalls).toHaveLength(1);
  expect(slot.inspection.sidebarActionCalls).toEqual([]);
  expect(slot.queryByRole("dialog")).toBeNull();
  expect(onNavigate).toHaveBeenCalledOnce();
  expect(writes(slot)).toEqual([]);
});

it("goes to the bot's coordinator and opens the panel there instead of beside an unrelated conversation", async () => {
  const { slot, show, choose, panelOpens } = await mount({ activeThreadId: "elsewhere", coordinatorThreadId: "coordinator" });
  show(header("elsewhere"));
  await choose("Edit bot…");
  expect(slot.inspection.sidebarActionCalls).toEqual([{ method: "open", threadId: "coordinator" }]);
  expect(panelOpens()).toEqual([]);
  show(header("coordinator"));
  await waitFor(() => expect(panelOpens()).toEqual([panelOpen]));
  show(header("elsewhere"));
  show(header("coordinator"));
  expect(panelOpens()).toHaveLength(1);
});

it("opens the fixed bot tab on the coordinator page when the bot has no conversation yet", async () => {
  const { slot, show, choose, panelOpens } = await mount({ activeThreadId: null });
  await choose("Edit bot…");
  expect(slot.inspection.navigateCalls).toEqual([{ method: "toPluginPanel", path: "coordinator", options: { subPath: "bot" } }]);
  expect(slot.inspection.experimental_fixedTabOpenCalls).toEqual([]);
  show(coordinatorPage("bot"));
  await waitFor(() => expect(slot.inspection.experimental_fixedTabOpenCalls).toEqual([{ surface: { kind: "current" }, panelId: "coordinator", tabId: "bot" }]));
  await choose("Edit bot…");
  expect(slot.inspection.experimental_fixedTabOpenCalls).toHaveLength(2);
  expect(slot.inspection.navigateCalls).toHaveLength(1);
  expect(panelOpens()).toEqual([]);
});

it("says so when the host declines to open the panel beside the conversation", async () => {
  const { slot, show, choose } = await mount({ activeThreadId: "main", accept: false });
  show(header("main"));
  await choose("Edit bot…");
  expect((await slot.findByRole("alert")).textContent).toBe("The bot panel could not be opened here.");
  expect(slot.inspection.sidebarActionCalls).toEqual([]);
});

it("returns to the conversation and opens the panel there when its view is not on screen", async () => {
  const { slot, show, choose, panelOpens } = await mount({ activeThreadId: "main" });
  await choose("Edit bot…");
  expect(slot.inspection.sidebarActionCalls).toEqual([{ method: "open", threadId: "main" }]);
  expect(slot.queryByRole("alert")).toBeNull();
  show(header("main"));
  await waitFor(() => expect(panelOpens()).toEqual([panelOpen]));
});

it("forgets a queued open that no conversation picked up in time", async () => {
  const { show, choose, panelOpens } = await mount({ activeThreadId: null, coordinatorThreadId: "coordinator" });
  const now = Date.now();
  await choose("Edit bot…");
  vi.spyOn(Date, "now").mockReturnValue(now + 31_000);
  show(header("coordinator"));
  await Promise.resolve();
  expect(panelOpens()).toEqual([]);
});

it("brings Projects into view for Add / manage projects…", async () => {
  const scrolled: Array<string | null> = [];
  HTMLElement.prototype.scrollIntoView = function scrollIntoView(this: HTMLElement) { scrolled.push(this.getAttribute("data-bot-panel-section")); };
  const { slot, show, choose, panelOpens } = await mount({ activeThreadId: "main" });
  show(header("main"));
  await choose("Add / manage projects…");
  expect(panelOpens()).toEqual([panelOpen]);
  show(header("main"), createElement(botPanelAction.component, { key: "panel", threadId: "main", params: { botId: "bot" } }));
  await slot.findByRole("region", { name: "Test bot bot settings" });
  await waitFor(() => expect(scrolled).toContain("projects"));
});

it("offers the bot's settings from the header of its own conversations only", async () => {
  const { slot, show, panelOpens } = await mount({ activeThreadId: "main" });
  show(header("elsewhere"));
  await waitFor(() => expect(slot.inspection.rpcCalls).toContainEqual({ method: "thread_bot", input: { threadId: "elsewhere" } }));
  expect(slot.queryByRole("button", { name: /bot settings$/ })).toBeNull();
  show(header("main"));
  fireEvent.click(await slot.findByRole("button", { name: "Open Test bot bot settings" }));
  expect(panelOpens()).toEqual([panelOpen]);
});

it("pins the same panel as a fixed tab on both new-conversation pages", async () => {
  const backend = panelBackend([{ name: "Atlas" }]);
  const tabs = ["conversation", "coordinator"].map((id) => pluginApp.navPanels.find((panel) => panel.id === id)!.fixedTabs!);
  expect(tabs.map((entries) => entries.map(({ panelId, id, title, layout }) => ({ panelId, id, title, layout })))).toEqual([
    [{ panelId: "conversation", id: "bot", title: "Bot", layout: "flush" }],
    [{ panelId: "coordinator", id: "bot", title: "Bot", layout: "flush" }],
  ]);
  const coordinator = renderSlot(tabs[1]![0]!, { subPath: "bot" }, { rpc: backend.rpc });
  await coordinator.findByRole("region", { name: "Atlas bot settings" });
  coordinator.unmount();
  const subPath = conversationPanelPath({ bot: backend.bot(), kind: "bot", projectId: personalProjectId, environment: personalEnvironment, makeMain: false });
  const conversation = renderSlot(tabs[0]![0]!, { subPath }, { rpc: backend.rpc });
  await conversation.findByRole("region", { name: "Atlas bot settings" });
  conversation.unmount();
  const invalid = renderSlot(tabs[0]![0]!, { subPath: "not-a-launch" }, { rpc: backend.rpc });
  expect(invalid.getByRole("status").textContent).toBe("Open a bot to see its settings here.");
});
