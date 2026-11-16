import { useId, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { durationToCompactString } from "@bb/thread-view";
import { useResizeObserver } from "usehooks-ts";
import { AnimatedBody } from "./AnimatedBody";
import {
  PROMPT_STACK_CARD_ROW_HEIGHT,
  PromptStackCard,
} from "./PromptStackCard";
import { useSecondTick } from "@/hooks/useSecondTick";
import { Icon, type IconName } from "@bb/shared-ui/icon";
import { useIsCompactViewport } from "@bb/shared-ui/hooks/use-compact-viewport";
import {
  activityIconClass,
  activityMetaClass,
  activityRowClass,
  activityTextClass,
} from "@bb/shared-ui/activity-row-styles";
import { cn } from "@bb/shared-ui/lib/utils";

const COMPACT_PROMPT_SHELL_MAX_WIDTH_REM = 34;
const DEFAULT_ROOT_FONT_SIZE_PX = 16;

function isCompactPromptShellWidth(width: number): boolean {
  const parsedRootFontSize =
    typeof window === "undefined"
      ? Number.NaN
      : Number.parseFloat(
          window.getComputedStyle(document.documentElement).fontSize,
        );
  const rootFontSize = Number.isFinite(parsedRootFontSize)
    ? parsedRootFontSize
    : DEFAULT_ROOT_FONT_SIZE_PX;
  return width <= COMPACT_PROMPT_SHELL_MAX_WIDTH_REM * rootFontSize;
}

export interface PromptActivityItem {
  id: string;
  description: string;
  icon: IconName;
  label: string;
  runningPrefix: string;
  model: string | null;
  startedAt: number | null;
  href: string | null;
  needsInput: boolean;
}

function activityAriaLabel(row: PromptActivityItem, label = row.label): string {
  return row.model
    ? `${label}: ${row.description} · Model ${row.model}`
    : `${label}: ${row.description}`;
}

function ActivityDuration({ startedAt }: { startedAt: number }) {
  const elapsed = useSecondTick() - startedAt;
  if (elapsed <= 1_000) {
    return null;
  }
  return (
    <span className="tabular-nums">{durationToCompactString(elapsed)}</span>
  );
}

function ActivitySummary({
  row,
  showDuration,
  active = false,
}: {
  row: PromptActivityItem;
  showDuration: boolean;
  active?: boolean;
}) {
  const model = row.model;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1 text-left">
      <span
        className={cn(
          "shrink-0 whitespace-nowrap",
          active ? activityMetaClass("active") : "text-muted-foreground",
        )}
      >
        {row.runningPrefix}
      </span>
      <span
        className={cn(
          "min-w-0 truncate",
          active
            ? activityTextClass("active")
            : "font-medium text-foreground opacity-70",
        )}
        title={row.description}
      >
        {row.description}
      </span>
      {model ? (
        <span
          className={cn(
            "shrink-0 whitespace-nowrap font-mono text-2xs",
            active ? activityMetaClass("active") : "text-subtle-foreground",
          )}
          title={`Model: ${model}`}
        >
          {model}
        </span>
      ) : null}
      {showDuration && row.startedAt !== null ? (
        <span
          className={cn(
            "shrink-0",
            active ? activityMetaClass("active") : "text-muted-foreground",
          )}
        >
          <ActivityDuration startedAt={row.startedAt} />
        </span>
      ) : null}
    </span>
  );
}

