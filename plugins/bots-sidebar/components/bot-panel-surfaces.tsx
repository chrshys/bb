import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useBbNavigate, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { PluginNavPanelProps, PluginThreadHeaderActionProps, PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import { threadBotSchema, type ThreadBot, type rpcContract } from "../contract";
import { BOT_PANEL_ACTION_ID, registerBotPanelOpener, threadSurface } from "../lib/bot-panel-bridge";
import { BotIcon } from "./bot-icon";
import { BotPanel } from "./bot-panel";
import { conversationLaunchBotId } from "./conversation-panel";

const paramsSchema = z.object({ botId: z.string().min(1) }).strict();
type ThreadBotState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; bot: ThreadBot["bot"] };

export function reportBotPanelDeclined() {
  toast.error("The bot panel could not be opened here.");
}

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

function AssignedBotPanel({ threadId }: { threadId: string }) {
  const state = useThreadBot(threadId);
  if (state.status === "loading") return <p role="status" className="p-4 text-sm text-muted-foreground">Loading bot…</p>;
  if (state.status === "error") return <p role="alert" className="p-4 text-sm text-destructive">{state.message}</p>;
  if (!state.bot) return <div role="status" className="space-y-1 p-4 text-sm text-muted-foreground">
    <p className="font-medium text-foreground">No bot for this conversation</p>
    <p>This conversation isn’t assigned to a bot. Drag it onto a bot in the sidebar, or choose Assign to bot… from its menu, and that bot’s settings will appear here.</p>
  </div>;
  return <BotPanel botId={state.bot.id} />;
}

export function BotThreadPanel({ threadId, params }: PluginThreadPanelProps) {
  if (params === null) return <AssignedBotPanel threadId={threadId} />;
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) return <p role="alert" className="p-4 text-sm text-destructive">This bot tab can no longer be shown. Close it and open the bot again.</p>;
  return <BotPanel botId={parsed.data.botId} />;
}

export function BotHeaderAction({ threadId }: PluginThreadHeaderActionProps) {
  const navigate = useBbNavigate();
  const state = useThreadBot(threadId);
  const open = useCallback((botId: string, title: string) => navigate.openThreadPanel({ actionId: BOT_PANEL_ACTION_ID, title, params: { botId } }), [navigate]);
  useEffect(() => registerBotPanelOpener(threadSurface(threadId), (request) => open(request.botId, request.title), reportBotPanelDeclined), [open, threadId]);
  if (state.status !== "ready" || !state.bot) return null;
  const { id, name, avatar } = state.bot;
  return <button type="button" className="flex size-7 items-center justify-center rounded-md hover:bg-state-hover" aria-label={`Open ${name} bot settings`} title={`${name} bot settings`} onClick={() => { if (!open(id, name)) reportBotPanelDeclined(); }}>
    <BotIcon avatar={{ ...avatar, motion: "still" }} size={20} />
  </button>;
}

function PageBotPanel({ botId }: { botId: string | null }) {
  return botId ? <BotPanel botId={botId} /> : <p role="status" className="p-4 text-sm text-muted-foreground">Open a bot to see its settings here.</p>;
}

export function CoordinatorBotTab({ subPath }: PluginNavPanelProps) {
  return <PageBotPanel botId={subPath || null} />;
}

export function ConversationBotTab({ subPath }: PluginNavPanelProps) {
  return <PageBotPanel botId={conversationLaunchBotId(subPath)} />;
}
