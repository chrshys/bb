export const BOT_PANEL_ACTION_ID = "bot";
export const BOT_PANEL_TAB_ID = "bot";
export const BOT_PANEL_SECTIONS = ["appearance", "setup", "instructions", "memory", "settings", "projects"] as const;
export type BotPanelSection = (typeof BOT_PANEL_SECTIONS)[number];
export type BotPanelRequest = { botId: string; title: string; section: BotPanelSection | null };
type Opener = (request: BotPanelRequest) => boolean;

const QUEUE_TTL_MS = 30_000;
const openers = new Map<string, Opener[]>();
const queued = new Map<string, { request: BotPanelRequest; at: number }>();
const sections = new Map<string, BotPanelSection>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  for (const listener of [...listeners]) listener();
}

export function threadSurface(threadId: string) {
  return `thread:${threadId}`;
}

export function pageSurface(botId: string) {
  return `page:${botId}`;
}

function deliver(opener: Opener, request: BotPanelRequest): boolean {
  if (!opener(request)) return false;
  if (request.section) { sections.set(request.botId, request.section); emit(); }
  return true;
}

export function openBotPanelOn(surface: string, request: BotPanelRequest): "opened" | "declined" | "queued" {
  const opener = openers.get(surface)?.at(-1);
  if (opener) return deliver(opener, request) ? "opened" : "declined";
  queued.set(surface, { request, at: Date.now() });
  return "queued";
}

export function hasBotPanelOpener(surface: string): boolean {
  return openers.has(surface);
}

export function registerBotPanelOpener(surface: string, opener: Opener, onDeclined: (request: BotPanelRequest) => void): () => void {
  openers.set(surface, [...(openers.get(surface) ?? []), opener]);
  const waiting = queued.get(surface);
  queued.delete(surface);
  if (waiting && Date.now() - waiting.at <= QUEUE_TTL_MS && !deliver(opener, waiting.request)) onDeclined(waiting.request);
  return () => {
    const remaining = (openers.get(surface) ?? []).filter((entry) => entry !== opener);
    if (remaining.length) openers.set(surface, remaining);
    else openers.delete(surface);
  };
}

export function subscribeBotPanelSections(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function botPanelSectionsVersion() {
  return version;
}

export function takeRequestedSection(botId: string): BotPanelSection | null {
  const section = sections.get(botId) ?? null;
  sections.delete(botId);
  return section;
}

export function resetBotPanelBridgeForTest() {
  openers.clear();
  queued.clear();
  sections.clear();
}
