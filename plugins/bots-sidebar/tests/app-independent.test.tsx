// @vitest-environment jsdom
import { createElement } from "react";
import type { NewThreadComposerProps } from "@get-bb/plugin-sdk/app";
import { rpcContract, type BotMetadata } from "../contract";
import { openConversationPanel } from "./open-conversation-panel";
import { selectOption } from "./select-helper";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { bot, personalEnvironment, personalProjectId, request, thread } from "./fixtures";

const personalRequest = { ...request, projectId: personalProjectId, environment: personalEnvironment };

// Keep the SDK's host-composer test component. Capture its public boundary so
// tests can also submit the choices a real host composer lets the user change.
const composer = vi.hoisted(() => ({ props: null as NewThreadComposerProps | null }));
vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => {
  const sdk = await importOriginal<typeof import("@get-bb/plugin-sdk/app")>();
  return { ...sdk, experimental_NewThreadComposer: (props: NewThreadComposerProps) => {
    composer.props = props;
    return createElement(sdk.experimental_NewThreadComposer, props);
  } };
});
const app = await loadPluginApp(() => import("../app"));
afterEach(async () => {
  cleanup(); composer.props = null;
  await new Promise(resolve => setTimeout(resolve, 0));
});

type Binding = { botId: string; threadId: string };
async function mount({
  bots = [bot], rows = [thread("main", 100)], bindings = [{ botId: bot.id, threadId: "main" }], activeThreadId = "main", warnings = [], prepareFailures = 0, preparedMainThreadId, projectOwners = [], beforeList,
}: { bots?: BotMetadata[]; rows?: ReturnType<typeof thread>[]; bindings?: Binding[]; activeThreadId?: string | null; warnings?: string[]; prepareFailures?: number; preparedMainThreadId?: string; projectOwners?: Array<{ projectId: string; botId: string }>; beforeList?: () => Promise<void> } = {}) {
  const onNavigate = vi.fn();
  const sidebarProps = { activeThreadId, activeProjectId: "project", isCompactViewport: false, onNavigate, searchQuery: "" };
  const slot = renderSlot(app.threadLists[0]!, sidebarProps, {
    sidebarThreads: { projects: [
      { id: "project", name: "Shared project", isPersonal: false, href: "/projects/project", settingsHref: "/projects/project/settings" },
      { id: "second", name: "Second project", isPersonal: false , href: "/projects/project", settingsHref: "/projects/project/settings" },
      { id: "unrelated", name: "Brand new unrelated project", isPersonal: false , href: "/projects/project", settingsHref: "/projects/project/settings" },
      { id: "legacy-project", name: "Legacy backing project", isPersonal: false , href: "/projects/project", settingsHref: "/projects/project/settings" },
    ], threads: rows },
    rpc: {
      bots_list: async () => { await beforeList?.(); return rpcContract.bots_list.output.parse({ bots: [...bots], hosts: [{ id: "host", name: "Local", connected: true }, { id: "remote", name: "Remote", connected: true }], sections: [], projects: [{ id: "project", name: "Shared project" }, { id: "second", name: "Second project" }, { id: "unrelated", name: "Brand new unrelated project" }], threadBindings: [...bindings], warnings, personalProjectId, projectOwners }); },
      bot_prepare: (raw) => {
        const { botId } = rpcContract.bot_prepare.input.parse(raw);
        if (prepareFailures-- > 0) throw new Error("Private state temporarily unavailable");
        const index = bots.findIndex((bot) => bot.id === botId);
        bots[index] = { ...bots[index]!, stateReady: true, ...(preparedMainThreadId ? { mainThreadId: preparedMainThreadId } : {}) };
        return rpcContract.bot_prepare.output.parse(bots[index]);
      },
      bot_create: (raw) => {
        const input = rpcContract.bot_create.input.parse(raw);
        const created = rpcContract.bot_create.output.parse({ ...bot, name: input.name, role: input.role, avatar: input.avatar, sectionId: input.sectionId, linkedProjectIds: input.linkedProjectIds, soul: input.soul, hostId: input.hostId, id: "created", mainThreadId: null, stateReady: true, legacyHomeProjectId: null });
        bots.push(created); return created;
      },
      conversation_assign: (raw) => { bindings.push(rpcContract.conversation_assign.input.parse(raw)); return { ok: true }; },
      conversation_create: (raw) => {
        const input = rpcContract.conversation_create.input.parse(raw);
        if (input.makeMain) {
          const index = bots.findIndex((bot) => bot.id === input.botId);
          bots[index] = { ...bots[index]!, mainThreadId: "created-conversation" };
        }
        bindings.push({ botId: input.botId, threadId: "created-conversation" });
        return { threadId: "created-conversation" };
      },
      visibility_set: () => bot,
    },
  });
  await waitFor(() => expect(screen.queryByText("Loading bots…")).toBeNull());
  for (const toggle of screen.queryAllByRole("button", { name: /^Expand conversations for / })) fireEvent.click(toggle);
  if (rows.some(row => !bindings.some(binding => binding.threadId === row.id) && !row.parentThreadId)) await screen.findByRole("region", { name: "Chats" });
  return { slot: Object.assign(slot, { sidebar: createElement(app.threadLists[0]!.component, sidebarProps) }), onNavigate };
}

