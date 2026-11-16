// @vitest-environment jsdom

import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createStore, Provider as JotaiProvider } from "jotai";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonValue } from "@get-bb/plugin-sdk";
import {
  createOwnerValidatedFixedTabDestination,
  deliverAppFixedTabTarget,
  getPluginFixedTabOwnerId,
  getPluginPinnedTabOwnerId,
  openAppFixedTabFromDestinations,
  openAppFixedTabOnThread,
  PENDING_THREAD_FIXED_TAB_TTL_MS,
  registerThreadFixedTabSurface,
  resetThreadFixedTabSurfacesForTest,
  useAppFixedTabTarget,
} from "@/lib/app-fixed-tab-navigation";
import type {
  AppFixedTabOpenIntent,
  AppFixedTabReference,
} from "@/lib/app-navigation-host";
import {
  resetFixedPanelTabsStateForTest,
  useReconciledFixedPanelTabsState,
  useSelectFixedPanelViewTab,
} from "@/lib/fixed-panel-tabs";
import {
  createPluginPinnedFixedPanelTab,
  getFixedPanelTabsStateStorageKey,
  type FixedPanelViewTab,
} from "@/lib/fixed-panel-tabs-state";
import {
  getPluginSlotSnapshot,
  removePluginSlotRegistrations,
  resetPluginSlotStoreForTest,
  setPluginSlotRegistrations,
} from "@/lib/plugin-slots";
import { resetAllCrashedPluginSlotsForTest } from "@/components/plugin/PluginSlotMount";
import { makePluginRegistrationSet } from "@/test/fixtures/plugins";
import { GIT_DIFF_FIXED_TAB_REFERENCE } from "./git-diff/git-diff-fixed-tab-navigation";
import { THREAD_INFO_FIXED_TAB_REFERENCE } from "./thread-info-fixed-tab-navigation";
import {
  getThreadFixedTabTargetScopeId,
  resolveThreadPinnedTabs,
  useThreadPinnedTabs,
  type ThreadPinnedTabHost,
} from "./thread-pinned-tabs";

const apiMocks = vi.hoisted(() => ({
  getThreadTabs: vi.fn(),
  updateThreadTabs: vi.fn(),
}));

vi.mock("@/lib/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sdk")>();
  return {
    ...actual,
    sdk: {
      threads: {
        tabs: {
          get: apiMocks.getThreadTabs,
          update: apiMocks.updateThreadTabs,
        },
      },
    },
  };
});

