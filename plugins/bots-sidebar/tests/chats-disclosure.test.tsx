// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { personalProjectId, thread } from "./fixtures";

const app = await loadPluginApp(() => import("../app"));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function mount() {
  const slot = renderSlot(app.threadLists[0]!, {
    activeThreadId: null, activeProjectId: null, isCompactViewport: false,
    onNavigate: vi.fn(), searchQuery: "",
  }, {
    sidebarThreads: { projects: [], threads: [thread("unassigned", 100)] },
    rpc: {
      bots_list: () => ({ bots: [], sections: [], personalProjectId, hosts: [], projects: [], warnings: [], threadBindings: [] }),
    },
  });
  await slot.findByText("Create your first bot");
  return slot;
}

it("persists Chats disclosure across mounts and retains native creation", async () => {
  const preferences = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => preferences.get(key) ?? null, setItem: (key: string, value: string) => preferences.set(key, value) });
  const slot = await mount();
  const chats = within(slot.getByRole("region", { name: "Chats" }));
  expect(chats.getByRole("button", { name: "New unassigned chat" })).toBeTruthy();
  const collapse = chats.getByRole("button", { name: "Chats" });
  expect(collapse.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(collapse);
  expect(chats.queryByRole("link", { name: /Conversation unassigned/ })).toBeNull();
  expect(chats.getByRole("button", { name: "Chats" }).getAttribute("aria-expanded")).toBe("false");
  slot.lifecycle.unmount();
  const again = await mount();
  const restored = within(again.getByRole("region", { name: "Chats" }));
  const expand = restored.getByRole("button", { name: "Chats" });
  expect(restored.queryByRole("link", { name: /Conversation unassigned/ })).toBeNull();
  fireEvent.click(expand);
  expect(restored.getByRole("link", { name: /Conversation unassigned/ })).toBeTruthy();
  fireEvent.click(restored.getByRole("button", { name: "New unassigned chat" }));
  expect(again.inspection.sidebarActionCalls).toContainEqual({ method: "openNewThread", options: { projectId: personalProjectId, focusPrompt: true } });
});
