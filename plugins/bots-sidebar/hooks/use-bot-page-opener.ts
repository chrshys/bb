import { useEffect } from "react";
import { toast } from "sonner";
import { experimental_useAppPanel } from "@get-bb/plugin-sdk/app";
import { BOT_PANEL_TAB_ID, pageSurface, registerBotPanelOpener } from "../lib/bot-panel-bridge";

export function useBotPageOpener(panelId: "conversation" | "coordinator", botId: string | null) {
  const appPanel = experimental_useAppPanel();
  useEffect(() => botId ? registerBotPanelOpener(
    pageSurface(botId),
    () => appPanel.openFixedTab({ surface: { kind: "current" }, tab: { panelId, id: BOT_PANEL_TAB_ID } }),
    () => { toast.error("The bot panel could not be opened here."); },
  ) : undefined, [appPanel, botId, panelId]);
}
