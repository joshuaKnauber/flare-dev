import { useCallback, useEffect, useRef, useState } from "react";
import { type ElementEntry, getElementLabel, isFlareElement } from "./utils";

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

// ── Position ───────────────────────────────────────
const POS_KEY = "flare-position";
export type PanelSide = "right" | "left";

export function usePosition() {
  const [side, setSideState] = useState<PanelSide>(() => {
    try {
      const v = localStorage.getItem(POS_KEY);
      return v === "left" ? "left" : "right";
    } catch {
      return "right";
    }
  });

  const toggle = useCallback(() => {
    setSideState((prev) => {
      const next = prev === "right" ? "left" : "right";
      try {
        localStorage.setItem(POS_KEY, next);
      } catch {}
      return next;
    });
  }, []);

  return { side, toggle };
}

// ── Inspector ──────────────────────────────────────
const OVERLAY_BASE: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  pointerEvents: "none",
  zIndex: "2147483646",
  display: "none",
};

const BOX_TRANSITION = "top 0.06s, left 0.06s, width 0.06s, height 0.06s";

const TOOLTIP_STYLES: Partial<CSSStyleDeclaration> = {
  ...OVERLAY_BASE,
  background: "#1a1a1a",
  color: "#e5e5e5",
  fontFamily: "'Geist Mono', monospace",
  fontSize: "10px",
  padding: "3px 8px",
  borderRadius: "4px",
  whiteSpace: "nowrap",
  boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
};

const LABEL_BASE: Partial<CSSStyleDeclaration> = {
  ...OVERLAY_BASE,
  fontFamily: "'Geist Mono', monospace",
  fontSize: "9px",
  color: "#fff",
  padding: "1px 4px",
  borderRadius: "2px",
  whiteSpace: "nowrap",
  lineHeight: "14px",
  textAlign: "center",
};

function createStyledDiv(attr: string, styles: Partial<CSSStyleDeclaration>) {
  const div = document.createElement("div");
  div.setAttribute(attr, "");
  Object.assign(div.style, styles);
  document.body.appendChild(div);
  return div;
}

