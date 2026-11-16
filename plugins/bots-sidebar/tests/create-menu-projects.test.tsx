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
const builder: BotMetadata = { ...bot, id: "builder", name: "Builder", mainThreadId: null, linkedProjectIds: [] };
async function mount({ projectFailures = 0, botFailures = 0, offline = false, existing = [] as BotMetadata[] } = {}) {
  const bots: BotMetadata[] = [...existing];
  const projects = [{ id: "existing", name: "Existing work" }];
  const sections: { id: string; name: string; order: number }[] = [];
  const onNavigate = vi.fn();
  const slot = renderSlot(app.threadLists[0]!, { activeThreadId: null, activeProjectId: null, isCompactViewport: false, onNavigate, searchQuery: "" }, {
    sidebarThreads: { projects: [], threads: [] }, rpc: {
      bots_list: () => ({ bots, projects, sections, hosts: [{ id: "host", name: "Local", connected: !offline }, { id: "remote", name: "Remote", connected: !offline }], personalProjectId, warnings: [], threadBindings: [], projectOwners: [] }),
      section_create: (raw) => { const { name } = rpcContract.section_create.input.parse(raw); const section = { id: "section", name, order: 0 }; sections.push(section); return section; },
      project_create: (raw) => { const input = rpcContract.project_create.input.parse(raw); if (projectFailures-- > 0) throw new Error("Temporary project failure"); const project = { id: "new-project", name: input.name }; if (!projects.some(entry => entry.id === project.id)) projects.push(project); return project; },
      project_browse: (raw) => { const input = rpcContract.project_browse.input.parse(raw); return { directory: input.path ?? `/home/${input.hostId}`, parent: "/", entries: [{ name: "work", path: "/work" }], truncated: false }; },
      bot_create: (raw) => { const input = rpcContract.bot_create.input.parse(raw); const value = { ...bot, id: "created", name: input.name, role: input.role, soul: input.soul, hostId: input.hostId, mainThreadId: null, linkedProjectIds: input.linkedProjectIds }; bots.push(value); return value; },
      bot_update: (raw) => { const input = rpcContract.bot_update.input.parse(raw); if (botFailures-- > 0) throw new Error("Ownership changed; review your draft"); bots[0] = { ...bots[0]!, name: input.name, soul: input.soul, linkedProjectIds: input.linkedProjectIds }; return bots[0]; },
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
async function editBuilder(slot: Slot) {
  fireEvent.contextMenu(slot.getByText("Builder"));
  fireEvent.click(await slot.findByRole("menuitem", { name: "Edit bot…" }));
  const dialog = await slot.findByRole("dialog", { name: "Edit bot" });
  fireEvent.click(within(dialog).getByRole("tab", { name: /^Projects/ }));
  return dialog;
}
async function botProject(slot: Slot) {
  const dialog = await editBuilder(slot);
  fireEvent.click(within(dialog).getByRole("button", { name: "New project…" }));
  return dialog;
}
function fillProject(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Project name" }), { target: { value: "Client app" } });
  selectOption(within(dialog).getByRole("combobox", { name: "Project machine" }), "Remote");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Project folder" }), { target: { value: "/work/client-app" } });
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

it("creates a standalone work project on the selected host without making a bot", async () => {
  const { slot, bots, onNavigate } = await mount(); await choose(slot, "Project");
  const dialog = await slot.findByRole("dialog", { name: "Create project" }); fillProject(dialog);
  expect(fireEvent.keyDown(within(dialog).getByRole("textbox", { name: "Project folder" }), { key: "Enter" })).toBe(false);
  expect(slot.inspection.rpcCalls.some(call => call.method === "project_create")).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Create project" }));
  await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "project_create", input: { requestId: expect.any(String), name: "Client app", hostId: "remote", path: "/work/client-app" } });
  expect(bots).toEqual([]); expect(onNavigate).toHaveBeenCalledOnce();
  expect(slot.inspection.navigateCalls).toContainEqual({ method: "toProject", projectId: "new-project" });
});

it("only lists linked projects and offers a searchable explicit existing-project picker", async () => {
  const { slot } = await mount({ existing: [builder] }); const dialog = await editBuilder(slot);
  expect(within(dialog).getByText("No projects linked")).toBeTruthy(); expect(within(dialog).queryByText("Existing work")).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: "Add existing…" }));
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Search projects" }), { target: { value: "missing" } });
  expect(within(dialog).getByText("No matching projects")).toBeTruthy();
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Search projects" }), { target: { value: "work" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Link Existing work" }));
  expect((within(dialog).getByRole("combobox", { name: "Existing work role" }) as HTMLSelectElement).value).toBe("member");
  fireEvent.click(within(dialog).getByRole("button", { name: "Unlink Existing work" }));
  expect(within(dialog).getByText("No projects linked")).toBeTruthy();
  expect(slot.inspection.rpcCalls.some(call => call.method === "bot_update" || call.method === "project_create")).toBe(false);
});

