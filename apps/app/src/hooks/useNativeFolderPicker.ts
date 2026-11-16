import { useCallback, useMemo } from "react";
import { normalizeProjectPathInput } from "@bb/domain";
import type { ExperimentalNativeFolderPicker } from "@get-bb/plugin-sdk";
import { useHostDaemon } from "@/hooks/useHostDaemon";
import { sdk } from "@/lib/sdk";

export function useNativeFolderPicker(): ExperimentalNativeFolderPicker {
  const { localDaemonHostId, supportsNativeFolderPicker } = useHostDaemon();
  const hostId = supportsNativeFolderPicker ? localDaemonHostId : null;

  const pickFolder = useCallback(async () => {
    if (hostId === null) return null;
    const { path } = await sdk.hosts.pickFolder({
      hostId,
      clientHostId: hostId,
    });
    return path ? normalizeProjectPathInput(path) : null;
  }, [hostId]);

  return useMemo(() => ({ hostId, pickFolder }), [hostId, pickFolder]);
}
