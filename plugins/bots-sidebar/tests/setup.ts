import { realpathSync } from "node:fs";
import { afterEach, beforeEach, vi } from "vitest";

vi.mock("node:os", async (importOriginal) => {
  const os = await importOriginal<typeof import("node:os")>();
  return { ...os, tmpdir: () => realpathSync(os.tmpdir()) };
});

declare const jsdom: { window: Window };

beforeEach(() => {
  if (typeof jsdom !== "undefined") {
    vi.stubGlobal("localStorage", jsdom.window.localStorage);
    jsdom.window.localStorage.clear();
  }
});
afterEach(() => vi.unstubAllGlobals());
