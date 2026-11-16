import { useBotMessageAppearance } from "./components/bot-message-appearance";
import { BotWorkFooter } from "./components/bot-work-footer";
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import type { DragEvent, PointerEvent as ReactPointerEvent, ReactElement } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useConversationDrop } from "./hooks/use-conversation-drop";
import { useConversationReorder } from "./hooks/use-conversation-reorder";
import {
  definePluginApp,
  experimental_THREAD_ACTION_GROUPS,
  experimental_ThreadActionsContextMenu as NativeThreadContextMenu,
  experimental_ThreadActionsMenu as NativeThreadMenu,
  experimental_useThreadActions,
  experimental_Icon as NativeIcon,
  experimental_useSidebarThreadActions,
  experimental_useSidebarThreadSplit,
  experimental_useSidebarThreads,
  experimental_useAppPanel,
  useBbNavigate,
} from "@get-bb/plugin-sdk/app";
import type {
  PluginSidebarThread,
  PluginSidebarThreadActions,
  PluginThreadListProps,
  PluginThreadActionTarget,
  PluginThreadActionsInlineItem,
} from "@get-bb/plugin-sdk/app";
import type { BotMetadata, BotSection } from "./contract";
import { useBotData, type ProjectOption } from "./hooks/use-bot-data";
import { botPageTabs, botsPinnedTab, shownBotPage, type BotPanelSection } from "./lib/bot-panel-tab";
import { BotsPinnedTab, ConversationBotTab, CoordinatorBotTab } from "./components/bot-panel-surfaces";
import { orderedBotConversationTree, conversationOwners, conversationTree } from "./lib/conversations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RenameConversationDialog } from "@/components/rename-conversation-dialog";
import { ConversationArchiveButton } from "./components/conversation-archive-button";
import { ChatsSection } from "./components/chats-section";
import { ConversationStatusIcon } from "@/components/conversation-status-icon";
import { BotActivityBadge } from "@/components/bot-activity-badge";
import { BotNewConversationButton } from "@/components/bot-new-conversation-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CoordinatorPanel } from "./components/coordinator-panel";
import { ConversationPanel, conversationPanelPath } from "./components/conversation-panel";
import type { ConversationTarget } from "./components/conversation-panel";
import { AssignConversationDialog } from "@/components/assign-conversation-dialog";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ProjectCreateDialog } from "./components/project-create-dialog";
import type { ProjectCreationActions } from "./components/project-create-form";
import { usePortalScopeProps } from "./lib/portal-scope";
import { conversationLaunchProjectId, defaultConversationProjectId, projectLaunchEnvironment, worktreeLaunchEnvironment, worktreeLaunchHostId } from "./lib/worktree-launch";
import { BotCreateDialog } from "./components/bot-create-dialog";
import { SidebarBotIcon } from "./components/sidebar-bot-icon";
import "./style.css";

const MENU_ITEM_CLASS = "bot-menu-item cursor-default select-none rounded-sm px-2 py-1.5 text-xs outline-none data-[disabled]:opacity-40";

function isPersonalOrLegacyHome(projectId: string, bot: BotMetadata, personalProjectId: string | null): boolean {
  return projectId === personalProjectId || projectId === bot.legacyHomeProjectId;
}

function availableWorkProjects(projects: ProjectOption[], bot: BotMetadata, personalProjectId: string | null): ProjectOption[] {
  const linked = new Set(bot.linkedProjectIds);
  const work = projects.filter((project) => !isPersonalOrLegacyHome(project.id, bot, personalProjectId));
  return [...work.filter((project) => linked.has(project.id)), ...work.filter((project) => !linked.has(project.id))];
}

function TinyIcon({ name }: { name: "chevron" | "plus" | "edit" | "folder" | "hide" | "show" | "up" | "down" | "main" }) {
  return (
    <svg className="tiny-icon" aria-hidden="true" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {name === "chevron" ? <path d="m7 5 5 5-5 5" /> : null}
      {name === "plus" ? <path d="M10 4v12M4 10h12" /> : null}
      {name === "edit" ? <><path d="m4 14 1 2 2-1 8-8-3-3-8 8Z" /><path d="m10.5 5.5 3 3" /></> : null}
      {name === "folder" ? <path d="M2.5 6.5h6l1.5 2h7.5v7h-15v-9Zm0 0v-2h5l1.5 2" /> : null}
      {name === "hide" ? <><path d="M3 3l14 14" /><path d="M8.2 6.2A7.8 7.8 0 0 1 10 6c4.5 0 7 4 7 4a12 12 0 0 1-2.1 2.5M11.7 13.8A7.8 7.8 0 0 1 10 14c-4.5 0-7-4-7-4a12 12 0 0 1 2.1-2.5" /></> : null}
      {name === "show" ? <><path d="M3 10s2.5-4 7-4 7 4 7 4-2.5 4-7 4-7-4-7-4Z" /><circle cx="10" cy="10" r="2" /></> : null}
      {name === "up" ? <path d="m5 12 5-5 5 5" /> : null}
      {name === "down" ? <path d="m5 8 5 5 5-5" /> : null}
      {name === "main" ? <path d="M10 3.5 12 7l4 .7-2.8 2.9.5 4.1L10 13l-3.7 1.7.5-4.1L4 7.7 8 7l2-3.5Z" /> : null}
    </svg>
  );
}

type MenuItem = { label: string; action: () => void; disabled?: boolean };
function RowContextMenu({ children, items }: { children: ReactElement; items: MenuItem[] }) {
  const portalScope = usePortalScopeProps();
  return <ContextMenu.Root>
    <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
    <ContextMenu.Portal>
      <ContextMenu.Content {...portalScope} className="z-50 min-w-52 max-w-[calc(100vw-12px)] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
        {items.map((item) => <ContextMenu.Item key={item.label} disabled={item.disabled} className={MENU_ITEM_CLASS} onSelect={item.action}>{item.label}</ContextMenu.Item>)}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  </ContextMenu.Root>;
}

const ThreadMenuContext = createContext<{ thread: PluginThreadActionTarget; inline: PluginThreadActionsInlineItem[] } | null>(null);

