/**
 * `flare-dev render <variants-file> --origin <url> --selector <sel> --request-id <id>`
 *
 * Renders variant components to static HTML and sends each to the bridge
 * along with the component source code (for the "choose variant" flow).
 *
 * The agent is responsible for rendering correctly for the project's framework.
 * This command handles the default case (React via npx tsx). The agent can
 * adapt or use its own rendering approach if needed.
 *
 * With --no-send, just prints discovered export names.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import http from "node:http";

/** Scan a file for `export function Variant*` declarations */
function discoverExports(source: string): string[] {
  const re = /export\s+(?:function|const)\s+(Variant\w+)/g;
  const names: string[] = [];
  let m;
  while ((m = re.exec(source)) !== null) names.push(m[1]);
  return names.sort();
}

/** Extract a single export's source from the full file */
function extractExportSource(source: string, name: string): string {
  const re = new RegExp(
    `(export\\s+(?:function|const)\\s+${name}[\\s\\S]*?)(?=export\\s+(?:function|const)\\s+Variant|$)`,
  );
  const m = re.exec(source);
  return m ? m[1].trim() : "";
}

function buildRenderScript(absVariantsPath: string): string {
  return `
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as V from ${JSON.stringify(absVariantsPath)};

const variants = Object.entries(V)
  .filter(([k]) => k.startsWith("Variant"))
  .sort(([a], [b]) => a.localeCompare(b));

for (const [name, Component] of variants) {
  process.stdout.write(\`<!--VARIANT_START:\${name}-->\\n\${renderToStaticMarkup(React.createElement(Component))}\\n<!--VARIANT_END:\${name}-->\\n\`);
}
`;
}

function parseVariants(output: string): { name: string; html: string }[] {
  const variants: { name: string; html: string }[] = [];
  const regex = /<!--VARIANT_START:(\w+)-->\n([\s\S]*?)<!--VARIANT_END:\1-->/g;
  let match;
  while ((match = regex.exec(output)) !== null) {
    variants.push({ name: match[1], html: match[2].trim() });
  }
  return variants;
}

function postToBridge(
  host: string,
  port: number,
  path: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; body: string }> {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: host, port, path, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
      (res) => {
        let buf = "";
        res.on("data", (chunk: string) => { buf += chunk; });
        res.on("end", () => resolve({ ok: res.statusCode === 200 || res.statusCode === 202, status: res.statusCode ?? 0, body: buf }));
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

export interface SendOptions {
  origin: string;
  selector: string;
  requestId: string;
  bridgeHost?: string;
  bridgePort?: number;
}

export async function render(filePath: string, send?: SendOptions): Promise<void> {
  const cwd = process.cwd();
  const absPath = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);

  let source: string;
  try {
    source = readFileSync(absPath, "utf-8");
  } catch {
    process.stderr.write(`File not found: ${absPath}\n`);
    process.exitCode = 1;
    return;
  }

  const exportNames = discoverExports(source);
  if (exportNames.length === 0) {
    process.stderr.write(`No Variant* exports found in ${filePath}\n`);
    process.exitCode = 1;
    return;
  }

  if (!send) {
    process.stdout.write(`Found ${exportNames.length} variant(s): ${exportNames.join(", ")}\n`);
    return;
  }

  // Render to HTML via npx tsx
  const renderScript = buildRenderScript(absPath);
  const scriptPath = join(cwd, `_flare_render_${Date.now()}.mts`);
  let output: string;

  try {
    writeFileSync(scriptPath, renderScript, "utf-8");
    output = execFileSync("npx", ["tsx", scriptPath], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
  } catch (err: any) {
    const stderr = err.stderr ? String(err.stderr).trim() : "";
    process.stderr.write(`Render failed:\n${stderr || err.message}\n\nMake sure 'npx tsx' works in this project.\n`);
    process.exitCode = 1;
    return;
  } finally {
    try { unlinkSync(scriptPath); } catch {}
  }

  const variants = parseVariants(output);
  if (variants.length === 0) {
    process.stderr.write("No variants found in render output.\n");
    process.exitCode = 1;
    return;
  }

  const host = send.bridgeHost ?? "127.0.0.1";
  const port = send.bridgePort ?? 4318;

  process.stderr.write(`Sending ${variants.length} variant(s) to bridge...\n`);

  for (const variant of variants) {
    try {
      const result = await postToBridge(host, port, "/api/agent/respond", {
        origin: send.origin,
        selector: send.selector,
        outerHTML: variant.html,
        variantRequestId: send.requestId,
        variantSource: extractExportSource(source, variant.name),
        variantExportName: variant.name,
      });
      process.stderr.write(result.ok ? `  ${variant.name}: sent\n` : `  ${variant.name}: ${result.status} ${result.body}\n`);
    } catch (err) {
      process.stderr.write(`  ${variant.name}: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}
