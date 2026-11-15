// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThreadTimelineSurface } from "@/components/thread/timeline/ThreadTimelineSurface";
import { conversationRow } from "@/test/fixtures/thread-timeline-rows";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteNavigationProvider } from "@/components/ui/app-route-anchor";
import { ConversationMessageContent } from "@/components/thread/timeline/ConversationMessageContent";
import {
  collectPluginAppRegistrations,
  definePluginApp,
} from "@/lib/plugin-app-definition";
import {
  removePluginSlotRegistrations,
  resetPluginSlotStoreForTest,
  setPluginSlotRegistrations,
} from "@/lib/plugin-slots";
import { usePluginId } from "./plugin-context";
import { resetAllCrashedPluginSlotsForTest } from "./PluginSlotMount";
import { ThreadMessageAppearanceProvider } from "./ThreadMessageAppearance";
import type { ExperimentalThreadMessageAppearanceRegistration } from "@get-bb/plugin-sdk";

function register(
  useAppearance: ExperimentalThreadMessageAppearanceRegistration["useAppearance"],
  pluginId = "appearance",
) {
  setPluginSlotRegistrations(
    pluginId,
    collectPluginAppRegistrations(
      definePluginApp((app) => {
        app.slots.experimental_threadMessageAppearance({
          id: "color",
          useAppearance,
        });
      }),
    ),
  );
}

function Message({
  threadId = "one",
  initiator = "user",
  confirmed = true,
  text,
}: {
  threadId?: string;
  initiator?: "user" | "agent" | "system";
  confirmed?: boolean;
  text?: string;
}) {
  return (
    <ConversationMessageContent
      role="user"
      attachments={null}
      initiator={initiator}
      humanMessagePresentation={confirmed}
      mentions={[]}
      senderThreadId={null}
      senderThreadTitle={null}
      senderIsPluginSideChat={false}
      systemMessageKind="unlabeled"
      systemMessageSubject={null}
      text={text ?? `Message ${threadId}`}
      timestamp={0}
      threadId={threadId}
      turnRequest={{ isGrouped: false, kind: "message", status: "accepted" }}
    />
  );
}

function Timeline({
  threadId = "one",
  initiator = "user",
  confirmed = true,
  text,
}: Parameters<typeof Message>[0]) {
  return (
    <MemoryRouter>
      <RouteNavigationProvider>
        <ThreadMessageAppearanceProvider threadId={threadId}>
          <Message
            threadId={threadId}
            initiator={initiator}
            confirmed={confirmed}
            text={text}
          />
        </ThreadMessageAppearanceProvider>
      </RouteNavigationProvider>
    </MemoryRouter>
  );
}

function bubble(container: HTMLElement) {
  return container.querySelector<HTMLElement>(
    "[data-human-message-appearance]",
  );
}

afterEach(() => {
  cleanup();
  resetPluginSlotStoreForTest();
  resetAllCrashedPluginSlotsForTest();
  vi.restoreAllMocks();
});

