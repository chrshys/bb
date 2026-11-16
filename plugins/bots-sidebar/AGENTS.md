# Independent Bots development

Work on `main` in the installed Bots Sidebar source checkout. Confirm its path
with `bb plugin list` before editing. Do not edit or reload older personal-workspace
worktrees. Build and reload `bots-sidebar` from this checkout; verify the installed
source before deploying. The owner requested private, ID-keyed state,
not bot-home projects or special execution directories. Explicit user-created
work projects are allowed, but never create a backing project for bot storage.
Keep all UX refinements intact.
A code-only downgrade is not a data rollback: preserve the plugin DB backup before
restoring an older metadata format.

Private state design: use the plugin SQLite database as the durable authority,
with private per-bot Markdown/JSON exports under its own data directory. Embed
identity/instructions/memory into agent context; tools infer bot ID from explicit
thread bindings. Bot chats use personal workspaces or explicit work projects;
new-chat defaults follow project ownership without changing storage location.
No new backing projects, no state files in user repositories. Preserve
existing conversation histories and track legacy home project IDs for compatibility.

## Plugin identity

- Runtime ID: `bots-sidebar`; package: `bb-plugin-bots-sidebar`; display name:
  Bots Sidebar. The sidebar heading can remain Bots.
- `bots` is another marketplace plugin's ID. Do not add a runtime alias or read
  its private directory/KV automatically. Our old local namespace was migrated
  explicitly with backups. Historical thread origin IDs remain unchanged; durable
  bindings identify our old conversations. New starts must use `bb.pluginId`.
- Keep native tool names, SQL table names, RPC names, and existing `bots:` client
  preference/composer-draft keys stable. They are not runtime plugin identities.

## Data and state contract

- A bot has its own ID/name/private state and many linked projects. Never infer identity,
  activity, visibility, or thread ownership from a linked project's ID.
- A work project may have exactly one owner, independently of its many members.
  Persist ownership in `bot_project_owners` with a unique project key. Owning
  implies membership; leaving releases ownership; releasing keeps membership.
  Never automatically promote an existing membership to ownership.
- Existing thread bindings win, then explicit server-issued bot-start tokens,
  then parent/fork context. Only otherwise default NEW project threads to its
  owner. Never reassign old history or capture threads created before a claim.
  Explicit bot starts and new inherited contexts join that bot to the work project
  without changing its owner. Personal/legacy-home projects cannot be owned.
  Unassigned conversations still belong in Chats. Preserve all main pointers.
- Preserve the first-turn dispatch binding before agent configuration; a
  fire-and-forget thread.created event alone is insufficient. Configuration
  lookups are read-only; they must not preempt an inherited binding + join.
- Legacy migration is snapshot-based and read-only for old projects. Keep old
  main pointers/history. Import v2 state from legacy homes once when available,
  preserving a cached fallback and warning if unavailable; never overwrite newer
  private state on a later retry.
- Bot state belongs to plugin storage, never a working repository. State writes
  use SQLite transactions and expected hashes/revisions. Markdown/JSON files are
  private exports, not a second write interface or runtime working directory.
- Editing a bot must not rename or relocate linked projects. Native tools act
  only on the current bot and should not expose storage paths to the agent.
- `bot_update_state` is the durable-write tool: always require target + action.
  Identity/set requires a fresh revision. Memory is at most 3000 characters on every
  write; append/forget operates on exact single-line facts. Memory overwrite requires
  content + expectedSha256 from a fresh read, and never retries whole-document bytes
  against a newer hash. Overflow errors explain read/condense/overwrite. Preserve
  older oversized memories for reading and explicit compaction; settings set/unset only changes selected top-level keys;
  project join/leave/own/release changes membership/ownership atomically, never
  project files or historical conversation bindings. Reapply semantic edits on bounded CAS
  retries, never retry stale whole-file bytes. No shared-memory scope or routines.

# Bots sidebar UX contract

Preserve the approved interaction model below. An older source snapshot once
reintroduced removed controls during development. Do not restore old snapshots
or reintroduce hover toolbars when making unrelated changes.

- Clicking a bot opens its saved coordinator in the main chat panel without changing
  expansion. Before the first message, show the native composer inline in a coordinator
  chat view; never open the new-conversation modal for a bot-row click. The first send
  creates and binds the coordinator. Legacy main pointers remain compatibility data.
  The coordinator is represented only by the bot name/title/icon row, never a
  conversation entry. The end chevron toggles and counts ordinary top-level
  conversations only. Keep coordinator activity and selection on the bot row.
  Double-clicking the bot name/avatar also toggles the list; the first click
  retains normal navigation, without repeating it on the second click.
  Bots start collapsed; navigation and dialog assignment never automatically expand them.
  Successful outside conversation drops immediately unfold the destination bot,
  then scroll the added conversation into view when the refreshed list renders.
  Explicit expansion shows ordinary roots, including a former main when it is not the coordinator. Children retain
  independent disclosure; reveal active ancestor paths only within an expanded bot.