async function menu(slot: Awaited<ReturnType<typeof mount>>["slot"], botName: string, item: string) {
  fireEvent.contextMenu(screen.getByText(botName));
  fireEvent.click(await screen.findByRole("menuitem", { name: item }));
}

async function createFromMenu(slot: Awaited<ReturnType<typeof mount>>["slot"], kind: "Bot" | "Section" | "Project") {
  fireEvent.keyDown(screen.getByRole("button", { name: "Create…" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("menuitem", { name: kind }));
}

describe("independent bot identities", () => {
  it("keeps two bots sharing one project separate and leaves unassigned project chats in Chats", async () => {
    const second = { ...bot, id: "second-bot", name: "Second bot", mainThreadId: "second-main" };
    const { slot } = await mount({ bots: [bot, second], rows: [
      thread("main", 100), thread("first-root", 99), thread("first-child", 98, { parentThreadId: "first-root" }),
      thread("second-main", 97), thread("second-root", 96),
      thread("explicit-override", 95, { parentThreadId: "first-root" }),
      thread("unassigned-project", 94), thread("unassigned-unrelated", 93, { projectId: "unrelated" }),
    ], bindings: [
      { botId: bot.id, threadId: "main" }, { botId: bot.id, threadId: "first-root" },
      { botId: second.id, threadId: "second-main" }, { botId: second.id, threadId: "second-root" }, { botId: second.id, threadId: "explicit-override" },
    ], activeThreadId: "first-child" });
    const firstGroup = screen.getByText(bot.name).closest<HTMLElement>(".project-group")!;
    const secondGroup = screen.getByText(second.name).closest<HTMLElement>(".project-group")!;
    expect(within(firstGroup).getByText("Conversation first-child")).toBeTruthy();
    expect(within(firstGroup).queryByText("Conversation second-root")).toBeNull();
    expect(within(firstGroup).queryByText("Conversation explicit-override")).toBeNull();
    expect(screen.queryByText("Brand new unrelated project")).toBeNull();
    expect(screen.queryByText("Legacy backing project")).toBeNull();
    expect(secondGroup.querySelector('[aria-current="page"]')).toBeNull();
    // Both bot lists were explicitly expanded in the fixture.
    expect(within(secondGroup).getByText("Conversation second-root")).toBeTruthy();
    expect(within(secondGroup).getByText("Conversation explicit-override")).toBeTruthy();
    expect(within(secondGroup).queryByText("Conversation first-root")).toBeNull();
    for (const id of ["unassigned-project", "unassigned-unrelated"]) {
      expect(document.querySelector(`[data-sidebar-thread-id="${id}"]`)?.closest(".recent-row")).not.toBeNull();
    }
    expect(document.querySelector('.recent-row [data-sidebar-thread-id="first-root"]')).toBeNull();
    expect(slot.inspection.rpcCalls.some((call) => call.method === "main_set")).toBe(false);
  });

  it.each(["empty", "missing", "archived"])("opens the %s bot coordinator in the main panel without a creation modal", async (kind) => {
    const { slot, onNavigate } = await mount({ rows: kind === "empty" ? [] : [thread("main", 100, { isArchived: kind === "archived" })], activeThreadId: null });
    fireEvent.click(screen.getByRole("button", { name: /^Test bot/ }));
    expect(slot.inspection.navigateCalls).toContainEqual({ method: "toPluginPanel", path: "coordinator", options: { subPath: bot.id } });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(slot.inspection.rpcCalls.some(call => call.method === "conversation_create")).toBe(false);
  });

  it("opens a visible saved coordinator through the host sidebar action", async () => {
    const { slot } = await mount({ bots: [{ ...bot, coordinatorThreadId: "main" }] });
    fireEvent.click(screen.getByRole("button", { name: /^Test bot/ }));
    expect(slot.inspection.sidebarActionCalls).toContainEqual({ method: "open", threadId: "main" });
    expect(slot.inspection.rpcCalls.some((call) => call.method === "bot_prepare")).toBe(false);
  });

  it("starts an ordinary conversation and preserves all composer execution/input choices", async () => {
    const { slot, onNavigate } = await mount();
    await menu(slot, bot.name, "New conversation…");
    await openConversationPanel(slot, "New conversation");
    expect(slot.inspection.rpcCalls.some((call) => call.method === "main_set" || call.method === "conversation_create")).toBe(false);
    expect(composer.props?.defaultProjectId).toBe(personalProjectId);
    expect(composer.props?.defaultEnvironment).toEqual(personalEnvironment);
    const chosen = { ...request, serviceTier: "fast" as const, sendAt: 1234567890 };
    await act(() => composer.props!.onSubmit(chosen));
    expect(slot.inspection.rpcCalls).toContainEqual({ method: "conversation_create", input: { botId: bot.id, request: chosen, makeMain: false } });
    expect(slot.inspection.navigateCalls).toContainEqual({ method: "toThread", threadId: "created-conversation" });
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(slot.inspection.rpcCalls.some((call) => call.method === "main_set")).toBe(false);
    await waitFor(() => expect(document.querySelector('.thread-row [data-sidebar-thread-id="main"]')).not.toBeNull());
  });

  it("defaults a normal bot chat to the personal workspace on its execution machine without replacing main", async () => {
    const { slot } = await mount({ bots: [{ ...bot, hostId: "remote" }] });
    await menu(slot, bot.name, "New conversation…");
    await openConversationPanel(slot, "New conversation");
    expect(composer.props?.defaultProjectId).toBe(personalProjectId);
    expect(composer.props?.defaultEnvironment).toEqual({ type: "host", hostId: "remote", workspace: { type: "personal" } });
    // The user can choose a different host in BB's composer; forward it as-is.
    await act(() => composer.props!.onSubmit(personalRequest));
    expect(slot.inspection.rpcCalls).toContainEqual({ method: "conversation_create", input: { botId: bot.id, request: personalRequest, makeMain: false } });
  });

  it.each(["project", "worktree"] as const)("opens the %s composer immediately with matching workspace defaults", async (kind) => {
    const { slot } = await mount({ bots: [{ ...bot, linkedProjectIds: ["project", "second"] }] });
    await menu(slot, bot.name, `New conversation in ${kind}…`);
    await openConversationPanel(slot, `New conversation in ${kind}`);
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(composer.props?.defaultProjectId).toBe("project");
    expect(composer.props?.defaultEnvironment).toEqual(kind === "project" ? { type: "host", hostId: "host", workspace: { type: "unmanaged", path: null } } : { type: "host", hostId: "host", workspace: { type: "managed-worktree", baseBranch: { kind: "default" } } });
    expect(composer.props?.defaultProviderId).toBe("codex");
    await act(() => composer.props!.onSubmit({ ...request, projectId: "second" }));
    expect(slot.inspection.rpcCalls).toContainEqual({ method: "conversation_create", input: { botId: bot.id, request: { ...request, projectId: "second" }, makeMain: false } });
  });

  it("lets the generic composer explicitly launch in any available work project without prior membership", async () => {
    const { slot } = await mount({ bots: [{ ...bot, linkedProjectIds: [] }] });
    await menu(slot, bot.name, "New conversation…");
    await openConversationPanel(slot, "New conversation");
    await act(() => composer.props!.onSubmit({ ...request, projectId: "unrelated" }));
    expect(slot.inspection.rpcCalls).toContainEqual({ method: "conversation_create", input: { botId: bot.id, request: { ...request, projectId: "unrelated" }, makeMain: false } });
  });

  it("seeds the first linked project while allowing another project in the native composer", async () => {
    const { slot } = await mount({ bots: [{ ...bot, linkedProjectIds: ["unrelated"] }] });
    await menu(slot, bot.name, "New conversation in project…");
    await openConversationPanel(slot, "New conversation in project");
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(composer.props?.defaultProjectId).toBe("unrelated");
    await act(() => composer.props!.onSubmit({ ...request, projectId: "second" }));
    expect(slot.inspection.rpcCalls).toContainEqual({ method: "conversation_create", input: { botId: bot.id, request: { ...request, projectId: "second" }, makeMain: false } });
  });


  it("creates with private state and no section, home or custom path control", async () => {
    const { slot } = await mount({ bots: [], bindings: [] });
    await createFromMenu(slot, "Bot");
    const dialog = await screen.findByRole("dialog", { name: "Create new bot" });
    expect(within(dialog).queryAllByRole("combobox")).toHaveLength(0);
    expect(within(dialog).getByRole("group", { name: "Project folder" }).textContent).toContain("No project folder");
    expect(within(dialog).queryByRole("textbox", { name: /folder|path|directory/i })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Use custom|Use automatic/ })).toBeNull();
    expect(dialog.textContent).not.toMatch(/~\/bots|Home folder|Working directory/);
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Research Buddy" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(slot.inspection.rpcCalls.some((call) => call.method === "bot_create")).toBe(true));
    const input = slot.inspection.rpcCalls.find((call) => call.method === "bot_create")?.input;
    expect(input).toMatchObject({ sectionId: null });
    expect(input).not.toHaveProperty("homePath");
  });

  it("creates a standalone bot with private state and uses the default machine only for execution", async () => {
    const { slot } = await mount({ bots: [], bindings: [] });
    await createFromMenu(slot, "Bot");
    const dialog = await screen.findByRole("dialog", { name: "Create new bot" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "New identity" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await openConversationPanel(slot, "New conversation");
    expect(slot.inspection.rpcCalls).toContainEqual({ method: "bot_create", input: expect.objectContaining({ name: "New identity", hostId: "host", linkedProjectIds: [], ownedProjectIds: [], soul: "" }) });
    expect(slot.inspection.rpcCalls.find((call) => call.method === "bot_create")?.input).not.toHaveProperty("homePath");
    expect(screen.queryByRole("heading", { name: "New identity" })).toBeNull();
    expect(slot.inspection.rpcCalls).toContainEqual({ method: "bot_prepare", input: { botId: "created" } });
    expect(composer.props?.defaultProjectId).toBe(personalProjectId);
    expect(composer.props?.defaultEnvironment).toEqual({ type: "host", hostId: "host", workspace: { type: "personal" } });
    expect(slot.inspection.rpcCalls.every((call) => ["bots_list", "bot_create", "bot_prepare"].includes(call.method))).toBe(true);
    expect(slot.inspection.sidebarActionCalls).toEqual([]);
  });

  it("retries private state preparation after creation without creating another identity", async () => {
    const { slot } = await mount({ bots: [], bindings: [], prepareFailures: 1 });
    await createFromMenu(slot, "Bot");
    const dialog = await screen.findByRole("dialog", { name: "Create new bot" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Bot name" }), { target: { value: "Retry bot" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await screen.findByText("Private state temporarily unavailable");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Retry bot")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Retry bot/ }));
    await waitFor(() => expect(slot.inspection.navigateCalls).toContainEqual({ method: "toPluginPanel", path: "coordinator", options: { subPath: "created" } }));
    expect(slot.inspection.rpcCalls.filter((call) => call.method === "bot_create")).toHaveLength(1);
    expect(slot.inspection.rpcCalls.filter((call) => call.method === "bot_prepare")).toEqual([
      { method: "bot_prepare", input: { botId: "created" } },
    ]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("offers all bots instead of filtering assignment by project membership", async () => {
    const { slot } = await mount({ bots: [bot, { ...bot, id: "unlinked", name: "Unlinked bot", linkedProjectIds: [] }, { ...bot, id: "legacy-owner", name: "Legacy owner", legacyHomeProjectId: "project", linkedProjectIds: [] }], rows: [thread("unassigned", 99)], bindings: [] });
    fireEvent.contextMenu(screen.getByText("Conversation unassigned"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Assign to bot…" }));
    const dialog = await screen.findByRole("dialog", { name: "Assign conversation to bot" });
    const chooser = within(dialog).getByRole("combobox", { name: "Bot" });
    expect((within(dialog).getByRole("button", { name: "Assign" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(chooser, { key: "ArrowDown" });
    expect(within(document.body).getAllByRole("option").map((option) => option.textContent)).toEqual([bot.name, "Unlinked bot", "Legacy owner"]);
    fireEvent.click(within(document.body).getByRole("option", { name: "Unlinked bot" }));
    expect((within(dialog).getByRole("button", { name: "Assign" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("allows an unlinked bot for a project-associated conversation without a link-first requirement", async () => {
    const { slot } = await mount({ rows: [thread("unassigned", 99, { projectId: "unrelated" })], bindings: [] });
    fireEvent.contextMenu(screen.getByText("Conversation unassigned"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Assign to bot…" }));
    const dialog = await screen.findByRole("dialog", { name: "Assign conversation to bot" });
    expect(within(dialog).queryByText(/No eligible bots|link this conversation’s project in Edit bot first/)).toBeNull();
    expect((within(dialog).getByRole("button", { name: "Assign" }) as HTMLButtonElement).disabled).toBe(false);
    expect(within(dialog).getByRole("combobox", { name: "Bot" })).toBeTruthy();
    expect(slot.inspection.rpcCalls.some(call => call.method === "conversation_assign")).toBe(false);
  });

  it("only asks to create a bot when there are genuinely no bots", async () => {
    const { slot } = await mount({ bots: [], rows: [thread("unassigned", 99)], bindings: [] });
    fireEvent.contextMenu(screen.getByText("Conversation unassigned"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Assign to bot…" }));
    const dialog = await screen.findByRole("dialog", { name: "Assign conversation to bot" });
    expect(within(dialog).getByText("No bots yet. Create a bot first.")).toBeTruthy();
    expect(within(dialog).queryByRole("combobox")).toBeNull();
    expect((within(dialog).getByRole("button", { name: "Assign" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("assigns an existing project conversation to a bot and removes it and inherited children from Chats", async () => {
    const { slot } = await mount({ rows: [thread("main", 100), thread("unassigned", 99), thread("child", 98, { parentThreadId: "unassigned" })], activeThreadId: "unassigned" });
    fireEvent.contextMenu(screen.getByText("Conversation unassigned"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Assign to bot…" }));
    const dialog = await screen.findByRole("dialog", { name: "Assign conversation to bot" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(slot.inspection.rpcCalls).toContainEqual({ method: "conversation_assign", input: { botId: bot.id, threadId: "unassigned" } });
    await waitFor(() => expect(document.querySelector('.thread-row [data-sidebar-thread-id="unassigned"]')).not.toBeNull());
    expect(document.querySelector('.recent-row [data-sidebar-thread-id="unassigned"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand children of Conversation unassigned" }));
    expect(document.querySelector('.thread-row [data-sidebar-thread-id="child"]')).not.toBeNull();
    expect(document.querySelector('.recent-row [data-sidebar-thread-id="child"]')).toBeNull();
    expect(slot.inspection.rpcCalls.some((call) => call.method === "main_set")).toBe(false);
  });

  it("does not wake a hidden bot from another bot’s activity in the shared project", async () => {
    const hidden = { ...bot, id: "hidden", name: "Hidden identity", mainThreadId: null, hiddenUntilActivity: true, hiddenAt: 10 };
    const { slot } = await mount({ bots: [bot, hidden], rows: [thread("main", 1000)] });
    expect(screen.getByRole("button", { name: "1 hidden" })).toBeTruthy();
    expect(slot.inspection.rpcCalls.some((call) => call.method === "visibility_set")).toBe(false);
  });

  it("never infers ownership or hidden-bot activity from the shared personal project or a legacy project", async () => {
    const legacy = { ...bot, legacyHomeProjectId: "legacy-project" };
    const hidden = { ...bot, id: "hidden", name: "Hidden identity", mainThreadId: null, linkedProjectIds: [], hiddenUntilActivity: true, hiddenAt: 10 };
    const { slot } = await mount({ bots: [legacy, hidden], rows: [
      thread("main", 1000, { projectId: personalProjectId }),
      thread("personal-unassigned", 1001, { projectId: personalProjectId }),
      thread("legacy-unassigned", 1002, { projectId: "legacy-project" }),
    ] });
    for (const id of ["personal-unassigned", "legacy-unassigned"]) {
      expect(document.querySelector(`[data-sidebar-thread-id="${id}"]`)?.closest(".recent-row")).not.toBeNull();
    }
    expect(screen.getByRole("button", { name: "1 hidden" })).toBeTruthy();
    expect(slot.inspection.rpcCalls.some((call) => call.method === "visibility_set" || call.method === "conversation_assign")).toBe(false);
  });

  it("offers every bot for explicit personal-chat assignment without claiming it beforehand", async () => {
    const unlinked = { ...bot, id: "unlinked", name: "Unlinked bot", linkedProjectIds: [], mainThreadId: null };
    const { slot } = await mount({ bots: [bot, unlinked], rows: [thread("personal-chat", 99, { projectId: personalProjectId })], bindings: [], activeThreadId: "personal-chat" });
    expect(document.querySelector('.recent-row [data-sidebar-thread-id="personal-chat"]')).not.toBeNull();
    fireEvent.contextMenu(screen.getByText("Conversation personal-chat"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Assign to bot…" }));
    const dialog = await screen.findByRole("dialog", { name: "Assign conversation to bot" });
    const chooser = within(dialog).getByRole("combobox", { name: "Bot" });
    fireEvent.keyDown(chooser, { key: "ArrowDown" });
    expect(within(document.body).getAllByRole("option").map((option) => option.textContent)).toEqual([bot.name, unlinked.name]);
    fireEvent.click(within(document.body).getByRole("option", { name: unlinked.name }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(slot.inspection.rpcCalls).toContainEqual({ method: "conversation_assign", input: { botId: unlinked.id, threadId: "personal-chat" } });
    await waitFor(() => expect(document.querySelector('.thread-row [data-sidebar-thread-id="personal-chat"]')).not.toBeNull());
  });

  it("preserves legacy history and opens a separate coordinator before a fresh conversation", async () => {
    const legacy = { ...bot, legacyHomeProjectId: "legacy-project" };
    const { slot } = await mount({ bots: [legacy], rows: [thread("main", 100, { projectId: "legacy-project" })] });
    fireEvent.click(screen.getByRole("button", { name: /^Test bot/ }));
    expect(slot.inspection.navigateCalls).toContainEqual({ method: "toPluginPanel", path: "coordinator", options: { subPath: bot.id } });
    expect(slot.inspection.sidebarActionCalls).toEqual([]);
    await menu(slot, bot.name, "New conversation…");
    await openConversationPanel(slot, "New conversation");
    expect(composer.props?.defaultProjectId).toBe(personalProjectId);
    expect(composer.props?.defaultEnvironment).toEqual(personalEnvironment);
    await act(async () => { await expect(composer.props!.onSubmit({ ...request, projectId: "legacy-project" })).rejects.toThrow("Choose no project or an available work project"); });
    expect(slot.inspection.rpcCalls.some((call) => call.method === "conversation_create")).toBe(false);
    await act(() => composer.props!.onSubmit(personalRequest));
    expect(slot.inspection.rpcCalls).toContainEqual({ method: "conversation_create", input: { botId: bot.id, request: personalRequest, makeMain: false } });
    await waitFor(() => expect(document.querySelector('.thread-row [data-sidebar-thread-id="main"]')).not.toBeNull());
    expect(slot.inspection.rpcCalls.some((call) => call.method === "main_set")).toBe(false);
  });

  it("accepts the personal project selected from a linked-worktree composer unchanged", async () => {
    const { slot } = await mount();
    await menu(slot, bot.name, "New conversation in worktree…");
    await openConversationPanel(slot, "New conversation in worktree");
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    const chosen = { ...personalRequest, environment: { type: "host" as const, hostId: "remote", workspace: { type: "personal" as const } } };
    await act(() => composer.props!.onSubmit(chosen));
    expect(slot.inspection.rpcCalls).toContainEqual({ method: "conversation_create", input: { botId: bot.id, request: chosen, makeMain: false } });
  });




  it("does not reuse a personal or legacy-home worktree", async () => {
    const { slot } = await mount({
      bots: [{ ...bot, legacyHomeProjectId: "legacy-project" }],
      rows: [thread("main", 100), thread("personal-topic", 99, { projectId: personalProjectId })],
      bindings: [{ botId: bot.id, threadId: "main" }, { botId: bot.id, threadId: "personal-topic" }],
    });
    fireEvent.contextMenu(screen.getByText("Conversation personal-topic"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "New conversation in worktree…" }));
    const dialog = await openConversationPanel(slot, "New conversation in worktree");
    expect(within(dialog).queryByText("Start in a fresh worktree. Choose the branch and harness before sending.")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Continue" })).toBeNull();
    expect(composer.props?.defaultProjectId).toBe("project");
    expect(composer.props?.defaultEnvironment).toEqual({ type: "host", hostId: "host", workspace: { type: "managed-worktree", baseBranch: { kind: "default" } } });
  });

  it("surfaces backend warnings without turning projects into bots", async () => {
    const { slot } = await mount({ warnings: ["A legacy bot needs attention."] });
    expect(screen.getByRole("status").textContent).toBe("A legacy bot needs attention.");
    expect(document.querySelectorAll(".project-group")).toHaveLength(1);
  });
});
