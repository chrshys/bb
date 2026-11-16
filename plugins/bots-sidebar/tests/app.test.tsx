// @vitest-environment jsdom
import { openConversationPanel } from "./open-conversation-panel";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { bot, personalProjectId, thread, project } from "./fixtures";

import { nativeActions } from "./native-actions";

const app = await loadPluginApp(() => import("../app"));
afterEach(cleanup);

async function mount(withChat = false, status: Partial<ReturnType<typeof thread>> = {}, withHidden = false) {
  const onNavigate = vi.fn();
  const native = nativeActions();
  const slot = renderSlot(app.threadLists[0]!, {
    activeThreadId: "main", activeProjectId: "project", isCompactViewport: false,
    onNavigate, searchQuery: "",
  }, {
    threadActions: native.resolve,
    sidebarThreads: {
      projects: [project("project", "Test bot", false), ...(withChat ? [project("personal", "Personal", true)] : []), ...(withHidden ? [project("hidden", "Hidden bot", false)] : [])],
      threads: [thread("main", 1000), ...Array.from({ length: 10 }, (_, i) => thread(String(i), 100 - i, i === 0 ? status : {})), ...(withChat ? [thread("chat", 200, { ...status, projectId: "personal", environment: null })] : [])],
    },
    rpc: { bot_prepare: () => bot, bots_list: () => ({ personalProjectId, bots: [bot, ...(withHidden ? [{ ...bot, id: "hidden", name: "Hidden bot", mainThreadId: null, hiddenUntilActivity: true, hiddenAt: 10000 }] : [])], hosts: [{ id: "host", name: "Local", connected: true }], sections: [], projects: [{ id: "project", name: "Project" }], threadBindings: ["main", ...Array.from({ length: 10 }, (_, i) => String(i))].map((threadId) => ({ threadId, botId: bot.id })), warnings: [] }), conversation_reorder: () => ({ ok: true }) },
  });
  await slot.findByText("Test bot");
  fireEvent.click(slot.getByRole("button", { name: "Expand conversations for Test bot" }));
  return { slot, onNavigate, native };
}

