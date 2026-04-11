import { resolveElementInfo } from "element-source";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ElementEntry,
  type ElementInfo,
  formatSourceLocation,
  getElementLabel,
  isFlareElement,
  serializeElementChange,
} from "./utils";

// ── Theme ──────────────────────────────────────────
const THEME_KEY = "flare-theme";

export function useTheme(shadowHost: HTMLElement) {
  const [theme, setThemeState] = useState<"dark" | "light">(() => {
    try {
      return (localStorage.getItem(THEME_KEY) as "dark" | "light") || "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    shadowHost.classList.toggle("f-light", theme === "light");
  }, [theme, shadowHost]);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {}
      return next;
    });
  }, []);

  return { theme, toggle };
}

// ── Drag / Position ───────────────────────────────
const POS_KEY = "flare-position";
const SIDE_KEY = "flare-side";
type PanelSide = "right" | "left";

const COLLAPSED_SIZE = 40;
const EXPANDED_WIDTH = 320;
const EXPANDED_MARGIN = 12;
const COLLAPSED_MARGIN = 16;
const DRAG_THRESHOLD = 3;

function clampVal(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function clampPos(
  x: number,
  y: number,
  isExpanded: boolean,
): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (isExpanded) {
    const panelH = vh - EXPANDED_MARGIN * 2;
    return {
      x: clampVal(x, EXPANDED_MARGIN, vw - EXPANDED_WIDTH - EXPANDED_MARGIN),
      y: clampVal(y, EXPANDED_MARGIN, vh - panelH - EXPANDED_MARGIN),
    };
  }
  return {
    x: clampVal(x, EXPANDED_MARGIN, vw - COLLAPSED_SIZE - EXPANDED_MARGIN),
    y: clampVal(y, EXPANDED_MARGIN, vh - COLLAPSED_SIZE - EXPANDED_MARGIN),
  };
}

function loadSide(): PanelSide {
  try {
    const s = localStorage.getItem(SIDE_KEY);
    if (s === "left" || s === "right") return s;
    // Migrate from old key that stored "left"/"right"
    const old = localStorage.getItem(POS_KEY);
    if (old === "left" || old === "right") return old;
  } catch {}
  return "right";
}

function loadPos(side: PanelSide): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.x === "number" && typeof parsed.y === "number")
        return parsed;
    }
  } catch {}
  return {
    x:
      side === "right"
        ? window.innerWidth - COLLAPSED_SIZE - COLLAPSED_MARGIN
        : COLLAPSED_MARGIN,
    y: COLLAPSED_MARGIN,
  };
}

function savePos(p: { x: number; y: number }) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {}
}

