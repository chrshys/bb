export type FieldDraft = { value: string; base: string; token: unknown; saving: boolean; error: string | null };
export type FieldBinding = {
  serverValue: string;
  serverToken: unknown;
  validate: (value: string) => string | null;
  save: (value: string, token: unknown) => Promise<{ value: string; token: unknown }>;
  autosaveMs: number | null;
};
export type FieldStatus = "idle" | "dirty" | "saving" | "error" | "conflict";
export type SaveSummary = "idle" | "saving" | "attention" | "unsaved" | "saved";

const drafts = new Map<string, FieldDraft>();
const bindings = new Map<string, FieldBinding>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const actions = new Map<string, { pending: number; error: string | null; savedAt: number | null }>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  for (const listener of [...listeners]) listener();
}

function clearTimer(key: string) {
  const timer = timers.get(key);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(key);
}

function action(scope: string) {
  const current = actions.get(scope) ?? { pending: 0, error: null, savedAt: null };
  actions.set(scope, current);
  return current;
}

function scopeOf(key: string) {
  return key.slice(0, key.indexOf("/") + 1);
}

export function subscribeDrafts(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function draftsVersion() {
  return version;
}

export function bindField(key: string, binding: FieldBinding) {
  const serverChanged = bindings.get(key)?.serverValue !== binding.serverValue;
  bindings.set(key, binding);
  const draft = drafts.get(key);
  if (!draft) return;
  if (!draft.saving && draft.value === binding.serverValue) {
    clearTimer(key);
    drafts.delete(key);
    emit();
  } else if (serverChanged) emit();
}

export function readDraft(key: string): FieldDraft | null {
  return drafts.get(key) ?? null;
}

export function fieldStatus(key: string, serverValue: string): FieldStatus {
  const draft = drafts.get(key);
  if (!draft || draft.value === serverValue) return "idle";
  if (draft.saving) return "saving";
  if (draft.base !== serverValue) return "conflict";
  return draft.error ? "error" : "dirty";
}

export function changeDraft(key: string, value: string) {
  const binding = bindings.get(key);
  if (!binding) return;
  const current = drafts.get(key);
  clearTimer(key);
  if (!current && value === binding.serverValue) return;
  if (current && !current.saving && value === binding.serverValue && current.base === binding.serverValue) drafts.delete(key);
  else drafts.set(key, { value, base: current?.base ?? binding.serverValue, token: current ? current.token : binding.serverToken, saving: current?.saving ?? false, error: null });
  if (binding.autosaveMs !== null && drafts.has(key)) timers.set(key, setTimeout(() => { void commitDraft(key); }, binding.autosaveMs));
  emit();
}

export function revertDraft(key: string) {
  clearTimer(key);
  if (drafts.delete(key)) emit();
}

export function rebaseDraft(key: string) {
  const binding = bindings.get(key);
  const draft = drafts.get(key);
  if (!binding || !draft) return;
  drafts.set(key, { ...draft, base: binding.serverValue, token: binding.serverToken, error: null });
  emit();
}

export async function commitDraft(key: string): Promise<void> {
  clearTimer(key);
  const binding = bindings.get(key);
  const draft = drafts.get(key);
  if (!binding || !draft || draft.saving) return;
  if (draft.value === binding.serverValue) { drafts.delete(key); emit(); return; }
  if (draft.base !== binding.serverValue) return;
  const invalid = binding.validate(draft.value);
  if (invalid) { drafts.set(key, { ...draft, error: invalid }); emit(); return; }
  const submitted = draft.value;
  drafts.set(key, { ...draft, saving: true, error: null });
  emit();
  try {
    const saved = await binding.save(submitted, draft.token);
    const latest = drafts.get(key);
    action(scopeOf(key)).savedAt = Date.now();
    if (latest && latest.value !== submitted) {
      drafts.set(key, { ...latest, base: saved.value, token: saved.token, saving: false });
      const autosaveMs = bindings.get(key)?.autosaveMs ?? null;
      if (autosaveMs !== null) timers.set(key, setTimeout(() => { void commitDraft(key); }, autosaveMs));
    } else drafts.delete(key);
  } catch (cause) {
    const latest = drafts.get(key);
    if (latest) drafts.set(key, { ...latest, saving: false, error: cause instanceof Error ? cause.message : String(cause) });
  }
  emit();
}

export async function trackSave<T>(scope: string, run: () => Promise<T>): Promise<T> {
  const entry = action(scope);
  entry.pending++;
  entry.error = null;
  emit();
  try {
    const result = await run();
    entry.savedAt = Date.now();
    return result;
  } catch (cause) {
    entry.error = cause instanceof Error ? cause.message : String(cause);
    throw cause;
  } finally {
    entry.pending--;
    emit();
  }
}

export function dismissSaveError(scope: string) {
  const entry = actions.get(scope);
  if (!entry?.error) return;
  entry.error = null;
  emit();
}

export function saveError(scope: string): string | null {
  return actions.get(scope)?.error ?? null;
}

export function saveSummary(scope: string): SaveSummary {
  const entry = actions.get(scope);
  let unsaved = false;
  let attention = Boolean(entry?.error);
  let saving = (entry?.pending ?? 0) > 0;
  for (const [key, draft] of drafts) {
    if (!key.startsWith(scope)) continue;
    const serverValue = bindings.get(key)?.serverValue;
    if (draft.saving) saving = true;
    else if (draft.error || (serverValue !== undefined && draft.base !== serverValue && draft.value !== serverValue)) attention = true;
    else unsaved = true;
  }
  if (saving) return "saving";
  if (attention) return "attention";
  if (unsaved) return "unsaved";
  return entry?.savedAt ? "saved" : "idle";
}

export function resetFieldDraftsForTest() {
  for (const key of [...timers.keys()]) clearTimer(key);
  drafts.clear();
  bindings.clear();
  actions.clear();
  emit();
}
