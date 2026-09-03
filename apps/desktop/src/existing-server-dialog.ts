import { BrowserWindow, ipcMain } from "electron";
import { escapeHtmlText } from "@bb/domain";
import {
  BB_DESKTOP_EXISTING_SERVER_DIALOG_CHOOSE_CHANNEL,
  existingServerDialogChooseRequestSchema,
} from "./existing-server-dialog-ipc.js";
import type { ForeignRuntimeDetails } from "./foreign-runtime.js";
import type {
  ServerReleaseChannel,
  ServerVersionIdentity,
} from "./server-probe.js";

type ExistingServerDialogChoice = "connect" | "quit" | "replace";

interface OpenExistingServerDialogArgs {
  details: ForeignRuntimeDetails | null;
  launchingApplicationName: string;
  launchingChannel: ServerReleaseChannel;
  parentWindow: BrowserWindow | null;
  preloadPath: string;
  runningServer: ServerVersionIdentity | null;
  serverUrl: string;
}

interface DetailRow {
  label: string;
  value: string;
}

export function formatStartedAt(startedAt: string, now: Date): string {
  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) {
    return startedAt;
  }

  const elapsedMinutes = Math.floor(
    (now.getTime() - started.getTime()) / 60_000,
  );
  if (elapsedMinutes < 1) {
    return "just now";
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min ago`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours} h ago`;
  }
  return `${Math.floor(elapsedHours / 24)} d ago`;
}

export function formatSurface(surface: string): string {
  return surface === "desktop" ? "the bb desktop app" : "a terminal";
}

function buildDetailRows(args: {
  details: ForeignRuntimeDetails | null;
  now: Date;
  runningServer: ServerVersionIdentity | null;
  serverUrl: string;
}): DetailRow[] {
  const rows: DetailRow[] = [];
  if (args.runningServer !== null) {
    rows.push(
      { label: "Product", value: args.runningServer.applicationName },
      { label: "Channel", value: args.runningServer.channel },
      { label: "Version", value: args.runningServer.version },
    );
  }
  rows.push({ label: "Address", value: args.serverUrl });
  if (args.details === null) {
    return rows;
  }
  rows.push({ label: "Data", value: args.details.dataDir });
  if (args.runningServer === null) {
    rows.push({ label: "Version", value: args.details.version });
  }
  rows.push({
    label: "Started",
    value: `${formatStartedAt(args.details.startedAt, args.now)} by ${formatSurface(
      args.details.surface,
    )} (pid ${String(args.details.pid)})`,
  });
  return rows;
}

interface RenderExistingServerDialogHtmlArgs {
  details: ForeignRuntimeDetails | null;
  launchingApplicationName: string;
  launchingChannel: ServerReleaseChannel;
  now: Date;
  runningServer: ServerVersionIdentity | null;
  serverUrl: string;
}

