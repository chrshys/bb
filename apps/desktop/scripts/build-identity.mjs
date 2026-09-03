import { execFileSync } from "node:child_process";

function normalizeCommit(commit, source) {
  const normalized = commit.trim().toLowerCase();
  if (!/^[0-9a-f]{7,64}$/u.test(normalized)) {
    throw new Error(`${source} must be a Git commit SHA`);
  }
  return normalized;
}

export function resolveDesktopBuildCommit(env, cwd) {
  const injected =
    env.BB_DESKTOP_COMMIT?.trim() ?? env.GITHUB_SHA?.trim() ?? "";
  if (injected.length > 0) {
    return normalizeCommit(injected, "Desktop build commit");
  }
  try {
    return normalizeCommit(
      execFileSync("git", ["rev-parse", "HEAD"], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
      "Git build commit",
    );
  } catch {
    return "";
  }
}

export function resolveDesktopBuildDate(env, now = new Date()) {
  const injected = env.BB_DESKTOP_BUILD_DATE?.trim() ?? "";
  if (injected.length === 0) {
    return now.toISOString();
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(injected)) {
    throw new Error("BB_DESKTOP_BUILD_DATE must be an ISO 8601 UTC date");
  }
  const parsed = new Date(injected);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("BB_DESKTOP_BUILD_DATE must be an ISO 8601 UTC date");
  }
  return parsed.toISOString();
}

export function resolveDesktopBuildIdentity(env, cwd) {
  return {
    buildDate: resolveDesktopBuildDate(env),
    commit: resolveDesktopBuildCommit(env, cwd),
  };
}
