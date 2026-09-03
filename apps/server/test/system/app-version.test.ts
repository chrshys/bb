import { describe, expect, it, vi } from "vitest";
import { createAppVersionService } from "../../src/services/system/app-version.js";
import { testLogger } from "../helpers/test-app.js";

interface StubFetchOptions {
  body?: unknown;
  ok?: boolean;
  status?: number;
  throwError?: Error;
}

interface FetchCall {
  url: string;
  signal: AbortSignal | null;
}

function createStubFetch(
  responses: StubFetchOptions[],
  calls: FetchCall[],
): typeof fetch {
  let index = 0;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.toString()
          : String(input);
    calls.push({ url, signal: init?.signal ?? null });
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (response.throwError) {
      throw response.throwError;
    }
    return new Response(
      response.body === undefined ? "" : JSON.stringify(response.body),
      {
        status: response.status ?? 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as unknown as typeof fetch;
}

describe("createAppVersionService", () => {
  it("skips the npm lookup in development mode", async () => {
    const calls: FetchCall[] = [];
    const service = createAppVersionService({
      config: { appVersion: "0.0.5", desktop: null, isDevelopment: true },
      fetchImpl: createStubFetch([{ body: { version: "0.0.6" } }], calls),
      logger: testLogger,
    });
    const response = await service.getSystemVersion();
    expect(response).toEqual({
      currentVersion: "0.0.5",
      desktop: null,
      isDevelopment: true,
      latestVersion: null,
      source: "npm",
      updateAvailable: false,
      upgradeCommand: "npx bb-app@latest",
    });
    expect(calls).toEqual([]);
  });

  it("reports updateAvailable=true when npm latest is greater", async () => {
    const calls: FetchCall[] = [];
    const service = createAppVersionService({
      config: { appVersion: "0.0.5", desktop: null, isDevelopment: false },
      fetchImpl: createStubFetch([{ body: { version: "0.0.6" } }], calls),
      logger: testLogger,
    });
    const response = await service.getSystemVersion();
    expect(response.latestVersion).toBe("0.0.6");
    expect(response.updateAvailable).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://registry.npmjs.org/bb-app/latest");
  });

  it("uses the sf-bb feed and upgrade command for custom desktop builds", async () => {
    const calls: FetchCall[] = [];
    const service = createAppVersionService({
      config: {
        appVersion: "0.41.1",
        desktop: {
          channel: "custom",
          commit: "abc123",
          feedUrl:
            "https://github.com/chrshys/bb/releases/download/desktop-sf-bb/",
          version: "0.41.1-sf.10.1",
        },
        isDevelopment: false,
      },
      fetchImpl: createStubFetch(
        [{ body: { version: "0.41.1-sf.11.1" } }],
        calls,
      ),
      logger: testLogger,
    });

    await expect(service.getSystemVersion()).resolves.toEqual({
      currentVersion: "0.41.1-sf.10.1",
      desktop: {
        channel: "custom",
        commit: "abc123",
        feedUrl:
          "https://github.com/chrshys/bb/releases/download/desktop-sf-bb/",
        releaseUrl: "https://github.com/chrshys/bb/releases/tag/desktop-sf-bb",
        version: "0.41.1-sf.10.1",
      },
      isDevelopment: false,
      latestVersion: "0.41.1-sf.11.1",
      source: "sf-bb-feed",
      updateAvailable: true,
      upgradeCommand: "pnpm sf-bb:update",
    });
    expect(calls).toEqual([
      {
        signal: expect.any(AbortSignal),
        url: "https://github.com/chrshys/bb/releases/download/desktop-sf-bb/desktop-version.json",
      },
    ]);
  });

  it("treats an sf-bb release as newer than a local build", async () => {
    const service = createAppVersionService({
      config: {
        appVersion: "0.41.1-local.20260903120000.abc123",
        desktop: {
          channel: "custom",
          commit: null,
          feedUrl:
            "https://github.com/chrshys/bb/releases/download/desktop-sf-bb/",
          version: "0.41.1-local.20260903120000.abc123",
        },
        isDevelopment: false,
      },
      fetchImpl: createStubFetch(
        [{ body: { version: "0.41.1-sf.33785488058.1" } }],
        [],
      ),
      logger: testLogger,
    });

    const response = await service.getSystemVersion();
    expect(response.source).toBe("sf-bb-feed");
    expect(response.updateAvailable).toBe(true);
  });

  it("reports updateAvailable=false when versions are equal", async () => {
    const service = createAppVersionService({
      config: { appVersion: "0.0.6", desktop: null, isDevelopment: false },
      fetchImpl: createStubFetch([{ body: { version: "0.0.6" } }], []),
      logger: testLogger,
    });
    const response = await service.getSystemVersion();
    expect(response.latestVersion).toBe("0.0.6");
    expect(response.updateAvailable).toBe(false);
  });

  it("reports updateAvailable=false when local is ahead of npm latest", async () => {
    const service = createAppVersionService({
      config: { appVersion: "9.9.9", desktop: null, isDevelopment: false },
      fetchImpl: createStubFetch([{ body: { version: "0.0.6" } }], []),
      logger: testLogger,
    });
    const response = await service.getSystemVersion();
    expect(response.latestVersion).toBe("0.0.6");
    expect(response.updateAvailable).toBe(false);
  });

  it("returns latestVersion=null when npm fails and there is no cache", async () => {
    const warn = vi.fn();
    const service = createAppVersionService({
      config: { appVersion: "0.0.5", desktop: null, isDevelopment: false },
      fetchImpl: createStubFetch(
        [{ throwError: new Error("network down") }],
        [],
      ),
      logger: { ...testLogger, warn },
    });
    const response = await service.getSystemVersion();
    expect(response).toEqual({
      currentVersion: "0.0.5",
      desktop: null,
      isDevelopment: false,
      latestVersion: null,
      source: "npm",
      updateAvailable: false,
      upgradeCommand: "npx bb-app@latest",
    });
    expect(warn).toHaveBeenCalled();
  });

  it("returns latestVersion=null when npm returns a non-200 status", async () => {
    const service = createAppVersionService({
      config: { appVersion: "0.0.5", desktop: null, isDevelopment: false },
      fetchImpl: createStubFetch([{ ok: false, status: 429, body: {} }], []),
      logger: testLogger,
    });
    const response = await service.getSystemVersion();
    expect(response.latestVersion).toBeNull();
    expect(response.updateAvailable).toBe(false);
  });

  it("returns latestVersion=null when npm returns an unexpected payload", async () => {
    const service = createAppVersionService({
      config: { appVersion: "0.0.5", desktop: null, isDevelopment: false },
      fetchImpl: createStubFetch([{ body: { unexpected: true } }], []),
      logger: testLogger,
    });
    const response = await service.getSystemVersion();
    expect(response.latestVersion).toBeNull();
  });

  it("returns latestVersion but updateAvailable=false when current version is not semver", async () => {
    const service = createAppVersionService({
      config: {
        appVersion: "totally-not-semver",
        desktop: null,
        isDevelopment: false,
      },
      fetchImpl: createStubFetch([{ body: { version: "0.0.6" } }], []),
      logger: testLogger,
    });
    const response = await service.getSystemVersion();
    expect(response.latestVersion).toBe("0.0.6");
    expect(response.updateAvailable).toBe(false);
  });

  it("caches the npm result and avoids repeat fetches inside the TTL", async () => {
    const calls: FetchCall[] = [];
    const service = createAppVersionService({
      config: { appVersion: "0.0.5", desktop: null, isDevelopment: false },
      fetchImpl: createStubFetch(
        [{ body: { version: "0.0.6" } }, { body: { version: "0.0.7" } }],
        calls,
      ),
      logger: testLogger,
    });
    const first = await service.getSystemVersion();
    const second = await service.getSystemVersion();
    expect(first.latestVersion).toBe("0.0.6");
    expect(second.latestVersion).toBe("0.0.6");
    expect(calls).toHaveLength(1);
  });

  it("bypasses the npm cache for a forced check", async () => {
    const calls: FetchCall[] = [];
    const service = createAppVersionService({
      config: { appVersion: "0.0.5", desktop: null, isDevelopment: false },
      fetchImpl: createStubFetch(
        [{ body: { version: "0.0.6" } }, { body: { version: "0.0.7" } }],
        calls,
      ),
      logger: testLogger,
    });
    const first = await service.getSystemVersion();
    const second = await service.getSystemVersion({ forceRefresh: true });
    expect(first.latestVersion).toBe("0.0.6");
    expect(second.latestVersion).toBe("0.0.7");
    expect(calls).toHaveLength(2);
  });

  it("re-fetches once the TTL has expired", async () => {
    const calls: FetchCall[] = [];
    let currentTime = 1_000;
    const service = createAppVersionService({
      cacheTtlMs: 100,
      config: { appVersion: "0.0.5", desktop: null, isDevelopment: false },
      fetchImpl: createStubFetch(
        [{ body: { version: "0.0.6" } }, { body: { version: "0.0.7" } }],
        calls,
      ),
      logger: testLogger,
      now: () => currentTime,
    });
    const first = await service.getSystemVersion();
    currentTime += 1_000;
    const second = await service.getSystemVersion();
    expect(first.latestVersion).toBe("0.0.6");
    expect(second.latestVersion).toBe("0.0.7");
    expect(calls).toHaveLength(2);
  });

  it("dedupes concurrent inflight requests", async () => {
    const calls: FetchCall[] = [];
    const service = createAppVersionService({
      config: { appVersion: "0.0.5", desktop: null, isDevelopment: false },
      fetchImpl: createStubFetch([{ body: { version: "0.0.6" } }], calls),
      logger: testLogger,
    });
    const [first, second] = await Promise.all([
      service.getSystemVersion(),
      service.getSystemVersion(),
    ]);
    expect(first.latestVersion).toBe("0.0.6");
    expect(second.latestVersion).toBe("0.0.6");
    expect(calls).toHaveLength(1);
  });

  it("returns latestVersion=null after TTL expiry even if the prior cache held a value (no stale fallback)", async () => {
    const calls: FetchCall[] = [];
    let currentTime = 1_000;
    const service = createAppVersionService({
      cacheTtlMs: 100,
      config: { appVersion: "0.0.5", desktop: null, isDevelopment: false },
      fetchImpl: createStubFetch(
        [
          { body: { version: "0.0.6" } },
          { throwError: new Error("npm down later") },
        ],
        calls,
      ),
      logger: testLogger,
      now: () => currentTime,
    });
    const first = await service.getSystemVersion();
    expect(first.latestVersion).toBe("0.0.6");
    currentTime += 1_000;
    const second = await service.getSystemVersion();
    expect(second.latestVersion).toBeNull();
    expect(second.updateAvailable).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("treats a published prerelease latest as an update when local is the stable predecessor", async () => {
    const service = createAppVersionService({
      config: { appVersion: "0.0.5", desktop: null, isDevelopment: false },
      fetchImpl: createStubFetch([{ body: { version: "0.0.6-alpha.1" } }], []),
      logger: testLogger,
    });
    const response = await service.getSystemVersion();
    expect(response.latestVersion).toBe("0.0.6-alpha.1");
    expect(response.updateAvailable).toBe(true);
  });

  it("does not flag updateAvailable when local is the stable that follows a published prerelease", async () => {
    const service = createAppVersionService({
      config: { appVersion: "0.0.5", desktop: null, isDevelopment: false },
      fetchImpl: createStubFetch([{ body: { version: "0.0.5-alpha.1" } }], []),
      logger: testLogger,
    });
    const response = await service.getSystemVersion();
    expect(response.latestVersion).toBe("0.0.5-alpha.1");
    expect(response.updateAvailable).toBe(false);
  });

  it("ignores semver build metadata when comparing equal versions", async () => {
    const service = createAppVersionService({
      config: { appVersion: "0.0.5", desktop: null, isDevelopment: false },
      fetchImpl: createStubFetch([{ body: { version: "0.0.5+build.1" } }], []),
      logger: testLogger,
    });
    const response = await service.getSystemVersion();
    expect(response.latestVersion).toBe("0.0.5+build.1");
    expect(response.updateAvailable).toBe(false);
  });
});
