import { useCallback } from "react";
import type { HostPlatform } from "@bb/host-daemon-contract";
import { useDialogState } from "@bb/shared-ui/use-dialog-state";
import { useHostDaemon } from "@/hooks/useHostDaemon";
import { useNativeFolderPicker } from "@/hooks/useNativeFolderPicker";
import {
  selectHosts,
  useHosts,
  usePrimaryHost,
} from "@/hooks/queries/host-queries";
import type {
  ProjectPathDialogSubmitHandler,
  ProjectPathDialogTarget,
} from "@/components/dialogs/ProjectPathDialog";

export interface LocalPathSubmitParams {
  path: string;
  hostId: string;
  target: ProjectPathDialogTarget;
  closeDialog: () => void;
}

interface UseLocalPathPickerOptions {
  isPending: boolean;
  submit: (params: LocalPathSubmitParams) => void;
}

interface LocalPathPickerController {
  isAvailable: boolean;
  hostId: string | null;
  hostName: string | null;
  openPathEntry: (target: ProjectPathDialogTarget) => void;
  openPicker: (target: ProjectPathDialogTarget) => void;
  platform: HostPlatform | null;
  projectPathDialog: ReturnType<typeof useDialogState<ProjectPathDialogTarget>>;
  submitProjectPath: ProjectPathDialogSubmitHandler;
}

interface PathPickerHost {
  canUseNativeFolderPicker: boolean;
  hostId: string | null;
  hostName: string | null;
}

export function usePathPickerHost(): PathPickerHost {
  const { localDaemonHostId } = useHostDaemon();
  const nativeFolderPicker = useNativeFolderPicker();
  const primaryHost = usePrimaryHost();

  const connectedPrimaryHostId =
    primaryHost?.status === "connected" ? primaryHost.id : null;
  const hostId = connectedPrimaryHostId ?? localDaemonHostId;
  const hostName =
    primaryHost && primaryHost.id === hostId ? primaryHost.name : null;
  const canUseNativeFolderPicker =
    nativeFolderPicker.hostId !== null && hostId === nativeFolderPicker.hostId;

  return {
    canUseNativeFolderPicker,
    hostId,
    hostName,
  };
}

export function useLocalPathPicker({
  isPending,
  submit,
}: UseLocalPathPickerOptions): LocalPathPickerController {
  const { platform } = useHostDaemon();
  const { canUseNativeFolderPicker, hostId, hostName } = usePathPickerHost();
  const { pickFolder } = useNativeFolderPicker();
  const hostsQuery = useHosts();
  const isLoadingHosts = hostsQuery.isPending;
  const connectedHostCount = selectHosts(hostsQuery.data, "all").filter(
    (host) => host.status === "connected",
  ).length;
  const projectPathDialog = useDialogState<ProjectPathDialogTarget>();
  const closeDialog = projectPathDialog.onClose;

  const submitPath = useCallback(
    (
      path: string,
      target: ProjectPathDialogTarget,
      targetHostId: string | null,
    ) => {
      if (isPending || !targetHostId) return;
      submit({ path, hostId: targetHostId, target, closeDialog });
    },
    [closeDialog, isPending, submit],
  );

  const openPicker = useCallback(
    (target: ProjectPathDialogTarget) => {
      if (isPending || !hostId) return;

      if (canUseNativeFolderPicker) {
        void (async () => {
          let selectedPath: string | null;
          try {
            selectedPath = await pickFolder();
          } catch {
            projectPathDialog.onOpen(target);
            return;
          }
          if (!selectedPath) return;
          submitPath(selectedPath, target, hostId);
        })();
        return;
      }

      projectPathDialog.onOpen(target);
    },
    [
      canUseNativeFolderPicker,
      hostId,
      isPending,
      pickFolder,
      projectPathDialog,
      submitPath,
    ],
  );

  const submitProjectPath = useCallback<ProjectPathDialogSubmitHandler>(
    (target, path, selectedHostId) => {
      submitPath(path, target, selectedHostId);
    },
    [submitPath],
  );

  const openPathEntry = useCallback(
    (target: ProjectPathDialogTarget) => {
      if (isLoadingHosts || connectedHostCount > 1) {
        projectPathDialog.onOpen(target);
        return;
      }
      openPicker(target);
    },
    [connectedHostCount, isLoadingHosts, openPicker, projectPathDialog],
  );

  return {
    isAvailable: hostId != null,
    hostId,
    hostName,
    openPathEntry,
    openPicker,
    platform,
    projectPathDialog,
    submitProjectPath,
  };
}
