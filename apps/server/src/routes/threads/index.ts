import type { PluginService } from "../../services/plugins/plugin-service.js";
import type { Hono } from "hono";
import type { AppDeps } from "../../types.js";
import { registerThreadActionRoutes } from "./actions.js";
import { registerThreadBaseRoutes } from "./base.js";
import { registerThreadDataRoutes } from "./data.js";
import { registerThreadInteractionRoutes } from "./interactions.js";
import { registerThreadTabRoutes } from "./tabs.js";

export function registerThreadRoutes(
  app: Hono,
  deps: AppDeps,
  plugins?: Pick<PluginService, "resolveRpcCaller">,
): void {
  registerThreadBaseRoutes(app, deps);
  registerThreadActionRoutes(app, deps, plugins);
  registerThreadDataRoutes(app, deps);
  registerThreadInteractionRoutes(app, deps);
  registerThreadTabRoutes(app, deps);
}
