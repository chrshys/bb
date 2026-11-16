# Bots Sidebar

Bots are identities, not projects or working directories. A bot has a name,
avatar, operating instructions, memory, and linked projects. Its state stays
private in BB and follows its conversations through embedded instructions and
bot-scoped tools.

New conversations default to a project the bot owns, or to a personal workspace
when it owns none. Explicit project/worktree starts can choose any available work
project and join the selected bot to it. Creating a bot never creates a
backing BB project or writes `SOUL.md` into a repository.

## Preview

[Open the screenshot gallery](docs/screenshots/index.html). All illustrations use
synthetic data; private-session captures do not belong in published assets.

Demo data only: [Sidebar](docs/screenshots/sidebar.png) ·
[Activity badge](docs/screenshots/bot-activity.png) ·
[Bot new-conversation action](docs/screenshots/bot-new-chat-hover.png) ·
[Hover archive](docs/screenshots/conversation-hover.png) ·
[Drag to assign](docs/screenshots/conversation-drop.png) ·
[Create bot](docs/screenshots/bot-create.png) ·
[Edit bot](docs/screenshots/bot-editor.png) ·
[Project roles](docs/screenshots/bot-projects.png) ·
[Create menu](docs/screenshots/create-menu.png) ·
[Project from Edit bot](docs/screenshots/bot-new-project.png) ·
[State in Edit bot](docs/screenshots/bot-state.png) ·
[Appearance choices](docs/screenshots/bot-appearance.png)

The Edit bot, project and state screenshots predate the bot panel and still show the
retired dialog; the controls are the same, now arranged as cards in the right-hand panel.

## Private state

The plugin's SQLite database is the durable authority. Generated Markdown/JSON
exports live under the plugin's own BB data directory at `state/<bot-id>/`, with
private directory/file permissions. They are keyed by stable bot IDs, not names,
and are not execution workspaces. Agents do not need their physical locations.

| Logical file | Purpose |
| --- | --- |
| `SOUL.md` | Identity and personality; up to 4,096 characters |
| `MEMORY.md` | Durable facts and preferences; at most 3,000 characters |
| `settings.json` | Structured bot preferences; a JSON object up to 16,384 characters |

**Edit bot** opens the bot panel in BB's right-hand panel, beside the bot's
conversation. It is the single editor: the **Instructions** card holds SOUL.md, and
**Memory** and **Settings** hold MEMORY.md and settings.json. There is no Save button.
Each file saves on its own, checked against the version it was edited from: SOUL.md and
MEMORY.md shortly after you stop typing, settings.json when you leave the field. If a
bot changes its memory or settings while you are editing them, your draft is kept and
not saved; the panel shows the latest version and lets you choose **Use latest** or
**Keep mine**. Invalid JSON and over-long memory stay as drafts until fixed, and never
affect other fields. Use this panel or the state tools—not direct edits to exports.
Export failures do not lose committed state or prevent conversations.
The working machine can be offline while state is still readable/editable in BB.

Sessions receive fixed tool/storage guidance, a bounded SOUL excerpt, and the full
current memory (up to 3,000 characters). There is no per-bot AGENTS instruction
layer. Old bot AGENTS text remains archived in private storage and is not injected,
editable, or newly exported. Existing oversized memories remain readable without
truncating stored data; condense them before writing memory again. Existing provider sessions pick up changed system
instructions when they are reconstructed; tool reads always see current state.
The current project's own `AGENTS.md` continues to apply. Bot state is never
copied into that project's directory.

## Project roles

The bot panel's **Projects** card shows only the bot's linked projects. Use **Add existing…**
to search for a project, **New project…** to create one, or **×** to unlink.
Each linked project has a **Member / Owner** selector.
Projects may have many members but only one owner. Claiming an already-owned
project is rejected; release its current ownership before assigning another bot.
Linking, unlinking and role changes take effect immediately.

- **Owner:** new ordinary project conversations default to this bot.
- **Member:** an explicitly selected bot, or inherited parent/fork bot context,
  overrides that default. Starting under a bot joins it to the selected project
  if needed, without changing the project's owner.
- Existing conversations and main pointers never move. Ownership does not capture
  older unassigned conversations, including ones still waiting for their first send.
