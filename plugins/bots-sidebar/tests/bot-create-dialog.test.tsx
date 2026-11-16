// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { rpcContract, type BotMetadata } from "../contract";
import { AVATAR_COLORS, AVATAR_EXPRESSIONS, AVATAR_MOTIONS, AVATAR_SHAPES } from "../lib/appearance";
import { bot, personalProjectId } from "./fixtures";

const app = await loadPluginApp(() => import("../app"));
afterEach(cleanup);

type Host = { id: string; name: string; connected: boolean };
type NativePicker = { hostId: string | null; pickFolder: () => Promise<string | null> };
async function mount({ hosts = [{ id: "offline", name: "Offline", connected: false }, { id: "online", name: "Online", connected: true }], existing = [], createFailures = 0, projectFailures = 0, projectOwners = [], nativeFolderPicker, noProjects = false }: { hosts?: Host[]; existing?: BotMetadata[]; createFailures?: number; projectFailures?: number; projectOwners?: { projectId: string; botId: string }[]; nativeFolderPicker?: NativePicker; noProjects?: boolean } = {}) {
  const bots = [...existing];
  const projects = noProjects ? [] : [{ id: "project", name: "Shared project" }];
  const requests = new Map<string, { id: string; name: string }>();
  const slot = renderSlot(app.threadLists[0]!, { activeThreadId: null, activeProjectId: null, isCompactViewport: false, onNavigate: vi.fn(), searchQuery: "" }, {
    sidebarThreads: { projects: [], threads: [] },
    nativeFolderPicker,
    rpc: {
      bots_list: () => ({ bots, hosts, sections: [{ id: "team", name: "Team", order: 0 }], projects, personalProjectId, warnings: [], threadBindings: [], projectOwners }),
      project_browse: (raw) => { const input = rpcContract.project_browse.input.parse(raw); return { directory: input.path ?? `/home/${input.hostId}`, parent: "/", entries: [{ name: "work", path: "/work" }], truncated: false }; },
      project_create: (raw) => {
        const input = rpcContract.project_create.input.parse(raw);
        if (projectFailures-- > 0) throw new Error("This folder is already registered as “Other”. Choose a different folder.");
        const project = requests.get(input.requestId) ?? { id: `folder-${requests.size + 1}`, name: input.name };
        if (!requests.has(input.requestId)) { requests.set(input.requestId, project); projects.push(project); }
        return project;
      },
      bot_create: (raw) => {
        const input = rpcContract.bot_create.input.parse(raw);
        if (createFailures-- > 0) throw new Error("Could not save the bot");
        const created = { ...bot, id: "created", name: input.name, role: input.role, avatar: input.avatar, hostId: input.hostId, sectionId: input.sectionId, linkedProjectIds: input.linkedProjectIds, mainThreadId: null };
        bots.push(created); return created;
      },
      bot_prepare: (raw) => bots.find((entry) => entry.id === rpcContract.bot_prepare.input.parse(raw).botId),
    },
  });
  await waitFor(() => expect(slot.queryByText("Loading bots…")).toBeNull());
  return slot;
}
async function openCreate(slot: Awaited<ReturnType<typeof mount>>) {
  fireEvent.keyDown(slot.getByRole("button", { name: "Create…" }), { key: "ArrowDown" });
  fireEvent.click(await slot.findByRole("menuitem", { name: "Bot" }));
  return slot.findByRole("dialog", { name: "Create new bot" });
}
const calls = (slot: Awaited<ReturnType<typeof mount>>, method: string) => slot.inspection.rpcCalls.filter((call) => call.method === method);
const created = (slot: Awaited<ReturnType<typeof mount>>) => calls(slot, "bot_create");
const folderRow = (dialog: HTMLElement) => within(dialog).getByRole("group", { name: "Project folder" });
const folderButton = (dialog: HTMLElement) => within(folderRow(dialog)).getByRole<HTMLButtonElement>("button", { name: /^(Choose a|Change the) project folder$/ });
const createButton = (dialog: HTMLElement) => within(dialog).getByRole<HTMLButtonElement>("button", { name: "Create" });
async function folderMenu(dialog: HTMLElement) {
  fireEvent.keyDown(folderButton(dialog), { key: "ArrowDown" });
  return within(await within(document.body).findByRole("menu"));
}
async function pickFromMenu(dialog: HTMLElement, item: string) {
  fireEvent.click((await folderMenu(dialog)).getByRole("menuitem", { name: item }));
}
async function browseToWork(dialog: HTMLElement) {
  await pickFromMenu(dialog, "Choose a folder…");
  const browser = within(await within(dialog).findByRole("group", { name: "Choose a folder" }));
  fireEvent.click(await browser.findByRole("button", { name: "work" }));
  await browser.findByText("/work");
  return browser;
}
async function chooseWork(dialog: HTMLElement) {
  fireEvent.click((await browseToWork(dialog)).getByRole("button", { name: "Use this folder" }));
  await within(dialog).findByRole("group", { name: "Project folder" });
}
const nativeOnly = (pickFolder: NativePicker["pickFolder"]) => ({ hosts: [{ id: "online", name: "Online", connected: true }], nativeFolderPicker: { hostId: "online", pickFolder } });