export function useDrag(expanded: boolean) {
  const [pos, setPos] = useState(() => loadPos(loadSide()));

  const dragging = useRef(false);
  const moved = useRef(false);
  const dragStart = useRef({ px: 0, py: 0, ox: 0, oy: 0 });
  const shellRef = useRef<HTMLDivElement | null>(null);
  const expandedRef = useRef(expanded);
  const posRef = useRef(pos);
  posRef.current = pos;
  expandedRef.current = expanded;

  // Remember collapsed position so we can restore it on close
  const collapsedPos = useRef<{ x: number; y: number } | null>(null);

  // Recalculate on expand / collapse
  const prevExpanded = useRef(expanded);
  useEffect(() => {
    if (prevExpanded.current === expanded) return;
    prevExpanded.current = expanded;
    setPos((prev) => {
      let next: { x: number; y: number };
      if (expanded) {
        // Save where the pill was, then center the panel on it
        collapsedPos.current = prev;
        next = clampPos(prev.x - (EXPANDED_WIDTH - COLLAPSED_SIZE) / 2, prev.y, true);
      } else {
        // Restore the pill to where it was before expanding
        next = collapsedPos.current
          ? clampPos(collapsedPos.current.x, collapsedPos.current.y, false)
          : clampPos(prev.x + (EXPANDED_WIDTH - COLLAPSED_SIZE) / 2, prev.y, false);
        collapsedPos.current = null;
      }
      savePos(next);
      return next;
    });
  }, [expanded]);

  // Clamp on window resize
  useEffect(() => {
    const onResize = () => {
      setPos((prev) => {
        const c = clampPos(prev.x, prev.y, expandedRef.current);
        savePos(c);
        return c;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Pointer-down handler (attach to drag surface)
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    moved.current = false;
    const cur = posRef.current;
    dragStart.current = { px: e.clientX, py: e.clientY, ox: cur.x, oy: cur.y };

    const shell = shellRef.current;
    if (shell) shell.classList.add("f-dragging");

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - dragStart.current.px;
      const dy = ev.clientY - dragStart.current.py;
      if (
        !moved.current &&
        Math.abs(dx) < DRAG_THRESHOLD &&
        Math.abs(dy) < DRAG_THRESHOLD
      )
        return;
      moved.current = true;
      const isExp = expandedRef.current;
      const clamped = clampPos(
        dragStart.current.ox + dx,
        isExp ? EXPANDED_MARGIN : dragStart.current.oy + dy,
        isExp,
      );
      setPos(clamped);
    };

    const onUp = () => {
      dragging.current = false;
      if (shell) shell.classList.remove("f-dragging");
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      // If dragged while expanded, discard saved collapsed position
      // so collapse will center the pill on the new panel position
      if (moved.current && expandedRef.current) collapsedPos.current = null;
      setPos((p) => {
        savePos(p);
        return p;
      });
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, []);

  return { pos, onPointerDown, moved, shellRef };
}

// ── Inspector ──────────────────────────────────────
import { createOverlaySet, identityTransform } from "./inspector";

const BOX_TRANSITION = "top 0.06s, left 0.06s, width 0.06s, height 0.06s";

export function useInspector() {
  const [inspecting, setInspecting] = useState(false);
  const [selectedEl, setSelectedEl] = useState<Element | null>(null);
  const hoverSourceCacheRef = useRef(new WeakMap<Element, string | null>());

  useEffect(() => {
    if (!inspecting) return;

    const overlay = createOverlaySet(document.body);
    const transform = identityTransform();
    let hoverRequestId = 0;

    const onMouseMove = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target || isFlareElement(target)) {
        hoverRequestId += 1;
        overlay.hide();
        return;
      }
      overlay.show(target, transform);

      // Async source resolution for tooltip
      const fallbackLabel = getElementLabel(target).full;
      const cached = hoverSourceCacheRef.current.get(target);
      if (cached !== undefined) {
        overlay.setTooltip(cached || fallbackLabel);
        return;
      }

      const requestId = ++hoverRequestId;
      void resolveBestElementInfo(target)
        .then((info) => {
          const sourceLabel = info.source
            ? formatSourceLocation(info.source)
            : null;
          hoverSourceCacheRef.current.set(target, sourceLabel);
          if (requestId === hoverRequestId) {
            overlay.setTooltip(sourceLabel || fallbackLabel);
          }
        })
        .catch(() => {
          hoverSourceCacheRef.current.set(target, null);
          if (requestId === hoverRequestId) {
            overlay.setTooltip(fallbackLabel);
          }
        });
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target || isFlareElement(target)) return;
      e.preventDefault();
      e.stopPropagation();
      setSelectedEl(target);
      setInspecting(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInspecting(false);
    };

    document.body.style.cursor = "crosshair";
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.cursor = "";
      overlay.destroy();
    };
  }, [inspecting]);

  const startInspecting = useCallback(() => setInspecting(true), []);
  const stopInspecting = useCallback(() => setInspecting(false), []);

  const selectElement = useCallback(
    (el: Element | null) => setSelectedEl(el),
    [],
  );

  // ── Breadcrumb hover highlight ──
  const hlRef = useRef<HTMLDivElement | null>(null);

  const highlightElement = useCallback((el: Element) => {
    if (!hlRef.current) {
      const div = document.createElement("div");
      div.setAttribute("data-flare-overlay", "");
      Object.assign(div.style, {
        position: "fixed",
        pointerEvents: "none",
        zIndex: "2147483646",
        background: "rgba(100, 160, 255, 0.08)",
        border: "1.5px solid rgba(100, 160, 255, 0.55)",
        borderRadius: "2px",
        transition: BOX_TRANSITION,
      });
      document.body.appendChild(div);
      hlRef.current = div;
    }
    const rect = el.getBoundingClientRect();
    Object.assign(hlRef.current.style, {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      display: "block",
    });
  }, []);

  const clearHighlight = useCallback(() => {
    if (hlRef.current) {
      hlRef.current.remove();
      hlRef.current = null;
    }
  }, []);

  return {
    inspecting,
    selectedEl,
    startInspecting,
    stopInspecting,
    selectElement,
    highlightElement,
    clearHighlight,
  };
}

// ── Style Editor ───────────────────────────────────
const TRACKED_PROPS = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "zIndex",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "overflow",
  "flexDirection",
  "flexWrap",
  "justifyContent",
  "alignItems",
  "gap",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "alignSelf",
  "gridTemplateColumns",
  "gridTemplateRows",
  "gridAutoFlow",
  "columnGap",
  "rowGap",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "textDecoration",
  "textTransform",
  "fontStyle",
  "wordSpacing",
  "color",
  "opacity",
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "cursor",
  "backgroundColor",
  "borderStyle",
  "borderWidth",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderColor",
  "outlineStyle",
  "outlineWidth",
  "outlineColor",
  "outlineOffset",
  "boxShadow",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
] as const;

