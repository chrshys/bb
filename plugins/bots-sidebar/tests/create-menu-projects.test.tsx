// @vitest-environment jsdom
import { openConversationPanel } from "./open-conversation-panel";
import { selectOption } from "./select-helper";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { rpcContract, type BotMetadata } from "../contract";
import { bot, personalProjectId } from "./fixtures";

const app = await loadPluginApp(() => import("../app"));
afterEach(cleanup);
async function mount({ offline = false, hosts, nativeFolderPicker }: { offline?: boolean; hosts?: { id: string; name: string; connected: boolean }[]; nativeFolderPicker?: { hostId: string | null; pickFolder: () => Promise<string | null> } } = {}) {
  const bots: BotMetadata[] = [];
  const projects = [{ id: "existing", name: "Existing work" }];
  const sections: { id: string; name: string; order: number }[] = [];
  const onNavigate = vi.fn();
  const slot = renderSlot(app.threadLists[0]!, { activeThreadId: null, activeProjectId: null, isCompactViewport: false, onNavigate, searchQuery: "" }, {
    sidebarThreads: { projects: [], threads: [] }, nativeFolderPicker, rpc: {
      bots_list: () => ({ bots, projects, sections, hosts: hosts ?? [{ id: "host", name: "Local", connected: !offline }, { id: "remote", name: "Remote", connected: !offline }], personalProjectId, warnings: [], threadBindings: [], projectOwners: [] }),
      section_create: (raw) => { const { name } = rpcContract.section_create.input.parse(raw); const section = { id: "section", name, order: 0 }; sections.push(section); return section; },
      project_create: (raw) => { const input = rpcContract.project_create.input.parse(raw); const project = { id: "new-project", name: input.name }; if (!projects.some(entry => entry.id === project.id)) projects.push(project); return project; },
      project_browse: (raw) => { const input = rpcContract.project_browse.input.parse(raw); return { directory: input.path ?? `/home/${input.hostId}`, parent: "/", entries: [{ name: "work", path: "/work" }], truncated: false }; },
      bot_create: (raw) => { const input = rpcContract.bot_create.input.parse(raw); const value = { ...bot, id: "created", name: input.name, role: input.role, soul: input.soul, hostId: input.hostId, mainThreadId: null, linkedProjectIds: input.linkedProjectIds }; bots.push(value); return value; },
      bot_prepare: () => bots[0],
    },
  });
  await waitFor(() => expect(slot.queryByText("Loading bots…")).toBeNull());
  return { slot, bots, projects, onNavigate };
}
type Slot = Awaited<ReturnType<typeof mount>>["slot"];
async function choose(slot: Slot, kind: "Bot" | "Section" | "Project") {
  fireEvent.keyDown(slot.getByRole("button", { name: "Create…" }), { key: "ArrowDown" });
  fireEvent.click(await slot.findByRole("menuitem", { name: kind }));
}
it("uses one + menu with Bot, Section, and Project without creating anything on open", async () => {
  const { slot } = await mount();
  expect(slot.queryByText("+ Section")).toBeNull();
  expect(slot.queryByRole("button", { name: "Create bot" })).toBeNull();
  fireEvent.keyDown(slot.getByRole("button", { name: "Create…" }), { key: "ArrowDown" });
  const menu = await slot.findByRole("menu");
  expect(menu.hasAttribute("data-bb-plugin-root")).toBe(true);
  const items = within(menu).getAllByRole("menuitem");
  expect(items.map(item => item.textContent)).toEqual(["Bot", "Section", "Project"]);
  expect(items.every(item => item.classList.contains("bot-menu-item"))).toBe(true);
  expect(slot.inspection.rpcCalls.map(call => call.method)).toEqual(["bots_list"]);
});

