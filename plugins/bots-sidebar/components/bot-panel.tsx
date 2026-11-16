import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { experimental_useNativeFolderPicker } from "@get-bb/plugin-sdk/app";
import type { BotMetadata, BotPatchValues, BotStateFile } from "../contract";
import { useBotData, type BotData } from "../hooks/use-bot-data";
import { useDraftField, useSaveSummary, type DraftField } from "../hooks/use-draft-field";
import type { BotPanelSection } from "../lib/bot-panel-tab";
import { dismissSaveError, trackSave } from "../lib/field-drafts";
import { MEMORY_MAX_CHARS } from "../lib/memory-limit";
import { AvatarAppearance } from "./avatar-appearance";
import { BotIcon } from "./bot-icon";
import { BotProjectsPanel } from "./bot-projects-panel";
import { MachineSelect } from "./machine-select";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { TooltipProvider } from "./ui/tooltip";

const SOUL_MAX_CHARS = 4096;
const SETTINGS_MAX_CHARS = 16384;
const AUTOSAVE_MS = 1500;
const SUMMARY_TEXT = { idle: "", saving: "Saving…", attention: "Some changes need attention", unsaved: "Unsaved changes", saved: "Saved" } as const;

function settingsText(settings: BotMetadata["settings"]) {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

function parseSettings(text: string): { content: string } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text, (_key, value: unknown) => {
      if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Settings numbers must be finite");
      return value;
    });
  } catch { return { error: "settings.json must contain valid JSON. Your draft is kept." }; }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return { error: "settings.json must contain a JSON object. Your draft is kept." };
  const content = `${JSON.stringify(parsed, null, 2)}\n`;
  if (content.length > SETTINGS_MAX_CHARS) return { error: `settings.json is too large (maximum ${SETTINGS_MAX_CHARS} characters). Your draft is kept.` };
  return { content };
}

function defaultProjectOf(bot: BotMetadata): string | null {
  return bot.defaultProjectId === undefined ? bot.linkedProjectIds[0] ?? null : bot.defaultProjectId;
}

function currentValues(bot: BotMetadata, changes: BotPatchValues): BotPatchValues {
  return {
    ...("name" in changes ? { name: bot.name } : {}),
    ...("role" in changes ? { role: bot.role } : {}),
    ...("avatar" in changes ? { avatar: bot.avatar } : {}),
    ...("sectionId" in changes ? { sectionId: bot.sectionId } : {}),
    ...("hostId" in changes ? { hostId: bot.hostId } : {}),
    ...("defaultProjectId" in changes ? { defaultProjectId: defaultProjectOf(bot) } : {}),
  };
}

function PanelMessage({ children, alert = false }: { children: ReactNode; alert?: boolean }) {
  return <p role={alert ? "alert" : "status"} className={`p-4 text-sm ${alert ? "text-destructive" : "text-muted-foreground"}`}>{children}</p>;
}

function FieldNotice({ field, label, showLatest = false }: { field: DraftField; label: string; showLatest?: boolean }) {
  if (field.status === "error") return <p role="alert" className="text-xs text-destructive">{field.message}</p>;
  if (field.status !== "conflict") return null;
  return <div role="alert" className="space-y-1.5 rounded-md border border-border bg-muted px-2 py-1.5 text-xs">
    <p>{label} was changed elsewhere while you were editing. Your draft is kept and has not been saved.</p>
    {showLatest ? <details><summary className="cursor-pointer text-muted-foreground">Show the latest version</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{field.latest}</pre></details> : <p className="text-muted-foreground">Latest: {field.latest || "(empty)"}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={field.revert}>Use latest</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => void field.keepMine()}>Keep mine</Button>
    </div>
  </div>;
}

