// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { selectOption } from "./select-helper";
import { mountBotPanel, panelBackend, resetPanelState, sha, writes } from "./bot-panel-fixture";

afterEach(() => { cleanup(); resetPanelState(); vi.useRealTimers(); });

type Slot = Awaited<ReturnType<typeof mountBotPanel>>;
const box = <T extends HTMLElement = HTMLTextAreaElement>(slot: Slot, name: string) => slot.getByRole("textbox", { name }) as T;
const card = (slot: Slot, name: string) => within(slot.getByRole("group", { name }));
const saveState = (slot: Slot) => slot.container.querySelector("[data-save-state]")!.getAttribute("data-save-state");
async function edit(slot: Slot, name: string, value: string) {
  fireEvent.change(box(slot, name), { target: { value } });
  await act(async () => { fireEvent.blur(box(slot, name)); });
}

it("shows the bot named by the tab, with the avatar and name above grouped cards", async () => {
  const backend = panelBackend([{ name: "First" }, { name: "Second", role: "Reviewer", soul: "Second soul", memory: "- Second fact.\n", settings: { style: "concise" } }]);
  const slot = await mountBotPanel(backend, { botId: "bot-2" });
  expect(box<HTMLInputElement>(slot, "Bot name").value).toBe("Second");
  expect(box<HTMLInputElement>(slot, "Role").value).toBe("Reviewer");
  expect(box(slot, "SOUL.md").value).toBe("Second soul");
  expect(box(slot, "MEMORY.md").value).toBe("- Second fact.\n");
  expect(JSON.parse(box(slot, "settings.json").value)).toEqual({ style: "concise" });
  expect(slot.getByRole("img", { name: "Bot avatar" }).getAttribute("width")).toBe("96");
  expect(slot.getAllByRole("group").filter((group) => group.hasAttribute("data-bot-panel-section")).map((group) => group.getAttribute("data-bot-panel-section"))).toEqual(["appearance", "setup", "instructions", "memory", "settings", "projects"]);
  expect(slot.queryByRole("dialog")).toBeNull();
  expect(slot.queryByRole("button", { name: /Save bot|Cancel$/ })).toBeNull();
  expect(slot.queryByText("AGENTS.md")).toBeNull();
  expect(writes(slot)).toEqual([]);
});

it("saves a renamed bot as that one field, guarded by the value it was edited from", async () => {
  const backend = panelBackend([{ name: "Atlas", soul: "Keep me", memory: "- Fact.\n" }]);
  const slot = await mountBotPanel(backend);
  fireEvent.change(box(slot, "Bot name"), { target: { value: "  Atlas Prime " } });
  expect(writes(slot)).toEqual([]);
  expect(saveState(slot)).toBe("unsaved");
  fireEvent.keyDown(box(slot, "Bot name"), { key: "Enter" });
  await act(async () => { fireEvent.blur(box(slot, "Bot name")); });
  await waitFor(() => expect(saveState(slot)).toBe("saved"));
  expect(writes(slot)).toEqual([{ method: "bot_patch", input: { botId: "bot", expected: { name: "Atlas" }, changes: { name: "Atlas Prime" } } }]);
  expect(box<HTMLInputElement>(slot, "Bot name").value).toBe("Atlas Prime");
  expect(backend.bot()).toMatchObject({ name: "Atlas Prime", soul: "Keep me", memory: "- Fact.\n" });
});

it("restores the name instead of saving an empty one, and Escape abandons a draft", async () => {
  const backend = panelBackend([{ name: "Atlas" }]);
  const slot = await mountBotPanel(backend);
  await edit(slot, "Bot name", "   ");
  expect(box<HTMLInputElement>(slot, "Bot name").value).toBe("Atlas");
  fireEvent.change(box(slot, "Role"), { target: { value: "Changed" } });
  fireEvent.keyDown(box(slot, "Role"), { key: "Escape" });
  expect(box<HTMLInputElement>(slot, "Role").value).toBe("Assistant");
  expect(writes(slot)).toEqual([]);
});

