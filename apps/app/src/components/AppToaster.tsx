import { useEffect, useRef, type RefObject } from "react";
import {
  toast,
  Toaster,
  type ToasterProps,
  type ToastT,
  type ToastToDismiss,
} from "sonner";
import { useIsCompactViewport } from "@bb/shared-ui/hooks/use-compact-viewport";
import { usePreferredTheme } from "@/hooks/useTheme";

const COMPACT_TOAST_TOP_OFFSET =
  "calc(env(safe-area-inset-top) + var(--bb-app-chrome-row-height) + 16px)";
const COMPACT_TOAST_SWIPE_DISTANCE_PX = 20;
const COMPACT_TOAST_SWIPE_DIRECTIONS: NonNullable<
  ToasterProps["swipeDirections"]
> = ["top", "left", "right"];

type ToastPosition = NonNullable<ToasterProps["position"]>;
type ToastSwipeDirection = NonNullable<ToasterProps["swipeDirections"]>[number];

interface ToastSwipeStart {
  pointerId: number;
  toast: ToastT;
  toastElement: HTMLElement;
  x: number;
  y: number;
}

interface CompactToastSwipeFallbackOptions {
  enabled: boolean;
  position: ToastPosition;
  swipeDirections: readonly ToastSwipeDirection[] | undefined;
  toasterRef: RefObject<HTMLElement | null>;
}

function isActiveToast(entry: ToastT | ToastToDismiss): entry is ToastT {
  return !("dismiss" in entry);
}

function activeToastForElement(
  toastElement: HTMLElement,
  defaultPosition: ToastPosition,
): ToastT | null {
  const index = Number(toastElement.dataset.index);
  if (!Number.isInteger(index) || index < 0) {
    return null;
  }
  const elementPosition = `${toastElement.dataset.yPosition}-${toastElement.dataset.xPosition}`;
  const activeToasts = toast.getToasts();
  let positionIndex = 0;
  for (
    let storeIndex = activeToasts.length - 1;
    storeIndex >= 0;
    storeIndex--
  ) {
    const candidate = activeToasts[storeIndex];
    if (
      candidate === undefined ||
      !isActiveToast(candidate) ||
      (candidate.position ?? defaultPosition) !== elementPosition
    ) {
      continue;
    }
    if (positionIndex === index) {
      return candidate;
    }
    positionIndex += 1;
  }
  return null;
}

function swipeDirection(
  deltaX: number,
  deltaY: number,
): ToastSwipeDirection | null {
  if (deltaX === 0 && deltaY === 0) {
    return null;
  }
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return deltaX > 0 ? "right" : "left";
  }
  return deltaY > 0 ? "bottom" : "top";
}

function useCompactToastSwipeFallback({
  enabled,
  position,
  swipeDirections,
  toasterRef,
}: CompactToastSwipeFallbackOptions): void {
  const swipeStartRef = useRef<ToastSwipeStart | null>(null);

  useEffect(() => {
    const toasterElement = toasterRef.current;
    if (!enabled || toasterElement === null) {
      return;
    }
    const allowedDirections = new Set(swipeDirections);

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        event.button !== 0 ||
        event.pointerType !== "touch" ||
        !(target instanceof Element) ||
        target.closest("button") !== null
      ) {
        return;
      }
      const toastElement = target.closest<HTMLElement>("[data-sonner-toast]");
      if (
        toastElement === null ||
        toastElement.dataset.dismissible !== "true" ||
        toastElement.dataset.type === "loading"
      ) {
        return;
      }
      const activeToast = activeToastForElement(toastElement, position);
      if (activeToast === null) {
        return;
      }
      swipeStartRef.current = {
        pointerId: event.pointerId,
        toast: activeToast,
        toastElement,
        x: event.clientX,
        y: event.clientY,
      };
    };

    const handlePointerUp = (event: PointerEvent) => {
      const start = swipeStartRef.current;
      if (start === null || start.pointerId !== event.pointerId) {
        return;
      }
      swipeStartRef.current = null;
      if (start.toastElement.ownerDocument.getSelection()?.toString()) {
        return;
      }
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      const direction = swipeDirection(deltaX, deltaY);
      const distance =
        direction === "left" || direction === "right"
          ? Math.abs(deltaX)
          : Math.abs(deltaY);
      if (
        direction === null ||
        !allowedDirections.has(direction) ||
        distance < COMPACT_TOAST_SWIPE_DISTANCE_PX
      ) {
        return;
      }
      queueMicrotask(() => {
        if (
          !start.toastElement.isConnected ||
          start.toastElement.dataset.removed === "true" ||
          start.toastElement.dataset.swipeOut === "true"
        ) {
          return;
        }
        start.toast.onDismiss?.(start.toast);
        toast.dismiss(start.toast.id);
      });
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (swipeStartRef.current?.pointerId === event.pointerId) {
        swipeStartRef.current = null;
      }
    };

    toasterElement.addEventListener("pointerdown", handlePointerDown);
    toasterElement.addEventListener("pointerup", handlePointerUp);
    toasterElement.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      swipeStartRef.current = null;
      toasterElement.removeEventListener("pointerdown", handlePointerDown);
      toasterElement.removeEventListener("pointerup", handlePointerUp);
      toasterElement.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [enabled, position, swipeDirections, toasterRef]);
}

function withCompactTopOffset(
  offset: ToasterProps["offset"],
): ToasterProps["offset"] {
  if (typeof offset === "object") {
    return { ...offset, top: COMPACT_TOAST_TOP_OFFSET };
  }
  return {
    top: COMPACT_TOAST_TOP_OFFSET,
    right: offset,
    bottom: offset,
    left: offset,
  };
}

export function AppToaster({
  position = "bottom-right",
  offset,
  mobileOffset,
  swipeDirections,
  ...props
}: ToasterProps) {
  const theme = usePreferredTheme();
  const isCompactViewport = useIsCompactViewport();
  const toasterRef = useRef<HTMLElement | null>(null);
  const renderedPosition = isCompactViewport ? "top-center" : position;
  const renderedSwipeDirections =
    swipeDirections ??
    (isCompactViewport ? COMPACT_TOAST_SWIPE_DIRECTIONS : undefined);
  useCompactToastSwipeFallback({
    enabled: isCompactViewport,
    position: renderedPosition,
    swipeDirections: renderedSwipeDirections,
    toasterRef,
  });
  return (
    <Toaster
      ref={toasterRef}
      theme={theme}
      position={renderedPosition}
      {...props}
      offset={isCompactViewport ? withCompactTopOffset(offset) : offset}
      mobileOffset={
        isCompactViewport ? withCompactTopOffset(mobileOffset) : mobileOffset
      }
      swipeDirections={renderedSwipeDirections}
    />
  );
}
