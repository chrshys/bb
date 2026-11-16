import { useEffect, useRef, useState } from "react";
import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import type { ExperimentalNativeFolderPicker } from "@get-bb/plugin-sdk/app";
import type { ProjectCreateInput } from "../contract";
import { childFolderPath, folderName } from "../lib/folder";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export type ProjectChoice = { id: string; name: string };
export type ProjectHost = { id: string; name: string; connected: boolean };
export type ProjectDirectory = { directory: string; parent: string | null; entries: { name: string; path: string }[]; truncated: boolean };
export type ProjectCreationActions = {
  onCreateProject: (input: ProjectCreateInput) => Promise<ProjectChoice>;
  onBrowseProjects: (input: { hostId: string; path?: string }) => Promise<ProjectDirectory>;
  nativeFolderPicker: ExperimentalNativeFolderPicker;
};
type FolderPick = Pick<ProjectCreateInput, "hostId" | "path" | "name">;

const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);

export function useFolderChooser({ hosts, preferredHostId, nativeFolderPicker, onBrowseProjects, onChoose, onDismiss, confirmLabel = "Use this folder", busyLabel = "Saving…" }: Pick<ProjectCreationActions, "onBrowseProjects" | "nativeFolderPicker"> & {
  hosts: ProjectHost[];
  preferredHostId?: string | null;
  onChoose: (input: ProjectCreateInput) => void | Promise<void>;
  onDismiss?: () => void;
  confirmLabel?: string;
  busyLabel?: string;
}) {
  const connected = hosts.filter((host) => host.connected);
  const host = connected.find((entry) => entry.id === preferredHostId) ?? connected[0] ?? null;
  const [browsing, setBrowsing] = useState<{ path?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  const active = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function accept(pick: FolderPick) {
    const key = `${pick.hostId}\n${pick.path}`;
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    setBusy(true); setError(null);
    try {
      await onChoose({ requestId: request.current.id, ...pick });
      if (mounted.current) setBrowsing(null);
    } catch (cause) {
      if (mounted.current) { setError(message(cause)); setBrowsing((current) => current ?? { path: pick.path }); }
    } finally { if (mounted.current) setBusy(false); }
  }
  async function choose() {
    if (active.current || !host) return;
    if (connected.length === 1 && nativeFolderPicker.hostId === host.id) {
      active.current = true; setBusy(true);
      let path: string | null | undefined;
      try { path = await nativeFolderPicker.pickFolder(); } catch { path = undefined; } finally { active.current = false; }
      if (!mounted.current) return;
      setBusy(false);
      if (path === null) { onDismiss?.(); return; }
      const name = path ? folderName(path) : "";
      if (path && name) { await accept({ hostId: host.id, path, name }); return; }
    }
    setError(null); setBrowsing({});
  }
  const browser = browsing && host ? <FolderBrowser
    hosts={connected} defaultHostId={host.id} initialPath={browsing.path} busy={busy} error={error} confirmLabel={confirmLabel} busyLabel={busyLabel}
    onBrowseProjects={onBrowseProjects} onPick={accept}
    onClose={() => { setBrowsing(null); setError(null); onDismiss?.(); }}
  /> : null;
  return { available: host !== null, busy, choose, browser };
}

function FolderBrowser({ hosts, defaultHostId, initialPath, busy, error, confirmLabel, busyLabel, onBrowseProjects, onPick, onClose }: Pick<ProjectCreationActions, "onBrowseProjects"> & {
  hosts: ProjectHost[]; defaultHostId: string; initialPath?: string; busy: boolean; error: string | null; confirmLabel: string; busyLabel: string;
  onPick: (pick: FolderPick) => void | Promise<void>; onClose: () => void;
}) {
  const [hostId, setHostId] = useState(defaultHostId);
  const [directory, setDirectory] = useState<ProjectDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const sequence = useRef(0);
  const first = useRef(initialPath);
  async function browse(targetHostId: string, path?: string) {
    const current = ++sequence.current;
    setLoading(true); setBrowseError(null); setNewFolder(null);
    try {
      const value = await onBrowseProjects({ hostId: targetHostId, ...(path ? { path } : {}) });
      if (sequence.current === current) setDirectory(value);
    } catch (cause) { if (sequence.current === current) setBrowseError(message(cause)); }
    finally { if (sequence.current === current) setLoading(false); }
  }
  useEffect(() => {
    const path = first.current; first.current = undefined;
    void browse(hostId, path);
    return () => { sequence.current++; };
  }, [hostId]);
  const name = directory ? folderName(directory.directory) : "";
  const added = newFolder?.trim() ?? "";
  const canPick = !loading && !busy && directory !== null && (newFolder === null ? Boolean(name) : Boolean(added) && !/[\\/]/u.test(added));
  function pick() {
    if (!canPick || !directory) return;
    void onPick(newFolder === null ? { hostId, path: directory.directory, name } : { hostId, path: childFolderPath(directory.directory, added), name: added.slice(0, 120) });
  }
  const shown = error ?? browseError;
  return <div role="group" aria-label="Choose a folder" className="folder-browser w-full overflow-hidden rounded-md border border-border text-left">
    {hosts.length > 1 ? <div className="border-b border-border p-1.5">
      <Select value={hostId} disabled={busy} onValueChange={(value) => { if (hosts.some((host) => host.id === value)) { setDirectory(null); setHostId(value); } }}>
        <SelectTrigger aria-label="Machine" className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{hosts.map((host) => <SelectItem key={host.id} value={host.id}>{host.name}</SelectItem>)}</SelectContent>
      </Select>
    </div> : null}
    <div className="flex items-center gap-1 border-b border-border py-1 pr-1 pl-1.5">
      <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Parent folder" disabled={loading || busy || !directory?.parent} onClick={() => { if (directory?.parent) void browse(hostId, directory.parent); }}><Icon name="ArrowUp" aria-hidden="true" /></Button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name || directory?.directory || "Folders"}</p>
        {directory && name ? <p className="truncate text-xs text-muted-foreground" title={directory.directory}>{directory.directory}</p> : null}
      </div>
      <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Close folder list" disabled={busy} onClick={onClose}><Icon name="X" aria-hidden="true" /></Button>
    </div>
    <div aria-label="Folders" className="h-36 overflow-y-auto p-1">
      {loading ? <p role="status" className="px-2 py-1.5 text-xs text-muted-foreground">Loading folders…</p> : directory?.entries.map((entry) => <button key={entry.path} type="button" className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-state-hover focus-visible:bg-state-hover focus-visible:outline-none" title={entry.path} disabled={busy} onClick={() => void browse(hostId, entry.path)}><Icon name="Folder" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="min-w-0 truncate">{entry.name}</span></button>)}
      {!loading && directory && !directory.entries.length ? <p className="px-2 py-1.5 text-xs text-muted-foreground">No folders inside</p> : null}
      {!loading && directory?.truncated ? <p className="px-2 py-1.5 text-xs text-muted-foreground">Only the first 200 folders are listed.</p> : null}
    </div>
    {shown ? <p role="alert" className="max-h-16 overflow-y-auto border-t border-border px-2.5 py-1.5 text-xs text-destructive">{shown}</p> : null}
    <div className="flex items-center gap-2 border-t border-border p-1.5">
      {newFolder === null
        ? <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" disabled={loading || busy || !directory} onClick={() => setNewFolder("")}><Icon name="FolderPlus" aria-hidden="true" />New folder</Button>
        : <Input autoFocus aria-label="New folder name" className="h-7 min-w-0 flex-1 text-xs" maxLength={120} placeholder="New folder name" value={newFolder} disabled={busy} onChange={(event) => setNewFolder(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setNewFolder(null); }
          if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); pick(); }
        }} />}
      <Button type="button" size="sm" className="ml-auto h-7 shrink-0" disabled={!canPick} onClick={pick}>{busy ? busyLabel : confirmLabel}</Button>
    </div>
  </div>;
}
