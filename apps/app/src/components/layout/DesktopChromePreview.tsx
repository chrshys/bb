import { getSimulatedDesktopInfo } from "@/lib/bb-desktop";

export function DesktopChromePreview() {
  if (!import.meta.env.DEV) return null;
  const info = getSimulatedDesktopInfo();
  if (!info) return null;
  return (
    <div
      data-desktop-chrome-preview=""
      className="pointer-events-none fixed inset-0 z-[100]"
    >
      <style>{`
        body:has([data-desktop-chrome-preview]) [class~="[app-region:drag]"] {
          outline: 1px dashed var(--muted-foreground);
          outline-offset: -2px;
        }
      `}</style>
      {!info.isFullScreen && (
        <div
          aria-label="Simulated macOS window controls"
          className="absolute left-[18px] top-[18px] flex gap-1"
        >
          <span className="size-4 rounded-full bg-destructive" />
          <span className="size-4 rounded-full bg-warning" />
          <span className="size-4 rounded-full bg-success" />
        </div>
      )}
      <div className="absolute bottom-2 right-2 rounded bg-popover px-2 py-1 text-xs text-muted-foreground shadow-sm">
        macOS preview · dashed areas drag the window
      </div>
    </div>
  );
}