type CSSProp = (typeof TRACKED_PROPS)[number];

const toKebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

function readComputedStyles(el: Element): Record<string, string> {
  const computed = getComputedStyle(el);
  const result: Record<string, string> = {};
  for (const prop of TRACKED_PROPS) {
    result[prop] = computed.getPropertyValue(toKebab(prop));
  }
  return result;
}

export function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onClickOutside: () => void,
) {
  const callbackRef = useRef(onClickOutside);
  callbackRef.current = onClickOutside;

  useEffect(() => {
    if (!active) return;
    const root = ref.current?.getRootNode() as Document | ShadowRoot;
    if (!root) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        callbackRef.current();
      }
    };
    root.addEventListener("mousedown", handler as EventListener);
    return () =>
      root.removeEventListener("mousedown", handler as EventListener);
  }, [active, ref]);
}

export function useElementSource(selectedEl: Element | null) {
  const cacheRef = useRef(new WeakMap<Element, ElementInfo | null>());
  const [sourceInfo, setSourceInfo] = useState<ElementInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!selectedEl) {
      setSourceInfo(null);
      return;
    }

    const cached = cacheRef.current.get(selectedEl);
    if (cached !== undefined) {
      setSourceInfo(cached);
      return;
    }

    setSourceInfo(null);

    void resolveBestElementInfo(selectedEl)
      .then((info) => {
        const normalized =
          info.source || info.stack.length > 0 || info.componentName
            ? info
            : null;
        cacheRef.current.set(selectedEl, normalized);
        if (!cancelled) setSourceInfo(normalized);
      })
      .catch(() => {
        cacheRef.current.set(selectedEl, null);
        if (!cancelled) setSourceInfo(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedEl]);

  return sourceInfo;
}

function isLikelySourceFile(fileName: string | undefined) {
  if (!fileName) return false;
  return !fileName.includes("/node_modules/") && !fileName.startsWith("node:");
}

async function resolveBestElementInfo(node: Element): Promise<ElementInfo> {
  const info = await resolveElementInfo(node);
  if (info.source && !isLikelySourceFile(info.source.filePath)) {
    return {
      ...info,
      source: null,
      stack: info.stack.filter((frame) => isLikelySourceFile(frame.filePath)),
    };
  }
  return info;
}

