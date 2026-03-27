import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const BRIDGE_TMP_ROOT = join(tmpdir(), "flare-dev");

function sanitizeSlug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "project";
}

export function getOriginInboxPath(origin: string) {
  let normalized = origin.trim();
  try {
    normalized = new URL(origin).origin;
  } catch {}

  const slug = sanitizeSlug(
    normalized
      .replace(/^https?:\/\//, "")
      .replace(/\./g, "-")
      .replace(/:/g, "-"),
  );
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return join(BRIDGE_TMP_ROOT, `${slug}-${hash}`);
}