it("asks only for a name, a shape and a color, with one project folder field left at no project", async () => {
  const slot = await mount();
  const dialog = await openCreate(slot);
  expect(within(dialog).getAllByRole("textbox")).toHaveLength(1);
  expect((within(dialog).getByRole("textbox", { name: "Bot name" }) as HTMLInputElement).placeholder).toBe("Name your bot");
  expect(within(dialog).queryAllByRole("tab")).toHaveLength(0);
  expect(within(dialog).queryAllByRole("combobox")).toHaveLength(0);
  expect(folderRow(dialog).textContent).toBe("No project folderChoose…");
  expect(within(folderRow(dialog)).getAllByRole("button")).toHaveLength(1);
  expect(within(dialog).queryByRole("group", { name: "Choose a folder" })).toBeNull();
  expect(dialog.querySelector("textarea, input[type=color]")).toBeNull();
  expect(within(within(dialog).getByRole("group", { name: "Shape" })).getAllByRole("button")).toHaveLength(AVATAR_SHAPES.length);
  expect(within(within(dialog).getByRole("group", { name: "Color" })).getAllByRole("button")).toHaveLength(AVATAR_COLORS.length);
  expect(within(dialog).queryByRole("group", { name: "Expression" })).toBeNull();
  expect(within(dialog).getByRole("img", { name: "Bot preview" }).getAttribute("width")).toBe("96");
  expect(within(dialog).getByRole("button", { name: "Close" })).toBeTruthy();
  expect(slot.inspection.rpcCalls.map((call) => call.method)).toEqual(["bots_list"]);
});

it("keeps Create disabled and ignores Enter until a name is entered", async () => {
  const slot = await mount();
  const dialog = await openCreate(slot);
  const name = within(dialog).getByRole("textbox", { name: "Bot name" });
  const create = within(dialog).getByRole("button", { name: "Create" }) as HTMLButtonElement;
  expect(create.disabled).toBe(true);
  fireEvent.change(name, { target: { value: "   " } });
  expect(create.disabled).toBe(true);
  fireEvent.keyDown(name, { key: "Enter" });
  fireEvent.submit(dialog.querySelector("form")!);
  expect(created(slot)).toHaveLength(0);
  fireEvent.change(name, { target: { value: "Scout" } });
  expect(create.disabled).toBe(false);
});

