import { useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import type { BotAvatar, BotMetadata, ProjectCreateInput, ProjectOwner } from "../contract";
import { randomAvatar } from "../lib/appearance";
import { usePortalScopeProps } from "../lib/portal-scope";
import { cn, formatHomePathForDisplay } from "../lib/utils";
import { AvatarColorSwatches, AvatarShapePicker } from "./avatar-appearance";
import { BotIcon } from "./bot-icon";
import { useFolderChooser, type ProjectChoice, type ProjectCreationActions, type ProjectHost } from "./folder-chooser";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

export type NewBotFields = Pick<BotMetadata, "hostId" | "name" | "role" | "avatar" | "sectionId" | "linkedProjectIds" | "soul" | "memory" | "settings"> & { ownedProjectIds: string[]; defaultProjectId: string | null };

type ProjectFolderChoice =
  | { kind: "none" }
  | { kind: "existing"; project: ProjectChoice }
  | { kind: "folder"; input: ProjectCreateInput }
  | { kind: "created"; project: ProjectChoice; hostId: string };

const MENU_ITEM_CLASS = "bot-menu-item cursor-default select-none truncate rounded-sm px-2 py-1.5 text-xs outline-none data-[disabled]:opacity-40";

export function BotCreateDialog({ hosts, projects, owners, botNames, onClose, onCreate, onCreateProject, onBrowseProjects, nativeFolderPicker }: ProjectCreationActions & {
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
  const [createdFolder, setCreatedFolder] = useState<{ project: ProjectChoice; hostId: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const portalScope = usePortalScopeProps();
  const hostId = hosts.find((host) => host.connected)?.id ?? hosts[0]?.id ?? null;
  const ready = Boolean(name.trim()) && hostId !== null;
  const chooser = useFolderChooser({ hosts, preferredHostId: hostId, nativeFolderPicker, onBrowseProjects, primary: false, onChoose: (input) => { setError(null); setChoice({ kind: "folder", input }); } });
  const listed = createdFolder && !projects.some((project) => project.id === createdFolder.project.id) ? [createdFolder.project, ...projects] : projects;
  const otherOwner = choice.kind === "existing" ? owners.find((owner) => owner.projectId === choice.project.id) : undefined;
  const severalMachines = hosts.filter((host) => host.connected).length > 1;
  const title = choice.kind === "none" ? "No project folder" : choice.kind === "folder" ? choice.input.name : choice.project.name;
  const detail = choice.kind === "none" ? (chooser.available ? null : "Connect a machine to choose a folder.")
    : choice.kind === "folder" ? `${formatHomePathForDisplay(choice.input.path)}${severalMachines ? ` on ${hosts.find((host) => host.id === choice.input.hostId)?.name ?? choice.input.hostId}` : ""}`
    : choice.kind === "created" ? "Already created. It stays if you cancel."
    : otherOwner ? `Owned by ${botNames.get(otherOwner.botId) ?? "another bot"}. This bot joins as a member.`
    : "Existing project";
  function selectProject(project: ProjectChoice) {
    setError(null);
    setChoice(createdFolder?.project.id === project.id ? { kind: "created", ...createdFolder } : { kind: "existing", project });
  }
  const chooseLabel = choice.kind === "none" ? "Choose…" : "Change";
  const chooseName = choice.kind === "none" ? "Choose a project folder" : "Change the project folder";
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
          {chooser.browser ?? <div role="group" aria-label="Project folder" className="flex min-h-11 w-full items-center gap-2 rounded-md border border-border py-1 pr-1 pl-2.5 text-left">
            <Icon name="Folder" className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm", choice.kind === "none" ? "text-muted-foreground" : "font-medium")} title={title}>{title}</p>
              {detail ? <p className="truncate text-xs text-muted-foreground" title={choice.kind === "folder" ? choice.input.path : detail}>{detail}</p> : null}
            </div>
            {listed.length ? <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild><Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2" aria-label={chooseName} disabled={pending || chooser.busy}>{chooseLabel}<Icon name="ChevronDown" className="text-muted-foreground" aria-hidden="true" /></Button></DropdownMenu.Trigger>
              <DropdownMenu.Portal><DropdownMenu.Content {...portalScope} align="end" sideOffset={4} className="z-50 max-h-64 max-w-64 min-w-44 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
                <DropdownMenu.Item className={MENU_ITEM_CLASS} disabled={!chooser.available} onSelect={() => void chooser.choose()}>{chooser.available ? "Choose a folder…" : "Choose a folder… (no machine connected)"}</DropdownMenu.Item>
                <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />
                <DropdownMenu.Label className="px-2 py-1 text-xs text-muted-foreground">Existing projects</DropdownMenu.Label>
                {listed.map((project) => <DropdownMenu.Item key={project.id} className={MENU_ITEM_CLASS} title={project.name} onSelect={() => selectProject(project)}>{project.name}</DropdownMenu.Item>)}
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root> : <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2" aria-label={chooseName} disabled={pending || chooser.busy || !chooser.available} onClick={() => void chooser.choose()}>{chooseLabel}</Button>}
            {choice.kind === "none" ? null : <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" aria-label="Clear the project folder" disabled={pending} onClick={() => { setError(null); setChoice({ kind: "none" }); }}><Icon name="X" aria-hidden="true" /></Button>}
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
