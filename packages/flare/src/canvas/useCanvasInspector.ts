import { useCallback, useEffect, useRef, useState } from "react";
import {
  canvasTransform,
  createOverlaySet,
  type OverlaySet,
} from "../inspector";
import type { CanvasViewport } from "./useCanvasPanZoom";
import type { FrameState } from "./Canvas";

/**
 * Element inspection for canvas mode.
 *
 * When inspecting, attaches to ALL frames — hover shows box-model overlays,
 * click selects the element and identifies its parent frame.
 */
export function useCanvasInspector(
  canvasRef: React.RefObject<HTMLDivElement | null>,
  viewportRef: React.RefObject<CanvasViewport>,
  frames: FrameState[],
) {
  const [inspecting, setInspecting] = useState(false);
  const [selectedEl, setSelectedEl] = useState<Element | null>(null);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const overlayRef = useRef<OverlaySet | null>(null);
  const inspectingRef = useRef(false);
  inspectingRef.current = inspecting;

  const startInspecting = useCallback(() => setInspecting(true), []);
  const stopInspecting = useCallback(() => {
    setInspecting(false);
    overlayRef.current?.hide();
  }, []);
  const selectElement = useCallback(
    (el: Element | null, frameId?: string | null) => {
      setSelectedEl(el);
      setSelectedFrameId(frameId ?? null);
    },
    [],
  );

  // Attach to ALL frames when inspecting
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !inspecting) return;

    const overlay = createOverlaySet(document.body);
    overlayRef.current = overlay;
    const cleanups: (() => void)[] = [];

    for (const frame of frames) {
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
          if (!inspectingRef.current) return;
          const target = e.target as Element;
          if (!target) {
            overlay.hide();
            return;
          }
          const cr = canvas.getBoundingClientRect();
          const t = canvasTransform(frame.x, frame.y, viewportRef.current, {
            x: cr.left,
            y: cr.top,
          });
          overlay.show(target, t);
        };

        const onClick = (e: MouseEvent) => {
          if (!inspectingRef.current) return;
          const target = e.target as Element;
          if (!target) return;
          e.preventDefault();
          e.stopPropagation();
          setSelectedEl(target);
          setSelectedFrameId(frame.id);
          setInspecting(false);
          overlay.hide();
        };

        const onLeave = () => {
          if (inspectingRef.current) overlay.hide();
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
      } catch {
        // Cross-origin guard
      }
    }

    return () => {
      cleanups.forEach((fn) => fn());
      overlay.destroy();
      overlayRef.current = null;
    };
  }, [canvasRef, viewportRef, frames, inspecting]);

  return {
    inspecting,
    selectedEl,
    selectedFrameId,
    startInspecting,
    stopInspecting,
    selectElement,
  };
}
