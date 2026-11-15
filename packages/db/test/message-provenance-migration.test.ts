import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { PERSONAL_PROJECT_ID } from "@bb/domain";
import {
  createConnection,
  createQueuedThreadMessage,
  createThread,
  listQueuedThreadMessages,
  migrate,
  noopNotifier,
} from "../src/index.js";

it("keeps legacy queue origin unknown on upgrade and persists new provenance across reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "bb-message-provenance-"));
  const filename = join(directory, "test.db");
  let db = createConnection(filename);
  try {
    migrate(db);
    const thread = createThread(db, noopNotifier, {
      projectId: PERSONAL_PROJECT_ID,
      providerId: "test",
      status: "idle",
    });
    const queue = (
      humanMessagePresentation?: boolean,
      systemInitiated?: boolean,
    ) =>
      createQueuedThreadMessage(db, noopNotifier, {
        threadId: thread.id,
        content: [
          { type: "text", text: "same ambiguous content", mentions: [] },
        ],
        humanMessagePresentation,
        systemInitiated,
        model: "test",
        reasoningLevel: "medium",
        permissionMode: "auto",
        serviceTier: "default",
        waitingOn: { kind: "time" },
        sendAt: Date.now() + 60_000,
        payload: { kind: "inline" },
        systemNotice: null,
      });
    const legacy = queue();
    db.$client.exec(
      "ALTER TABLE queued_thread_messages DROP COLUMN human_message_presentation; ALTER TABLE queued_thread_messages DROP COLUMN system_initiated; DELETE FROM __drizzle_migrations WHERE created_at = (SELECT MAX(created_at) FROM __drizzle_migrations)",
    );
    db.$client.close();
    db = createConnection(filename);
    migrate(db);
    const upgraded = listQueuedThreadMessages(db, thread.id);
    expect(upgraded).toHaveLength(1);
    expect(upgraded[0]).toMatchObject({
      id: legacy.id,
      content: legacy.content,
      senderThreadId: null,
      humanMessagePresentation: null,
      systemInitiated: false,
    });
    const human = queue(true);
    const system = queue(undefined, true);
    db.$client.close();
    db = createConnection(filename);
    migrate(db);
    expect(listQueuedThreadMessages(db, thread.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: legacy.id,
          humanMessagePresentation: null,
          systemInitiated: false,
        }),
        expect.objectContaining({
          id: human.id,
          humanMessagePresentation: true,
          systemInitiated: false,
        }),
        expect.objectContaining({
          id: system.id,
          humanMessagePresentation: null,
          systemInitiated: true,
        }),
      ]),
    );
  } finally {
    db.$client.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