- Drag above/below a sibling to reorder it, or use Move to top in its context menu.
  Dropping a Chat on a bot's avatar makes it first; the rest of the row atomically
  assigns and appends it. Highlight the two drop zones while dragging. Shift-drop places it
  first instead. Both unfold the destination. Dropping an existing root on its own
  bot row moves it first. Short row hints: Add to end / Make first; longer help
  belongs in the drag ghost. Use a single subtle row boundary and filled active
  zone, not nested outlines or dashed avatar borders. Hide the row + during dragging.
  Shift-drop retains nesting. Persist threadOrder privately in the plugin DB;
  manual order wins, unplaced roots/siblings follow newest-created first. Activity,
  unread state, pinning, and navigation never reshuffle them. No bot-root overflow.
  Do not change bindings, parents, projects, environments, or historical main
  pointers to reorder. Click target, activity badge, project defaults,
  and default bot-message destination use the same first visible root.
  Bot rows retain the bot name and role/title, followed by owned project names
  in the subtitle. Never substitute a conversation title or show member-only
  projects as owned. Keep this label stable when folding; truncate with full hover text.
- Counts/chevrons never navigate. No Topics/Main's children labels or divider.
  No multi-action hover overlay toolbars. Conversation rows may show one inline
  archive button on hover/keyboard focus (always available on touch), immediately
  LEFT of the count/chevron. Keep it outside the navigation link and prevent
  archive clicks from navigating or toggling children. Use BB Button/Tooltip and
  the native archive action, which also archives child conversations.
- The Bots header has ONE + dropdown: Bot / Section / Project. Do not restore a
  separate + Section button or make + directly open the bot editor. Section creation
  is explicit and cancellable; standalone project creation must not create a bot.
  Portaled dropdown/context-menu Content needs `usePortalScopeProps()` so scoped
  plugin CSS applies. Highlight Radix `data-highlighted` for mouse and keyboard;
  keep disabled entries unhighlighted. Verify computed styles in the browser.
- Each bot row has ONE inline + before its list disclosure, shown on hover
  or keyboard focus and always available on touch. Reserve its width; no layout
  shift or overlay toolbar. Keep it separate from opening a conversation, disclosures, and
  bot reordering. Use BB Button/Tooltip. + and New conversation use an available
  owned project (owned first-conversation project first, then linked order), otherwise personal.
  Membership alone never chooses the default. Refresh ownership before opening;
  use the bot's configured host and preserve composer overrides after opening.
  Empty bots use the same ordinary new-conversation composer and ownership defaults.
- Bot settings (avatar, role, SOUL, section) belong in the bot panel, which
  **Edit bot** opens. Menus are opened only by right-click/keyboard context-menu actions.
- Reorder bots and move them between sections by dragging; never add arrow
  controls back to the row. The null/default section is Main and has no sidebar
  heading. Preserve explicit custom sections. The Section dropdown includes
  Create New… (not a separate always-visible creation button).
- Create new bot is its own small dialog: live avatar preview, one centred name
  input, the shape grid, the colour swatches, one optional Project folder row,
  Cancel / Create. Nothing else belongs in it. Defaults at creation: first
  connected host (else the first host), role Assistant, Main section, empty
  SOUL/memory/settings, no projects. With no host, show the inline message rather
  than an unexplained disabled button. It reuses the pickers exported by
  `components/avatar-appearance.tsx`; do not fork them.
- The Project folder row defaults to No project folder and must never block
  Create, whether it is left alone or its folder list is open. It is one quiet
  row: the folder or project name, a secondary line (the path, or how the bot
  joins), one Choose…/Change control and a clear button once something is chosen.
  The control is a menu of Choose a folder… and the existing projects, or a plain
  button when there are no projects. An existing project is linked as Member
  (never Owner, whoever owns it) and becomes the default project.
