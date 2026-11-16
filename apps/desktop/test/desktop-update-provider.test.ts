import { describe, expect, it } from "vitest";
import {
  createDesktopReleaseInfo,
  createDesktopUpdateFeedUrl,
  DESKTOP_AUTO_UPDATE_FEED_CONFIG,
  resolveDesktopUpdateSupport,
} from "../src/desktop-update-provider.js";

const RELEASE_BASE_URL = "https://example.test/releases/desktop-latest/";

describe("desktop update feed", () => {
  it("has no feed until the fork publishes its own", () => {
    expect(createDesktopReleaseInfo("latest").updateReleaseBaseUrl).toBeNull();
    expect(createDesktopReleaseInfo("nightly").updateReleaseBaseUrl).toBeNull();
    expect(createDesktopUpdateFeedUrl("macos")).toBeNull();
    expect(DESKTOP_AUTO_UPDATE_FEED_CONFIG).toBeNull();
  });

  it("turns off both update paths without a feed", () => {
    expect(
      resolveDesktopUpdateSupport({
        canReplaceAppImage: () => true,
        env: {},
        platform: "macos",
        updateReleaseBaseUrl: null,
      }),
    ).toEqual({ autoUpdate: false, versionCheck: false });
  });
});

const APP_IMAGE_PATH = "/home/user/Apps/bb-0.37.0-x86_64.AppImage";
const alwaysReplaceable = () => true;
const neverReplaceable = () => false;

describe("desktop update support", () => {
  it("enables both update paths on macOS", () => {
    expect(
      resolveDesktopUpdateSupport({
        canReplaceAppImage: neverReplaceable,
        env: {},
        platform: "macos",
        updateReleaseBaseUrl: RELEASE_BASE_URL,
      }),
    ).toEqual({ autoUpdate: true, versionCheck: true });
  });

  it("checks for and installs updates on Windows", () => {
    expect(
      resolveDesktopUpdateSupport({
        canReplaceAppImage: alwaysReplaceable,
        env: { APPIMAGE: APP_IMAGE_PATH },
        platform: "windows",
        updateReleaseBaseUrl: RELEASE_BASE_URL,
      }),
    ).toEqual({ autoUpdate: true, versionCheck: true });
  });

  it("installs updates on Linux only inside an AppImage", () => {
    expect(
      resolveDesktopUpdateSupport({
        canReplaceAppImage: alwaysReplaceable,
        env: { APPIMAGE: APP_IMAGE_PATH },
        platform: "linux",
        updateReleaseBaseUrl: RELEASE_BASE_URL,
      }),
    ).toEqual({ autoUpdate: true, versionCheck: true });
    expect(
      resolveDesktopUpdateSupport({
        canReplaceAppImage: alwaysReplaceable,
        env: {},
        platform: "linux",
        updateReleaseBaseUrl: RELEASE_BASE_URL,
      }),
    ).toEqual({ autoUpdate: false, versionCheck: true });
    expect(
      resolveDesktopUpdateSupport({
        canReplaceAppImage: alwaysReplaceable,
        env: { APPIMAGE: "  " },
        platform: "linux",
        updateReleaseBaseUrl: RELEASE_BASE_URL,
      }),
    ).toEqual({ autoUpdate: false, versionCheck: true });
  });

  it("refuses to install into an AppImage it cannot replace", () => {
    const checked: Array<string> = [];

    expect(
      resolveDesktopUpdateSupport({
        canReplaceAppImage: (path) => {
          checked.push(path);
          return false;
        },
        env: { APPIMAGE: APP_IMAGE_PATH },
        platform: "linux",
        updateReleaseBaseUrl: RELEASE_BASE_URL,
      }),
    ).toEqual({ autoUpdate: false, versionCheck: true });
    expect(checked).toEqual([APP_IMAGE_PATH]);
  });

  it("does not consult the filesystem on macOS", () => {
    let consulted = false;

    resolveDesktopUpdateSupport({
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
