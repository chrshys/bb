import { z } from "zod";

const browserCookieImportRecordSchema = z.discriminatedUnion("kind", [
  z
    .object({
      family: z.string().min(1).max(64),
      importedCookies: z.number().int().nonnegative(),
      kind: z.literal("browser"),
      profileId: z.string().min(1).max(256),
      profileLabel: z.string().min(1).max(256),
      sourceLabel: z.string().min(1).max(256),
    })
    .strict(),
  z
    .object({
      fileName: z.string().min(1).max(1_024),
      importedCookies: z.number().int().nonnegative(),
      kind: z.literal("file"),
    })
    .strict(),
]);

export type BrowserCookieImportRecord = z.infer<
  typeof browserCookieImportRecordSchema
>;

const STORAGE_KEY = "bb.browser.cookie-import";
const listeners = new Set<() => void>();
let initialized = false;
let currentRecord: BrowserCookieImportRecord | null = null;

function initialize(): void {
  if (initialized || typeof localStorage === "undefined") return;
  initialized = true;
  const value = localStorage.getItem(STORAGE_KEY);
  if (value === null) return;
  try {
    const parsed = browserCookieImportRecordSchema.safeParse(JSON.parse(value));
    if (parsed.success) currentRecord = parsed.data;
  } catch {}
}

export function browserCookieImportRecordSnapshot(): BrowserCookieImportRecord | null {
  initialize();
  return currentRecord;
}

export function subscribeBrowserCookieImportRecord(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setBrowserCookieImportRecord(
  record: BrowserCookieImportRecord | null,
): void {
  initialized = true;
  currentRecord = record;
  if (typeof localStorage !== "undefined") {
    if (record === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  }
  for (const listener of listeners) listener();
}
