import type { DbConnection } from "@bb/db";
import type { experimental_ThreadCloseProtectionDeclaration } from "@get-bb/plugin-sdk";
import { ApiError } from "../../errors.js";

const registrations = new WeakMap<
  DbConnection,
  Set<experimental_ThreadCloseProtectionDeclaration>
>();

export function registerThreadCloseProtection(
  db: DbConnection,
  declaration: experimental_ThreadCloseProtectionDeclaration,
) {
  let entries = registrations.get(db);
  if (!entries) {
    entries = new Set();
    registrations.set(db, entries);
  }
  entries.add(declaration);
  return {
    dispose: () => {
      entries.delete(declaration);
    },
  };
}

export function resolveThreadCloseProtection(
  db: DbConnection,
  threads: readonly { id: string }[],
): string | null {
  for (const thread of threads) {
    for (const registration of registrations.get(db) ?? []) {
      try {
        const reason: unknown = registration.resolve(thread.id);
        if (reason === null) continue;
        if (typeof reason !== "string" || reason.trim().length === 0) {
          void Promise.resolve(reason).catch(() => {});
          return "Thread close protection returned an invalid reason";
        }
        return reason;
      } catch {
        return "Thread close protection is unavailable";
      }
    }
  }
  return null;
}

export function assertThreadsMayClose(
  db: DbConnection,
  threads: readonly { id: string }[],
): void {
  const reason = resolveThreadCloseProtection(db, threads);
  if (reason !== null)
    throw new ApiError(409, "thread_close_protected", reason);
}