function ConversationContextMenu({ children, thread, items = [], dragging = false }: {
  children: ReactElement;
  thread: PluginSidebarThread;
  actions: PluginSidebarThreadActions;
  onNavigate: () => void;
  items?: MenuItem[];
  dragging?: boolean;
}) {
  const value = {
    thread: { ...thread, environment: thread.environment?.id ? { id: thread.environment.id, path: thread.environment.path } : null },
    inline: items.map((item, index) => ({
      key: `bots-sidebar:context-${index}`,
      group: experimental_THREAD_ACTION_GROUPS.organize,
      action: { label: item.label, icon: "MessageSquare" as const, disabled: item.disabled, run: item.action },
    })),
  };
  return <ThreadMenuContext.Provider value={value}>
    <NativeThreadContextMenu {...value} dragging={dragging}>{children}</NativeThreadContextMenu>
  </ThreadMenuContext.Provider>;
}

function ThreadArchiveButton({ thread }: { thread: PluginSidebarThread }) {
  const target = { ...thread, environment: thread.environment?.id ? { id: thread.environment.id, path: thread.environment.path } : null };
  const [archive] = experimental_useThreadActions(target, { keys: ["bb--core/archive"] });
  return archive ? <ConversationArchiveButton thread={thread} action={archive.action} /> : null;
}

function ThreadMenuButton() {
  const menu = useContext(ThreadMenuContext);
  const [open, setOpen] = useState(false);
  if (!menu) return null;
  return <NativeThreadMenu {...menu} onOpenChange={setOpen} align="end" trigger={(props) =>
    <button {...props} type="button" className={`${props.className ?? ""} thread-menu-button`} data-open={open} aria-label="Thread actions" title="Thread actions">
      <NativeIcon name="MoreHorizontal" style={{ width: 17, height: 17 }} />
    </button>
  } />;
}

function ThreadPin({ thread }: { thread: PluginSidebarThread }) {
  return thread.isPinned ? <span className="thread-pin" title="Pinned" role="img" aria-label="Pinned"><NativeIcon name="Pin" style={{ width: 13, height: 13 }} /></span> : null;
}

function useConversationBranch(threadId: string, activeThreadId: string | null, activePath: Set<string>) {
  const containsActive = threadId !== activeThreadId && activePath.has(threadId);
  const [expanded, setExpanded] = useState(containsActive);
  const childrenId = useId();
  const rowRef = useRef<HTMLAnchorElement>(null);
  // Other branches start closed. Reveal the active path on navigation, without
  // forcing it back open when the user deliberately collapses it afterwards.
  useEffect(() => { if (containsActive) setExpanded(true); }, [activeThreadId, containsActive]);
  useEffect(() => {
    if (threadId === activeThreadId) rowRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [threadId, activeThreadId]);
  return { expanded, toggle: () => setExpanded((current) => !current), childrenId, rowRef, containsActive };
}

function BranchToggle({ title, count, expanded, childrenId, onToggle }: { title: string; count: number; expanded: boolean; childrenId: string; onToggle: () => void }) {
  return count ? <button type="button" className="conversation-disclosure" aria-label={`${expanded ? "Collapse" : "Expand"} children of ${title}`} aria-expanded={expanded} aria-controls={childrenId} title={`${count} child conversations`} onClick={onToggle}>
    <span className="text-[9px] tabular-nums" aria-hidden="true">{count}</span>
    <span className={expanded ? "rotate-90" : ""}><TinyIcon name="chevron" /></span>
  </button> : null;
}

type ReorderConversation = (threadId: string, targetThreadId: string, position: "before" | "after") => void;

function ThreadRow({ thread, siblings, childrenByParent, activePath, actions, activeThreadId, onNavigate, onReorder, onNewInWorktree, onFork, onNest, reorderDrag }: {
  thread: PluginSidebarThread; siblings: PluginSidebarThread[]; childrenByParent: Map<string, PluginSidebarThread[]>; activePath: Set<string>; actions: PluginSidebarThreadActions; activeThreadId: string | null; onNavigate: () => void; onReorder: ReorderConversation; onNewInWorktree: (thread: PluginSidebarThread) => void; onFork: (thread: PluginSidebarThread) => void; onNest: (threadId: string, parentThreadId: string) => void; reorderDrag: ReturnType<typeof useConversationReorder>;
}) {
  const split = experimental_useSidebarThreadSplit(thread.id);
  const children = childrenByParent.get(thread.id) ?? [];
  const branch = useConversationBranch(thread.id, activeThreadId, activePath);
  const title = thread.title ?? thread.titleFallback ?? "Untitled conversation";
  const [dropPosition, setDropPosition] = useState<"before" | "after" | "inside" | null>(null);
  const position = (event: DragEvent) => {
    const bounds = event.currentTarget.querySelector(".thread-row")!.getBoundingClientRect();
    return event.clientY > bounds.top + bounds.height / 2 ? "after" : "before";
  };
  useEffect(() => {
    const clear = () => setDropPosition(null);
    window.addEventListener("dragend", clear); window.addEventListener("drop", clear); window.addEventListener("blur", clear);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") clear(); };
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("dragend", clear); window.removeEventListener("drop", clear); window.removeEventListener("blur", clear); window.removeEventListener("keydown", escape); };
  }, []);
  return <li data-thread-drop-target={thread.id} data-drop-position={reorderDrag.target?.id === thread.id ? reorderDrag.target.position : dropPosition} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropPosition(null); }} onDragOver={(event) => {
    if (!event.dataTransfer.types.includes("application/x-bb-thread-id")) return;
    event.preventDefault(); event.stopPropagation(); setDropPosition(event.shiftKey ? "inside" : position(event));
  }} onDrop={(event) => {
    if (!event.dataTransfer.types.includes("application/x-bb-thread-id")) return;
    event.preventDefault(); event.stopPropagation(); setDropPosition(null);
    const source = event.dataTransfer.getData("application/x-bb-thread-id");
    if (source && source !== thread.id) {
      if (event.shiftKey) onNest(source, thread.id);
      else onReorder(source, thread.id, position(event));
    }
  }}><ConversationContextMenu thread={thread} actions={actions} onNavigate={onNavigate} dragging={Boolean(reorderDrag.drag)} items={[
    { label: "New conversation in worktree…", action: () => onNewInWorktree(thread) },
    { label: "Fork in same environment…", action: () => onFork(thread) },
    { label: "Move to top", action: () => onReorder(thread.id, siblings[0]!.id, "before"), disabled: siblings[0]?.id === thread.id },
  ]}>
    <div draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-bb-thread-id", thread.id); }} className="thread-row flex min-h-7 items-center rounded-md text-xs text-muted-foreground hover:bg-state-hover hover:text-foreground" aria-current={activeThreadId === thread.id ? "page" : undefined} data-active-descendant={!branch.expanded && branch.containsActive}>
      <a {...split.splitProps} onPointerDown={(event) => { split.splitProps.onPointerDown?.(event); reorderDrag.begin(thread, event); }} ref={branch.rowRef} href={thread.href} role="link" tabIndex={0} aria-current={activeThreadId === thread.id ? "page" : undefined} onKeyDown={(event) => { if (event.key === "Enter") { actions.open(thread.id, { split: event.metaKey || event.ctrlKey }); onNavigate(); } }} data-sidebar-thread-shortcut-target="" data-sidebar-thread-id={thread.id} className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-1 pr-1" onClick={(event) => { event.preventDefault(); actions.open(thread.id, { split: event.metaKey || event.ctrlKey }); onNavigate(); }}>
        <span className="min-w-0 flex-1 truncate" title={title}>{title}</span><ThreadPin thread={thread} />
      </a>
      <ThreadMenuButton />
      <ConversationStatusIcon thread={thread} />
      <ThreadArchiveButton thread={thread} />
      <BranchToggle title={title} count={children.length} expanded={branch.expanded} childrenId={branch.childrenId} onToggle={branch.toggle} />
    </div>
  </ConversationContextMenu>{children.length ? <ul id={branch.childrenId} className="conversation-children" hidden={!branch.expanded}>{branch.expanded ? children.map((child) => <ThreadRow key={child.id} thread={child} siblings={children} childrenByParent={childrenByParent} activePath={activePath} actions={actions} activeThreadId={activeThreadId} onNavigate={onNavigate} onReorder={onReorder} onNewInWorktree={onNewInWorktree} onFork={onFork} onNest={onNest} reorderDrag={reorderDrag} />) : null}</ul> : null}</li>;
}

