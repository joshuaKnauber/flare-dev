import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getOriginInboxPath } from "./inbox-path.js";

export interface WatcherOptions {
  origin: string;
  pollMs?: number;
}

export interface WatcherInstance {
  start: () => Promise<void>;
  inboxPath: string;
}

interface WatchEvent {
  type: "watch.batch";
  inboxPath?: string;
  files: Array<{
    filePath: string;
    payload: unknown;
  }>;
}

function writeEvent(event: WatchEvent) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

export function createWatcher(options: WatcherOptions): WatcherInstance {
  const inboxPath = getOriginInboxPath(options.origin);
  const pollMs = options.pollMs ?? 500;

  const readPendingFiles = () => {
    if (!existsSync(inboxPath)) {
      mkdirSync(inboxPath, { recursive: true });
      return [];
    }

    return readdirSync(inboxPath)
      .filter((name) => name.endsWith(".json"))
      .sort();
  };

  return {
    inboxPath,
    async start() {
      while (true) {
        const files = readPendingFiles();
        if (files.length > 0) {
          writeEvent({
            type: "watch.batch",
            inboxPath,
            files: files.map((name) => {
              const filePath = join(inboxPath, name);
              return {
                filePath,
                payload: JSON.parse(readFileSync(filePath, "utf8")),
              };
            }),
          });
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
    },
  };
}
