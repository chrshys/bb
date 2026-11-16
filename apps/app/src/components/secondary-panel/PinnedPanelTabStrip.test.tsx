// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Panel, PanelGroup } from "react-resizable-panels";
import { TooltipProvider } from "@bb/shared-ui/tooltip";
import {
  createPluginPinnedFixedPanelTab,
  createThreadInfoFixedPanelTab,
  createWorkspaceFilePreviewFixedPanelTab,
} from "@/lib/fixed-panel-tabs-state";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { MobilePanelTabPager } from "./MobilePanelTabPager";
import {
  PinnedPanelTabStrip,
  type PinnedPanelTabStripItem,
} from "./PinnedPanelTabStrip";
import {
  ThreadSecondaryPanel,
  type SecondaryPanelFixedTab,
} from "./ThreadSecondaryPanel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const noop = () => {};

function createItems(
  labels: readonly string[],
  activeLabel: string,
): PinnedPanelTabStripItem[] {
  return labels.map((label) => ({
    ariaLabel: `Show ${label}`,
    id: label,
    isActive: label === activeLabel,
    label,
    leadingVisual: <span data-icon={label} />,
    onSelect: vi.fn(),
    title: label,
  }));
}

function renderStrip(items: readonly PinnedPanelTabStripItem[]) {
  return render(
    <TooltipProvider>
      <PinnedPanelTabStrip items={items} />
    </TooltipProvider>,
  );
}

describe("PinnedPanelTabStrip", () => {
  it("names every icon and marks only the selected one as pressed", () => {
    const items = createItems(["Info", "Diff", "Bots"], "Bots");
    renderStrip(items);

    const strip = screen.getByRole("group", { name: "Pinned views" });
    const buttons = Array.from(strip.querySelectorAll("button"));
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Show Info",
      "Show Diff",
      "Show Bots",
    ]);
    expect(
      buttons.map((button) => button.getAttribute("aria-pressed")),
    ).toEqual(["false", "false", "true"]);

    fireEvent.click(screen.getByRole("button", { name: "Show Diff" }));
    expect(items[1]?.onSelect).toHaveBeenCalledOnce();
  });

  it("moves focus with the arrow, Home and End keys and wraps at the ends", () => {
    renderStrip(createItems(["Info", "Diff", "Bots"], "Info"));
    const info = screen.getByRole("button", { name: "Show Info" });
    const diff = screen.getByRole("button", { name: "Show Diff" });
    const bots = screen.getByRole("button", { name: "Show Bots" });

    info.focus();
    fireEvent.keyDown(info, { key: "ArrowRight" });
    expect(document.activeElement).toBe(diff);
    fireEvent.keyDown(diff, { key: "End" });
    expect(document.activeElement).toBe(bots);
    fireEvent.keyDown(bots, { key: "ArrowRight" });
    expect(document.activeElement).toBe(info);
    fireEvent.keyDown(info, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(bots);
    fireEvent.keyDown(bots, { key: "Home" });
    expect(document.activeElement).toBe(info);
  });

  it("leaves modified arrow keys to the app shortcuts", () => {
    renderStrip(createItems(["Info", "Diff"], "Info"));
    const info = screen.getByRole("button", { name: "Show Info" });
    info.focus();
    fireEvent.keyDown(info, { key: "ArrowRight", metaKey: true });
    expect(document.activeElement).toBe(info);
  });

  it("scrolls the selected icon into view when the icons overflow the strip", () => {
    const scrolled: string[] = [];
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(120);
    HTMLElement.prototype.scrollIntoView = function scrollIntoView(
      this: HTMLElement,
    ) {
      scrolled.push(this.dataset.pinnedPanelTab ?? "button");
    };
    const labels = ["Info", "Diff", "Bots", "Tasks", "Docs", "Mail", "Notes"];
    const view = renderStrip(createItems(labels, "Info"));
    expect(scrolled).toEqual(["Info"]);

    view.rerender(
      <TooltipProvider>
        <PinnedPanelTabStrip items={createItems(labels, "Notes")} />
      </TooltipProvider>,
    );
    expect(scrolled).toEqual(["Info", "Notes"]);

    const strip = screen.getByRole("group", { name: "Pinned views" });
    expect(strip.className).toContain("overflow-x-auto");
    expect(strip.className).toContain("max-w-1/2");
    expect(strip.querySelectorAll("button")).toHaveLength(labels.length);
    expect(strip.hasAttribute("data-overflow-end")).toBe(true);
    expect(strip.hasAttribute("data-overflow-start")).toBe(false);

    Object.defineProperty(strip, "scrollLeft", {
      configurable: true,
      value: 280,
    });
    fireEvent.scroll(strip);
    expect(strip.hasAttribute("data-overflow-start")).toBe(true);
    expect(strip.hasAttribute("data-overflow-end")).toBe(false);
  });

  it("does not scroll when every icon fits", () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    renderStrip(createItems(["Info", "Diff"], "Diff"));
    expect(scrollIntoView).not.toHaveBeenCalled();
    const strip = screen.getByRole("group", { name: "Pinned views" });
    expect(strip.hasAttribute("data-overflow-end")).toBe(false);
  });
});

