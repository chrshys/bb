import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerDesktopFolderDialogIpc } from "../src/desktop-folder-dialog.js";
import { BB_DESKTOP_PICK_FOLDER_CHANNEL } from "../src/desktop-window-command-ipc.js";

const mock = vi.hoisted(() => {
  type PickEvent = {
    sender: { id: number; mainFrame: object };
    senderFrame: object;
  };
  type Handler = (event: PickEvent) => Promise<{ path: string | null }>;
  const handlers = new Map<string, Handler>();
  return {
    handlers,
    fromWebContents: vi.fn(),
    handle: vi.fn((channel: string, handler: Handler) => {
      handlers.set(channel, handler);
    }),
    showOpenDialog: vi.fn(),
  };
});

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: mock.fromWebContents },
  dialog: { showOpenDialog: mock.showOpenDialog },
  ipcMain: { handle: mock.handle },
}));

const mainFrame = {};
const browserWindow = { id: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  mock.fromWebContents.mockReturnValue(browserWindow);
  mock.showOpenDialog.mockResolvedValue({
    canceled: false,
    filePaths: ["/Users/me/repo"],
  });
  registerDesktopFolderDialogIpc(new Set([42]));
});

async function request(
  id: number,
  senderFrame: object = mainFrame,
): Promise<{ path: string | null }> {
  const handler = mock.handlers.get(BB_DESKTOP_PICK_FOLDER_CHANNEL);
  if (handler === undefined) throw new Error("folder dialog handler missing");
  return handler({ sender: { id, mainFrame }, senderFrame });
}

describe("desktop folder dialog", () => {
  it("opens a directory dialog as a sheet on the requesting window", async () => {
    await expect(request(42)).resolves.toEqual({ path: "/Users/me/repo" });
    expect(mock.showOpenDialog).toHaveBeenCalledWith(browserWindow, {
      properties: ["openDirectory", "createDirectory"],
    });
  });

  it("returns no path when the person cancels", async () => {
    mock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    await expect(request(42)).resolves.toEqual({ path: null });
  });

  it("rejects when the dialog cannot be shown", async () => {
    mock.showOpenDialog.mockRejectedValue(new Error("No display"));
    await expect(request(42)).rejects.toThrow("No display");
    mock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ["/Users/me/next"],
    });
    await expect(request(42)).resolves.toEqual({ path: "/Users/me/next" });
  });

  it("shares one open dialog between overlapping requests from a window", async () => {
    let finish: (result: {
      canceled: boolean;
      filePaths: string[];
    }) => void = () => undefined;
    mock.showOpenDialog.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = request(42);
    const second = request(42);
    finish({ canceled: false, filePaths: ["/Users/me/repo"] });

    await expect(first).resolves.toEqual({ path: "/Users/me/repo" });
    await expect(second).resolves.toEqual({ path: "/Users/me/repo" });
    expect(mock.showOpenDialog).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["other web contents", 99, mainFrame],
    ["a subframe of a bb window", 42, {}],
  ])("refuses %s", async (_case, id, senderFrame) => {
    await expect((async () => request(id, senderFrame))()).rejects.toThrow(
      "Folder dialogs are limited to bb windows",
    );
    expect(mock.showOpenDialog).not.toHaveBeenCalled();
  });
});
