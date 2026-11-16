import { useEffect, useRef, useState } from "react";
import { experimental_NewThreadComposer as NewThreadComposer, useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import type { NewThreadRequest, PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import type { BotMetadata, rpcContract } from "../contract";
import { useBotPageOpener } from "../hooks/use-bot-page-opener";
import { defaultConversationProjectId, projectLaunchEnvironment, conversationDraftKey } from "../lib/worktree-launch";

type CoordinatorTarget = {
  bot: BotMetadata;
  projectId: string;
  environment: NewThreadRequest["environment"];
};

function CoordinatorChat({ target }: { target: CoordinatorTarget }) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  return <section className="flex h-full min-h-0 flex-col" aria-label={`${target.bot.name} coordinator`}>
    <div className="min-h-0 flex-1" />
    <div className="mx-auto w-full max-w-4xl px-4 pb-4">
      {error ? <p role="alert" className="mb-2 text-sm text-destructive">{error}</p> : null}
      <NewThreadComposer defaultProviderId="codex" defaultModel="gpt-6.1-sol" defaultReasoningLevel="medium" defaultProjectId={target.projectId} defaultEnvironment={target.environment} layout="document" focusRequest={1} placeholder={`Message ${target.bot.name}…`} draftKey={conversationDraftKey({ botId: target.bot.id, kind: "coordinator", makeMain: false, projectId: target.projectId, environment: target.environment })} onSubmit={async (request) => {
        if (submitting.current) throw new Error("The coordinator is already being created.");
        submitting.current = true;
        setError(null);
        try {
          const { threadId } = await rpc.call("conversation_create", { botId: target.bot.id, request, coordinator: true, makeMain: false });
          navigate.toThread(threadId);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
          throw cause;
        } finally { submitting.current = false; }
      }} />
    </div>
  </section>;
}

function CoordinatorLoader({ botId }: { botId: string }) {
  const rpc = useRpc<typeof rpcContract>();
  useBotPageOpener("coordinator", botId || null);
  const [target, setTarget] = useState<CoordinatorTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    void Promise.all([rpc.call("bot_prepare", { botId }), rpc.call("bots_list", null)]).then(([bot, snapshot]) => {
      if (cancelled) return;
      if (!bot.stateReady) throw new Error("The bot’s private state could not be prepared. Try again.");
      const projectId = defaultConversationProjectId({ bot, projects: snapshot.projects, owners: snapshot.projectOwners ?? [], personalProjectId: snapshot.personalProjectId }) ?? snapshot.personalProjectId;
      setTarget({ bot, projectId, environment: projectId === snapshot.personalProjectId ? { type: "host", hostId: bot.hostId, workspace: { type: "personal" } } : projectLaunchEnvironment(bot.hostId) });
    }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { cancelled = true; };
  }, [rpc, botId, attempt]);
  if (error) return <div className="p-6"><p role="alert" className="text-sm text-destructive">{error}</p><button type="button" className="mt-3 text-sm underline" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>;
  return target ? <CoordinatorChat target={target} /> : null;
}

export function CoordinatorPanel({ subPath }: PluginNavPanelProps) {
  return <CoordinatorLoader key={subPath} botId={subPath} />;
}