export function renderExistingServerDialogHtml(
  args: RenderExistingServerDialogHtmlArgs,
): string {
  const rows = buildDetailRows({
    details: args.details,
    now: args.now,
    runningServer: args.runningServer,
    serverUrl: args.serverUrl,
  });
  const detailHtml = rows
    .map(
      (row) =>
        `<div class="row"><span>${escapeHtmlText(row.label)}</span><code>${escapeHtmlText(
          row.value,
        )}</code></div>`,
    )
    .join("\n      ");
  const canReplace = args.details !== null;
  const channelMismatch =
    args.runningServer !== null &&
    args.runningServer.channel !== args.launchingChannel;
  const replaceButtonHtml = canReplace
    ? `<button type="button" data-choice="replace">Quit other bb</button>`
    : "";
  const replaceWarningHtml = canReplace
    ? `<p class="warning">If you stop the running copy, its agent threads stop too.</p>`
    : "";
  const introText = canReplace
    ? "This app can use the copy that is already running, or you can stop it and start a new one."
    : "This app can use the copy that is already running. bb cannot identify that copy, so it cannot stop it for you.";
  const mismatchWarningHtml = channelMismatch && args.runningServer !== null
    ? `<p class="warning warning--mismatch"><strong>Different channels.</strong> ${escapeHtmlText(
        args.launchingApplicationName,
      )} is trying to connect to ${escapeHtmlText(
        args.runningServer.applicationName,
      )}. Quit ${escapeHtmlText(args.launchingApplicationName)} unless this is intentional.</p>`
    : "";
  const dialogTitle = `${args.runningServer?.applicationName ?? "bb"} is already running`;
  const quitDefault = channelMismatch ? ' data-default="true"' : "";
  const connectDefault = channelMismatch ? "" : ' data-default="true"';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <title>${escapeHtmlText(dialogTitle)}</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    body {
      background: Canvas;
      color: CanvasText;
      margin: 0;
      padding: 20px;
    }

    h1 {
      font-size: 14px;
      font-weight: 600;
      margin: 0 0 4px;
    }

    p {
      color: color-mix(in srgb, CanvasText 70%, transparent);
      font-size: 12px;
      line-height: 1.45;
      margin: 0 0 12px;
    }

    .details {
      border: 1px solid color-mix(in srgb, CanvasText 14%, transparent);
      border-radius: 6px;
      padding: 8px 10px;
    }

    .row {
      display: flex;
      font-size: 12px;
      gap: 10px;
      line-height: 1.6;
    }

    .row span {
      color: color-mix(in srgb, CanvasText 55%, transparent);
      flex: 0 0 62px;
    }

    .row code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      overflow-wrap: anywhere;
    }

    .warning {
      margin: 12px 0 0;
    }

    .warning--mismatch {
      background: color-mix(in srgb, AccentColor 10%, Canvas);
      border: 1px solid color-mix(in srgb, AccentColor 32%, transparent);
      border-radius: 6px;
      padding: 8px 10px;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 14px;
    }

    button {
      background: color-mix(in srgb, CanvasText 8%, Canvas);
      border: 1px solid color-mix(in srgb, CanvasText 22%, transparent);
      border-radius: 6px;
      color: CanvasText;
      font-size: 13px;
      padding: 5px 14px;
    }

    button[data-default="true"] {
      background: AccentColor;
      border-color: AccentColor;
      color: AccentColorText;
    }
  </style>
</head>
<body>
  <h1>${escapeHtmlText(dialogTitle)} on this Mac</h1>
  <p>${introText}</p>
  <div class="details">
      ${detailHtml}
  </div>
  ${mismatchWarningHtml}
  ${replaceWarningHtml}
  <div class="actions">
    <button type="button" data-choice="quit"${quitDefault}>Quit ${escapeHtmlText(args.launchingApplicationName)}</button>
    ${replaceButtonHtml}
    <button type="button" data-choice="connect"${connectDefault}>Connect</button>
  </div>
</body>
</html>`;
}

export function openExistingServerDialog(
  args: OpenExistingServerDialogArgs,
): Promise<ExistingServerDialogChoice> {
  const dialogWindow = new BrowserWindow({
    fullscreenable: false,
    height: args.details === null ? 260 : 340,
    maximizable: false,
    minimizable: false,
    modal: args.parentWindow !== null,
    parent: args.parentWindow ?? undefined,
    resizable: false,
    show: false,
    title: "bb is already running",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: args.preloadPath,
      sandbox: true,
    },
    width: 460,
  });

  return new Promise<ExistingServerDialogChoice>((resolvePromise) => {
    let settled = false;

    function finish(choice: ExistingServerDialogChoice): void {
      if (settled) {
        return;
      }
      settled = true;
      ipcMain.removeListener(
        BB_DESKTOP_EXISTING_SERVER_DIALOG_CHOOSE_CHANNEL,
        handleChoose,
      );
      if (!dialogWindow.isDestroyed()) {
        dialogWindow.close();
      }
      resolvePromise(choice);
    }

    function handleChoose(
      event: { sender: { id: number } },
      payload: unknown,
    ): void {
      if (event.sender.id !== dialogWindow.webContents.id) {
        return;
      }
      const parsed = existingServerDialogChooseRequestSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      finish(parsed.data.choice);
    }

    ipcMain.on(BB_DESKTOP_EXISTING_SERVER_DIALOG_CHOOSE_CHANNEL, handleChoose);
    dialogWindow.on("closed", () => {
      finish("quit");
    });

    dialogWindow.once("ready-to-show", () => {
      dialogWindow.show();
    });
    void dialogWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        renderExistingServerDialogHtml({
          details: args.details,
          launchingApplicationName: args.launchingApplicationName,
          launchingChannel: args.launchingChannel,
          now: new Date(),
          runningServer: args.runningServer,
          serverUrl: args.serverUrl,
        }),
      )}`,
    );
  });
}
