import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

const COLLAPSED_KEY = "bots:chats-collapsed";

function storedCollapsed() {
  try { return localStorage.getItem(COLLAPSED_KEY) === "true"; } catch { return false; }
}

export function ChatsSection({ children, activeChatId, onNewChat }: { children: ReactNode; activeChatId: string | null; onNewChat: () => void }) {
  const [collapsed, setCollapsed] = useState(storedCollapsed);
  const previousActive = useRef(activeChatId);
  const contentId = useId();

  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, String(collapsed)); } catch {}
  }, [collapsed]);
  useEffect(() => {
    if (activeChatId && activeChatId !== previousActive.current) setCollapsed(false);
    previousActive.current = activeChatId;
  }, [activeChatId]);

  return <section aria-label="Chats" className="unassigned-chats mt-6 pt-1">
    <div className="sidebar-section-heading flex items-center justify-between">
      <h2 className="sidebar-section-title font-medium text-muted-foreground"><button type="button" aria-label="Chats" title={collapsed ? "Expand Chats" : "Collapse Chats"} aria-expanded={!collapsed} aria-controls={contentId} className="flex items-center gap-1 rounded text-left hover:text-foreground" onClick={() => setCollapsed((current) => !current)}>
        Chats<svg aria-hidden="true" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={collapsed ? "" : "rotate-90"}><path d="m7 5 5 5-5 5" /></svg>
      </button></h2>
      <button type="button" aria-label="New unassigned chat" title="New unassigned chat" className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-state-hover" onClick={() => { setCollapsed(false); onNewChat(); }}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M10 4v12M4 10h12" /></svg>
      </button>
    </div>
    <div id={contentId} hidden={collapsed}>{collapsed ? null : children}</div>
  </section>;
}
