import type { ElementInfo, ElementSourceInfo } from "element-source";
import type { FlareElementChange } from "./bridge-types";

export interface ElementEntry {
  el: Element;
  overrides: Record<string, string>;
  original: Record<string, string>;
  sourceInfo?: ElementInfo | null;
  comment?: string;
}

export type { ElementInfo, ElementSourceInfo };

export function toHex(color: string): string {
  const m = color.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    const [, r, g, b] = m;
    return (
      "#" +
      [r, g, b].map((c) => Number(c).toString(16).padStart(2, "0")).join("")
    );
  }
  if (color.startsWith("#"))
    return color.length === 4
      ? "#" + color[1] + color[1] + color[2] + color[2] + color[3] + color[3]
      : color;
  return "#000000";
}

export function getElementLabel(el: Element) {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls =
    el.className && typeof el.className === "string"
      ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "";
  return { tag, id, cls, full: `<${tag}>${id}${cls}` };
}

export function isFlareElement(el: Element) {
  return (
    el.closest?.("#flare-host") ||
    el.hasAttribute?.("data-flare-overlay") ||
    el.hasAttribute?.("data-flare-tooltip")
  );
}

export function getCssSelector(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `#${el.id}`;
  if (el.className && typeof el.className === "string") {
    const cls = el.className.trim().split(/\s+/);
    return cls.length > 0 ? `.${cls[0]}` : tag;
  }
  return tag;
}

// ── Prompt helpers ─────────────────────────────────

function toKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** Try to convert rgb()/rgba() to a short hex like #1a1a1a */
function rgbToHex(val: string): string {
  const m = val.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return val;
  const hex =
    "#" +
    [m[1], m[2], m[3]]
      .map((c) => Number(c).toString(16).padStart(2, "0"))
      .join("");
  // Also note the original rgba alpha if present
  const a = val.match(/rgba?\(\s*\d+,\s*\d+,\s*\d+,\s*([\d.]+)/);
  return a && parseFloat(a[1]) < 1
    ? `${hex} (opacity ${Math.round(parseFloat(a[1]) * 100)}%)`
    : hex;
}

/** Clean up a computed value for readability */
function humanizeValue(val: string): string {
  if (!val || val === "none" || val === "normal" || val === "auto") return val;
  // Convert rgb(r,g,b) to hex
  return val.replace(/rgba?\(\s*\d+,\s*\d+,\s*\d+(?:,\s*[\d.]+)?\)/g, (match) =>
    rgbToHex(match),
  );
}

/** Get the visible text content of an element, truncated */
function getTextSnippet(el: Element, maxLen = 60): string {
  const text =
    (el as HTMLElement).innerText?.trim() ?? el.textContent?.trim() ?? "";
  if (!text) return "";
  // Only take first line
  const firstLine = text.split("\n")[0].trim();
  return firstLine.length > maxLen
    ? firstLine.slice(0, maxLen) + "…"
    : firstLine;
}

/** Short label for an element in a path: prefer #id, then a short class, else just the tag */
function shortLabel(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  if (el.className && typeof el.className === "string") {
    // Pick the first class that looks like a meaningful name (not a Tailwind utility)
    const meaningful = el.className
      .trim()
      .split(/\s+/)
      .find(
        (c) =>
          !c.includes("[") &&
          !c.includes("/") &&
          !c.includes(":") &&
          c.length < 24,
      );
    if (meaningful) return `${tag}.${meaningful}`;
  }
  return tag;
}

/** Build a readable ancestor path: body > main.hero > div.container > h1 */
export function getAncestorPath(el: Element, maxDepth = 4): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.documentElement && parts.length < maxDepth) {
    if (isFlareElement(cur)) {
      cur = cur.parentElement;
      continue;
    }
    parts.unshift(shortLabel(cur));
    cur = cur.parentElement;
  }
  return parts.join(" > ");
}