afterEach(() => {
  cleanup();
  apiMocks.getThreadTabs.mockReset();
  apiMocks.updateThreadTabs.mockReset();
  resetPluginSlotStoreForTest();
  resetAllCrashedPluginSlotsForTest();
  resetThreadFixedTabSurfacesForTest();
  resetFixedPanelTabsStateForTest();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

type BotsTarget = { botId: string };

function isBotsTarget(value: JsonValue): value is BotsTarget {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.botId === "string"
  );
}

function PinnedProbe({ threadId }: { threadId: string }) {
  const target = useAppFixedTabTarget(
    getPluginPinnedTabOwnerId("bots"),
    "bots",
  );
  return createElement(
    "div",
    null,
    `pinned ${threadId} ${JSON.stringify(target?.target ?? null)}`,
  );
}

function registerBotsPlugin(validate = isBotsTarget) {
  setPluginSlotRegistrations(
    "bots",
    makePluginRegistrationSet({
      threadPinnedTabs: [
        {
          id: "bots",
          title: "Bots",
          icon: "Bot",
          component: PinnedProbe,
          layout: "flush",
          experimental_target: { validate },
        },
        { id: "plain", title: "Plain", icon: "Zap", component: PinnedProbe },
      ],
    }),
  );
}

const BOTS_REFERENCE: AppFixedTabReference = {
  ownerId: getPluginPinnedTabOwnerId("bots"),
  tabId: "bots",
};
const PLAIN_REFERENCE: AppFixedTabReference = {
  ownerId: getPluginPinnedTabOwnerId("bots"),
  tabId: "plain",
};
const BOTS_VIEW_TAB = createPluginPinnedFixedPanelTab({
  pinnedTabId: "bots",
  pluginId: "bots",
});

function createRecordingHost() {
  const delivered: { reference: AppFixedTabReference; target: JsonValue }[] =
    [];
  const selected: FixedPanelViewTab[] = [];
  const host: ThreadPinnedTabHost = {
    deliverTarget: (reference, target) => delivered.push({ reference, target }),
    gitDiff: {
      eligible: true,
      openCommit: vi.fn(),
      openFile: vi.fn(),
      openOrdinary: vi.fn(),
    },
    select: (tab) => selected.push(tab),
  };
  return { delivered, host, selected };
}

function pinnedDestinations(host: ThreadPinnedTabHost) {
  return resolveThreadPinnedTabs({
    gitDiffTabStatus: "eligible",
    pluginPinnedTabs: getPluginSlotSnapshot().threadPinnedTabs,
  }).map((pinnedTab) => pinnedTab.createDestination(host));
}

describe("thread pinned tab declarations", () => {
  it("lists Info, Changes and plugin tabs in one ordered declaration list", () => {
    registerBotsPlugin();
    const pinnedTabs = resolveThreadPinnedTabs({
      gitDiffTabStatus: "eligible",
      pluginPinnedTabs: getPluginSlotSnapshot().threadPinnedTabs,
    });
    expect(pinnedTabs.map((pinnedTab) => pinnedTab.reference)).toEqual([
      THREAD_INFO_FIXED_TAB_REFERENCE,
      GIT_DIFF_FIXED_TAB_REFERENCE,
      BOTS_REFERENCE,
      PLAIN_REFERENCE,
    ]);
    expect(pinnedTabs.map((pinnedTab) => pinnedTab.tab.kind)).toEqual([
      "thread-info",
      "git-diff",
      "plugin-pinned",
      "plugin-pinned",
    ]);
    expect(pinnedTabs.map((pinnedTab) => pinnedTab.title)).toEqual([
      "Thread info",
      "Diff",
      "Bots",
      "Plain",
    ]);
    expect(pinnedTabs[2]?.contentFillsRegion).toBe(true);
    expect(pinnedTabs[3]?.contentFillsRegion).toBe(false);
  });

  it("hides Changes for a workspace without Git and keeps plugin tabs", () => {
    registerBotsPlugin();
    const pinnedTabs = resolveThreadPinnedTabs({
      gitDiffTabStatus: "ineligible",
      pluginPinnedTabs: getPluginSlotSnapshot().threadPinnedTabs,
    });
    expect(pinnedTabs.map((pinnedTab) => pinnedTab.reference.tabId)).toEqual([
      "info",
      "bots",
      "plain",
    ]);
  });

  it("opens core and plugin tabs through the same destination resolver", () => {
    registerBotsPlugin();
    const { delivered, host, selected } = createRecordingHost();
    const destinations = pinnedDestinations(host);
    const open = (tab: AppFixedTabReference, target?: JsonValue) =>
      openAppFixedTabFromDestinations(destinations, {
        surface: { kind: "current" },
        tab,
        ...(target === undefined ? {} : { target }),
      });

    expect(open(THREAD_INFO_FIXED_TAB_REFERENCE)).toBe(true);
    expect(selected.map((tab) => tab.kind)).toEqual(["thread-info"]);
    expect(open(THREAD_INFO_FIXED_TAB_REFERENCE, { botId: "a" })).toBe(false);

    expect(
      open(GIT_DIFF_FIXED_TAB_REFERENCE, { kind: "file", path: "a.ts" }),
    ).toBe(true);
    expect(host.gitDiff.openFile).toHaveBeenCalledWith("a.ts");

    expect(open(BOTS_REFERENCE, { botId: "atlas" })).toBe(true);
    expect(delivered).toEqual([
      { reference: BOTS_REFERENCE, target: { botId: "atlas" } },
    ]);
    expect(selected.at(-1)).toEqual(BOTS_VIEW_TAB);
    expect(open({ ownerId: BOTS_REFERENCE.ownerId, tabId: "missing" })).toBe(
      false,
    );
  });

  it("renders the plugin component with its thread and delivered target only while the panel is open", () => {
    registerBotsPlugin();
    const store = createStore();
    const pinnedTab = resolveThreadPinnedTabs({
      gitDiffTabStatus: "ineligible",
      pluginPinnedTabs: getPluginSlotSnapshot().threadPinnedTabs,
    })[1]!;
    deliverAppFixedTabTarget(
      store,
      getThreadFixedTabTargetScopeId("thr_a"),
      BOTS_REFERENCE,
      { botId: "atlas" },
    );
    const view = render(
      createElement(
        JotaiProvider,
        { store },
        pinnedTab.renderContent?.({
          isPanelOpen: true,
          projectId: "proj",
          threadId: "thr_a",
        }),
      ),
    );
    expect(screen.getByText('pinned thr_a {"botId":"atlas"}')).toBeTruthy();

    view.rerender(
      createElement(
        JotaiProvider,
        { store },
        pinnedTab.renderContent?.({
          isPanelOpen: true,
          projectId: "proj",
          threadId: "thr_b",
        }),
      ),
    );
    expect(screen.getByText("pinned thr_b null")).toBeTruthy();

    view.rerender(
      createElement(
        JotaiProvider,
        { store },
        pinnedTab.renderContent?.({
          isPanelOpen: false,
          projectId: "proj",
          threadId: "thr_a",
        }),
      ),
    );
    expect(screen.queryByText(/^pinned /)).toBeNull();
  });
});

interface FixedTabSurfaceUnderTest {
  delivered(): JsonValue[];
  open(target: JsonValue | undefined): boolean;
  selections(): number;
}

type FixedTabSurfaceFactory = (
  validator: { validate(value: JsonValue): boolean } | undefined,
) => FixedTabSurfaceUnderTest;

function registerValidatedPlugin(
  validator: { validate(value: JsonValue): boolean } | undefined,
) {
  setPluginSlotRegistrations(
    "bots",
    makePluginRegistrationSet({
      threadPinnedTabs: [
        validator === undefined
          ? { id: "bots", title: "Bots", icon: "Bot", component: PinnedProbe }
          : {
              id: "bots",
              title: "Bots",
              icon: "Bot",
              component: PinnedProbe,
              experimental_target: {
                validate: (value): value is JsonValue =>
                  validator.validate(value),
              },
            },
      ],
    }),
  );
}

function threadIntent(target: JsonValue | undefined): AppFixedTabOpenIntent {
  return {
    surface: { kind: "current" },
    tab: BOTS_REFERENCE,
    ...(target === undefined ? {} : { target }),
  };
}

const FIXED_TAB_SURFACES: readonly [string, FixedTabSurfaceFactory][] = [
  [
    "plugin page fixed tab",
    (validator) => {
      const delivered: JsonValue[] = [];
      let selections = 0;
      const tab = {
        ownerId: getPluginFixedTabOwnerId("bots", "coordinator"),
        tabId: "bot",
      };
      const destination = createOwnerValidatedFixedTabDestination({
        deliverTarget: (target) => delivered.push(target),
        select: () => {
          selections += 1;
        },
        tab,
        validator,
      });
      return {
        delivered: () => delivered,
        open: (target) =>
          openAppFixedTabFromDestinations([destination], {
            surface: { kind: "current" },
            tab,
            ...(target === undefined ? {} : { target }),
          }),
        selections: () => selections,
      };
    },
  ],
  [
    "thread pinned tab in the current thread",
    (validator) => {
      registerValidatedPlugin(validator);
      const { delivered, host, selected } = createRecordingHost();
      const destinations = pinnedDestinations(host);
      return {
        delivered: () => delivered.map((entry) => entry.target),
        open: (target) =>
          openAppFixedTabFromDestinations(destinations, threadIntent(target)),
        selections: () => selected.length,
      };
    },
  ],
  [
    "thread pinned tab opened from outside for a thread on screen",
    (validator) => {
      registerValidatedPlugin(validator);
      const { delivered, host, selected } = createRecordingHost();
      const destinations = pinnedDestinations(host);
      registerThreadFixedTabSurface("thr_a", (intent) =>
        openAppFixedTabFromDestinations(destinations, intent),
      );
      return {
        delivered: () => delivered.map((entry) => entry.target),
        open: (target) =>
          openAppFixedTabOnThread({
            intent: threadIntent(target),
            isThreadFocused: true,
            navigateToThread: () => {},
            threadId: "thr_a",
          }),
        selections: () => selected.length,
      };
    },
  ],
];

const FIXED_TAB_CONTRACT: readonly {
  expected: { accepted: boolean; delivered: JsonValue[]; selections: number };
  name: string;
  target: JsonValue | undefined;
  validator: { validate(value: JsonValue): boolean } | undefined;
}[] = [
  {
    name: "selects without a target and leaves the session target alone",
    target: undefined,
    validator: { validate: isBotsTarget },
    expected: { accepted: true, delivered: [], selections: 1 },
  },
  {
    name: "selects an untargeted tab",
    target: undefined,
    validator: undefined,
    expected: { accepted: true, delivered: [], selections: 1 },
  },
  {
    name: "delivers a target the owner accepts, then selects",
    target: { botId: "atlas" },
    validator: { validate: isBotsTarget },
    expected: {
      accepted: true,
      delivered: [{ botId: "atlas" }],
      selections: 1,
    },
  },
  {
    name: "declines a target the owner rejects",
    target: { bot: 1 },
    validator: { validate: isBotsTarget },
    expected: { accepted: false, delivered: [], selections: 0 },
  },
  {
    name: "declines any target for a tab that declares no validator",
    target: { botId: "atlas" },
    validator: undefined,
    expected: { accepted: false, delivered: [], selections: 0 },
  },
  {
    name: "declines when the owner validator throws",
    target: { botId: "atlas" },
    validator: {
      validate: () => {
        throw new Error("stale validator");
      },
    },
    expected: { accepted: false, delivered: [], selections: 0 },
  },
];

describe.each(FIXED_TAB_SURFACES)("fixed tab contract: %s", (_name, create) => {
  it.each(FIXED_TAB_CONTRACT)("$name", ({ expected, target, validator }) => {
    const surface = create(validator);
    expect(surface.open(target)).toBe(expected.accepted);
    expect(surface.delivered()).toEqual(expected.delivered);
    expect(surface.selections()).toBe(expected.selections);
  });
});

describe("opening a fixed tab for a thread from outside its view", () => {
  it("navigates and holds the request until that thread's view can take it", () => {
    registerBotsPlugin();
    const navigateToThread = vi.fn();
    expect(
      openAppFixedTabOnThread({
        intent: threadIntent({ botId: "atlas" }),
        isThreadFocused: false,
        navigateToThread,
        threadId: "thr_other",
      }),
    ).toBe(true);
    expect(navigateToThread).toHaveBeenCalledOnce();

    const notReady = vi.fn(() => false);
    const releaseNotReady = registerThreadFixedTabSurface(
      "thr_other",
      notReady,
    );
    expect(notReady).toHaveBeenCalledOnce();
    releaseNotReady();

    const { delivered, host, selected } = createRecordingHost();
    const destinations = pinnedDestinations(host);
    const ready = vi.fn((intent: AppFixedTabOpenIntent) =>
      openAppFixedTabFromDestinations(destinations, intent),
    );
    const releaseReady = registerThreadFixedTabSurface("thr_other", ready);
    expect(delivered.map((entry) => entry.target)).toEqual([
      { botId: "atlas" },
    ]);
    expect(selected).toEqual([BOTS_VIEW_TAB]);
    releaseReady();

    const later = vi.fn(() => true);
    registerThreadFixedTabSurface("thr_other", later);
    expect(later).not.toHaveBeenCalled();
  });

  it("does not deliver a held request to a different thread", () => {
    openAppFixedTabOnThread({
      intent: threadIntent(undefined),
      isThreadFocused: false,
      navigateToThread: () => {},
      threadId: "thr_other",
    });
    const opener = vi.fn(() => true);
    registerThreadFixedTabSurface("thr_unrelated", opener);
    expect(opener).not.toHaveBeenCalled();
  });

  it("forgets a held request that no view picked up in time", () => {
    const now = Date.now();
    openAppFixedTabOnThread({
      intent: threadIntent(undefined),
      isThreadFocused: false,
      navigateToThread: () => {},
      threadId: "thr_other",
    });
    vi.spyOn(Date, "now").mockReturnValue(
      now + PENDING_THREAD_FIXED_TAB_TTL_MS + 1,
    );
    const opener = vi.fn(() => true);
    registerThreadFixedTabSurface("thr_other", opener);
    expect(opener).not.toHaveBeenCalled();
  });

  it("opens at once in a thread that is on screen and focuses it only when it is not the focused thread", () => {
    const opener = vi.fn(() => true);
    registerThreadFixedTabSurface("thr_split", opener);
    const navigateToThread = vi.fn();
    expect(
      openAppFixedTabOnThread({
        intent: threadIntent(undefined),
        isThreadFocused: true,
        navigateToThread,
        threadId: "thr_split",
      }),
    ).toBe(true);
    expect(navigateToThread).not.toHaveBeenCalled();
    openAppFixedTabOnThread({
      intent: threadIntent(undefined),
      isThreadFocused: false,
      navigateToThread,
      threadId: "thr_split",
    });
    expect(navigateToThread).toHaveBeenCalledOnce();
    expect(opener).toHaveBeenCalledTimes(2);
  });

  it("reports a decline from a thread that is on screen without navigating", () => {
    registerThreadFixedTabSurface("thr_a", () => false);
    const navigateToThread = vi.fn();
    expect(
      openAppFixedTabOnThread({
        intent: threadIntent(undefined),
        isThreadFocused: false,
        navigateToThread,
        threadId: "thr_a",
      }),
    ).toBe(false);
    expect(navigateToThread).not.toHaveBeenCalled();
  });
});

function createQueryWrapper(queryClient: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const INFO_TAB_ID = "thread-info:thread-info:none";
const DIFF_TAB_ID = "git-diff:git-diff:none";
const LEGACY_FILE_TAB = {
  environmentId: "env_1",
  id: "workspace-file-preview:README.md:env_1",
  kind: "workspace-file-preview",
  lineRange: null,
  path: "README.md",
  projectId: null,
  source: { kind: "working-tree" },
  statusLabel: null,
};

function storeLegacyPanelState(threadId: string) {
  window.localStorage.setItem(
    getFixedPanelTabsStateStorageKey({ threadId }),
    JSON.stringify({
      version: 1,
      secondary: {
        tabs: [
          { id: INFO_TAB_ID, kind: "thread-info" },
          { id: DIFF_TAB_ID, kind: "git-diff" },
          LEGACY_FILE_TAB,
        ],
        activeTabId: DIFF_TAB_ID,
        isOpen: true,
      },
      lastUsedAt: Date.now(),
    }),
  );
}

function renderPinnedPanelState(
  threadId: string,
  syncThreadId: string | null,
  queryClient = createTestQueryClient(),
) {
  return renderHook(
    () => {
      const pinnedTabs = useThreadPinnedTabs("eligible");
      const state = useReconciledFixedPanelTabsState({
        fixedTabs: pinnedTabs.map((pinnedTab) => pinnedTab.tab),
        panelStateId: threadId,
        syncThreadId,
      });
      return {
        select: useSelectFixedPanelViewTab(threadId, syncThreadId),
        state,
      };
    },
    { wrapper: createQueryWrapper(queryClient) },
  );
}

function storedPanelState(threadId: string) {
  const raw = window.localStorage.getItem(
    getFixedPanelTabsStateStorageKey({ threadId }),
  );
  return raw === null
    ? null
    : (JSON.parse(raw) as {
        secondary: {
          activeTabId: string | null;
          isOpen: boolean;
          tabs: { id: string; kind: string }[];
        };
      });
}

describe("pinned tabs in saved panel state", () => {
  it("loads panel state saved before pinned plugin tabs existed", () => {
    storeLegacyPanelState("thr_legacy");
    registerBotsPlugin();
    const { result } = renderPinnedPanelState("thr_legacy", null);

    expect(result.current.state.secondary.tabs.map((tab) => tab.kind)).toEqual([
      "thread-info",
      "git-diff",
      "plugin-pinned",
      "plugin-pinned",
      "workspace-file-preview",
    ]);
    expect(result.current.state.secondary.activeTabId).toBe(DIFF_TAB_ID);
    expect(result.current.state.secondary.isOpen).toBe(true);
  });

  it("keeps a selected pinned plugin tab across a reload of the app", () => {
    registerBotsPlugin();
    const first = renderPinnedPanelState("thr_keep", null);
    act(() => first.result.current.select(BOTS_VIEW_TAB));
    expect(first.result.current.state.secondary.activeTabId).toBe(
      BOTS_VIEW_TAB.id,
    );
    expect(storedPanelState("thr_keep")?.secondary).toMatchObject({
      activeTabId: BOTS_VIEW_TAB.id,
      isOpen: true,
    });
    first.unmount();
    resetFixedPanelTabsStateForTest();

    const second = renderPinnedPanelState("thr_keep", null);
    expect(second.result.current.state.secondary.activeTabId).toBe(
      BOTS_VIEW_TAB.id,
    );
    expect(second.result.current.state.secondary.isOpen).toBe(true);
  });

  it("selects a pinned tab for a thread whose saved state has never listed it", () => {
    const { result } = renderHook(
      () => ({
        select: useSelectFixedPanelViewTab("thr_fresh", null),
      }),
      { wrapper: createQueryWrapper(createTestQueryClient()) },
    );
    act(() => result.current.select(BOTS_VIEW_TAB));
    expect(storedPanelState("thr_fresh")?.secondary).toMatchObject({
      activeTabId: BOTS_VIEW_TAB.id,
      isOpen: true,
      tabs: [{ id: BOTS_VIEW_TAB.id, kind: "plugin-pinned" }],
    });
  });

  it("keeps the selection while the plugin reloads and drops other tabs of an unregistered plugin", () => {
    registerBotsPlugin();
    const { result } = renderPinnedPanelState("thr_reload", null);
    act(() => result.current.select(BOTS_VIEW_TAB));

    act(() => removePluginSlotRegistrations("bots"));
    expect(
      result.current.state.secondary.tabs
        .filter((tab) => tab.kind === "plugin-pinned")
        .map((tab) => tab.id),
    ).toEqual([BOTS_VIEW_TAB.id]);
    expect(result.current.state.secondary.activeTabId).toBe(BOTS_VIEW_TAB.id);

    act(() => registerBotsPlugin());
    expect(result.current.state.secondary.activeTabId).toBe(BOTS_VIEW_TAB.id);
    expect(
      result.current.state.secondary.tabs.filter(
        (tab) => tab.kind === "plugin-pinned",
      ),
    ).toHaveLength(2);
  });

  it("keeps pinned plugin tabs out of the server tab list and survives a server change", async () => {
    registerBotsPlugin();
    apiMocks.getThreadTabs.mockResolvedValue({
      revision: 3,
      tabs: [
        { id: INFO_TAB_ID, kind: "thread-info" },
        { id: DIFF_TAB_ID, kind: "git-diff" },
      ],
    });
    const queryClient = createTestQueryClient();
    const { result } = renderPinnedPanelState(
      "thr_sync",
      "thr_sync",
      queryClient,
    );
    await waitFor(() => expect(apiMocks.getThreadTabs).toHaveBeenCalled());
    act(() => result.current.select(BOTS_VIEW_TAB));
    await act(async () => {
      await Promise.resolve();
    });

    for (const [call] of apiMocks.updateThreadTabs.mock.calls) {
      expect(
        (call as { tabs: { kind: string }[] }).tabs.map((tab) => tab.kind),
      ).not.toContain("plugin-pinned");
    }

    apiMocks.getThreadTabs.mockResolvedValue({
      revision: 4,
      tabs: [
        { id: INFO_TAB_ID, kind: "thread-info" },
        { id: DIFF_TAB_ID, kind: "git-diff" },
        LEGACY_FILE_TAB,
      ],
    });
    await act(async () => {
      await queryClient.invalidateQueries();
    });
    await waitFor(() =>
      expect(
        result.current.state.secondary.tabs.map((tab) => tab.kind),
      ).toEqual([
        "thread-info",
        "git-diff",
        "plugin-pinned",
        "plugin-pinned",
        "workspace-file-preview",
      ]),
    );
    expect(result.current.state.secondary.activeTabId).toBe(BOTS_VIEW_TAB.id);
  });
});
