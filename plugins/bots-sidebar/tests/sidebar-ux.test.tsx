// @vitest-environment jsdom
import { openConversationPanel } from "./open-conversation-panel";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { bot, personalProjectId, thread, project } from "./fixtures";

const app = await loadPluginApp(() => import("../app"));
afterEach(cleanup);

async function mount() {
  const bots = [
    { ...bot, id: "one", name: "Bot one", sectionId: "first", mainThreadId: "main-one" },
    { ...bot, id: "two", name: "Bot two", sectionId: "first", mainThreadId: "main-two", order: 1 },
    { ...bot, id: "three", name: "Bot three", sectionId: "second", mainThreadId: "main-three", order: 2 },
  ];
  const sections = [{ id: "first", name: "First", order: 0 }, { id: "second", name: "Second", order: 1 }];
  const slot = renderSlot(app.threadLists[0]!, {
    activeThreadId: "main-one", activeProjectId: "one", isCompactViewport: false,
    onNavigate: vi.fn(), searchQuery: "",
  }, {
    sidebarThreads: {
      projects: [project("project", "Shared project", false)],
      threads: bots.map((bot) => thread(bot.mainThreadId, 100)),
    },
    rpc: {
      bots_list: () => ({ bots, sections, personalProjectId, hosts: [{ id: "host", name: "Local", connected: true }], projects: [{ id: "project", name: "Shared project" }], warnings: [], threadBindings: bots.map((bot) => ({ botId: bot.id, threadId: bot.mainThreadId })) }),
      bots_reorder: () => ({ ok: true }),
      bot_prepare: () => bots[0],
      section_update: () => sections[0],
      section_create: () => { const section = { id: "new", name: "New section", order: 2 }; sections.push(section); return section; },
    },
  });
  await slot.findByText("Bot one");
  return slot;
}

it("keeps one open-main button and one inline new-chat button; settings remain in the menu/editor", async () => {
  const slot = await mount();
  const row = slot.getByText("Bot one").closest<HTMLElement>(".project-row")!;
  fireEvent.mouseEnter(row);
  fireEvent.focus(within(row).getByRole("button", { name: /^Bot one/ }));
  expect(within(row).getAllByRole("button")).toHaveLength(3);
  expect(within(row).getByRole("button", { name: "New conversation with Bot one" })).toBeTruthy();
  expect(row.draggable).toBe(true);
  expect(slot.container.querySelector(".project-row-actions")).toBeNull();
  expect(slot.queryByRole("menu")).toBeNull();
  expect(slot.queryByRole("button", { name: /Move .* up|Edit bot|Hide until activity/ })).toBeNull();
  fireEvent.contextMenu(row);
  expect(await slot.findByRole("menuitem", { name: "Edit bot…" })).toBeTruthy();
  expect(slot.queryByRole("menuitem", { name: "Move up" })).toBeNull();
});



it.each(["reorder", "section"])("restores drag-to-%s without arrow controls", async (kind) => {
  const slot = await mount();
  const dragged = slot.getByText("Bot two").closest<HTMLElement>(".project-row")!;
  const dataTransfer = { effectAllowed: "", setData: vi.fn() };
  fireEvent.dragStart(dragged, { dataTransfer });
  expect(dragged.dataset.dragging).toBe("true");
  const target = kind === "reorder" ? slot.getByText("Bot one").closest(".project-group")! : slot.container.querySelector('[data-section-id="second"]')!;
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
  const placements = kind === "reorder" ? [
    { botId: "two", sectionId: "first" }, { botId: "one", sectionId: "first" }, { botId: "three", sectionId: "second" },
  ] : [
    { botId: "one", sectionId: "first" }, { botId: "three", sectionId: "second" }, { botId: "two", sectionId: "second" },
  ];
  await waitFor(() => expect(slot.inspection.rpcCalls).toContainEqual({ method: "bots_reorder", input: { bots: placements } }));
});

it("renames sections through the section context menu", async () => {
  const slot = await mount();
  fireEvent.contextMenu(slot.getByText("First"));
  fireEvent.click(await slot.findByRole("menuitem", { name: "Rename section…" }));
  const dialog = await slot.findByRole("dialog", { name: "Rename section" });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), { target: { value: "Projects" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(slot.inspection.rpcCalls).toContainEqual({ method: "section_update", input: { sectionId: "first", name: "Projects" } }));
});



it("offers an empty Main drop target only during a drag", async () => {
  const slot = await mount();
  expect(slot.queryByText("Move to Main")).toBeNull();
  const dragged = slot.getByText("Bot two").closest<HTMLElement>(".project-row")!;
  const dataTransfer = { effectAllowed: "", setData: vi.fn() };
  fireEvent.dragStart(dragged, { dataTransfer });
  const target = slot.getByText("Move to Main");
  fireEvent.drop(target, { dataTransfer });
  await waitFor(() => expect(slot.inspection.rpcCalls).toContainEqual({ method: "bots_reorder", input: { bots: [
    { botId: "two", sectionId: null }, { botId: "one", sectionId: "first" }, { botId: "three", sectionId: "second" },
  ] } }));
  expect(slot.queryByText("Move to Main")).toBeNull();
});

it("removes Move main and keeps ordinary new conversations cancellable", async () => {
  const slot = await mount();
  fireEvent.contextMenu(slot.getByText("Bot one"));
  expect(slot.queryByRole("menuitem", { name: "Move main…" })).toBeNull();
  fireEvent.click(await slot.findByRole("menuitem", { name: "New conversation…" }));
  await openConversationPanel(slot, "New conversation");
  expect(slot.inspection.sidebarActionCalls).toEqual([]);
  expect(slot.getByTestId("bb-new-thread-composer").getAttribute("data-default-project-id")).toBe(personalProjectId);
  slot.lifecycle.rerender(null);
  expect(slot.queryByRole("dialog")).toBeNull();
  expect(slot.inspection.rpcCalls.some((call) => call.method === "main_set" || call.method === "conversation_create")).toBe(false);
});
