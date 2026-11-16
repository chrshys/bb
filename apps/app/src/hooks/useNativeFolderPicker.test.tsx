// @vitest-environment jsdom

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNativeFolderPicker } from "./useNativeFolderPicker";

const mocks = vi.hoisted(() => ({
  desktopPickFolder: vi.fn(),
  hosts: [] as { id: string; status: string }[],
  hostsEnabled: null as boolean | null,
  localDaemonHostId: "host_atum" as string | null,
  pickFolder: vi.fn(),
  supportsNativeFolderPicker: true,
}));

vi.mock("@/hooks/queries/host-queries", () => ({
  useHosts: ({ enabled }: { enabled: boolean }) => {
    mocks.hostsEnabled = enabled;
    return { data: enabled ? mocks.hosts : undefined };
  },
}));

vi.mock("@/hooks/useHostDaemon", () => ({
  useHostDaemon: () => ({
    localDaemonHostId: mocks.localDaemonHostId,
    supportsNativeFolderPicker: mocks.supportsNativeFolderPicker,
  }),
}));

vi.mock("@/lib/sdk", () => ({
  sdk: { hosts: { pickFolder: mocks.pickFolder } },
}));

function installDesktopShell(): void {
  Object.defineProperty(window, "bbDesktop", {
    configurable: true,
    value: { pickFolder: mocks.desktopPickFolder },
  });
}

beforeEach(() => {
  mocks.hosts = [{ id: "host_atum", status: "connected" }];
  mocks.hostsEnabled = null;
  mocks.localDaemonHostId = "host_atum";
  mocks.supportsNativeFolderPicker = true;
  mocks.pickFolder.mockResolvedValue({ path: "/home/me/repo/" });
  mocks.desktopPickFolder.mockResolvedValue("/Users/me/desktop-repo/");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Reflect.deleteProperty(window, "bbDesktop");
});

describe("useNativeFolderPicker", () => {
  it("asks the daemon in a browser tab and normalizes the chosen path", async () => {
    const { result } = renderHook(() => useNativeFolderPicker());

    expect(mocks.hostsEnabled).toBe(false);
    expect(result.current.hostId).toBe("host_atum");
    await expect(result.current.pickFolder()).resolves.toBe("/home/me/repo");
    expect(mocks.pickFolder).toHaveBeenCalledWith({
      hostId: "host_atum",
      clientHostId: "host_atum",
    });
  });

  it("resolves null when the person cancels", async () => {
    mocks.pickFolder.mockResolvedValue({ path: null });
    const { result } = renderHook(() => useNativeFolderPicker());

    await expect(result.current.pickFolder()).resolves.toBeNull();
  });

  it("rejects when the dialog cannot be shown", async () => {
    mocks.pickFolder.mockRejectedValue(new Error("No display"));
    const { result } = renderHook(() => useNativeFolderPicker());

    await expect(result.current.pickFolder()).rejects.toThrow("No display");
  });

  it.each([
    ["the local machine has no folder dialog", false, "host_atum"],
    ["this window has no local machine", true, null],
  ])("offers no dialog when %s", async (_case, supported, localHostId) => {
    mocks.supportsNativeFolderPicker = supported;
    mocks.localDaemonHostId = localHostId;
    const { result } = renderHook(() => useNativeFolderPicker());

    expect(result.current.hostId).toBeNull();
    await expect(result.current.pickFolder()).resolves.toBeNull();
    expect(mocks.pickFolder).not.toHaveBeenCalled();
  });

  describe("in the desktop shell", () => {
    beforeEach(installDesktopShell);

    it("opens the shell's own dialog for the local machine without a server round trip", async () => {
      mocks.supportsNativeFolderPicker = false;
      const { result } = renderHook(() => useNativeFolderPicker());

      expect(result.current.hostId).toBe("host_atum");
      await expect(result.current.pickFolder()).resolves.toBe(
        "/Users/me/desktop-repo",
      );
      expect(mocks.desktopPickFolder).toHaveBeenCalledTimes(1);
      expect(mocks.pickFolder).not.toHaveBeenCalled();
    });

    it("resolves null when the person cancels", async () => {
      mocks.desktopPickFolder.mockResolvedValue(null);
      const { result } = renderHook(() => useNativeFolderPicker());

      await expect(result.current.pickFolder()).resolves.toBeNull();
      expect(mocks.pickFolder).not.toHaveBeenCalled();
    });

    it("rejects when the shell cannot show the dialog", async () => {
      mocks.desktopPickFolder.mockRejectedValue(new Error("No window"));
      const { result } = renderHook(() => useNativeFolderPicker());

      await expect(result.current.pickFolder()).rejects.toThrow("No window");
      expect(mocks.pickFolder).not.toHaveBeenCalled();
    });

    it.each([
      ["does not list this machine", [{ id: "host_far", status: "connected" }]],
      [
        "lists this machine as disconnected",
        [{ id: "host_atum", status: "disconnected" }],
      ],
    ])("asks the daemon when the window's server %s", async (_case, hosts) => {
      mocks.hosts = hosts;
      const { result } = renderHook(() => useNativeFolderPicker());

      expect(result.current.hostId).toBe("host_atum");
      await expect(result.current.pickFolder()).resolves.toBe("/home/me/repo");
      expect(mocks.desktopPickFolder).not.toHaveBeenCalled();
      expect(mocks.pickFolder).toHaveBeenCalledWith({
        hostId: "host_atum",
        clientHostId: "host_atum",
      });
    });

    it("offers no dialog when the server is remote and this machine has no daemon dialog", async () => {
      mocks.hosts = [{ id: "host_far", status: "connected" }];
      mocks.supportsNativeFolderPicker = false;
      const { result } = renderHook(() => useNativeFolderPicker());

      expect(result.current.hostId).toBeNull();
      await expect(result.current.pickFolder()).resolves.toBeNull();
      expect(mocks.desktopPickFolder).not.toHaveBeenCalled();
      expect(mocks.pickFolder).not.toHaveBeenCalled();
    });

    it("asks the daemon when the shell predates the folder dialog", async () => {
      Object.defineProperty(window, "bbDesktop", {
        configurable: true,
        value: {},
      });
      const { result } = renderHook(() => useNativeFolderPicker());

      await expect(result.current.pickFolder()).resolves.toBe("/home/me/repo");
      expect(mocks.pickFolder).toHaveBeenCalledTimes(1);
    });
  });
});
