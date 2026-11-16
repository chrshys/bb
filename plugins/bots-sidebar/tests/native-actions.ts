import type { RenderSlotOptions } from "@get-bb/plugin-sdk/testing/app";
import { vi } from "vitest";

export function nativeActions() {
  const run = vi.fn<(key: string, threadId: string) => void>();
  const resolve: NonNullable<RenderSlotOptions["threadActions"]> = (target) =>
    [
      { key: "rename", label: "Rename" },
      { key: "open-split", label: "Open in split" },
      { key: "unread", label: "Mark as unread" },
      { key: "archive", label: "Archive" },
    ].map(({ key, label }) => ({
      key: `bb--core/${key}`,
      pluginId: "bb--core",
      group: "4_lifecycle",
      action: {
        label,
        icon: "Archive",
        run: async () => {
          run(key, target.id);
        },
      },
    }));
  return { run, resolve };
}