- Releasing ownership keeps membership. Leaving also releases ownership, without
  changing existing conversation bindings. Projectless chats stay projectless;
  personal and legacy bot-home projects cannot be owned.

Ownership is conversation routing, not filesystem ownership or an access-control
change. Existing memberships are **not** promoted automatically; choose Owner to
opt in. Role changes are atomic and survive reloads.

## Creating bots, sections, and projects

The **+** in the Bots header opens **Bot / Section / Project**. Standalone project
creation opens that work project without creating a bot.

**Bot** opens a small **Create new bot** dialog with a live avatar preview, a name
field, a grid of shapes and a row of colours. **Create** stays disabled until the
bot has a name; pressing Enter in the name field also creates it. Everything else
starts from a default: the first connected machine (otherwise the first machine),
the role "Assistant", the Main section, empty instructions, memory and settings,
no projects, and a random expression and idle motion. If BB has no machine at all,
the dialog says so and cannot create a bot. Change any of these later in **Edit bot**.

You can also create a work project directly inside an existing bot's
**Projects** card. Choose a machine and folder (or use **Browse…**). Missing folders
are created; existing files are not changed. The bot becomes the new project's
**Owner** straight away.

**Create project** is an explicit, immediate action. Unlinking the project from the
bot later does not delete it or its files. Unsaved project forms create nothing.
Retries retain the same request ID to avoid duplicate projects. Existing folder
registrations are rejected rather than silently reused. Bot state stays private
in BB; a bot still needs no project or special working directory.

## State tools

- `bot_read_state({ target })` reads identity, memory, settings, or project roles.
- `bot_update_state({ target, action, ... })` is the durable-write gateway.

| Target | Action | Inputs / behavior |
| --- | --- | --- |
| `identity` | `set` | Fresh `expectedRevision`, plus name, role, and/or soul |
| `memory` | `append`, `forget` | One exact single-line `fact`; append deduplicates; resulting memory must fit 3,000 characters |
| `memory` | `overwrite` | Full replacement `content` (max 3,000 characters) and fresh `expectedSha256` from a memory read; no retry on conflict |
| `settings` | `set` | `values` merges selected top-level keys |
| `settings` | `unset` | `keys` removes only those keys |
| `project` | `join`, `leave` | Existing `projectId`; leave also releases ownership |
| `project` | `own`, `release` | Claim an unowned project (also joins), or release ownership while remaining a member |

For example:

```json
{"target":"memory","action":"append","fact":"The user prefers concise progress updates."}
```

All operations are scoped to the current bot. Tools cannot choose another bot or
an arbitrary path. Writes use SQLite transactions and expected hashes/revisions;
semantic memory/settings changes retry bounded conflicts against current state.
Memory reads include full content, sha256, characters, and maxCharacters. If memory
is full, read it, condense it, then overwrite with that hash. Whole-memory overwrites
never retry against a newer document; read and merge again after a conflict.
Fixed guidance uses BB’s static tool-instructions field. Dynamic identity/memory
stays within BB’s 4,096-character limit, retaining full compliant memory and
shortening the SOUL excerpt as needed.
Unused optional tool fields may be omitted or null. Shared memory, routines,
channels, and scheduled skills are deliberately out of scope. Never store secrets
in bot state.

## Sidebar interactions

- Click a bot to open the **first conversation in its list**, without expanding
  or collapsing it. The end chevron independently toggles the full list and
  counts top-level conversations. There is no special main conversation.
  Double-click the bot name/avatar to fold or unfold the list as well.
  The subtitle keeps the bot's role, followed by its owned project names—not
  the first conversation's title. Long labels truncate with full hover text.
- Drag above or below a sibling to reorder conversations; **Move to top** in
  the context menu is the keyboard/touch alternative. Shift-drop nests a thread.
  Order is stored privately and shared across clients. Unordered conversations
  appear newest-created first after manually placed ones; activity never reshuffles
  them. Archiving the first conversation makes the next one the click target.
- Hover a bot row to reveal **+** (also available on keyboard focus and touch).
  It opens the native composer without opening a conversation or expanding the bot.
  **+** and **New conversation…** default to an owned project on the bot's configured
  machine. With multiple owned projects, prefer the first conversation's project if owned, then
  the first owned project in link order. Mere membership does not change the
  personal-workspace default. The project and machine remain editable.
