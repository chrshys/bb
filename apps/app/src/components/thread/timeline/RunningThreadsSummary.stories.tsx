import { useState } from "react";
import { makeThreadListEntry } from "@bb/test-helpers/domain-fixtures";
import { RunningThreadsSummary } from "./RunningThreadsSummary";
import { StoryCard } from "../../../../.ladle/story-card";

export default { title: "thread/Running threads" };

const threads = [
  makeThreadListEntry({
    id: "research",
    title: "Research native BB components",
    parentThreadId: "orchestrator",
    runtime: { displayStatus: "active" },
  }),
  makeThreadListEntry({
    id: "review",
    title: "Review the implementation and verify the orchestrator experience",
    parentThreadId: "orchestrator",
    hasPendingInteraction: true,
  }),
  makeThreadListEntry({
    id: "design",
    title: "Polish the layout",
    parentThreadId: "orchestrator",
    runtime: { displayStatus: "active" },
  }),
];

export const RunningThreads = () => {
  const [active, setActive] = useState(true);
  return (
    <StoryCard>
      <button type="button" onClick={() => setActive((value) => !value)}>
        {active ? "Finish threads" : "Start threads"}
      </button>
      <div className="max-w-xl">
        <p>
          The research and review are underway. I’ll bring the results together
          here.
        </p>
        <RunningThreadsSummary
          threads={
            active
              ? threads
              : threads.map((thread) => ({
                  ...thread,
                  runtime: { ...thread.runtime, displayStatus: "idle" },
                  hasPendingInteraction: false,
                }))
          }
        />
      </div>
    </StoryCard>
  );
};
