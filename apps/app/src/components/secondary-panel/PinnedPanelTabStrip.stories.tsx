import { useState } from "react";
import { PanelGroup, Panel } from "react-resizable-panels";
import { Icon } from "@bb/shared-ui/icon";
import {
  createPluginPinnedFixedPanelTab,
  createThreadInfoFixedPanelTab,
  createGitDiffFixedPanelTab,
  type FixedPanelViewTab,
  type HostFilePreviewFixedPanelTab,
} from "@/lib/fixed-panel-tabs-state";
import {
  ThreadSecondaryPanel,
  type SecondaryPanelFixedTab,
  type SecondaryPanelRenderableTab,
} from "./ThreadSecondaryPanel";

export default {
  title: "right-panel/Pinned icon strip",
};

const noop = () => {};

const PLUGIN_TABS = [
  ["bots", "Bots", "Bot"],
  ["tasks", "Tasks", "ListChecks"],
  ["docs", "Documents", "FileText"],
  ["mail", "Mail", "Mail"],
  ["calendar", "Calendar", "Calendar"],
  ["notes", "Notes", "NotebookPen"],
  ["links", "Links", "Link"],
  ["search", "Search", "Search"],
] as const;

function createFileTab(path: string): HostFilePreviewFixedPanelTab {
  return {
    environmentId: "env_story",
    hostId: "host_story",
    id: `host-file-preview:${encodeURIComponent(path)}:story`,
    kind: "host-file-preview",
    lineRange: null,
    path,
    threadId: "thr_story",
  };
}

function PinnedStripPanel({
  filePaths,
  pluginTabCount,
  renderAsDrawer = false,
  width,
}: {
  filePaths: readonly string[];
  pluginTabCount: number;
  renderAsDrawer?: boolean;
  width: number;
}) {
  const pinnedTabs: {
    tab: FixedPanelViewTab;
    label: string;
    icon: string;
  }[] = [
    { tab: createThreadInfoFixedPanelTab(), label: "Info", icon: "Info" },
    { tab: createGitDiffFixedPanelTab(), label: "Diff", icon: "FileDiff" },
    ...PLUGIN_TABS.slice(0, pluginTabCount).map(([id, label, icon]) => ({
      tab: createPluginPinnedFixedPanelTab({
        pinnedTabId: id,
        pluginId: "story",
      }),
      label,
      icon,
    })),
  ];
  const fileTabs = filePaths.map(createFileTab);
  const [activeTabId, setActiveTabId] = useState(
    pinnedTabs[2]?.tab.id ?? pinnedTabs[0]!.tab.id,
  );
  const fixedTabs: SecondaryPanelFixedTab[] = pinnedTabs.map((pinned) => ({
    ariaLabel: `Show ${pinned.label}`,
    contentFillsRegion: true,
    label: pinned.label,
    leadingVisual: <Icon name={pinned.icon} />,
    onSelect: () => setActiveTabId(pinned.tab.id),
    renderContent: () => (
      <div className="p-4 text-sm text-muted-foreground">
        {pinned.label} panel
      </div>
    ),
    tab: pinned.tab,
    title: pinned.label,
  }));
  const tabs: SecondaryPanelRenderableTab[] = fileTabs.map((tab) => ({
    label: tab.path,
    leadingVisual: <Icon name="FileText" />,
    onClose: noop,
    onSelect: () => setActiveTabId(tab.id),
    renderContent: () => (
      <div className="p-4 text-sm text-muted-foreground">{tab.path}</div>
    ),
    statusLabel: null,
    tab,
  }));
  const activeTab =
    [...pinnedTabs.map((pinned) => pinned.tab), ...fileTabs].find(
      (tab) => tab.id === activeTabId,
    ) ?? null;
  return (
    <div
      className="flex h-[150px] flex-col overflow-hidden rounded-md border border-border bg-background"
      style={{ width }}
    >
      <PanelGroup direction="horizontal">
        {renderAsDrawer ? null : <Panel defaultSize={0} minSize={0} />}
        <ThreadSecondaryPanel
          activeTab={activeTab}
          canUseGitUi={false}
          fixedTabs={fixedTabs}
          tabs={tabs}
          isConversationCollapsed
          isOpen
          metadataContent={null}
          onClose={noop}
          onCollapse={noop}
          onTabReorder={noop}
          onOpenNewTab={noop}
          onPanelFocus={noop}
          onToggleConversationCollapse={noop}
          renderAsDrawer={renderAsDrawer}
        />
      </PanelGroup>
    </div>
  );
}

export const PinnedIconStrip = () => (
  <div className="flex flex-col gap-4 p-4">
    <PinnedStripPanel width={520} pluginTabCount={1} filePaths={[]} />
    <PinnedStripPanel
      width={520}
      pluginTabCount={3}
      filePaths={["README.md", "src/index.ts"]}
    />
    <PinnedStripPanel
      width={360}
      pluginTabCount={8}
      filePaths={["README.md", "src/index.ts", "package.json"]}
    />
    <PinnedStripPanel
      width={360}
      pluginTabCount={8}
      filePaths={["README.md", "src/index.ts"]}
      renderAsDrawer
    />
  </div>
);