describe("Bots sidebar", () => {
  it("counts every top-level conversation in the bot disclosure", async () => {
    const { slot } = await mount();
    const row = slot.getByText("Test bot").closest<HTMLElement>(".project-row")!;
    expect(row.querySelector(".conversation-disclosure")?.textContent).toBe("11");
    expect(slot.container.querySelectorAll("[data-sidebar-thread-id]")).toHaveLength(11);
    expect(slot.getByRole("group", { name: "Conversations for Test bot" })).toBeTruthy();
    expect(slot.inspection.sidebarActionCalls).toEqual([]);
  });
  it("uses an invisible Main section instead of an Unassigned heading", async () => {
    const { slot } = await mount(false, {}, false);
    expect(slot.getByText("Test bot")).toBeTruthy();
    expect(slot.queryByText("Main", { exact: true })).toBeNull();
    expect(slot.queryByText("Unassigned", { exact: true })).toBeNull();
    expect(slot.getByText("Test bot").closest(".bot-section")?.getAttribute("data-section-id")).toBe("unassigned");
  });
  it("has no activity-date labels and puts the hidden toggle below the bots", async () => {
    const { slot } = await mount(true, {}, true);
    expect(slot.queryByText(/^\d{1,2}\/\d{1,2}$/)).toBeNull();
    expect(slot.container.querySelector(".project-date")).toBeNull();
    const toggle = slot.getByRole("button", { name: "1 hidden" });
    expect(toggle.closest(".bots-list-footer")).not.toBeNull();
    const list = slot.container.querySelector(".bot-section")!;
    expect(list.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(toggle);
    expect(slot.getByText("Hidden bot")).toBeTruthy();
  });
  it("shows the ordered roots with only the requested inline archive action", async () => {
    const { slot } = await mount();
    expect(slot.container.querySelectorAll("[data-sidebar-thread-id]")).toHaveLength(11);
    expect(slot.container.querySelectorAll(".thread-row button:not(.conversation-archive):not(.thread-menu-button), .project-row-actions")).toHaveLength(0);
    expect(slot.container.querySelectorAll(".thread-row .conversation-archive")).toHaveLength(11);
    expect(slot.queryByRole("button", { name: /Other/ })).toBeNull();
    expect(slot.container.querySelectorAll("[data-sidebar-thread-id]")).toHaveLength(11);
    expect(slot.inspection.sidebarActionCalls).toEqual([]);
  });
  it.each([
    { indicator: "runtime" as const, label: "Working" },
    { indicator: "none" as const, label: null },
  ])("shows only meaningful status for $indicator on bot conversations and Chats", async ({ indicator, label }) => {
    const { slot } = await mount(true, { indicator });
    for (const id of ["0", "chat"]) {
      const row = slot.container.querySelector<HTMLElement>(`[data-sidebar-thread-id="${id}"]`)!.parentElement!;
      if (label) expect(within(row).getByRole("img", { name: label })).toBeTruthy();
      expect(row.querySelectorAll(".conversation-status")).toHaveLength(label ? 1 : 0);
      expect(row.querySelector(".thread-indicator, .thread-branch")).toBeNull();
    }
  });
  it("archives a conversation through the host, not a private RPC", async () => {
    const { slot, native } = await mount();
    fireEvent.contextMenu(slot.getByText("Conversation 0"));
    fireEvent.click(await slot.findByRole("menuitem", { name: "Archive" }));
    expect(native.run).toHaveBeenCalledExactlyOnceWith("archive", "0");
    expect(slot.inspection.sidebarActionCalls).toEqual([]);
  });
  it("gives Chats assignment and conversation actions without main/worktree actions", async () => {
    const { slot, native } = await mount(true);
    fireEvent.contextMenu(slot.getByText("Conversation chat"));
    const menu = await slot.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Assign to bot…" })).toBeTruthy();
    expect(within(menu).queryByRole("menuitem", { name: /worktree|main conversation/i })).toBeNull();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Archive" }));
    expect(native.run).toHaveBeenCalledExactlyOnceWith("archive", "chat");
  });
  it.each(["0", "chat"])("delegates rename of %s to the host editor", async (id) => {
    const { slot, native } = await mount(true);
    fireEvent.contextMenu(slot.getByText(`Conversation ${id}`));
    expect(native.run).not.toHaveBeenCalled();
    fireEvent.click(await slot.findByRole("menuitem", { name: "Rename" }));
    expect(native.run).toHaveBeenCalledExactlyOnceWith("rename", id);
    expect(slot.inspection.sidebarActionCalls).toEqual([]);
    expect(slot.queryByRole("dialog")).toBeNull();
  });
  it.each([
    { label: "Mark as unread", key: "unread" },
    { label: "Open in split", key: "open-split" },
  ])("runs the host Chats action: $label", async ({ label, key }) => {
    const { slot, native } = await mount(true);
    fireEvent.contextMenu(slot.getByText("Conversation chat"));
    fireEvent.click(await slot.findByRole("menuitem", { name: label }));
    expect(native.run).toHaveBeenCalledExactlyOnceWith(key, "chat");
    expect(slot.inspection.sidebarActionCalls).toEqual([]);
  });
  it("offers Move to top instead of Make main", async () => {
    const { slot } = await mount();
    fireEvent.contextMenu(slot.getByText("Conversation 0"));
    fireEvent.click(await slot.findByRole("menuitem", { name: "Move to top" }));
    await waitFor(() => expect(slot.inspection.rpcCalls).toContainEqual({ method: "conversation_reorder", input: { botId: bot.id, threadId: "0", targetThreadId: "main", position: "before" } }));
  });
  it("opens the host worktree composer from the bot without creating a thread yet", async () => {
    const { slot } = await mount();
    fireEvent.contextMenu(slot.getByText("Test bot"));
    fireEvent.click(await slot.findByRole("menuitem", { name: "New conversation in worktree…" }));
    await openConversationPanel(slot, "New conversation in worktree");
    expect(slot.queryByText("Start in a fresh worktree. Choose the branch and harness before sending.")).toBeNull();
    expect(slot.inspection.rpcCalls.some((call) => call.method === "conversation_create")).toBe(false);
    expect(slot.inspection.sidebarActionCalls).toEqual([]);
  });
  it("offers a fresh worktree from an existing conversation", async () => {
    const { slot } = await mount();
    fireEvent.contextMenu(slot.getByText("Conversation 0"));
    fireEvent.click(await slot.findByRole("menuitem", { name: "New conversation in worktree…" }));
    await openConversationPanel(slot, "New conversation in worktree");
    expect(slot.queryByText("Start in a fresh worktree. Choose the branch and harness before sending.")).toBeNull();
  });
});
