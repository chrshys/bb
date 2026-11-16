import { preloadThreadSecondaryPanel } from "@/components/secondary-panel/lazySecondaryPanelComponents";
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { Button } from "@bb/shared-ui/button";
import { useAtomValue } from "jotai";
import { COARSE_POINTER_TOOLBAR_ACTION_BUTTON_CLASS } from "@bb/shared-ui/coarse-pointer-sizing";
import { Icon } from "@bb/shared-ui/icon";
import { Pill } from "@bb/shared-ui/pill";
import { SplitButton } from "@/components/ui/split-button.js";
import {
  AppPageHeader,
  HEADER_ICON_BUTTON_CLASS,
} from "@/components/layout/AppPageHeader";
import type { ThreadGitActionDialogTarget } from "@/components/dialogs/ThreadGitActionDialog";
import {
  getBbDesktopInfo,
  MACOS_WINDOW_NO_DRAG_CLASS,
  shouldUseMacosDesktopChrome,
} from "@/lib/bb-desktop";
import { cn } from "@bb/shared-ui/lib/utils";
import {
  useAppCommandHandler,
  useAppCommandShortcut,
} from "@/components/commands/AppCommandProvider";
import { AppCommandShortcutHint } from "@/components/commands/AppCommandShortcutHint";
import { useSidebarRename } from "@/components/sidebar/SidebarInlineRename";
import { useThreadActions } from "@/components/thread/ThreadActionsProvider";
import { ThreadTitle } from "@/components/thread/ThreadTitleMentions";
import { useDefaultRequestRename } from "@/lib/thread-actions/thread-action-registry";
import { SecondaryPanelHostLayoutContext } from "@/components/secondary-panel/SecondaryPanelHostLayoutContext";
import { RIGHT_PANEL_TOGGLE_ICON_NAME } from "@/components/secondary-panel/panelToggleControlState";
import { useWindowTitleBarHostsRightPanelToggle } from "@/components/layout/WindowRightPanelToggle";
import { CHROME_SUBTLE_ICON_BUTTON_FOREGROUND_CLASS } from "@bb/shared-ui/chrome-style-tokens";
import { useIsCompactViewport } from "@bb/shared-ui/hooks/use-compact-viewport";
import { dimInactiveSplitsAtom } from "@/lib/split-layout/atoms";
import {
  CONTEXT_INACTIVE_TEXT_CLASS,
  CONTEXT_SELECTION_SURFACE_CLASS,
} from "@bb/shared-ui/context-selection";
import { usePaneContext } from "./PaneContext";
import { PaneMaximizeButton } from "./PaneMaximizeButton";
import type { ThreadHeaderGitAction } from "./useThreadGitActions";

const THREAD_HEADER_ACTION_BUTTON_CLASS = cn(
  COARSE_POINTER_TOOLBAR_ACTION_BUTTON_CLASS,
  "border-border/70 bg-transparent font-normal hover:bg-state-hover",
);
const NARROW_SPLIT_HEADER_MAX_WIDTH = 560;

export interface ThreadDetailHeaderActionsMenuArgs {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  includeResponsiveActions: boolean;
  requestRename: (threadId: string) => void;
  onCloseAutoFocus: (event: Event) => void;
}

interface ThreadDetailHeaderProps {
  actionsMenu: ((args: ThreadDetailHeaderActionsMenuArgs) => ReactNode) | null;
  childPillLabel: "child" | null;
  isSecondaryPanelOpen: boolean;
  onOpenThreadGitAction: (target: ThreadGitActionDialogTarget) => void;
  onToggleSecondaryPanel: () => void;
  pluginActions?: ReactNode;
  threadHeaderGitActions: ThreadHeaderGitAction[];
  threadId: string;
  threadTitle: string;
  workspaceOpenButton?: ReactNode;
}

