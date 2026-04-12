import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { URL } from "node:url";
import type {
  AgentPushRequest,
  FlareSessionSnapshot,
} from "./bridge-types.js";
import { BRIDGE_TMP_ROOT, getOriginInboxPath } from "./inbox-path.js";

export interface BridgeServerOptions {
  host?: string;
  port?: number;
}

export interface BridgeServerInstance {
  host: string;
  port: number;
  close: () => Promise<void>;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function sendNoContent(res: ServerResponse) {
  res.statusCode = 204;
  res.end();
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return null;

  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

function isSourceFrame(value: unknown) {
  return typeof value === "string";
}

function isSnapshot(value: unknown): value is FlareSessionSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;

  return (
    typeof snapshot.updatedAt === "string" &&
    Array.isArray(snapshot.changes) &&
    snapshot.changes.every((change) => {
      if (!change || typeof change !== "object") return false;
      const item = change as Record<string, unknown>;
      return (
        typeof item.selector === "string" &&
        typeof item.path === "string" &&
        (!("textSnippet" in item) || typeof item.textSnippet === "string") &&
        (!("comment" in item) || typeof item.comment === "string") &&
        (!("source" in item) || isSourceFrame(item.source)) &&
        Array.isArray(item.changes) &&
        item.changes.every((entry) => {
          if (!entry || typeof entry !== "object") return false;
          const style = entry as Record<string, unknown>;
          return (
            typeof style.property === "string" &&
            typeof style.before === "string" &&
            typeof style.after === "string"
          );
        })
      );
    })
  );
}

function isAgentPushRequest(value: unknown): value is AgentPushRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.origin === "string" &&
    isSnapshot(request.snapshot)
  );
}

let _fileSeq = 0;
function toTimestampFileName(isoString: string) {
  return `${isoString.replace(/[:.]/g, "-")}-${_fileSeq++}.json`;
}

export function createBridgeServer(
  options: BridgeServerOptions = {},
): { start: () => Promise<BridgeServerInstance> } {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4318;

  const server = createServer(async (req, res) => {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (!req.url) {
        sendJson(res, 400, { error: "Missing request URL" });
        return;
      }

      if (req.method === "OPTIONS") {
        sendNoContent(res);
        return;
      }

      const url = new URL(req.url, `http://${host}:${port}`);

      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/agent/push") {
        const body = await readJson(req);
        if (!isAgentPushRequest(body)) {
          sendJson(res, 400, { error: "Invalid agent push payload" });
          return;
        }

        const origin = body.origin;
        const inboxPath = getOriginInboxPath(origin);
        mkdirSync(inboxPath, { recursive: true });
        const filePath = join(inboxPath, toTimestampFileName(new Date().toISOString()));
        writeFileSync(
          filePath,
          JSON.stringify({
            origin,
            snapshot: body.snapshot,
          }, null, 2),
        );
        process.stdout.write(
          `Received ${body.snapshot.changes.length} change${
            body.snapshot.changes.length === 1 ? "" : "s"
          } -> ${filePath}\n`,
        );

        sendJson(res, 202, {
          ok: true,
          inboxPath,
          filePath,
        });
        return;
      }
      // Agent posts DOM updates back to Flare
      if (req.method === "POST" && url.pathname === "/api/agent/respond") {
        const body = await readJson(req) as Record<string, unknown> | null;
        if (!body || typeof body.origin !== "string" || typeof body.selector !== "string" || typeof body.outerHTML !== "string") {
          sendJson(res, 400, { error: "Invalid respond payload — need origin, selector, outerHTML" });
          return;
        }
        const outboxPath = getOriginInboxPath(body.origin as string) + "-outbox";
        mkdirSync(outboxPath, { recursive: true });
        const filePath = join(outboxPath, toTimestampFileName(new Date().toISOString()));
        writeFileSync(filePath, JSON.stringify(body, null, 2));
        process.stdout.write(`Response for ${body.selector} -> ${filePath}\n`);
        sendJson(res, 202, { ok: true });
        return;
      }

      // Flare polls for pending DOM updates
      if (req.method === "GET" && url.pathname === "/api/agent/responses") {
        const origin = url.searchParams.get("origin");
        if (!origin) {
          sendJson(res, 400, { error: "Missing origin query param" });
          return;
        }
        const outboxPath = getOriginInboxPath(origin) + "-outbox";
        if (!existsSync(outboxPath)) {
          sendJson(res, 200, { responses: [] });
          return;
        }
        const files = readdirSync(outboxPath).filter((n) => n.endsWith(".json")).sort();
        const responses = files.map((name) => {
          const fp = join(outboxPath, name);
          const data = JSON.parse(readFileSync(fp, "utf8"));
          unlinkSync(fp);
          return data;
        });
        sendJson(res, 200, { responses });
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "Unknown bridge error",
      });
    }
  });

  return {
    async start() {
      rmSync(BRIDGE_TMP_ROOT, { recursive: true, force: true });
      mkdirSync(BRIDGE_TMP_ROOT, { recursive: true });

      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      });

      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Failed to resolve bridge address");
      }

      const info = address as AddressInfo;
      return {
        host,
        port: info.port,
        close: () =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve();
            });
          }),
      };
    },
  };
}
