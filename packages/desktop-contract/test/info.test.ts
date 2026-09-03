import { describe, expect, it } from "vitest";
import { bbDesktopInfoSchema } from "../src/info.js";

const baseInfo = {
  applicationName: "sf-bb",
  channel: "custom",
  lastCheckedAt: null,
  latestVersion: "0.0.32",
  pendingVersion: null,
  platform: "macos",
  releaseUrl: "https://github.com/chrshys/bb/releases/tag/desktop-sf-bb",
  selfUpdateEnabled: false,
  updateAvailable: true,
  updateDownloaded: false,
  version: "0.0.31",
} as const;

describe("bbDesktopInfoSchema", () => {
  it("accepts both explicit download state and legacy shell payloads", () => {
    expect(
      bbDesktopInfoSchema.safeParse({
        ...baseInfo,
        downloadState: "downloading",
      }).success,
    ).toBe(true);
    expect(bbDesktopInfoSchema.safeParse(baseInfo).success).toBe(true);
  });

  it("rejects an unknown download state", () => {
    expect(
      bbDesktopInfoSchema.safeParse({
        ...baseInfo,
        downloadState: "available",
      }).success,
    ).toBe(false);
  });

  it("accepts linux", () => {
    expect(
      bbDesktopInfoSchema.safeParse({
        ...baseInfo,
        platform: "linux",
      }).success,
    ).toBe(true);
  });

  it("rejects win32", () => {
    expect(
      bbDesktopInfoSchema.safeParse({
        ...baseInfo,
        platform: "win32",
      }).success,
    ).toBe(false);
  });

  it("requires a valid release identity", () => {
    expect(
      bbDesktopInfoSchema.safeParse({
        ...baseInfo,
        applicationName: "",
      }).success,
    ).toBe(false);
    expect(
      bbDesktopInfoSchema.safeParse({
        ...baseInfo,
        channel: "preview",
      }).success,
    ).toBe(false);
    expect(
      bbDesktopInfoSchema.safeParse({
        ...baseInfo,
        releaseUrl: "not-a-url",
      }).success,
    ).toBe(false);
  });
});
