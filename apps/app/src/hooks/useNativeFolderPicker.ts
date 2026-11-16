import { useCallback, useMemo } from "react";
import { normalizeProjectPathInput } from "@bb/domain";
import type { ExperimentalNativeFolderPicker } from "@get-bb/plugin-sdk";
import { useHosts } from "@/hooks/queries/host-queries";
import { useHostDaemon } from "@/hooks/useHostDaemon";
import { getBbDesktopInfo } from "@/lib/bb-desktop";
import { sdk } from "@/lib/sdk";

type NativeFolderPickerRoute = "desktop" | "daemon";

export function useNativeFolderPicker(): ExperimentalNativeFolderPicker {
  const { localDaemonHostId, supportsNativeFolderPicker } = useHostDaemon();
  const desktopApi = getBbDesktopInfo();
  const hasDesktopFolderDialog = desktopApi?.pickFolder !== undefined;
  const { data: hosts } = useHosts({ enabled: hasDesktopFolderDialog });
  const isLocalMachineConnectedToThisServer =
    localDaemonHostId !== null &&
    (hosts ?? []).some(
      (host) => host.id === localDaemonHostId && host.status === "connected",
    );

  let route: NativeFolderPickerRoute | null = null;
  if (hasDesktopFolderDialog && isLocalMachineConnectedToThisServer) {
    route = "desktop";
  } else if (supportsNativeFolderPicker && localDaemonHostId !== null) {
    route = "daemon";
  }
  const hostId = route === null ? null : localDaemonHostId;

  const pickFolder = useCallback(async () => {
    if (hostId === null || route === null) return null;
    const path =
      route === "desktop"
        ? ((await desktopApi?.pickFolder?.()) ?? null)
        : (await sdk.hosts.pickFolder({ hostId, clientHostId: hostId })).path;
    return path ? normalizeProjectPathInput(path) : null;
  }, [desktopApi, hostId, route]);

  return useMemo(() => ({ hostId, pickFolder }), [hostId, pickFolder]);
}
