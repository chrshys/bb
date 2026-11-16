import { useEffect } from "react";
import { showBotPage, type BotPageId } from "../lib/bot-panel-tab";

export function useShownBotPage(page: BotPageId, botId: string | null, subPath: string) {
  useEffect(() => botId ? showBotPage(page, botId, subPath) : undefined, [botId, page, subPath]);
}
