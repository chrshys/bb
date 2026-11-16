---
name: bot-coordination
description: Set a bot default project or coordinate its conversations through Bots Sidebar.
---

Use `bb bots list --json` to discover bot IDs, default projects, coordinator IDs, and active conversation IDs. Inspect conversations with `bb thread show <id>` and the native thread CLI.

Set a bot default with `bb bots project <bot-id-or-exact-name> <project-id> --json`, or use `personal` for a personal workspace. This adds membership without claiming ownership. New bot conversations start in that default project; the composer allows overrides.

Use `bb bots coordinator <bot-id-or-exact-name> '<message>' --json` to send to the persistent coordinator or create it. New coordinators default to GPT-6.1 Sol with Medium reasoning. `bb bots message <bot> '<message>'` targets the coordinator once it exists; `--thread <id>` addresses a particular bound conversation. Messages queue while the recipient is busy.

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

Click a bot name to open its coordinator in the main chat panel. If it has no
coordinator yet, the inline native composer keeps a draft; the first message
creates the coordinator. Later clicks reuse the saved coordinator. The row +
continues to open the separate new-conversation composer.

The coordinator is represented by the bot name, title, and icon row. It is
excluded from the expandable conversation list and its count; ordinary
conversations remain visible there, including children of the coordinator.


## Persistent coordinator and background monitoring

Keep the saved coordinator conversation. Use native stop to suspend work and native compaction for context; never archive/delete/replace it to manage context. A core with `experimental_threadCloseProtection` enforces this through native actions and CLI/SDK, including ancestor/bulk closes. Older cores report the capability gap.

The plugin monitors actual bot bindings and inherited workers, including manually started bot chats. It batches meaningful lifecycle, worker-report, plan and pending-input evidence into the existing coordinator via native queued messaging. This is coordination, never user approval or permission to execute substantive work. Summarize useful new facts for the user; suppress overlap with native worker reports and do not acknowledge or reply to monitoring batches. Never create work merely because monitoring notices activity. No idle model keepalives are needed.

Use `bb bots monitor <bot> status --json`, `pause`, or `resume` to inspect/control durable monitoring. Pause survives restart; manual stop and pending coordinator approval also suspend model delivery. Status exposes pending batch and retry count. Native conversation notification settings remain in effect. Recovery uses durable markers in queue/history and bounded backoff; it does not promise exactly-once delivery. Five failed/ambiguous attempts hold the batch for inspection, and no monitoring action auto-creates a coordinator.


## Read-only active inventory

Use `bb bots monitor <bot> active --json` for current bot-wide work, including independently started bound roots and inherited children/forks. This calls the same bounded implementation as `monitoring_inventory({botId})`; the coordinator footer uses `{threadId}` instead. Respect `state`: `ready` is a completed scan, `partial` has a scan/lookup/output limit or unresolved ownership, and `unavailable` means discovery failed. Never describe partial/unavailable empty items as no work. The `not-coordinator` state applies only to the thread selector. The response supplies native conversation/project IDs and titles for navigation, status, observation time and an explicit issue.

The live timeline entry refreshes in place each idle minute and on lifecycle/binding changes using native thread relationship rows. These reads never create model turns or messages, assign work, change bindings, or bypass paused model notification delivery. Do not emulate the UI with polling-generated chat messages. Its generic footer needs the matching BB app runtime; old app clients display an update notice.


### Read-only thread appearance

`bb bots appearance <thread-id> --json` and RPC `thread_appearance({threadId})` resolve the saved avatar color through authoritative direct bindings and parent/fork inheritance. Explicit bindings override inheritance; project membership does not assign appearance. The response is `{state:"assigned",available,botId,color,revision}` or `{state:"unassigned",available}`. Colors are validated six-digit hex; unavailable ancestry or invalid saved data raises an error instead of inventing ownership. Reads do not bind threads or deliver messages. Consumers refresh on `project-bots-changed` and clear stale results on thread changes. Native message appearance activation requires trusted monitor delivery provenance; color data alone does not identify actual human authorship.

The appearance provider is registered only when the native slot exists and returns null unless `available` confirms the running plugin backend exposes `bb.sdk.threads.experimental_sendSystem`. Native rendering additionally requires `humanMessagePresentation` and user initiator; old messages without the explicit presentation declaration remain neutral. The native composer declaration is preserved for new and reused conversations and has no authentication or permission meaning. Monitor batches use the trusted system-send method exclusively; if unavailable during upgrade, pending work is retained without ordinary-send fallback. Realtime avatar updates clear stale colors while refreshing.
