import { createContext, useContext, useMemo, type ReactNode } from "react";
import { atom, useAtomValue, useStore } from "jotai";
import { atomFamily } from "jotai-family";
import type { JsonValue } from "@get-bb/plugin-sdk";
import { jsonValueSchema } from "@bb/domain";
import type {
  AppFixedTabOpenIntent,
  AppFixedTabReference,
} from "@/lib/app-navigation-host";

export interface AppFixedTabDestination {
  open(target: JsonValue | undefined): boolean;
  tab: AppFixedTabReference;
}

export function getPluginFixedTabOwnerId(
  pluginId: string,
  panelId: string,
): string {
  return `plugin:${pluginId}:${panelId}`;
}

export function getPluginPinnedTabOwnerId(pluginId: string): string {
  return `plugin-pinned:${pluginId}`;
}

export function openAppFixedTabFromDestinations(
  destinations: readonly AppFixedTabDestination[],
  intent: AppFixedTabOpenIntent,
): boolean {
  const destination = destinations.find(
    (candidate) =>
      candidate.tab.ownerId === intent.tab.ownerId &&
      candidate.tab.tabId === intent.tab.tabId,
  );
  return destination?.open(intent.target) ?? false;
}

interface AppFixedTabTargetSnapshot {
  ownerId: string;
  sequence: number;
  tabId: string;
  target: JsonValue;
}

export interface AppFixedTabTargetState extends AppFixedTabTargetSnapshot {
  clear(): void;
}

interface AppFixedTabSessionTarget {
  sequence: number;
  target: JsonValue;
}

type AppFixedTabTargetStore = ReturnType<typeof useStore>;

const appFixedTabTargetAtomFamily = atomFamily((_targetId: string) =>
  atom<AppFixedTabSessionTarget | null>(null),
);

function getAppFixedTabTargetAtom(
  scopeId: string,
  reference: AppFixedTabReference,
) {
  return appFixedTabTargetAtomFamily(
    `${scopeId}\0${reference.ownerId}\0${reference.tabId}`,
  );
}

export function deliverAppFixedTabTarget(
  store: AppFixedTabTargetStore,
  scopeId: string,
  reference: AppFixedTabReference,
  target: JsonValue,
): void {
  store.set(getAppFixedTabTargetAtom(scopeId, reference), (current) => ({
    sequence: (current?.sequence ?? 0) + 1,
    target,
  }));
}

export function useScopedAppFixedTabTargetState(
  scopeId: string,
  reference: AppFixedTabReference,
): AppFixedTabTargetState | null {
  const store = useStore();
  const { ownerId, tabId } = reference;
  const targetAtom = getAppFixedTabTargetAtom(scopeId, { ownerId, tabId });
  const snapshot = useAtomValue(targetAtom);
  return useMemo<AppFixedTabTargetState | null>(() => {
    if (snapshot === null) return null;
    const { sequence } = snapshot;
    return {
      ...snapshot,
      ownerId,
      tabId,
      clear: () => {
        store.set(targetAtom, (current) =>
          current?.sequence === sequence ? null : current,
        );
      },
    };
  }, [ownerId, snapshot, store, tabId, targetAtom]);
}

export interface AppFixedTabTargetValidator {
  validate(value: JsonValue): boolean;
}

export function resolveOwnerValidatedFixedTabTarget(
  validator: AppFixedTabTargetValidator | undefined,
  target: JsonValue,
): { accepted: true; target: JsonValue } | { accepted: false } {
  const result = jsonValueSchema.safeParse(target);
  if (!result.success || validator === undefined) return { accepted: false };
  try {
    if (!validator.validate(result.data)) return { accepted: false };
  } catch {
    return { accepted: false };
  }
  return { accepted: true, target: result.data };
}

export function createOwnerValidatedFixedTabDestination({
  deliverTarget,
  select,
  tab,
  validator,
}: {
  deliverTarget: (target: JsonValue) => void;
  select: () => void;
  tab: AppFixedTabReference;
  validator: AppFixedTabTargetValidator | undefined;
}): AppFixedTabDestination {
  return {
    tab,
    open(target) {
      if (target !== undefined) {
        const resolved = resolveOwnerValidatedFixedTabTarget(validator, target);
        if (!resolved.accepted) return false;
        deliverTarget(resolved.target);
      }
      select();
      return true;
    },
  };
}

const AppFixedTabTargetContext = createContext<AppFixedTabTargetState | null>(
  null,
);

export function AppFixedTabTargetProvider({
  children,
  state,
}: {
  children: ReactNode;
  state: AppFixedTabTargetState | null;
}) {
  return (
    <AppFixedTabTargetContext.Provider value={state}>
      {children}
    </AppFixedTabTargetContext.Provider>
  );
}

export function useAppFixedTabTarget(
  ownerId: string,
  tabId: string,
): AppFixedTabTargetState | null {
  const state = useContext(AppFixedTabTargetContext);
  return state?.ownerId === ownerId && state.tabId === tabId ? state : null;
}

export const PENDING_THREAD_FIXED_TAB_TTL_MS = 30_000;

type ThreadFixedTabOpener = (intent: AppFixedTabOpenIntent) => boolean;

interface PendingThreadFixedTabIntent {
  intent: AppFixedTabOpenIntent;
  queuedAt: number;
}

const threadFixedTabOpeners = new Map<string, ThreadFixedTabOpener[]>();
const pendingThreadFixedTabIntents = new Map<
  string,
  PendingThreadFixedTabIntent
>();

function drainPendingThreadFixedTabIntent(
  threadId: string,
  opener: ThreadFixedTabOpener,
): void {
  const pending = pendingThreadFixedTabIntents.get(threadId);
  if (pending === undefined) return;
  if (Date.now() - pending.queuedAt > PENDING_THREAD_FIXED_TAB_TTL_MS) {
    pendingThreadFixedTabIntents.delete(threadId);
    return;
  }
  if (opener(pending.intent)) {
    pendingThreadFixedTabIntents.delete(threadId);
  }
}

export function registerThreadFixedTabSurface(
  threadId: string,
  opener: ThreadFixedTabOpener,
): () => void {
  threadFixedTabOpeners.set(threadId, [
    ...(threadFixedTabOpeners.get(threadId) ?? []),
    opener,
  ]);
  drainPendingThreadFixedTabIntent(threadId, opener);
  return () => {
    const remaining = (threadFixedTabOpeners.get(threadId) ?? []).filter(
      (candidate) => candidate !== opener,
    );
    if (remaining.length > 0) threadFixedTabOpeners.set(threadId, remaining);
    else threadFixedTabOpeners.delete(threadId);
  };
}

export function openAppFixedTabOnThread({
  intent,
  isThreadFocused,
  navigateToThread,
  threadId,
}: {
  intent: AppFixedTabOpenIntent;
  isThreadFocused: boolean;
  navigateToThread: () => void;
  threadId: string;
}): boolean {
  const opener = threadFixedTabOpeners.get(threadId)?.at(-1);
  if (opener === undefined) {
    pendingThreadFixedTabIntents.set(threadId, {
      intent,
      queuedAt: Date.now(),
    });
    navigateToThread();
    return true;
  }
  if (!opener(intent)) return false;
  pendingThreadFixedTabIntents.delete(threadId);
  if (!isThreadFocused) navigateToThread();
  return true;
}

export function resetThreadFixedTabSurfacesForTest(): void {
  threadFixedTabOpeners.clear();
  pendingThreadFixedTabIntents.clear();
}
