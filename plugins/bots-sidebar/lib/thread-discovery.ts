import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { ActiveThreadStatus } from "../contract";
import type { BotStore } from "./bot-store";

type Thread = Pick<
  Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["get"]>>,
  "id" | "parentThreadId" | "sourceThreadId"
>;
type ListedThread = Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["list"]>>[number];

export async function* liveThreadPages(bb: BbPluginApi, signal?: AbortSignal) {
  for (let offset = 0; ; offset += 100) {
    signal?.throwIfAborted();
    const page = await bb.sdk.threads.list({
      archived: false,
      includeHidden: true,
      offset,
      limit: 100,
      signal,
    });
    yield page;
    if (page.length < 100) return;
  }
}

export const isWorkingThreadStatus = (status: string) =>
  ["active", "starting", "stopping"].includes(status);

export function threadActivityStatus(
  thread: Pick<ListedThread, "runtime" | "hasPendingInteraction" | "activity" | "queuedWork">,
): ActiveThreadStatus | "idle" | "error" {
  if (thread.hasPendingInteraction) return "waiting-for-input";
  const runtime = thread.runtime.displayStatus;
  if (["waiting-for-host", "host-reconnecting"].includes(runtime)) return "waiting-for-host";
  if (
    runtime === "active" ||
    runtime === "pending" ||
    runtime === "provisioning" ||
    runtime === "starting" ||
    runtime === "stopping"
  )
    return runtime;
  if (Object.values(thread.activity ?? {}).some((count) => count > 0)) return "active";
  return runtime === "error" || thread.queuedWork === "failed" ? "error" : "idle";
}

export function createThreadOwnerResolver(
  store: BotStore,
  getThread: (threadId: string) => Promise<Thread>,
) {
  return async (threadId: string, persist = true): Promise<string | null> => {
    const chain: string[] = [];
    let current: string | null = threadId;
    let botId: string | null = null;
    while (current) {
      if (chain.includes(current) || chain.length >= 128)
        throw new Error("Thread ancestry could not be fully resolved");
      const explicit = store.owner(current);
      if (explicit) {
        botId = explicit;
        break;
      }
      const thread = await getThread(current);
      chain.push(current);
      botId =
        (thread.parentThreadId && store.owner(thread.parentThreadId)) ||
        (thread.sourceThreadId && store.owner(thread.sourceThreadId)) ||
        null;
      if (botId) break;
      current = thread.parentThreadId ?? thread.sourceThreadId;
    }
    if (botId && persist) for (const id of chain) store.bind(id, botId);
    return botId;
  };
}