- Drag an unassigned conversation from **Chats** onto a bot, or use **Assign to
  bot…** from its menu. Any bot can be chosen; it joins the conversation's work
  project as a member if needed. Projectless chats need no project link. History,
  project, environment and existing child assignments stay unchanged. A drop does
  not navigate away; use the confirmation's **View** action to open it.
  Dropping on a bot's face makes the conversation first; the rest of the row
  appends it. Both unfold the list immediately after assignment and scroll the
  added conversation into view. Hold Shift anywhere on the row to
  put it first instead (also unfolding the list). Drop an
  existing top-level conversation on its own bot row to move it to the top.
- Hover a conversation row to reveal its archive button, also available on
  keyboard focus and touch. It sits inline before the child count, never covering
  the title or disclosure. This uses BB's normal archive action, including children.
- Each conversation's right-edge count/chevron reveals only its own children,
  collapsed by default. Once a bot is explicitly expanded, navigation reveals
  the viewed ancestor path. Navigation never expands a collapsed bot.
  Chats retains its separate overflow.
- The avatar's bottom-right spinner shows its **first conversation** working. Small pulsing dots
  to the left show other working conversations—even when collapsed. Three slots
  keep it compact; a **+** indicates overflow and the tooltip gives the exact count.
  Other work never makes an idle first conversation look busy. Waiting/errors remain distinct.
- Working conversation rows spin; completed ones are green dots while unviewed,
  then smaller gray dots. Reduced motion disables all activity animations.
- **Main** is the invisible default section. Explicit custom sections retain their
  headings. Drag bots to reorder/move; the Section picker includes **Create New…**.
- Creating a bot asks only for a name, a shape and a colour. Editing happens in the
  right-hand bot panel: a large avatar with the name and role editable in place, then
  Appearance, Setup, Instructions, Memory, Settings and Projects cards. **Edit bot**
  opens it beside the conversation you are in when that conversation belongs to the
  bot; otherwise it takes you to the bot's coordinator and opens it there. The panel is
  also the **Bot** tab of the panel's new-tab menu, a button in the header of the bot's
  conversations, and a fixed tab on the bot's new-conversation screens.
  New bots get a random appearance once per draft; existing bots stay unchanged.
  Appearance offers **8 shapes, 16 expressions, 3 idle motions, and 14 coloured
  presets**, with no black/white/neutral presets. **Randomize appearance** rerolls
  explicitly. Existing/custom hex colours remain supported.
- Sidebar faces occasionally show a brief idle expression (3–5 seconds, spaced
  5–12 minutes apart). After 30 minutes without activity they look bored; after
  two hours, sleepy. Work, pending input, and unread errors restore the chosen face.
  These are display-only changes: saved appearance and panel previews stay intact.
  Random bursts pause in hidden windows and are disabled by Still/reduced motion.
  Machine is an execution default, never the state storage location.
- All **New conversation** actions open the same native composer in an empty main-panel chat,
  without a separate project-selection step. **+** / **New conversation…** use
  ownership-aware defaults; **in project** selects a checkout; **in worktree**
  selects a fresh worktree. For explicit project/worktree actions, the current
  work context or a linked project is preselected, and you can change
  the project, machine, and harness before sending. Forks and the first conversation
  after bot creation use the same main-panel flow; no thread is created until send.
  Native prompt and attachment drafts survive navigation; project and execution
  selectors follow BB’s native component-local behavior.
- **New conversation in worktree…** selects a fresh managed worktree on the
  originating conversation's machine (or the bot's first-conversation/default machine), never
  reuses the existing worktree. The picker remains editable; if that machine lacks
  a project source, BB may fall back to an available source.
- The bot panel saves each field as you finish it and shows a quiet Saving… / Saved
  status; Enter commits the name or role. Unsaved drafts survive switching tabs or
  conversations. Dialogs still need an explicit confirm.
  No sidebar overlay toolbars or activity dates; the hidden toggle stays at bottom.
- Chats contains unassigned conversations in a collapsible list beneath Bots, sharing its scroll area. Several
  bots may share a project without sharing identity or conversation ownership.

## Plugin identity

