import { useState, type ReactNode } from "react";
import { Icon } from "@bb/shared-ui/icon";
import { Button } from "@bb/shared-ui/button";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createGitDiffFixedPanelTab,
  createThreadInfoFixedPanelTab,
  type HostFilePreviewFixedPanelTab,
  type SecondaryFixedPanelTab,
} from "@/lib/fixed-panel-tabs-state";
import {
  CompactHomePage,
  MOBILE_RECENTS_VISIBILITY_CLASS,
  MobileRecentsVisibilityStyle,
} from "@/views/mobile-home-story-fixtures";
import { CompactSecondaryPanelShelf } from "./CompactSecondaryPanelShelf";
import {
  ThreadSecondaryPanel,
  type SecondaryPanelRenderableTab,
} from "./ThreadSecondaryPanel";
import { ThreadMetadataContent } from "./ThreadMetadataContent";
import { baseProps as baseMetadataProps } from "./ThreadMetadataContent.fixtures";
import { FilePreview } from "./FilePreview";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { threadListQueryKey } from "@/hooks/queries/query-keys";

export default {
  title: "right-panel/Compact shelf",
};

const noop = () => {};

const STORY_FILE_PATH = "apps/app/src/views/RootComposeCompactHome.tsx";
const STORY_FILE_SOURCE = `export function RootComposeCompactHome({
  children,
  composer,
}: RootComposeCompactHomeProps) {
  const { regionRef, composerRef } = useCompactHomeMetrics();
  return (
    <div ref={regionRef} className="relative min-h-0 flex-1">
      {children}
      <div ref={composerRef}>{composer}</div>
    </div>
  );
}`;

function createStoryFileTab(path: string): HostFilePreviewFixedPanelTab {
  return {
    environmentId: "env_story",
    hostId: "host_story",
    id: `host-file-preview:${encodeURIComponent(path)}:thread%3Athr_story%3Aenvironment%3Aenv_story`,
    kind: "host-file-preview",
    lineRange: null,
    path,
    threadId: "thr_story",
  };
}

const fileTab = createStoryFileTab(STORY_FILE_PATH);

const MANY_TAB_PATHS: string[] = [
  STORY_FILE_PATH,
  "apps/app/src/components/secondary-panel/SecondaryPanelTabStrip.tsx",
  "apps/app/src/components/secondary-panel/CompactSecondaryPanelShelf.tsx",
  "apps/app/src/hooks/queries/thread-queries.ts",
  "apps/app/src/components/ui/sidebar.tsx",
  "apps/app/src/components/ui/theme.css",
  "apps/app/src/app.css",
  "package.json",
  "README.md",
  "apps/server/src/services/providers/provider-registry.ts",
  "an-unusually-long-component-filename-that-must-truncate.tsx",
];

function StoryFileContent({ path }: { path: string }) {
  return (
    <FilePreview
      path={path}
      state={{
        kind: "ready",
        lineRange: null,
        textPreviewKind: path.endsWith(".md") ? "markdown" : null,
        file: {
          cacheKey: `compact-shelf-story:${path}`,
          name: path.split("/").at(-1) ?? path,
          contents: path.endsWith(".md")
            ? "# Project notes\n\nThe navigation, file controls, and document share one continuous panel surface.\n\n## Working context\n\nKeep references close while the conversation remains visible at the edge. All tab, preview, and file actions remain available."
            : STORY_FILE_SOURCE,
        },
      }}
    />
  );
}

interface ShelfPanelProps {
  activeTab: SecondaryFixedPanelTab;
  onSelectTab: (tab: SecondaryFixedPanelTab) => void;
  onClose: () => void;
  filePaths?: string[];
}

function ShelfPanel({
  activeTab,
  onSelectTab,
  onClose,
  filePaths = [STORY_FILE_PATH],
}: ShelfPanelProps) {
  const tabs: SecondaryPanelRenderableTab[] = filePaths.map((path, index) => {
    const tab = path === STORY_FILE_PATH ? fileTab : createStoryFileTab(path);
    return {
      label: path.split("/").at(-1) ?? path,
      isPinned: index === 0 && filePaths.length > 1,
      leadingVisual: <Icon name="File" className="size-3.5" aria-hidden />,
      statusLabel: null,
      onSelect: () => onSelectTab(tab),
      onClose: noop,
      renderContent: () => <StoryFileContent path={path} />,
      tab,
    };
  });
  const infoTab = createThreadInfoFixedPanelTab();
  const diffTab = createGitDiffFixedPanelTab();

  return (
    <ThreadSecondaryPanel
      activeTab={activeTab}
      canUseGitUi
      requestedMergeBaseBranch="main"
      environmentId={undefined}
      isOpen
      metadataContent={<ThreadMetadataContent {...baseMetadataProps} />}
      tabs={tabs}
      fixedTabs={[
        {
          ariaLabel: "Show thread info panel",
          label: "Info",
          leadingVisual: <Icon name="Info" />,
          onSelect: () => onSelectTab(infoTab),
          tab: infoTab,
          title: "Thread info",
        },
        {
          ariaLabel: "Show diff panel",
          label: "Diff",
          leadingVisual: <Icon name="FileDiff" />,
          onSelect: () => onSelectTab(diffTab),
          tab: diffTab,
          title: "Diff",
        },
      ]}
      onPanelFocus={noop}
      onCollapse={noop}
      onClose={onClose}
      onTabReorder={noop}
      onOpenNewTab={noop}
      isConversationCollapsed={false}
      onToggleConversationCollapse={noop}
      renderAsDrawer
      inlinePanelToggle="hidden"
      showConversationCollapseControl={false}
    />
  );
}