it("sends the picked look with defaults for everything else and shows the bot in the sidebar", async () => {
  const slot = await mount();
  const dialog = await openCreate(slot);
  const preview = () => within(dialog).getByRole("img", { name: "Bot preview" });
  const rolled = { expression: preview().getAttribute("data-expression"), motion: preview().getAttribute("data-motion") };
  expect(AVATAR_EXPRESSIONS.map((entry) => entry.id)).toContain(rolled.expression);
  expect(AVATAR_MOTIONS.map((entry) => entry.id)).toContain(rolled.motion);
  fireEvent.click(within(dialog).getByRole("button", { name: "Hexagon" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "#2f6dcc" }));
  expect(within(dialog).getByRole("button", { name: "Hexagon" }).getAttribute("aria-pressed")).toBe("true");
  expect(within(dialog).getByRole("button", { name: "#2f6dcc" }).getAttribute("aria-pressed")).toBe("true");
  expect(preview().getAttribute("data-shape")).toBe("hexagon");
  expect(preview().getAttribute("data-color")).toBe("#2f6dcc");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "  Scout  " } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
  await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
  expect(created(slot)).toEqual([{ method: "bot_create", input: {
    hostId: "online", name: "Scout", role: "Assistant", sectionId: null, soul: "", memory: "", settings: {}, linkedProjectIds: [], ownedProjectIds: [], defaultProjectId: null,
    avatar: { color: "#2f6dcc", shape: "hexagon", expression: rolled.expression, motion: rolled.motion },
  } }]);
  expect(await slot.findByText("Scout")).toBeTruthy();
});

it("creates on Enter in the name field exactly once", async () => {
  const slot = await mount();
  const dialog = await openCreate(slot);
  const name = within(dialog).getByRole("textbox", { name: "Bot name" });
  fireEvent.change(name, { target: { value: "Scout" } });
  expect(fireEvent.keyDown(name, { key: "Enter" })).toBe(false);
  fireEvent.keyDown(name, { key: "Enter" });
  await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
  expect(created(slot)).toHaveLength(1);
});

it("falls back to the first machine when none is connected", async () => {
  const slot = await mount({ hosts: [{ id: "first", name: "First", connected: false }, { id: "second", name: "Second", connected: false }] });
  const dialog = await openCreate(slot);
  expect(within(dialog).queryByText(/No machine is available/)).toBeNull();
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
  await waitFor(() => expect(created(slot)).toHaveLength(1));
  expect(created(slot)[0]!.input).toMatchObject({ hostId: "first" });
});

