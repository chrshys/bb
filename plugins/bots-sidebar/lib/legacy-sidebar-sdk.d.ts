import "@get-bb/plugin-sdk/app";
import "@get-bb/plugin-sdk/testing/app";
import type { ComponentType } from "react";

// Compatibility declarations copied from this BB checkout; these APIs remain in
// its runtime but are stripped from public SDK declarations as @internal.
declare module "@get-bb/plugin-sdk/app" {
export interface PluginSidebarThreadActions {
  /**
   * Navigate to a thread. `split: true` applies bb's split placement rules —
   * a right split by default, focus when the thread is already open, replace
   * at the pane cap — and falls back to plain navigation where splits are off.
   * Opening also expands the thread's conversation if the secondary panel had
   * collapsed it, as bb's own row does.
   */
  open(threadId: string, options?: { split?: boolean }): void;
  /**
   * Go to the new-thread screen. Passing `projectId` also makes that project
   * the composer's selection, so the thread is created where you asked.
   * `sectionId` files the new thread under that section, and
   * `environmentId` reuses that environment (the "New thread in
   * environment" affordance), both exactly as bb's own list does.
   * `experimental_placement` explicitly selects the section and pin state,
   * overriding `sectionId`. Omitting placement starts unpinned, outside sections
   * unless `sectionId` is supplied; previous composer placement is cleared.
   * `hostId` selects a machine for a new environment when it
   * is known and supports an environment provider. `environmentId` wins when
   * both are supplied.
   */
  openNewThread(options?: {
    projectId?: string;
    sectionId?: string;
    experimental_placement?: { sectionId: string | null; pinned: boolean };
    environmentId?: string;
    hostId?: string;
    focusPrompt?: boolean;
  }): void;
  setPinned(threadId: string, pinned: boolean): Promise<void>;
  setRead(threadId: string, read: boolean): Promise<void>;
  /** Silent rename — no dialog. For inline editing in your own row. */
  rename(threadId: string, title: string): Promise<void>;
  /** Confirms before including child threads unless archive confirmation is disabled in Settings → General. */
  archive(threadId: string): void;
  /** Archives an environment's active thread trees with bb's optimistic updates, pane cleanup, and one Undo toast. Rejects after bb shows an error toast on failure. */
  experimental_archiveEnvironmentThreads(environmentId: string): Promise<void>;
  /**
   * Opens bb's delete confirmation, which counts child threads first. Deletion
   * is destructive and recursive, so the host owns the confirmation: there is
   * deliberately no silent `delete`.
   */
  requestDelete(threadId: string): void;
}
export function experimental_useSidebarThreadActions(): PluginSidebarThreadActions;
interface PluginThreadListProps { Original?: ComponentType<PluginThreadListProps>; }
}
declare module "@get-bb/plugin-sdk/testing/app" {
 interface RenderedSlotInspectionState { readonly sidebarActionCalls: { method: string; threadId?: string; environmentId?: string; options?: Record<string, unknown>; title?: string; pinned?: boolean; read?: boolean }[]; }
}
