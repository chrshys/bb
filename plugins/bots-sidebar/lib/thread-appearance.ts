import type { BotStore } from "./bot-store";
import { threadAppearanceSchema, type ThreadAppearance } from "../contract";

export async function readThreadAppearance(
  store: BotStore,
  resolveOwner: (threadId: string, persist: boolean) => Promise<string | null>,
  threadId: string,
  available: boolean,
): Promise<ThreadAppearance> {
  const botId = await resolveOwner(threadId, false);
  if (!botId) return { state: "unassigned", available };
  const bot = store.require(botId);
  return threadAppearanceSchema.parse({ state: "assigned", available, botId, color: bot.avatar.color, revision: bot.updatedAt });
}
