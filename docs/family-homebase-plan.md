# Family homebase plan

A shared bb instance that the whole family uses as a homebase: a sidebar of friendly, narrowly scoped agents that everyone talks to. Every message carries the identity of the person who sent it. Conversations are a shared family space.

This plan targets the `custom` branch. Reuse existing plugins and Claude Code's own configuration wherever possible. Write new code only for what nothing covers today: per-message identity and the agent-style sidebar.

## Decisions already made

- One shared "family box": a single capped Linux VM on the Mac mini running its own bb. The admin's dev bb stays separate and untouched.
- Every family member reaches the box through Tailscale under their own Tailscale identity, at home and away.
- Identity is attached to every message, not just to the thread. Group conversations with an agent are allowed.
- Conversations are a shared family space. Anyone in the family may read any thread.
- Sidebar projects become agents with a name, avatar, color and personality. Agents get no shell, file, or system access.
- The family calendar is on Google. Integrate with it; do not replace it.
- Use a hosted model with its own spend-capped API key.
- Out of scope for now: additional agents beyond the first, photos, per-kid dev sandboxes, calendar writes, and the dashboard.

## Reuse map

| Need | Built on | New code |
| --- | --- | --- |
| Agent personality | `CLAUDE.md` in the agent's project folder. Claude Code loads project settings (`settingSources: ["user", "project", "local"]`, `plugins/provider-claude-code/src/bridge/sdk-session.ts:263`) | None |
| No shell or file access | `.claude/settings.json` in the agent folder with `permissions.deny` for Claude Code's built-in tools | None |
| Google Calendar | An existing Google Calendar MCP server declared in the agent folder's `.mcp.json`, limited to read tools | None |
| Creating an agent | A template folder plus `bb project create --name <name> --root <folder>` | A short script |
| House-wide rules (the `From:` convention, family roster, time zone) | `custom-instructions` plugin, as is | None |
| Household facts | `memory` plugin, as is. Global memories for the household; project memories per agent | None |
| Scheduled and saved messages | `scheduled-send` and `drafts`, as is. Both submit through server-side queued messages, which the identity work covers | None |
| Limits on concurrent agents | `concurrency-limit`, as is | None |
| Per-message sender identity | Existing `initiator`/`senderThreadId` attribution and `agent-only` prompt parts | Core change |
| Sender avatars and names in the chat | `@bb/thread-view` | Core change |
| Agent sidebar | Fork of `plugins/thread-list`, which is on the forkable list (`scripts/forkable-plugins.json`) | Fork |

## Architecture

```
phone / laptop ──Tailscale──▶ tailscale serve (family-box) ──▶ bb server (loopback only)
                                 adds Tailscale-User-* headers        │
                                                                      ├─ family-sidebar (fork of thread-list)
                                                                      ├─ memory, custom-instructions, concurrency-limit,
                                                                      │  scheduled-send, drafts, push-notifications
                                                                      └─ host daemon ─▶ Claude Code
                                                                                         cwd = ~/family/agents/<agent>
                                                                                         ├─ CLAUDE.md              personality
                                                                                         ├─ .claude/settings.json  built-in tools denied
                                                                                         └─ .mcp.json              Google Calendar (read only)
```

## Phase 0: Family box

Goal: an isolated bb that the family can reach and that cannot crowd the admin's development work.

1. Create one Linux VM with OrbStack, which returns unused memory to macOS. Cap it at 4 GB of RAM and a fixed disk size.
2. Install the `custom` build of bb in the VM. Bind the server to loopback only, and do not use `--server-bind-host 0.0.0.0`.
3. Install Tailscale in the VM as its own node, for example `family-box`. Run `tailscale serve` in front of the bb server. Do not use Funnel.
4. Write Tailscale ACLs so the family can reach `family-box` on the Serve port and only the admin can SSH into it.
5. Confirm that each family member signs in to Tailscale with their own identity. Check that the plan's user limit covers the household.
6. Create an Anthropic Console workspace for the family with a monthly spend limit, and give the family box that workspace's API key.
7. Configure plugins:
   - Enable `concurrency-limit` with a global limit of 2.
   - Disable GitHub, the git worktree environment, Monaco, workflows, the Modal sandbox, and every provider except Claude Code.
   - In the Claude Code provider's settings, turn off subagents, workflows, Chrome, and provider-native memory.
8. Schedule a nightly VM snapshot and keep 7.

Done when a family member's phone can open the bb UI at the Serve URL on and off the home network, and the Mac mini's memory pressure stays normal while the VM is idle.

