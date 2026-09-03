import { useEffect, useRef, type RefObject } from "react";
import {
  toast,
  Toaster,
  type ToasterProps,
  type ToastT,
  type ToastToDismiss,
} from "sonner";
import { useIsCompactViewport } from "@bb/shared-ui/hooks/use-compact-viewport";
import { usePointerCoarse } from "@bb/shared-ui/hooks/use-pointer-coarse";
import { usePreferredTheme } from "@/hooks/useTheme";

const COMPACT_TOAST_TOP_OFFSET =
  "calc(env(safe-area-inset-top) + var(--bb-app-chrome-row-height) + 16px)";
const TOUCH_TOAST_SWIPE_DISTANCE_PX = 20;
const TOUCH_TOAST_SWIPE_DIRECTIONS: NonNullable<
  ToasterProps["swipeDirections"]
> = ["top", "right", "bottom", "left"];

type ToastPosition = NonNullable<ToasterProps["position"]>;
type ToastSwipeDirection = NonNullable<ToasterProps["swipeDirections"]>[number];

interface ToastSwipeStart {
  pointerId: number;
  toastId: ToastT["id"];
  toastElement: HTMLElement;
  x: number;
  y: number;
}

interface TouchToastSwipeFallbackOptions {
  enabled: boolean;
  position: ToastPosition;
  swipeDirections: readonly ToastSwipeDirection[] | undefined;
  toasterRef: RefObject<HTMLElement | null>;
}

function isActiveToast(entry: ToastT | ToastToDismiss): entry is ToastT {
  return !("dismiss" in entry);
}

function toastPositionForElement(toastElement: HTMLElement): string {
  return `${toastElement.dataset.yPosition}-${toastElement.dataset.xPosition}`;
}

function activeToastById(id: ToastT["id"]): ToastT | null {
  return (
    toast
      .getToasts()
      .find(
        (entry): entry is ToastT => isActiveToast(entry) && entry.id === id,
      ) ?? null
  );
}

function associateToastElements(
  toasterElement: HTMLElement,
  defaultPosition: ToastPosition,
  toastIdsByElement: WeakMap<HTMLElement, ToastT["id"]>,
): void {
  const activeToastsByPosition = new Map<string, ToastT[]>();
  const activeToasts = toast.getToasts();
  for (
    let storeIndex = activeToasts.length - 1;
    storeIndex >= 0;
    storeIndex--
  ) {
    const candidate = activeToasts[storeIndex];
    if (candidate === undefined || !isActiveToast(candidate)) {
      continue;
    }
    const candidatePosition = candidate.position ?? defaultPosition;
    const positionToasts = activeToastsByPosition.get(candidatePosition) ?? [];
    positionToasts.push(candidate);
    activeToastsByPosition.set(candidatePosition, positionToasts);
  }

  const activeElementsByPosition = new Map<string, HTMLElement[]>();
  const toastElements = toasterElement.querySelectorAll<HTMLElement>(
    "[data-sonner-toast]",
  );
  for (const toastElement of toastElements) {
    if (toastElement.dataset.removed === "true") {
      continue;
    }
    const elementPosition = toastPositionForElement(toastElement);
    const positionElements =
      activeElementsByPosition.get(elementPosition) ?? [];
    positionElements.push(toastElement);
    activeElementsByPosition.set(elementPosition, positionElements);
  }

  for (const [elementPosition, positionElements] of activeElementsByPosition) {
    const positionToasts = activeToastsByPosition.get(elementPosition);
    if (
      positionToasts === undefined ||
      positionElements.length > positionToasts.length
    ) {
      continue;
    }
    for (let index = 0; index < positionElements.length; index++) {
      const toastElement = positionElements[index];
      const activeToast = positionToasts[index];
      if (
        toastElement !== undefined &&
        activeToast !== undefined &&
        !toastIdsByElement.has(toastElement)
      ) {
        toastIdsByElement.set(toastElement, activeToast.id);
      }
    }
  }
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

function useTouchToastSwipeFallback({
  enabled,
  position,
  swipeDirections,
  toasterRef,
}: TouchToastSwipeFallbackOptions): void {
  const swipeStartRef = useRef<ToastSwipeStart | null>(null);

  useEffect(() => {
    const toasterElement = toasterRef.current;
    if (!enabled || toasterElement === null) {
      return;
    }
    const allowedDirections = new Set(swipeDirections);
    const toastIdsByElement = new WeakMap<HTMLElement, ToastT["id"]>();

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
      associateToastElements(toasterElement, position, toastIdsByElement);
      const toastId = toastIdsByElement.get(toastElement);
      if (toastId === undefined || activeToastById(toastId) === null) {
        return;
      }
      swipeStartRef.current = {
        pointerId: event.pointerId,
        toastId,
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
        distance < TOUCH_TOAST_SWIPE_DISTANCE_PX
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
        const activeToast = activeToastById(start.toastId);
        if (activeToast === null) {
          return;
        }
        activeToast.onDismiss?.(activeToast);
        toast.dismiss(activeToast.id);
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
  const isPointerCoarse = usePointerCoarse();
  const toasterRef = useRef<HTMLElement | null>(null);
  const renderedPosition = isCompactViewport ? "top-center" : position;
  const touchSwipeEnabled = isCompactViewport || isPointerCoarse;
  const renderedSwipeDirections =
    swipeDirections ??
    (touchSwipeEnabled ? TOUCH_TOAST_SWIPE_DIRECTIONS : undefined);
  useTouchToastSwipeFallback({
    enabled: touchSwipeEnabled,
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