- Choosing a folder is one step everywhere in this plugin, through
  `useFolderChooser` in `components/folder-chooser.tsx`: the create dialog, New
  project… in the bot panel's Projects card and Project in the header + menu. It
  opens the OS folder dialog (`experimental_useNativeFolderPicker`) when the only
  connected machine is the one that dialog browses, and otherwise swaps in the
  compact folder list in place. The project name is always the folder's name. Do
  not add a name field, a path input, explanatory copy, a second Cancel/confirm
  pair or a second folder browser. The list shows a machine select only when
  several machines are connected, and offers New folder because `project_create`
  creates missing folders. A failed or unavailable OS dialog falls back to the
  list; a cancelled one changes nothing.
- In the create dialog a chosen folder only drafts `project_create` input: the
  project is created when Create is pressed, immediately before `bot_create`,
  then linked as Owner and default, and the bot uses the folder's machine.
  Cancelling before Create leaves no project. If `bot_create` fails after the
  project exists, keep that project in the row and say it stays; a retry must
  reuse it and never call `project_create` again. A failed `project_create`
  creates no bot and retries with the same `requestId`. The Projects card and the
  header's Project create as soon as the folder is chosen; the chooser keeps one
  `requestId` per machine and path so a retry of the same folder cannot duplicate.
- Bot editing lives in the right-hand panel, never in a modal. `components/bot-panel.tsx`
  is the only editor: a large avatar, the name and role editable in place beneath it,
  a quiet saved/saving status, then cards for Appearance, Setup, Instructions, Memory,
  Settings and Projects. In a thread it is the pinned `bots` tab
  (`experimental_threadPinnedTab`), shown as the Bots icon at the top of the right
  panel of every thread: it resolves the bot from the thread's assignment and
  explains an unassigned conversation. It is reused as the fixed `bot` tab of the
  `conversation` and `coordinator` pages. Do not add a second editor, a modal shell, a
  closable bot tab or a thread header button: the pinned icon is the one way in.
- **Edit bot** always shows the panel beside a conversation of that bot: in place when
  the user is already in one of its conversations or on one of its new-conversation
  pages, otherwise by opening the saved coordinator (or the coordinator page when none
  exists yet) with the panel open. Never open bot A's panel beside bot B's or an
  unassigned conversation: the pinned tab always shows the thread's own bot, and a
  request only supplies the section to bring into view. The sidebar asks the host
  directly through `experimental_useAppPanel()`: `openThreadPinnedTab` for a thread,
  `openFixedTab` with a `navPanel` surface for a page. The host navigates and holds the
  request until that view is ready. `lib/bot-panel-tab.ts` holds the tab references,
  the `{ botId, section }` target and which bot page is on screen; it relays nothing.
- The panel has no Save or Cancel. Every field saves on its own and nothing else is
  sent with it: name and role on blur or Enter (`bot_patch`), avatar, section, machine
  and default project on selection (`bot_patch`), SOUL.md and MEMORY.md after a short
  pause, on blur and on unmount, settings.json on blur and on unmount (`state_update`),
  project roles and project creation immediately (`state_apply`). Each write names the
  value or hash it was edited from; never send whole-bot payloads or `expectedUpdatedAt`
  from the panel, because unrelated changes bump that revision.
- Never overwrite a change the user has not seen. A field without a local draft follows
  realtime updates. A draft whose base changed elsewhere is kept, is not saved, and shows
  the latest value with **Use latest** / **Keep mine**; only Keep mine saves, against the
  version just shown. Invalid JSON, oversized memory and failed saves keep the draft and
  say why. Drafts live in `lib/field-drafts.ts`, outside React, so they survive tab
  switches, thread switches and closing the panel until the app reloads.
- Storage is private and automatic: no home path picker or custom-working-directory
  control. Projects shows only linked projects, Member / Owner roles, and an unlink action.
  Add existing… opens a searchable picker; New project… opens an inline work-project
  form with an explicit machine and folder browser. A conflicting owner is shown and
  disabled. Creating a project is immediate and makes the bot its owner; unlinking never
  deletes a project or its files.
- Bot context contains fixed guidance + SOUL.md + MEMORY.md (full compliant memory).
  Per-bot AGENTS.md is retired; preserve historical text as inactive private data,
  never inject it or offer it as an editable state file. Workspace AGENTS.md still applies.
- The bot panel is the single editor for SOUL.md, MEMORY.md and settings.json. Do not
  restore a separate View bot state action. Each file saves alone against its own hash;
  invalid JSON and conflicts keep that draft and leave the other files untouched.
- New bot drafts randomize color, shape, expression, and idle motion ONCE. Existing
  bots and rerenders never reroll. Offer Randomize appearance explicitly. Presets
  and random defaults are chromatic; no black/white/cream/gray (including migration
  fallbacks). Preserve legacy/custom hex colors. Keep the expanded Bloub-derived
  choices compact, retain original renderings, and retain MIT attribution.
