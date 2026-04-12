#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createBridgeServer } from "./bridge-server.js";
import { render } from "./render.js";
import { createWatcher } from "./watcher.js";

function getLocalVersion(): string {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function checkForUpdate(localVersion: string): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("https://registry.npmjs.org/flare-dev/latest", {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return;
    const data = (await res.json()) as { version?: string };
    const latest = data.version;
    if (!latest || latest === localVersion) return;

    // Simple semver comparison: split and compare numerically
    const parse = (v: string) => v.split(".").map(Number);
    const local = parse(localVersion);
    const remote = parse(latest);
    for (let i = 0; i < 3; i++) {
      if ((remote[i] ?? 0) > (local[i] ?? 0)) {
        process.stderr.write(
          `\nflare-dev is outdated (${localVersion} → ${latest}). Run \`npm install -D flare-dev@latest\` before continuing.\n\n`,
        );
        return;
      }
      if ((remote[i] ?? 0) < (local[i] ?? 0)) return;
    }
  } catch {
    // Network error — silently skip
  }
}

interface CliOptions {
  command: string | null;
  host: string;
  port: number;
  origin: string | null;
  file: string | null;
  selector: string | null;
  requestId: string | null;
  noSend: boolean;
}

function printHelp() {
  process.stdout.write(
    [
      "Usage:",
      "  flare-dev bridge [--host 127.0.0.1] [--port 4318]",
      "  flare-dev watch --origin http://localhost:3000",
      "  flare-dev render <file> --origin <url> --selector <sel> --request-id <id>",
      "  flare-dev render <file> --no-send",
      "",
      "Commands:",
      "  bridge   Start the local Flare bridge server",
      "  watch    Wait for pending inbox files for one app origin, print one JSON batch, and exit",
      "  render   Render variants and send to bridge (or --no-send to just output HTML)",
    ].join("\n") + "\n",
  );
}

function parseArgs(argv: string[]): CliOptions {
  const args = [...argv];
  const command = args.shift() ?? null;
  let host = "127.0.0.1";
  let port = 4318;
  let origin: string | null = null;
  let file: string | null = null;
  let selector: string | null = null;
  let requestId: string | null = null;
  let noSend = false;

  while (args.length > 0) {
    const current = args.shift();
    if (current === "--host") { host = args.shift() ?? host; continue; }
    if (current === "--port") { const raw = args.shift(); if (raw) port = Number.parseInt(raw, 10); continue; }
    if (current === "--origin") { origin = args.shift() ?? origin; continue; }
    if (current === "--selector") { selector = args.shift() ?? selector; continue; }
    if (current === "--request-id") { requestId = args.shift() ?? requestId; continue; }
    if (current === "--no-send") { noSend = true; continue; }
    if (current && !current.startsWith("--")) { file = current; continue; }
  }

  return { command, host, port, origin, file, selector, requestId, noSend };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.command || options.command === "--help" || options.command === "-h") {
    printHelp();
    process.exitCode = options.command ? 0 : 1;
    return;
  }

  if (!["bridge", "watch", "render"].includes(options.command)) {
    process.stderr.write(`Unknown command: ${options.command}\n`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (options.command === "render") {
    if (!options.file) {
      process.stderr.write("Usage: flare-dev render <file> --origin <url> --selector <sel> --request-id <id>\n");
      process.exitCode = 1;
      return;
    }
    if (options.noSend) {
      await render(options.file);
    } else {
      if (!options.origin || !options.selector || !options.requestId) {
        process.stderr.write("Missing required flags: --origin, --selector, --request-id\nUse --no-send to just output HTML.\n");
        process.exitCode = 1;
        return;
      }
      await render(options.file, {
        origin: options.origin,
        selector: options.selector,
        requestId: options.requestId,
        bridgeHost: options.host,
        bridgePort: options.port,
      });
    }
    return;
  }

  if (options.command === "watch") {
    if (!options.origin) {
      process.stderr.write("Missing required flag: --origin\n");
      printHelp();
      process.exitCode = 1;
      return;
    }
    const watcher = createWatcher({ origin: options.origin });
    await watcher.start();
    return;
  }

  const localVersion = getLocalVersion();

  const bridge = createBridgeServer({
    host: options.host,
    port: options.port,
  });
  const instance = await bridge.start();

  process.stdout.write(
    `Flare bridge v${localVersion} listening on http://${instance.host}:${instance.port}\n`,
  );

  void checkForUpdate(localVersion);

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
