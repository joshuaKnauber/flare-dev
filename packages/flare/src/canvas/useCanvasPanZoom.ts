import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;
const PINCH_ZOOM_SPEED = 0.01;
const WHEEL_ZOOM_SPEED = 0.002;

/* ── Input-device detection ────────────────────────────
 *
 * Distinguishing mouse-wheel from trackpad-scroll is notoriously hard
 * in the browser. We combine three signals:
 *
 *  1. deltaMode !== 0 (line/page units) → always mouse
 *  2. Non-zero deltaX or fractional deltaY → always trackpad
 *  3. Event timing: trackpads fire at 60-120 Hz (≤16 ms apart),
 *     mouse wheels fire at ≤15 Hz (≥70 ms apart)
 *
 * We default to trackpad (pan) when uncertain, so trackpad users
 * never get an accidental zoom. Mouse users may see one pan tick
 * before classification locks in, which is barely perceptible.
 * ────────────────────────────────────────────────────── */
let _samples: number[] = [];
let _isMouse = false;

function isMouseWheel(e: WheelEvent): boolean {
  if (e.deltaMode !== 0) return true;

  if (e.deltaX !== 0) {
    _isMouse = false;
    _samples = [];
    return false;
  }

  if (!Number.isInteger(e.deltaY)) {
    _isMouse = false;
    _samples = [];
    return false;
  }

  const now = e.timeStamp;

  if (_samples.length > 0 && now - _samples[_samples.length - 1] > 400) {
    _samples = [];
    _isMouse = false;
  }

  _samples.push(now);
  if (_samples.length > 10) _samples = _samples.slice(-10);

  if (_samples.length === 1) {
    _isMouse = Math.abs(e.deltaY) >= 100;
    return _isMouse;
  }

  if (_samples.length >= 3) {
    let total = 0;
    for (let i = 1; i < _samples.length; i++) {
      total += _samples[i] - _samples[i - 1];
    }
    _isMouse = total / (_samples.length - 1) > 60;
  }

  return _isMouse;
}

/* ── Zoom helpers ──────────────────────────────────── */

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

function zoomViewport(
  v: CanvasViewport,
  delta: number,
  cx: number,
  cy: number,
  speed: number,
): CanvasViewport {
  const z = clampZoom(v.zoom * Math.pow(2, -delta * speed));
  const s = z / v.zoom;
  return { zoom: z, x: cx - (cx - v.x) * s, y: cy - (cy - v.y) * s };
}

/* ── Hook ──────────────────────────────────────────────
 *
 * Viewport lives in a ref — pan/zoom update the DOM directly
 * without triggering React renders. Only structural changes
 * (frames, selection) cause re-renders in the parent component.
 * ────────────────────────────────────────────────────── */

export function useCanvasPanZoom(initial: CanvasViewport) {
  const viewportRef = useRef(initial);
  const canvasRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLSpanElement>(null);
  const panActive = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  /** Push viewport to the DOM — no React render. */
  const apply = useCallback(() => {
    const v = viewportRef.current;
    if (surfaceRef.current) {
      surfaceRef.current.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.zoom})`;
      surfaceRef.current.style.setProperty("--f-inv-zoom", `${1 / v.zoom}`);
    }
    if (zoomRef.current) {
      zoomRef.current.textContent = `${Math.round(v.zoom * 100)}%`;
    }
  }, []);

  // Apply initial viewport before first paint
  useLayoutEffect(() => {
    apply();
  }, [apply]);

  // ── Wheel ──────────────────────────────────────────

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      // Don't intercept scroll if cursor is over an interactive iframe
      const target = e.target as HTMLElement;
      if (target.closest?.(".f-frame-active")) return;

      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const v = viewportRef.current;

      if (e.ctrlKey || e.metaKey) {
        viewportRef.current = zoomViewport(v, e.deltaY, cx, cy, PINCH_ZOOM_SPEED);
      } else if (isMouseWheel(e)) {
        if (e.shiftKey) {
          viewportRef.current = { ...v, x: v.x - e.deltaY };
        } else {
          viewportRef.current = zoomViewport(v, e.deltaY, cx, cy, WHEEL_ZOOM_SPEED);
        }
      } else {
        viewportRef.current = { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY };
      }
      apply();
    },
    [apply],
  );

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ── Pointer (pan) ──────────────────────────────────

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest(".f-canvas-hud") || t.closest(".f-canvas-topright") || t.closest(".f-canvas-frame-dup") || t.closest(".f-canvas-frame-delete") || t.closest(".f-canvas-frame-choose") || t.closest(".f-canvas-frame-dismiss") || t.closest(".f-canvas-frame-push") || t.closest(".f-canvas-frame-label") || t.closest(".f-variant-popover") || t.closest(".f-comment-input")) return;
    if (e.button !== 0 && e.button !== 1) return;
    if (e.button === 1) e.preventDefault();

    panActive.current = true;
    canvasRef.current?.classList.add("f-canvas-panning");
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!panActive.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      const v = viewportRef.current;
      viewportRef.current = { ...v, x: v.x + dx, y: v.y + dy };
      apply();
    },
    [apply],
  );

  const onPointerUp = useCallback(() => {
    if (!panActive.current) return;
    panActive.current = false;
    canvasRef.current?.classList.remove("f-canvas-panning");
  }, []);

  // ── Fit ────────────────────────────────────────────

  const fitToView = useCallback(
    (cx: number, cy: number, cw: number, ch: number, vw: number, vh: number, maxZoom = 1) => {
      const pad = 80;
      const z = Math.min((vw - pad * 2) / cw, (vh - pad * 2) / ch, maxZoom);
      viewportRef.current = {
        zoom: z,
        x: vw / 2 - (cx + cw / 2) * z,
        y: vh / 2 - (cy + ch / 2) * z,
      };
      apply();
    },
    [apply],
  );

  return {
    viewportRef,
    canvasRef,
    surfaceRef,
    zoomRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    fitToView,
  };
}