function BotGroup({
  metadata,
  ownedProjectNames,
  threads,
  selected,
  activeThreadId,
  actions,
  topicsVisible,
  onToggleTopics,
  onEdit,
  onVisibilityChange,
  hidden,
  onOpenBot,
  onNavigate,
  onReorder,
  onNewInWorktree,
  onFork,
  onNest,
  onNewConversation,
  onNewInProject,
  hasWorkProjects,
  onDragStart,
  onDragEnd,
  dragging,
  conversationDropTarget,
}: {
  metadata: BotMetadata;
  ownedProjectNames: string[];
  threads: PluginSidebarThread[];
  selected: boolean;
  activeThreadId: string | null;
  actions: PluginSidebarThreadActions;
  topicsVisible: boolean;
  onToggleTopics: () => void;
  onEdit: (section?: BotPanelSection) => void;
  onVisibilityChange: (hidden: boolean) => void;
  hidden: boolean;
  onOpenBot: () => void;
  onNavigate: () => void;
  onReorder: ReorderConversation;
  onNewInWorktree: (thread?: PluginSidebarThread) => void;
  onFork: (thread: PluginSidebarThread) => void;
  onNest: (threadId: string, parentThreadId: string) => void;

  onNewConversation: () => void;
  onNewInProject: () => void;
  hasWorkProjects: boolean;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
  dragging: boolean;
  conversationDropTarget: "first" | "last" | null;
}) {
  const conversations = useMemo(() => threads.filter(thread => thread.id !== metadata.coordinatorThreadId), [threads, metadata.coordinatorThreadId]);
  const { childrenByParent, activePath, roots } = useMemo(() => orderedBotConversationTree(conversations, metadata.threadOrder, activeThreadId), [conversations, metadata.threadOrder, activeThreadId]);
  const conversationsId = useId();
  const reorderDrag = useConversationReorder(conversations, onReorder, onNest, metadata.id, roots[0]?.id);
  const dropToTop = conversationDropTarget === "first" || Boolean(reorderDrag.target?.botRow);
  const dropHint = conversationDropTarget === "first" ? "Make first" : conversationDropTarget === "last" ? "Add to end" : dropToTop ? "Drop to make top conversation" : null;
  const portalScope = usePortalScopeProps();
  const renderThread = (thread: PluginSidebarThread) => <ThreadRow key={thread.id} thread={thread} siblings={roots} childrenByParent={childrenByParent} activePath={activePath} actions={actions} activeThreadId={activeThreadId} onNavigate={onNavigate} onReorder={onReorder} onNewInWorktree={onNewInWorktree} onFork={onFork} onNest={onNest} reorderDrag={reorderDrag} />;
  const botSelected = selected || threads.some((thread) => thread.id === activeThreadId);
  const latest = threads.find(thread => thread.id === metadata.coordinatorThreadId) ?? roots[0];
  const subtitle = [metadata.role, ownedProjectNames.join(", ")].filter(Boolean).join(" · ");
  const subtitleTitle = [metadata.role, ownedProjectNames.length ? `Owned projects: ${ownedProjectNames.join(", ")}` : ""].filter(Boolean).join(" · ");
  const idleVariant = [...metadata.id].reduce((total, character) => total + character.charCodeAt(0), 0) % 3;
  return (
    <section className="project-group">
      <RowContextMenu items={[
        { label: "New conversation…", action: onNewConversation },
        { label: "New conversation in project…", action: onNewInProject, disabled: !hasWorkProjects },
        { label: "New conversation in worktree…", action: () => onNewInWorktree(), disabled: !hasWorkProjects },
        { label: topicsVisible ? "Collapse conversations" : "Expand conversations", action: onToggleTopics },
        { label: "Edit bot…", action: () => onEdit() },
        { label: "Add / manage projects…", action: () => onEdit("projects") },
        { label: hidden ? "Show in sidebar" : "Hide until activity", action: () => onVisibilityChange(!hidden) },
      ]}>
      <div className="project-row relative flex cursor-grab items-center rounded-lg px-1.5 aria-current:bg-state-active data-[hidden=true]:opacity-55 data-[dragging=true]:opacity-35 active:cursor-grabbing" aria-current={botSelected && (!topicsVisible || activeThreadId === metadata.coordinatorThreadId) ? "page" : undefined} data-bot-current={botSelected} data-hidden={hidden} data-dragging={dragging} data-bot-drop-target={metadata.id} data-conversation-drop={Boolean(dropHint)} draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left" onClick={(event) => { if (event.detail < 2) onOpenBot(); }} onDoubleClick={(event) => { event.preventDefault(); onToggleTopics(); }}>
          <span data-bot-drop-first data-drop-active={conversationDropTarget === "first"} className="bot-icon-shell relative flex size-9 shrink-0 items-center justify-center">
            <SidebarBotIcon botId={metadata.id} avatar={metadata.avatar} threads={threads} idleVariant={idleVariant} selected={botSelected} />
            <BotActivityBadge threads={threads} mainThreadId={latest?.id ?? null} />
          </span>
          <span data-bot-drop-append data-drop-active={conversationDropTarget === "last"} className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate bot-name text-base font-medium text-foreground">{metadata.name}</span>
            </span>
            <span className="bot-subtitle block truncate text-sm leading-5 text-muted-foreground" title={dropHint ?? subtitleTitle}>{dropHint ?? subtitle}</span>
          </span>
        </button>
        <BotNewConversationButton name={metadata.name} onClick={onNewConversation} />
        <button type="button" className="conversation-disclosure" aria-label={`${topicsVisible ? "Collapse" : "Expand"} conversations for ${metadata.name}`} aria-expanded={topicsVisible} aria-controls={conversationsId} onClick={onToggleTopics}>
          <span className="text-[9px] tabular-nums" aria-hidden="true">{roots.length || ""}</span>
          <span className={topicsVisible ? "rotate-90" : ""}><TinyIcon name="chevron" /></span>
        </button>
      </div>
      </RowContextMenu>
      <div id={conversationsId} role="group" aria-label={`Conversations for ${metadata.name}`} className="bot-topics" hidden={!topicsVisible}>
        {topicsVisible ? <ul>{roots.map(renderThread)}</ul> : null}
      </div>
      {reorderDrag.drag ? createPortal(<div {...portalScope} ref={reorderDrag.ghostRef} className="conversation-drag-ghost rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md" aria-hidden="true"><div className="truncate">{reorderDrag.drag.title}</div><div className="text-[10px] text-muted-foreground">{reorderDrag.target ? reorderDrag.target.botRow ? "Make top conversation" : reorderDrag.target.position === "inside" ? "Nest conversation" : "Reorder conversation" : "Drag above/below a sibling · Shift to nest"}</div></div>, document.body) : null}
    </section>
  );
}

