// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@bb/shared-ui/tooltip";
import { BrowserScreenshotAnnotation } from "./BrowserScreenshotAnnotation";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("BrowserScreenshotAnnotation", () => {
  it("labels every toolbar button with a tooltip", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        disconnect() {}
        observe() {}
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(
      <TooltipProvider delayDuration={0}>
        <BrowserScreenshotAnnotation
          screenshotUrl="data:image/png;base64,AA=="
          onClose={() => {}}
        />
      </TooltipProvider>,
    );

    const buttonNames = [
      "Pen",
      "Highlighter",
      "Arrow",
      "Rectangle",
      "Ellipse",
      "Text",
      "Red ink",
      "Orange ink",
      "Yellow ink",
      "Green ink",
      "Blue ink",
      "Dark ink",
      "White ink",
      "Undo",
      "Redo",
      "Clear all",
      "Copy PNG",
      "Save PNG",
    ];
    for (const name of buttonNames) {
      expect(
        screen
          .getByRole("button", { name })
          .parentElement?.hasAttribute("data-state"),
      ).toBe(true);
    }

    const blueInkTrigger = screen.getByRole("button", {
      name: "Blue ink",
    }).parentElement;
    if (blueInkTrigger === null)
      throw new Error("Expected blue ink tooltip trigger");
    fireEvent.pointerMove(blueInkTrigger);
    expect((await screen.findByRole("tooltip")).textContent).toBe("Blue ink");
  });

  it("copies the composited screenshot as a PNG", async () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      drawImage,
      lineCap: "round",
      lineJoin: "round",
      lineTo: vi.fn(),
      lineWidth: 1,
      moveTo: vi.fn(),
      setTransform: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: "",
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) =>
        callback(new Blob(["annotated screenshot"], { type: "image/png" })),
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        disconnect() {}
        observe() {}
      },
    );
    const clipboardItems: Array<Record<string, Blob>> = [];
    class TestClipboardItem {
      constructor(item: Record<string, Blob>) {
        clipboardItems.push(item);
      }
    }
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("ClipboardItem", TestClipboardItem);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write },
    });

    render(
      <BrowserScreenshotAnnotation
        screenshotUrl="data:image/png;base64,AA=="
        onClose={() => {}}
      />,
    );
    const image = screen.getByAltText("Captured browser page");
    const canvas = screen.getByLabelText("Drawing canvas") as HTMLCanvasElement;
    Object.defineProperty(image, "naturalWidth", { value: 100 });
    Object.defineProperty(image, "naturalHeight", { value: 60 });
    fireEvent.load(image);
    fireEvent.click(screen.getByRole("button", { name: "Copy PNG" }));

    await waitFor(() => expect(write).toHaveBeenCalledOnce());

    expect(clipboardItems).toHaveLength(1);
    expect(clipboardItems[0]?.["image/png"]?.type).toBe("image/png");
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 100, 60);
    expect(drawImage).toHaveBeenCalledWith(
      canvas,
      0,
      0,
      canvas.width,
      canvas.height,
      0,
      0,
      100,
      60,
    );
  });
});