it("retains the inline new-project draft across tabs and links it as Owner only on bot Save", async () => {
  const { slot } = await mount({ existing: [builder] }); const dialog = await botProject(slot); fillProject(dialog);
  expect((within(dialog).getByRole("button", { name: "Save bot" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(dialog).getByRole("tab", { name: "Instructions" }));
  fireEvent.change(within(dialog).getByRole("textbox", { name: "SOUL.md" }), { target: { value: "Keep my bot draft" } });
  fireEvent.click(within(dialog).getByRole("tab", { name: /^Projects/ }));
  expect((within(dialog).getByRole("textbox", { name: "Project name" }) as HTMLInputElement).value).toBe("Client app");
  expect((within(dialog).getByRole("textbox", { name: "Project folder" }) as HTMLInputElement).value).toBe("/work/client-app");
  fireEvent.click(within(dialog).getByRole("button", { name: "Create project" }));
  await within(dialog).findByRole("combobox", { name: "Client app role" });
  expect((within(dialog).getByRole("combobox", { name: "Client app role" }) as HTMLSelectElement).value).toBe("owner");
  expect(slot.inspection.rpcCalls.some(call => call.method === "bot_update")).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Save bot" }));
  await waitFor(() => expect(slot.inspection.rpcCalls.some(call => call.method === "bot_update")).toBe(true));
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "bot_update", input: expect.objectContaining({ botId: "builder", name: "Builder", soul: "Keep my bot draft", linkedProjectIds: ["new-project"], ownedProjectIds: ["new-project"] }) });
  expect(slot.inspection.rpcCalls.filter(call => call.method === "project_create")).toHaveLength(1);
});

it("does not create a project from an unsubmitted project draft", async () => {
  const { slot } = await mount({ existing: [builder] }); const dialog = await botProject(slot); fillProject(dialog);
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel project" }));
  expect((within(dialog).getByRole("button", { name: "Save bot" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(slot.queryByRole("dialog")).toBeNull();
  expect(slot.inspection.rpcCalls.some(call => call.method === "project_create" || call.method === "bot_update")).toBe(false);
});

it("keeps an explicitly created project if the bot edit is cancelled, without linking it", async () => {
  const { slot, projects, bots } = await mount({ existing: [builder] }); const dialog = await botProject(slot); fillProject(dialog);
  fireEvent.click(within(dialog).getByRole("button", { name: "Create project" }));
  await within(dialog).findByText(/cancelling the bot won’t delete/);
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(projects.some(project => project.id === "new-project")).toBe(true); expect(bots[0]!.linkedProjectIds).toEqual([]);
  expect(slot.inspection.rpcCalls.some(call => call.method === "bot_update" || call.method === "project_delete" || call.method === "state_apply")).toBe(false);
});

it("reuses a request ID on retry and retains a created project through a failed bot save", async () => {
  const { slot } = await mount({ projectFailures: 1, botFailures: 1, existing: [builder] }); const dialog = await botProject(slot); fillProject(dialog);
  fireEvent.click(within(dialog).getByRole("button", { name: "Create project" }));
  await within(dialog).findByRole("alert");
  fireEvent.click(within(dialog).getByRole("button", { name: "Create project" }));
  await within(dialog).findByRole("combobox", { name: "Client app role" });
  const calls = slot.inspection.rpcCalls.filter(call => call.method === "project_create"); expect(calls).toHaveLength(2); expect(calls[0]!.input).toEqual(calls[1]!.input);
  fireEvent.click(within(dialog).getByRole("button", { name: "Save bot" })); await within(dialog).findByText("Ownership changed; review your draft");
  expect((within(dialog).getByRole("combobox", { name: "Client app role" }) as HTMLSelectElement).value).toBe("owner");
  fireEvent.click(within(dialog).getByRole("button", { name: "Save bot" }));
  await waitFor(() => expect(slot.inspection.rpcCalls.filter(call => call.method === "bot_update")).toHaveLength(2));
  expect(slot.inspection.rpcCalls.filter(call => call.method === "project_create")).toHaveLength(2);
});

it("browses folders on the chosen machine without creating anything", async () => {
  const { slot } = await mount(); await choose(slot, "Project"); const dialog = await slot.findByRole("dialog", { name: "Create project" });
  selectOption(within(dialog).getByRole("combobox", { name: "Project machine" }), "Remote");
  fireEvent.click(within(dialog).getByRole("button", { name: "Browse…" })); await within(dialog).findByText("/home/remote");
  fireEvent.click(within(dialog).getByRole("button", { name: "work" })); await within(dialog).findByText("/work");
  fireEvent.click(within(dialog).getByRole("button", { name: "Use this folder" }));
  expect((within(dialog).getByRole("textbox", { name: "Project folder" }) as HTMLInputElement).value).toBe("/work");
  expect(slot.inspection.rpcCalls.filter(call => call.method === "project_browse")).toEqual([{ method: "project_browse", input: { hostId: "remote" } }, { method: "project_browse", input: { hostId: "remote", path: "/work" } }]);
  expect(slot.inspection.rpcCalls.some(call => call.method === "project_create")).toBe(false);
});

it("disables project creation when no machine is connected", async () => {
  const { slot } = await mount({ offline: true }); await choose(slot, "Project"); const dialog = await slot.findByRole("dialog", { name: "Create project" });
  expect(within(dialog).getByText("Connect a machine to create a project.")).toBeTruthy();
  expect((within(dialog).getByRole("button", { name: "Create project" }) as HTMLButtonElement).disabled).toBe(true);
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