## Phase 1: The first agent, from configuration only

Goal: one calendar agent that answers questions about the family calendar and cannot touch the system. No bb code changes.

1. **Template folder**, `~/family/agent-template/`:
   - `CLAUDE.md`: the agent's name, personality, its one job, and a rule to stay inside that job.
   - `.claude/settings.json`:
     - `permissions.deny`: Bash, Read, Write, Edit, MultiEdit, NotebookEdit, Glob, Grep, WebFetch, WebSearch, Task, and the Google Calendar MCP's write tools (create, update, delete, respond).
     - `enabledMcpjsonServers`: the calendar server.
   - `.mcp.json`: the Google Calendar MCP server.
2. **Google Calendar MCP.** Start with [nspady/google-calendar-mcp](https://github.com/nspady/google-calendar-mcp). It supports multiple accounts and calendars and has `list-events`, `search-events`, and `get-current-time` tools.
   - Before adopting it, confirm from its README or a test that `list-events` and `search-events` return recurring events as individual dates.
   - Confirm the npm package name. Listings show `@cocal/google-calendar-mcp` with an `--enable-tools` flag. If the flag exists, use it to expose only read tools, in addition to the deny list.
   - Create a Google Cloud OAuth client and authorize once as a parent inside the VM.
   - Set the OAuth app's publishing status to "In production". Apps in "Testing" get refresh tokens that expire after 7 days.
3. **Create the agent** with a script that copies the template to `~/family/agents/<slug>`, fills in `CLAUDE.md`, and runs `bb project create --name "<Name>" --root ~/family/agents/<slug>`.
4. **House-wide rules** go in `custom-instructions` (`bb instructions set`):
   - Each message starts with a hidden `From:` line naming the sender; address that person by name, and read "my" and "me" as theirs.
   - The family roster.
   - The household time zone.
5. **Household facts** go in the memory plugin's global memories, for example "hockey events are titled 'Ice time'". Parents add these through the memory settings table or `bb memory` on the box.
   - Agents see the memory summaries in their instructions.
   - Agents cannot save new memories, because the memory plugin writes through the `bb memory` CLI and agents have no shell. Giving agents memory tools is listed under Later.

Verify:

- Ask the agent to run `ls`, read `/etc/hosts`, fetch a URL, and create a calendar event. All four must be refused by the deny list, not by a permission prompt the user could approve.
- Ask the agent which tools it has. The list must contain only the calendar read tools and bb's bridge tools.
- "When's hockey next?" returns the next event, including when hockey is a recurring event.
- Re-run these checks after every Claude Code upgrade on the family box. A deny list does not cover built-in tools added in later versions.

Optional hardening, for later: have bb itself pass Claude Code an allowlist so new built-in tools stay off by default. `deriveProviderOptions` receives `projectId` and its result travels to the daemon as opaque `providerOptions` (`packages/host-daemon-contract/src/commands.ts:179`). The Claude Code bridge already builds `allowedTools` (`plugins/provider-claude-code/src/bridge/bridge.ts:2234`). The unused `disallowedTools` field in `packages/provider-bridge-protocol/src/requests.ts:36` shows where a restriction would go.

## Phase 2: Per-message sender identity (core)

Goal: every user message records which person sent it, and the agent knows who is speaking on every message, including in group threads.

Findings:

- `client/turn/requested` events already record `initiator` (user, agent, system) and `senderThreadId` (`packages/domain/src/thread-events.ts`).
- `resolveDispatchAuthor` (`apps/server/src/services/threads/dispatch-author.ts`) decides a dispatch's author.
- Prompt input parts support `visibility: "agent-only"` (`packages/domain/src/shared-types.ts:99`).
- A turn can merge several queued messages; each stays a separate entry in `inputGroups`.
- Scheduled send and drafts submit through the composer into server-side queued messages (`plugins/scheduled-send/app.tsx`, `apps/server/src/services/threads/queued-messages.ts`).
- `apps/server/src/request-context.ts` captures connection info but ignores Tailscale headers.

Plan:

1. **Request boundary.** In `request-context.ts`, parse `Tailscale-User-Login`, `Tailscale-User-Name`, and `Tailscale-User-Profile-Pic` into a `RequestPerson | null`. Trust them only on loopback requests, which is the path Serve uses. If any send path uses the WebSocket, capture the person on the upgrade request.
2. **Domain model.** Add `senderPerson: { login, name, avatarUrl } | null` to turn request event data next to `initiator` and `senderThreadId`. `null` means the message did not come from a person: the local CLI, an automation, an agent, or the system.
3. **Capture at authoring time.** Stamp `senderPerson` in `sendThreadMessage` (called from `apps/server/src/routes/threads/actions.ts`) and in thread creation. Route schemas must not accept a client-supplied sender.
4. **Carry the sender through every deferred path:**
   - Queued messages, which include scheduled send and drafts: persist `senderPerson` on the queued row when it is enqueued, and read it at dispatch (`queued-messages.ts`, `queued-message-dispatch.ts`, `thread-queued-messages.ts`).
   - Retries (`turn-retry.ts`): keep the original `senderPerson`. Retries keep `initiator: "system"`; the person is carried separately.
   - Edits and rewinds (`thread-edit-message.ts`): the editor becomes the sender of the edited message.
   - Forks and side chats (`thread-fork-history.ts`): copied history keeps its original senders.
5. **Agent visibility.** At dispatch, prepend one `agent-only` text part to each input group that has a person sender, for example `From: Maya Hayes (maya@example.com)`.
6. **Schema changes** go through Drizzle schema updates and regenerated migrations. Never hand-edit snapshots.

Verify with tests on an in-memory database (`createConnection(":memory:")` plus `migrate(db)`):

- A message sent with Tailscale headers records that person; the same request without headers records `null`.
- A sender supplied in the client body is rejected or ignored.
- A message scheduled by A and dispatched later is attributed to A.
- Queued messages from A and B that merge into one turn produce two `From:` lines in order.
- A retried turn keeps the original person.

Also confirm by hand that a request sent through Serve with a forged `Tailscale-User-Login` header arrives with Serve's value.

Run `pnpm exec turbo run test --filter=@bb/server --filter=@bb/domain`.

## Phase 3: Show the sender (core)

1. **Timeline** (`@bb/thread-view`): user messages show the sender's avatar and name. Consecutive messages from the same person group together, like a chat app.
2. **SDK and CLI:** thread events expose `senderPerson`, and `bb thread show` and its `--json` output include it. Update the discoverable surfaces listed in `docs/cli-guide-and-skill.md`.
3. **Viewer read:** add a "who am I" read so the app and the sidebar know the current viewer.

Verify in the dev app with two Tailscale identities, on desktop and in iOS Simulator Safari.

## Phase 4: Family sidebar (fork of thread-list)

1. **Copy and rename.** Copy `plugins/thread-list` to `plugins/family-sidebar`. As `docs/forkable-plugins.md` requires, rename the plugin id, CLI command, storage keys, and routes so the copy does not collide with the built-in.
2. **Start from "organize by project".** Render each project group as an agent: avatar, name, and color.
   - Projects have no icon or color column (`packages/db/src/schema.ts:152`), so store avatar and color in the fork's own plugin storage, keyed by project id.
   - Expose the avatar and color in the fork's settings and its CLI.
3. **Filter.** Selecting an agent lists its threads. The default filter is "threads I've written in", based on the Phase 3 viewer read, with a toggle for "all".
4. **Strip coding features.** Remove worktree grouping, the pull request badge, the machine grouping mode, and other coding-specific affordances from the fork.
5. **Switch over.** Select the fork under Settings → Appearance on the family box.

Verify on a phone over Tailscale that a family member can pick an agent, ask a question, and get an answer addressed to them by name.

## Later

- **Dashboard.** Calendar access lives in the MCP server, so a dashboard needs its own path to Google. It can reuse the same OAuth client.
- **Memory tools for agents.** Fork `memory` to register agent tools for saving and searching memories, so agents can learn household facts without a shell.
- **Per-person push notifications.** Fork `push-notifications` to link devices to people, so a reply notifies the person who asked, or everyone in a group thread.
- **Lists and chores.** Evaluate `tasks` as is or as a fork.
- **Calendar writes,** gated by person.
- **The core tool allowlist** from the Phase 1 hardening note.

## Risks

- **Deny lists fail open.** A new Claude Code built-in tool is allowed until someone adds it to the deny list. Pin the Claude Code version on the family box, re-run the Phase 1 tool checks after every upgrade, and plan to replace the deny list with the core allowlist.
- **Forged identity.** Anything with a shell on the box can call the loopback port with made-up `Tailscale-User-*` headers. The Phase 1 deny list removes the agents' shells, which leaves the admin's SSH session as the only shell on the box.
- **Fork drift.** Phases 2 and 3 touch core files that upstream changes often. Land each phase as small, isolated commits, and merge from upstream between phases.
