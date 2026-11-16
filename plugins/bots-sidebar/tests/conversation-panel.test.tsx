// @vitest-environment jsdom
import { createElement } from "react";
import type { NewThreadComposerProps } from "@get-bb/plugin-sdk/app";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { ConversationPanel, conversationPanelPath } from "../components/conversation-panel";
import { openConversationPanel } from "./open-conversation-panel";
import { bot, personalProjectId, request, thread } from "./fixtures";

const composer = vi.hoisted(() => ({ props: null as NewThreadComposerProps | null }));
vi.mock("@get-bb/plugin-sdk/app", async importOriginal => {
  const sdk = await importOriginal<typeof import("@get-bb/plugin-sdk/app")>();
  return { ...sdk, experimental_NewThreadComposer: (props: NewThreadComposerProps) => {
    composer.props = props;
    return createElement(sdk.experimental_NewThreadComposer, props);
  } };
});
const app = await loadPluginApp(() => import("../app"));
afterEach(() => { cleanup(); composer.props = null; });

it("opens ordinary bot conversation creation in the main panel without a modal or a thread", async () => {
  const slot = renderSlot(app.threadLists[0]!, { activeThreadId: null, activeProjectId: null, isCompactViewport: false, onNavigate: () => {}, searchQuery: "" }, {
    sidebarThreads: { projects: [], threads: [] },
    rpc: {
      bots_list: () => ({ bots: [bot], hosts: [], sections: [], projects: [], threadBindings: [], warnings: [], personalProjectId, projectOwners: [] }),
      bot_prepare: () => bot,
    },
  });
  fireEvent.click(await slot.findByRole("button", { name: "New conversation with Test bot" }));
  await waitFor(() => expect(slot.inspection.navigateCalls).toContainEqual(expect.objectContaining({ method: "toPluginPanel", path: "conversation" })));
  expect(slot.queryByRole("dialog")).toBeNull();
  expect(slot.inspection.rpcCalls.some(call => call.method === "conversation_create")).toBe(false);
});

it("keeps native request choices and draft identity through failed send, navigation, and retry without duplicate creation", async () => {
  const subPath = conversationPanelPath({ bot, kind: "project", projectId: "project", environment: { type: "host", hostId: "host", workspace: { type: "unmanaged", path: null } }, makeMain: false });
  let fail = true;
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const slot = renderSlot(app.navPanels.find(panel => panel.id === "conversation")!, { subPath }, { rpc: {
    bot_prepare: () => bot,
    bots_list: () => ({ bots: [bot], projects: [{ id: "project", name: "Work" }], personalProjectId }),
    conversation_create: async () => { if (fail) throw new Error("Host disconnected"); await gate; return { threadId: "new-thread" }; },
  } });
  await slot.findByRole("region", { name: "New conversation in project" });
  expect(slot.queryByRole("heading")).toBeNull();
  expect(slot.queryByText(`Message ${bot.name} to start a conversation.`)).toBeNull();
  const draftKey = composer.props!.draftKey;
  const chosen = { ...request, model: "chosen-model", permissionMode: "full" as const, input: [...request.input, { type: "localFile" as const, path: "/tmp/notes.txt" }] };
  await act(async () => { await expect(composer.props!.onSubmit(chosen)).rejects.toThrow("Host disconnected"); });
  expect(slot.getByRole("alert").textContent).toBe("Host disconnected");
  slot.lifecycle.rerender(null);
  slot.lifecycle.rerender(createElement(ConversationPanel, { subPath }));
  await slot.findByRole("region", { name: "New conversation in project" });
  expect(composer.props!.draftKey).toBe(draftKey);
  fail = false;
  let pending!: Promise<void>;
  act(() => { pending = Promise.resolve(composer.props!.onSubmit(chosen)); });
  await act(async () => { await expect(composer.props!.onSubmit(chosen)).rejects.toThrow("already being created"); });
  slot.lifecycle.rerender(null);
  await act(async () => { finish(); await pending; });
  expect(slot.inspection.navigateCalls).toEqual([]);
  slot.lifecycle.rerender(createElement(ConversationPanel, { subPath }));
  await waitFor(() => expect(slot.inspection.navigateCalls).toContainEqual({ method: "toThread", threadId: "new-thread" }));
  expect(slot.inspection.rpcCalls.filter(call => call.method === "conversation_create")).toEqual([
    { method: "conversation_create", input: { botId: bot.id, request: chosen, makeMain: false } },
    { method: "conversation_create", input: { botId: bot.id, request: chosen, makeMain: false } },
  ]);
});

it("forks from the row in the main panel with the source environment and a source-specific draft", async () => {
  const slot = renderSlot(app.threadLists[0]!, { activeThreadId: "source", activeProjectId: "project", isCompactViewport: false, onNavigate: () => {}, searchQuery: "" }, {
    sidebarThreads: { projects: [], threads: [thread("source", 100)] },
    rpc: {
      bots_list: () => ({ bots: [bot], hosts: [], sections: [], projects: [{ id: "project", name: "Work" }], threadBindings: [{ botId: bot.id, threadId: "source" }], warnings: [], personalProjectId, projectOwners: [] }),
      bot_prepare: () => bot,
      conversation_fork: () => ({ threadId: "fork" }),
    },
  });
  fireEvent.click(await slot.findByRole("button", { name: "Expand conversations for Test bot" }));
  fireEvent.contextMenu(slot.getByText("Conversation source"));
  fireEvent.click(await slot.findByRole("menuitem", { name: "Fork in same environment…" }));
  await openConversationPanel(slot, "Fork conversation");
  expect(composer.props!.defaultEnvironment).toEqual({ type: "reuse", environmentId: "env-existing" });
  expect(composer.props!.draftKey).toBe("bots:bot:fork:project:env-existing:source");
  await act(() => composer.props!.onSubmit(request));
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "conversation_fork", input: { botId: bot.id, sourceThreadId: "source", request } });
  expect(slot.inspection.navigateCalls).toContainEqual({ method: "toThread", threadId: "fork" });
});

it("rejects an invalid main-panel launch without preparing or creating a thread", async () => {
  const slot = renderSlot(app.navPanels.find(panel => panel.id === "conversation")!, { subPath: "invalid" });
  await slot.findByRole("alert");
  expect(slot.queryByTestId("bb-new-thread-composer")).toBeNull();
  expect(slot.inspection.rpcCalls).toEqual([]);
});

it("keeps unassigned creation on the native main-panel action", async () => {
  const slot = renderSlot(app.threadLists[0]!, { activeThreadId: null, activeProjectId: null, isCompactViewport: false, onNavigate: () => {}, searchQuery: "" }, {
    sidebarThreads: { projects: [], threads: [] },
    rpc: { bots_list: () => ({ bots: [], hosts: [], sections: [], projects: [], threadBindings: [], warnings: [], personalProjectId, projectOwners: [] }) },
  });
  await waitFor(() => expect(slot.queryByText("Loading bots…")).toBeNull());
  fireEvent.click(slot.getByRole("button", { name: "New unassigned chat" }));
  expect(slot.inspection.sidebarActionCalls).toContainEqual({ method: "openNewThread", options: { projectId: personalProjectId, focusPrompt: true } });
  expect(slot.queryByRole("dialog")).toBeNull();
});
