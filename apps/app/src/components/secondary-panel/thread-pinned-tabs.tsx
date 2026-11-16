import { useMemo, type ReactNode } from "react";
import type { JsonValue } from "@get-bb/plugin-sdk";
import { Icon } from "@bb/shared-ui/icon";
import { PluginItemIcon } from "@/components/plugin/PluginIcon";
import { PluginSlotMount } from "@/components/plugin/PluginSlotMount";
import {
  AppFixedTabTargetProvider,
  createOwnerValidatedFixedTabDestination,
  getPluginPinnedTabOwnerId,
  useScopedAppFixedTabTargetState,
  type AppFixedTabDestination,
} from "@/lib/app-fixed-tab-navigation";
import type { AppFixedTabReference } from "@/lib/app-navigation-host";
import {
  createGitDiffFixedPanelTab,
  createPluginPinnedFixedPanelTab,
  createThreadInfoFixedPanelTab,
  type FixedPanelViewTab,
} from "@/lib/fixed-panel-tabs-state";
import {
  usePluginSlots,
  type PluginThreadPinnedTabSlot,
} from "@/lib/plugin-slots";
import {
  createGitDiffFixedTabDestination,
  GIT_DIFF_FIXED_TAB_REFERENCE,
} from "./git-diff/git-diff-fixed-tab-navigation";
import type { GitDiffTabStatus } from "./gitDiffTabEligibility";
import {
  createThreadInfoFixedTabDestination,
  THREAD_INFO_FIXED_TAB_REFERENCE,
} from "./thread-info-fixed-tab-navigation";

export interface ThreadPinnedTabHost {
  deliverTarget(reference: AppFixedTabReference, target: JsonValue): void;
  gitDiff: {
    eligible: boolean;
    openCommit(sha: string): void;
    openFile(path: string): void;
    openOrdinary(): void;
  };
  select(tab: FixedPanelViewTab): void;
}

export interface ThreadPinnedTabContentContext {
  isPanelOpen: boolean;
  projectId: string;
  threadId: string;
}

export interface ThreadPinnedTab {
  ariaLabel: string;
  contentFillsRegion: boolean;
  createDestination(host: ThreadPinnedTabHost): AppFixedTabDestination;
  label: string;
  leadingVisual: ReactNode;
  reference: AppFixedTabReference;
  renderContent: ((context: ThreadPinnedTabContentContext) => ReactNode) | null;
  tab: FixedPanelViewTab;
  title: string;
}

export function getThreadFixedTabTargetScopeId(threadId: string): string {
  return `thread:${threadId}`;
}

const THREAD_INFO_PINNED_VIEW_TAB = createThreadInfoFixedPanelTab();
const GIT_DIFF_PINNED_VIEW_TAB = createGitDiffFixedPanelTab();

export const THREAD_INFO_PINNED_TAB: ThreadPinnedTab = {
  ariaLabel: "Show thread info panel",
  contentFillsRegion: false,
  createDestination: (host) =>
    createThreadInfoFixedTabDestination(() =>
      host.select(THREAD_INFO_PINNED_VIEW_TAB),
    ),
  label: "Info",
  leadingVisual: <Icon name="Info" />,
  reference: THREAD_INFO_FIXED_TAB_REFERENCE,
  renderContent: null,
  tab: THREAD_INFO_PINNED_VIEW_TAB,
  title: "Thread info",
};

export const GIT_DIFF_PINNED_TAB: ThreadPinnedTab = {
  ariaLabel: "Show diff panel",
  contentFillsRegion: false,
  createDestination: (host) => createGitDiffFixedTabDestination(host.gitDiff),
  label: "Diff",
  leadingVisual: <Icon name="FileDiff" />,
  reference: GIT_DIFF_FIXED_TAB_REFERENCE,
  renderContent: null,
  tab: GIT_DIFF_PINNED_VIEW_TAB,
  title: "Diff",
};

function PluginThreadPinnedTabContent({
  context,
  reference,
  slot,
}: {
  context: ThreadPinnedTabContentContext;
  reference: AppFixedTabReference;
  slot: PluginThreadPinnedTabSlot;
}) {
  const targetState = useScopedAppFixedTabTargetState(
    getThreadFixedTabTargetScopeId(context.threadId),
    reference,
  );
  if (!context.isPanelOpen) return null;
  const PinnedTabComponent = slot.component;
  return (
    <PluginSlotMount
      key={`${slot.pluginId}/${slot.id}/${slot.generation}/${context.threadId}`}
      pluginId={slot.pluginId}
      slotKind="threadPinnedTab"
      slotId={slot.id}
      instanceId={context.threadId}
    >
      <AppFixedTabTargetProvider state={targetState}>
        <PinnedTabComponent
          threadId={context.threadId}
          projectId={context.projectId}
        />
      </AppFixedTabTargetProvider>
    </PluginSlotMount>
  );
}

export function createPluginThreadPinnedTab(
  slot: PluginThreadPinnedTabSlot,
): ThreadPinnedTab {
  const reference: AppFixedTabReference = {
    ownerId: getPluginPinnedTabOwnerId(slot.pluginId),
    tabId: slot.id,
  };
  const tab = createPluginPinnedFixedPanelTab({
    pinnedTabId: slot.id,
    pluginId: slot.pluginId,
  });
  return {
    ariaLabel: slot.title,
    contentFillsRegion: slot.layout === "flush",
    createDestination: (host) =>
      createOwnerValidatedFixedTabDestination({
        deliverTarget: (target) => host.deliverTarget(reference, target),
        select: () => host.select(tab),
        tab: reference,
        validator: slot.experimental_target,
      }),
    label: slot.title,
    leadingVisual: (
      <PluginItemIcon
        pluginId={slot.pluginId}
        icon={slot.icon}
        className="size-3.5"
      />
    ),
    reference,
    renderContent: (context) => (
      <PluginThreadPinnedTabContent
        context={context}
        reference={reference}
        slot={slot}
      />
    ),
    tab,
    title: slot.title,
  };
}

export function resolveThreadPinnedTabs({
  gitDiffTabStatus,
  pluginPinnedTabs,
}: {
  gitDiffTabStatus: GitDiffTabStatus;
  pluginPinnedTabs: readonly PluginThreadPinnedTabSlot[];
}): readonly ThreadPinnedTab[] {
  return [
    THREAD_INFO_PINNED_TAB,
    ...(gitDiffTabStatus === "ineligible" ? [] : [GIT_DIFF_PINNED_TAB]),
    ...pluginPinnedTabs.map(createPluginThreadPinnedTab),
  ];
}

export function useThreadPinnedTabs(
  gitDiffTabStatus: GitDiffTabStatus,
): readonly ThreadPinnedTab[] {
  const { threadPinnedTabs } = usePluginSlots();
  return useMemo(
    () =>
      resolveThreadPinnedTabs({
        gitDiffTabStatus,
        pluginPinnedTabs: threadPinnedTabs,
      }),
    [gitDiffTabStatus, threadPinnedTabs],
  );
}
