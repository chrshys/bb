import { describe, expect, it, vi } from "vitest";
import {
  createDesktopReleaseConfig,
  createDesktopUpdateReleaseBaseUrl,
} from "../scripts/desktop-release-channel.mjs";
import {
  createDesktopReleaseInfo,
  createDesktopUpdateFeedUrl,
  createDesktopUpdateReleasePageUrl,
  DESKTOP_AUTO_UPDATE_FEED_CONFIG,
  resolveDesktopVersionFeedUrl,
  resolveDesktopUpdateSupport,
} from "../src/desktop-update-provider.js";

const RELEASE_BASE_URL =
  "https://github.com/chrshys/bb/releases/download/bbc-desktop-test/";

describe("desktop update feed", () => {
  it("uses BBC-owned feeds for every platform and channel", () => {
    for (const channel of ["latest", "nightly"] as const) {
      const releaseConfig = createDesktopReleaseConfig(channel);
      expect(createDesktopReleaseInfo(channel).updateReleaseBaseUrl).toBe(
        createDesktopUpdateReleaseBaseUrl(releaseConfig.releaseTag),
      );
    }
    expect(createDesktopReleaseInfo("latest")).toMatchObject({
      releaseTag: "bbc-desktop-test",
      updateReleaseBaseUrl: RELEASE_BASE_URL,
    });
    expect(createDesktopReleaseInfo("nightly")).toMatchObject({
      releaseTag: "bbc-desktop-nightly",
      updateReleaseBaseUrl:
        "https://github.com/chrshys/bb/releases/download/bbc-desktop-nightly/",
    });
    expect(createDesktopUpdateFeedUrl("macos")).toBe(
      `${RELEASE_BASE_URL}desktop-version.json`,
    );
    expect(createDesktopUpdateFeedUrl("linux")).toBe(
      `${RELEASE_BASE_URL}desktop-version-linux.json`,
    );
    expect(createDesktopUpdateFeedUrl("windows")).toBe(
      `${RELEASE_BASE_URL}desktop-version-windows.json`,
    );
    expect(resolveDesktopVersionFeedUrl("macos", "nightly", undefined)).toBe(
      "https://github.com/chrshys/bb/releases/download/bbc-desktop-nightly/desktop-version.json",
    );
    expect(() =>
      resolveDesktopVersionFeedUrl(
        "macos",
        "latest",
        "https://github.com/get-bb/bb/releases/download/desktop-latest/desktop-version.json",
      ),
    ).toThrow("Built BBC version feed URL must be");
    expect(createDesktopUpdateFeedUrl("macos")).not.toContain("get-bb/bb");
    expect(DESKTOP_AUTO_UPDATE_FEED_CONFIG).toEqual({
      channel: "latest",
      provider: "generic",
      url: RELEASE_BASE_URL,
    });
    expect(RELEASE_BASE_URL).not.toContain("get-bb/bb");
  });

  it("rejects a build-time update URL outside the BBC release channel", () => {
    vi.stubEnv(
      "BB_DESKTOP_UPDATE_RELEASE_BASE_URL",
      "https://github.com/get-bb/bb/releases/download/desktop-latest/",
    );
    try {
      expect(() => createDesktopReleaseInfo("latest")).toThrow(
        "Built BBC update URL must be https://github.com/chrshys/bb/releases/download/bbc-desktop-test/",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

const APP_IMAGE_PATH = "/home/user/Apps/bb-0.37.0-x86_64.AppImage";
const alwaysReplaceable = () => true;
const neverReplaceable = () => false;

describe("desktop update support", () => {
  it("checks for Mac updates and directs friendly builds to manual installation", () => {
    expect(
      resolveDesktopUpdateSupport({
        channel: "latest",
        canReplaceAppImage: neverReplaceable,
        env: {},
        platform: "macos",
        updateReleaseBaseUrl: RELEASE_BASE_URL,
      }),
    ).toEqual({
      autoUpdate: false,
      installMode: "manual",
      updateDownloadUrl: "https://github.com/chrshys/bb/releases/tag/bbc-desktop-test",
      versionCheck: true,
    });
    expect(createDesktopUpdateReleasePageUrl("nightly")).toBe(
      "https://github.com/chrshys/bb/releases/tag/bbc-desktop-nightly",
    );
  });

  it("checks for and installs updates on Windows", () => {
    expect(
      resolveDesktopUpdateSupport({
        channel: "latest",
        canReplaceAppImage: alwaysReplaceable,
        env: { APPIMAGE: APP_IMAGE_PATH },
        platform: "windows",
        updateReleaseBaseUrl: RELEASE_BASE_URL,
      }),
    ).toEqual({ autoUpdate: true, installMode: "automatic", versionCheck: true });
  });

  it("installs updates on Linux only inside an AppImage", () => {
    expect(
      resolveDesktopUpdateSupport({
        channel: "latest",
        canReplaceAppImage: alwaysReplaceable,
        env: { APPIMAGE: APP_IMAGE_PATH },
        platform: "linux",
        updateReleaseBaseUrl: RELEASE_BASE_URL,
      }),
    ).toEqual({ autoUpdate: true, installMode: "automatic", versionCheck: true });
    expect(
      resolveDesktopUpdateSupport({
        channel: "latest",
        canReplaceAppImage: alwaysReplaceable,
        env: {},
        platform: "linux",
        updateReleaseBaseUrl: RELEASE_BASE_URL,
      }),
    ).toEqual({ autoUpdate: false, installMode: "manual", versionCheck: true });
    expect(
      resolveDesktopUpdateSupport({
        channel: "latest",
        canReplaceAppImage: alwaysReplaceable,
        env: { APPIMAGE: "  " },
        platform: "linux",
        updateReleaseBaseUrl: RELEASE_BASE_URL,
      }),
    ).toEqual({ autoUpdate: false, installMode: "manual", versionCheck: true });
  });

  it("refuses to install into an AppImage it cannot replace", () => {
    const checked: Array<string> = [];

    expect(
      resolveDesktopUpdateSupport({
        channel: "latest",
        canReplaceAppImage: (path) => {
          checked.push(path);
          return false;
        },
        env: { APPIMAGE: APP_IMAGE_PATH },
        platform: "linux",
        updateReleaseBaseUrl: RELEASE_BASE_URL,
      }),
    ).toEqual({ autoUpdate: false, installMode: "manual", versionCheck: true });
    expect(checked).toEqual([APP_IMAGE_PATH]);
  });

  it("does not consult the filesystem on macOS", () => {
    let consulted = false;

    resolveDesktopUpdateSupport({
      channel: "latest",
      canReplaceAppImage: () => {
        consulted = true;
        return true;
      },
      env: { APPIMAGE: APP_IMAGE_PATH },
      platform: "macos",
      updateReleaseBaseUrl: RELEASE_BASE_URL,
    });

    expect(consulted).toBe(false);
  });
});
