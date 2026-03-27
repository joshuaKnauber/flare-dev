import { existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { basename, join } from "path";
import { createHash } from "crypto";
import { realpathSync } from "fs";

const CDN_URL = "https://unpkg.com/flare-dev/dist/flare.js";
const LOCAL_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "dist/flare.js");
const SERVE_PATH = "/@flare/flare.js";
const DEFAULT_BRIDGE_URL = "http://127.0.0.1:4318";

function sanitizeSlug(input) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "project"
  );
}

function getRepoInboxPath(projectRoot) {
  const resolvedRoot = realpathSync(projectRoot);
  const slug = sanitizeSlug(basename(resolvedRoot));
  const hash = createHash("sha256").update(resolvedRoot).digest("hex").slice(0, 12);
  return join(tmpdir(), "flare-dev", `${slug}-${hash}`);
}

export default function flare() {
  const useLocal = existsSync(LOCAL_PATH);
  const projectRoot = process.cwd();
  const bridgeConfig = {
    url: DEFAULT_BRIDGE_URL,
    projectRoot,
    inboxPath: getRepoInboxPath(projectRoot),
  };

  return {
    name: "flare",
    apply: "serve",

    // Serve the local build when available (monorepo dev)
    configureServer(server) {
      if (!useLocal) return;
      server.middlewares.use((req, res, next) => {
        if (req.url === SERVE_PATH) {
          res.setHeader("Content-Type", "application/javascript");
          res.end(readFileSync(LOCAL_PATH));
        } else {
          next();
        }
      });
    },

    transformIndexHtml() {
      const tags = [
        {
          tag: "script",
          attrs: { src: useLocal ? SERVE_PATH : CDN_URL },
          injectTo: "body",
        },
      ];

      tags.unshift({
        tag: "script",
        children: `window.__FLARE_BRIDGE__ = ${JSON.stringify(bridgeConfig)};`,
        injectTo: "head",
      });

      return tags;
    },
  };
}