it("explains why a bot cannot be created when there is no machine", async () => {
  const slot = await mount({ hosts: [] });
  const dialog = await openCreate(slot);
  expect(within(dialog).getByText("No machine is available. Connect a machine to BB before creating a bot.")).toBeTruthy();
  const name = within(dialog).getByRole("textbox", { name: "Bot name" });
  fireEvent.change(name, { target: { value: "Scout" } });
  expect((within(dialog).getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.keyDown(name, { key: "Enter" });
  expect(created(slot)).toHaveLength(0);
});

it("keeps the draft and reports a failed save so it can be retried", async () => {
  const slot = await mount({ createFailures: 1 });
  const dialog = await openCreate(slot);
  fireEvent.click(within(dialog).getByRole("button", { name: "Cloud" }));
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
  expect((await within(dialog).findByRole("alert")).textContent).toBe("Could not save the bot");
  expect((within(dialog).getByRole("textbox", { name: "Bot name" }) as HTMLInputElement).value).toBe("Scout");
  expect(within(dialog).getByRole("img", { name: "Bot preview" }).getAttribute("data-shape")).toBe("cloud");
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
  await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
  expect(created(slot)).toHaveLength(2);
});

it("creates nothing when cancelled", async () => {
  const slot = await mount();
  const dialog = await openCreate(slot);
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(slot.queryByRole("dialog")).toBeNull();
  expect(created(slot)).toHaveLength(0);
});

it("sends Edit bot for an existing bot to its panel, never to a dialog", async () => {
  const slot = await mount({ existing: [{ ...bot, mainThreadId: null, linkedProjectIds: [] }] });
  fireEvent.contextMenu(slot.getByText(bot.name));
  fireEvent.click(await slot.findByRole("menuitem", { name: "Edit bot…" }));
  expect(slot.inspection.experimental_fixedTabOpenCalls).toEqual([{ surface: { kind: "navPanel", panelId: "coordinator", subPath: bot.id }, panelId: "coordinator", tabId: "bot", target: { botId: bot.id, section: null } }]);
  expect(slot.queryByRole("dialog")).toBeNull();
  expect(created(slot)).toHaveLength(0);
});

it("links an existing project as a member and makes it the default project", async () => {
  const other = { ...bot, id: "other", name: "Owner bot", mainThreadId: null, linkedProjectIds: ["project"] };
  const slot = await mount({ existing: [other], projectOwners: [{ projectId: "project", botId: "other" }] });
  const dialog = await openCreate(slot);
  await pickFromMenu(dialog, "Shared project");
  expect(within(folderRow(dialog)).getByText("Shared project")).toBeTruthy();
  expect(within(folderRow(dialog)).getByText("Owned by Owner bot. This bot joins as a member.")).toBeTruthy();
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  fireEvent.click(createButton(dialog));
  await waitFor(() => expect(created(slot)).toHaveLength(1));
  expect(created(slot)[0]!.input).toMatchObject({ hostId: "online", linkedProjectIds: ["project"], ownedProjectIds: [], defaultProjectId: "project" });
  expect(calls(slot, "project_create")).toHaveLength(0);
});

it("returns to no project when the choice is cleared", async () => {
  const slot = await mount();
  const dialog = await openCreate(slot);
  await pickFromMenu(dialog, "Shared project");
  fireEvent.click(within(folderRow(dialog)).getByRole("button", { name: "Clear the project folder" }));
  expect(folderRow(dialog).textContent).toBe("No project folderChoose…");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  fireEvent.click(createButton(dialog));
  await waitFor(() => expect(created(slot)).toHaveLength(1));
  expect(created(slot)[0]!.input).toMatchObject({ linkedProjectIds: [], ownedProjectIds: [], defaultProjectId: null });
});

it("takes the folder from the system picker in one step and names the project after it", async () => {
  const pickFolder = vi.fn(async () => "/Users/me/Projects/client-app");
  const slot = await mount({ ...nativeOnly(pickFolder), noProjects: true });
  const dialog = await openCreate(slot);
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  fireEvent.click(folderButton(dialog));
  expect(await within(folderRow(dialog)).findByText("client-app")).toBeTruthy();
  expect(within(folderRow(dialog)).getByText("~/Projects/client-app").getAttribute("title")).toBe("/Users/me/Projects/client-app");
  expect(pickFolder).toHaveBeenCalledOnce();
  expect(within(dialog).queryByRole("group", { name: "Choose a folder" })).toBeNull();
  expect(within(dialog).getAllByRole("textbox")).toHaveLength(1);
  expect(within(dialog).getAllByRole("button", { name: /^(Cancel|Create)$/ })).toHaveLength(2);
  expect(calls(slot, "project_browse")).toHaveLength(0);
  expect(calls(slot, "project_create")).toHaveLength(0);
  fireEvent.click(createButton(dialog));
  await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
  expect(calls(slot, "project_create").map((call) => call.input)).toEqual([{ requestId: expect.any(String), name: "client-app", hostId: "online", path: "/Users/me/Projects/client-app" }]);
  expect(created(slot)[0]!.input).toMatchObject({ hostId: "online", linkedProjectIds: ["folder-1"], ownedProjectIds: ["folder-1"], defaultProjectId: "folder-1" });
});

it("keeps the previous choice when the system picker is cancelled", async () => {
  const pickFolder = vi.fn(async () => null);
  const slot = await mount(nativeOnly(pickFolder));
  const dialog = await openCreate(slot);
  await pickFromMenu(dialog, "Shared project");
  await pickFromMenu(dialog, "Choose a folder…");
  await waitFor(() => expect(pickFolder).toHaveBeenCalledOnce());
  await waitFor(() => expect(folderButton(dialog).disabled).toBe(false));
  expect(within(folderRow(dialog)).getByText("Shared project")).toBeTruthy();
  expect(within(dialog).queryByRole("group", { name: "Choose a folder" })).toBeNull();
});

it("falls back to the folder list when the system picker cannot be shown", async () => {
  const slot = await mount(nativeOnly(async () => { throw new Error("No display"); }));
  const dialog = await openCreate(slot);
  await pickFromMenu(dialog, "Choose a folder…");
  const browser = within(await within(dialog).findByRole("group", { name: "Choose a folder" }));
  expect(await browser.findByText("/home/online")).toBeTruthy();
  expect(browser.queryByRole("alert")).toBeNull();
});

it("lists folders in one step when there is no system picker, without a name, a machine or a second Cancel", async () => {
  const slot = await mount();
  const dialog = await openCreate(slot);
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  const browser = await browseToWork(dialog);
  expect(within(dialog).getAllByRole("textbox")).toHaveLength(1);
  expect(within(dialog).queryAllByRole("combobox")).toHaveLength(0);
  expect(within(dialog).getAllByRole("button", { name: /cancel/i })).toHaveLength(1);
  expect(createButton(dialog).disabled).toBe(false);
  fireEvent.click(browser.getByRole("button", { name: "Use this folder" }));
  await within(dialog).findByRole("group", { name: "Project folder" });
  expect(within(folderRow(dialog)).getByText("work")).toBeTruthy();
  expect(within(folderRow(dialog)).getByText("/work")).toBeTruthy();
  expect(calls(slot, "project_browse").map((call) => call.input)).toEqual([{ hostId: "online" }, { hostId: "online", path: "/work" }]);
  expect(calls(slot, "project_create")).toHaveLength(0);
  fireEvent.click(createButton(dialog));
  await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
  expect(calls(slot, "project_create").map((call) => call.input)).toEqual([expect.objectContaining({ name: "work", hostId: "online", path: "/work" })]);
  expect(created(slot)).toHaveLength(1);
  expect(created(slot)[0]!.input).toMatchObject({ hostId: "online", linkedProjectIds: ["folder-1"], ownedProjectIds: ["folder-1"], defaultProjectId: "folder-1" });
});

it("asks for the machine only when several are connected, and the bot follows the folder's machine", async () => {
  const pickFolder = vi.fn(async () => "/Users/me/client-app");
  const slot = await mount({ hosts: [{ id: "online", name: "Online", connected: true }, { id: "second", name: "Second", connected: true }], nativeFolderPicker: { hostId: "online", pickFolder } });
  const dialog = await openCreate(slot);
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  await pickFromMenu(dialog, "Choose a folder…");
  const browser = within(await within(dialog).findByRole("group", { name: "Choose a folder" }));
  expect(pickFolder).not.toHaveBeenCalled();
  HTMLElement.prototype.scrollIntoView ??= () => {};
  fireEvent.keyDown(browser.getByRole("combobox", { name: "Machine" }), { key: "ArrowDown" });
  fireEvent.click(within(document.body).getByRole("option", { name: "Second" }));
  await browser.findByText("/home/second");
  fireEvent.click(browser.getByRole("button", { name: "work" }));
  await browser.findByText("/work");
  fireEvent.click(browser.getByRole("button", { name: "Use this folder" }));
  await within(dialog).findByRole("group", { name: "Project folder" });
  expect(within(folderRow(dialog)).getByText("/work on Second")).toBeTruthy();
  fireEvent.click(createButton(dialog));
  await waitFor(() => expect(created(slot)).toHaveLength(1));
  expect(calls(slot, "project_create")[0]!.input).toMatchObject({ hostId: "second", path: "/work" });
  expect(created(slot)[0]!.input).toMatchObject({ hostId: "second", ownedProjectIds: ["folder-1"] });
});

it("creates no project when the dialog is cancelled after choosing a folder", async () => {
  const slot = await mount();
  const dialog = await openCreate(slot);
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  await chooseWork(dialog);
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(slot.queryByRole("dialog")).toBeNull();
  expect(calls(slot, "project_create")).toHaveLength(0);
  expect(created(slot)).toHaveLength(0);
});

it("keeps the previous choice when the folder list is closed, and never blocks Create while it is open", async () => {
  const slot = await mount();
  const dialog = await openCreate(slot);
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  await pickFromMenu(dialog, "Shared project");
  const browser = await browseToWork(dialog);
  expect(createButton(dialog).disabled).toBe(false);
  fireEvent.click(browser.getByRole("button", { name: "Close folder list" }));
  expect(within(folderRow(dialog)).getByText("Shared project")).toBeTruthy();
  fireEvent.click(createButton(dialog));
  await waitFor(() => expect(created(slot)).toHaveLength(1));
  expect(created(slot)[0]!.input).toMatchObject({ linkedProjectIds: ["project"], ownedProjectIds: [] });
});

it("reuses the created folder project when saving the bot fails and is retried", async () => {
  const slot = await mount({ createFailures: 1 });
  const dialog = await openCreate(slot);
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  await chooseWork(dialog);
  fireEvent.click(createButton(dialog));
  expect((await within(dialog).findByRole("alert")).textContent).toBe("Could not save the bot");
  expect(within(folderRow(dialog)).getByText("work")).toBeTruthy();
  expect(within(folderRow(dialog)).getByText("Already created. It stays if you cancel.")).toBeTruthy();
  await pickFromMenu(dialog, "Shared project");
  await pickFromMenu(dialog, "work");
  expect(within(folderRow(dialog)).getByText("Already created. It stays if you cancel.")).toBeTruthy();
  fireEvent.click(createButton(dialog));
  await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
  expect(calls(slot, "project_create")).toHaveLength(1);
  expect(created(slot)).toHaveLength(2);
  expect(created(slot)[1]!.input).toMatchObject({ linkedProjectIds: ["folder-1"], ownedProjectIds: ["folder-1"], defaultProjectId: "folder-1" });
});

it("does not create the bot when the folder project cannot be created, and retries the same request", async () => {
  const slot = await mount({ projectFailures: 1 });
  const dialog = await openCreate(slot);
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  await chooseWork(dialog);
  fireEvent.click(createButton(dialog));
  expect((await within(dialog).findByRole("alert")).textContent).toBe("This folder is already registered as “Other”. Choose a different folder.");
  expect(created(slot)).toHaveLength(0);
  expect(within(folderRow(dialog)).getByText("/work")).toBeTruthy();
  fireEvent.click(createButton(dialog));
  await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
  const requests = calls(slot, "project_create").map((call) => (call.input as { requestId: string }).requestId);
  expect(requests).toHaveLength(2);
  expect(requests[0]).toBe(requests[1]);
  expect(created(slot)).toHaveLength(1);
});

it("offers existing projects but no folder choice when no machine is connected", async () => {
  const slot = await mount({ hosts: [{ id: "first", name: "First", connected: false }] });
  const dialog = await openCreate(slot);
  const menu = await folderMenu(dialog);
  expect(menu.getByRole("menuitem", { name: "Choose a folder… (no machine connected)" }).getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(menu.getByRole("menuitem", { name: "Shared project" }));
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  fireEvent.click(createButton(dialog));
  await waitFor(() => expect(created(slot)).toHaveLength(1));
  expect(created(slot)[0]!.input).toMatchObject({ hostId: "first", linkedProjectIds: ["project"], defaultProjectId: "project" });
  expect(calls(slot, "project_browse")).toHaveLength(0);
});