export function PromptActivityCard({
  items,
  groupLabel,
  compactLabel,
  summaryLabel,
  isExpanded,
  onToggle,
}: {
  items: readonly PromptActivityItem[];
  groupLabel: string;
  compactLabel: string;
  summaryLabel: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  const bodyId = `${id}-body`;
  const toggleId = `${id}-toggle`;
  const isCompactViewport = useIsCompactViewport();
  const cardRef = useRef<HTMLElement>(null!);
  const [isCompactCard, setIsCompactCard] = useState<boolean | null>(null);
  useResizeObserver({
    ref: cardRef,
    box: "border-box",
    onResize: ({ width }) => {
      if (width === undefined) return;
      const nextIsCompact = isCompactPromptShellWidth(width);
      setIsCompactCard((previous) =>
        previous === nextIsCompact ? previous : nextIsCompact,
      );
    },
  });
  const primary = items[0];
  if (!primary) {
    return null;
  }
  const others = items.slice(1);
  const hasMore = others.length > 0;
  const useCompactSummary = isCompactCard ?? isCompactViewport;
  const canExpand = hasMore || useCompactSummary || primary.href !== null;
  const expandedRows =
    useCompactSummary || primary.href !== null ? items : others;
  const active = !primary.needsInput;

  return (
    <PromptStackCard
      rootRef={cardRef}
      ariaLabel={groupLabel}
      className="overflow-hidden"
      style={{ minHeight: PROMPT_STACK_CARD_ROW_HEIGHT }}
    >
      <div className="flex items-center">
        {canExpand ? (
          <button
            type="button"
            id={toggleId}
            aria-expanded={isExpanded}
            aria-controls={bodyId}
            aria-label={
              useCompactSummary
                ? compactLabel
                : activityAriaLabel(primary, summaryLabel)
            }
            onClick={onToggle}
            className={activityRowClass(
              active ? "active" : "pending",
              "flex min-h-8 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-none px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-background/80",
            )}
          >
            <Icon
              name={primary.icon}
              className={activityIconClass(
                active ? "active" : "pending",
                "size-3.5 shrink-0",
              )}
              aria-hidden="true"
            />
            {useCompactSummary ? (
              <span className="min-w-0 flex-1 truncate text-left font-medium">
                {compactLabel}
              </span>
            ) : (
              <>
                <ActivitySummary
                  row={primary}
                  showDuration={false}
                  active={active}
                />
                {hasMore ? (
                  <span className="shrink-0 rounded-full bg-state-hover px-1 text-2xs text-muted-foreground">
                    +{others.length}
                  </span>
                ) : null}
              </>
            )}
            <Icon
              name="ChevronDown"
              className={cn(
                activityIconClass(active ? "active" : "pending"),
                "size-3.5 shrink-0 transition-transform duration-200",
                isExpanded && "hidden",
              )}
              aria-hidden="true"
            />
          </button>
        ) : (
          <div
            className={activityRowClass(
              active ? "active" : "pending",
              "flex min-h-8 w-full min-w-0 cursor-default items-center gap-1.5 rounded-none px-3 py-1.5 text-xs text-foreground",
            )}
            aria-label={activityAriaLabel(primary)}
          >
            <Icon
              name={primary.icon}
              className={activityIconClass(
                active ? "active" : "pending",
                "size-3.5 shrink-0",
              )}
              aria-hidden="true"
            />
            <ActivitySummary row={primary} showDuration active={active} />
          </div>
        )}
      </div>
      {canExpand ? (
        <AnimatedBody
          id={bodyId}
          labelledBy={toggleId}
          isExpanded={isExpanded}
          collapsedBorder="none"
        >
          <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto py-1">
            {expandedRows.map((row) => {
              const model = row.model;
              return (
                <div
                  key={row.id}
                  className={cn(
                    "flex min-w-0 gap-1.5 px-3 py-0.5 text-xs",
                    useCompactSummary ? "items-start" : "items-center",
                  )}
                >
                  <Icon
                    name={row.icon}
                    className="size-3.5 shrink-0 text-muted-foreground/60"
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-muted-foreground",
                      useCompactSummary
                        ? "whitespace-normal [overflow-wrap:anywhere]"
                        : "truncate",
                    )}
                    title={row.description}
                  >
                    {row.href ? (
                      <NavLink
                        to={row.href}
                        className="hover:underline focus-visible:underline"
                      >
                        {row.description}
                      </NavLink>
                    ) : (
                      row.description
                    )}
                  </span>
                  {model ? (
                    <span
                      className="shrink-0 whitespace-nowrap font-mono text-2xs text-subtle-foreground"
                      title={`Model: ${model}`}
                    >
                      {model}
                    </span>
                  ) : null}
                  <span className="shrink-0 whitespace-nowrap text-subtle-foreground">
                    {row.needsInput ? (
                      "Needs input"
                    ) : isExpanded && row.startedAt !== null ? (
                      <ActivityDuration startedAt={row.startedAt} />
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            aria-label={`Collapse ${groupLabel.toLowerCase()}`}
            onClick={onToggle}
            className="flex w-full justify-center py-1 text-muted-foreground hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Icon name="ChevronUp" className="size-3.5" aria-hidden="true" />
          </button>
        </AnimatedBody>
      ) : null}
    </PromptStackCard>
  );
}
