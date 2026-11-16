// @vitest-environment jsdom
import { createElement } from "react";
import type { NewThreadComposerProps } from "@get-bb/plugin-sdk/app";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { bot, personalEnvironment, personalProjectId, request } from "./fixtures";

const composer = vi.hoisted(() => ({ props: null as NewThreadComposerProps | null }));
vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => {
  const sdk = await importOriginal<typeof import("@get-bb/plugin-sdk/app")>();
  return { ...sdk, experimental_NewThreadComposer: (props: NewThreadComposerProps) => {
    composer.props = props;
    return createElement(sdk.experimental_NewThreadComposer, props);
  } };
});
const app = await loadPluginApp(() => import("../app"));
afterEach(() => { cleanup(); composer.props = null; });

it.each([null, "project"])("opens an inline coordinator with default project %s and preserves first-message choices on failure and retry", async (defaultProjectId) => {
  let fail = true;
  const slot = renderSlot(app.navPanels.find(panel => panel.id === "coordinator")!, { subPath: bot.id }, { rpc: {
    bot_prepare: () => ({ ...bot, defaultProjectId }),
    bots_list: () => ({ bots: [bot], projects: [{ id: "project", name: "Work" }], projectOwners: [], personalProjectId }),
    conversation_create: () => { if (fail) throw new Error("Host disconnected"); return { threadId: "coordinator" }; },
  } });
  await slot.findByRole("region", { name: "Test bot coordinator" });
  expect(slot.queryByRole("dialog")).toBeNull();
  expect(slot.queryByRole("heading")).toBeNull();
  expect(slot.queryByText(/Plan work, delegate tasks/)).toBeNull();
  expect(composer.props?.defaultProjectId).toBe(defaultProjectId ?? personalProjectId);
  expect(composer.props?.defaultEnvironment).toEqual(defaultProjectId ? { type: "host", hostId: "host", workspace: { type: "unmanaged", path: null } } : personalEnvironment);
  expect(slot.inspection.rpcCalls.some(call => call.method === "conversation_create")).toBe(false);
  await act(async () => { await expect(composer.props!.onSubmit(request)).rejects.toThrow("Host disconnected"); });
  expect(slot.getByRole("alert").textContent).toBe("Host disconnected");
  expect(slot.inspection.navigateCalls).toEqual([]);
  fail = false;
  await act(() => composer.props!.onSubmit(request));
  expect(slot.inspection.rpcCalls).toContainEqual({ method: "conversation_create", input: { botId: bot.id, request, coordinator: true, makeMain: false } });
  await waitFor(() => expect(slot.inspection.navigateCalls).toContainEqual({ method: "toThread", threadId: "coordinator" }));
});