describe("native human message appearance", () => {
  it.each([
    ["user", true, true],
    ["user", false, false],
    ["agent", true, false],
    ["system", true, false],
  ] as const)(
    "gates %s confirmed=%s on explicit human presentation and native initiator",
    (initiator, confirmed, tinted) => {
      register(() => ({ humanMessageBackgroundColor: "#225588" }));
      const { container } = render(
        <Timeline initiator={initiator} confirmed={confirmed} />,
      );
      expect(bubble(container) !== null).toBe(tinted);
      expect(screen.getByText("Message one")).toBeTruthy();
    },
  );

  it.each([
    null,
    "#abc",
    "#12345678",
    "red",
    "url(https://invalid)",
    "#123456; color:red",
  ])("falls back for unavailable or invalid color %s", (color) => {
    register(() =>
      color === null ? null : { humanMessageBackgroundColor: color },
    );
    const { container } = render(<Timeline />);
    expect(bubble(container)).toBeNull();
    expect(screen.getByText("Message one")).toBeTruthy();
  });

  it("projects explicit presentation through the shared native timeline surface", () => {
    register(() => ({ humanMessageBackgroundColor: "#112233" }));
    const queryClient = new QueryClient();
    const rows = [false, true].map((humanMessagePresentation) => ({
      ...conversationRow({
        id: String(humanMessagePresentation),
        role: "user",
        initiator: "user",
        text: humanMessagePresentation ? "Native human row" : "Legacy row",
        threadId: "one",
      }),
      humanMessagePresentation,
    }));
    const view = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RouteNavigationProvider>
            <ThreadTimelineSurface
              activeThinking={null}
              contextBoundarySeq={null}
              timelineError={false}
              workspaceRootPath={undefined}
              isThreadTimelinePending={false}
              showOngoingIndicator={false}
              threadId="one"
              threadRuntimeDisplayStatus="idle"
              timelineRows={rows}
            />
          </RouteNavigationProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(
      view.container.querySelectorAll("[data-human-message-appearance]"),
    ).toHaveLength(1);
    expect(bubble(view.container)?.textContent).toContain("Native human row");
    expect(screen.getByText("Legacy row")).toBeTruthy();
    queryClient.clear();
  });

  it("rejects malformed and duplicate hook registrations at the plugin boundary", () => {
    expect(() =>
      collectPluginAppRegistrations(
        definePluginApp((app) => {
          const registration = { id: "color", useAppearance: () => null };
          app.slots.experimental_threadMessageAppearance(registration);
          app.slots.experimental_threadMessageAppearance(registration);
        }),
      ),
    ).toThrow(/duplicate/i);
    expect(() =>
      collectPluginAppRegistrations(
        definePluginApp((app) => {
          app.slots.experimental_threadMessageAppearance({
            id: "color",
            useAppearance: null as never,
          });
        }),
      ),
    ).toThrow(/useAppearance/);
  });

  it.each([
    "#000000",
    "#ffffff",
    "#ff0000",
    "#00ff00",
    "#0000ff",
    "#ffff00",
    "#00ffff",
    "#ff00ff",
    "#777777",
    "#757575",
    "#765432",
  ])(
    "preserves %s and selects a foreground above WCAG AA in either theme",
    (color) => {
      register(() => ({ humanMessageBackgroundColor: color }));
      const { container } = render(<Timeline />);
      const element = bubble(container)!;
      const nativeForegroundMix = element.style.getPropertyValue(
        "--human-message-foreground",
      );
      const channels = color
        .slice(1)
        .match(/../g)!
        .map((channel) => parseInt(channel, 16) / 255);
      const linear = channels.map((value) =>
        value <= 0.04045
          ? value / 12.92
          : Math.pow((value + 0.055) / 1.055, 2.4),
      );
      const background =
        linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
      const foregroundBound = nativeForegroundMix.includes("black")
        ? 0.00001
        : 0.996;
      const contrast =
        (Math.max(background, foregroundBound) + 0.05) /
        (Math.min(background, foregroundBound) + 0.05);
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      expect(element.style.backgroundColor).toBe(
        `rgb(${channels.map((value) => Math.round(value * 255)).join(", ")})`,
      );
    },
  );

  it("keeps native messages without a provider and clears an already applied appearance when its hook crashes", () => {
    const view = render(<Timeline />);
    expect(bubble(view.container)).toBeNull();
    let fail: () => void = () => {};
    act(() =>
      register(() => {
        const [failed, setFailed] = useState(false);
        fail = () => setFailed(true);
        if (failed) throw new Error("refresh failed");
        return { humanMessageBackgroundColor: "#112233" };
      }),
    );
    expect(bubble(view.container)).not.toBeNull();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    act(() => fail());
    expect(bubble(view.container)).toBeNull();
    expect(screen.getByText("Message one")).toBeTruthy();
  });

  it("scopes hook state to the plugin and each timeline, refreshes, and removes stale appearance", () => {
    const setters = new Map<string, (color: string) => void>();
    register(({ threadId }) => {
      expect(usePluginId()).toBe("appearance");
      const [color, setColor] = useState(
        threadId === "one" ? "#112233" : "#eeccaa",
      );
      setters.set(threadId, setColor);
      return { humanMessageBackgroundColor: color };
    });
    const first = render(<Timeline />);
    const second = render(<Timeline threadId="two" />);
    expect(bubble(first.container)?.style.backgroundColor).toBe(
      "rgb(17, 34, 51)",
    );
    expect(bubble(second.container)?.style.backgroundColor).toBe(
      "rgb(238, 204, 170)",
    );
    act(() => setters.get("one")?.("#445566"));
    expect(bubble(first.container)?.style.backgroundColor).toBe(
      "rgb(68, 85, 102)",
    );
    expect(bubble(second.container)?.style.backgroundColor).toBe(
      "rgb(238, 204, 170)",
    );
    first.rerender(<Timeline threadId="three" />);
    expect(bubble(first.container)?.style.backgroundColor).toBe(
      "rgb(238, 204, 170)",
    );
    act(() => removePluginSlotRegistrations("appearance"));
    expect(bubble(first.container)).toBeNull();
    expect(bubble(second.container)).toBeNull();
  });

  it("preserves native message expansion when appearance providers reload or disappear", () => {
    register(() => ({ humanMessageBackgroundColor: "#112233" }));
    render(<Timeline text={"Long message ".repeat(6000)} />);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    act(() => register(() => ({ humanMessageBackgroundColor: "#445566" })));
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();
    act(() => removePluginSlotRegistrations("appearance"));
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();
  });

  it("isolates provider failure and recovers after reload without losing native messages", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    register(({ threadId }) => {
      if (threadId === "one") throw new Error("unavailable");
      return { humanMessageBackgroundColor: "#112233" };
    });
    const first = render(<Timeline />);
    const second = render(<Timeline threadId="two" />);
    expect(bubble(first.container)).toBeNull();
    expect(bubble(second.container)).not.toBeNull();
    expect(screen.getByText("Message one")).toBeTruthy();
    act(() => register(() => ({ humanMessageBackgroundColor: "#445566" })));
    expect(bubble(first.container)?.style.backgroundColor).toBe(
      "rgb(68, 85, 102)",
    );
  });

  it("uses deterministic provider precedence and restores native colors when the selected provider abstains", () => {
    register(() => ({ humanMessageBackgroundColor: "#112233" }), "z-last");
    register(() => null, "a-first");
    const { container } = render(<Timeline />);
    expect(bubble(container)).toBeNull();
    act(() => removePluginSlotRegistrations("a-first"));
    expect(bubble(container)?.style.backgroundColor).toBe("rgb(17, 34, 51)");
  });
});
