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

/** Stamp an element with a stable data-flare-id if it doesn't have one.
 *  Returns the selector `[data-flare-id="..."]` for reliable DOM lookup. */
export function getFlareId(el: Element): string {
  let id = el.getAttribute("data-flare-id");
  if (!id) {
    id = Math.random().toString(36).slice(2, 8);
    el.setAttribute("data-flare-id", id);
  }
  return `[data-flare-id="${id}"]`;
}

/** Remove the data-flare-id stamp from an element. */
export function removeFlareId(el: Element): void {
  el.removeAttribute("data-flare-id");
}

export function getCssSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;

  const tag = el.tagName.toLowerCase();
  let base = tag;
  if (el.className && typeof el.className === "string") {
    const cls = el.className.trim().split(/\s+/).slice(0, 3).map((c) => CSS.escape(c)).join(".");
    if (cls) base = `${tag}.${cls}`;
  }

  const doc = el.ownerDocument;

  // Check if base selector is unique
  try {
    const matches = doc.querySelectorAll(base);
    if (matches.length === 1) return base;
  } catch { return base; }

  // Try scoping under nearest ancestor with a meaningful id (skip app roots)
  const rootIds = new Set(["root", "app", "__next", "__nuxt", "gatsby-focus-wrapper"]);
  let ancestor: Element | null = el.parentElement;
  while (ancestor && ancestor !== doc.documentElement) {
    if (ancestor.id && !rootIds.has(ancestor.id)) {
      const scoped = `#${CSS.escape(ancestor.id)} ${base}`;
      try {
        if (doc.querySelectorAll(scoped).length === 1) return scoped;
      } catch {}
      break;
    }
    ancestor = ancestor.parentElement;
  }

  // Add :nth-of-type() to disambiguate among siblings
  const parent = el.parentElement;
  if (parent) {
    let idx = 1;
    for (const child of parent.children) {
      if (child === el) break;
      if (child.tagName === el.tagName) idx++;
    }
    const nth = `${base}:nth-of-type(${idx})`;
    // Scope under parent for more specificity
    const parentSel = parent.id
      ? `#${CSS.escape(parent.id)}`
      : parent.tagName.toLowerCase();
    const scoped = `${parentSel} > ${nth}`;
    try {
      if (doc.querySelectorAll(scoped).length === 1) return scoped;
    } catch {}
    return nth;
  }

  return base;
}

/** Build an HTML snippet showing the element in its parent context.
 *  Sibling elements are collapsed to one-line summaries so the agent
 *  can see where the target sits without a wall of markup. */
export function getElementWithContext(el: Element): string {
  const parent = el.parentElement;
  if (!parent || parent === el.ownerDocument.documentElement || parent === el.ownerDocument.body) {
    return el.outerHTML;
  }

  const parentTag = parent.tagName.toLowerCase();
  const parentAttrs = summarizeAttrs(parent);
  const open = parentAttrs ? `<${parentTag} ${parentAttrs}>` : `<${parentTag}>`;

  const childSnippets: string[] = [];
  for (const child of parent.children) {
    if (child === el) {
      childSnippets.push(`  ${el.outerHTML}`);
    } else {
      childSnippets.push(`  ${collapsedTag(child)}`);
    }
  }

  return `${open}\n${childSnippets.join("\n")}\n</${parentTag}>`;
}

function summarizeAttrs(el: Element): string {
  const parts: string[] = [];
  if (el.id) parts.push(`id="${el.id}"`);
  if (el.className && typeof el.className === "string") {
    const cls = el.className.trim();
    if (cls) parts.push(`class="${cls}"`);
  }
  return parts.join(" ");
}

