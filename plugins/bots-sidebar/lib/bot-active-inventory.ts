import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { ActiveInventory } from "../contract";
import type { BotStore } from "./bot-store";
import {
  createThreadOwnerResolver,
  liveThreadPages,
  threadActivityStatus,
} from "./thread-discovery";

export async function readBotActiveInventory(
  bb: BbPluginApi,
  store: BotStore,
  selector: { threadId: string } | { botId: string },
): Promise<ActiveInventory> {
  const result: ActiveInventory = {
    state: "ready",
    botId: null,
    coordinatorThreadId: null,
    observedAt: Date.now(),
    issue: null,
    items: [],
  };
  const bots =
    "botId" in selector
      ? [store.require(selector.botId)]
      : store.list().filter((bot) => bot.coordinatorThreadId === selector.threadId);
  if (!bots.length) return { ...result, state: "not-coordinator" };
  const bot = bots[0]!;
  result.botId = bot.id;
  result.coordinatorThreadId = bot.coordinatorThreadId ?? null;
  if (
    bots.length !== 1 ||
    (bot.coordinatorThreadId && store.owner(bot.coordinatorThreadId) !== bot.id)
  ) {
    return {
      ...result,
      state: "unavailable",
      issue: "Coordinator ownership could not be confirmed.",
    };
  }
  const signal = AbortSignal.timeout(10_000);
  type ListedThread = Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["list"]>>[number];
  const rows = new Map<string, ListedThread>();
  let pages = 0;
  try {
    for await (const page of liveThreadPages(bb, signal)) {
      pages++;
      for (const thread of page) rows.set(thread.id, thread);
      if (pages === 20 && page.length === 100) {
        result.state = "partial";
        result.issue =
          "Discovery reached its 2,000-conversation scan limit; more work may be active.";
        break;
      }
    }
  } catch {
    result.state = pages ? "partial" : "unavailable";
    result.issue = "Active work discovery could not be completed; the list may be incomplete.";
  }
  const ancestors = new Map<string, Pick<ListedThread, "id" | "parentThreadId" | "sourceThreadId">>(
    rows,
  );
  let lookups = 0;
  const resolveOwner = createThreadOwnerResolver(store, async (threadId) => {
    signal.throwIfAborted();
    const known = ancestors.get(threadId);
    if (known) return known;
    if (++lookups > 64) throw new Error("Ancestry lookup limit reached");
    const thread = await bb.sdk.threads.get({ threadId, signal });
    ancestors.set(thread.id, thread);
    return thread;
  });
  for (const thread of [...rows.values()]) {
    if (
      thread.id === bot.coordinatorThreadId ||
      thread.archivedAt !== null ||
      thread.deletedAt !== null
    )
      continue;
    const status = threadActivityStatus(thread);
    if (status === "idle" || status === "error") continue;
    try {
      signal.throwIfAborted();
      if ((await resolveOwner(thread.id, false)) !== bot.id) continue;
    } catch {
      result.state = "partial";
      result.issue = "Some conversation ownership could not be resolved; more work may be active.";
      continue;
    }
    if (result.items.length === 100) {
      result.state = "partial";
      result.issue = "Showing the first 100 active conversations; more work may be active.";
      break;
    }
    result.items.push({
      threadId: thread.id,
      projectId: thread.projectId,
      title: (thread.title ?? thread.titleFallback ?? thread.id)
        .replace(/[\x00-\x1f\x7f]/g, " ")
        .slice(0, 160),
      status,
    });
  }
  result.items.sort((a, b) => a.threadId.localeCompare(b.threadId));
  result.observedAt = Date.now();
  return result;
}
