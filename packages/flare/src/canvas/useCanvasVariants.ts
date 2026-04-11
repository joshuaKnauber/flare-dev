import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasViewport } from "./useCanvasPanZoom";
import type { FrameState } from "./Canvas";

export interface VariantTarget {
  el: Element;
  frameId: string;
  selector: string;
  outerHTML: string;
  x: number;
  y: number;
}

export interface VariantRequest {
  id: string;
  frameId: string;
  selector: string;
  outerHTML: string;
  prompt: string;
  count: number;
}

let _variantId = 0;

function simpleSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const tag = el.tagName.toLowerCase();
  const cls = Array.from(el.classList).slice(0, 3).map((c) => CSS.escape(c)).join(".");
  return cls ? `${tag}.${cls}` : tag;
}

export function useCanvasVariants(
  canvasRef: React.RefObject<HTMLDivElement | null>,
  viewportRef: React.RefObject<CanvasViewport>,
  frames: FrameState[],
) {
  const [variantMode, setVariantMode] = useState(false);
  const [target, setTarget] = useState<VariantTarget | null>(null);
  const [requests, setRequests] = useState<VariantRequest[]>([]);
  const variantModeRef = useRef(false);
  variantModeRef.current = variantMode;

  const startVariantMode = useCallback(() => {
    setVariantMode(true);
    setTarget(null);
  }, []);

  const stopVariantMode = useCallback(() => {
    setVariantMode(false);
    setTarget(null);
  }, []);

  const cancelTarget = useCallback(() => setTarget(null), []);

  const submitVariant = useCallback(
    (prompt: string, count: number): VariantRequest | null => {
      if (!target || !prompt.trim() || count < 1) return null;
      const req: VariantRequest = {
        id: `variant-${++_variantId}`,
        frameId: target.frameId,
        selector: target.selector,
        outerHTML: target.outerHTML,
        prompt: prompt.trim(),
        count,
      };
      setRequests((prev) => [...prev, req]);
      setTarget(null);
      return req;
    },
    [target],
  );

  // Hover highlight + click to select target
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !variantMode) return;

    const hl = document.createElement("div");
    Object.assign(hl.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "2147483646",
      border: "2px solid #a855f7",
      borderRadius: "2px",
      background: "rgba(168, 85, 247, 0.06)",
      display: "none",
      transition: "top 0.06s, left 0.06s, width 0.06s, height 0.06s",
    });
    document.body.appendChild(hl);

    const cleanups: (() => void)[] = [];

    for (const frame of frames) {
      if (frame.isVariant) continue;
      const frameEl = canvas.querySelector<HTMLElement>(
        `[data-frame-id="${frame.id}"]`,
      );
      const iframe = frameEl?.querySelector("iframe") as
        | HTMLIFrameElement
        | null;
      if (!iframe) continue;

      const attach = () => {
        let doc: Document;
        try {
          if (!iframe.contentDocument) return;
          doc = iframe.contentDocument;
        } catch {
          return;
        }

        const onMove = (e: MouseEvent) => {
          if (!variantModeRef.current) return;
          const t = e.target as Element;
          if (!t) {
            hl.style.display = "none";
            return;
          }
          const rect = t.getBoundingClientRect();
          const cr = canvas.getBoundingClientRect();
          const vp = viewportRef.current;
          Object.assign(hl.style, {
            left: `${cr.left + vp.x + (frame.x + rect.left) * vp.zoom}px`,
            top: `${cr.top + vp.y + (frame.y + rect.top) * vp.zoom}px`,
            width: `${rect.width * vp.zoom}px`,
            height: `${rect.height * vp.zoom}px`,
            display: "block",
          });
        };

        const onClick = (e: MouseEvent) => {
          if (!variantModeRef.current) return;
          const t = e.target as Element;
          if (!t) return;
          e.preventDefault();
          e.stopPropagation();
          const rect = t.getBoundingClientRect();
          setTarget({
            el: t,
            frameId: frame.id,
            selector: simpleSelector(t),
            outerHTML: t.outerHTML,
            x: rect.left,
            y: rect.top,
          });
          hl.style.display = "none";
        };

        const onLeave = () => {
          hl.style.display = "none";
        };

        doc.addEventListener("mousemove", onMove, true);
        doc.addEventListener("click", onClick, true);
        doc.addEventListener("mouseleave", onLeave);
        cleanups.push(() => {
          doc.removeEventListener("mousemove", onMove, true);
          doc.removeEventListener("click", onClick, true);
          doc.removeEventListener("mouseleave", onLeave);
        });
      };

      try {
        if (iframe.contentDocument?.readyState === "complete") {
          attach();
        } else {
          const onLoad = () => attach();
          iframe.addEventListener("load", onLoad, { once: true });
          cleanups.push(() => iframe.removeEventListener("load", onLoad));
        }
      } catch {}
    }

    return () => {
      cleanups.forEach((fn) => fn());
      hl.remove();
    };
  }, [canvasRef, viewportRef, frames, variantMode]);

  return {
    variantMode,
    target,
    requests,
    startVariantMode,
    stopVariantMode,
    cancelTarget,
    submitVariant,
  };
}
