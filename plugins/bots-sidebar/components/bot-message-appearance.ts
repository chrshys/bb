import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { ExperimentalThreadMessageAppearanceRegistration } from "@get-bb/plugin-sdk/app";
import { threadAppearanceSchema, type ThreadAppearance, type rpcContract } from "../contract";

export const useBotMessageAppearance: ExperimentalThreadMessageAppearanceRegistration["useAppearance"] = ({ threadId }) => {
  const rpc = useRpc<typeof rpcContract>();
  const [resolved, setResolved] = useState<{ threadId: string; value: ThreadAppearance } | null>(null);
  const refresh = useRef<() => void>(() => {});
  const changed = useCallback(() => refresh.current(), []);
  useRealtime("project-bots-changed", changed);
  useEffect(() => {
    let disposed = false;
    let generation = 0;
    const load = async () => {
      const current = ++generation;
      setResolved(null);
      try {
        const value = threadAppearanceSchema.parse(await rpc.call("thread_appearance", { threadId }));
        if (!disposed && current === generation) setResolved({ threadId, value });
      } catch {
        if (!disposed && current === generation) setResolved(null);
      }
    };
    refresh.current = () => { void load(); };
    void load();
    return () => { disposed = true; refresh.current = () => {}; };
  }, [rpc, threadId]);
  if (resolved?.threadId !== threadId || !resolved.value.available || resolved.value.state !== "assigned") return null;
  return { humanMessageBackgroundColor: resolved.value.color };
};