function PanelCard({ section, title, detail, children }: { section: BotPanelSection; title: string; detail?: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return <Card role="group" aria-labelledby={headingId} data-bot-panel-section={section} className="space-y-3 p-3">
    <div className="flex items-baseline justify-between gap-2">
      <h3 id={headingId} className="text-sm font-medium">{title}</h3>
      {detail ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{detail}</span> : null}
    </div>
    {children}
  </Card>;
}

function DocumentEditor({ field, file, limit, mono, placeholder }: { field: DraftField; file: BotStateFile; limit: number; mono: boolean; placeholder?: string }) {
  return <>
    <textarea
      aria-label={file}
      className={`min-h-32 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-foreground ${mono ? "font-mono text-xs" : "text-sm"}`}
      value={field.value}
      spellCheck={!mono}
      placeholder={placeholder}
      aria-invalid={field.status === "error" || field.value.length > limit}
      onChange={(event) => field.change(event.target.value)}
      onBlur={() => void field.commit()}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
    />
    <FieldNotice field={field} label={file} showLatest />
  </>;
}

export type BotPanelSectionRequest = { section: BotPanelSection; shown: () => void };

function BotPanelEditor({ bot, data, sectionRequest }: { bot: BotMetadata; data: BotData; sectionRequest: BotPanelSectionRequest | null }) {
  const { rpc, hosts, sections, projects, projectOwners, bots, refresh, applyBot } = data;
  const nativeFolderPicker = experimental_useNativeFolderPicker();
  const botId = bot.id;
  const scope = `${botId}/`;
  const latest = useRef(bot);
  latest.current = bot;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const root = useRef<HTMLDivElement>(null);
  const [optimistic, setOptimistic] = useState<BotPatchValues>({});
  const [sectionDraft, setSectionDraft] = useState<string | null>(null);
  const [projectsBusy, setProjectsBusy] = useState(false);
  const { summary, error: saveError } = useSaveSummary(scope);
  const requestedSection = sectionRequest?.section ?? null;
  const sectionShown = sectionRequest?.shown;

  useEffect(() => {
    if (!requestedSection) return;
    root.current?.querySelector<HTMLElement>(`[data-bot-panel-section="${requestedSection}"]`)?.scrollIntoView?.({ block: "start" });
    sectionShown?.();
  }, [botId, requestedSection, sectionShown]);

  function apply(next: BotMetadata) {
    latest.current = next;
    applyBot(next);
  }
  function enqueue<T>(run: () => Promise<T>): Promise<T> {
    const result = queue.current.catch(() => {}).then(run);
    queue.current = result;
    return result;
  }
  function patch(changes: BotPatchValues, expected?: BotPatchValues) {
    return enqueue(async () => {
      try {
        const next = await rpc.call("bot_patch", { botId, expected: expected ?? currentValues(latest.current, changes), changes });
        apply(next);
        return next;
      } catch (cause) {
        void refresh();
        throw cause;
      }
    });
  }
  function saveNow(changes: BotPatchValues) {
    setOptimistic((current) => ({ ...current, ...changes }));
    const keys = Object.keys(changes) as Array<keyof BotPatchValues>;
    return trackSave(scope, () => patch(changes)).then(() => true, () => false).finally(() => {
      setOptimistic((current) => Object.fromEntries(Object.entries(current).filter(([key, value]) => !keys.includes(key as keyof BotPatchValues) || value !== changes[key as keyof BotPatchValues])));
    });
  }
  function saveDocument(file: BotStateFile, content: string, token: string | null, known: () => string) {
    return enqueue(async () => {
      try {
        let expectedSha256 = token;
        if (!expectedSha256) {
          const current = await rpc.call("state_read", { botId, file });
          if (current.content !== known()) throw new Error(`${file} changed elsewhere. Review the latest version before saving.`);
          expectedSha256 = current.sha256;
        }
        const saved = await rpc.call("state_update", { botId, file, content, expectedSha256 });
        const base = latest.current;
        apply({
          ...base,
          ...(file === "SOUL.md" ? { soul: saved.content } : file === "MEMORY.md" ? { memory: saved.content } : { settings: JSON.parse(saved.content) as BotMetadata["settings"] }),
          stateHashes: { ...base.stateHashes, [file]: saved.sha256 },
        });
        return { value: saved.content, token: saved.sha256 as string | null };
      } catch (cause) {
        void refresh();
        throw cause;
      }
    });
  }

  const name = useDraftField<string>({
    draftKey: `${scope}name`, serverValue: bot.name, serverToken: bot.name,
    save: async (value, token) => { const next = await patch({ name: value.trim() }, { name: token }); return { value: next.name, token: next.name }; },
  });
  const role = useDraftField<string>({
    draftKey: `${scope}role`, serverValue: bot.role, serverToken: bot.role,
    save: async (value, token) => { const next = await patch({ role: value.trim() }, { role: token }); return { value: next.role, token: next.role }; },
  });
  const soul = useDraftField<string | null>({
    draftKey: `${scope}SOUL.md`, serverValue: bot.soul, serverToken: bot.stateHashes["SOUL.md"], autosaveMs: AUTOSAVE_MS,
    validate: (value) => value.length > SOUL_MAX_CHARS ? `SOUL.md must be at most ${SOUL_MAX_CHARS} characters. Your draft is kept.` : null,
    save: (value, token) => saveDocument("SOUL.md", value, token, () => latest.current.soul),
  });
  const memory = useDraftField<string | null>({
    draftKey: `${scope}MEMORY.md`, serverValue: bot.memory, serverToken: bot.stateHashes["MEMORY.md"], autosaveMs: AUTOSAVE_MS,
    validate: (value) => value.length > MEMORY_MAX_CHARS ? `MEMORY.md must be at most ${MEMORY_MAX_CHARS} characters. Shorten your draft; it has been kept.` : null,
    save: (value, token) => saveDocument("MEMORY.md", value, token, () => latest.current.memory),
  });
  const settings = useDraftField<string | null>({
    draftKey: `${scope}settings.json`, serverValue: settingsText(bot.settings), serverToken: bot.stateHashes["settings.json"],
    validate: (value) => { const result = parseSettings(value); return "error" in result ? result.error : null; },
    save: (value, token) => {
      const result = parseSettings(value);
      if ("error" in result) return Promise.reject(new Error(result.error));
      return saveDocument("settings.json", result.content, token, () => settingsText(latest.current.settings));
    },
  });

  const shown = { ...bot, ...optimistic, defaultProjectId: "defaultProjectId" in optimistic ? optimistic.defaultProjectId ?? null : defaultProjectOf(bot) };
  const ownedProjectIds = projectOwners.filter((owner) => owner.botId === botId).map((owner) => owner.projectId);
  const linkedProjectIds = [...new Set([...bot.linkedProjectIds, ...ownedProjectIds])];
  const botNames = new Map(bots.map((entry) => [entry.id, entry.name]));

  async function createSection() {
    const value = sectionDraft?.trim();
    if (!value) return;
    const created = await trackSave(scope, async () => {
      const section = await rpc.call("section_create", { name: value });
      await refresh();
      return section;
    }).catch(() => null);
    if (!created) return;
    setSectionDraft(null);
    await saveNow({ sectionId: created.id });
  }
  function changeProjectRole(projectId: string, next: "none" | "member" | "owner") {
    return trackSave(scope, () => enqueue(async () => {
      const current = latest.current;
      const owned = ownedProjectIds.includes(projectId);
      const action = next === "none" ? "leave" : next === "owner" ? "own" : owned ? "release" : "join";
      const firstLink = next !== "none" && current.linkedProjectIds.length === 0 && defaultProjectOf(current) === null;
      try {
        await rpc.call("state_apply", { botId, change: { target: "project", action, projectId } });
        if (firstLink) apply(await rpc.call("bot_patch", { botId, expected: { defaultProjectId: null }, changes: { defaultProjectId: projectId } }));
      } finally {
        const snapshot = await refresh();
        const refreshed = snapshot?.bots.find((entry) => entry.id === botId);
        if (refreshed) latest.current = refreshed;
      }
    })).catch(() => {});
  }

  return <TooltipProvider>
    <div ref={root} className="bot-panel flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3" aria-label={`${bot.name} bot settings`} role="region">
      <header className="flex flex-col items-center gap-1 pt-2">
        <button type="button" className="flex size-28 items-center justify-center rounded-2xl hover:bg-state-hover" aria-label="Customize avatar" onClick={() => root.current?.querySelector<HTMLElement>('[data-bot-panel-section="appearance"]')?.scrollIntoView?.({ block: "start" })}>
          <BotIcon avatar={shown.avatar} size={96} label="Bot avatar" />
        </button>
        <Input
          aria-label="Bot name"
          className="h-9 border-transparent bg-transparent text-center text-lg font-semibold hover:border-input focus-visible:border-input"
          value={name.value}
          maxLength={120}
          placeholder="Name your bot"
          onChange={(event) => name.change(event.target.value)}
          onBlur={() => { if (name.value.trim()) void name.commit(); else name.revert(); }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur();
            if (event.key === "Escape") { name.revert(); event.currentTarget.blur(); }
          }}
        />
        <FieldNotice field={name} label="Name" />
        <Input
          aria-label="Role"
          className="h-8 border-transparent bg-transparent text-center text-sm text-muted-foreground hover:border-input focus-visible:border-input"
          value={role.value}
          maxLength={80}
          placeholder="Add a role"
          onChange={(event) => role.change(event.target.value)}
          onBlur={() => void role.commit()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur();
            if (event.key === "Escape") { role.revert(); event.currentTarget.blur(); }
          }}
        />
        <FieldNotice field={role} label="Role" />
        <p role="status" aria-live="polite" data-save-state={summary} className="min-h-4 text-xs text-muted-foreground">{SUMMARY_TEXT[summary]}</p>
        {saveError ? <p role="alert" className="flex items-start gap-2 text-xs text-destructive"><span>{saveError}</span><button type="button" className="shrink-0 underline" onClick={() => dismissSaveError(scope)}>Dismiss</button></p> : null}
      </header>

      <PanelCard section="appearance" title="Appearance">
        <AvatarAppearance avatar={shown.avatar} onChange={(avatar) => void saveNow({ avatar })} />
      </PanelCard>

      <PanelCard section="setup" title="Setup">
        <div className="space-y-1">
          <label className="block space-y-1 text-xs font-medium text-muted-foreground">Section
            <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground" value={sectionDraft !== null ? "__create_section__" : shown.sectionId ?? ""} onChange={(event) => {
              if (event.target.value === "__create_section__") { setSectionDraft(""); return; }
              setSectionDraft(null);
              void saveNow({ sectionId: event.target.value || null });
            }}>
              <option value="">Main</option>
              {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
              <option value="__create_section__">Create New…</option>
            </select>
          </label>
          {sectionDraft !== null ? <div className="space-y-1">
            <Input autoFocus className="h-8" aria-label="New section name" value={sectionDraft} maxLength={80} onChange={(event) => setSectionDraft(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter" && !event.nativeEvent.isComposing) void createSection(); }} />
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" disabled={!sectionDraft.trim()} onClick={() => void createSection()}>Add section</Button>
              <Button type="button" size="sm" variant="ghost" aria-label="Cancel section creation" onClick={() => setSectionDraft(null)}>Cancel</Button>
            </div>
          </div> : null}
        </div>
        <MachineSelect hosts={hosts} value={shown.hostId} onValueChange={(hostId) => void saveNow({ hostId })} />
        <p className="text-xs text-muted-foreground">State is stored privately in BB and included in this bot’s instructions. Machine is the default for new conversations, not a storage location.</p>
      </PanelCard>

      <PanelCard section="instructions" title="Instructions" detail={`${soul.value.length}/${SOUL_MAX_CHARS}`}>
        <DocumentEditor field={soul} file="SOUL.md" limit={SOUL_MAX_CHARS} mono={false} placeholder="Personality, perspective, and communication style." />
      </PanelCard>

      <PanelCard section="memory" title="Memory" detail={`${memory.value.length}/${MEMORY_MAX_CHARS}`}>
        <DocumentEditor field={memory} file="MEMORY.md" limit={MEMORY_MAX_CHARS} mono />
        <p className="text-xs text-muted-foreground">Private to this bot, and updated by the bot as it works. Don’t store credentials here.</p>
      </PanelCard>

      <PanelCard section="settings" title="Settings" detail={`${settings.value.length}/${SETTINGS_MAX_CHARS}`}>
        <DocumentEditor field={settings} file="settings.json" limit={SETTINGS_MAX_CHARS} mono />
        <p className="text-xs text-muted-foreground">A JSON object, saved when you leave the field.</p>
      </PanelCard>

      <PanelCard section="projects" title="Projects" detail={linkedProjectIds.length ? String(linkedProjectIds.length) : undefined}>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Default project
          <select aria-label="Default project" className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground" value={shown.defaultProjectId ?? ""} onChange={(event) => void saveNow({ defaultProjectId: event.target.value || null })}>
            <option value="">Personal workspace</option>
            {bot.linkedProjectIds.map((id) => <option key={id} value={id}>{projects.find((project) => project.id === id)?.name ?? id}</option>)}
          </select>
          <span className="font-normal">New conversations and the coordinator start here. You can change the project before sending.</span>
        </label>
        <BotProjectsPanel
          projects={projects} owners={projectOwners} botNames={botNames} botId={botId} hostId={bot.hostId} hosts={hosts}
          linkedProjectIds={linkedProjectIds} ownedProjectIds={ownedProjectIds} busy={projectsBusy}
          onRoleChange={async (projectId, next) => { setProjectsBusy(true); try { await changeProjectRole(projectId, next); } finally { setProjectsBusy(false); } }}
          onCreateProject={async (input) => { const project = await rpc.call("project_create", input); void refresh(); return project; }}
          onBrowseProjects={(input) => rpc.call("project_browse", input)}
          nativeFolderPicker={nativeFolderPicker}
        />
      </PanelCard>
    </div>
  </TooltipProvider>;
}

export function BotPanel({ botId, sectionRequest = null }: { botId: string; sectionRequest?: BotPanelSectionRequest | null }) {
  const data = useBotData();
  const bot = data.bots.find((entry) => entry.id === botId);
  if (!data.loaded) return <PanelMessage>Loading bot…</PanelMessage>;
  if (!bot) return data.error ? <PanelMessage alert>{data.error}</PanelMessage> : <PanelMessage>This bot no longer exists.</PanelMessage>;
  return <BotPanelEditor key={bot.id} bot={bot} data={data} sectionRequest={sectionRequest} />;
}