export function getPathSuffix(el: Element, maxDepth = 3): string {
  const path = getAncestorPath(el, maxDepth);
  const parts = path.split(" > ").filter(Boolean);
  return parts.slice(-maxDepth).join(" > ");
}

export function formatSourceLocation(frame: ElementSourceInfo | null | undefined) {
  if (!frame) return "";
  const line =
    frame.lineNumber != null
      ? `:${frame.lineNumber}${frame.columnNumber != null ? `:${frame.columnNumber}` : ""}`
      : "";
  return `${frame.filePath}${line}`;
}

export function serializeElementChange(entry: ElementEntry): FlareElementChange {
  const { el, overrides, original, sourceInfo } = entry;
  const comment = entry.comment?.trim() ?? "";
  const actualChanges = Object.entries(overrides).filter(
    ([prop, val]) => val !== original[prop],
  );

  return {
    selector: getCssSelector(el),
    path: sourceInfo?.source ? getPathSuffix(el, 3) : getAncestorPath(el, 4),
    textSnippet: getTextSnippet(el, 80) || undefined,
    comment: comment || undefined,
    source: sourceInfo?.source ? formatSourceLocation(sourceInfo.source) : undefined,
    changes: actualChanges.map(([prop, val]) => ({
      property: toKebab(prop),
      before: humanizeValue(original[prop] || "unset"),
      after: humanizeValue(val),
    })),
  };
}

/** Build a compact description for one element's changes */
function buildElementBlock(entry: ElementEntry): string {
  const { el, overrides, original, sourceInfo } = entry;
  const comment = entry.comment?.trim() ?? "";
  const actualChanges = Object.entries(overrides).filter(
    ([prop, val]) => val !== original[prop],
  );

  if (actualChanges.length === 0 && !comment) return "";

  const path = sourceInfo?.source ? getPathSuffix(el, 3) : getAncestorPath(el, 4);
  const text = getTextSnippet(el, 40);
  const sourceHeader = sourceInfo?.source
    ? `Source: ${formatSourceLocation(sourceInfo.source)}${sourceInfo.source.componentName ? ` (${sourceInfo.source.componentName})` : ""}`
    : "";
  const stackLines =
    sourceInfo?.stack && sourceInfo.stack.length > 1
      ? `Component stack:\n${sourceInfo.stack
          .slice(0, 4)
          .map((frame) => `  - ${formatSourceLocation(frame)}${frame.componentName ? ` (${frame.componentName})` : ""}`)
          .join("\n")}`
      : "";
  const commentLine = comment ? `Comment: ${comment}` : "";

  const changeLines = actualChanges
    .map(([prop, val]) => {
      const before = humanizeValue(original[prop] || "unset");
      const after = humanizeValue(val);
      return `  ${toKebab(prop)}: ${before} → ${after}`;
    })
    .join("\n");

  const identifier = text ? `"${text}"` : path;
  const domLine = path ? `DOM: ${path}` : "";
  return [identifier, sourceHeader, domLine, stackLines, commentLine, changeLines]
    .filter(Boolean)
    .join("\n");
}

/**
 * Build a concise prompt for an LLM to apply visual changes to source code.
 */
export function buildPrompt(entries: ElementEntry[]): string {
  const blocks = entries
    .map((entry) => buildElementBlock(entry))
    .filter(Boolean);

  if (blocks.length === 0) return "";

  return [
    `I tweaked styles in the browser — apply these changes to the source code intelligently.`,
    `The DOM classes/structure may not map 1:1 to source — interpret the intent behind each change:`,
    `- If the element comes from a component, update the component's styles (props, internal CSS, class, etc.) rather than adding overrides at the call site.`,
    `- Use the best idiom for the project's stack (e.g. Tailwind classes, CSS module updates, styled-component changes, style props) instead of raw inline styles.`,
    `- If the same result can be expressed more cleanly (e.g. a shorthand property, a design token, a utility class), prefer that over a literal translation of the CSS.`,
    ``,
    blocks.join("\n\n"),
  ].join("\n");
}
