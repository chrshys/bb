const DESKTOP_RELEASE_CHANNEL_ENV_NAME = "BB_DESKTOP_RELEASE_CHANNEL";

export function resolveDesktopReleaseChannel(env) {
  const rawChannel = env[DESKTOP_RELEASE_CHANNEL_ENV_NAME]?.trim();
  if (rawChannel === undefined || rawChannel.length === 0) {
    return "latest";
  }
  if (rawChannel === "latest" || rawChannel === "nightly") {
    return rawChannel;
  }

  throw new Error(
    `${DESKTOP_RELEASE_CHANNEL_ENV_NAME} must be latest or nightly, got ${rawChannel}.`,
  );
}

export function resolveDesktopBuildPlatform(nodePlatform) {
  if (nodePlatform === "darwin") {
    return "macos";
  }
  if (nodePlatform === "linux") {
    return "linux";
  }
  if (nodePlatform === "win32") {
    return "windows";
  }

  throw new Error(
    `Desktop builds support darwin, linux, and win32 only, got ${nodePlatform}.`,
  );
}

export function createDesktopReleaseConfig(channel) {
  if (channel === "nightly") {
    return {
      appId: "dev.bbc.desktop.nightly",
      applicationName: "BBC Nightly",
      artifactName: "BBC-nightly-${version}-${arch}.${ext}",
      iconFileName: "icon-nightly.png",
      // The Linux binary name must differ from stable so both channels can be
      // installed at once without one shadowing the other on PATH.
      linuxExecutableName: "bbc-nightly",
      macIconPath: "assets/icon-nightly.icns",
      releaseTag: "desktop-nightly",
      windowsInstallName: "bbc-nightly",
      updateMetadataFileNames: {
        linux: "nightly-linux.yml",
        macos: "nightly-mac.yml",
        windows: "nightly.yml",
      },
    };
  }

  return {
    appId: "dev.bbc.desktop",
    applicationName: "BBC",
    artifactName: "${productName}-${version}-${arch}.${ext}",
    iconFileName: "icon.png",
    linuxExecutableName: "bbc",
    macIconPath: "assets/icon.icns",
    releaseTag: "desktop-latest",
    windowsInstallName: "bbc",
    updateMetadataFileNames: {
      linux: "latest-linux.yml",
      macos: "latest-mac.yml",
      windows: "latest.yml",
    },
  };
}

const DESKTOP_UPDATE_RELEASES_URL = null;

export function createDesktopUpdateReleaseBaseUrl(releaseTag) {
  return DESKTOP_UPDATE_RELEASES_URL === null
    ? null
    : `${DESKTOP_UPDATE_RELEASES_URL}${releaseTag}/`;
}