function Stage({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(
      threadListQueryKey({
        projectId: baseMetadataProps.thread.projectId,
        sourceThreadId: baseMetadataProps.thread.id,
        originKind: "fork",
        archived: false,
      }),
      [],
    );
    return client;
  });
  return (
    <QueryClientProvider client={queryClient}>
      <div
        className={`${MOBILE_RECENTS_VISIBILITY_CLASS} fixed inset-0 flex flex-col bg-background`}
      >
        <MobileRecentsVisibilityStyle />
        <SidebarProvider defaultOpen={false} className="min-h-0">
          <SidebarInset className="min-h-0 overflow-hidden">
            <CompactHomePage />
          </SidebarInset>
          {children}
        </SidebarProvider>
      </div>
    </QueryClientProvider>
  );
}

export function FullPage() {
  const [activeTab, setActiveTab] = useState<SecondaryFixedPanelTab>(() =>
    createStoryFileTab("notes/HANDOFF.md"),
  );
  const [open, setOpen] = useState(true);

  return (
    <Stage>
      <CompactSecondaryPanelShelf
        open={open}
        onClose={() => setOpen(false)}
        srLabel="Right panel"
      >
        <ShelfPanel
          activeTab={activeTab}
          filePaths={["notes/HANDOFF.md"]}
          onSelectTab={setActiveTab}
          onClose={() => setOpen(false)}
        />
      </CompactSecondaryPanelShelf>
    </Stage>
  );
}

export function ManyTabs() {
  const [activeTab, setActiveTab] = useState<SecondaryFixedPanelTab>(fileTab);
  return (
    <Stage>
      <CompactSecondaryPanelShelf open onClose={noop} srLabel="Right panel">
        <ShelfPanel
          activeTab={activeTab}
          filePaths={MANY_TAB_PATHS}
          onSelectTab={setActiveTab}
          onClose={noop}
        />
      </CompactSecondaryPanelShelf>
    </Stage>
  );
}

export function Closed() {
  return (
    <Stage>
      <CompactSecondaryPanelShelf
        open={false}
        onClose={noop}
        srLabel="Right panel"
      >
        <ShelfPanel
          activeTab={createThreadInfoFixedPanelTab()}
          onSelectTab={noop}
          onClose={noop}
        />
      </CompactSecondaryPanelShelf>
    </Stage>
  );
}

function LayeredNavigationPanels() {
  const [open, setOpen] = useState(false);
  const { closeMobileSidebar } = useSidebar();
  return (
    <>
      <Sidebar>
        <div className="flex flex-col gap-6 p-6">
          <h2 className="text-lg font-medium">Navigation</h2>
          <button onClick={closeMobileSidebar}>Return to conversation</button>
        </div>
      </Sidebar>
      <SidebarInset>
        <header className="flex items-center justify-between border-b p-4">
          <SidebarTrigger />
          <span>Conversation</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            aria-label="Open details"
            style={{ visibility: open ? "hidden" : undefined }}
            onClick={() => setOpen(true)}
          >
            <Icon name="PanelRight" />
          </Button>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-6">
          <h1 className="text-xl font-medium">A little room to think</h1>
          <p className="text-muted-foreground">
            Open navigation or details to reveal the panel underneath. Tap the
            visible conversation edge to return.
          </p>
          <textarea
            aria-label="Conversation draft"
            className="rounded-lg border p-4"
            placeholder="Keep your train of thought…"
          />
        </div>
      </SidebarInset>
      <CompactSecondaryPanelShelf
        open={open}
        onClose={() => setOpen(false)}
        srLabel="Details"
      >
        <div className="flex flex-col gap-6 p-6">
          <h2 className="text-lg font-medium">Details</h2>
          <p className="text-muted-foreground">
            Files, references, and context live one layer beneath your
            conversation.
          </p>
          <button onClick={() => setOpen(false)}>Return to conversation</button>
        </div>
      </CompactSecondaryPanelShelf>
    </>
  );
}

export function LayeredNavigation() {
  return (
    <div className="fixed inset-0 bg-sidebar">
      <SidebarProvider defaultOpen={false}>
        <LayeredNavigationPanels />
      </SidebarProvider>
    </div>
  );
}