function createFixedTabs(count: number): SecondaryPanelFixedTab[] {
  const info: SecondaryPanelFixedTab = {
    ariaLabel: "Show thread info panel",
    label: "Info",
    leadingVisual: <span />,
    onSelect: vi.fn(),
    tab: createThreadInfoFixedPanelTab(),
    title: "Thread info",
  };
  return [
    info,
    ...Array.from({ length: count }, (_, index) => ({
      ariaLabel: `Plugin tab ${index + 1}`,
      contentFillsRegion: true,
      label: `Plugin tab ${index + 1}`,
      leadingVisual: <span />,
      onSelect: vi.fn(),
      renderContent: () => <div>Plugin content {index + 1}</div>,
      tab: createPluginPinnedFixedPanelTab({
        pinnedTabId: `tab-${index + 1}`,
        pluginId: "demo",
      }),
      title: `Plugin tab ${index + 1}`,
    })),
  ];
}

describe("pinned icons beside closable tabs", () => {
  it("keeps closable tabs and the new-tab launcher next to a crowded strip", () => {
    const { wrapper: Wrapper } = createQueryClientTestHarness();
    const fixedTabs = createFixedTabs(8);
    const fileTab = createWorkspaceFilePreviewFixedPanelTab({
      environmentId: "env",
      projectId: "project",
      tab: {
        lineRange: null,
        path: "README.md",
        source: { kind: "working-tree" },
        statusLabel: null,
      },
    });
    const onOpenNewTab = vi.fn();
    const onCloseFile = vi.fn();
    render(
      <Wrapper>
        <TooltipProvider>
          <PanelGroup direction="horizontal">
            <Panel />
            <ThreadSecondaryPanel
              activeTab={fixedTabs[3]!.tab}
              canUseGitUi={false}
              fixedTabs={fixedTabs}
              tabs={[
                {
                  label: "README.md",
                  leadingVisual: null,
                  onClose: onCloseFile,
                  onSelect: noop,
                  renderContent: () => <div>File body</div>,
                  statusLabel: null,
                  tab: fileTab,
                },
              ]}
              isConversationCollapsed={false}
              isOpen
              metadataContent={null}
              onClose={noop}
              onCollapse={noop}
              onTabReorder={noop}
              onOpenNewTab={onOpenNewTab}
              onPanelFocus={noop}
              onToggleConversationCollapse={noop}
              renderAsDrawer={false}
            />
          </PanelGroup>
        </TooltipProvider>
      </Wrapper>,
    );

    const strip = screen.getByRole("group", { name: "Pinned views" });
    expect(strip.querySelectorAll("button")).toHaveLength(9);
    expect(
      screen
        .getByRole("button", { name: "Plugin tab 3" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText("Plugin content 3")).toBeTruthy();
    expect(
      document.querySelector("[data-pinned-panel-tab-divider]"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "README.md" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close README.md" }));
    expect(onCloseFile).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Open new tab" }));
    expect(onOpenNewTab).toHaveBeenCalledOnce();
  });

  it("shows the same icons in the compact drawer pager without tooltips", () => {
    const onSelectBots = vi.fn();
    render(
      <MobilePanelTabPager
        activeTabId="bots"
        fixedTabs={[
          {
            id: "info",
            label: "Info",
            ariaLabel: "Show thread info panel",
            leadingVisual: null,
            onSelect: noop,
          },
          {
            id: "bots",
            label: "Bots",
            ariaLabel: "Bots",
            leadingVisual: null,
            onSelect: onSelectBots,
          },
        ]}
        tabs={[
          {
            id: "file",
            label: "README.md",
            ariaLabel: "README.md",
            leadingVisual: null,
            onSelect: noop,
            onClose: noop,
          },
        ]}
        newTabControl={<button type="button">New tab</button>}
      />,
    );

    const strip = screen.getByRole("group", { name: "Pinned views" });
    expect(strip.className).toContain("overflow-x-auto");
    const bots = screen.getByRole("button", { name: "Bots" });
    expect(bots.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(bots);
    expect(onSelectBots).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "README.md" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New tab" })).toBeTruthy();
  });
});
