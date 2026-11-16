// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { selectOption } from "./select-helper";
import { mountBotPanel, panelBackend, resetPanelState, writes } from "./bot-panel-fixture";

afterEach(() => { cleanup(); resetPanelState(); });

type Slot = Awaited<ReturnType<typeof mountBotPanel>>;
const projects = (slot: Slot) => within(slot.getByRole("group", { name: "Projects" }));
const role = (slot: Slot, name: string) => projects(slot).getByRole<HTMLSelectElement>("combobox", { name: `${name} role` });
const apply = (action: string, projectId: string) => ({ method: "state_apply", input: { botId: "bot", change: { target: "project", action, projectId } } });
function link(slot: Slot, name: string) {
  fireEvent.click(projects(slot).getByRole("button", { name: "Add existing…" }));
  fireEvent.click(projects(slot).getByRole("button", { name: `Link ${name}` }));
}
function fillProject(slot: Slot) {
  fireEvent.click(projects(slot).getByRole("button", { name: "New project…" }));
  fireEvent.change(projects(slot).getByRole("textbox", { name: "Project name" }), { target: { value: "Client app" } });
  selectOption(projects(slot).getByRole("combobox", { name: "Project machine" }), "Remote");
  fireEvent.change(projects(slot).getByRole("textbox", { name: "Project folder" }), { target: { value: "/work/client-app" } });
}

it("keeps storage private: no home path, no custom directory, only linked projects listed", async () => {
  const backend = panelBackend([{ linkedProjectIds: ["existing"], defaultProjectId: "existing", legacyHomeProjectId: "legacy" }]);
  const slot = await mountBotPanel(backend);
  expect(slot.getByText(/State is stored privately in BB/)).toBeTruthy();
  expect(slot.queryByRole("textbox", { name: "Home folder" })).toBeNull();
  expect(slot.queryByRole("button", { name: "Use custom" })).toBeNull();
  expect(role(slot, "Existing work").value).toBe("member");
  expect(projects(slot).queryByRole("combobox", { name: "Other work role" })).toBeNull();
  expect(writes(slot)).toEqual([]);
});

it("links a searched project immediately as Member and makes a first link the default project", async () => {
  const backend = panelBackend();
  const slot = await mountBotPanel(backend);
  expect(projects(slot).getByText("No projects linked")).toBeTruthy();
  fireEvent.click(projects(slot).getByRole("button", { name: "Add existing…" }));
  fireEvent.change(projects(slot).getByRole("textbox", { name: "Search projects" }), { target: { value: "missing" } });
  expect(projects(slot).getByText("No matching projects")).toBeTruthy();
  fireEvent.change(projects(slot).getByRole("textbox", { name: "Search projects" }), { target: { value: "existing" } });
  fireEvent.click(projects(slot).getByRole("button", { name: "Link Existing work" }));
  await waitFor(() => expect(role(slot, "Existing work").value).toBe("member"));
  expect(writes(slot)).toEqual([
    apply("join", "existing"),
    { method: "bot_patch", input: { botId: "bot", expected: { defaultProjectId: null }, changes: { defaultProjectId: "existing" } } },
  ]);
  expect(projects(slot).getByRole<HTMLSelectElement>("combobox", { name: "Default project" }).value).toBe("existing");
  link(slot, "Other work");
  await waitFor(() => expect(backend.bot().linkedProjectIds).toEqual(["existing", "other"]));
  expect(writes(slot)).toHaveLength(3);
  expect(backend.bot().defaultProjectId).toBe("existing");
});

it("claims, releases and unlinks one project at a time without touching the others", async () => {
  const backend = panelBackend([{ linkedProjectIds: ["existing", "other", "missing"], defaultProjectId: "existing" }]);
  backend.world.owners = [{ projectId: "other", botId: "bot" }];
  const slot = await mountBotPanel(backend);
  expect(role(slot, "Other work").value).toBe("owner");
  expect(role(slot, "Unavailable project (missing)").value).toBe("member");
  fireEvent.change(role(slot, "Existing work"), { target: { value: "owner" } });
  await waitFor(() => expect(role(slot, "Existing work").value).toBe("owner"));
  fireEvent.change(role(slot, "Other work"), { target: { value: "member" } });
  await waitFor(() => expect(role(slot, "Other work").value).toBe("member"));
  fireEvent.click(projects(slot).getByRole("button", { name: "Unlink Unavailable project (missing)" }));
  await waitFor(() => expect(backend.bot().linkedProjectIds).toEqual(["existing", "other"]));
  expect(writes(slot)).toEqual([apply("own", "existing"), apply("release", "other"), apply("leave", "missing")]);
  expect(backend.world.owners).toEqual([{ projectId: "existing", botId: "bot" }]);
});

