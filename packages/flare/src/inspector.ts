/**
 * Shared overlay rendering for element inspection.
 *
 * Used by both panel mode (identity transform, overlays on document.body)
 * and canvas mode (canvas transform accounting for iframe offset + zoom).
 */

import { getElementLabel } from "./utils";

// ── Types ─────────────────────────────────────────

export interface CoordTransform {
  point(x: number, y: number): { x: number; y: number };
  scale: number;
}

export interface OverlaySet {
  show(el: Element, transform: CoordTransform): void;
  hide(): void;
  destroy(): void;
  setTooltip(text: string): void;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

// ── Constants ─────────────────────────────────────

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

const GAP_STRIPE =
  "repeating-linear-gradient(-45deg, rgba(180,120,255,0.14), rgba(180,120,255,0.14) 2px, rgba(180,120,255,0.05) 2px, rgba(180,120,255,0.05) 5px)";
const GAP_POOL = 16;

// ── Transforms ────────────────────────────────────

export function identityTransform(): CoordTransform {
  return { point: (x, y) => ({ x, y }), scale: 1 };
}

export function canvasTransform(
  frameX: number,
  frameY: number,
  viewport: { x: number; y: number; zoom: number },
  canvasOffset: { x: number; y: number } = { x: 0, y: 0 },
): CoordTransform {
  return {
    point(x, y) {
      return {
        x: canvasOffset.x + (frameX + x) * viewport.zoom + viewport.x,
        y: canvasOffset.y + (frameY + y) * viewport.zoom + viewport.y,
      };
    },
    scale: viewport.zoom,
  };
}

// ── Metrics ───────────────────────────────────────

export function getBoxMetrics(el: Element) {
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

// ── Overlay DOM ───────────────────────────────────

function createDiv(
  container: HTMLElement,
  attr: string,
  styles: Partial<CSSStyleDeclaration>,
) {
  const div = document.createElement("div");
  div.setAttribute(attr, "");
  Object.assign(div.style, styles);
  container.appendChild(div);
  return div;
}

export function createOverlaySet(container: HTMLElement): OverlaySet {
  const marginEl = createDiv(container, "data-flare-overlay", {
    ...OVERLAY_BASE,
    background: "rgba(255, 122, 0, 0.08)",
    transition: BOX_TRANSITION,
  });
  const paddingEl = createDiv(container, "data-flare-overlay", {
    ...OVERLAY_BASE,
    background: "rgba(110, 200, 120, 0.12)",
    border: "1.5px solid rgba(255, 122, 0, 0.55)",
    borderRadius: "2px",
    transition: BOX_TRANSITION,
  });
  const contentEl = createDiv(container, "data-flare-overlay", {
    ...OVERLAY_BASE,
    background: "rgba(100, 160, 255, 0.12)",
    transition: BOX_TRANSITION,
  });

  const mLabels = Array.from({ length: 4 }, () =>
    createDiv(container, "data-flare-overlay", {
      ...LABEL_BASE,
      background: "rgba(255, 122, 0, 0.8)",
    }),
  );
  const pLabels = Array.from({ length: 4 }, () =>
    createDiv(container, "data-flare-overlay", {
      ...LABEL_BASE,
      background: "rgba(110, 200, 120, 0.8)",
    }),
  );

  const gapStrips = Array.from({ length: GAP_POOL }, () =>
    createDiv(container, "data-flare-overlay", {
      ...OVERLAY_BASE,
      background: GAP_STRIPE,
    }),
  );
  const gapLabels = Array.from({ length: GAP_POOL }, () =>
    createDiv(container, "data-flare-overlay", {
      ...LABEL_BASE,
      background: "rgba(180, 120, 255, 0.85)",
    }),
  );

  const tooltip = createDiv(container, "data-flare-tooltip", TOOLTIP_STYLES);
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

  function posLabel(label: HTMLDivElement, val: number, x: number, y: number) {
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
  }

  return {
    show(el, t) {
      const { rect, margin: m, padding: p, border: b } = getBoxMetrics(el);
      const s = t.scale;

      // Margin box
      const mTL = t.point(rect.left - m.left, rect.top - m.top);
      Object.assign(marginEl.style, {
        top: `${mTL.y}px`,
        left: `${mTL.x}px`,
        width: `${(rect.width + m.left + m.right) * s}px`,
        height: `${(rect.height + m.top + m.bottom) * s}px`,
        display: "block",
      });

      // Border box
      const bTL = t.point(rect.left, rect.top);
      Object.assign(paddingEl.style, {
        top: `${bTL.y}px`,
        left: `${bTL.x}px`,
        width: `${rect.width * s}px`,
        height: `${rect.height * s}px`,
        display: "block",
      });

      // Content box
      const cTop = rect.top + b.top + p.top;
      const cLeft = rect.left + b.left + p.left;
      const cW = Math.max(0, rect.width - b.left - p.left - p.right - b.right);
      const cH = Math.max(
        0,
        rect.height - b.top - p.top - p.bottom - b.bottom,
      );
      const cTL = t.point(cLeft, cTop);
      Object.assign(contentEl.style, {
        top: `${cTL.y}px`,
        left: `${cTL.x}px`,
        width: `${cW * s}px`,
        height: `${cH * s}px`,
        display: "block",
      });

      // Margin labels
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const ml0 = t.point(cx, rect.top - m.top / 2);
      const ml1 = t.point(rect.right + m.right / 2, cy);
      const ml2 = t.point(cx, rect.bottom + m.bottom / 2);
      const ml3 = t.point(rect.left - m.left / 2, cy);
      posLabel(mLabels[0], m.top, ml0.x, ml0.y);
      posLabel(mLabels[1], m.right, ml1.x, ml1.y);
      posLabel(mLabels[2], m.bottom, ml2.x, ml2.y);
      posLabel(mLabels[3], m.left, ml3.x, ml3.y);

      // Padding labels
      const pl0 = t.point(cx, rect.top + b.top + p.top / 2);
      const pl1 = t.point(rect.right - b.right - p.right / 2, cy);
      const pl2 = t.point(cx, rect.bottom - b.bottom - p.bottom / 2);
      const pl3 = t.point(rect.left + b.left + p.left / 2, cy);
      posLabel(pLabels[0], p.top, pl0.x, pl0.y);
      posLabel(pLabels[1], p.right, pl1.x, pl1.y);
      posLabel(pLabels[2], p.bottom, pl2.x, pl2.y);
      posLabel(pLabels[3], p.left, pl3.x, pl3.y);

      // Gap overlays
      const gaps = getGapOverlays(el, {
        top: cTop,
        left: cLeft,
        width: cW,
        height: cH,
      });
      for (let i = 0; i < GAP_POOL; i++) {
        if (i < gaps.length) {
          const g = gaps[i];
          const gTL = t.point(g.left, g.top);
          Object.assign(gapStrips[i].style, {
            top: `${gTL.y}px`,
            left: `${gTL.x}px`,
            width: `${g.width * s}px`,
            height: `${g.height * s}px`,
            display: "block",
          });
          gapLabels[i].textContent = `${Math.round(Math.min(g.width, g.height))}`;
          const glC = t.point(g.left + g.width / 2, g.top + g.height / 2);
          Object.assign(gapLabels[i].style, {
            top: `${glC.y}px`,
            left: `${glC.x}px`,
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
      const above = rect.top - m.top > 28;
      const tP = above
        ? t.point(rect.left, rect.top - m.top - 24)
        : t.point(rect.left, rect.bottom + m.bottom + 6);
      Object.assign(tooltip.style, {
        top: `${tP.y}px`,
        left: `${tP.x}px`,
        display: "block",
      });
    },

    hide() {
      allEls.forEach((el) => {
        el.style.display = "none";
      });
    },

    setTooltip(text) {
      tooltip.textContent = text;
    },

    destroy() {
      allEls.forEach((el) => el.remove());
    },
  };
}
