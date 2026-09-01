import type { BbPluginApi, PluginAgentToolResult } from "@get-bb/plugin-sdk";
import {
  browserOperationSchema,
  executeBrowserOperation,
} from "./contracts.js";

const toolName = "bb_browser";

function errorResult(error: unknown): PluginAgentToolResult {
  return {
    content: [
      {
        type: "text",
        text: error instanceof Error ? error.message : String(error),
      },
    ],
    isError: true,
  };
}

export default function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    homepageUrl: {
      type: "string",
      label: "Default URL for new browser tabs",
      description:
        "Used when an agent opens a Browser tab without specifying a URL.",
      default: "https://www.google.com/",
    },
  });

  bb.agents.registerTool({
    name: toolName,
    description:
      "Create, inspect, and control visible BB Browser tabs in an explicitly selected client and panel owner.",
    instructions:
      "Call operation=list before every action. Operation=open can create the first visible tab in the current thread without an existing tab; omit url to open the configured default URL. Use its returned exact client/window/tab/navigation revision for later actions. Snapshot before ref actions, and never assume an active Browser tab. Navigation, interactions, screenshots, waits, diagnostics, and scripts run only through the visible native Browser service.",
    presentation: {
      label: {
        pending: "Controlling Browser",
        completed: "Controlled Browser",
      },
      icon: { glyph: "Globe" },
    },
    parameters: browserOperationSchema,
    async execute(operation, context) {
      try {
        const { homepageUrl } = await settings.get();
        const result = await executeBrowserOperation({
          browser: bb,
          context,
          defaultHomepageUrl: homepageUrl,
          operation,
        });
        return JSON.stringify(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  });

  bb.agents.configure(() => ({ tools: [toolName], skills: ["bb-browser"] }));
}
