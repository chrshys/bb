import type { SystemVersionResponse } from "@bb/server-contract";

export function versionApplicationName(version: SystemVersionResponse): string {
  if (version.desktop?.channel === "custom") {
    return "sf-bb";
  }
  if (version.desktop?.channel === "nightly") {
    return "bb Nightly";
  }
  if (version.desktop?.channel === "latest") {
    return "bb";
  }
  return "bb-app";
}

export function versionDisplay(version: SystemVersionResponse): string {
  if (
    version.latestVersion !== null &&
    version.latestVersion !== version.currentVersion
  ) {
    return `${version.currentVersion} -> ${version.latestVersion}`;
  }
  return version.currentVersion;
}
