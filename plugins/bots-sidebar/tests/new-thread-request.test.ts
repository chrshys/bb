import { describe, expect, it } from "vitest";
import { newThreadRequestSchema } from "../lib/new-thread-request";
import { request } from "./fixtures";

describe("provider environment request validation", () => {
  it("defaults omitted provider inputs to null like the host contract", () => {
    const environment = { type: "provider", environmentProviderId: "workspace", machine: { type: "new", machineProviderId: "machines" } };
    expect(newThreadRequestSchema.parse({ ...request, environment }).environment).toEqual({
      ...environment, inputs: null, machine: { ...environment.machine, inputs: null },
    });
  });

  it.each([
    { type: "existing" },
    { type: "existing", hostId: "" },
    { type: "new", inputs: null },
    { type: "unexpected", hostId: "host" },
  ])("still rejects malformed machine selections (%j)", (machine) => {
    expect(newThreadRequestSchema.safeParse({ ...request, environment: {
      type: "provider", environmentProviderId: "workspace", inputs: null, machine,
    } }).success).toBe(false);
  });
});


describe("attachment request validation", () => {
  it.each([
    { type: "localImage", path: "screenshot.png", sourceProjectId: "proj-source" },
    { type: "localFile", path: "report.pdf", sourceProjectId: "proj-source", name: "report.pdf", mimeType: "application/pdf", sizeBytes: 42 },
    { type: "localImage", path: "/tmp/screenshot.png", hostId: "host-source" },
    { type: "localFile", path: "/tmp/report.pdf", hostId: "host-source" },
  ])("preserves native attachment provenance (%j)", (attachment) => {
    const input = [...request.input, attachment];
    expect(newThreadRequestSchema.parse({ ...request, input }).input).toEqual(input);
  });

  it.each([
    { type: "localImage", path: "screenshot.png", sourceProjectId: "" },
    { type: "localFile", path: "report.pdf", hostId: 42 },
    { type: "localImage", path: "screenshot.png", unexpected: true },
  ])("rejects invalid attachment fields (%j)", (attachment) => {
    expect(newThreadRequestSchema.safeParse({ ...request, input: [attachment] }).success).toBe(false);
  });
});
