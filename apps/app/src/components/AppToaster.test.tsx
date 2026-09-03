// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { CompactViewportOverrideProvider } from "@bb/shared-ui/hooks/use-compact-viewport";
import { POINTER_COARSE_QUERY } from "@bb/shared-ui/hooks/use-pointer-coarse";
import { AppToaster } from "./AppToaster";

afterEach(() => {
  toast.dismiss();
  cleanup();
  vi.restoreAllMocks();
});

function mockPointerCoarse(): void {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: query === POINTER_COARSE_QUERY,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

async function renderToaster(isCompactViewport: boolean) {
  render(
    <CompactViewportOverrideProvider isCompactViewport={isCompactViewport}>
      <AppToaster position="bottom-right" />
    </CompactViewportOverrideProvider>,
  );

  act(() => {
    toast("Position test", { duration: Number.POSITIVE_INFINITY });
  });

  return waitFor(() => {
    const toaster = document.querySelector<HTMLElement>(
      "[data-sonner-toaster]",
    );
    expect(toaster).not.toBeNull();
    return toaster;
  });
}

function flickToast(toastElement: HTMLElement, pointerId: number): void {
  Object.defineProperty(toastElement, "setPointerCapture", {
    configurable: true,
    value: () => undefined,
  });
  fireEvent.pointerDown(toastElement, {
    clientX: 120,
    clientY: 100,
    pointerId,
    pointerType: "touch",
  });
  fireEvent.pointerMove(toastElement, {
    clientX: 200,
    clientY: 100,
    pointerId,
    pointerType: "touch",
  });
  fireEvent.pointerUp(toastElement, {
    clientX: 200,
    clientY: 100,
    pointerId,
    pointerType: "touch",
  });
}

describe("AppToaster", () => {
  it("places compact viewport toasts at the top center", async () => {
    const toaster = await renderToaster(true);
    expect(toaster?.getAttribute("data-x-position")).toBe("center");
    expect(toaster?.getAttribute("data-y-position")).toBe("top");
    expect(toaster?.style.getPropertyValue("--offset-top")).toBe(
      "calc(env(safe-area-inset-top) + var(--bb-app-chrome-row-height) + 16px)",
    );
    expect(toaster?.style.getPropertyValue("--mobile-offset-top")).toBe(
      "calc(env(safe-area-inset-top) + var(--bb-app-chrome-row-height) + 16px)",
    );
  });

  it("preserves the configured desktop toast position", async () => {
    const toaster = await renderToaster(false);
    expect(toaster?.getAttribute("data-x-position")).toBe("right");
    expect(toaster?.getAttribute("data-y-position")).toBe("bottom");
  });

  it.each([
    ["left flick", 200, 100, 120, 100, true],
    ["right flick", 120, 100, 200, 100, true],
    ["up flick", 160, 120, 160, 80, true],
    ["down flick", 160, 100, 160, 180, true],
    ["down-right diagonal flick", 120, 100, 180, 170, true],
    ["down-left diagonal flick", 200, 100, 140, 170, true],
    ["short horizontal drag", 160, 100, 172, 100, false],
  ] as const)(
    "handles a compact viewport single-move %s",
    async (_gesture, startX, startY, endX, endY, shouldDismiss) => {
      await renderToaster(true);
      const toastElement = document.querySelector<HTMLElement>(
        "[data-sonner-toast]",
      );
      expect(toastElement).not.toBeNull();
      if (toastElement === null) {
        return;
      }
      Object.defineProperty(toastElement, "setPointerCapture", {
        configurable: true,
        value: () => undefined,
      });

      fireEvent.pointerDown(toastElement, {
        clientX: startX,
        clientY: startY,
        pointerId: 1,
        pointerType: "touch",
      });
      fireEvent.pointerMove(toastElement, {
        clientX: endX,
        clientY: endY,
        pointerId: 1,
        pointerType: "touch",
      });
      fireEvent.pointerUp(toastElement, {
        clientX: endX,
        clientY: endY,
        pointerId: 1,
        pointerType: "touch",
      });

      if (shouldDismiss) {
        await waitFor(() => {
          expect(document.querySelector("[data-sonner-toast]")).toBeNull();
        });
      } else {
        await act(async () => Promise.resolve());
        expect(document.querySelector("[data-sonner-toast]")).toBe(
          toastElement,
        );
      }
    },
  );

  it("handles touch flicks outside the compact viewport", async () => {
    mockPointerCoarse();
    await renderToaster(false);
    const toastElement = document.querySelector<HTMLElement>(
      "[data-sonner-toast]",
    );
    expect(toastElement).not.toBeNull();
    if (toastElement === null) {
      return;
    }

    flickToast(toastElement, 1);

    await waitFor(() => {
      expect(document.querySelector("[data-sonner-toast]")).toBeNull();
    });
  });

  it("dismisses rapid stacked flicks by stable toast identity", async () => {
    const onDismissA = vi.fn();
    const onDismissB = vi.fn();
    const onDismissC = vi.fn();
    render(
      <CompactViewportOverrideProvider isCompactViewport>
        <AppToaster position="bottom-right" />
      </CompactViewportOverrideProvider>,
    );
    act(() => {
      toast("Stack A", {
        duration: Number.POSITIVE_INFINITY,
        id: "stack-a",
        onDismiss: onDismissA,
      });
      toast("Stack B", {
        duration: Number.POSITIVE_INFINITY,
        id: "stack-b",
        onDismiss: onDismissB,
      });
      toast("Stack C", {
        duration: Number.POSITIVE_INFINITY,
        id: "stack-c",
        onDismiss: onDismissC,
      });
    });
    await waitFor(() => {
      expect(document.querySelectorAll("[data-sonner-toast]")).toHaveLength(3);
    });
    const toastElements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-sonner-toast]"),
    );
    const toastB = toastElements.find(
      (toastElement) => toastElement.textContent === "Stack B",
    );
    const toastC = toastElements.find(
      (toastElement) => toastElement.textContent === "Stack C",
    );
    expect(toastB).toBeDefined();
    expect(toastC).toBeDefined();
    if (toastB === undefined || toastC === undefined) {
      return;
    }

    flickToast(toastC, 1);
    await act(async () => Promise.resolve());
    flickToast(toastB, 2);
    await act(async () => Promise.resolve());

    expect(onDismissC).toHaveBeenCalledOnce();
    expect(onDismissB).toHaveBeenCalledOnce();
    expect(onDismissA).not.toHaveBeenCalled();
  });
});
