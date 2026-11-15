import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getProject, getThread } from "@bb/db";
import { describe, expect, it, vi } from "vitest";
import { withTestHarness, type TestAppHarness } from "../helpers/test-app.js";
import {
  seedEnvironment,
  seedHostSession,
  seedProjectWithSource,
  seedThread,
} from "../helpers/seed.js";

async function installProtection(harness: TestAppHarness, threadId: string) {
  const root = join(harness.config.dataDir, "close-protection");
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "bb-plugin-close-protection",
      version: "1.0.0",
      bb: {
        name: "Close protection",
        description: "Lifecycle fixture",
        branding: { icon: "Zap" },
        server: "./server.ts",
      },
    }),
  );
  const source = (body: string) => `export default function(bb) { ${body} }`;
  const registration = `const registration = bb.experimental_threadCloseProtection.register({ id: "coordinator", resolve: id => id === ${JSON.stringify(threadId)} ? "Persistent coordinator" : null });`;
  await writeFile(
    join(root, "server.ts"),
    source(
      `${registration} bb.http.route("POST", "/release", c => { registration.dispose(); registration.dispose(); return c.json({ok:true}); });`,
    ),
  );
  await harness.pluginService.installPath(root);
  return { root, source, registration };
}

describe("thread close protection", () => {
  it.each(["archive", "delete", "environment", "project"] as const)(
    "rejects %s atomically before touching an owner or lifecycle dependent",
    async (operation) => {
      await withTestHarness(async (harness) => {
        const { host } = seedHostSession(harness.deps);
        const { project } = seedProjectWithSource(harness.deps, {
          hostId: host.id,
        });
        const environment = seedEnvironment(harness.deps, {
          hostId: host.id,
          projectId: project.id,
        });
        const parent = seedThread(harness.deps, {
          projectId: project.id,
          environmentId: environment.id,
        });
        const child = seedThread(harness.deps, {
          projectId: project.id,
          lifecycleOwnerThreadId: parent.id,
        });
        const sibling = seedThread(harness.deps, {
          projectId: project.id,
          environmentId: environment.id,
        });
        await installProtection(harness, child.id);
        const summary = await harness.app.request(
          `/api/v1/threads/${parent.id}/child-summary`,
        );
        expect(await summary.json()).toMatchObject({
          archiveProtectionReason: "Persistent coordinator",
          deleteProtectionReason: "Persistent coordinator",
        });
        const path =
          operation === "project"
            ? `/api/v1/projects/${project.id}`
            : operation === "environment"
              ? `/api/v1/environments/${environment.id}/archive-threads`
              : `/api/v1/threads/${parent.id}${operation === "archive" ? "/archive-all" : ""}`;
        const response = await harness.app.request(path, {
          method:
            operation === "delete" || operation === "project"
              ? "DELETE"
              : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ childThreadsConfirmed: true }),
        });
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
          code: "thread_close_protected",
          message: "Persistent coordinator",
        });
        for (const thread of [parent, child, sibling]) {
          expect(getThread(harness.db, thread.id)).toMatchObject({
            archivedAt: null,
            deletedAt: null,
            status: "idle",
          });
        }
        expect(getProject(harness.db, project.id)?.deletedAt).toBeNull();
        const ordinary = await harness.app.request(
          `/api/v1/threads/${sibling.id}/archive-all`,
          { method: "POST" },
        );
        expect(ordinary.status).toBe(200);
      });
    },
  );

  it("protects assigned descendants and hidden source threads during ancestor archive", async () => {
    await withTestHarness(async (harness) => {
      const { host } = seedHostSession(harness.deps);
      const { project } = seedProjectWithSource(harness.deps, {
        hostId: host.id,
      });
      const parent = seedThread(harness.deps, { projectId: project.id });
      const child = seedThread(harness.deps, {
        projectId: project.id,
        parentThreadId: parent.id,
      });
      const hidden = seedThread(harness.deps, {
        projectId: project.id,
        sourceThreadId: child.id,
        visibility: "hidden",
      });
      await installProtection(harness, hidden.id);
      const response = await harness.app.request(
        `/api/v1/threads/${parent.id}/archive-all`,
        { method: "POST" },
      );
      expect(response.status).toBe(409);
      for (const thread of [parent, child, hidden])
        expect(getThread(harness.db, thread.id)?.archivedAt).toBeNull();
    });
  });

  it("keeps old protection after failed reload and releases on explicit disposal or successful replacement", async () => {
    await withTestHarness(async (harness) => {
      const { host } = seedHostSession(harness.deps);
      const { project } = seedProjectWithSource(harness.deps, {
        hostId: host.id,
      });
      const thread = seedThread(harness.deps, { projectId: project.id });
      const { root, source, registration } = await installProtection(
        harness,
        thread.id,
      );
      const archive = () =>
        harness.app.request(`/api/v1/threads/${thread.id}/archive-all`, {
          method: "POST",
        });
      await writeFile(
        join(root, "server.ts"),
        source(`${registration} throw new Error("failed replacement");`),
      );
      expect((await harness.pluginService.reload("close-protection")).ok).toBe(
        false,
      );
      expect((await archive()).status).toBe(409);
      const release = await harness.app.request(
        "/api/v1/plugins/close-protection/http/release",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      expect(release.status).toBe(200);
      expect((await archive()).status).toBe(200);
      await harness.app.request(`/api/v1/threads/${thread.id}/unarchive`, {
        method: "POST",
      });
      await writeFile(join(root, "server.ts"), source(registration));
      expect((await harness.pluginService.reload("close-protection")).ok).toBe(
        true,
      );
      expect((await archive()).status).toBe(409);
      await writeFile(join(root, "server.ts"), source(""));
      expect((await harness.pluginService.reload("close-protection")).ok).toBe(
        true,
      );
      expect((await archive()).status).toBe(200);
    });
  });
  it.each([
    "throw new Error('resolver failed')",
    "return Promise.resolve(null)",
    "return Promise.reject(new Error('async resolver failed'))",
    "return ''",
  ])("fails closed for an invalid resolver: %s", async (body) => {
    await withTestHarness(async (harness) => {
      const { host } = seedHostSession(harness.deps);
      const { project } = seedProjectWithSource(harness.deps, {
        hostId: host.id,
      });
      const thread = seedThread(harness.deps, { projectId: project.id });
      const { root, source } = await installProtection(harness, thread.id);
      await writeFile(
        join(root, "server.ts"),
        source(
          `bb.experimental_threadCloseProtection.register({ id: "broken", resolve() { ${body} } });`,
        ),
      );
      expect((await harness.pluginService.reload("close-protection")).ok).toBe(
        true,
      );
      expect(
        (
          await harness.app.request(
            `/api/v1/threads/${thread.id}/archive-all`,
            { method: "POST" },
          )
        ).status,
      ).toBe(409);
      expect(getThread(harness.db, thread.id)?.archivedAt).toBeNull();
      await harness.pluginService.remove("close-protection");
      expect(
        (
          await harness.app.request(
            `/api/v1/threads/${thread.id}/archive-all`,
            { method: "POST" },
          )
        ).status,
      ).toBe(200);
    });
  });
  it("keeps replacement protection active while old disposal awaits", async () => {
    await withTestHarness(async (harness) => {
      const { host } = seedHostSession(harness.deps);
      const { project } = seedProjectWithSource(harness.deps, {
        hostId: host.id,
      });
      const thread = seedThread(harness.deps, { projectId: project.id });
      const { root, source, registration } = await installProtection(
        harness,
        thread.id,
      );
      const entered = join(root, "disposing");
      const release = join(root, "release");
      await writeFile(
        join(root, "server.ts"),
        `import { existsSync, writeFileSync } from "node:fs"; ` +
          source(
            `${registration} bb.onDispose(async () => { registration.dispose(); writeFileSync(${JSON.stringify(entered)}, ""); while (!existsSync(${JSON.stringify(release)})) await new Promise(resolve => setTimeout(resolve, 5)); });`,
          ),
      );
      expect((await harness.pluginService.reload("close-protection")).ok).toBe(
        true,
      );
      await writeFile(join(root, "server.ts"), source(registration));
      const reloading = harness.pluginService.reload("close-protection");
      try {
        await vi.waitFor(() => expect(existsSync(entered)).toBe(true));
        expect(
          (
            await harness.app.request(
              `/api/v1/threads/${thread.id}/archive-all`,
              { method: "POST" },
            )
          ).status,
        ).toBe(409);
        expect(getThread(harness.db, thread.id)?.archivedAt).toBeNull();
      } finally {
        await writeFile(release, "");
        expect((await reloading).ok).toBe(true);
      }
    });
  });
});