export function useStyleEditor(selectedEl: Element | null) {
  const sourceCacheRef = useRef(new WeakMap<Element, ElementInfo | null>());
  // Persistent store: accumulates changes for every edited element
  const storeRef = useRef<
    Map<
      Element,
      {
        overrides: Record<string, string>;
        original: Record<string, string>;
        sourceInfo: ElementInfo | null;
        comment: string;
      }
    >
  >(new Map());

  // Current element's state (drives re-renders)
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [comment, setCommentState] = useState("");
  // Bump to force re-render when allChanges changes
  const [revision, setRevision] = useState(0);

  const ensureEntry = useCallback((el: Element) => {
    const existing = storeRef.current.get(el);
    if (existing) return existing;

    const entry = {
      overrides: {},
      original: readComputedStyles(el),
      sourceInfo: sourceCacheRef.current.get(el) ?? null,
      comment: "",
    };
    storeRef.current.set(el, entry);
    return entry;
  }, []);

  // When element changes, save current and restore/init the new one
  const prevElRef = useRef<Element | null>(null);
  useEffect(() => {
    // Save previous element's state
    const prev = prevElRef.current;
    if (prev && storeRef.current.has(prev)) {
      const entry = storeRef.current.get(prev)!;
      // Only keep if there are actual changes
      const hasChanges = Object.entries(entry.overrides).some(
        ([p, v]) => v !== entry.original[p],
      );
      if (!hasChanges && !entry.comment.trim()) storeRef.current.delete(prev);
    }
    prevElRef.current = selectedEl;

    if (!selectedEl) {
      setOriginal({});
      setOverrides({});
      setCommentState("");
      return;
    }

    // Restore existing or init new
    const existing = storeRef.current.get(selectedEl);
    if (existing) {
      setOriginal(existing.original);
      setOverrides(existing.overrides);
      setCommentState(existing.comment);
    } else {
      const entry = ensureEntry(selectedEl);
      setOriginal(entry.original);
      setOverrides({});
      setCommentState("");
    }
  }, [ensureEntry, selectedEl]);

  const setElementSourceInfo = useCallback(
    (el: Element, sourceInfo: ElementInfo | null) => {
      sourceCacheRef.current.set(el, sourceInfo);
      const entry = storeRef.current.get(el);
      if (entry) {
        entry.sourceInfo = sourceInfo;
        setRevision((r) => r + 1);
      }
    },
    [],
  );

  const getValue = useCallback(
    (prop: string) => overrides[prop] ?? original[prop] ?? "",
    [overrides, original],
  );

  const setValue = useCallback(
    (prop: CSSProp, value: string) => {
      if (!selectedEl || !("style" in selectedEl)) return;
      (selectedEl as HTMLElement).style.setProperty(toKebab(prop), value, "important");
      setOverrides((prev) => {
        const next = { ...prev, [prop]: value };
        // Sync to persistent store
        const entry = ensureEntry(selectedEl);
        entry.overrides = next;
        return next;
      });
      setRevision((r) => r + 1);
    },
    [ensureEntry, selectedEl],
  );

  const setComment = useCallback(
    (value: string) => {
      if (!selectedEl) return;
      const nextComment = value.trim();
      setCommentState(nextComment);
      const entry = ensureEntry(selectedEl);
      entry.comment = nextComment;
      setRevision((r) => r + 1);
    },
    [ensureEntry, selectedEl],
  );

  const acknowledgeEntries = useCallback((submittedEntries: ElementEntry[]) => {
    for (const submittedEntry of submittedEntries) {
      const currentEntry = storeRef.current.get(submittedEntry.el);
      if (!currentEntry) continue;

      for (const [prop, submittedValue] of Object.entries(submittedEntry.overrides)) {
        if (currentEntry.overrides[prop] !== submittedValue) continue;
        currentEntry.original[prop] = submittedValue;
        delete currentEntry.overrides[prop];
      }

      if (
        submittedEntry.comment?.trim() &&
        currentEntry.comment.trim() === submittedEntry.comment.trim()
      ) {
        currentEntry.comment = "";
      }

      const hasRemainingOverrides = Object.entries(currentEntry.overrides).some(
        ([prop, value]) => value !== currentEntry.original[prop],
      );

      if (!hasRemainingOverrides && !currentEntry.comment.trim()) {
        storeRef.current.delete(submittedEntry.el);
      }
    }

    if (selectedEl) {
      const entry = storeRef.current.get(selectedEl);
      if (entry) {
        setOriginal(entry.original);
        setOverrides(entry.overrides);
      } else {
        const nextEntry = ensureEntry(selectedEl);
        setOriginal(nextEntry.original);
        setOverrides({});
      }
    } else {
      setOriginal({});
      setOverrides({});
    }

    const selectedEntry = selectedEl ? storeRef.current.get(selectedEl) : null;
    setCommentState(selectedEntry?.comment ?? "");
    setRevision((r) => r + 1);
  }, [ensureEntry, selectedEl]);

  // Reset only the current element's changes
  const resetCurrent = useCallback(() => {
    if (!selectedEl || !("style" in selectedEl)) return;
    for (const prop of Object.keys(overrides) as CSSProp[]) {
      (selectedEl as HTMLElement).style.removeProperty(toKebab(prop));
    }
    storeRef.current.delete(selectedEl);
    const orig = readComputedStyles(selectedEl);
    storeRef.current.set(selectedEl, {
      overrides: {},
      original: orig,
      sourceInfo: sourceCacheRef.current.get(selectedEl) ?? null,
      comment: "",
    });
    setOverrides({});
    setOriginal(orig);
    setCommentState("");
    setRevision((r) => r + 1);
  }, [selectedEl, overrides]);

  // Reset ALL accumulated changes across every element
  const resetAll = useCallback(() => {
    for (const [el, entry] of storeRef.current.entries()) {
      if ("style" in el) {
        for (const prop of Object.keys(entry.overrides) as CSSProp[]) {
          (el as HTMLElement).style.removeProperty(toKebab(prop));
        }
      }
    }
    storeRef.current.clear();
    if (selectedEl) {
      const orig = readComputedStyles(selectedEl);
      storeRef.current.set(selectedEl, {
        overrides: {},
        original: orig,
        sourceInfo: sourceCacheRef.current.get(selectedEl) ?? null,
        comment: "",
      });
      setOriginal(orig);
    }
    setOverrides({});
    setCommentState("");
    setRevision((r) => r + 1);
  }, [selectedEl]);

  // Collect all elements that have actual changes
  const getAllChanges = useCallback((): ElementEntry[] => {
    void revision; // depend on revision for reactivity
    const entries: ElementEntry[] = [];
    for (const [
      el,
      { overrides: ov, original: orig, sourceInfo, comment },
    ] of storeRef.current.entries()) {
      const realChanges = Object.entries(ov).filter(([p, v]) => v !== orig[p]);
      if (realChanges.length > 0 || comment.trim()) {
        entries.push({ el, overrides: ov, original: orig, sourceInfo, comment });
      }
    }
    return entries;
  }, [revision]);

  // Total change count across all elements
  const totalChangeCount = (() => {
    void revision;
    let count = 0;
    for (const [
      ,
      { overrides: ov, original: orig, comment },
    ] of storeRef.current.entries()) {
      count += Object.entries(ov).filter(([p, v]) => v !== orig[p]).length;
      if (comment.trim()) count += 1;
    }
    return count;
  })();

  const totalStyleChangeCount = (() => {
    void revision;
    let count = 0;
    for (const [, { overrides: ov, original: orig }] of storeRef.current.entries()) {
      count += Object.entries(ov).filter(([p, v]) => v !== orig[p]).length;
    }
    return count;
  })();

  const totalCommentCount = (() => {
    void revision;
    let count = 0;
    for (const [, { comment }] of storeRef.current.entries()) {
      if (comment.trim()) count += 1;
    }
    return count;
  })();

  return {
    acknowledgeEntries,
    comment,
    getValue,
    setValue,
    setComment,
    setElementSourceInfo,
    overrides,
    original,
    resetCurrent,
    resetAll,
    getAllChanges,
    totalChangeCount,
    totalCommentCount,
    totalStyleChangeCount,
  };
}

