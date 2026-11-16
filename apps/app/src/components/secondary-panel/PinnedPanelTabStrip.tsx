import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@bb/shared-ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@bb/shared-ui/tooltip";
import { TabPill } from "@/components/ui/tab-pill";

export interface PinnedPanelTabStripItem {
  ariaKeyshortcuts?: string;
  ariaLabel: string;
  id: string;
  isActive: boolean;
  label: string;
  leadingVisual: ReactNode;
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  onSelect: () => void;
  testId?: string;
  title: string;
}

interface PinnedPanelTabStripProps {
  className?: string;
  compact?: boolean;
  itemClassName?: string;
  items: readonly PinnedPanelTabStripItem[];
  showTooltips?: boolean;
}

const PINNED_TAB_BUTTON_SELECTOR = "[data-pinned-panel-tab] button";
const EDGE_EPSILON_PX = 1;
const EDGE_FADE_PX = 20;

interface StripOverflow {
  end: boolean;
  start: boolean;
}

const NO_OVERFLOW: StripOverflow = { end: false, start: false };

function measureOverflow(strip: HTMLElement): StripOverflow {
  const maxScrollLeft = strip.scrollWidth - strip.clientWidth;
  if (maxScrollLeft <= EDGE_EPSILON_PX) return NO_OVERFLOW;
  return {
    end: strip.scrollLeft < maxScrollLeft - EDGE_EPSILON_PX,
    start: strip.scrollLeft > EDGE_EPSILON_PX,
  };
}

function getEdgeFadeStyle(overflow: StripOverflow): CSSProperties | undefined {
  if (!overflow.start && !overflow.end) return undefined;
  const maskImage = `linear-gradient(to right, ${
    overflow.start ? "transparent" : "black"
  }, black ${EDGE_FADE_PX}px, black calc(100% - ${EDGE_FADE_PX}px), ${
    overflow.end ? "transparent" : "black"
  })`;
  return { maskImage, WebkitMaskImage: maskImage };
}

function resolveFocusTarget(
  key: string,
  buttons: readonly HTMLElement[],
  currentIndex: number,
): HTMLElement | undefined {
  switch (key) {
    case "ArrowRight":
      return buttons[(currentIndex + 1) % buttons.length];
    case "ArrowLeft":
      return buttons[(currentIndex - 1 + buttons.length) % buttons.length];
    case "Home":
      return buttons[0];
    case "End":
      return buttons[buttons.length - 1];
    default:
      return undefined;
  }
}

export function PinnedPanelTabStrip({
  className,
  compact = false,
  itemClassName,
  items,
  showTooltips = true,
}: PinnedPanelTabStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const activeItemId = items.find((item) => item.isActive)?.id ?? null;
  const [overflow, setOverflow] = useState(NO_OVERFLOW);
  const itemCount = items.length;

  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (strip === null) return;
    const update = () => {
      const next = measureOverflow(strip);
      setOverflow((current) =>
        current.start === next.start && current.end === next.end
          ? current
          : next,
      );
    };
    update();
    strip.addEventListener("scroll", update, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(strip);
    return () => {
      strip.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [itemCount]);

  useLayoutEffect(() => {
    if (activeItemId === null) return;
    const strip = stripRef.current;
    if (strip === null || strip.scrollWidth <= strip.clientWidth) return;
    for (const element of strip.querySelectorAll<HTMLElement>(
      "[data-pinned-panel-tab]",
    )) {
      if (element.dataset.pinnedPanelTab === activeItemId) {
        element.scrollIntoView?.({ inline: "nearest", block: "nearest" });
        return;
      }
    }
  }, [activeItemId, items.length]);

  if (items.length === 0) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    const strip = stripRef.current;
    if (strip === null || !(event.target instanceof HTMLElement)) return;
    const buttons = Array.from(
      strip.querySelectorAll<HTMLElement>(PINNED_TAB_BUTTON_SELECTOR),
    );
    const currentIndex = buttons.indexOf(event.target);
    if (currentIndex === -1) return;
    const next = resolveFocusTarget(event.key, buttons, currentIndex);
    if (next === undefined) return;
    event.preventDefault();
    next.focus();
    next.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  };

  return (
    <div
      ref={stripRef}
      role="group"
      aria-label="Pinned views"
      data-pinned-panel-tab-strip=""
      data-no-secondary-panel-swipe=""
      data-overflow-start={overflow.start ? "" : undefined}
      data-overflow-end={overflow.end ? "" : undefined}
      style={getEdgeFadeStyle(overflow)}
      className={cn(
        "no-scrollbar flex max-w-1/2 shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain",
        className,
      )}
      onKeyDown={handleKeyDown}
    >
      {items.map((item) => {
        const pinnedTab = (
          <div
            key={item.id}
            data-pinned-panel-tab={item.id}
            data-testid={item.testId}
            className={cn("shrink-0", itemClassName)}
            onPointerDown={item.onPointerDown}
          >
            <TabPill
              compact={compact}
              label={item.label}
              ariaLabel={item.ariaLabel}
              ariaKeyshortcuts={item.ariaKeyshortcuts}
              iconOnly
              leadingVisual={item.leadingVisual}
              title={item.title}
              isActive={item.isActive}
              onSelect={item.onSelect}
              closeAction={null}
            />
          </div>
        );
        return showTooltips ? (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>{pinnedTab}</TooltipTrigger>
            <TooltipContent>{item.title}</TooltipContent>
          </Tooltip>
        ) : (
          pinnedTab
        );
      })}
    </div>
  );
}