function RecentRow({
  thread,
  childrenByParent,
  activePath,
  actions,
  activeThreadId,
  onNavigate,
  onAssign,
  onConversationDrag,
  draggingThreadId,
}: {
  thread: PluginSidebarThread;
  childrenByParent: Map<string, PluginSidebarThread[]>;
  activePath: Set<string>;
  actions: PluginSidebarThreadActions;
  activeThreadId: string | null;
  onNavigate: () => void;
  onAssign: (thread: PluginSidebarThread) => void;
  onConversationDrag: (thread: PluginSidebarThread, event: ReactPointerEvent<HTMLElement>) => void;

  draggingThreadId: string | null;
}) {
  const split = experimental_useSidebarThreadSplit(thread.id);
  const children = childrenByParent.get(thread.id) ?? [];
  const branch = useConversationBranch(thread.id, activeThreadId, activePath);
  const title = thread.title ?? thread.titleFallback ?? "Untitled conversation";
  const detail = thread.environment?.branchName ?? thread.host?.name ?? "Personal conversation";
  return (
    <li>
      <ConversationContextMenu thread={thread} actions={actions} onNavigate={onNavigate} dragging={draggingThreadId !== null} items={[{ label: "Assign to bot…", action: () => onAssign(thread) }]}>
      <div className="recent-row flex min-h-6 items-center rounded-md px-1 hover:bg-state-hover" data-conversation-dragging={draggingThreadId === thread.id} aria-current={activeThreadId === thread.id ? "page" : undefined} data-active-descendant={!branch.expanded && branch.containsActive}>
      <a
        {...split.splitProps}
        onPointerDown={(event) => { split.splitProps.onPointerDown?.(event); onConversationDrag(thread, event); }}
        ref={branch.rowRef}
        href={thread.href}
        title={`${title} — ${detail}`}
        role="link"
        tabIndex={0}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); actions.open(thread.id, { split: event.metaKey || event.ctrlKey }); onNavigate(); } }}
        data-sidebar-thread-shortcut-target=""
        data-sidebar-thread-id={thread.id}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-0.5"
        aria-current={activeThreadId === thread.id ? "page" : undefined}
        onClick={(event) => {
          event.preventDefault();
          actions.open(thread.id, { split: event.metaKey || event.ctrlKey });
          onNavigate();
        }}
      >
        <span className="min-w-0 flex-1 truncate conversation-title text-foreground">{title}</span>
        <ThreadPin thread={thread} />
      </a>
      <ThreadMenuButton />
      <ConversationStatusIcon thread={thread} />
      <ThreadArchiveButton thread={thread} />
      <BranchToggle title={title} count={children.length} expanded={branch.expanded} childrenId={branch.childrenId} onToggle={branch.toggle} />
      </div>
      </ConversationContextMenu>
      {children.length ? <ul id={branch.childrenId} className="conversation-children" hidden={!branch.expanded}>{branch.expanded ? children.map((child) => <RecentRow key={child.id} thread={child} childrenByParent={childrenByParent} activePath={activePath} actions={actions} activeThreadId={activeThreadId} onNavigate={onNavigate} onAssign={onAssign} onConversationDrag={onConversationDrag} draggingThreadId={draggingThreadId} />) : null}</ul> : null}
    </li>
  );
}

