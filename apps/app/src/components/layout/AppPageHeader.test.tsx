// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BbDesktopInfo } from "@bb/desktop-contract";
import { CompactViewportOverrideProvider } from "@bb/shared-ui/hooks/use-compact-viewport";
import { SidebarProvider } from "@/components/ui/sidebar";
import {
  BROWSER_COLLAPSED_HEADER_RESERVE_CLASS,
  MACOS_COLLAPSED_TOP_LEFT_RESERVE_CLASS,
} from "@/lib/bb-desktop";
import { createBbDesktopApi } from "@/test/bb-desktop-test-utils";
import { AppPageHeader } from "./AppPageHeader";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@bb/shared-ui/dropdown-menu";
import { PAGE_SCROLL_TO_TOP_EVENT } from "@/lib/page-scroll-to-top";

const macosDesktopInfo: BbDesktopInfo = {
  lastCheckedAt: null,
  latestVersion: null,
  pendingVersion: null,
  platform: "macos",
  updateAvailable: false,
  updateDownloaded: false,
  version: "0.0.0-test",
};

const RESERVE_CLASSES = [
  BROWSER_COLLAPSED_HEADER_RESERVE_CLASS,
  MACOS_COLLAPSED_TOP_LEFT_RESERVE_CLASS,
];

function renderHeaderReserve({
  collapsedRailWidth,
  isCompactViewport = false,
  open = false,
}: {
  collapsedRailWidth?: string;
  isCompactViewport?: boolean;
  open?: boolean;
}): string[] {
  render(
    <CompactViewportOverrideProvider isCompactViewport={isCompactViewport}>
      <SidebarProvider open={open} collapsedRailWidth={collapsedRailWidth}>
        <AppPageHeader />
      </SidebarProvider>
    </CompactViewportOverrideProvider>,
  );
  const classNames = screen
    .getByTestId("app-page-header-content-row")
    .className.split(" ");
  return RESERVE_CLASSES.filter((reserve) =>
    reserve.split(" ").every((token) => classNames.includes(token)),
  );
}

afterEach(() => {
  cleanup();
  delete window.bbDesktop;
});

describe("AppPageHeader window top-left reserve", () => {
  it("does not scroll the conversation when dismissing a portalled mobile header menu", async () => {
    render(
      <CompactViewportOverrideProvider isCompactViewport>
        <SidebarProvider>
          <div>
            <AppPageHeader
              center={<span>Conversation title</span>}
              actions={
                <DropdownMenu>
                  <DropdownMenuTrigger>Thread actions</DropdownMenuTrigger>
                  <DropdownMenuContent mobileTitle="Thread menu">
                    <span>Menu content</span>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
            <div data-page-scroll-viewport="" data-testid="timeline" />
          </div>
        </SidebarProvider>
      </CompactViewportOverrideProvider>,
    );
    const viewport = screen.getByTestId("timeline");
    Object.defineProperty(viewport, "getClientRects", {
      value: () => [new DOMRect(0, 0, 360, 500)],
    });
    let scrollRequests = 0;
    viewport.addEventListener(PAGE_SCROLL_TO_TOP_EVENT, (event) => {
      event.preventDefault();
      scrollRequests += 1;
    });
    fireEvent.click(screen.getByRole("button", { name: "Thread actions" }));
    await screen.findByText("Menu content");
    const backdrop = document.querySelector(
      '[data-persistent-drawer-backdrop][data-state="open"]',
    );
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Thread menu" })).toBeNull(),
    );
    expect(scrollRequests).toBe(0);
    fireEvent.click(screen.getByText("Conversation title"));
    expect(scrollRequests).toBe(1);
  });

  it("reserves the browser trigger slot when the sidebar slides fully away", () => {
    expect(renderHeaderReserve({})).toEqual([
      BROWSER_COLLAPSED_HEADER_RESERVE_CLASS,
    ]);
  });

  it("reserves nothing beside a collapsed rail, which keeps the trigger", () => {
    expect(renderHeaderReserve({ collapsedRailWidth: "52px" })).toEqual([]);
  });

  it("reserves nothing beside a collapsed rail on macOS, where the title bar hosts the lights", () => {
    window.bbDesktop = createBbDesktopApi(macosDesktopInfo);

    expect(renderHeaderReserve({ collapsedRailWidth: "52px" })).toEqual([]);
  });

  it("keeps the full macOS reserve when no rail stays behind", () => {
    window.bbDesktop = createBbDesktopApi(macosDesktopInfo);

    expect(renderHeaderReserve({})).toEqual([
      MACOS_COLLAPSED_TOP_LEFT_RESERVE_CLASS,
    ]);
  });

  it("still reserves the trigger slot on compact viewports with the rail experiment on", () => {
    expect(
      renderHeaderReserve({
        collapsedRailWidth: "52px",
        isCompactViewport: true,
        open: true,
      }),
    ).toEqual([BROWSER_COLLAPSED_HEADER_RESERVE_CLASS]);
  });

  it("reserves nothing while the sidebar is showing", () => {
    expect(
      renderHeaderReserve({ collapsedRailWidth: "52px", open: true }),
    ).toEqual([]);
  });
});
