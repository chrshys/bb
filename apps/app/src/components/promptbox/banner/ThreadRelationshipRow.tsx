import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
import { ThreadTitle } from "@/components/thread/ThreadTitleMentions";
import {
  PromptStackCard,
  PROMPT_CONTEXT_BANNER_COLLAPSED_HEIGHT,
  PROMPT_STACK_INLAY_INSET_CLASS,
  PROMPT_STACK_INLAY_SEGMENT_CLASS,
} from "./PromptStackCard";

export const THREAD_RELATIONSHIP_TITLE_CLASS =
  "text-foreground/90 underline underline-offset-2";

interface ThreadRelationshipLinkProps {
  title: string;
  href: string;
  label: string;
  icon: IconName;
  ariaLabel: string;
}

export function ThreadRelationshipLink({
  title,
  href,
  label,
  icon,
  ariaLabel,
}: ThreadRelationshipLinkProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-xs",
        PROMPT_STACK_INLAY_SEGMENT_CLASS,
      )}
      title={ariaLabel}
    >
      <Icon name={icon} className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">
        {label}{" "}
        <NavLink to={href}>
          <ThreadTitle
            title={title}
            className={THREAD_RELATIONSHIP_TITLE_CLASS}
            inline
          />
        </NavLink>
      </span>
    </div>
  );
}

export function ThreadRelationshipRow(props: ThreadRelationshipLinkProps) {
  return (
    <PromptStackCard
      className="w-full overflow-hidden"
      style={{ minHeight: PROMPT_CONTEXT_BANNER_COLLAPSED_HEIGHT }}
    >
      <div
        className={cn(
          "flex items-center gap-0.5 text-xs text-muted-foreground",
          PROMPT_STACK_INLAY_INSET_CLASS,
        )}
      >
        <ThreadRelationshipLink {...props} />
      </div>
    </PromptStackCard>
  );
}
