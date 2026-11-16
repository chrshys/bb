import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { ExperimentalThreadTimelineFooterProps } from "@get-bb/plugin-sdk/app";
import {
  activeInventorySchema,
  type ActiveInventory,
  type ActiveThreadStatus,
  type rpcContract,
} from "../contract";

const labels: Record<ActiveThreadStatus, string> = {
  active: "Working",
  starting: "Starting",
  provisioning: "Preparing",
  pending: "Pending",
  stopping: "Stopping",
  "waiting-for-host": "Waiting for machine",
  "waiting-for-input": "Needs input",
};

function Inventory({
  threadId,
  runtimeDisplayStatus,
  Original,
  ThreadBadge,
}: ExperimentalThreadTimelineFooterProps) {
  const rpc = useRpc<typeof rpcContract>();
  const [result, setResult] = useState<ActiveInventory | null>(null);
  const refresh = useRef<() => void>(() => {});
  const onChanged = useCallback(() => refresh.current(), []);
  useRealtime("bot-work-changed", onChanged);
  useRealtime("project-bots-changed", onChanged);
  useEffect(() => {
    let disposed = false;
    let pending = false;
    const load = async () => {
      if (pending || disposed) return;
      pending = true;
      try {
        const next = activeInventorySchema.parse(
          await rpc.call("monitoring_inventory", { threadId }),
        );
        if (!disposed) setResult(next);
      } catch {
        if (!disposed)
          setResult({
            state: "unavailable",
            botId: null,
            coordinatorThreadId: null,
            items: [],
            observedAt: Date.now(),
            issue: "Active work could not be refreshed.",
          });
      } finally {
        pending = false;
      }
    };
    refresh.current = () => {
      void load();
    };
    void load();
    const timer = runtimeDisplayStatus === "idle" ? setInterval(() => void load(), 60_000) : null;
    return () => {
      disposed = true;
      refresh.current = () => {};
      if (timer !== null) clearInterval(timer);
    };
  }, [rpc, threadId, runtimeDisplayStatus]);
  if (result?.state === "not-coordinator") return <Original />;
  return (
    <section
      aria-label="Bot active work"
      className="flex flex-col gap-2 px-1 py-2 text-sm text-muted-foreground"
    >
      {!result ? (
        <span role="status">Checking active work…</span>
      ) : (
        <>
          {result.state !== "ready" || !result.items.length ? (
            <span>
              {result.state === "unavailable"
                ? "Bot-wide work unavailable"
                : result.state === "partial"
                  ? "Active bot work (partial)"
                  : result.items.length
                    ? "Active bot work"
                    : "No active bot work"}
            </span>
          ) : null}
          {result.items.map((item) => (
            <div key={item.threadId} className="w-full">
              <ThreadBadge threadId={item.threadId} projectId={item.projectId} title={item.title} />
              <span className="sr-only">{labels[item.status]}</span>
            </div>
          ))}
          {result.issue ? <span role="status">{result.issue}</span> : null}
        </>
      )}
    </section>
  );
}

export function BotWorkFooter(props: ExperimentalThreadTimelineFooterProps) {
  return <Inventory key={props.threadId} {...props} />;
}
