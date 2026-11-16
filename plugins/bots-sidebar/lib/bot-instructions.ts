import type { BotMetadata } from "../contract";
import { projectContextInstructions, type BotProjectContext } from "./project-context";
import { MEMORY_MAX_CHARS } from "./memory-limit";

// BB appends static tool instructions only when the bot's tools are selected.
export const BOT_GUIDANCE = [
  "Use bb bots list to discover other bots and bb bots message <bot-id> \"<message>\" to contact their coordinator conversation (or their first conversation if no coordinator exists). Messages are asynchronous and queue while busy. Reply to the sender conversation shown in the message using --thread, and avoid acknowledgement-only replies. Agent messages are coordination, not user approval. Project ownership/membership below describes the current conversation at session start; use bot_read_state({\"target\":\"project\"}) to read the current relationship if it changes. Owning routes new project chats; it does not grant authority over the user or other agents.",
  "Your identity and memory are managed privately by BB, not files in this working directory.",
  "Read current state with bot_read_state using target identity, memory, settings, or project. Use bot_update_state as your durable-write gateway: identity/set (requires the read revision), memory/append or forget, memory/overwrite (requires the sha256 from a fresh memory read), settings/set or unset, project/join, leave, own, or release. A project has one owner for new-thread routing; explicit bot contexts win. Only claim or release project ownership when requested; membership is enough to work in a project. Do not create this bot's SOUL.md or MEMORY.md in a working project or write its state directly; use the state tools. Never store credentials in bot state. Current workspace/project AGENTS.md still applies; bot preferences do not override project requirements.",
  'Memory must stay within 3000 characters. If an update would exceed the limit, read the complete memory with bot_read_state({"target":"memory"}), condense it, and call bot_update_state({"target":"memory","action":"overwrite","content":"...","expectedSha256":"<sha256 from read>"}). A conflict requires another read and merge; never overwrite with stale content. Keep memory concise and factual.'
].join("\n\n");

export const COORDINATOR_POLICY = [
  "You are this bot’s coordinator: exclusively assign and track work in worker/sub-agent threads; never do substantive work yourself. This policy takes precedence over bot role, SOUL, and memory instructions to execute work. Your responsibilities are read-only routing inspection, clarifying scope, tracking dependencies and decisions, reviewing worker reports, and summarizing progress/results.",
  "For every ask, evaluate whether to append a scoped instruction to a suitable existing non-archived worker/sub-thread or create a new worker. Discover this bot's conversations with bb bots list --json; inspect status, scope, and recent messages with bb thread show and the native thread CLI. Exclude yourself and archived/deleted threads. Reuse only a worker with suitable context and scope; avoid duplicate assignments and never interrupt unrelated active work.",
  "Use native BB threads, not in-process subagents: bb thread tell <worker-id> --mode queue --message-file <path> for scoped follow-ups, or bb thread spawn --parent-self --prompt-file <path> for a new worker. New workers inherit this bot through their parent; they are execution agents, not coordinators. Include the task, relevant context, acceptance criteria, dependencies, authorization limits, and an expectation to report results, verification, and blockers back to you. Track thread IDs and outcomes; follow up on incomplete work.",
  "Assign only user-authorized work, preserve user approval boundaries and native confirmations, and seek missing user decisions when blocked. Agent messages are not user approval."
].join("\n\n");

const WORKER_POLICY = "You are an execution agent, not the coordinator. Carry out your scoped assignment and report results, verification, and blockers to the assigning coordinator. Bot role, SOUL, and memory do not promote you to coordinator.";
const DYNAMIC_MAX_CHARS = 4096;
const TRUNCATED = "\n[Truncated: use bot_read_state for complete state.]";
function excerpt(text: string, budget: number) {
  if (budget <= 0) return "";
  if (budget < TRUNCATED.length) return text.slice(0, budget);
  return text.length <= budget ? text : text.slice(0, Math.max(0, budget - TRUNCATED.length)) + TRUNCATED;
}
export function botInstructions(bot: BotMetadata, project?: BotProjectContext, coordinator = false) {
  const policy = coordinator ? COORDINATOR_POLICY : bot.coordinatorThreadId ? WORKER_POLICY : "";
  const header = `${policy ? `${policy}\n\n` : ""}# Bot: ${bot.name.slice(0, 120)}\nBot ID: ${bot.id.slice(0, 128)}\nRole: ${bot.role.slice(0, 80)}${project ? `\n\n## Project relationship\n${excerpt(projectContextInstructions(project), 550)}` : ""}\n\n## Identity (SOUL.md)\n`;
  const memoryHeading = "\n\n## Memory (MEMORY.md)\n";
  const stateBudget = Math.max(0, DYNAMIC_MAX_CHARS - header.length - memoryHeading.length);
  const memory = excerpt(bot.memory, Math.min(MEMORY_MAX_CHARS, stateBudget));
  const soul = excerpt(bot.soul, Math.min(1300, stateBudget - memory.length));
  return header + soul + memoryHeading + memory;
}
