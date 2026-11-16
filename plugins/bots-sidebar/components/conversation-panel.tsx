import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { experimental_NewThreadComposer as NewThreadComposer, useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import type { NewThreadRequest, PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import type { BotMetadata, rpcContract } from "../contract";
import { conversationDraftKey } from "../lib/worktree-launch";
import { useBotPageOpener } from "../hooks/use-bot-page-opener";

export type ConversationTarget = {
  bot: BotMetadata;
  kind: "bot" | "project" | "worktree" | "fork";
  projectId: string;
  environment: NewThreadRequest["environment"];
  makeMain: boolean;
  sourceThreadId?: string;
};

const id = z.string().min(1);
const launchSchema = z.object({
  botId: id,
  kind: z.enum(["bot", "project", "worktree", "fork"]),
  projectId: id,
  makeMain: z.boolean(),
  sourceThreadId: id.optional(),
  environment: z.discriminatedUnion("type", [
    z.object({ type: z.literal("reuse"), environmentId: id }).strict(),
    z.object({ type: z.literal("host"), hostId: id, workspace: z.discriminatedUnion("type", [
      z.object({ type: z.literal("personal") }).strict(),
      z.object({ type: z.literal("unmanaged"), path: z.null() }).strict(),
      z.object({ type: z.literal("managed-worktree"), baseBranch: z.object({ kind: z.literal("default") }).strict() }).strict(),
    ]) }).strict(),
  ]),
  launchId: id,
}).strict().refine(value => value.kind !== "fork" || Boolean(value.sourceThreadId), "A fork needs its source conversation.");
type ConversationLaunch = z.infer<typeof launchSchema>;

export function conversationPanelPath(target: ConversationTarget): string {
  const { bot, ...seed } = target;
  return btoa(JSON.stringify(launchSchema.parse({ ...seed, botId: bot.id, launchId: crypto.randomUUID() }))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function parseLaunch(subPath: string): ConversationLaunch {
  return launchSchema.parse(JSON.parse(atob(subPath.replaceAll("-", "+").replaceAll("_", "/"))));
}

export function conversationLaunchBotId(subPath: string): string | null {
  try { return parseLaunch(subPath).botId; } catch { return null; }
}

const submissions = new Map<string, Promise<{ threadId: string }>>();

function ConversationChat({ launch, bot }: { launch: ConversationLaunch; bot: BotMetadata }) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const mounted = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    const existing = submissions.get(launch.launchId);
    if (existing) {
      setPending(true);
      void existing.then(({ threadId }) => { if (mounted.current) navigate.toThread(threadId); }, cause => {
        if (mounted.current) { setError(cause instanceof Error ? cause.message : String(cause)); setPending(false); }
      });
    }
    return () => { mounted.current = false; };
  }, [launch.launchId, navigate]);
  const title = launch.kind === "worktree" ? "New conversation in worktree" : launch.kind === "fork" ? "Fork conversation" : launch.kind === "project" ? "New conversation in project" : "New conversation";
  return <section className="flex h-full min-h-0 flex-col" aria-label={title}>
    <div className="min-h-0 flex-1" />
    <div className="mx-auto w-full max-w-4xl px-4 pb-4">
      <NewThreadComposer defaultProviderId="codex" defaultModel="gpt-6.1-sol" defaultReasoningLevel="medium" defaultProjectId={launch.projectId} defaultEnvironment={launch.environment} layout="contained" focusRequest={1} placeholder={`Message ${bot.name}…`} draftKey={conversationDraftKey(launch)} onSubmit={async request => {
        if (submissions.has(launch.launchId)) throw new Error("A conversation is already being created.");
        setPending(true); setError(null);
        const creation = (async () => {
          const snapshot = await rpc.call("bots_list", null);
          const current = snapshot.bots.find(entry => entry.id === launch.botId);
          if (!current) throw new Error("This bot is no longer available.");
          if (request.projectId !== snapshot.personalProjectId && (request.projectId === current.legacyHomeProjectId || !snapshot.projects.some(project => project.id === request.projectId))) throw new Error("Choose no project or an available work project.");
          return launch.kind === "fork" && launch.sourceThreadId
            ? rpc.call("conversation_fork", { botId: launch.botId, sourceThreadId: launch.sourceThreadId, request })
            : rpc.call("conversation_create", { botId: launch.botId, request, makeMain: launch.makeMain });
        })();
        submissions.set(launch.launchId, creation);
        try {
          const { threadId } = await creation;
          if (mounted.current) navigate.toThread(threadId);
        } catch (cause) {
          submissions.delete(launch.launchId);
          if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
          throw cause;
        } finally { if (mounted.current) setPending(false); }
      }} />
      {error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
      {pending ? <p role="status" className="mt-2 text-sm text-muted-foreground">Creating conversation…</p> : null}
    </div>
  </section>;
}

function ConversationLoader({ subPath }: { subPath: string }) {
  const rpc = useRpc<typeof rpcContract>();
  useBotPageOpener("conversation", conversationLaunchBotId(subPath));
  const [target, setTarget] = useState<{ launch: ConversationLaunch; bot: BotMetadata } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    void (async () => {
      const launch = parseLaunch(subPath);
      const bot = await rpc.call("bot_prepare", { botId: launch.botId });
      if (!bot.stateReady) throw new Error("The bot’s private state could not be prepared. Try again.");
      if (!cancelled) setTarget({ launch, bot });
    })().catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { cancelled = true; };
  }, [rpc, subPath, attempt]);
  if (error) return <div className="p-6"><p role="alert" className="text-sm text-destructive">{error}</p><button type="button" className="mt-3 text-sm underline" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>;
  return target ? <ConversationChat {...target} /> : null;
}

export function ConversationPanel({ subPath }: PluginNavPanelProps) {
  return <ConversationLoader key={subPath} subPath={subPath} />;
}