function collapsedTag(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const attrs = summarizeAttrs(el);
  const text = (el as HTMLElement).innerText?.trim().split("\n")[0]?.slice(0, 40) ?? "";
  const textPart = text ? `${text}${text.length >= 40 ? "…" : ""}` : "";
  const open = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
  return textPart ? `${open}${textPart}</${tag}>` : `${open}…</${tag}>`;
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

/** Get the visible text content of an element, truncated.
 *  For containers with no direct text, pull representative snippets from children. */
function getTextSnippet(el: Element, maxLen = 80): string {
  // Check for direct text content (non-whitespace text nodes)
  const directText = Array.from(el.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  if (directText) {
    return directText.length > maxLen ? directText.slice(0, maxLen) + "…" : directText;
  }

  // First line of innerText if short enough (leaf-ish elements)
  const inner = (el as HTMLElement).innerText?.trim() ?? "";
  const firstLine = inner.split("\n")[0]?.trim() ?? "";
  if (firstLine && firstLine.length <= maxLen) return firstLine;

  // Container: collect representative child text (headings, labels, buttons, links, inputs)
  const selectors = "h1,h2,h3,h4,h5,h6,label,button,a,[aria-label],input[placeholder]";
  const landmarks = el.querySelectorAll(selectors);
  const parts: string[] = [];
  let len = 0;
  for (const child of landmarks) {
    const t =
      child.getAttribute("aria-label") ??
      (child as HTMLInputElement).placeholder ??
      (child as HTMLElement).innerText?.trim() ??
      "";
    if (!t) continue;
    const snippet = t.split("\n")[0].trim();
    if (!snippet || parts.includes(snippet)) continue;
    if (len + snippet.length > maxLen) break;
    parts.push(snippet);
    len += snippet.length + 3;
  }
  if (parts.length > 0) return parts.join(" · ");

  // Fallback: truncated innerText
  return firstLine ? firstLine.slice(0, maxLen) + "…" : "";
}

/** Short label for an element in a path: prefer #id, then a short class, else tag with nth-child */
function shortLabel(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  if (el.className && typeof el.className === "string") {
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
  // Add nth-child for bare tags to disambiguate siblings
  const parent = el.parentElement;
  if (parent) {
    const sameTag = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
    if (sameTag.length > 1) {
      const idx = Array.from(parent.children).indexOf(el) + 1;
      return `${tag}:nth-child(${idx})`;
    }
  }
  return tag;
}

/** Build a readable ancestor path from a recognizable landmark down to the element */
export function getAncestorPath(el: Element, maxDepth = 6): string {
  // Collect full chain up to body
  const chain: Element[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.documentElement && cur.tagName !== "BODY") {
    if (!isFlareElement(cur)) chain.unshift(cur);
    cur = cur.parentElement;
  }

  if (chain.length <= maxDepth) return chain.map(shortLabel).join(" > ");

  // Find the best landmark: nearest ancestor with an id, or a semantic tag
  const semanticTags = new Set(["main", "header", "footer", "nav", "section", "article", "aside", "form"]);
  let landmarkIdx = -1;
  for (let i = 0; i < chain.length - 1; i++) {
    if (chain[i].id) { landmarkIdx = i; break; }
  }
  if (landmarkIdx < 0) {
    for (let i = 0; i < chain.length - 1; i++) {
      if (semanticTags.has(chain[i].tagName.toLowerCase())) { landmarkIdx = i; break; }
    }
  }

  // Take from landmark to target, trimmed to maxDepth
  const start = landmarkIdx >= 0 ? landmarkIdx : Math.max(0, chain.length - maxDepth);
  const slice = chain.slice(start, start + maxDepth);
  // Always include the target element
  if (slice[slice.length - 1] !== chain[chain.length - 1]) {
    slice[slice.length - 1] = chain[chain.length - 1];
  }
  return slice.map(shortLabel).join(" > ");
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

  const source = sourceInfo?.source
    ? `${formatSourceLocation(sourceInfo.source)}${sourceInfo.source.componentName ? ` (${sourceInfo.source.componentName})` : ""}`
    : undefined;

  const componentStack =
    sourceInfo?.stack && sourceInfo.stack.length > 1
      ? sourceInfo.stack
          .slice(0, 4)
          .map((frame) => `${formatSourceLocation(frame)}${frame.componentName ? ` (${frame.componentName})` : ""}`)
          .filter(Boolean)
      : undefined;

  return {
    selector: getCssSelector(el),
    path: getAncestorPath(el),
    textSnippet: getTextSnippet(el) || undefined,
    comment: comment || undefined,
    source,
    componentStack,
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

  const path = getAncestorPath(el);
  const text = getTextSnippet(el);
  const selectorStr = getCssSelector(el);
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
  const selectorLine = `Selector: ${selectorStr}`;
  const domLine = path ? `DOM: ${path}` : "";
  return [identifier, sourceHeader, selectorLine, domLine, stackLines, commentLine, changeLines]
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
