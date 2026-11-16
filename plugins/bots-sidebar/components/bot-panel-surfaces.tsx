import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { experimental_useFixedTabTarget, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { ExperimentalFixedTabTargetState, ExperimentalThreadPinnedTabProps, PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { threadBotSchema, type ThreadBot, type rpcContract } from "../contract";
import { botPageTabs, botsPinnedTab, type BotPanelTarget } from "../lib/bot-panel-tab";
import { BotPanel, type BotPanelSectionRequest } from "./bot-panel";
import { conversationLaunchBotId } from "./conversation-panel";

type ThreadBotState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; bot: ThreadBot["bot"] };

function useThreadBot(threadId: string): ThreadBotState {
  const rpc = useRpc<typeof rpcContract>();
  const [state, setState] = useState<ThreadBotState & { threadId: string }>({ status: "loading", threadId });
  const refresh = useRef<() => void>(() => {});
  const changed = useCallback(() => refresh.current(), []);
  useRealtime("project-bots-changed", changed);
  useEffect(() => {
    let disposed = false;
    let generation = 0;
    const load = async () => {
      const current = ++generation;
      try {
        const { bot } = threadBotSchema.parse(await rpc.call("thread_bot", { threadId }));
        if (!disposed && current === generation) setState({ status: "ready", bot, threadId });
      } catch (cause) {
        if (!disposed && current === generation) setState({ status: "error", message: cause instanceof Error ? cause.message : String(cause), threadId });
      }
    };
    refresh.current = () => { void load(); };
    void load();
    return () => { disposed = true; refresh.current = () => {}; };
  }, [rpc, threadId]);
  return state.threadId === threadId ? state : { status: "loading" };
}

function useSectionRequest(target: ExperimentalFixedTabTargetState<BotPanelTarget> | null, botId: string | null): BotPanelSectionRequest | null {
  const section = target && target.target.botId === botId ? target.target.section : null;
  const clear = target?.clear;
  return useMemo(() => section && clear ? { section, shown: clear } : null, [clear, section]);
}

export function BotsPinnedTab({ threadId }: ExperimentalThreadPinnedTabProps) {
  const state = useThreadBot(threadId);
  const target = experimental_useFixedTabTarget(botsPinnedTab);
  const botId = state.status === "ready" ? state.bot?.id ?? target?.target.botId ?? null : null;
  const sectionRequest = useSectionRequest(target, botId);
  if (state.status === "loading") return <p role="status" className="p-4 text-sm text-muted-foreground">Loading bot…</p>;
  if (state.status === "error") return <p role="alert" className="p-4 text-sm text-destructive">{state.message}</p>;
  if (!botId) return <div role="status" className="space-y-1 p-4 text-sm text-muted-foreground">
    <p className="font-medium text-foreground">No bot for this conversation</p>
    <p>This conversation isn’t assigned to a bot. Drag it onto a bot in the sidebar, or choose Assign to bot… from its menu, and that bot’s settings will appear here.</p>
  </div>;
  return <BotPanel botId={botId} sectionRequest={sectionRequest} />;
}

function PageBotPanel({ page, botId }: { page: keyof typeof botPageTabs; botId: string | null }) {
  const sectionRequest = useSectionRequest(experimental_useFixedTabTarget(botPageTabs[page]), botId);
  return botId ? <BotPanel botId={botId} sectionRequest={sectionRequest} /> : <p role="status" className="p-4 text-sm text-muted-foreground">Open a bot to see its settings here.</p>;
}

export function CoordinatorBotTab({ subPath }: PluginNavPanelProps) {
  return <PageBotPanel page="coordinator" botId={subPath || null} />;
}

export function ConversationBotTab({ subPath }: PluginNavPanelProps) {
  return <PageBotPanel page="conversation" botId={conversationLaunchBotId(subPath)} />;
}