it("saves each document on its own with the hash it was loaded with and accepts newlines", async () => {
  const backend = panelBackend([{ soul: "Old soul", memory: "- Old.\n" }]);
  const slot = await mountBotPanel(backend);
  expect(fireEvent.keyDown(box(slot, "SOUL.md"), { key: "Enter" })).toBe(true);
  await edit(slot, "SOUL.md", "First line\nSecond line");
  await waitFor(() => expect(saveState(slot)).toBe("saved"));
  await edit(slot, "MEMORY.md", "- New.\n");
  await waitFor(() => expect(writes(slot)).toHaveLength(2));
  expect(writes(slot)).toEqual([
    { method: "state_update", input: { botId: "bot", file: "SOUL.md", content: "First line\nSecond line", expectedSha256: sha("Old soul") } },
    { method: "state_update", input: { botId: "bot", file: "MEMORY.md", content: "- New.\n", expectedSha256: sha("- Old.\n") } },
  ]);
  expect(backend.bot()).toMatchObject({ soul: "First line\nSecond line", memory: "- New.\n" });
});

it("autosaves instructions shortly after typing stops, without waiting for blur", async () => {
  const backend = panelBackend([{ soul: "" }]);
  const slot = await mountBotPanel(backend);
  vi.useFakeTimers();
  fireEvent.change(box(slot, "SOUL.md"), { target: { value: "Typed" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(writes(slot)).toEqual([]);
  fireEvent.change(box(slot, "SOUL.md"), { target: { value: "Typed more" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
  expect(writes(slot)).toEqual([{ method: "state_update", input: expect.objectContaining({ file: "SOUL.md", content: "Typed more" }) }]);
});

it("follows a change the agent makes while nothing is being edited", async () => {
  const backend = panelBackend([{ memory: "- Before.\n" }]);
  const slot = await mountBotPanel(backend);
  backend.agentChange("bot", { memory: "- Before.\n- Learned by the agent.\n" });
  await slot.behavior.emitRealtime("project-bots-changed", {});
  await waitFor(() => expect(box(slot, "MEMORY.md").value).toBe("- Before.\n- Learned by the agent.\n"));
  expect(slot.queryByRole("alert")).toBeNull();
  expect(writes(slot)).toEqual([]);
});

it("keeps a draft and refuses to overwrite memory the agent changed in the meantime", async () => {
  const backend = panelBackend([{ memory: "- Before.\n" }]);
  const slot = await mountBotPanel(backend);
  fireEvent.change(box(slot, "MEMORY.md"), { target: { value: "- My rewrite.\n" } });
  backend.agentChange("bot", { memory: "- Before.\n- Agent fact.\n" });
  await slot.behavior.emitRealtime("project-bots-changed", {});
  const notice = await card(slot, "Memory").findByRole("alert");
  expect(notice.textContent).toContain("MEMORY.md was changed elsewhere");
  expect(notice.textContent).toContain("- Agent fact.");
  await act(async () => { fireEvent.blur(box(slot, "MEMORY.md")); });
  expect(writes(slot)).toEqual([]);
  expect(box(slot, "MEMORY.md").value).toBe("- My rewrite.\n");
  expect(backend.bot().memory).toBe("- Before.\n- Agent fact.\n");
  expect(saveState(slot)).toBe("attention");
  fireEvent.click(within(notice).getByRole("button", { name: "Use latest" }));
  expect(box(slot, "MEMORY.md").value).toBe("- Before.\n- Agent fact.\n");
  expect(card(slot, "Memory").queryByRole("alert")).toBeNull();
  expect(writes(slot)).toEqual([]);
});

it("surfaces a conflict when the save races the agent, then saves over the version the user has now seen", async () => {
  const backend = panelBackend([{ memory: "- Before.\n" }]);
  const slot = await mountBotPanel(backend);
  fireEvent.change(box(slot, "MEMORY.md"), { target: { value: "- My rewrite.\n" } });
  backend.agentChange("bot", { memory: "- Agent fact.\n" });
  await act(async () => { fireEvent.blur(box(slot, "MEMORY.md")); });
  const notice = await card(slot, "Memory").findByRole("alert");
  await waitFor(() => expect(notice.textContent).toContain("- Agent fact."));
  expect(writes(slot)).toEqual([{ method: "state_update", input: expect.objectContaining({ file: "MEMORY.md", expectedSha256: sha("- Before.\n") }) }]);
  expect(backend.bot().memory).toBe("- Agent fact.\n");
  expect(box(slot, "MEMORY.md").value).toBe("- My rewrite.\n");
  fireEvent.click(within(card(slot, "Memory").getByRole("alert")).getByRole("button", { name: "Keep mine" }));
  await waitFor(() => expect(backend.bot().memory).toBe("- My rewrite.\n"));
  expect(writes(slot)[1]).toEqual({ method: "state_update", input: { botId: "bot", file: "MEMORY.md", content: "- My rewrite.\n", expectedSha256: sha("- Agent fact.\n") } });
  await waitFor(() => expect(card(slot, "Memory").queryByRole("alert")).toBeNull());
});

it("does not overwrite a name that changed elsewhere while it was being retyped", async () => {
  const backend = panelBackend([{ name: "Atlas" }]);
  const slot = await mountBotPanel(backend);
  fireEvent.change(box(slot, "Bot name"), { target: { value: "Mine" } });
  backend.agentChange("bot", { name: "Theirs" });
  await act(async () => { fireEvent.blur(box(slot, "Bot name")); });
  const notice = await slot.findByRole("alert");
  await waitFor(() => expect(notice.textContent).toContain("Latest: Theirs"));
  expect(backend.bot().name).toBe("Theirs");
  expect(box<HTMLInputElement>(slot, "Bot name").value).toBe("Mine");
});

it("is unaffected by unrelated changes to the same bot", async () => {
  const backend = panelBackend([{ name: "Atlas", memory: "- Before.\n" }]);
  const slot = await mountBotPanel(backend);
  fireEvent.change(box(slot, "Bot name"), { target: { value: "Renamed" } });
  backend.agentChange("bot", { memory: "- Agent fact.\n", threadOrder: ["a", "b"] });
  await slot.behavior.emitRealtime("project-bots-changed", {});
  await act(async () => { fireEvent.blur(box(slot, "Bot name")); });
  await waitFor(() => expect(backend.bot().name).toBe("Renamed"));
  expect(backend.bot().memory).toBe("- Agent fact.\n");
  expect(slot.queryByRole("alert")).toBeNull();
});

it("saves an edit when the tab is switched away mid-typing", async () => {
  const backend = panelBackend([{ soul: "Old" }]);
  const slot = await mountBotPanel(backend);
  fireEvent.change(box(slot, "SOUL.md"), { target: { value: "Typed then switched tabs" } });
  expect(writes(slot)).toEqual([]);
  slot.unmount();
  await waitFor(() => expect(backend.bot().soul).toBe("Typed then switched tabs"));
  const again = await mountBotPanel(backend);
  expect(box(again, "SOUL.md").value).toBe("Typed then switched tabs");
  expect(again.queryByRole("alert")).toBeNull();
});

it("keeps a draft that could not be saved across a remount", async () => {
  const backend = panelBackend([{ settings: { style: "concise" }, memory: "- Before.\n" }]);
  const slot = await mountBotPanel(backend);
  fireEvent.change(box(slot, "settings.json"), { target: { value: '{"style":' } });
  fireEvent.change(box(slot, "MEMORY.md"), { target: { value: "- Conflicting draft.\n" } });
  backend.agentChange("bot", { memory: "- Agent fact.\n" });
  await slot.behavior.emitRealtime("project-bots-changed", {});
  await card(slot, "Memory").findByRole("alert");
  slot.unmount();
  const again = await mountBotPanel(backend);
  expect(box(again, "settings.json").value).toBe('{"style":');
  expect(box(again, "MEMORY.md").value).toBe("- Conflicting draft.\n");
  expect((await card(again, "Memory").findByRole("alert")).textContent).toContain("changed elsewhere");
  expect((await card(again, "Settings").findByRole("alert")).textContent).toContain("valid JSON");
  expect(backend.bot()).toMatchObject({ settings: { style: "concise" }, memory: "- Agent fact.\n" });
});

it.each(["{", "[]", "null", "4", '{"limit":1e400}'])("retains invalid settings %s without saving anything", async (invalid) => {
  const backend = panelBackend([{ settings: { keep: true } }]);
  const slot = await mountBotPanel(backend);
  await edit(slot, "settings.json", invalid);
  expect((await card(slot, "Settings").findByRole("alert")).textContent).toMatch(/valid JSON|JSON object/);
  expect(box(slot, "settings.json").value).toBe(invalid);
  expect(writes(slot)).toEqual([]);
  await edit(slot, "settings.json", '{"fixed":true}');
  await waitFor(() => expect(backend.bot().settings).toEqual({ fixed: true }));
  expect(writes(slot)).toEqual([{ method: "state_update", input: { botId: "bot", file: "settings.json", content: '{\n  "fixed": true\n}\n', expectedSha256: sha('{\n  "keep": true\n}\n') } }]);
  expect(box(slot, "settings.json").value).toBe('{\n  "fixed": true\n}\n');
});

it("rejects oversized canonical settings before any write", async () => {
  const backend = panelBackend();
  const slot = await mountBotPanel(backend);
  const value = Object.fromEntries(Array.from({ length: 1500 }, (_, index) => [`k${index}`, 0]));
  expect(JSON.stringify(value).length).toBeLessThan(16384);
  await edit(slot, "settings.json", JSON.stringify(value));
  expect((await card(slot, "Settings").findByRole("alert")).textContent).toContain("too large");
  expect(writes(slot)).toEqual([]);
});

it("retains an oversized memory draft until it is shortened", async () => {
  const backend = panelBackend();
  const slot = await mountBotPanel(backend);
  await edit(slot, "MEMORY.md", "x".repeat(3001));
  expect(card(slot, "Memory").getByText("3001/3000")).toBeTruthy();
  expect((await card(slot, "Memory").findByRole("alert")).textContent).toContain("3000 characters");
  expect(writes(slot)).toEqual([]);
  expect(box(slot, "MEMORY.md").value).toHaveLength(3001);
  await edit(slot, "MEMORY.md", "x".repeat(3000));
  await waitFor(() => expect(backend.bot().memory).toHaveLength(3000));
});

it("shows legacy oversized memory and saves other fields without rewriting it", async () => {
  const backend = panelBackend([{ memory: "L".repeat(8000) }]);
  const slot = await mountBotPanel(backend);
  expect(box(slot, "MEMORY.md").value).toHaveLength(8000);
  await edit(slot, "Bot name", "Renamed safely");
  await waitFor(() => expect(backend.bot().name).toBe("Renamed safely"));
  expect(writes(slot).map((call) => call.method)).toEqual(["bot_patch"]);
  expect(backend.bot().memory).toHaveLength(8000);
});

it("sends one write while a save is pending and follows it with what was typed meanwhile", async () => {
  const backend = panelBackend([{ soul: "Old" }]);
  const slot = await mountBotPanel(backend);
  const release = backend.hold("state_update");
  fireEvent.change(box(slot, "SOUL.md"), { target: { value: "First" } });
  await act(async () => { fireEvent.blur(box(slot, "SOUL.md")); });
  await act(async () => { fireEvent.blur(box(slot, "SOUL.md")); });
  expect(writes(slot)).toHaveLength(1);
  expect(saveState(slot)).toBe("saving");
  fireEvent.change(box(slot, "SOUL.md"), { target: { value: "First and more" } });
  await act(async () => { release(); });
  await waitFor(() => expect(backend.bot().soul).toBe("First"));
  expect(box(slot, "SOUL.md").value).toBe("First and more");
  await act(async () => { fireEvent.blur(box(slot, "SOUL.md")); });
  await waitFor(() => expect(backend.bot().soul).toBe("First and more"));
  expect(writes(slot)[1]).toEqual({ method: "state_update", input: { botId: "bot", file: "SOUL.md", content: "First and more", expectedSha256: sha("First") } });
  expect(slot.queryByRole("alert")).toBeNull();
});

it("reports a failed save quietly and keeps the draft for another attempt", async () => {
  const backend = panelBackend([{ soul: "Old" }]);
  const slot = await mountBotPanel(backend);
  backend.failNext("state_update", "Storage unavailable");
  await edit(slot, "SOUL.md", "Unsaved soul");
  expect((await card(slot, "Instructions").findByRole("alert")).textContent).toBe("Storage unavailable");
  expect(box(slot, "SOUL.md").value).toBe("Unsaved soul");
  expect(saveState(slot)).toBe("attention");
  await act(async () => { fireEvent.blur(box(slot, "SOUL.md")); });
  await waitFor(() => expect(backend.bot().soul).toBe("Unsaved soul"));
  expect(slot.queryByRole("alert")).toBeNull();
});

it("saves avatar choices immediately and one at a time, without rerolling the rest", async () => {
  const backend = panelBackend();
  const before = backend.bot().avatar;
  const slot = await mountBotPanel(backend);
  const avatar = () => slot.getByRole("img", { name: "Bot avatar" });
  expect(avatar().getAttribute("data-expression")).toBe(before.expression);
  fireEvent.click(card(slot, "Appearance").getByRole("button", { name: "Happy" }));
  expect(avatar().getAttribute("data-expression")).toBe("happy");
  fireEvent.click(card(slot, "Appearance").getByRole("button", { name: "Motion" }));
  fireEvent.click(card(slot, "Appearance").getByRole("button", { name: "Playful" }));
  await waitFor(() => expect(writes(slot)).toHaveLength(2));
  expect(writes(slot)).toEqual([
    { method: "bot_patch", input: { botId: "bot", expected: { avatar: before }, changes: { avatar: { ...before, expression: "happy" } } } },
    { method: "bot_patch", input: { botId: "bot", expected: { avatar: { ...before, expression: "happy" } }, changes: { avatar: { ...before, expression: "happy", motion: "playful" } } } },
  ]);
  await waitFor(() => expect(saveState(slot)).toBe("saved"));
  expect(backend.bot().avatar).toEqual({ ...before, expression: "happy", motion: "playful" });
  expect(avatar().getAttribute("data-shape")).toBe(before.shape);
  expect(slot.queryByRole("alert")).toBeNull();
});

it("changes the machine as a single field", async () => {
  const backend = panelBackend();
  const slot = await mountBotPanel(backend);
  selectOption(card(slot, "Setup").getByRole("combobox", { name: "Machine" }), "Remote");
  await waitFor(() => expect(backend.bot().hostId).toBe("remote"));
  expect(writes(slot)).toEqual([{ method: "bot_patch", input: { botId: "bot", expected: { hostId: "host" }, changes: { hostId: "remote" } } }]);
});

it("creates a section from the panel and moves the bot into it", async () => {
  const backend = panelBackend();
  const slot = await mountBotPanel(backend);
  const section = () => card(slot, "Setup").getByRole<HTMLSelectElement>("combobox", { name: "Section" });
  fireEvent.change(section(), { target: { value: "__create_section__" } });
  fireEvent.click(slot.getByRole("button", { name: "Cancel section creation" }));
  expect(section().value).toBe("");
  expect(writes(slot)).toEqual([]);
  fireEvent.change(section(), { target: { value: "__create_section__" } });
  fireEvent.change(slot.getByRole("textbox", { name: "New section name" }), { target: { value: "Team" } });
  fireEvent.click(slot.getByRole("button", { name: "Add section" }));
  await waitFor(() => expect(backend.bot().sectionId).toBe("section-1"));
  expect(writes(slot)).toEqual([
    { method: "section_create", input: { name: "Team" } },
    { method: "bot_patch", input: { botId: "bot", expected: { sectionId: null }, changes: { sectionId: "section-1" } } },
  ]);
  await waitFor(() => expect(section().value).toBe("section-1"));
  expect(slot.queryByRole("textbox", { name: "New section name" })).toBeNull();
});

it("falls back to the unassigned state when the conversation's bot is deleted", async () => {
  const backend = panelBackend();
  const slot = await mountBotPanel(backend);
  backend.world.bots = [];
  await slot.behavior.emitRealtime("project-bots-changed", {});
  await slot.findByText("No bot for this conversation");
  expect(slot.queryByRole("region", { name: /bot settings$/ })).toBeNull();
});

it("resolves the bot from the conversation it is pinned beside", async () => {
  const backend = panelBackend([{ name: "Atlas" }]);
  backend.world.threadBots.set("thread", "bot");
  const slot = await mountBotPanel(backend, { botId: null });
  await slot.findByRole("region", { name: "Atlas bot settings" });
  expect(slot.inspection.rpcCalls[0]).toEqual({ method: "thread_bot", input: { threadId: "thread" } });
});

it("explains an unassigned conversation and picks up a later assignment", async () => {
  const backend = panelBackend([{ name: "Atlas" }]);
  const slot = await mountBotPanel(backend, { botId: null });
  expect((await slot.findByText("No bot for this conversation")).closest('[role="status"]')!.textContent).toContain("Assign to bot…");
  expect(slot.queryByRole("textbox")).toBeNull();
  expect(slot.inspection.rpcCalls.some((call) => call.method === "bots_list")).toBe(false);
  backend.world.threadBots.set("thread", "bot");
  await slot.behavior.emitRealtime("project-bots-changed", {});
  await slot.findByRole("region", { name: "Atlas bot settings" });
});
