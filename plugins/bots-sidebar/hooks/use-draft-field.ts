import { useEffect, useSyncExternalStore } from "react";
import { bindField, changeDraft, commitDraft, draftsVersion, fieldStatus, readDraft, rebaseDraft, revertDraft, saveError, saveSummary, subscribeDrafts, type FieldStatus, type SaveSummary } from "../lib/field-drafts";

export type DraftField = {
  value: string;
  status: FieldStatus;
  message: string | null;
  latest: string;
  change: (value: string) => void;
  commit: () => Promise<void>;
  revert: () => void;
  keepMine: () => Promise<void>;
};

export function useDraftField<Token>({ draftKey, serverValue, serverToken, validate, save, autosaveMs = null }: {
  draftKey: string;
  serverValue: string;
  serverToken: Token;
  validate?: (value: string) => string | null;
  save: (value: string, token: Token) => Promise<{ value: string; token: Token }>;
  autosaveMs?: number | null;
}): DraftField {
  useSyncExternalStore(subscribeDrafts, draftsVersion, draftsVersion);
  useEffect(() => {
    bindField(draftKey, {
      serverValue,
      serverToken,
      autosaveMs,
      validate: validate ?? (() => null),
      save: (value, token) => save(value, token as Token),
    });
  });
  useEffect(() => () => { void commitDraft(draftKey); }, [draftKey]);
  const draft = readDraft(draftKey);
  const status = fieldStatus(draftKey, serverValue);
  return {
    value: draft?.value ?? serverValue,
    status,
    message: status === "error" ? draft?.error ?? null : null,
    latest: serverValue,
    change: (value) => changeDraft(draftKey, value),
    commit: () => commitDraft(draftKey),
    revert: () => revertDraft(draftKey),
    keepMine: () => { rebaseDraft(draftKey); return commitDraft(draftKey); },
  };
}

export function useSaveSummary(scope: string): { summary: SaveSummary; error: string | null } {
  useSyncExternalStore(subscribeDrafts, draftsVersion, draftsVersion);
  return { summary: saveSummary(scope), error: saveError(scope) };
}
