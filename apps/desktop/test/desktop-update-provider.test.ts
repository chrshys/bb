import { describe, expect, it } from "vitest";
import {
  createDesktopReleaseInfo,
  createDesktopUpdateFeedUrl,
  resolveDesktopUpdateSupport,
} from "../src/desktop-update-provider.js";

describe("desktop update feed url", () => {
  it("gives each platform its own feed file inside one release tag", () => {
    expect(createDesktopUpdateFeedUrl("macos")).toBe(
      "https://github.com/get-bb/bb/releases/download/desktop-latest/desktop-version.json",
    );
    expect(createDesktopUpdateFeedUrl("linux")).toBe(
      "https://github.com/get-bb/bb/releases/download/desktop-latest/desktop-version-linux.json",
    );
  });

  it("points custom builds at the sf-bb fork release", () => {
    const release = createDesktopReleaseInfo("custom");
    expect(release.updateReleaseBaseUrl).toBe(
      "https://github.com/chrshys/bb/releases/download/desktop-sf-bb/",
    );
    expect(release.releaseUrl).toBe(
      "https://github.com/chrshys/bb/releases/tag/desktop-sf-bb",
    );
  });

  it("gives every stock channel a public release page", () => {
    expect(createDesktopReleaseInfo("latest").releaseUrl).toBe(
      "https://github.com/get-bb/bb/releases/tag/desktop-latest",
    );
    expect(createDesktopReleaseInfo("nightly").releaseUrl).toBe(
      "https://github.com/get-bb/bb/releases/tag/desktop-nightly",
    );
  });
});

const APP_IMAGE_PATH = "/home/user/Apps/bb-0.37.0-x86_64.AppImage";
const alwaysReplaceable = () => true;
const neverReplaceable = () => false;

describe("desktop update support", () => {
  it("checks custom releases and enables signed custom auto-updates", () => {
    expect(
      resolveDesktopUpdateSupport({
        canReplaceAppImage: alwaysReplaceable,
        channel: "custom",
        customAutoUpdate: false,
        env: { APPIMAGE: APP_IMAGE_PATH },
        platform: "macos",
      }),
    ).toEqual({ autoUpdate: false, versionCheck: true });
    expect(
      resolveDesktopUpdateSupport({
        canReplaceAppImage: alwaysReplaceable,
        channel: "custom",
        customAutoUpdate: true,
        env: { APPIMAGE: APP_IMAGE_PATH },
        platform: "macos",
      }),
    ).toEqual({ autoUpdate: true, versionCheck: true });
  });

  it("enables both update paths on macOS", () => {
    expect(
      resolveDesktopUpdateSupport({
        canReplaceAppImage: neverReplaceable,
        customAutoUpdate: false,
        env: {},
        platform: "macos",
      }),
    ).toEqual({ autoUpdate: true, versionCheck: true });
  });

  it("installs updates on Linux only inside an AppImage", () => {
    expect(
      resolveDesktopUpdateSupport({
        canReplaceAppImage: alwaysReplaceable,
        customAutoUpdate: false,
        env: { APPIMAGE: APP_IMAGE_PATH },
        platform: "linux",
      }),
    ).toEqual({ autoUpdate: true, versionCheck: true });
    expect(
      resolveDesktopUpdateSupport({
        canReplaceAppImage: alwaysReplaceable,
        customAutoUpdate: false,
        env: {},
        platform: "linux",
      }),
    ).toEqual({ autoUpdate: false, versionCheck: true });
    expect(
      resolveDesktopUpdateSupport({
        canReplaceAppImage: alwaysReplaceable,
        customAutoUpdate: false,
        env: { APPIMAGE: "  " },
        platform: "linux",
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
        customAutoUpdate: false,
        env: { APPIMAGE: APP_IMAGE_PATH },
        platform: "linux",
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
      customAutoUpdate: false,
      env: { APPIMAGE: APP_IMAGE_PATH },
      platform: "macos",
    });

    expect(consulted).toBe(false);
  });
});
