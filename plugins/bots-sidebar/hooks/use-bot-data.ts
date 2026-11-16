import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { BotMetadata, BotSection, ProjectOwner, rpcContract } from "../contract";

export type HostOption = { id: string; name: string; connected: boolean };
export type ProjectOption = { id: string; name: string };

export function useBotData() {
  const rpc = useRpc<typeof rpcContract>();
  const [bots, setBots] = useState<BotMetadata[]>([]);
  const [hosts, setHosts] = useState<HostOption[]>([]);
  const [sections, setSections] = useState<BotSection[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [threadBindings, setThreadBindings] = useState<Array<{ threadId: string; botId: string }>>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [personalProjectId, setPersonalProjectId] = useState<string | null>(null);
  const [projectOwners, setProjectOwners] = useState<ProjectOwner[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshSequence = useRef(0);
  const connectionState = useRealtimeConnectionState();
  const previousConnection = useRef(connectionState);
  const refresh = useCallback(() => {
    const sequence = ++refreshSequence.current;
    return rpc.call("bots_list").then(
      (result) => {
        if (sequence !== refreshSequence.current) return result;
        setBots(result.bots);
        setHosts(result.hosts);
        setSections(result.sections);
        setProjects(result.projects);
        setThreadBindings(result.threadBindings);
        setWarnings(result.warnings);
        setPersonalProjectId(result.personalProjectId);
        setProjectOwners(result.projectOwners ?? []);
        setLoaded(true);
        setError(null);
        return result;
      },
      (cause) => {
        if (sequence !== refreshSequence.current) return;
        setLoaded(true);
        setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
  }, [rpc]);
  const applyBot = useCallback((next: BotMetadata) => {
    refreshSequence.current++;
    setBots((current) => current.map((bot) => bot.id === next.id ? next : bot));
  }, []);
  useEffect(() => { void refresh(); return () => { refreshSequence.current++; }; }, [refresh]);
  useEffect(() => {
    if (connectionState === "connected" && previousConnection.current !== "connected") void refresh();
    previousConnection.current = connectionState;
  }, [connectionState, refresh]);
  useRealtime("project-bots-changed", refresh);
  return { rpc, bots, hosts, sections, projects, threadBindings, warnings, personalProjectId, projectOwners, loaded, error, refresh, applyBot };
}
export type BotData = ReturnType<typeof useBotData>;