- Sidebar expressions are a temporary presentation layer, never saved avatar/state
  edits. Brief idle looks last 3–5 seconds, spaced 5–12 minutes apart per bot;
  after 30 minutes idle use unimpressed, after two hours sleepy. Work anywhere in
  the bot, pending input, or unread errors restores the saved face immediately.
  Panel/picker previews always show the saved/draft expression. Pause timers when
  the page is hidden; dispose on unmount. Still/reduced-motion suppress random
  bursts but retain static long-idle poses. Do not poll or call any write RPC.
- All New conversation actions and forks open the SAME native composer in an empty main-panel chat. Never open a thread-start modal.
  Never restore a separate project pre-select/Continue screen. Use ownership-aware
  defaults for the generic new-chat action, the selected host's checkout for
  explicit project chat, and a fresh
  managed worktree for worktree chat. Use row context or the first conversation's still-linked
  project, then linked-first available fallback. The native project picker stays
  editable; hold seeds stable after opening so refreshes cannot reset user choices.
- New conversation in worktree ALWAYS seeds a fresh managed worktree with an
  explicit hostId (clicked conversation host, or first-conversation/default machine for bot menu).
  Do not reuse the clicked worktree or omit hostId: the host composer ignores a
  host environment seed without it. Keep draft keys distinct by worktree host and
  verify actual picker state. Preserve user overrides; unavailable hosts/sources
  may be reconciled by the host composer, never silently claim same-host success.
- Dialogs (rename, assign, create project) still require an explicit confirm click and
  Enter in their text inputs must not submit. Create new bot is the exception: Enter in
  its name field creates the bot when the name is valid. In the bot panel, Enter in the
  name or role commits that field, Escape abandons it, and an empty name is restored
  rather than saved. SOUL.md must accept normal newlines. The panel can create a section.
- Do not restore Move main or Make main. Keep existing histories and legacy pointers.
- Keep the later additions: worktree composer, conversation/Chats menus and
  rename/archive, older unassigned Chats grouped under N Other, and status icons.
- Highlight the actual current chat with `[aria-current="page"]` styles (the
  Tailwind `aria-current:` variant only matches `true`). Child branches default
  closed. Put the child count and disclosure chevron at the RIGHT end (`6 ›`),
  not on the left; no disclosure spacers for leaf rows and never overlay toolbars. Selected
  rows use background highlighting only, without a left stripe.
  Reveal the current chat's ancestor path on navigation.
- The avatar's bottom-right activity badge reflects its FIRST conversation, not
  aggregate bot work. Small pulsing dots to its left count other working threads,
  including collapsed descendants; three slots maximum, with + and an exact-count
  tooltip on overflow. Keep an idle first conversation visually distinct from busy others.
  Waiting takes precedence over working; preserve unread errors, ignore archived
  activity, and disable all animation under reduced motion. Counts never navigate.
- Completed conversations show a green dot only while unread; read conversations
  have no status icon. Preserve working/waiting/error indicators. Keep row status
  after the native menu button, aligned with the bot disclosure at the right edge.
- Unassigned Chats may be assigned through the dialog or dragged onto a bot row.
  Offer all bots, not only existing project members. Join a valid work project as
  Member atomically with the new binding; do not move the thread's project,
  environment, history or main pointers, and never steal existing associations.
  Personal chats need no membership. Keep legacy-home recovery rules.
  Conversation dragging is pointer-based within the sidebar: keep BB's split
  pointer handler, cancel on Escape/blur/unmount, and let drag-to-split take over
  outside the sidebar. Show a drop target/ghost, suppress click-through, preserve
  bot reorder dragging, and keep the assignment dialog for keyboard/touch.
- Chats is a clean collapsible list directly beneath Bots in the same scroll area.
  Keep its collapsed state per client; the hidden-bot toggle belongs below the bot list,
  not in the Bots heading. Do not reintroduce the per-row activity dates.
- Before reloading, run `npm run typecheck`, `npm test`, and `bb plugin build`.
  `tests/sidebar-ux.test.tsx` protects the approved interactions, not just markup.
  For visual changes also check the live UI on hover, menu open, and with the bot panel open.

## Screenshot privacy

- Tracked screenshots must use synthetic bots, projects, machines, and conversations.
  Never capture live private sidebars, chat content, identity, memory, or host labels.
  Crop to the component being illustrated and verify every image before committing.
- Keep original private audit evidence outside the repository. Replacing a tracked
  screenshot does not remove its earlier versions from Git history; inspect history
  separately before public publication.

