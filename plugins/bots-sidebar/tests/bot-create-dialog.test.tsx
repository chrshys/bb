// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { rpcContract, type BotMetadata } from "../contract";
import { AVATAR_COLORS, AVATAR_EXPRESSIONS, AVATAR_MOTIONS, AVATAR_SHAPES } from "../lib/appearance";
import { bot, personalProjectId } from "./fixtures";
import { selectOption } from "./select-helper";

const app = await loadPluginApp(() => import("../app"));
afterEach(cleanup);

type Host = { id: string; name: string; connected: boolean };
async function mount({ hosts = [{ id: "offline", name: "Offline", connected: false }, { id: "online", name: "Online", connected: true }], existing = [], createFailures = 0, projectFailures = 0, projectOwners = [] }: { hosts?: Host[]; existing?: BotMetadata[]; createFailures?: number; projectFailures?: number; projectOwners?: { projectId: string; botId: string }[] } = {}) {
  const bots = [...existing];
  const projects = [{ id: "project", name: "Shared project" }];
  const requests = new Map<string, { id: string; name: string }>();
  const slot = renderSlot(app.threadLists[0]!, { activeThreadId: null, activeProjectId: null, isCompactViewport: false, onNavigate: vi.fn(), searchQuery: "" }, {
    sidebarThreads: { projects: [], threads: [] },
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
const folderControl = (dialog: HTMLElement) => within(dialog).getByRole("combobox", { name: "Project folder" });
async function chooseFolder(dialog: HTMLElement, option = "Choose a folder…") {
  selectOption(folderControl(dialog), option);
  const step = await within(dialog).findByRole("group", { name: "New project folder" });
  fireEvent.click(within(step).getByRole("button", { name: "Browse…" }));
  fireEvent.click(await within(step).findByRole("button", { name: "work" }));
  await within(step).findByText("/work");
  fireEvent.click(within(step).getByRole("button", { name: "Use this folder" }));
  return step;
}

it("asks only for a name, a shape and a color, with one project folder field left at no project", async () => {
  const slot = await mount();
  const dialog = await openCreate(slot);
  expect(within(dialog).getAllByRole("textbox")).toHaveLength(1);
  expect((within(dialog).getByRole("textbox", { name: "Bot name" }) as HTMLInputElement).placeholder).toBe("Name your bot");
  expect(within(dialog).queryAllByRole("tab")).toHaveLength(0);
  expect(within(dialog).getAllByRole("combobox")).toHaveLength(1);
  expect(folderControl(dialog).textContent).toBe("No project folder");
  expect(within(dialog).getByText("The bot works in your personal workspace.")).toBeTruthy();
  expect(within(dialog).queryByRole("group", { name: "New project folder" })).toBeNull();
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
  selectOption(folderControl(dialog), "Shared project");
  expect(folderControl(dialog).textContent).toBe("Shared project");
  expect(within(dialog).getByText("Owned by Owner bot. This bot joins as a member.")).toBeTruthy();
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
  await waitFor(() => expect(created(slot)).toHaveLength(1));
  expect(created(slot)[0]!.input).toMatchObject({ hostId: "online", linkedProjectIds: ["project"], ownedProjectIds: [], defaultProjectId: "project" });
  expect(calls(slot, "project_create")).toHaveLength(0);
});

it("returns to no project after picking one", async () => {
  const slot = await mount();
  const dialog = await openCreate(slot);
  selectOption(folderControl(dialog), "Shared project");
  selectOption(folderControl(dialog), "No project folder");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
  await waitFor(() => expect(created(slot)).toHaveLength(1));
  expect(created(slot)[0]!.input).toMatchObject({ linkedProjectIds: [], ownedProjectIds: [], defaultProjectId: null });
});

it("creates a project for a chosen folder only on Create, then links it as owner and default", async () => {
  const slot = await mount();
  const dialog = await openCreate(slot);
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  const step = await chooseFolder(dialog);
  expect((within(step).getByRole("textbox", { name: "Project name" }) as HTMLInputElement).value).toBe("Scout");
  expect((within(step).getByRole("textbox", { name: "Project folder" }) as HTMLInputElement).value).toBe("/work");
  expect(within(step).getByRole("combobox", { name: "Project machine" }).textContent).toBe("Online");
  expect((within(dialog).getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(step).getByRole("button", { name: "Set project folder" }));
  expect(folderControl(dialog).textContent).toBe("Scout (new project)");
  expect(within(dialog).getByText("Creates a project in /work when you create the bot.")).toBeTruthy();
  expect(calls(slot, "project_browse").map((call) => call.input)).toEqual([{ hostId: "online" }, { hostId: "online", path: "/work" }]);
  expect(calls(slot, "project_create")).toHaveLength(0);
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
  await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
  expect(calls(slot, "project_create").map((call) => call.input)).toEqual([expect.objectContaining({ name: "Scout", hostId: "online", path: "/work" })]);
  expect(created(slot)).toHaveLength(1);
  expect(created(slot)[0]!.input).toMatchObject({ hostId: "online", linkedProjectIds: ["folder-1"], ownedProjectIds: ["folder-1"], defaultProjectId: "folder-1" });
});

it("creates no project when the dialog is cancelled after choosing a folder", async () => {
  const slot = await mount();
  const dialog = await openCreate(slot);
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  fireEvent.click(within(await chooseFolder(dialog)).getByRole("button", { name: "Set project folder" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(slot.queryByRole("dialog")).toBeNull();
  expect(calls(slot, "project_create")).toHaveLength(0);
  expect(created(slot)).toHaveLength(0);
});

it("keeps the previous choice when the folder step is cancelled", async () => {
  const slot = await mount();
  const dialog = await openCreate(slot);
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  selectOption(folderControl(dialog), "Shared project");
  const step = await chooseFolder(dialog);
  fireEvent.click(within(step).getByRole("button", { name: "Cancel" }));
  expect(folderControl(dialog).textContent).toBe("Shared project");
  expect((within(dialog).getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(false);
});

it("reuses the created folder project when saving the bot fails and is retried", async () => {
  const slot = await mount({ createFailures: 1 });
  const dialog = await openCreate(slot);
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  fireEvent.click(within(await chooseFolder(dialog)).getByRole("button", { name: "Set project folder" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
  expect((await within(dialog).findByRole("alert")).textContent).toBe("Could not save the bot");
  expect(folderControl(dialog).textContent).toBe("Scout");
  expect(within(dialog).getByText("“Scout” is already created and stays if you cancel.")).toBeTruthy();
  selectOption(folderControl(dialog), "Shared project");
  selectOption(folderControl(dialog), "Scout");
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
  await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
  expect(calls(slot, "project_create")).toHaveLength(1);
  expect(created(slot)).toHaveLength(2);
  expect(created(slot)[1]!.input).toMatchObject({ linkedProjectIds: ["folder-1"], ownedProjectIds: ["folder-1"], defaultProjectId: "folder-1" });
});

it("does not create the bot when the folder project cannot be created, and retries the same request", async () => {
  const slot = await mount({ projectFailures: 1 });
  const dialog = await openCreate(slot);
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  fireEvent.click(within(await chooseFolder(dialog)).getByRole("button", { name: "Set project folder" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
  expect((await within(dialog).findByRole("alert")).textContent).toBe("This folder is already registered as “Other”. Choose a different folder.");
  expect(created(slot)).toHaveLength(0);
  expect(folderControl(dialog).textContent).toBe("Scout (new project)");
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
  await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
  const requests = calls(slot, "project_create").map((call) => (call.input as { requestId: string }).requestId);
  expect(requests).toHaveLength(2);
  expect(requests[0]).toBe(requests[1]);
  expect(created(slot)).toHaveLength(1);
});

it("offers existing projects but no folder choice when no machine is connected", async () => {
  HTMLElement.prototype.scrollIntoView ??= () => {};
  const slot = await mount({ hosts: [{ id: "first", name: "First", connected: false }] });
  const dialog = await openCreate(slot);
  fireEvent.keyDown(folderControl(dialog), { key: "ArrowDown" });
  const folder = within(document.body).getByRole("option", { name: "Choose a folder… (no machine connected)" });
  expect(folder.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(within(document.body).getByRole("option", { name: "Shared project" }));
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Scout" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
  await waitFor(() => expect(created(slot)).toHaveLength(1));
  expect(created(slot)[0]!.input).toMatchObject({ hostId: "first", linkedProjectIds: ["project"], defaultProjectId: "project" });
  expect(calls(slot, "project_browse")).toHaveLength(0);
});
