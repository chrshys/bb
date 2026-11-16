import type { BbDesktopPickedFolder } from "@bb/desktop-contract";
import { BrowserWindow, dialog, ipcMain } from "electron";
import { BB_DESKTOP_PICK_FOLDER_CHANNEL } from "./desktop-window-command-ipc.js";

export function registerDesktopFolderDialogIpc(
  applicationWindowWebContentsIds: ReadonlySet<number>,
): void {
  const openDialogs = new Map<number, Promise<BbDesktopPickedFolder>>();

  ipcMain.handle(BB_DESKTOP_PICK_FOLDER_CHANNEL, (event) => {
    const webContentsId = event.sender.id;
    if (
      !applicationWindowWebContentsIds.has(webContentsId) ||
      event.senderFrame !== event.sender.mainFrame
    ) {
      throw new Error("Folder dialogs are limited to bb windows");
    }
    const openDialog = openDialogs.get(webContentsId);
    if (openDialog !== undefined) {
      return openDialog;
    }
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    if (browserWindow === null) {
      throw new Error("Folder dialogs need a bb window to attach to");
    }
    const picked = dialog
      .showOpenDialog(browserWindow, {
        properties: ["openDirectory", "createDirectory"],
      })
      .then(
        (result): BbDesktopPickedFolder => ({
          path: result.canceled ? null : (result.filePaths[0] ?? null),
        }),
      )
      .finally(() => {
        openDialogs.delete(webContentsId);
      });
    openDialogs.set(webContentsId, picked);
    return picked;
  });
}
