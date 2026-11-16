import {
  createBbDesktopVersionFeedFileName,
  type BbDesktopVersionFeedPlatform,
} from "@bb/desktop-contract";

type DesktopReleaseChannel = "latest" | "nightly";

const DESKTOP_UPDATE_RELEASES_BASE_URL =
  "https://github.com/chrshys/bb/releases/download/";

function resolveDesktopUpdateReleaseBaseUrl(releaseTag: string): string {
  const expectedUrl = `${DESKTOP_UPDATE_RELEASES_BASE_URL}${releaseTag}/`;
  const builtUrl = process.env.BB_DESKTOP_UPDATE_RELEASE_BASE_URL;
  if (builtUrl !== undefined && builtUrl !== expectedUrl) {
    throw new Error(
      `Built BBC update URL must be ${expectedUrl}, got ${builtUrl}.`,
    );
  }
  return expectedUrl;
}

interface DesktopReleaseInfo {
  applicationName: "BBC" | "BBC Nightly";
  channel: DesktopReleaseChannel;
  iconFileName: "icon.png" | "icon-nightly.png";
  releaseTag: "bbc-desktop-test" | "bbc-desktop-nightly";
  updateReleaseBaseUrl: string;
}

export function createDesktopReleaseInfo(
  channel: DesktopReleaseChannel,
): DesktopReleaseInfo {
  const nightly = channel === "nightly";
  const releaseTag = nightly ? "bbc-desktop-nightly" : "bbc-desktop-test";

  return {
    applicationName: nightly ? "BBC Nightly" : "BBC",
    channel,
    iconFileName: nightly ? "icon-nightly.png" : "icon.png",
    releaseTag,
    updateReleaseBaseUrl: resolveDesktopUpdateReleaseBaseUrl(releaseTag),
  };
}

function resolveBuiltDesktopReleaseChannel(
  rawChannel: string | undefined,
): DesktopReleaseChannel {
  if (rawChannel === undefined || rawChannel.length === 0) {
    return "latest";
  }
  if (rawChannel === "latest" || rawChannel === "nightly") {
    return rawChannel;
  }

  throw new Error(
    `Built desktop release channel must be latest or nightly, got ${String(rawChannel)}.`,
  );
}

export const DESKTOP_RELEASE_CHANNEL = resolveBuiltDesktopReleaseChannel(
  process.env.BB_DESKTOP_RELEASE_CHANNEL,
);
export const DESKTOP_RELEASE_INFO = createDesktopReleaseInfo(
  DESKTOP_RELEASE_CHANNEL,
);

export function createDesktopUpdateFeedUrl(
  platform: BbDesktopVersionFeedPlatform,
): string {
  return `${DESKTOP_RELEASE_INFO.updateReleaseBaseUrl}${createBbDesktopVersionFeedFileName(platform)}`;
}

export interface DesktopAutoUpdateFeedConfig {
  channel: DesktopReleaseChannel;
  provider: "generic";
  url: string;
}

export function createDesktopUpdateReleasePageUrl(channel: DesktopReleaseChannel): string {
  return `https://github.com/chrshys/bb/releases/tag/${createDesktopReleaseInfo(channel).releaseTag}`;
}

export function resolveDesktopVersionFeedUrl(
  platform: BbDesktopVersionFeedPlatform,
  channel: DesktopReleaseChannel,
  configuredUrl: string | undefined,
): string {
  const expectedUrl = `${createDesktopReleaseInfo(channel).updateReleaseBaseUrl}${createBbDesktopVersionFeedFileName(platform)}`;
  if (configuredUrl !== undefined && configuredUrl !== expectedUrl) {
    throw new Error(
      `Built BBC version feed URL must be ${expectedUrl}, got ${configuredUrl}.`,
    );
  }
  return expectedUrl;
}

export const DESKTOP_AUTO_UPDATE_FEED_CONFIG: DesktopAutoUpdateFeedConfig = {
  channel: DESKTOP_RELEASE_CHANNEL,
  provider: "generic",
  url: DESKTOP_RELEASE_INFO.updateReleaseBaseUrl,
};

interface DesktopUpdateSupport {
  autoUpdate: boolean;
  installMode: "automatic" | "manual";
  updateDownloadUrl?: string;
  versionCheck: boolean;
}

interface ResolveDesktopUpdateSupportArgs {
  canReplaceAppImage: (appImagePath: string) => boolean;
  channel: DesktopReleaseChannel;
  env: NodeJS.ProcessEnv;
  platform: BbDesktopVersionFeedPlatform;
  updateReleaseBaseUrl: string | null;
}

export function resolveDesktopUpdateSupport(
  args: ResolveDesktopUpdateSupportArgs,
): DesktopUpdateSupport {
  if (args.updateReleaseBaseUrl === null) {
    return { autoUpdate: false, installMode: "manual", versionCheck: false };
  }
  if (args.platform === "macos") {
    return {
      autoUpdate: false,
      installMode: "manual",
      updateDownloadUrl: createDesktopUpdateReleasePageUrl(args.channel),
      versionCheck: true,
    };
  }
  if (args.platform === "windows") {
    return { autoUpdate: true, installMode: "automatic", versionCheck: true };
  }

  const appImagePath = args.env.APPIMAGE?.trim() ?? "";
  if (appImagePath.length === 0) {
    return { autoUpdate: false, installMode: "manual", versionCheck: true };
  }

  const autoUpdate = args.canReplaceAppImage(appImagePath);
  return {
    autoUpdate,
    installMode: autoUpdate ? "automatic" : "manual",
    versionCheck: true,
  };
}