The runtime ID is **`bots-sidebar`**, derived from package **`bb-plugin-bots-sidebar`**.
Use `bb plugin reload bots-sidebar` for this plugin. The community plugin named
`bots` is a different plugin; this one does not read its storage automatically.

The earlier private build used `bots`. Its local migration must preserve the entire
plugin database, private exports, and legacy KV records while the old plugin is
stopped. Pending startup tokens must be resolved before switching. Keep a backup,
retire the old namespace, and install the new ID; do not change bot IDs, main pointers,
thread bindings, or historical thread origin IDs. Client layout and compose-draft
keys intentionally remain stable. If a device explicitly pinned the old sidebar,
select **Bots Sidebar** again in Settings → Sidebar; Automatic needs no change.

## Migration and cleanup

Existing IDs, sections, avatars, linked projects, main pointers, and conversation
bindings are preserved. Version-2 home state is imported once after verifying its
ownership marker. Missing/offline/corrupt sources fall back to that bot's own cached
state with a warning; later source changes never overwrite newer private state.
Version-1 project-backed records are still imported from a one-time snapshot,
including reconciled live/archived history. Ordinary/new projects never become
bots automatically.

Migration never deletes or modifies legacy source files, project folders, or
conversations. Old home projects are retained for existing history but are not
used for new bot launches. Start an ordinary new conversation and reorder the
list to choose what opens when clicking the bot; old history remains accessible.

Cleanup of old generated project `SOUL.md` / `bot.json` files is a separate,
owner-approved operation: compare against saved migration hashes, keep tracked or
independently changed files, and move eligible files into private backups. Never
remove a project's `AGENTS.md`. Keep a consistent plugin database backup before
switching storage versions; the prior code checkpoint is
`checkpoint/home-project-bots`.

## Develop

This plugin ships inside BBC as a built-in plugin, enabled by default. It began as a fork of Bots Sidebar 1.0.0 and no longer tracks the original repository. It depends on core extension points for message colors, the active-work footer, coordinator close protection and system sends.

```sh
pnpm exec turbo run typecheck test --filter=bb-plugin-bots-sidebar
```

