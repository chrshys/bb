import type { ThreadListEntry } from "@bb/domain";
import { ThreadBadge } from "./ThreadBadge";
import { getThreadDisplayTitle } from "@/lib/thread-title";
import { isThreadDisplayStatusBannerActive } from "@/components/promptbox/banner/ThreadPromptContextBanner";

export function RunningThreadsSummary({
  threads,
}: {
  threads: readonly ThreadListEntry[];
}) {
  const children = threads.filter((thread) => thread.originKind === null);
  if (children.length === 0) return null;
  const active = children.filter(
    (thread) =>
      isThreadDisplayStatusBannerActive(thread.runtime.displayStatus) ||
      thread.hasPendingInteraction,
  );

  return (
    <section aria-label="Running threads" className="my-4 min-w-0 space-y-2">
      <p
        className={
          active.length > 0 ? "sr-only" : "text-sm text-muted-foreground"
        }
      >
        {active.length > 0
          ? `Running threads · ${active.length}`
          : "No threads running."}
      </p>
      {active.length > 0 ? (
        <ul className="space-y-2">
          {active.map((thread) => (
            <li key={thread.id} className="min-w-0 space-y-1">
              <ThreadBadge
                threadId={thread.id}
                projectId={thread.projectId}
                title={getThreadDisplayTitle(thread)}
              />
              {thread.hasPendingInteraction ? (
                <span className="text-xs text-muted-foreground">
                  Needs input
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
