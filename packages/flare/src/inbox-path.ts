import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";

export const BRIDGE_TMP_ROOT = join(tmpdir(), "flare-dev");

function sanitizeSlug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "project";
}

export function getRepoInboxPath(projectRoot: string) {
  const resolvedRoot = realpathSync(projectRoot);
  const slug = sanitizeSlug(basename(resolvedRoot));
  const hash = createHash("sha256").update(resolvedRoot).digest("hex").slice(0, 12);
  return join(BRIDGE_TMP_ROOT, `${slug}-${hash}`);
}