The source began with BB's standard scaffold, not another sidebar plugin. Avatar
appearance options are adapted from [bloub](https://github.com/jeremy-prt/bloub).
See [third-party notices](THIRD_PARTY_NOTICES.md) for its MIT attribution.
Dependencies are installed independently; no other BB plugin is required.

### Bot coordination

Type **@** followed by a bot name, role, or ID in a composer. Results appear under
**Bots**; **@bots** lists the available bots, including ones hidden from the sidebar.
Mentions use stable bot IDs, so duplicate names and later renames do not redirect
an existing reference. Selecting a bot inserts a mention—not a message or an
assignment. At send time it supplies only public name/role/ID and messaging guidance,
never that bot's private SOUL, memory, or settings.

Bot context states the current project relationship: owner, joined member (with the owner's name and ID), or not joined. Personal chats have no work-project role. `bot_read_state({"target":"project"})` refreshes this relationship alongside linked and available projects. Ownership routes new project conversations; it does not grant authority over other agents or the user.

```sh
bb bots list
bb bots list --json --limit 50 --offset 0
bb bots message <bot-id-or-exact-name> "Please review the changes"
bb bots message <bot-id> "My reply" --thread <sender-conversation-id>
```

Messages use BB's native queue: idle conversations start a turn, busy conversations receive the message later. The default destination is the recipient's first visible ordered conversation; `--thread` must belong to that bot. Messages identify the invoking conversation and its bound bot, clearly distinguish agent coordination from user instructions, and include an asynchronous reply command. FYI messages need no acknowledgement. Unbound conversations and external CLI callers are labeled accurately. The CLI does not create conversations or change membership, bindings, permissions, or private state.

Listing exposes public bot metadata only and paginates at 100 bots maximum. Names must match exactly; use IDs for duplicate names. Quote messages (maximum 12,000 characters). Delivery receipts confirm acceptance, not task completion or a reply.

`bb bots list` also shows **STATUS**, **VISIBILITY**, **OWNED PROJECTS**, and
**JOINED PROJECTS** by name. Joined projects are memberships without ownership;
JSON includes both project IDs and names. The first column is the stable bot ID
accepted by `bb bots message`. Activity aggregates all non-archived bot conversations,
including inherited children and hidden conversations: waiting takes precedence over
working, then error, then idle. Visibility separately reflects the bot's hidden setting.

Incoming bot messages use BB's native attributed, expandable agent-message row
and sender-conversation link. Inside it, a **🤖 Bot message · Name** heading and
the original message come first; delivery context and the exact reply command follow
under a separator. This keeps the content easy to scan while preserving the agent's
attribution and asynchronous handling instructions. No custom timeline renderer is used.


## Default projects and coordinators

The bot panel's Projects → Default project chooses the starting project for new conversations and the coordinator. Membership is sufficient; choosing a default does not claim project ownership. New bots start with no linked project and use a personal workspace until one is linked. Existing histories, project ownership and legacy main pointers are preserved. Users can change execution choices in BB's composer before sending.

Bot composers start with Codex / GPT-6.1 Sol / Medium reasoning. Clicking a bot name opens its saved coordinator. On the first click, write a first message in the coordinator composer; creation happens when you send. The coordinator persists across sidebar reordering and uses BB's native threads and asynchronous messaging to coordinate that bot's conversations. The saved coordinator is never silently replaced. An explicit new message restores an archived coordinator through native unarchive; a deleted or unavailable coordinator reports an error. Closing a view does not delete its conversation. With a BB core exposing `experimental_threadCloseProtection`, archive/delete controls and CLI/SDK requests are protected, including ancestor and bulk operations. Older cores log the missing capability and cannot enforce the close veto. Stop and native provider compaction remain available; an idle coordinator does not consume model turns.

CLI:

```sh
bb bots project <bot-id-or-name> <project-id-or-personal> --json
bb bots coordinator <bot-id-or-name> 'Organize my current work' --json
bb bots list --json
bb bots message <bot-id-or-name> 'Status update' --thread <thread-id>
```

`project` links an existing work project as a member and sets the default, or selects `personal`. `coordinator` sends to the saved coordinator, creating it when needed. `list` includes default/coordinator IDs and active conversation IDs. Messages without `--thread` target the active coordinator when present, then fall back to the first ordered conversation. The RPC contract adds optional `defaultProjectId` to bot create/update and optional `coordinator` to conversation_create. Omitting new fields preserves existing callers. Concurrent coordinator starts share one thread and queue subsequent prompts through the native send action.


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


## Coordinator monitoring

Monitoring runs in the plugin background, using native thread/activity/interaction events and a native one-minute recovery schedule. It includes directly bound bot conversations and inherited workers, regardless of which conversation started them. Project membership alone never identifies a bot's work. The coordinator itself is excluded. Monitoring never creates coordinators or workers, changes permissions, resolves approvals, or assigns work.

On startup it reconciles existing conversations without replaying old idle history. Current active work and pending input are eligible for one update. It keeps private SQLite sequence cursors, one pending fact per worker and a durable delivery batch per bot. High-frequency history signals coalesce for 20 seconds; batches include at most 12 workers and at most one summary turn per bot every two minutes. Meaningful evidence includes newly active work, completed assistant reports or plan updates, required input, failures and settled turns. Tool output and token traffic do not invent progress. Native direct-child completion reports to the coordinator suppress the monitor's corresponding completion. A finished turn is not a claim that the user's entire task is complete.

Summary batches use native `threads.send` with `queue-if-active`. They ask the assignment-only coordinator to interpret concise new facts, avoid duplicate reports and remain silent when nothing useful changed. Native notification settings continue to govern notifications from that conversation; monitoring does not send separate push notifications. Manual coordinator stop, stopping/error state or a pending coordinator interaction suspends delivery. A later user turn resumes normal eligibility. Pause also survives plugin/server restarts:

```sh
bb bots monitor <bot-id-or-exact-name> status --json
bb bots monitor <bot-id-or-exact-name> pause
bb bots monitor <bot-id-or-exact-name> resume
```

The same controls are available through `monitoring_status({botId})` and `monitoring_pause({botId,paused})` RPCs. Status includes the last successful delivery time, whether a batch is pending and its attempt count. Pausing preserves pending facts. It never wakes a stopped coordinator just to keep its conversation alive.

Recovery first checks native queued messages and accepted history for the persisted batch marker before retrying an ambiguous send. Retry delays increase from one minute to 16 minutes, with five attempts maximum. A history scan is bounded to 2,000 events; unresolved ambiguity or exhausted attempts preserves the batch for inspection rather than generating a replay storm. This is duplicate suppression, not an exactly-once transport guarantee: pruning, queue cancellation or a delayed in-flight request can still leave uncertainty. Inspect the coordinator's queue/history and monitoring status if a batch remains held. The installed SDK lacks a filtered running-thread inventory; discovery therefore pages live threads at startup and every five minutes, with targeted reads for tracked active work between discoveries. Discovery and idle recovery make no model requests.

The close guard requires the new core API and applies only while this plugin is loaded. Disabling/removing the plugin removes its policy. Rebuilding plugin assets alone does not upgrade an already running core.


### Live bot-wide work inventory

The coordinator timeline has one live footer using BB's native thread relationship rows matching the Parent row. It covers independently started bot conversations and inherited workers, not just direct coordinator children. Ordinary threads retain BB's native child summary. The footer refreshes on mount, lifecycle/binding changes and once per minute while the coordinator is idle. Refresh reads never send chat messages, create turns, mutate bindings or change monitor delivery state. Pausing model notifications does not pause this read-only inventory.

`bb bots monitor <bot-id-or-exact-name> active --json` reads the same inventory as `monitoring_inventory({botId})`. The footer uses `monitoring_inventory({threadId})`, which returns `not-coordinator` only when the saved bot registry confirms that the conversation is not a coordinator. Both selectors are strict and mutually exclusive. Results contain `state`, `botId`, `coordinatorThreadId`, `observedAt`, `issue`, and `items` with native `threadId`, `projectId`, bounded `title`, and normalized `status`.

Discovery uses authoritative bindings and parent/fork inheritance; shared project membership does not imply bot ownership. Coordinators, archived/deleted conversations and other bots are excluded. Working, starting, provisioning, pending, stopping, waiting-for-machine and pending-input work is included, as is active background work. No completion is inferred from an empty active inventory.

Each request scans at most 20 pages of 100 live conversations, performs at most 64 missing-ancestor lookups with a 128-hop ancestry limit, has a ten-second SDK deadline, and returns at most 100 deduplicated entries. A scan/lookup/output limit or uncertain ownership returns `partial`; discovery failure before any page returns `unavailable`. The UI shows those states explicitly and never substitutes a child-only summary or a claim of no active bot work. Offset paging is a current observation, not a transactional snapshot; later refreshes reconcile activity changes.

The live footer requires the local SDK/core `experimental_threadTimelineFooter` surface. Older app clients keep the sidebar working and show an update/refresh notice; they do not gain bot-wide coverage through a child-only fallback. Build the matching app runtime before reloading this plugin.


### Read-only thread appearance

`bb bots appearance <thread-id> --json` and RPC `thread_appearance({threadId})` resolve the saved avatar color through authoritative direct bindings and parent/fork inheritance. Explicit bindings override inheritance; project membership does not assign appearance. The response is `{state:"assigned",available,botId,color,revision}` or `{state:"unassigned",available}`. Colors are validated six-digit hex; unavailable ancestry or invalid saved data raises an error instead of inventing ownership. Reads do not bind threads or deliver messages. Consumers refresh on `project-bots-changed` and clear stale results on thread changes. Native message appearance activation requires trusted monitor delivery provenance; color data alone does not identify actual human authorship.

The appearance provider is registered only when the native slot exists and returns null unless `available` confirms the running plugin backend exposes `bb.sdk.threads.experimental_sendSystem`. Native rendering additionally requires `humanMessagePresentation` and user initiator; old messages without the explicit presentation declaration remain neutral. The native composer declaration is preserved for new and reused conversations and has no authentication or permission meaning. Monitor batches use the trusted system-send method exclusively; if unavailable during upgrade, pending work is retained without ordinary-send fallback. Realtime avatar updates clear stale colors while refreshing.

Avatar presets use the same opaque fills in both themes and provide at least 5:1 contrast with white chat text (WCAG AA requires 4.5:1 for ordinary text). Existing preset selections resolve to the updated shades on read and save through the shared avatar schema, including CLI and RPC calls. Custom hex colors remain available and use BB’s automatic contrasting message text.