it("refuses a silent ownership transfer and names the current owner", async () => {
  const backend = panelBackend([{ linkedProjectIds: ["existing"], defaultProjectId: "existing" }, { name: "Other bot", linkedProjectIds: ["existing"] }]);
  backend.world.owners = [{ projectId: "existing", botId: "bot-2" }];
  const slot = await mountBotPanel(backend);
  const option = within(role(slot, "Existing work")).getByRole<HTMLOptionElement>("option", { name: "Owner (Other bot)" });
  expect(option.disabled).toBe(true);
  expect(projects(slot).getByText("Owned by Other bot")).toBeTruthy();
  expect(role(slot, "Existing work").value).toBe("member");
  expect(writes(slot)).toEqual([]);
});

it("shows roles that changed elsewhere and reports a claim that lost the race", async () => {
  const backend = panelBackend([{ linkedProjectIds: ["existing"], defaultProjectId: "existing" }, { name: "Other bot" }]);
  const slot = await mountBotPanel(backend);
  backend.world.owners = [{ projectId: "existing", botId: "bot" }];
  await slot.behavior.emitRealtime("project-bots-changed", {});
  await waitFor(() => expect(role(slot, "Existing work").value).toBe("owner"));
  backend.world.owners = [{ projectId: "existing", botId: "bot-2" }];
  fireEvent.change(role(slot, "Existing work"), { target: { value: "owner" } });
  expect((await slot.findByRole("alert")).textContent).toContain("already owned by another bot");
  await waitFor(() => expect(projects(slot).getByText("Owned by Other bot")).toBeTruthy());
  expect(role(slot, "Existing work").value).toBe("member");
  expect(backend.world.owners).toEqual([{ projectId: "existing", botId: "bot-2" }]);
});

it("changes only the default project when another linked project is chosen", async () => {
  const backend = panelBackend([{ linkedProjectIds: ["existing", "other"], defaultProjectId: "existing" }]);
  const slot = await mountBotPanel(backend);
  const select = projects(slot).getByRole<HTMLSelectElement>("combobox", { name: "Default project" });
  expect([...select.options].map((option) => option.textContent)).toEqual(["Personal workspace", "Existing work", "Other work"]);
  fireEvent.change(select, { target: { value: "" } });
  await waitFor(() => expect(backend.bot().defaultProjectId).toBeNull());
  expect(writes(slot)).toEqual([{ method: "bot_patch", input: { botId: "bot", expected: { defaultProjectId: "existing" }, changes: { defaultProjectId: null } } }]);
  expect(backend.bot().linkedProjectIds).toEqual(["existing", "other"]);
});

it("creates a project from the panel and makes the bot its owner straight away", async () => {
  const backend = panelBackend([{ name: "Builder", soul: "Keep my soul" }]);
  const slot = await mountBotPanel(backend);
  fillProject(slot);
  expect(projects(slot).getByText(/makes this bot its owner/)).toBeTruthy();
  expect(writes(slot)).toEqual([]);
  fireEvent.click(projects(slot).getByRole("button", { name: "Create project" }));
  await waitFor(() => expect(role(slot, "Client app").value).toBe("owner"));
  expect(writes(slot)).toEqual([
    { method: "project_create", input: { requestId: expect.any(String), name: "Client app", hostId: "remote", path: "/work/client-app" } },
    apply("own", "new-project"),
    { method: "bot_patch", input: { botId: "bot", expected: { defaultProjectId: null }, changes: { defaultProjectId: "new-project" } } },
  ]);
  expect(backend.bot()).toMatchObject({ name: "Builder", soul: "Keep my soul", linkedProjectIds: ["new-project"] });
});

it("creates nothing from a project draft that is cancelled", async () => {
  const backend = panelBackend();
  const slot = await mountBotPanel(backend);
  fillProject(slot);
  fireEvent.click(projects(slot).getByRole("button", { name: "Cancel" }));
  expect(projects(slot).getByText("No projects linked")).toBeTruthy();
  expect(writes(slot)).toEqual([]);
});

it("retries a failed project creation with the same request and keeps the project when linking fails", async () => {
  const backend = panelBackend();
  const slot = await mountBotPanel(backend);
  backend.failNext("project_create", "Temporary project failure");
  backend.failNext("state_apply", "Ownership changed; try again");
  fillProject(slot);
  fireEvent.click(projects(slot).getByRole("button", { name: "Create project" }));
  expect((await projects(slot).findByRole("alert")).textContent).toBe("Temporary project failure");
  fireEvent.click(projects(slot).getByRole("button", { name: "Create project" }));
  expect((await slot.findByText("Ownership changed; try again")).closest('[role="alert"]')).toBeTruthy();
  const created = slot.inspection.rpcCalls.filter((call) => call.method === "project_create");
  expect(created).toHaveLength(2);
  expect(created[0]!.input).toEqual(created[1]!.input);
  expect(backend.world.projects.some((project) => project.id === "new-project")).toBe(true);
  expect(backend.bot().linkedProjectIds).toEqual([]);
  link(slot, "Client app");
  await waitFor(() => expect(role(slot, "Client app").value).toBe("owner"));
  expect(slot.inspection.rpcCalls.filter((call) => call.method === "project_create")).toHaveLength(2);
});
