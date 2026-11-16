import type { ReactNode } from "react";
import type { ThreadRuntimeDisplayStatus } from "@bb/domain";
import { usePluginSlots } from "@/lib/plugin-slots";
import { resolveReplacement } from "@/lib/plugin-slot-resolvers";
import { ThreadBadge } from "@/components/thread/timeline/ThreadBadge";
import { PluginReplacementSlot } from "./PluginReplacementSlot";

export function PluginThreadTimelineFooter({
  threadId,
  projectId,
  runtimeDisplayStatus,
  children,
}: {
  threadId: string;
  projectId: string;
  runtimeDisplayStatus: ThreadRuntimeDisplayStatus;
  children: ReactNode;
}) {
  const { threadTimelineFooters } = usePluginSlots();
  return (
    <PluginReplacementSlot
      key={threadId}
      original={children}
      replacement={resolveReplacement(threadTimelineFooters)}
      slotKind="threadTimelineFooter"
      instanceId={threadId}
      crashFallback={
        <p role="status" className="my-4 text-sm text-muted-foreground">
          Thread activity unavailable.
        </p>
      }
    >
      {(slot, Original) => {
        const Component = slot.component;
        return (
          <div role="group" aria-label={slot.title}>
            <Component
              threadId={threadId}
              projectId={projectId}
              runtimeDisplayStatus={runtimeDisplayStatus}
              Original={Original}
              ThreadBadge={ThreadBadge}
            />
          </div>
        );
      }}
    </PluginReplacementSlot>
  );
}
