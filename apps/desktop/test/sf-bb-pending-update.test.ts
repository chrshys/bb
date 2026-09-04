import { describe, expect, it } from "vitest";
import type { BbDesktopInfo } from "@bb/desktop-contract";
import {
  applySfBbPendingUpdate,
  parseSfBbPendingUpdateRecord,
} from "../src/sf-bb-pending-update.js";

const pendingPath = "/Applications/.sf-bb.app.update-1788479203-17950";

function info(overrides: Partial<BbDesktopInfo> = {}): BbDesktopInfo {
  return {
    applicationName: "sf-bb",
    channel: "custom",
    lastCheckedAt: "2026-09-03T00:00:00.000Z",
    latestVersion: "0.41.1-sf.2.1",
    pendingVersion: null,
    platform: "macos",
    releaseUrl: "https://github.com/chrshys/bb/releases/tag/desktop-sf-bb",
    selfUpdateEnabled: false,
    updateAvailable: true,
    updateDownloaded: false,
    version: "0.41.1-sf.1.1",
    ...overrides,
  };
}

describe("sf-bb pending update", () => {
  it("accepts a matching updater record", () => {
    expect(
      parseSfBbPendingUpdateRecord(
        `${pendingPath}\n`,
        JSON.stringify({
          schemaVersion: 1,
          path: pendingPath,
          version: "0.41.1-sf.2.1",
        }),
      ),
    ).toEqual({
      schemaVersion: 1,
      path: pendingPath,
      version: "0.41.1-sf.2.1",
    });
  });

  it.each([
    ["malformed JSON", "{"],
    [
      "a path that does not match the updater marker",
      JSON.stringify({
        schemaVersion: 1,
        path: "/Applications/.sf-bb.app.update-1788479203-11111",
        version: "0.41.1-sf.2.1",
      }),
    ],
    [
      "an untrusted staging path",
      JSON.stringify({
        schemaVersion: 1,
        path: "/tmp/sf-bb.app",
        version: "0.41.1-sf.2.1",
      }),
    ],
  ])("rejects %s", (_label, record) => {
    expect(parseSfBbPendingUpdateRecord(pendingPath, record)).toBeNull();
  });

  it("exposes a staged version as the pending update", () => {
    expect(
      applySfBbPendingUpdate(
        info({ latestVersion: null, updateAvailable: false }),
        "0.41.1-sf.2.1",
      ),
    ).toMatchObject({
      latestVersion: "0.41.1-sf.2.1",
      pendingVersion: "0.41.1-sf.2.1",
      updateAvailable: true,
    });
  });

  it("does not call an older staged build ready when the feed has advanced", () => {
    const current = info({ latestVersion: "0.41.1-sf.3.1" });

    expect(applySfBbPendingUpdate(current, "0.41.1-sf.2.1")).toBe(current);
  });

  it("preserves local-build replacement protection", () => {
    const current = info({ version: "0.41.1-local.20260903.abc123" });

    expect(applySfBbPendingUpdate(current, "0.41.1-sf.2.1")).toBe(current);
  });
});