it("creates sections explicitly through the menu and lets their draft be cancelled", async () => {
  const { slot } = await mount(); await choose(slot, "Section");
  fireEvent.change(slot.getByRole("textbox", { name: "Section name" }), { target: { value: "Team" } });
  fireEvent.submit(slot.getByRole("textbox", { name: "Section name" }).closest("form")!);
  expect(slot.inspection.rpcCalls.some(call => call.method === "section_create")).toBe(false);
  fireEvent.click(slot.getByRole("button", { name: "Cancel section creation" }));
  expect(slot.queryByRole("textbox", { name: "Section name" })).toBeNull();
  await choose(slot, "Section"); fireEvent.click(slot.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(slot.queryByRole("textbox", { name: "Section name" })).toBeNull());
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "section_create", input: { name: "Team" } });
});

it("creates a standalone work project in a folder on the selected machine without making a bot", async () => {
  const { slot, bots, onNavigate } = await mount(); await choose(slot, "Project");
  const dialog = await slot.findByRole("dialog", { name: "Create project" });
  expect(within(dialog).queryAllByRole("textbox")).toHaveLength(0);
  selectOption(within(dialog).getByRole("combobox", { name: "Machine" }), "Remote");
  await within(dialog).findByText("/home/remote");
  fireEvent.click(within(dialog).getByRole("button", { name: "work" })); await within(dialog).findByText("/work");
  expect(slot.inspection.rpcCalls.filter(call => call.method === "project_browse").map(call => call.input)).toEqual([{ hostId: "host" }, { hostId: "remote" }, { hostId: "remote", path: "/work" }]);
  expect(slot.inspection.rpcCalls.some(call => call.method === "project_create")).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Create project" }));
  await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "project_create", input: { requestId: expect.any(String), name: "work", hostId: "remote", path: "/work" } });
  expect(bots).toEqual([]); expect(onNavigate).toHaveBeenCalledOnce();
  expect(slot.inspection.navigateCalls).toContainEqual({ method: "toProject", projectId: "new-project" });
});

it("creates a standalone project straight from the system picker, with no dialog", async () => {
  const pickFolder = vi.fn(async () => "/Users/me/client-app");
  const { slot, onNavigate } = await mount({ hosts: [{ id: "host", name: "Local", connected: true }], nativeFolderPicker: { hostId: "host", pickFolder } });
  await choose(slot, "Project");
  await waitFor(() => expect(slot.inspection.navigateCalls).toContainEqual({ method: "toProject", projectId: "new-project" }));
  expect(pickFolder).toHaveBeenCalledOnce();
  expect(slot.queryByRole("dialog")).toBeNull();
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "project_create", input: { requestId: expect.any(String), name: "client-app", hostId: "host", path: "/Users/me/client-app" } });
  expect(onNavigate).toHaveBeenCalledOnce();
});

it("creates nothing when the standalone project's system picker is cancelled", async () => {
  const pickFolder = vi.fn(async () => null);
  const { slot } = await mount({ hosts: [{ id: "host", name: "Local", connected: true }], nativeFolderPicker: { hostId: "host", pickFolder } });
  await choose(slot, "Project");
  await waitFor(() => expect(pickFolder).toHaveBeenCalledOnce());
  expect(slot.queryByRole("dialog")).toBeNull();
  expect(slot.inspection.rpcCalls.some(call => call.method === "project_create")).toBe(false);
  await choose(slot, "Project");
  await waitFor(() => expect(pickFolder).toHaveBeenCalledTimes(2));
});

it("explains that project creation needs a connected machine", async () => {
  const { slot } = await mount({ offline: true }); await choose(slot, "Project"); const dialog = await slot.findByRole("dialog", { name: "Create project" });
  expect(within(dialog).getByText("Connect a machine to create a project.")).toBeTruthy();
  expect(within(dialog).queryByRole("button", { name: "Create project" })).toBeNull();
  expect(slot.inspection.rpcCalls.some(call => call.method === "project_browse")).toBe(false);
});

it("opens the first conversation after saving a bot in the main panel and defers thread creation", async () => {
  const { slot, bots } = await mount();
  await choose(slot, "Bot");
  const dialog = await slot.findByRole("dialog", { name: "Create new bot" });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "New assistant" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
  await openConversationPanel(slot, "New conversation");
  expect(bots).toHaveLength(1);
  expect(slot.queryByRole("dialog")).toBeNull();
  expect(slot.inspection.rpcCalls.some(call => call.method === "conversation_create")).toBe(false);
});
