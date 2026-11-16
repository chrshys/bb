import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { BotStore } from "./bot-store";

type CloseProtectionApi = {
  register(input: { id: string; resolve(threadId: string): string | null }): { dispose(): void };
};

export function registerCoordinatorPersistence(bb: BbPluginApi, store: BotStore) {
  const host = bb as BbPluginApi & { experimental_threadCloseProtection?: CloseProtectionApi };
  if (!host.experimental_threadCloseProtection) {
    bb.log.warn("This BB core cannot enforce coordinator close protection. Upgrade to a core with experimental_threadCloseProtection; the saved coordinator will still never be silently replaced.");
    return;
  }
  const protection = host.experimental_threadCloseProtection.register({
    id: "coordinator",
    resolve(threadId) {
      const botId = store.owner(threadId);
      const bot = botId ? store.get(botId) : null;
      return bot?.coordinatorThreadId === threadId ? "This bot’s coordinator is persistent. Stop work or compact context instead of archiving or deleting it." : null;
    },
  });
  bb.onDispose(() => protection.dispose());
}
