import {
  createBbDesktopVersionFeedFileName,
  type BbDesktopVersionFeedPlatform,
} from "@bb/desktop-contract";
import { createDesktopUpdateReleaseBaseUrl } from "../scripts/desktop-release-channel.mjs";

type DesktopReleaseChannel = "latest" | "nightly" | "custom";

interface DesktopReleaseInfo {
  applicationName: "bb" | "bb Nightly" | "sf-bb";
  channel: DesktopReleaseChannel;
  iconFileName: "icon.png" | "icon-nightly.png";
  releaseTag: "desktop-latest" | "desktop-nightly" | "desktop-sf-bb";
  updateReleaseBaseUrl: string;
}

export function createDesktopReleaseInfo(
  channel: DesktopReleaseChannel,
): DesktopReleaseInfo {
  const applicationName =
    channel === "custom"
      ? "sf-bb"
      : channel === "nightly"
        ? "bb Nightly"
        : "bb";
  const releaseTag =
    channel === "custom"
      ? "desktop-sf-bb"
      : channel === "nightly"
        ? "desktop-nightly"
        : "desktop-latest";

  return {
    applicationName,
    channel,
    iconFileName: channel === "nightly" ? "icon-nightly.png" : "icon.png",
    releaseTag,
    updateReleaseBaseUrl: createDesktopUpdateReleaseBaseUrl(releaseTag),
  };
}

function resolveBuiltDesktopReleaseChannel(
  rawChannel: string | undefined,
): DesktopReleaseChannel {
  if (rawChannel === undefined || rawChannel.length === 0) {
    return "latest";
  }
  if (
    rawChannel === "latest" ||
    rawChannel === "nightly" ||
    rawChannel === "custom"
  ) {
    return rawChannel;
  }

  throw new Error(
    `Built desktop release channel must be latest, nightly, or custom, got ${String(rawChannel)}.`,
  );
}

export const DESKTOP_RELEASE_CHANNEL = resolveBuiltDesktopReleaseChannel(
  process.env.BB_DESKTOP_RELEASE_CHANNEL,
);
export const DESKTOP_RELEASE_INFO = createDesktopReleaseInfo(
  DESKTOP_RELEASE_CHANNEL,
);
const DESKTOP_UPDATE_RELEASE_BASE_URL =
  DESKTOP_RELEASE_INFO.updateReleaseBaseUrl;

export function createDesktopUpdateFeedUrl(
  platform: BbDesktopVersionFeedPlatform,
): string {
  return `${DESKTOP_UPDATE_RELEASE_BASE_URL}${createBbDesktopVersionFeedFileName(platform)}`;
}

export interface DesktopAutoUpdateFeedConfig {
  channel: DesktopReleaseChannel;
  provider: "generic";
  url: string;
}

export const DESKTOP_AUTO_UPDATE_FEED_CONFIG: DesktopAutoUpdateFeedConfig = {
  channel: DESKTOP_RELEASE_CHANNEL,
  provider: "generic",
  url: DESKTOP_UPDATE_RELEASE_BASE_URL,
};

interface DesktopUpdateSupport {
  autoUpdate: boolean;
  versionCheck: boolean;
}

interface ResolveDesktopUpdateSupportArgs {
  canReplaceAppImage: (appImagePath: string) => boolean;
  channel?: DesktopReleaseChannel;
  customAutoUpdate: boolean;
  env: NodeJS.ProcessEnv;
  platform: BbDesktopVersionFeedPlatform;
}

export const DESKTOP_CUSTOM_AUTO_UPDATE_ENABLED =
  process.env.BB_DESKTOP_CUSTOM_AUTO_UPDATE === "1";

export function resolveDesktopUpdateSupport(
  args: ResolveDesktopUpdateSupportArgs,
): DesktopUpdateSupport {
  const channel = args.channel ?? DESKTOP_RELEASE_CHANNEL;
  if (channel === "custom") {
    return {
      autoUpdate: args.platform === "macos" && args.customAutoUpdate,
      versionCheck: true,
    };
  }

  if (args.platform === "macos") {
    return { autoUpdate: true, versionCheck: true };
  }

  const appImagePath = args.env.APPIMAGE?.trim() ?? "";
  if (appImagePath.length === 0) {
    return { autoUpdate: false, versionCheck: true };
  }

  return {
    autoUpdate: args.canReplaceAppImage(appImagePath),
    versionCheck: true,
  };
}