function BotsSidebar({ activeThreadId, onNavigate, inventoryFooterAvailable }: PluginThreadListProps & { inventoryFooterAvailable: boolean }) {
  const sidebar = experimental_useSidebarThreads();
  const actions = experimental_useSidebarThreadActions();
  const navigate = useBbNavigate();
  const appPanel = experimental_useAppPanel();
  const portalScope = usePortalScopeProps();
  function openConversation(target: ConversationTarget) {
    navigate.toPluginPanel("conversation", { subPath: conversationPanelPath(target) });
    onNavigate();
  }
  const { rpc, bots, hosts, sections, projects, threadBindings, warnings, personalProjectId, projectOwners, loaded, error, refresh } = useBotData();
  const [actionError, setActionError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<PluginSidebarThread | null>(null);
  const [showOtherChats, setShowOtherChats] = useState(false);
  const chatsOtherId = useId();
  const [creatingBot, setCreatingBot] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [addingSection, setAddingSection] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const projectActions: ProjectCreationActions = {
    onCreateProject: async (input) => { const project = await rpc.call("project_create", input); void refresh(); return project; },
    onBrowseProjects: (input) => rpc.call("project_browse", input),
  };
  const [sectionName, setSectionName] = useState("");
  const [sectionPending, setSectionPending] = useState(false);
  const [editingSection, setEditingSection] = useState<BotSection | null>(null);
  const [shownTopicBots, setShownTopicBots] = useState<Set<string>>(() => new Set());
  const sidebarElement = useRef<HTMLDivElement>(null);
  const [droppedConversation, setDroppedConversation] = useState<{ botId: string; threadId: string } | null>(null);
  useEffect(() => {
    if (!droppedConversation || !shownTopicBots.has(droppedConversation.botId)) return;
    const botRow = Array.from(sidebarElement.current?.querySelectorAll<HTMLElement>("[data-bot-drop-target]") ?? [])
      .find(row => row.dataset.botDropTarget === droppedConversation.botId);
    const threadRow = Array.from(botRow?.closest(".project-group")?.querySelectorAll<HTMLElement>("[data-sidebar-thread-id]") ?? [])
      .find(row => row.dataset.sidebarThreadId === droppedConversation.threadId);
    if (!threadRow) return;
    threadRow.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "instant" });
    setDroppedConversation(null);
  }, [droppedConversation, shownTopicBots, threadBindings, sidebar.threads]);
  const [draggedBotId, setDraggedBotId] = useState<string | null>(null);
  const preparing = useRef(false);
  const projectCatalog = JSON.stringify(sidebar.projects.map(({ id, name, isPersonal }) => [id, name, isPersonal]));
  const lastProjectCatalog = useRef(projectCatalog);
  useEffect(() => {
    if (lastProjectCatalog.current === projectCatalog) return;
    lastProjectCatalog.current = projectCatalog;
    void refresh();
  }, [projectCatalog, refresh]);
  const wakeups = useRef(new Set<string>());
  const owners = useMemo(() => conversationOwners(sidebar.threads, threadBindings), [sidebar.threads, threadBindings]);
  const assignmentRequests = useRef(new Set<string>());
  const conversationDrop = useConversationDrop((thread, value) => {
    const { botId, placeFirst } = JSON.parse(value) as { botId: string; placeFirst: boolean };
    run(async () => {
      await assignConversation(thread, botId, placeFirst);
      toast.success(`Conversation assigned to ${bots.find(bot => bot.id === botId)?.name ?? "bot"}`, {
        action: { label: "View", onClick: () => { actions.open(thread.id); onNavigate(); } },
      });
    });
  }, (botId) => bots.some(bot => bot.id === botId), (_thread, element, _x, _y, shiftKey) => {
    const row = element.closest<HTMLElement>("[data-bot-drop-target]");
    const botId = row?.dataset.botDropTarget;
    if (!botId || !bots.some(bot => bot.id === botId)) return null;
    return JSON.stringify({ botId, placeFirst: shiftKey || Boolean(element.closest("[data-bot-drop-first]")) });
  });
  const outsideDropTarget = conversationDrop.drag?.botId
    ? JSON.parse(conversationDrop.drag.botId) as { botId: string; placeFirst: boolean } : null;
  const selectedBotId = activeThreadId ? owners.get(activeThreadId) : undefined;
  const threadsByBot = useMemo(() => {
    const result = new Map<string, PluginSidebarThread[]>();
    for (const thread of sidebar.threads) {
      const botId = owners.get(thread.id);
      if (!botId) continue;
      const group = result.get(botId) ?? []; group.push(thread); result.set(botId, group);
    }
    return result;
  }, [sidebar.threads, owners]);
  const lastActivityByBot = useMemo(() => new Map([...threadsByBot].map(([id, threads]) => [id, threads.reduce((latest, thread) => Math.max(latest, thread.updatedAt, thread.latestAttentionAt), 0)])), [threadsByBot]);
  const hiddenBots = bots.filter((bot) => bot.hiddenUntilActivity && (lastActivityByBot.get(bot.id) ?? 0) <= (bot.hiddenAt ?? Number.MAX_SAFE_INTEGER));
  const hiddenIds = new Set(hiddenBots.map((bot) => bot.id));
  // A bot needs neither a linked project nor a main conversation to be visible.
  const shownBots = bots.filter((bot) => showHidden || !hiddenIds.has(bot.id));
  const sectionGroups = [{ id: null as string | null, name: "Main" }, ...sections.map((section) => ({ id: section.id as string | null, name: section.name }))]
    .map((section) => ({ ...section, bots: shownBots.filter((bot) => (sections.some((entry) => entry.id === bot.sectionId) ? bot.sectionId : null) === section.id) }))
    .filter((section) => section.id !== null || section.bots.length > 0 || draggedBotId !== null);

  function reportError(cause: unknown) { setActionError(cause instanceof Error ? cause.message : String(cause)); }
  function run(action: () => Promise<unknown>) { setActionError(null); void action().catch(reportError); }
  function nestConversation(threadId: string, parentThreadId: string) {
    run(async () => { await rpc.call("conversation_nest", { threadId, parentThreadId }); await refresh(); });
  }

  function firstConversation(bot: BotMetadata) {
    return orderedBotConversationTree((threadsByBot.get(bot.id) ?? []), bot.threadOrder).roots[0];
  }

  async function assignConversation(thread: PluginSidebarThread, botId: string, placeFirst?: boolean) {
    if (owners.has(thread.id)) throw new Error("This conversation has already been assigned. Refresh and try again.");
    if (assignmentRequests.current.has(thread.id)) throw new Error("This conversation is already being assigned.");
    assignmentRequests.current.add(thread.id);
    try {
      await rpc.call("conversation_assign", { botId, threadId: thread.id, ...(placeFirst !== undefined ? { placeFirst } : {}) });
      if (placeFirst !== undefined) {
        // Reveal as soon as assignment succeeds, even if refreshing the list is slow.
        setShownTopicBots(current => new Set([...current, botId]));
        setDroppedConversation({ botId, threadId: thread.id });
      }
      await refresh();
    }
    finally { assignmentRequests.current.delete(thread.id); }
  }

  async function moveBot(botId: string, sectionId: string | null, beforeBotId: string | null) {
    const moved = bots.find((bot) => bot.id === botId); if (!moved) return;
    const groups = new Map<string | null, BotMetadata[]>();
    for (const bot of bots) {
      if (bot.id === botId) continue;
      const group = groups.get(bot.sectionId) ?? []; group.push(bot); groups.set(bot.sectionId, group);
    }
    const target = groups.get(sectionId) ?? [];
    const targetIndex = beforeBotId ? target.findIndex((bot) => bot.id === beforeBotId) : -1;
    target.splice(targetIndex < 0 ? target.length : targetIndex, 0, { ...moved, sectionId });
    groups.set(sectionId, target);
    const sectionOrder: Array<string | null> = [null, ...sections.map((section) => section.id)];
    for (const key of groups.keys()) if (!sectionOrder.includes(key)) sectionOrder.push(key);
    const placements = sectionOrder.flatMap((key) => groups.get(key) ?? []).map((bot) => ({ botId: bot.id, sectionId: bot.sectionId }));
    await rpc.call("bots_reorder", { bots: placements }); refresh();
  }
  async function addSection() {
    const value = sectionName.trim(); if (!value || sectionPending) return; setSectionPending(true);
    try { await rpc.call("section_create", { name: value }); setSectionName(""); setAddingSection(false); refresh(); } finally { setSectionPending(false); }
  }



  useEffect(() => {
    for (const metadata of bots) {
      if (!metadata.hiddenUntilActivity) { wakeups.current.delete(metadata.id); continue; }
      if (metadata.hiddenAt === null || wakeups.current.has(metadata.id)) continue;
      if ((lastActivityByBot.get(metadata.id) ?? 0) <= metadata.hiddenAt) continue;
      wakeups.current.add(metadata.id);
      rpc.call("visibility_set", { botId: metadata.id, hiddenUntilActivity: false }).then(
        refresh,
        (cause) => { wakeups.current.delete(metadata.id); reportError(cause); },
      );
    }
  }, [bots, lastActivityByBot, refresh, rpc]);

  async function openBotConversation(bot: BotMetadata) {
    if (preparing.current) return;
    preparing.current = true;
    try {
      let prepared = await rpc.call("bot_prepare", { botId: bot.id });
      let personalId = personalProjectId;
      let defaultProjectId: string | null = null;
      {
        // Refresh ownership at the action boundary, then keep the composer seed
        // stable. Later realtime updates must not reset the user's choices.
        const snapshot = await refresh();
        if (!snapshot) throw new Error("Could not read current project roles. Try again.");
        const current = snapshot.bots.find(entry => entry.id === bot.id);
        if (!current) throw new Error("Bot no longer exists.");
        if (current.updatedAt >= prepared.updatedAt) prepared = current;
        personalId = snapshot.personalProjectId;
        defaultProjectId = defaultConversationProjectId({ bot: prepared, projects: snapshot.projects, owners: snapshot.projectOwners ?? [], personalProjectId: personalId, main: firstConversation(prepared) });
      }
      if (!prepared.stateReady) throw new Error("The bot’s private state could not be prepared. Try again.");
      if (defaultProjectId) {
        openConversation({ bot: prepared, kind: "project", projectId: defaultProjectId, environment: projectLaunchEnvironment(prepared.hostId), makeMain: false });
        return;
      }
      if (!personalId) throw new Error("BB’s personal project is not available. Refresh and try again.");
      openConversation({ bot: prepared, kind: "bot", projectId: personalId, environment: { type: "host", hostId: prepared.hostId, workspace: { type: "personal" } }, makeMain: false });
    } finally { preparing.current = false; }
  }

  function editBot(bot: BotMetadata, section: BotPanelSection | null = null) {
    const target = { botId: bot.id, section };
    const coordinator = (threadsByBot.get(bot.id) ?? []).find(thread => thread.id === bot.coordinatorThreadId && !thread.isArchived);
    const page = shownBotPage(bot.id);
    const threadId = activeThreadId && owners.get(activeThreadId) === bot.id ? activeThreadId : page ? null : coordinator?.id ?? null;
    const opened = threadId
      ? appPanel.openThreadPinnedTab({ threadId, tab: botsPinnedTab, target })
      : appPanel.openFixedTab({ surface: { kind: "navPanel", panelId: page?.page ?? "coordinator", subPath: page?.subPath ?? bot.id }, tab: botPageTabs[page?.page ?? "coordinator"], target });
    if (!opened) { setActionError("The bot panel could not be opened here."); return; }
    onNavigate();
  }

  function openLinked(bot: BotMetadata, kind: "project" | "worktree", thread?: PluginSidebarThread) {
    const workProjects = availableWorkProjects(projects, bot, personalProjectId);
    const main = firstConversation(bot);
    const preferredMain = main && bot.linkedProjectIds.includes(main.projectId) ? main : undefined;
    const projectId = conversationLaunchProjectId(workProjects, thread, preferredMain);
    if (!projectId) {
      setActionError("Choose a work project for this conversation. Link one in this bot’s Projects settings.");
      editBot(bot, "projects"); return;
    }
    const hostId = worktreeLaunchHostId(bot, thread, main);
    const environment = kind === "project" ? projectLaunchEnvironment(hostId) : worktreeLaunchEnvironment(hostId);
    openConversation({ bot, kind, projectId, environment, makeMain: false });
  }

  function openFork(bot: BotMetadata, source: PluginSidebarThread) {
    const environmentId = source.environment?.id;
    if (!environmentId) { setActionError("This conversation has no reusable environment."); return; }
    openConversation({ bot, kind: "fork", projectId: source.projectId, environment: { type: "reuse", environmentId }, makeMain: false, sourceThreadId: source.id });
  }

  async function openBot(bot: BotMetadata) {
    const coordinator = (threadsByBot.get(bot.id) ?? []).find(thread => thread.id === bot.coordinatorThreadId && !thread.isArchived);
    if (coordinator) { actions.open(coordinator.id); onNavigate(); }
    else { navigate.toPluginPanel("coordinator", { subPath: bot.id }); onNavigate(); }
  }

  const chatsTree = useMemo(() => conversationTree(
    sidebar.threads.filter((thread) => !owners.has(thread.id)),
    null, activeThreadId, 8,
  ), [sidebar.threads, owners, activeThreadId]);
  const renderChat = (thread: PluginSidebarThread) => <RecentRow key={thread.id} thread={thread} childrenByParent={chatsTree.childrenByParent} activePath={chatsTree.activePath} actions={actions} activeThreadId={activeThreadId} onNavigate={onNavigate} onAssign={setAssigning} onConversationDrag={(row, event) => { if (!owners.has(row.id) && !assignmentRequests.current.has(row.id)) conversationDrop.begin(row, event); }} draggingThreadId={conversationDrop.drag?.threadId ?? null} />;
  return (
    <TooltipProvider>
    <div ref={sidebarElement} className="bots-sidebar flex h-full min-h-0 flex-col overflow-hidden" data-conversation-dragging={Boolean(conversationDrop.drag)}>
      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        {!loaded ? <p className="px-2 py-4 text-sm text-muted-foreground">Loading bots…</p> : null}
        {sidebar.status === "error" || error || actionError ? <p role="alert" className="px-2 py-3 text-xs text-destructive">{actionError ?? error ?? "Could not load the sidebar."}</p> : null}
        {!inventoryFooterAvailable ? <p role="status" className="px-2 py-1 text-xs text-muted-foreground">Bot-wide live work requires an updated BB app. Refresh after updating; native child summaries cover children only.</p> : null}
        {warnings.map((warning, index) => <p key={`${index}:${warning}`} role="status" className="px-2 py-1 text-xs text-muted-foreground">{warning}</p>)}
        <div className="sidebar-section-heading flex items-center justify-between">
          <span className="sidebar-section-title font-medium text-muted-foreground">Bots</span>
          <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-state-hover" aria-label="Create…" title="Create…"><TinyIcon name="plus" /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content {...portalScope} align="end" sideOffset={4} aria-label="Create" className="z-50 min-w-36 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
            <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={() => { setAddingSection(false); setCreatingBot(true); }}>Bot</DropdownMenu.Item>
            <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={() => setAddingSection(true)}>Section</DropdownMenu.Item>
            <DropdownMenu.Item className={MENU_ITEM_CLASS} onSelect={() => { setAddingSection(false); setCreatingProject(true); }}>Project</DropdownMenu.Item>
          </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
        </div>
        {addingSection ? <form className="mb-2 flex gap-1 px-1.5" onSubmit={(event) => event.preventDefault()}><Input autoFocus className="h-7 min-w-0 text-xs" aria-label="Section name" value={sectionName} maxLength={80} onChange={(event) => setSectionName(event.target.value)} placeholder="Section name" /><Button type="button" size="sm" className="h-7 px-2" disabled={!sectionName.trim() || sectionPending} onClick={() => run(addSection)}>Add</Button><button type="button" className="px-1 text-xs text-muted-foreground" aria-label="Cancel section creation" disabled={sectionPending} onClick={() => setAddingSection(false)}>Cancel</button></form> : null}
        <div className="space-y-2">
          {sectionGroups.map((section) => <section key={section.id ?? "unassigned"} className="bot-section rounded-md" data-section-id={section.id ?? "unassigned"} onDragOver={(event) => { if (draggedBotId) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (draggedBotId) run(() => moveBot(draggedBotId, section.id, null)); setDraggedBotId(null); }}>
            {section.id !== null ? <RowContextMenu items={[
              { label: "New section…", action: () => setAddingSection(true) },
              ...(section.id ? [
                { label: "Rename section…", action: () => setEditingSection(sections.find((entry) => entry.id === section.id) ?? null) },
                { label: "Delete section", action: () => { if (window.confirm(`Delete “${section.name}”? Its bots will move to Main.`)) void rpc.call("section_delete", { sectionId: section.id! }).then(refresh); } },
              ] : []),
            ]}><div className="px-1.5 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground" tabIndex={0}>{section.name}</div></RowContextMenu> : null}
            {section.id === null && section.bots.length === 0 && draggedBotId ? <div className="rounded border border-dashed border-border px-2 py-2 text-[10px] text-muted-foreground">Move to Main</div> : null}
            <div className="space-y-px">{section.bots.map((metadata, index) => {
              const botId = metadata.id;
              const botThreads = (threadsByBot.get(botId) ?? []).filter((thread) => !thread.isArchived);
              return <div key={botId} onDragOver={(event) => { if (draggedBotId && draggedBotId !== botId) event.preventDefault(); }} onDrop={(event) => {
                event.preventDefault(); event.stopPropagation();
                const bounds = event.currentTarget.querySelector(".project-row")?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
                const beforeBotId = event.clientY > bounds.top + bounds.height / 2 ? section.bots[index + 1]?.id ?? null : botId;
                if (draggedBotId && draggedBotId !== botId) run(() => moveBot(draggedBotId, section.id, beforeBotId));
                setDraggedBotId(null);
              }}><BotGroup metadata={metadata} threads={botThreads} selected={botId === selectedBotId} activeThreadId={activeThreadId} actions={actions} topicsVisible={shownTopicBots.has(botId)}
                ownedProjectNames={projectOwners.filter(owner => owner.botId === botId).map(owner => projects.find(project => project.id === owner.projectId)?.name ?? "Unavailable project")}
                onToggleTopics={() => setShownTopicBots((current) => { const next = new Set(current); if (next.has(botId)) next.delete(botId); else next.add(botId); return next; })}
                onEdit={(section) => { setActionError(null); editBot(metadata, section); }} hidden={hiddenIds.has(botId)}
                onVisibilityChange={(hiddenUntilActivity) => run(() => rpc.call("visibility_set", { botId, hiddenUntilActivity }).then(refresh))}
                onOpenBot={() => run(() => openBot(metadata))}
                onReorder={(threadId, targetThreadId, position) => run(async () => { await rpc.call("conversation_reorder", { botId, threadId, targetThreadId, position }); await refresh(); })}
                onNewConversation={() => run(() => openBotConversation(metadata))}
                onNewInProject={() => openLinked(metadata, "project")}
                hasWorkProjects={availableWorkProjects(projects, metadata, personalProjectId).length > 0}
                onNewInWorktree={(thread) => openLinked(metadata, "worktree", thread)}
                onFork={(thread) => openFork(metadata, thread)} onNest={nestConversation}
                onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", botId); setDraggedBotId(botId); }}
                onDragEnd={() => setDraggedBotId(null)} dragging={draggedBotId === botId} conversationDropTarget={outsideDropTarget?.botId === botId ? outsideDropTarget.placeFirst ? "first" : "last" : null} onNavigate={onNavigate} /></div>;
            })}</div>
          </section>)}
        </div>
        {loaded && bots.length === 0 ? (
          <button type="button" className="mt-2 flex w-full flex-col items-center rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground hover:bg-state-hover hover:text-foreground" onClick={() => setCreatingBot(true)}>
            <span className="mb-2 flex size-9 items-center justify-center rounded-lg bg-muted"><TinyIcon name="folder" /></span>
            Create your first bot
          </button>
        ) : null}
        {hiddenBots.length ? <div className="bots-list-footer px-1.5 pt-2">
          <button type="button" className="h-5 rounded px-1.5 text-[9px] text-muted-foreground hover:bg-state-hover" aria-pressed={showHidden} onClick={() => setShowHidden((current) => !current)}>{hiddenBots.length} hidden</button>
        </div> : null}
      <ChatsSection activeChatId={activeThreadId && !owners.has(activeThreadId) ? activeThreadId : null} onNewChat={() => {
        actions.openNewThread({ ...(personalProjectId ? { projectId: personalProjectId } : {}), focusPrompt: true });
        onNavigate();
      }}>
        <ul>
          {chatsTree.recent.map(renderChat)}
          {chatsTree.other.length ? <li><button type="button" className="flex min-h-7 w-full items-center gap-1 rounded-md px-1 text-left text-sm text-muted-foreground hover:bg-state-hover" aria-expanded={showOtherChats} aria-controls={chatsOtherId} onClick={() => setShowOtherChats((current) => !current)}><span className={showOtherChats ? "rotate-90" : ""}><TinyIcon name="chevron" /></span>Older chats ({chatsTree.other.length})</button><ul id={chatsOtherId} hidden={!showOtherChats}>{showOtherChats ? chatsTree.other.map(renderChat) : null}</ul></li> : null}
        </ul>

            {!chatsTree.recent.length && !chatsTree.other.length ? <p className="px-2 py-3 text-sm text-muted-foreground">No unassigned conversations.</p> : null}
      </ChatsSection>
      </div>
      {editingSection ? <RenameConversationDialog title={editingSection.name} heading="Rename section" description="Choose the section name shown in the sidebar." onClose={() => setEditingSection(null)} onSave={async (name) => {
        await rpc.call("section_update", { sectionId: editingSection.id, name }); refresh();
      }} /> : null}
      {assigning ? <AssignConversationDialog bots={bots} title={assigning.title ?? assigning.titleFallback ?? "Untitled conversation"} onClose={() => setAssigning(null)} onAssign={async (botId) => {
        await assignConversation(assigning, botId);
      }} /> : null}
      {creatingProject ? <ProjectCreateDialog hosts={hosts} {...projectActions} onClose={() => setCreatingProject(false)} onCreated={(project) => { setCreatingProject(false); navigate.toProject(project.id); onNavigate(); }} /> : null}
      {creatingBot ? (
        <BotCreateDialog
          {...projectActions}
          hosts={hosts}
          projects={projects}
          owners={projectOwners}
          botNames={new Map(bots.map((entry) => [entry.id, entry.name]))}
          onClose={() => setCreatingBot(false)}
          onCreate={async (value) => {
            const created = await rpc.call("bot_create", value);
            refresh();
            setCreatingBot(false);
            run(() => openBotConversation(created));
          }}
        />
      ) : null}
    </div>
    {conversationDrop.drag ? createPortal(<div {...portalScope} ref={conversationDrop.ghostRef} className="conversation-drag-ghost rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md" aria-hidden="true"><div className="truncate">{conversationDrop.drag.title}</div><div className="text-[10px] text-muted-foreground">{outsideDropTarget?.placeFirst ? "Drop to make top conversation" : "Drop to add at end · Face or Shift for top"}</div></div>, document.body) : null}
    </TooltipProvider>
  );
}

