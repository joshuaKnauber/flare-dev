#!/usr/bin/env node

import { createBridgeServer } from "./bridge-server.js";
import { createWatcher } from "./watcher.js";

interface CliOptions {
  command: string | null;
  host: string;
  port: number;
  projectRoot: string;
}

function printHelp() {
  process.stdout.write(
    [
      "Usage:",
      "  flare-dev bridge [--host 127.0.0.1] [--port 4318]",
      "  flare-dev watch [--project-root /path/to/repo]",
      "",
      "Commands:",
      "  bridge   Start the local Flare bridge server",
      "  watch    Wait for pending inbox files for the current repo, print one JSON batch, and exit",
    ].join("\n") + "\n",
  );
}

function parseArgs(argv: string[]): CliOptions {
  const args = [...argv];
  const command = args.shift() ?? null;
  let host = "127.0.0.1";
  let port = 4318;
  let projectRoot = process.cwd();

  while (args.length > 0) {
    const current = args.shift();
    if (current === "--host") {
      host = args.shift() ?? host;
      continue;
    }
    if (current === "--port") {
      const raw = args.shift();
      if (raw) port = Number.parseInt(raw, 10);
      continue;
    }
    if (current === "--project-root") {
      projectRoot = args.shift() ?? projectRoot;
      continue;
    }
  }

  return { command, host, port, projectRoot };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.command || options.command === "--help" || options.command === "-h") {
    printHelp();
    process.exitCode = options.command ? 0 : 1;
    return;
  }

  if (!["bridge", "watch"].includes(options.command)) {
    process.stderr.write(`Unknown command: ${options.command}\n`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (options.command === "watch") {
    const watcher = createWatcher({ projectRoot: options.projectRoot });
    await watcher.start();
    return;
  }

  const bridge = createBridgeServer({
    host: options.host,
    port: options.port,
  });
  const instance = await bridge.start();

  process.stdout.write(
    `Flare bridge listening on http://${instance.host}:${instance.port}\n`,
  );

  const shutdown = async () => {
    await instance.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exit(1);
});
