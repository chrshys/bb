// @vitest-environment jsdom
import { createElement, Fragment, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { conversationPanelPath } from "../components/conversation-panel";
import { botsPinnedTab, panelBackend, pluginApp, resetPanelState, writes } from "./bot-panel-fixture";
import { personalEnvironment, personalProjectId, thread } from "./fixtures";

afterEach(() => { cleanup(); resetPanelState(); vi.restoreAllMocks(); });

const page = (id: "conversation" | "coordinator", subPath: string) => createElement(pluginApp.navPanels.find((panel) => panel.id === id)!.component, { key: "page", subPath });
const noSection = { botId: "bot", section: null };

async function mount({ activeThreadId, coordinatorThreadId = null, accept = true }: { activeThreadId: string | null; coordinatorThreadId?: string | null; accept?: boolean }) {
  const backend = panelBackend([{ coordinatorThreadId }]);
  backend.world.threadBots.set("main", "bot");
  if (coordinatorThreadId) backend.world.threadBots.set(coordinatorThreadId, "bot");
  const onNavigate = vi.fn();
  const sidebarProps = { activeThreadId, activeProjectId: "project", isCompactViewport: false, onNavigate, searchQuery: "" };
  const slot = renderSlot(pluginApp.threadLists[0]!, sidebarProps, {
    sidebarThreads: { projects: [], threads: [thread("main", 100), thread("elsewhere", 90), ...(coordinatorThreadId ? [thread(coordinatorThreadId, 80)] : [])] },
    rpc: { ...backend.rpc, bot_prepare: () => backend.bot() },
    experimental_openThreadPinnedTab: () => accept,
    experimental_openFixedTab: () => accept,
  });
  const sidebar = createElement(pluginApp.threadLists[0]!.component, { key: "sidebar", ...sidebarProps });
  const show = (...extra: ReactNode[]) => slot.lifecycle.rerender(createElement(Fragment, null, sidebar, ...extra));
  await slot.findByText("Test bot");
  async function choose(item: string) {
    fireEvent.contextMenu(await slot.findByText("Test bot"));
    fireEvent.click(await slot.findByRole("menuitem", { name: item }));
  }
  return { slot, backend, onNavigate, show, choose };
}

it("registers one pinned Bots tab and no closable bot tab or header button", () => {
  expect(pluginApp.threadPinnedTabs.map(({ id, title, icon, layout }) => ({ id, title, icon, layout }))).toEqual([{ id: "bots", title: "Bots", icon: "Bot", layout: "flush" }]);
  expect(pluginApp.threadPanelActions).toEqual([]);
  expect(pluginApp.threadHeaderActions).toEqual([]);
});

it("opens the pinned Bots tab beside the conversation when Edit bot is chosen inside one of the bot's conversations", async () => {
  const { slot, onNavigate, choose } = await mount({ activeThreadId: "main" });
  await choose("Edit bot…");
  expect(slot.inspection.experimental_threadPinnedTabOpenCalls).toEqual([{ threadId: "main", tabId: "bots", target: noSection }]);
  expect(slot.inspection.navigateCalls).toEqual([]);
  expect(slot.inspection.sidebarActionCalls).toEqual([]);
  expect(slot.inspection.experimental_fixedTabOpenCalls).toEqual([]);
  expect(slot.queryByRole("dialog")).toBeNull();
  expect(onNavigate).toHaveBeenCalledOnce();
  expect(writes(slot)).toEqual([]);
});

it("asks the host for the bot's coordinator instead of opening beside an unrelated conversation", async () => {
  const { slot, choose } = await mount({ activeThreadId: "elsewhere", coordinatorThreadId: "coordinator" });
  await choose("Edit bot…");
  expect(slot.inspection.experimental_threadPinnedTabOpenCalls).toEqual([{ threadId: "coordinator", tabId: "bots", target: noSection }]);
  expect(slot.inspection.sidebarActionCalls).toEqual([]);
});

it("opens the fixed bot tab on the coordinator page when the bot has no conversation yet", async () => {
  const { slot, choose } = await mount({ activeThreadId: null });
  await choose("Edit bot…");
  expect(slot.inspection.experimental_fixedTabOpenCalls).toEqual([{ surface: { kind: "navPanel", panelId: "coordinator", subPath: "bot" }, panelId: "coordinator", tabId: "bot", target: noSection }]);
  expect(slot.inspection.experimental_threadPinnedTabOpenCalls).toEqual([]);
});

it("opens the fixed bot tab in place when one of the bot's new-conversation pages is showing", async () => {
  const { slot, backend, show, choose } = await mount({ activeThreadId: "elsewhere", coordinatorThreadId: "coordinator" });
  const subPath = conversationPanelPath({ bot: backend.bot(), kind: "bot", projectId: personalProjectId, environment: personalEnvironment, makeMain: false });
  show(page("conversation", subPath));
  await choose("Edit bot…");
  expect(slot.inspection.experimental_fixedTabOpenCalls).toEqual([{ surface: { kind: "navPanel", panelId: "conversation", subPath }, panelId: "conversation", tabId: "bot", target: noSection }]);
  expect(slot.inspection.experimental_threadPinnedTabOpenCalls).toEqual([]);
  show();
  await choose("Edit bot…");
  expect(slot.inspection.experimental_threadPinnedTabOpenCalls).toEqual([{ threadId: "coordinator", tabId: "bots", target: noSection }]);
});

it("says so when the host declines to open the panel", async () => {
  const { slot, onNavigate, choose } = await mount({ activeThreadId: "main", accept: false });
  await choose("Edit bot…");
  expect((await slot.findByRole("alert")).textContent).toBe("The bot panel could not be opened here.");
  expect(onNavigate).not.toHaveBeenCalled();
});

it("asks for the Projects section from Add / manage projects…", async () => {
  const { slot, choose } = await mount({ activeThreadId: "main" });
  await choose("Add / manage projects…");
  expect(slot.inspection.experimental_threadPinnedTabOpenCalls).toEqual([{ threadId: "main", tabId: "bots", target: { botId: "bot", section: "projects" } }]);
});

it("brings a requested section into view once and then forgets the request", async () => {
  const scrolled: Array<string | null> = [];
  HTMLElement.prototype.scrollIntoView = function scrollIntoView(this: HTMLElement) { scrolled.push(this.getAttribute("data-bot-panel-section")); };
  const backend = panelBackend([{ name: "Atlas" }]);
  backend.world.threadBots.set("main", "bot");
  const slot = renderSlot(botsPinnedTab, { threadId: "main", projectId: "project" }, { rpc: backend.rpc, experimental_threadPinnedTabTarget: { tabId: "bots", target: { botId: "bot", section: "projects" } } });
  await slot.findByRole("region", { name: "Atlas bot settings" });
  await waitFor(() => expect(scrolled).toEqual(["projects"]));
  slot.lifecycle.rerender(createElement(botsPinnedTab.component, { threadId: "main", projectId: "project" }));
  await slot.findByRole("region", { name: "Atlas bot settings" });
  expect(scrolled).toEqual(["projects"]);
});

it("shows the conversation's own bot even when a request named another bot", async () => {
  const backend = panelBackend([{ name: "Atlas" }, { name: "Borealis" }]);
  backend.world.threadBots.set("main", "bot");
  const scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  const slot = renderSlot(botsPinnedTab, { threadId: "main", projectId: "project" }, { rpc: backend.rpc, experimental_threadPinnedTabTarget: { tabId: "bots", target: { botId: "bot-2", section: "memory" } } });
  await slot.findByRole("region", { name: "Atlas bot settings" });
  expect(slot.queryByRole("region", { name: "Borealis bot settings" })).toBeNull();
  expect(scrollIntoView).not.toHaveBeenCalled();
});

it("rejects a target that is not a bot and section", () => {
  const { validate } = botsPinnedTab.experimental_target!;
  expect(validate({ botId: "bot", section: "projects" })).toBe(true);
  expect(validate({ botId: "bot", section: null })).toBe(true);
  expect(validate({ botId: "bot", section: "nope" })).toBe(false);
  expect(validate({ botId: "", section: null })).toBe(false);
  expect(validate({ botId: "bot", section: null, extra: 1 })).toBe(false);
  expect(validate("bot")).toBe(false);
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
