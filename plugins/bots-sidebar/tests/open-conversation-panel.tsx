import { createElement, Fragment, type ReactNode } from "react";
import { expect } from "vitest";
import { waitFor } from "@testing-library/react";
import type { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { ConversationPanel } from "../components/conversation-panel";

export async function openConversationPanel(slot: ReturnType<typeof renderSlot> & { sidebar?: ReactNode }, title: string) {
  await waitFor(() => expect(slot.inspection.navigateCalls).toContainEqual(expect.objectContaining({ method: "toPluginPanel", path: "conversation" })));
  const navigation = [...slot.inspection.navigateCalls].reverse().find(call => call.method === "toPluginPanel" && call.path === "conversation");
  if (navigation?.method !== "toPluginPanel" || !navigation.options?.subPath) throw new Error("Missing main-panel navigation");
  expect(slot.queryByRole("dialog")).toBeNull();
  slot.lifecycle.rerender(createElement(Fragment, null, slot.sidebar, createElement(ConversationPanel, { subPath: navigation.options.subPath })));
  return slot.findByRole("region", { name: title });
}
