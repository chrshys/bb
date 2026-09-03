// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { toast } from "sonner";
import { CompactViewportOverrideProvider } from "@bb/shared-ui/hooks/use-compact-viewport";
import { AppToaster } from "./AppToaster";

afterEach(() => {
  toast.dismiss();
  cleanup();
});

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
    ["downward drag", 160, 100, 160, 180, false],
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
});
