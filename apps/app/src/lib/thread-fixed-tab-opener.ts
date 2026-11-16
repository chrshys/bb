import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useStore } from "jotai";
import type { JsonValue } from "@get-bb/plugin-sdk";
import { getThreadConversationCollapsedAtom } from "@/components/secondary-panel/threadSecondaryPanelAtoms";
import { useRouteState } from "@/hooks/useRouteState";
import { openAppFixedTabOnThread } from "@/lib/app-fixed-tab-navigation";
import type { AppFixedTabReference } from "@/lib/app-navigation-host";
import { lookupCachedThread } from "@/lib/plugin-sidebar-hooks";
import { getThreadRoutePath } from "@/lib/route-paths";
import { sdk } from "@/lib/sdk";

export interface OpenThreadFixedTabArgs {
  tab: AppFixedTabReference;
  target?: JsonValue;
  threadId: string;
}

export type OpenThreadFixedTab = (args: OpenThreadFixedTabArgs) => boolean;

export function useOpenThreadFixedTab(): OpenThreadFixedTab {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const store = useStore();
  const { threadId: routeThreadId } = useRouteState();
  return useCallback<OpenThreadFixedTab>(
    ({ tab, target, threadId }) =>
      openAppFixedTabOnThread({
        intent: {
          surface: { kind: "current" },
          tab,
          ...(target === undefined ? {} : { target }),
        },
        isThreadFocused: routeThreadId === threadId,
        navigateToThread: () => {
          const open = (projectId: string) => {
            store.set(getThreadConversationCollapsedAtom(threadId), false);
            void navigate(getThreadRoutePath({ projectId, threadId }));
          };
          const cached = lookupCachedThread(queryClient, threadId);
          if (cached !== null) {
            open(cached.projectId);
            return;
          }
          void sdk.threads
            .get({ threadId })
            .then((thread) => open(thread.projectId))
            .catch(() => navigate(`/threads/${threadId}`));
        },
        threadId,
      }),
    [navigate, queryClient, routeThreadId, store],
  );
}
