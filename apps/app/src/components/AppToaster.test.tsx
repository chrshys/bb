// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useTheme", () => ({
  usePreferredTheme: () => "dark",
}));

vi.mock("sonner", () => ({
  Toaster: ({ theme }: { theme: string }) => (
    <div data-testid="toaster" data-theme={theme} />
  ),
}));

import { AppToaster } from "./AppToaster";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("AppToaster", () => {
  it("renders outside the masked app root while retaining the active theme", () => {
    document.body.innerHTML = '<div id="root"><div id="mount"></div></div>';
    const root = document.getElementById("root");
    const mount = document.getElementById("mount");
    expect(root).not.toBeNull();
    if (mount === null) throw new Error("Expected toast test mount");
    expect(mount).not.toBeNull();
    render(<AppToaster />, { container: mount });

    const toaster = screen.getByTestId("toaster");
    expect(root?.contains(toaster)).toBe(false);
    expect(toaster.parentElement).toBe(document.body);
    expect(toaster.dataset.theme).toBe("dark");
  });
});
