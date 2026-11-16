import type { ExperimentalThreadTimelineFooterThreadBadgeProps } from "@get-bb/plugin-sdk";
import { ThreadRelationshipRow } from "@/components/promptbox/banner/ThreadRelationshipRow";
import { getThreadRoutePath } from "@/lib/route-paths";
import { useThreadTitleDisplayText } from "@/components/thread/ThreadTitleMentions";

export function ThreadBadge({
  threadId,
  projectId,
  title,
}: ExperimentalThreadTimelineFooterThreadBadgeProps) {
  const displayTitle = useThreadTitleDisplayText(title);
  return (
    <ThreadRelationshipRow
      title={title}
      href={getThreadRoutePath({ threadId, projectId })}
      label="Child"
      icon="UserRound"
      ariaLabel={`Child thread ${displayTitle}`}
    />
  );
}