function getBoxMetrics(el: Element) {
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return {
    rect,
    margin: {
      top: parseFloat(cs.marginTop) || 0,
      right: parseFloat(cs.marginRight) || 0,
      bottom: parseFloat(cs.marginBottom) || 0,
      left: parseFloat(cs.marginLeft) || 0,
    },
    padding: {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    },
    border: {
      top: parseFloat(cs.borderTopWidth) || 0,
      right: parseFloat(cs.borderRightWidth) || 0,
      bottom: parseFloat(cs.borderBottomWidth) || 0,
      left: parseFloat(cs.borderLeftWidth) || 0,
    },
  };
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getGapOverlays(el: Element, contentBox: Box): Box[] {
  const cs = getComputedStyle(el);
  if (!/^(inline-)?(flex|grid)$/.test(cs.display)) return [];

  const rowGap = parseFloat(cs.rowGap) || 0;
  const colGap = parseFloat(cs.columnGap) || 0;
  if (!rowGap && !colGap) return [];

  const children = Array.from(el.children).filter((c) => {
    const s = getComputedStyle(c);
    return (
      s.display !== "none" &&
      s.position !== "absolute" &&
      s.position !== "fixed"
    );
  });
  if (children.length < 2) return [];

  const childRects = children.map((c) => c.getBoundingClientRect());
  const result: Box[] = [];

  // Group children into visual rows (by top-position proximity)
  const sorted = childRects
    .slice()
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const rows: DOMRect[][] = [];
  for (const r of sorted) {
    const last = rows[rows.length - 1];
    if (
      last &&
      Math.abs(r.top - last[0].top) < Math.max(2, last[0].height * 0.3)
    ) {
      last.push(r);
    } else {
      rows.push([r]);
    }
  }

  // Column gaps within each row
  if (colGap > 0) {
    for (const row of rows) {
      row.sort((a, b) => a.left - b.left);
      const rowTop = Math.min(...row.map((r) => r.top));
      const rowBot = Math.max(...row.map((r) => r.bottom));
      for (let i = 0; i < row.length - 1; i++) {
        const gapW = row[i + 1].left - row[i].right;
        if (gapW > 0.5) {
          result.push({
            top: rowTop,
            left: row[i].right,
            width: gapW,
            height: rowBot - rowTop,
          });
        }
      }
    }
  }

  // Row gaps between rows
  if (rowGap > 0 && rows.length > 1) {
    for (let i = 0; i < rows.length - 1; i++) {
      const rowBot = Math.max(...rows[i].map((r) => r.bottom));
      const nextTop = Math.min(...rows[i + 1].map((r) => r.top));
      const gapH = nextTop - rowBot;
      if (gapH > 0.5) {
        result.push({
          top: rowBot,
          left: contentBox.left,
          width: contentBox.width,
          height: gapH,
        });
      }
    }
  }

  return result;
}

const GAP_STRIPE =
  "repeating-linear-gradient(-45deg, rgba(180,120,255,0.14), rgba(180,120,255,0.14) 2px, rgba(180,120,255,0.05) 2px, rgba(180,120,255,0.05) 5px)";
const GAP_POOL = 16;

export function useInspector() {
  const [inspecting, setInspecting] = useState(false);
  const [selectedEl, setSelectedEl] = useState<Element | null>(null);

  useEffect(() => {
    if (!inspecting) return;

    // Box layers: margin (orange), padding (green), content (blue)
    const marginEl = createStyledDiv("data-flare-overlay", {
      ...OVERLAY_BASE,
      background: "rgba(255, 122, 0, 0.08)",
      transition: BOX_TRANSITION,
    });
    const paddingEl = createStyledDiv("data-flare-overlay", {
      ...OVERLAY_BASE,
      background: "rgba(110, 200, 120, 0.12)",
      border: "1.5px solid rgba(255, 122, 0, 0.55)",
      borderRadius: "2px",
      transition: BOX_TRANSITION,
    });
    const contentEl = createStyledDiv("data-flare-overlay", {
      ...OVERLAY_BASE,
      background: "rgba(100, 160, 255, 0.12)",
      transition: BOX_TRANSITION,
    });

    // Value labels: 4 margin (orange) + 4 padding (green)
    const mLabels = Array.from({ length: 4 }, () =>
      createStyledDiv("data-flare-overlay", {
        ...LABEL_BASE,
        background: "rgba(255, 122, 0, 0.8)",
      }),
    );
    const pLabels = Array.from({ length: 4 }, () =>
      createStyledDiv("data-flare-overlay", {
        ...LABEL_BASE,
        background: "rgba(110, 200, 120, 0.8)",
      }),
    );

    // Gap strips (purple hatched) + labels
    const gapStrips = Array.from({ length: GAP_POOL }, () =>
      createStyledDiv("data-flare-overlay", {
        ...OVERLAY_BASE,
        background: GAP_STRIPE,
      }),
    );
    const gapLabels = Array.from({ length: GAP_POOL }, () =>
      createStyledDiv("data-flare-overlay", {
        ...LABEL_BASE,
        background: "rgba(180, 120, 255, 0.85)",
      }),
    );

    const tooltip = createStyledDiv("data-flare-tooltip", TOOLTIP_STYLES);
    const allEls = [
      marginEl,
      paddingEl,
      contentEl,
      tooltip,
      ...mLabels,
      ...pLabels,
      ...gapStrips,
      ...gapLabels,
    ];

    const positionLabel = (
      label: HTMLDivElement,
      val: number,
      x: number,
      y: number,
    ) => {
      if (Math.abs(val) > 0) {
        label.textContent = `${Math.round(val)}`;
        Object.assign(label.style, {
          top: `${y}px`,
          left: `${x}px`,
          transform: "translate(-50%, -50%)",
          display: "block",
        });
      } else {
        label.style.display = "none";
      }
    };

    const showOverlay = (el: Element) => {
      const { rect, margin: m, padding: p, border: b } = getBoxMetrics(el);

      // Margin box (outermost)
      Object.assign(marginEl.style, {
        top: `${rect.top - m.top}px`,
        left: `${rect.left - m.left}px`,
        width: `${rect.width + m.left + m.right}px`,
        height: `${rect.height + m.top + m.bottom}px`,
        display: "block",
      });

      // Border box (shows padding fill)
      Object.assign(paddingEl.style, {
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        display: "block",
      });

      // Content box (innermost)
      const cTop = rect.top + b.top + p.top;
      const cLeft = rect.left + b.left + p.left;
      const cWidth = Math.max(
        0,
        rect.width - b.left - p.left - p.right - b.right,
      );
      const cHeight = Math.max(
        0,
        rect.height - b.top - p.top - p.bottom - b.bottom,
      );
      Object.assign(contentEl.style, {
        top: `${cTop}px`,
        left: `${cLeft}px`,
        width: `${cWidth}px`,
        height: `${cHeight}px`,
        display: "block",
      });

      // Margin labels [top, right, bottom, left]
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      positionLabel(mLabels[0], m.top, cx, rect.top - m.top / 2);
      positionLabel(mLabels[1], m.right, rect.right + m.right / 2, cy);
      positionLabel(mLabels[2], m.bottom, cx, rect.bottom + m.bottom / 2);
      positionLabel(mLabels[3], m.left, rect.left - m.left / 2, cy);

      // Padding labels [top, right, bottom, left]
      positionLabel(pLabels[0], p.top, cx, rect.top + b.top + p.top / 2);
      positionLabel(
        pLabels[1],
        p.right,
        rect.right - b.right - p.right / 2,
        cy,
      );
      positionLabel(
        pLabels[2],
        p.bottom,
        cx,
        rect.bottom - b.bottom - p.bottom / 2,
      );
      positionLabel(pLabels[3], p.left, rect.left + b.left + p.left / 2, cy);

      // Gap overlays (purple hatched strips between flex/grid children)
      const gaps = getGapOverlays(el, {
        top: cTop,
        left: cLeft,
        width: cWidth,
        height: cHeight,
      });
      for (let i = 0; i < GAP_POOL; i++) {
        if (i < gaps.length) {
          const g = gaps[i];
          Object.assign(gapStrips[i].style, {
            top: `${g.top}px`,
            left: `${g.left}px`,
            width: `${g.width}px`,
            height: `${g.height}px`,
            display: "block",
          });
          const val = Math.min(g.width, g.height);
          gapLabels[i].textContent = `${Math.round(val)}`;
          Object.assign(gapLabels[i].style, {
            top: `${g.top + g.height / 2}px`,
            left: `${g.left + g.width / 2}px`,
            transform: "translate(-50%, -50%)",
            display: "block",
          });
        } else {
          gapStrips[i].style.display = "none";
          gapLabels[i].style.display = "none";
        }
      }

      // Tooltip
      tooltip.textContent = getElementLabel(el).full;
      const tY =
        rect.top - m.top > 28
          ? rect.top - m.top - 24
          : rect.bottom + m.bottom + 6;
      Object.assign(tooltip.style, {
        top: `${tY}px`,
        left: `${rect.left}px`,
        display: "block",
      });
    };

    const hideOverlay = () => {
      allEls.forEach((el) => {
        el.style.display = "none";
      });
    };

    const onMouseMove = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target || isFlareElement(target)) {
        hideOverlay();
        return;
      }
      showOverlay(target);
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
      allEls.forEach((el) => el.remove());
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

export function useStyleEditor(selectedEl: Element | null) {
  // Persistent store: accumulates changes for every edited element
  const storeRef = useRef<
    Map<
      Element,
      { overrides: Record<string, string>; original: Record<string, string> }
    >
  >(new Map());

  // Current element's state (drives re-renders)
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  // Bump to force re-render when allChanges changes
  const [revision, setRevision] = useState(0);

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
      if (!hasChanges) storeRef.current.delete(prev);
    }
    prevElRef.current = selectedEl;

    if (!selectedEl) {
      setOriginal({});
      setOverrides({});
      return;
    }

    // Restore existing or init new
    const existing = storeRef.current.get(selectedEl);
    if (existing) {
      setOriginal(existing.original);
      setOverrides(existing.overrides);
    } else {
      const orig = readComputedStyles(selectedEl);
      storeRef.current.set(selectedEl, { overrides: {}, original: orig });
      setOriginal(orig);
      setOverrides({});
    }
  }, [selectedEl]);

  const getValue = useCallback(
    (prop: string) => overrides[prop] ?? original[prop] ?? "",
    [overrides, original],
  );

  const setValue = useCallback(
    (prop: CSSProp, value: string) => {
      if (!selectedEl || !(selectedEl instanceof HTMLElement)) return;
      selectedEl.style.setProperty(toKebab(prop), value, "important");
      setOverrides((prev) => {
        const next = { ...prev, [prop]: value };
        // Sync to persistent store
        const entry = storeRef.current.get(selectedEl);
        if (entry) entry.overrides = next;
        return next;
      });
      setRevision((r) => r + 1);
    },
    [selectedEl],
  );

  // Reset only the current element's changes
  const resetCurrent = useCallback(() => {
    if (!selectedEl || !(selectedEl instanceof HTMLElement)) return;
    for (const prop of Object.keys(overrides) as CSSProp[]) {
      selectedEl.style.removeProperty(toKebab(prop));
    }
    storeRef.current.delete(selectedEl);
    const orig = readComputedStyles(selectedEl);
    storeRef.current.set(selectedEl, { overrides: {}, original: orig });
    setOverrides({});
    setOriginal(orig);
    setRevision((r) => r + 1);
  }, [selectedEl, overrides]);

  // Reset ALL accumulated changes across every element
  const resetAll = useCallback(() => {
    for (const [el, entry] of storeRef.current.entries()) {
      if (el instanceof HTMLElement) {
        for (const prop of Object.keys(entry.overrides) as CSSProp[]) {
          el.style.removeProperty(toKebab(prop));
        }
      }
    }
    storeRef.current.clear();
    if (selectedEl) {
      const orig = readComputedStyles(selectedEl);
      storeRef.current.set(selectedEl, { overrides: {}, original: orig });
      setOriginal(orig);
    }
    setOverrides({});
    setRevision((r) => r + 1);
  }, [selectedEl]);

  // Collect all elements that have actual changes
  const getAllChanges = useCallback((): ElementEntry[] => {
    void revision; // depend on revision for reactivity
    const entries: ElementEntry[] = [];
    for (const [
      el,
      { overrides: ov, original: orig },
    ] of storeRef.current.entries()) {
      const realChanges = Object.entries(ov).filter(([p, v]) => v !== orig[p]);
      if (realChanges.length > 0) {
        entries.push({ el, overrides: ov, original: orig });
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
      { overrides: ov, original: orig },
    ] of storeRef.current.entries()) {
      count += Object.entries(ov).filter(([p, v]) => v !== orig[p]).length;
    }
    return count;
  })();

  return {
    getValue,
    setValue,
    overrides,
    original,
    resetCurrent,
    resetAll,
    getAllChanges,
    totalChangeCount,
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