export function ThreadDetailHeader({
  actionsMenu,
  childPillLabel,
  isSecondaryPanelOpen,
  onOpenThreadGitAction,
  onToggleSecondaryPanel,
  pluginActions,
  threadHeaderGitActions,
  threadId,
  threadTitle,
  workspaceOpenButton,
}: ThreadDetailHeaderProps) {
  const isCompactViewport = useIsCompactViewport();
  const [actionsMenuThreadId, setActionsMenuThreadId] = useState<string | null>(
    null,
  );
  const isActionsMenuOpen = actionsMenuThreadId === threadId;
  const titleClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTitleClick = useCallback(() => {
    if (titleClickTimer.current === null) return;
    clearTimeout(titleClickTimer.current);
    titleClickTimer.current = null;
  }, []);
  useEffect(() => cancelTitleClick, [threadId, cancelTitleClick]);
  const handleActionsMenuOpenChange = (open: boolean) => {
    cancelTitleClick();
    setActionsMenuThreadId(open ? threadId : null);
  };
  const handleTitleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    cancelTitleClick();
    if (event.defaultPrevented || event.detail > 1) return;
    if (event.detail === 0) {
      handleActionsMenuOpenChange(true);
      return;
    }
    titleClickTimer.current = setTimeout(() => {
      titleClickTimer.current = null;
      setActionsMenuThreadId(threadId);
    }, 300);
  };
  const [primaryAction, ...secondaryActions] = threadHeaderGitActions;
  const { renameThreadAsync } = useThreadActions();
  const handleRename = useCallback(
    (nextTitle: string) => renameThreadAsync(threadId, nextTitle),
    [renameThreadAsync, threadId],
  );
  const { editor, isEditing, startEditing } = useSidebarRename({
    kind: "thread",
    id: threadId,
    name: threadTitle,
    label: "Thread name",
    onSave: handleRename,
  });
  const requestRenameDialog = useDefaultRequestRename();
  const pendingMenuRename = useRef(false);
  const requestRename = (id: string) => {
    cancelTitleClick();
    setActionsMenuThreadId(null);
    if (isCompactViewport) requestRenameDialog(id);
    else startEditing();
  };
  const requestRenameFromMenu = (id: string) => {
    if (isCompactViewport) requestRenameDialog(id);
    else pendingMenuRename.current = true;
  };
  const handleActionsMenuCloseAutoFocus = (event: Event) => {
    if (!pendingMenuRename.current) return;
    pendingMenuRename.current = false;
    event.preventDefault();
    startEditing();
  };
  const [desktopInfo] = useState(getBbDesktopInfo);
  const dimsInactiveSplits = useAtomValue(dimInactiveSplitsAtom);
  const panelShortcut = useAppCommandShortcut("panel.toggle");
  const usesDesktopChrome = shouldUseMacosDesktopChrome(desktopInfo);
  const headerRef = useRef<HTMLElement>(null!);
  const {
    beginPaneDrag,
    isFocused,
    isTopRow,
    ownsWindowTopLeft,
    reservesWindowPanelToggle,
    secondaryPanelHost,
  } = usePaneContext();
  useAppCommandHandler("thread.rename", () => {
    if (!isFocused) return false;
    requestRename(threadId);
    return true;
  });
  const isWindowPanelOpen =
    useContext(SecondaryPanelHostLayoutContext)?.isOpen === true;
  const isSplitPaneHeader = beginPaneDrag !== undefined;
  const [measuredPaneWidth, setMeasuredPaneWidth] = useState(0);
  const usesResponsiveActionOverflow =
    isCompactViewport ||
    (isSplitPaneHeader &&
      measuredPaneWidth > 0 &&
      measuredPaneWidth < NARROW_SPLIT_HEADER_MAX_WIDTH);
  useLayoutEffect(() => {
    if (!isSplitPaneHeader) {
      return;
    }

    const header = headerRef.current;
    const pane = header.closest<HTMLElement>("[data-split-pane-id]");
    const measuredElement = pane ?? header;
    const measure = () => {
      const width = measuredElement.getBoundingClientRect().width;
      if (width > 0) {
        setMeasuredPaneWidth(width);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(measuredElement);
    return () => {
      observer.disconnect();
    };
  }, [isSplitPaneHeader]);
  const handleTitlePointerDown = (event: ReactPointerEvent) => {
    if (isEditing || !beginPaneDrag || event.button !== 0) {
      return;
    }
    beginPaneDrag(event, threadTitle);
  };
  const handleTitleDoubleClick = () => {
    if (isEditing) {
      return;
    }
    cancelTitleClick();
    setActionsMenuThreadId(null);
    startEditing();
  };
  const rightPanelLabel = isSecondaryPanelOpen
    ? "Hide right panel"
    : "Show right panel";
  const rightPanelIconName = RIGHT_PANEL_TOGGLE_ICON_NAME;
  const titleBarHostsRightPanelToggle =
    useWindowTitleBarHostsRightPanelToggle();
  const showRightPanelToggle =
    !titleBarHostsRightPanelToggle &&
    secondaryPanelHost === null &&
    !isSecondaryPanelOpen;

  const center = (
    <div className="group/thread-heading flex min-w-0 max-w-full items-center gap-2">
      <div
        data-pane-header-focus-tab={
          isSplitPaneHeader && isFocused ? "" : undefined
        }
        className={cn(
          "relative min-w-0",
          isSplitPaneHeader && "-my-1 -ml-2 rounded-md px-2 py-1",
          isSplitPaneHeader && isFocused && CONTEXT_SELECTION_SURFACE_CLASS,
        )}
      >
        <p
          className={cn(
            "relative min-w-0 text-sm font-normal transition-colors",
            isEditing && "overflow-visible",
            isSplitPaneHeader &&
              !isFocused &&
              dimsInactiveSplits &&
              CONTEXT_INACTIVE_TEXT_CLASS,
            usesDesktopChrome && MACOS_WINDOW_NO_DRAG_CLASS,
            beginPaneDrag && !isEditing && "cursor-grab touch-none select-none",
          )}
          onDoubleClick={handleTitleDoubleClick}
          onPointerDown={beginPaneDrag ? handleTitlePointerDown : undefined}
        >
          {isEditing ? (
            editor
          ) : actionsMenu ? (
            <button
              type="button"
              className="block min-w-0 max-w-full rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring"
              aria-label={`Open actions for ${threadTitle}`}
              aria-haspopup="menu"
              aria-expanded={isActionsMenuOpen}
              onClick={handleTitleClick}
            >
              <ThreadTitle title={threadTitle} />
            </button>
          ) : (
            <ThreadTitle title={threadTitle} />
          )}
        </p>
      </div>
      {childPillLabel ? (
        <Pill variant="outline" size="sm">
          {childPillLabel}
        </Pill>
      ) : null}
      {actionsMenu == null ? null : (
        <span
          hidden={isCompactViewport}
          className={cn(
            "flex items-center",
            isCompactViewport
              ? "hidden"
              : "opacity-0 transition-opacity group-hover/thread-heading:opacity-100 group-focus-within/thread-heading:opacity-100 motion-reduce:transition-none",
            isActionsMenuOpen && "opacity-100",
            usesDesktopChrome && MACOS_WINDOW_NO_DRAG_CLASS,
          )}
        >
          {actionsMenu({
            open: isActionsMenuOpen,
            onOpenChange: handleActionsMenuOpenChange,
            includeResponsiveActions: usesResponsiveActionOverflow,
            requestRename: requestRenameFromMenu,
            onCloseAutoFocus: handleActionsMenuCloseAutoFocus,
          })}
        </span>
      )}
    </div>
  );

  const actions = (
    <>
      <div
        className="flex items-center gap-1"
        data-thread-header-workflow-actions=""
      >
        {pluginActions}
        {!usesResponsiveActionOverflow && workspaceOpenButton ? (
          <span className="inline-flex" data-thread-header-responsive-action="">
            {workspaceOpenButton}
          </span>
        ) : null}
        {!usesResponsiveActionOverflow && primaryAction ? (
          <span className="inline-flex" data-thread-header-responsive-action="">
            {secondaryActions.length > 0 ? (
              <SplitButton
                className={THREAD_HEADER_ACTION_BUTTON_CLASS}
                primaryAction={{
                  label: primaryAction.label,
                  onSelect: () => onOpenThreadGitAction(primaryAction.target),
                }}
                secondaryActions={secondaryActions.map((action) => ({
                  label: action.label,
                  onSelect: () => onOpenThreadGitAction(action.target),
                }))}
              />
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={THREAD_HEADER_ACTION_BUTTON_CLASS}
                onClick={() => onOpenThreadGitAction(primaryAction.target)}
              >
                {primaryAction.label}
              </Button>
            )}
          </span>
        ) : null}
      </div>
      <div
        className="ml-1 flex items-center gap-0.5"
        data-thread-header-pane-actions=""
      >
        <PaneMaximizeButton />
        {showRightPanelToggle ? (
          <span
            data-main-right-panel-toggle=""
            className="inline-flex items-center gap-1.5"
          >
            <AppCommandShortcutHint shortcut={panelShortcut} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                HEADER_ICON_BUTTON_CLASS,
                CHROME_SUBTLE_ICON_BUTTON_FOREGROUND_CLASS,
              )}
              aria-label={
                panelShortcut
                  ? `${rightPanelLabel} (${panelShortcut.label})`
                  : rightPanelLabel
              }
              aria-keyshortcuts={panelShortcut?.ariaKeyshortcuts}
              aria-expanded={isSecondaryPanelOpen}
              onPointerEnter={preloadThreadSecondaryPanel}
              onFocus={preloadThreadSecondaryPanel}
              onPointerDown={preloadThreadSecondaryPanel}
              onClick={onToggleSecondaryPanel}
            >
              <Icon name={rightPanelIconName} />
            </Button>
          </span>
        ) : null}
        {reservesWindowPanelToggle &&
        !isWindowPanelOpen &&
        !titleBarHostsRightPanelToggle ? (
          <span aria-hidden className={HEADER_ICON_BUTTON_CLASS} />
        ) : null}
      </div>
    </>
  );

  return (
    <AppPageHeader
      headerRef={headerRef}
      centered={isCompactViewport}
      center={center}
      actions={actions}
      isWindowDragRegion={isTopRow}
      ownsWindowTopLeft={ownsWindowTopLeft}
      className={beginPaneDrag ? "z-[21]" : undefined}
    />
  );
}
