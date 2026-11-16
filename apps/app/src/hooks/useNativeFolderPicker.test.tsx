// @vitest-environment jsdom

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNativeFolderPicker } from "./useNativeFolderPicker";

const mocks = vi.hoisted(() => ({
  localDaemonHostId: "host_atum" as string | null,
  pickFolder: vi.fn(),
  supportsNativeFolderPicker: true,
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

beforeEach(() => {
  mocks.localDaemonHostId = "host_atum";
  mocks.supportsNativeFolderPicker = true;
  mocks.pickFolder.mockResolvedValue({ path: "/home/me/repo/" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useNativeFolderPicker", () => {
  it("opens the dialog on the local machine and normalizes the chosen path", async () => {
    const { result } = renderHook(() => useNativeFolderPicker());

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
});
