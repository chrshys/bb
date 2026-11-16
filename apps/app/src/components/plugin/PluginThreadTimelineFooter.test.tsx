// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExperimentalThreadTimelineFooterProps } from "@get-bb/plugin-sdk";
import {
  collectPluginAppRegistrations,
  definePluginApp,
} from "@/lib/plugin-app-definition";
import {
  resetPluginSlotStoreForTest,
  setPluginSlotRegistrations,
} from "@/lib/plugin-slots";
import { RouteNavigationProvider } from "@/components/ui/app-route-anchor";
import { resetAllCrashedPluginSlotsForTest } from "./PluginSlotMount";
import { PluginThreadTimelineFooter } from "./PluginThreadTimelineFooter";

afterEach(() => {
  cleanup();
  resetPluginSlotStoreForTest();
  resetAllCrashedPluginSlotsForTest();
  vi.restoreAllMocks();
});

function Location() {
  return <output aria-label="Location">{useLocation().pathname}</output>;
}

describe("experimental_threadTimelineFooter public surface", () => {
  it("contains inventory failures to their own split thread", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Footer({ threadId }: ExperimentalThreadTimelineFooterProps) {
      if (threadId === "thr_failed") throw new Error("Inventory failed");
      return <p>Healthy inventory</p>;
    }
    const definition = definePluginApp((app) => {
      app.slots.experimental_threadTimelineFooter({
        id: "inventory",
        title: "Thread activity",
        component: Footer,
      });
    });
    setPluginSlotRegistrations(
      "inventory-plugin",
      collectPluginAppRegistrations(definition),
    );
    render(
      <>
        {["thr_failed", "thr_healthy"].map((threadId) => (
          <PluginThreadTimelineFooter
            key={threadId}
            threadId={threadId}
            projectId="proj_home"
            runtimeDisplayStatus="idle"
          >
            <p>Native child summary</p>
          </PluginThreadTimelineFooter>
        ))}
      </>,
    );
    expect(screen.getAllByText("Thread activity unavailable.")).toHaveLength(1);
    expect(screen.getAllByText("Healthy inventory")).toHaveLength(1);
    expect(screen.queryByText("Native child summary")).toBeNull();
  });

  it.each(["native", "delegate", "owned", "crash"] as const)(
    "renders one honest inventory for %s ownership",
    (mode) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
      const release = vi.fn();
      const activate = vi.fn();
      function Footer({
        Original,
        ThreadBadge,
        threadId,
        runtimeDisplayStatus,
      }: ExperimentalThreadTimelineFooterProps) {
        useEffect(() => {
          activate(threadId);
          return release;
        }, [threadId]);
        if (mode === "crash") throw new Error("Inventory failed");
        if (mode === "delegate") return <Original />;
        return (
          <section aria-label="Bot inventory">
            <span>{runtimeDisplayStatus}</span>
            <ThreadBadge
              threadId="thr_worker"
              projectId="proj_other"
              title="Manual worker"
            />
          </section>
        );
      }
      if (mode !== "native") {
        const definition = definePluginApp((app) => {
          app.slots.experimental_threadTimelineFooter({
            id: "inventory",
            title: "Thread activity",
            component: Footer,
          });
        });
        setPluginSlotRegistrations(
          "inventory-plugin",
          collectPluginAppRegistrations(definition),
        );
      }
      const view = render(
        <MemoryRouter>
          <RouteNavigationProvider>
            <PluginThreadTimelineFooter
              threadId="thr_coordinator"
              projectId="proj_home"
              runtimeDisplayStatus="idle"
            >
              <p>Native child summary</p>
            </PluginThreadTimelineFooter>
            <Location />
          </RouteNavigationProvider>
        </MemoryRouter>,
      );
      if (mode === "owned") {
        expect(screen.queryByText("Native child summary")).toBeNull();
        const badge = screen.getByRole("link", { name: "Manual worker" });
        expect(badge.getAttribute("href")).toBe(
          "/projects/proj_other/threads/thr_worker",
        );
        fireEvent.click(badge);
        expect(screen.getByLabelText("Location").textContent).toBe(
          "/projects/proj_other/threads/thr_worker",
        );
      } else if (mode === "crash") {
        expect(
          screen.getByText("Thread activity unavailable.").getAttribute("role"),
        ).toBe("status");
        expect(screen.queryByText("Native child summary")).toBeNull();
      } else {
        expect(screen.getAllByText("Native child summary")).toHaveLength(1);
        expect(
          screen.queryByRole("region", { name: "Bot inventory" }),
        ).toBeNull();
      }
      view.unmount();
      if (mode === "owned" || mode === "delegate") {
        expect(activate).toHaveBeenCalledWith("thr_coordinator");
        expect(release).toHaveBeenCalledTimes(1);
      }
    },
  );
});