export default definePluginApp((app) => {
  if (typeof app.slots.experimental_threadMessageAppearance === "function") app.slots.experimental_threadMessageAppearance({ id: "bot-human-message-color", useAppearance: useBotMessageAppearance });
  const inventoryFooterAvailable = typeof app.slots.experimental_threadTimelineFooter === "function";
  if (inventoryFooterAvailable) app.slots.experimental_threadTimelineFooter({ id: "bot-active-work", title: "Bot active work", component: BotWorkFooter });
  app.slots.navPanel({
    experimental_showCloseButton: false, id: "conversation", title: "New conversation", path: "conversation", icon: "MessagesSquare", component: ConversationPanel,
    fixedTabs: [{ ...botPageTabs.conversation, title: "Bot", icon: "Bot", component: ConversationBotTab, layout: "flush" }],
  });
  app.slots.navPanel({
    experimental_showCloseButton: false, id: "coordinator", title: "Bot coordinator", path: "coordinator", icon: "MessagesSquare", component: CoordinatorPanel,
    fixedTabs: [{ ...botPageTabs.coordinator, title: "Bot", icon: "Bot", component: CoordinatorBotTab, layout: "flush" }],
  });
  app.slots.experimental_threadPinnedTab({ ...botsPinnedTab, title: "Bots", icon: "Bot", component: BotsPinnedTab, layout: "flush" });
  app.slots.experimental_threadList({
    id: "bot-projects",
    title: "Bots Sidebar",
    description: "Independent bots with their conversation trees and unassigned chats.",
    component: (props) => <BotsSidebar {...props} inventoryFooterAvailable={inventoryFooterAvailable} />,
  });
});
