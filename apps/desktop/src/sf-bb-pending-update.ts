import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { BbDesktopInfo } from "@bb/desktop-contract";
import semver from "semver";
import { z } from "zod";

const sfBbPendingUpdateRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    path: z
      .string()
      .regex(/^\/Applications\/\.sf-bb\.app\.update-[0-9]+-[0-9]+$/),
    version: z.string().refine((value) => semver.valid(value) !== null),
  })
  .strict();

export type SfBbPendingUpdateRecord = z.infer<
  typeof sfBbPendingUpdateRecordSchema
>;

export function parseSfBbPendingUpdateRecord(
  pendingPath: string,
  pendingInfo: string,
): SfBbPendingUpdateRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(pendingInfo);
  } catch {
    return null;
  }
  const result = sfBbPendingUpdateRecordSchema.safeParse(parsed);
  if (!result.success || pendingPath.trim() !== result.data.path) {
    return null;
  }
  return result.data;
}

export function readSfBbPendingUpdateVersion(
  homeDirectory: string,
): string | null {
  const supportDirectory = join(
    homeDirectory,
    "Library",
    "Application Support",
    "sf-bb",
  );
  try {
    const record = parseSfBbPendingUpdateRecord(
      readFileSync(join(supportDirectory, "pending-update"), "utf8"),
      readFileSync(join(supportDirectory, "pending-update-info.json"), "utf8"),
    );
    if (record === null || !statSync(record.path).isDirectory()) {
      return null;
    }
    return record.version;
  } catch {
    return null;
  }
}

export function applySfBbPendingUpdate(
  info: BbDesktopInfo,
  pendingVersion: string | null,
): BbDesktopInfo {
  if (
    pendingVersion === null ||
    info.channel !== "custom" ||
    info.platform !== "macos" ||
    info.selfUpdateEnabled ||
    info.applicationName !== "sf-bb" ||
    info.version.includes("-local.") ||
    semver.valid(info.version) === null ||
    !semver.gt(pendingVersion, info.version)
  ) {
    return info;
  }

  if (
    info.latestVersion !== null &&
    (semver.valid(info.latestVersion) === null ||
      semver.gt(info.latestVersion, pendingVersion))
  ) {
    return info;
  }

  return {
    ...info,
    latestVersion:
      info.latestVersion === null ||
      semver.gt(pendingVersion, info.latestVersion)
        ? pendingVersion
        : info.latestVersion,
    pendingVersion,
    updateAvailable: true,
  };
}
