import semver from "semver";
import { z } from "zod";
import type { SystemVersionResponse } from "@bb/server-contract";
import type { ServerLogger, ServerRuntimeConfig } from "../../types.js";

const NPM_LATEST_URL = "https://registry.npmjs.org/bb-app/latest";
const SF_BB_RELEASE_URL =
  "https://github.com/chrshys/bb/releases/tag/desktop-sf-bb";
const LATEST_VERSION_TIMEOUT_MS = 5_000;
const LATEST_VERSION_CACHE_TTL_MS = 60 * 60 * 1000;
const NPM_UPGRADE_COMMAND = "npx bb-app@latest";
const SF_BB_UPGRADE_COMMAND = "pnpm sf-bb:update";

const latestVersionResponseSchema = z
  .object({
    version: z.string().min(1),
  })
  .passthrough();

export interface AppVersionService {
  getSystemVersion(
    args?: AppVersionGetSystemVersionArgs,
  ): Promise<SystemVersionResponse>;
}

interface AppVersionGetSystemVersionArgs {
  forceRefresh?: boolean;
}

interface CreateAppVersionServiceArgs {
  config: Pick<ServerRuntimeConfig, "appVersion" | "desktop" | "isDevelopment">;
  fetchImpl?: typeof fetch;
  logger: ServerLogger;
  cacheTtlMs?: number;
  now?: () => number;
}

interface LatestVersionCacheEntry {
  cachedAt: number;
  latestVersion: string;
}

interface LatestVersionSource {
  currentVersion: string;
  source: SystemVersionResponse["source"];
  upgradeCommand: string;
  url: string;
}

function resolveDesktopVersionFeedUrl(feedUrl: string): string {
  const baseUrl = new URL(feedUrl);
  if (!baseUrl.pathname.endsWith("/")) {
    baseUrl.pathname = `${baseUrl.pathname}/`;
  }
  baseUrl.hash = "";
  baseUrl.search = "";
  return new URL("desktop-version.json", baseUrl).toString();
}

function resolveLatestVersionSource(
  config: CreateAppVersionServiceArgs["config"],
): LatestVersionSource {
  if (config.desktop?.channel === "custom") {
    return {
      currentVersion: config.desktop.version,
      source: "sf-bb-feed",
      upgradeCommand: SF_BB_UPGRADE_COMMAND,
      url: resolveDesktopVersionFeedUrl(config.desktop.feedUrl),
    };
  }
  return {
    currentVersion: config.appVersion,
    source: "npm",
    upgradeCommand: NPM_UPGRADE_COMMAND,
    url: NPM_LATEST_URL,
  };
}

export function createAppVersionService(
  args: CreateAppVersionServiceArgs,
): AppVersionService {
  const fetchImpl = args.fetchImpl ?? fetch;
  const cacheTtlMs = args.cacheTtlMs ?? LATEST_VERSION_CACHE_TTL_MS;
  const now = args.now ?? (() => Date.now());
  const logger = args.logger;
  const config = args.config;
  const latestVersionSource = resolveLatestVersionSource(config);

  let cache: LatestVersionCacheEntry | null = null;
  let inflight: Promise<string | null> | null = null;

  async function fetchLatestVersion(): Promise<string | null> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(
      () => controller.abort(),
      LATEST_VERSION_TIMEOUT_MS,
    );
    try {
      const response = await fetchImpl(latestVersionSource.url, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        logger.warn(
          { status: response.status, url: latestVersionSource.url },
          "Failed to fetch latest application version",
        );
        return null;
      }
      const json = await response.json();
      const parsed = latestVersionResponseSchema.safeParse(json);
      if (!parsed.success) {
        logger.warn(
          { url: latestVersionSource.url, issue: parsed.error.message },
          "Latest application version response did not match expected shape",
        );
        return null;
      }
      return parsed.data.version;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(
        { url: latestVersionSource.url, error: message },
        "Latest application version lookup failed",
      );
      return null;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async function getLatestVersion(args?: {
    forceRefresh?: boolean;
  }): Promise<string | null> {
    const currentTime = now();
    if (
      args?.forceRefresh !== true &&
      cache !== null &&
      currentTime - cache.cachedAt < cacheTtlMs
    ) {
      return cache.latestVersion;
    }
    if (inflight !== null) {
      return inflight;
    }
    const requestPromise = (async () => {
      const result = await fetchLatestVersion();
      if (result !== null) {
        cache = { cachedAt: now(), latestVersion: result };
      }
      return result;
    })();
    inflight = requestPromise;
    try {
      return await requestPromise;
    } finally {
      if (inflight === requestPromise) {
        inflight = null;
      }
    }
  }

  return {
    async getSystemVersion(
      args: AppVersionGetSystemVersionArgs = {},
    ): Promise<SystemVersionResponse> {
      const baseResponse: SystemVersionResponse = {
        currentVersion: latestVersionSource.currentVersion,
        desktop:
          config.desktop === null
            ? null
            : {
                ...config.desktop,
                releaseUrl:
                  config.desktop.channel === "custom"
                    ? SF_BB_RELEASE_URL
                    : null,
              },
        latestVersion: null,
        source: latestVersionSource.source,
        updateAvailable: false,
        isDevelopment: config.isDevelopment,
        upgradeCommand: latestVersionSource.upgradeCommand,
      };

      if (config.isDevelopment) {
        return baseResponse;
      }

      const latestVersion = await getLatestVersion({
        forceRefresh: args.forceRefresh,
      });
      if (latestVersion === null) {
        return baseResponse;
      }

      const parsedCurrent = semver.parse(latestVersionSource.currentVersion);
      const parsedLatest = semver.parse(latestVersion);
      if (parsedCurrent === null || parsedLatest === null) {
        logger.warn(
          {
            currentVersion: latestVersionSource.currentVersion,
            latestVersion,
          },
          "Skipping update check because a version is not valid semver",
        );
        return { ...baseResponse, latestVersion };
      }

      return {
        ...baseResponse,
        latestVersion,
        updateAvailable: semver.gt(parsedLatest, parsedCurrent),
      };
    },
  };
}
