import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createServer as createHttpServer, Agent } from "node:http";
import httpProxy from "http-proxy-3";
import { resolve } from "node:path";
import {
  resolveCurrentDevInstanceConfig,
  toDevProcessEnv,
  parsePortValue,
} from "../packages/config/src/runtime.ts";

const root = process.cwd();
const config = resolveCurrentDevInstanceConfig(root);
config.dataDir = resolve(root, ".bbc-preview");
const previewPort = parsePortValue({
  name: "preview port",
  rawPort: process.argv[2],
});
for (const port of [
  previewPort,
  config.ports.appPort,
  config.ports.serverPort,
  config.ports.hostDaemonPort,
]) {
  await new Promise((accept, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(accept));
  });
}
const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("BB_")),
);
const env = toDevProcessEnv({ baseEnv, config });
env.BB_DEV_APP_HOST = "127.0.0.1";
env.BB_SERVER_BIND_HOST = "127.0.0.1";
env.BB_TELEMETRY = "false";
env.BB_APP_URL = new URL(process.argv[3]).origin;
await mkdir(config.dataDir, { recursive: true });
await writeFile(
  resolve(config.dataDir, "bb-dev-instance.json"),
  JSON.stringify({ repoRoot: root }),
);
console.log(JSON.stringify({ dataDir: config.dataDir, ports: config.ports }));
const proxy = httpProxy.createProxyServer({
  target: `http://127.0.0.1:${config.ports.appPort}`,
  ws: true,
  agent: new Agent({ keepAlive: true, maxSockets: 16 }),
});
proxy.on("error", (error, request, response) => {
  if ("writeHead" in response && !response.headersSent) response.writeHead(502);
  response.end();
});
const server = createHttpServer((request, response) =>
  proxy.web(request, response),
);
server.on("upgrade", (request, socket, head) =>
  proxy.ws(request, socket, head),
);
server.listen(previewPort, "127.0.0.1");
const child = spawn(
  "pnpm",
  [
    "exec",
    "turbo",
    "run",
    "dev",
    "--filter=@bb/app",
    "--filter=@bb/server",
    "--filter=@bb/host-daemon",
    "--env-mode=loose",
    "--concurrency=20",
    "--ui=stream",
  ],
  { cwd: root, env, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  server.close();
  proxy.close();
  process.exitCode = code ?? 1;
});
