// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThreadReadTracking } from "./useThreadReadTracking";

type MarkThreadReadMutation = Parameters<
  typeof useThreadReadTracking
>[0]["markThreadRead"];

function makeMarkThreadRead() {
  return {
    mutateAsync: vi.fn<MarkThreadReadMutation["mutateAsync"]>(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new Error("Aborted")),
            { once: true },
          );
        }),
    ),
  } satisfies MarkThreadReadMutation;
}

function setDocumentVisibilityState(
  visibilityState: DocumentVisibilityState,
): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: visibilityState,
  });
}

describe("useThreadReadTracking", () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    setDocumentVisibilityState("visible");
  });

  it("does not mark read without a visible thread", () => {
    const markThreadRead = makeMarkThreadRead();

    renderHook(() =>
      useThreadReadTracking({
        markThreadRead,
        thread: undefined,
      }),
    );

    expect(markThreadRead.mutateAsync).not.toHaveBeenCalled();
  });

  it("requires two continuous visible seconds and cancels on departure", () => {
    const markThreadRead = makeMarkThreadRead();
    const { rerender, unmount } = renderHook(
      ({ id }) =>
        useThreadReadTracking({
          markThreadRead,
          thread: { id, lastReadAt: 10, latestAttentionAt: 20 },
        }),
      { initialProps: { id: "A" } },
    );
    act(() => vi.advanceTimersByTime(1999));
    expect(markThreadRead.mutateAsync).not.toHaveBeenCalled();
    rerender({ id: "B" });
    act(() => vi.advanceTimersByTime(1000));
    act(() => {
      setDocumentVisibilityState("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => vi.advanceTimersByTime(3000));
    expect(markThreadRead.mutateAsync).not.toHaveBeenCalled();
    act(() => {
      setDocumentVisibilityState("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => vi.advanceTimersByTime(1999));
    expect(markThreadRead.mutateAsync).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(markThreadRead.mutateAsync).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ threadId: "B" }),
    );
    rerender({ id: "C" });
    unmount();
    act(() => vi.advanceTimersByTime(2000));
    expect(markThreadRead.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("marks an unread thread read after a mobile pageshow restore", () => {
    setDocumentVisibilityState("hidden");
    const markThreadRead = makeMarkThreadRead();

    renderHook(() =>
      useThreadReadTracking({
        markThreadRead,
        thread: {
          id: "thr_mobile_restore",
          lastReadAt: 10,
          latestAttentionAt: 20,
        },
      }),
    );

    expect(markThreadRead.mutateAsync).not.toHaveBeenCalled();

    act(() => {
      setDocumentVisibilityState("visible");
      window.dispatchEvent(new Event("pageshow"));
    });

    act(() => vi.advanceTimersByTime(2000));
    expect(markThreadRead.mutateAsync).toHaveBeenCalledTimes(1);
    expect(markThreadRead.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ threadId: "thr_mobile_restore" }),
    );
  });

  it("marks an unread thread once per attention timestamp", () => {
    const markThreadRead = makeMarkThreadRead();
    const { rerender } = renderHook(
      ({ latestAttentionAt }: { latestAttentionAt: number }) =>
        useThreadReadTracking({
          markThreadRead,
          thread: {
            id: "thr_side_chat",
            lastReadAt: 10,
            latestAttentionAt,
          },
        }),
      { initialProps: { latestAttentionAt: 20 } },
    );

    act(() => vi.advanceTimersByTime(2000));
    expect(markThreadRead.mutateAsync).toHaveBeenCalledTimes(1);
    expect(markThreadRead.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ threadId: "thr_side_chat" }),
    );

    rerender({ latestAttentionAt: 20 });
    act(() => vi.advanceTimersByTime(2000));
    expect(markThreadRead.mutateAsync).toHaveBeenCalledTimes(1);

    rerender({ latestAttentionAt: 30 });
    act(() => vi.advanceTimersByTime(2000));
    expect(markThreadRead.mutateAsync).toHaveBeenCalledTimes(2);
  });

  it("retries a failed read after pageshow while already visible", async () => {
    const markThreadRead = makeMarkThreadRead();
    markThreadRead.mutateAsync.mockRejectedValueOnce(new Error("Failed"));
    renderHook(() =>
      useThreadReadTracking({
        markThreadRead,
        thread: {
          id: "thr_side_chat",
          lastReadAt: 10,
          latestAttentionAt: 20,
        },
      }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    act(() => {
      window.dispatchEvent(new Event("pageshow"));
    });

    act(() => vi.advanceTimersByTime(2000));
    expect(markThreadRead.mutateAsync).toHaveBeenCalledTimes(2);
  });

  it("does not undo marking the visible thread unread after tab refocus", () => {
    const markThreadRead = makeMarkThreadRead();
    type VisibleThreadProps = { lastReadAt: number | null };
    const initialProps: VisibleThreadProps = { lastReadAt: 20 };
    const { rerender } = renderHook(
      ({ lastReadAt }: VisibleThreadProps) =>
        useThreadReadTracking({
          markThreadRead,
          thread: {
            id: "thr_side_chat",
            lastReadAt,
            latestAttentionAt: 20,
          },
        }),
      { initialProps },
    );

    rerender({ lastReadAt: null });
    act(() => vi.advanceTimersByTime(2000));
    expect(markThreadRead.mutateAsync).not.toHaveBeenCalled();

    act(() => {
      setDocumentVisibilityState("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => {
      setDocumentVisibilityState("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });

    act(() => vi.advanceTimersByTime(2000));
    expect(markThreadRead.mutateAsync).not.toHaveBeenCalled();
  });

  it("marks a previously auto-read thread read when reopened after manual unread", async () => {
    const markThreadRead = makeMarkThreadRead();
    type ReopenThreadProps = {
      lastReadAt: number | null;
      visible: boolean;
    };
    const initialProps: ReopenThreadProps = {
      lastReadAt: 10,
      visible: true,
    };
    const { rerender } = renderHook(
      ({ lastReadAt, visible }: ReopenThreadProps) =>
        useThreadReadTracking({
          markThreadRead,
          thread: visible
            ? {
                id: "thr_side_chat",
                lastReadAt,
                latestAttentionAt: 20,
              }
            : undefined,
        }),
      { initialProps },
    );

    act(() => vi.advanceTimersByTime(2000));
    expect(markThreadRead.mutateAsync).toHaveBeenCalledTimes(1);

    rerender({ lastReadAt: 20, visible: true });
    rerender({ lastReadAt: null, visible: true });
    act(() => vi.advanceTimersByTime(2000));
    expect(markThreadRead.mutateAsync).toHaveBeenCalledTimes(1);

    rerender({ lastReadAt: null, visible: false });
    await act(async () => {});
    rerender({ lastReadAt: null, visible: true });

    act(() => vi.advanceTimersByTime(2000));
    expect(markThreadRead.mutateAsync).toHaveBeenCalledTimes(2);
  });
});