// ── Font Detection ─────────────────────────────────
const WEB_SAFE_FONTS = [
  "Arial",
  "Arial Black",
  "Brush Script MT",
  "Cambria",
  "Comic Sans MS",
  "Consolas",
  "Courier New",
  "Garamond",
  "Georgia",
  "Helvetica",
  "Impact",
  "Inter",
  "Lucida Console",
  "Monaco",
  "Palatino Linotype",
  "Roboto",
  "Segoe UI",
  "SF Pro Display",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
  "system-ui",
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
];

let fontCache: string[] | null = null;
let fontCachePromise: Promise<string[]> | null = null;

function collectPageFonts(): string[] {
  const families = new Set<string>();
  try {
    document.fonts.forEach((face) => {
      const name = face.family.replace(/^["']|["']$/g, "");
      if (name) families.add(name);
    });
  } catch {}
  return Array.from(families);
}

async function querySystemFonts(): Promise<string[]> {
  if (typeof (window as any).queryLocalFonts !== "function") return [];
  try {
    const fonts: any[] = await (window as any).queryLocalFonts();
    const families = new Set<string>();
    for (const f of fonts) {
      if (f.family) families.add(f.family);
    }
    return Array.from(families);
  } catch {
    return [];
  }
}

async function loadFonts(): Promise<string[]> {
  const [system, page] = await Promise.all([
    querySystemFonts(),
    Promise.resolve(collectPageFonts()),
  ]);
  const all = new Set<string>([...WEB_SAFE_FONTS, ...page, ...system]);
  return Array.from(all).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

export function useAvailableFonts() {
  const [fonts, setFonts] = useState<string[]>(
    () => fontCache ?? WEB_SAFE_FONTS,
  );

  useEffect(() => {
    if (fontCache) {
      setFonts(fontCache);
      return;
    }
    if (!fontCachePromise) fontCachePromise = loadFonts();
    fontCachePromise.then((result) => {
      fontCache = result;
      setFonts(result);
    });
  }, []);

  return fonts;
}
