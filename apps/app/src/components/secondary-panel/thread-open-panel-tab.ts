import type { ThreadOpenPanelTab } from "@bb/server-contract";
import {
  getPluginPinnedTabOwnerId,
  getThreadFixedTabSurfaceKey,
  openAppFixedTabOnSurface,
} from "@/lib/app-fixed-tab-navigation";
import type { AppFixedTabReference } from "@/lib/app-navigation-host";
import { GIT_DIFF_FIXED_TAB_REFERENCE } from "./git-diff/git-diff-fixed-tab-navigation";
import { THREAD_INFO_FIXED_TAB_REFERENCE } from "./thread-info-fixed-tab-navigation";

function resolveThreadOpenPanelTabReference(
  tab: ThreadOpenPanelTab["tab"],
): AppFixedTabReference {
  if (tab.kind === "plugin") {
    return {
      ownerId: getPluginPinnedTabOwnerId(tab.pluginId),
      tabId: tab.tabId,
    };
  }
  return tab.id === "info"
    ? THREAD_INFO_FIXED_TAB_REFERENCE
    : GIT_DIFF_FIXED_TAB_REFERENCE;
}

export function openThreadOpenSignalPanelTab({
  panelTab,
  threadId,
}: {
  panelTab: ThreadOpenPanelTab;
  threadId: string;
}): boolean {
  return openAppFixedTabOnSurface({
    intent: {
      surface: { kind: "current" },
      tab: resolveThreadOpenPanelTabReference(panelTab.tab),
      ...(panelTab.target === null ? {} : { target: panelTab.target }),
    },
    isSurfaceFocused: true,
    navigateToSurface: () => {},
    surfaceKey: getThreadFixedTabSurfaceKey(threadId),
  });
}
