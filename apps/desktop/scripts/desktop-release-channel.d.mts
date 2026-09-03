export type DesktopReleaseChannel = "latest" | "nightly" | "custom";
export type DesktopBuildPlatform = "macos" | "linux";

export interface DesktopUpdateMetadataFileNames {
  linux: "latest-linux.yml" | "nightly-linux.yml" | "custom-linux.yml";
  macos: "latest-mac.yml" | "nightly-mac.yml" | "custom-mac.yml";
}

export interface DesktopReleaseConfig {
  appId: "dev.bb.desktop" | "dev.bb.desktop.nightly" | "dev.bb.desktop.custom";
  applicationName: "bb" | "bb Nightly" | "bb Custom";
  artifactName: string;
  iconFileName: "icon.png" | "icon-nightly.png";
  linuxExecutableName: "bb" | "bb-nightly" | "bb-custom";
  macIconPath: "assets/icon.icns" | "assets/icon-nightly.icns";
  releaseTag: "desktop-latest" | "desktop-nightly" | "desktop-custom";
  updateMetadataFileNames: DesktopUpdateMetadataFileNames;
}

export function resolveDesktopReleaseChannel(
  env: NodeJS.ProcessEnv,
): DesktopReleaseChannel;

export function resolveDesktopBuildPlatform(
  nodePlatform: string,
): DesktopBuildPlatform;

export function createDesktopReleaseConfig(
  channel: DesktopReleaseChannel,
): DesktopReleaseConfig;

export function createDesktopUpdateReleaseBaseUrl(
  releaseTag: DesktopReleaseConfig["releaseTag"],
): string;
