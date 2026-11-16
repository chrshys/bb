import type { ExperimentalPluginFixedTabReference, ExperimentalThreadPinnedTabReference, JsonValue } from "@get-bb/plugin-sdk/app";

export const BOT_PANEL_SECTIONS = ["appearance", "setup", "instructions", "memory", "settings", "projects"] as const;
export type BotPanelSection = (typeof BOT_PANEL_SECTIONS)[number];
export type BotPanelTarget = { botId: string; section: BotPanelSection | null };
export type BotPageId = "conversation" | "coordinator";

function isBotPanelTarget(value: JsonValue): value is BotPanelTarget {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const { botId, section } = value;
  return Object.keys(value).length === 2 && typeof botId === "string" && botId.length > 0
    && (section === null || BOT_PANEL_SECTIONS.some((name) => name === section));
}

const target = { validate: isBotPanelTarget };

export const botsPinnedTab = { id: "bots", experimental_target: target } satisfies ExperimentalThreadPinnedTabReference<BotPanelTarget>;
export const botPageTabs = {
  conversation: { panelId: "conversation", id: "bot", experimental_target: target },
  coordinator: { panelId: "coordinator", id: "bot", experimental_target: target },
} satisfies Record<BotPageId, ExperimentalPluginFixedTabReference<BotPanelTarget>>;

const shownPages = new Map<symbol, { page: BotPageId; botId: string; subPath: string }>();

export function showBotPage(page: BotPageId, botId: string, subPath: string): () => void {
  const key = Symbol(page);
  shownPages.set(key, { page, botId, subPath });
  return () => { shownPages.delete(key); };
}

export function shownBotPage(botId: string): { page: BotPageId; subPath: string } | null {
  return [...shownPages.values()].reverse().find((entry) => entry.botId === botId) ?? null;
}

export function resetBotPagesForTest() {
  shownPages.clear();
}
