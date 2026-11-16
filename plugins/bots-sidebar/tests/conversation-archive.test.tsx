// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { bot, personalProjectId, thread, project } from "./fixtures";

import { nativeActions } from "./native-actions";

const app = await loadPluginApp(() => import("../app"));
afterEach(cleanup);
async function mount(personal: boolean) {
  const rows = [thread("main", 200), thread("root", 150), thread("child", 140, { parentThreadId: "root" }),
    thread("main-child", 1, { parentThreadId: "main" }), thread("old-leaf", 1, { title: null, titleFallback: "Older conversation" }),
    thread("archived", 500, { isArchived: true }), ...Array.from({ length: 9 }, (_, i) => thread(`recent-${i}`, 100 - i)),
  ].map(row => ({ ...row, projectId: personal ? personalProjectId : "project" }));
  const onNavigate = vi.fn();
  const native = nativeActions();
  const slot = renderSlot(app.threadLists[0]!, { activeThreadId: "root", activeProjectId: rows[0]!.projectId, isCompactViewport: false, onNavigate, searchQuery: "" }, {
    threadActions: native.resolve,
    sidebarThreads: { projects: [project(rows[0]!.projectId, "Project", personal)], threads: rows },
    rpc: { bots_list: () => ({ bots: personal ? [] : [bot], personalProjectId, hosts: [], sections: [], projects: [], warnings: [], threadBindings: personal ? [] : rows.filter(row => !row.parentThreadId).map(row => ({ threadId: row.id, botId: bot.id })) }) },
  });
  if (!personal) fireEvent.click(await slot.findByRole("button", { name: "Expand conversations for Test bot" }));
  await slot.findByText("Conversation root");
  return { slot, onNavigate, native, rows };
}

it.each([false, true].flatMap(personal => ["inline", "context", "overflow"].map(surface => ({ personal, surface }))))("archives through the same host action without navigation or branch toggling (Chats=$personal, surface=$surface)", async ({ personal, surface }) => {
  const { slot, onNavigate, native } = await mount(personal);
  const link = slot.container.querySelector('[data-sidebar-thread-id="root"]')!;
  const row = link.parentElement!;
  const archive = within(row).getByRole("button", { name: "Archive Conversation root" });
  expect(archive.closest("a")).toBeNull(); expect(archive.previousElementSibling?.contains(within(row).getByRole("button", { name: "Thread actions" }))).toBe(true);
  const disclosure = within(row).getByRole("button", { name: "Expand children of Conversation root" });
  expect(row.lastElementChild).toBe(disclosure); expect(archive.nextElementSibling).toBe(disclosure);
  if (surface === "inline") fireEvent.click(archive, { ctrlKey: true });
  else {
    if (surface === "context") fireEvent.contextMenu(link);
    else fireEvent.click(within(row).getByRole("button", { name: "Thread actions" }));
    fireEvent.click(slot.getByRole("menuitem", { name: "Archive" }));
  }
  expect(native.run).toHaveBeenCalledExactlyOnceWith("archive", "root");
  expect(slot.inspection.sidebarActionCalls).toEqual([]);
  expect(slot.container.querySelector('[data-sidebar-thread-id="root"]')).not.toBeNull();
  expect(disclosure.getAttribute("aria-expanded")).toBe("false");
  expect(onNavigate).not.toHaveBeenCalled(); expect(slot.inspection.navigateCalls).toEqual([]);
  expect(slot.inspection.rpcCalls.map(call => call.method)).toEqual(["bots_list"]);
});

it.each([false, true])("gives each expanded child its own archive action (Chats=%s)", async (personal) => {
  const { slot, native, rows } = await mount(personal);
  fireEvent.click(slot.getByRole("button", { name: "Expand children of Conversation root" }));
  fireEvent.click(slot.getByRole("button", { name: "Archive Conversation child" }));
  expect(native.run).toHaveBeenCalledExactlyOnceWith("archive", "child");
  expect(slot.inspection.sidebarActionCalls).toEqual([]);
  expect(slot.getByText("Conversation child")).toBeTruthy();
  const child = rows.find(row => row.id === "child")!;
  child.isArchived = true; child.archivedAt = 100;
  await slot.behavior.emitRealtime("project-bots-changed", {});
  expect(slot.queryByText("Conversation child")).toBeNull();
  expect(slot.queryByRole("button", { name: /children of Conversation root/ })).toBeNull();
});

it.each([false, true])("supports archiving overflow rows without opening a conversation (Chats=%s)", async (personal) => {
  const { slot, onNavigate, native } = await mount(personal);
  if (personal) expect(slot.queryByRole("button", { name: "Archive Older conversation" })).toBeNull();
  if (personal) fireEvent.click(slot.getByRole("button", { name: /^Older chats \(/ }));
  const archive = slot.getByRole("button", { name: "Archive Older conversation" });
  expect(archive.getAttribute("data-archive-thread-id")).toBe("old-leaf");
  fireEvent.keyDown(archive, { key: "Enter" }); fireEvent.click(archive, { detail: 0 });
  expect(native.run).toHaveBeenCalledExactlyOnceWith("archive", "old-leaf");
  expect(slot.inspection.sidebarActionCalls).toEqual([]);
  expect(onNavigate).not.toHaveBeenCalled();
});

it("archives a main child, never the bot identity or main pointer", async () => {
  const { slot, native, rows } = await mount(false);
  expect(slot.container.querySelector(".project-row .conversation-archive")).toBeNull();
  expect(slot.queryByRole("button", { name: "Archive Conversation archived" })).toBeNull();
  fireEvent.click(slot.getByRole("button", { name: "Expand children of Conversation main" }));
  fireEvent.click(slot.getByRole("button", { name: "Archive Conversation main-child" }));
  expect(native.run).toHaveBeenCalledExactlyOnceWith("archive", "main-child");
  expect(slot.inspection.sidebarActionCalls).toEqual([]);
  expect(slot.inspection.rpcCalls.map(call => call.method)).toEqual(["bots_list"]);
});
