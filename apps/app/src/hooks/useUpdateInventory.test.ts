import { describe, expect, it } from "vitest";
import type {
  ProviderCliStatus,
  ProviderCliStatusResponse,
} from "@bb/host-daemon-contract";
import type { BbDesktopInfo } from "@bb/desktop-contract";
import {
  buildUpdateInventoryProviderIssues,
  isDesktopUpdateActionable,
} from "./useUpdateInventory";

function desktopInfo(overrides: Partial<BbDesktopInfo> = {}): BbDesktopInfo {
  return {
    applicationName: "sf-bb",
    channel: "custom",
    lastCheckedAt: null,
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

function providerStatus(
  displayName: string,
  overrides: Partial<ProviderCliStatus> = {},
): ProviderCliStatus {
  return {
    displayName,
    executableName: displayName.toLowerCase(),
    executablePath: `/usr/local/bin/${displayName.toLowerCase()}`,
    installed: true,
    installSource: "npmGlobal",
    currentVersion: "1.0.0",
    latestVersion: "1.0.0",
    minimumSupportedVersion: null,
    npmPackageName: null,
    npmGlobalPackageVersion: null,
    installAction: null,
    needsUpdate: false,
    versionUnsupported: false,
    ...overrides,
  };
}

describe("buildUpdateInventoryProviderIssues", () => {
  it("includes Cursor updates in the machine inventory", () => {
    const status: ProviderCliStatusResponse = {
      codex: providerStatus("Codex"),
      "claude-code": providerStatus("Claude Code"),
      "acp-cursor": providerStatus("Cursor", {
        latestVersion: "1.1.0",
        needsUpdate: true,
      }),
    };

    expect(buildUpdateInventoryProviderIssues(status)).toMatchObject([
      {
        provider: "acp-cursor",
        title: "Cursor update available",
      },
    ]);
  });
});

describe("isDesktopUpdateActionable", () => {
  it("counts a release-page update for a non-self-updating build", () => {
    expect(isDesktopUpdateActionable(desktopInfo())).toBe(true);
  });

  it("waits for a self-updating build to finish downloading", () => {
    expect(
      isDesktopUpdateActionable(desktopInfo({ selfUpdateEnabled: true })),
    ).toBe(false);
    expect(
      isDesktopUpdateActionable(
        desktopInfo({ selfUpdateEnabled: true, updateDownloaded: true }),
      ),
    ).toBe(true);
  });

  it("ignores a build without an available update", () => {
    expect(
      isDesktopUpdateActionable(desktopInfo({ updateAvailable: false })),
    ).toBe(false);
  });
});