## Bot coordination

- Use the public mention-provider API for @ completion. Search all bots by name,
  role, or stable ID without project/visibility filtering; @bots is discovery.
  Bound results and resolve IDs against current metadata at send time. A mention
  is a reference only: never send, create a main, reassign, join/own projects, or
  disclose private SOUL/memory/settings as a side effect.

- Agent context states its relationship to the current project (owner/member/unjoined),
  naming the owner when present. Personal and legacy-home chats are explicit exceptions.
  Configuration stays read-only; project state reads refresh the relationship.
- `bb bots list` exposes paginated public metadata, never private bot documents.
  `bb bots message` uses native `threads.send` with `queue-if-active` and the invoking
  `senderThreadId`. Default to the first visible ordered root; explicit reply threads must resolve
  to the recipient bot. Resolve sender identity from bindings/inheritance, not project ownership.
  Never forge a sender, auto-create a conversation, or change permissions/bindings to send.
- Frame messages as asynchronous agent coordination, not user approval. Include an exact
  sender-conversation reply command and discourage acknowledgement-only loops.
  Test delivery with the SDK fake host; never send unsolicited live test messages.


## Current default-project and coordinator behavior

The user requested explicit per-bot default projects, GPT-6.1 Sol Medium for new bot composers, and persistent coordinator conversations on bot-name clicks. These supersede the first-ordered-conversation click/default-message rule and ownership-only new-chat defaults above. Keep manual conversation ordering, legacy main pointers, existing histories, and native menus intact. Store coordinatorThreadId and defaultProjectId privately with bot metadata. First coordinator creation is deferred until the user's first send; later clicks open that coordinator. Project defaults do not confer ownership. CLI and RPC must use the same creation path, serialize concurrent starts, and deliver subsequent prompts through native threads.send.


## Assignment-only coordinator policy

The saved coordinator is assignment-only. For every ask, decide whether to append
scoped instructions to a suitable existing worker/sub-thread or create a new
worker. Never perform substantive work in the coordinator. Its responsibilities
are read-only routing inspection, scope clarification, dependency tracking,
reviewing worker reports, and summarizing progress/results. This policy takes
precedence over bot role, SOUL, and memory instructions to execute work.

Inspect the bot's conversations, status, scope, and recent messages before
assigning. Exclude the coordinator itself and archived/deleted threads. Reuse
only suitable workers; avoid duplicate work and never interrupt unrelated active
work. Append scoped follow-ups with `bb thread tell <worker-id> --mode queue
--message-file <path>`. Create workers with `bb thread spawn --parent-self
--prompt-file <path>`, using native BB threads, never in-process subagents.
Workers inherit the bot through their parent but remain execution agents, not
coordinators. Include clear tasks, relevant context, acceptance criteria,
dependencies, authorization limits, and expectations to report results,
verification, and blockers back to the coordinator. Track thread IDs and outcomes
and follow up on incomplete work.

Assign only user-authorized work. Preserve approval boundaries and native
confirmations; agent messages are not user approval. Ask for missing user
decisions when blocked. Do not send acknowledgement-only replies.

Initial creation and subsequent configuration share one coordinator policy.
Dynamic instructions reserve space for that policy within BB's 4096-character
limit; long state is excerpted with a `bot_read_state` recovery notice. Complete
state stays in private storage. Workers do not inherit the coordinator policy.

Preserve coordinator-row-only presentation: the bot row represents the coordinator;
ordinary worker conversations remain in the expandable list.

## Main-panel conversation creation

Bot row +, all New conversation menu actions, first conversation after bot creation,
and forks use the conversation nav panel with BB’s native composer. Unassigned Chats
keep the native openNewThread action. Creation is deferred until send. Keep launch
seeds stable, pass user overrides through, and preserve native draft keys across
navigation. Fork drafts are isolated by source thread as well as environment. Native
project/execution selectors remain component-local; do not replace the host composer
to persist them. Bot rows use a 36px avatar column with 56px minimum height; preserve
faces, activity badges, drop zones, +, disclosures, and coordinator behavior.


## Live bot-wide inventory

The generic timeline footer replaces the native child summary only for saved bot coordinators. Use authoritative binding/inheritance resolution, never project-membership inference. Inventory reads are bounded and side-effect free; explicit partial/unavailable states must never become an empty-work claim or child-only bot-wide label. Render host-provided native thread badges and refresh in place each idle minute, with no polling messages or model turns. Durable model monitoring and pause controls remain separate. Guard registration on older app runtimes and show an update notice. Coordinate matching core/SDK app deployment before plugin build/reload.
