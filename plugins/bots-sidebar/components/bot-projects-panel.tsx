import { useState } from "react";
import type { ProjectOwner } from "../contract";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useFolderChooser, type ProjectChoice, type ProjectCreationActions, type ProjectHost } from "./folder-chooser";

export function BotProjectsPanel({ projects, owners, botNames, botId, hostId, hosts, linkedProjectIds, ownedProjectIds, busy, onRoleChange, onCreateProject, onBrowseProjects, nativeFolderPicker }: ProjectCreationActions & {
  projects: ProjectChoice[]; owners: ProjectOwner[]; botNames: Map<string, string>; botId: string; hostId: string; hosts: ProjectHost[];
  linkedProjectIds: string[]; ownedProjectIds: string[]; busy: boolean; onRoleChange: (projectId: string, role: "none" | "member" | "owner") => void;
}) {
  const [mode, setMode] = useState<"linked" | "existing">("linked");
  const [query, setQuery] = useState("");
  const [createdProjects, setCreatedProjects] = useState<ProjectChoice[]>([]);
  const available = [...projects, ...createdProjects.filter((created) => !projects.some((project) => project.id === created.id))];
  const linked = linkedProjectIds.map((id) => available.find((project) => project.id === id) ?? { id, name: `Unavailable project (${id})` });
  const candidates = available.filter((project) => !linkedProjectIds.includes(project.id) && project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  function changeMode(next: typeof mode) { setMode(next); setQuery(""); }
  function ownerName(projectId: string) { const owner = owners.find((entry) => entry.projectId === projectId && entry.botId !== botId); return owner ? botNames.get(owner.botId) ?? "another bot" : null; }
  const chooser = useFolderChooser({ hosts, preferredHostId: hostId, nativeFolderPicker, onBrowseProjects, confirmLabel: "Create project", busyLabel: "Creating…", onChoose: async (input) => {
    const project = await onCreateProject(input);
    setCreatedProjects((current) => [...current.filter((entry) => entry.id !== project.id), project]);
    onRoleChange(project.id, "owner");
  } });
  if (chooser.browser) return chooser.browser;
  if (mode === "existing") return <div className="space-y-2">
    <div className="flex items-center justify-between"><span className="text-xs font-medium">Add existing project</span><button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => changeMode("linked")}>Back to linked projects</button></div>
    <Input autoFocus className="h-8" aria-label="Search projects" placeholder="Search projects…" value={query} onChange={(event) => setQuery(event.target.value)} />
    <div className="space-y-1">{candidates.map((project) => <button key={project.id} type="button" className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-state-hover" aria-label={`Link ${project.name}`} disabled={busy} onClick={() => {
      const wasOwned = createdProjects.some((entry) => entry.id === project.id) || owners.some((entry) => entry.projectId === project.id && entry.botId === botId);
      onRoleChange(project.id, wasOwned ? "owner" : "member"); changeMode("linked");
    }}><span className="min-w-0 truncate">{project.name}{ownerName(project.id) ? <span className="block text-[10px] text-muted-foreground">Owned by {ownerName(project.id)}</span> : null}</span><span className="text-muted-foreground" aria-hidden="true">+</span></button>)}
      {!candidates.length ? <p className="py-3 text-xs text-muted-foreground">{query.trim() ? "No matching projects" : "All available projects are already linked."}</p> : null}
    </div>
  </div>;
  return <div className="bot-projects-panel space-y-3">
    <div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => changeMode("existing")}>Add existing…</Button><Button type="button" size="sm" variant="outline" disabled={busy || chooser.busy || !chooser.available} onClick={() => void chooser.choose()}>{chooser.busy ? "Creating…" : "New project…"}</Button></div>
    {linked.length ? <div className="divide-y divide-border rounded-md border border-border">{linked.map((project) => {
      const otherOwner = ownerName(project.id);
      return <div key={project.id} className="flex items-center gap-2 px-2 py-1.5"><span className="min-w-0 flex-1 truncate text-xs" title={project.name}>{project.name}{otherOwner ? <span className="block truncate text-[10px] text-muted-foreground">Owned by {otherOwner}</span> : null}</span>
        <select className="h-7 max-w-28 shrink-0 rounded-md border border-input bg-background px-2 text-xs text-foreground" aria-label={`${project.name} role`} disabled={busy} value={ownedProjectIds.includes(project.id) ? "owner" : "member"} onChange={(event) => onRoleChange(project.id, event.target.value as "member" | "owner")}><option value="member">Member</option><option value="owner" disabled={Boolean(otherOwner)}>{otherOwner ? `Owner (${otherOwner})` : "Owner"}</option></select>
        <button type="button" className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-state-hover hover:text-foreground" aria-label={`Unlink ${project.name}`} title="Unlink project" disabled={busy} onClick={() => onRoleChange(project.id, "none")}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m3 3 6 6m0-6-6 6" /></svg></button>
      </div>;
    })}</div> : <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground"><p className="font-medium">No projects linked</p><p className="mt-1 text-[11px]">This bot can still chat without a project.</p></div>}
    <p className="text-[11px] leading-4 text-muted-foreground">Owner receives new project chats. Member is used when you explicitly choose this bot.</p>
    <p className="text-[11px] leading-4 text-muted-foreground">Changes here are saved immediately. Unlinking never deletes a project or its files.</p>
  </div>;
}
