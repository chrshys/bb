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
async function mount({ hosts = [{ id: "offline", name: "Offline", connected: false }, { id: "online", name: "Online", connected: true }], existing = [], createFailures = 0 }: { hosts?: Host[]; existing?: BotMetadata[]; createFailures?: number } = {}) {
  const bots = [...existing];
  const slot = renderSlot(app.threadLists[0]!, { activeThreadId: null, activeProjectId: null, isCompactViewport: false, onNavigate: vi.fn(), searchQuery: "" }, {
    sidebarThreads: { projects: [], threads: [] },
    rpc: {
      bots_list: () => ({ bots, hosts, sections: [{ id: "team", name: "Team", order: 0 }], projects: [{ id: "project", name: "Shared project" }], personalProjectId, warnings: [], threadBindings: [], projectOwners: [] }),
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
const created = (slot: Awaited<ReturnType<typeof mount>>) => slot.inspection.rpcCalls.filter((call) => call.method === "bot_create");

it("asks only for a name, a shape and a color", async () => {
  const slot = await mount();
  const dialog = await openCreate(slot);
  expect(within(dialog).getAllByRole("textbox")).toHaveLength(1);
  expect((within(dialog).getByRole("textbox", { name: "Bot name" }) as HTMLInputElement).placeholder).toBe("Name your bot");
  expect(within(dialog).queryAllByRole("tab")).toHaveLength(0);
  expect(within(dialog).queryAllByRole("combobox")).toHaveLength(0);
  expect(dialog.querySelector("textarea, select, input[type=color]")).toBeNull();
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
  expect(slot.inspection.navigateCalls).toEqual([{ method: "toPluginPanel", path: "coordinator", options: { subPath: bot.id } }]);
  expect(slot.queryByRole("dialog")).toBeNull();
  expect(created(slot)).toHaveLength(0);
});
