import { useRef, useState } from "react";
import type { BotAvatar, BotMetadata, ProjectCreateInput, ProjectOwner } from "../contract";
import { randomAvatar } from "../lib/appearance";
import { AvatarColorSwatches, AvatarShapePicker } from "./avatar-appearance";
import { BotIcon } from "./bot-icon";
import { ProjectCreateForm, type ProjectChoice, type ProjectCreationActions, type ProjectHost } from "./project-create-form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type NewBotFields = Pick<BotMetadata, "hostId" | "name" | "role" | "avatar" | "sectionId" | "linkedProjectIds" | "soul" | "memory" | "settings"> & { ownedProjectIds: string[]; defaultProjectId: string | null };

type ProjectFolderChoice =
  | { kind: "none" }
  | { kind: "existing"; project: ProjectChoice }
  | { kind: "folder"; input: ProjectCreateInput }
  | { kind: "created"; project: ProjectChoice; hostId: string };

const NO_PROJECT = "none";
const NEW_FOLDER = "folder";
const CHOOSE_FOLDER = "choose-folder";
const existingValue = (projectId: string) => `project:${projectId}`;

export function BotCreateDialog({ hosts, projects, owners, botNames, onClose, onCreate, onCreateProject, onBrowseProjects }: ProjectCreationActions & {
  hosts: ProjectHost[];
  projects: ProjectChoice[];
  owners: ProjectOwner[];
  botNames: Map<string, string>;
  onClose: () => void;
  onCreate: (value: NewBotFields) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<BotAvatar>(() => randomAvatar());
  const [choice, setChoice] = useState<ProjectFolderChoice>({ kind: "none" });
  const [choosingFolder, setChoosingFolder] = useState(false);
  const [createdFolder, setCreatedFolder] = useState<{ project: ProjectChoice; hostId: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const hostId = hosts.find((host) => host.connected)?.id ?? hosts[0]?.id ?? null;
  const canBrowse = hosts.some((host) => host.connected);
  const ready = Boolean(name.trim()) && hostId !== null && !choosingFolder;
  const listed = createdFolder && !projects.some((project) => project.id === createdFolder.project.id) ? [createdFolder.project, ...projects] : projects;
  const selected = choice.kind === "none" ? NO_PROJECT : choice.kind === "folder" ? NEW_FOLDER : existingValue(choice.project.id);
  const otherOwner = choice.kind === "existing" ? owners.find((owner) => owner.projectId === choice.project.id) : undefined;
  const hint = choice.kind === "none" ? "The bot works in your personal workspace."
    : choice.kind === "folder" ? `Creates a project in ${choice.input.path} when you create the bot.`
    : choice.kind === "created" ? `“${choice.project.name}” is already created and stays if you cancel.`
    : otherOwner ? `Owned by ${botNames.get(otherOwner.botId) ?? "another bot"}. This bot joins as a member.`
    : "New conversations start in this project.";
  function select(value: string) {
    if (value === selected) return;
    const project = listed.find((entry) => existingValue(entry.id) === value);
    if (value !== CHOOSE_FOLDER && value !== NO_PROJECT && !project) return;
    setError(null);
    if (value === CHOOSE_FOLDER) setChoosingFolder(true);
    else if (project && createdFolder?.project.id === project.id) setChoice({ kind: "created", ...createdFolder });
    else setChoice(project ? { kind: "existing", project } : { kind: "none" });
  }
  async function submit() {
    if (saving.current || !ready || hostId === null) return;
    saving.current = true; setPending(true); setError(null);
    try {
      let project: ProjectChoice | null = null;
      let owned = false;
      let botHostId = hostId;
      if (choice.kind === "existing") project = choice.project;
      if (choice.kind === "folder") {
        project = await onCreateProject(choice.input);
        setCreatedFolder({ project, hostId: choice.input.hostId });
        setChoice({ kind: "created", project, hostId: choice.input.hostId });
        owned = true; botHostId = choice.input.hostId;
      }
      if (choice.kind === "created") { project = choice.project; owned = true; botHostId = choice.hostId; }
      await onCreate({
        hostId: botHostId, name: name.trim(), role: "Assistant", avatar, sectionId: null, soul: "", memory: "", settings: {},
        linkedProjectIds: project ? [project.id] : [], ownedProjectIds: project && owned ? [project.id] : [], defaultProjectId: project?.id ?? null,
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { saving.current = false; setPending(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving.current) onClose(); }}>
    <DialogContent className="bot-create-dialog flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-sm">
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <DialogHeader className="shrink-0 px-5 pt-5 pr-10">
          <DialogTitle>Create new bot</DialogTitle>
          <DialogDescription className="sr-only">Choose a name, a shape and a color, and optionally a project folder. Everything else can be changed later in Edit bot.</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto px-5 py-5">
          <BotIcon avatar={avatar} size={96} label="Bot preview" />
          <Input autoFocus aria-label="Bot name" className="h-10 text-center" value={name} maxLength={120} disabled={pending} placeholder="Name your bot" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault(); event.stopPropagation(); void submit();
          }} />
          <AvatarShapePicker avatar={avatar} onChange={setAvatar} size="large" />
          <AvatarColorSwatches avatar={avatar} onChange={setAvatar} size="large" customColor={false} />
          {choosingFolder ? <div role="group" aria-label="New project folder" className="w-full rounded-md border border-border p-3">
            <ProjectCreateForm
              hosts={hosts}
              defaultHostId={choice.kind === "folder" ? choice.input.hostId : hostId ?? undefined}
              defaultName={choice.kind === "folder" ? choice.input.name : name.trim()}
              defaultPath={choice.kind === "folder" ? choice.input.path : ""}
              onCreateProject={onCreateProject}
              onBrowseProjects={onBrowseProjects}
              onCreated={() => {}}
              onBusyChange={() => {}}
              onCancel={() => setChoosingFolder(false)}
              onChoose={(input) => { setChoice({ kind: "folder", input }); setChoosingFolder(false); }}
            />
          </div> : <div className="w-full space-y-1.5">
            <Select value={selected} onValueChange={select} disabled={pending}>
              <SelectTrigger aria-label="Project folder" className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>No project folder</SelectItem>
                {choice.kind === "folder" ? <SelectItem value={NEW_FOLDER}>{choice.input.name} (new project)</SelectItem> : null}
                {listed.map((project) => <SelectItem key={project.id} value={existingValue(project.id)}>{project.name}</SelectItem>)}
                <SelectItem value={CHOOSE_FOLDER} disabled={!canBrowse}>{canBrowse ? choice.kind === "folder" ? "Choose a different folder…" : "Choose a folder…" : "Choose a folder… (no machine connected)"}</SelectItem>
              </SelectContent>
            </Select>
            <p className="truncate text-center text-xs text-muted-foreground" title={hint}>{hint}</p>
          </div>}
        </div>
        {hostId === null ? <p role="status" className="shrink-0 px-5 pb-3 text-center text-xs text-muted-foreground">No machine is available. Connect a machine to BB before creating a bot.</p> : null}
        {error ? <p role="alert" className="max-h-20 shrink-0 overflow-y-auto px-5 pb-3 text-center text-xs text-destructive">{error}</p> : null}
        <DialogFooter className="shrink-0 gap-2 border-t border-border px-5 py-3 sm:gap-0">
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending || !ready}>{pending ? "Creating..." : "Create"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
