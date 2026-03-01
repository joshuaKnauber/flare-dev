import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const CDN_URL = "https://unpkg.com/flare-dev/dist/flare.js";
const LOCAL_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "dist/flare.js");
const SERVE_PATH = "/@flare/flare.js";

export default function flare() {
  const useLocal = existsSync(LOCAL_PATH);

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
      return [
        {
          tag: "script",
          attrs: { src: useLocal ? SERVE_PATH : CDN_URL },
          injectTo: "body",
        },
      ];
    },
  };
}
