import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasViewport } from "./useCanvasPanZoom";
import type { FrameState } from "./Canvas";

export interface CanvasComment {
  id: string;
  frameId: string;
  el: Element;
  selector: string;
  outerHTML: string;
  text: string;
  x: number; // iframe-local
  y: number;
}

export interface PendingComment {
  el: Element;
  frameId: string;
  x: number;
  y: number;
}

let _commentId = 0;

function simpleSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const cls = Array.from(el.classList).slice(0, 3).join(".");
  return cls ? `${tag}.${cls}` : tag;
}

export function useCanvasComments(
  canvasRef: React.RefObject<HTMLDivElement | null>,
  viewportRef: React.RefObject<CanvasViewport>,
  frames: FrameState[],
) {
  const [commenting, setCommenting] = useState(false);
  const [comments, setComments] = useState<CanvasComment[]>([]);
  const [pending, setPending] = useState<PendingComment | null>(null);
  const commentingRef = useRef(false);
  commentingRef.current = commenting;

  const startCommenting = useCallback(() => {
    setCommenting(true);
    setPending(null);
  }, []);

  const stopCommenting = useCallback(() => {
    setCommenting(false);
    setPending(null);
  }, []);

  const submitComment = useCallback(
    (text: string): CanvasComment | null => {
      if (!pending || !text.trim()) return null;
      const comment: CanvasComment = {
        id: `comment-${++_commentId}`,
        frameId: pending.frameId,
        el: pending.el,
        selector: simpleSelector(pending.el),
        outerHTML: pending.el.outerHTML,
        text: text.trim(),
        x: pending.x,
        y: pending.y,
      };
      setComments((prev) => [...prev, comment]);
      setPending(null);
      return comment;
    },
    [pending],
  );

  const cancelPending = useCallback(() => setPending(null), []);

  const removeComment = useCallback((id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // Hover highlight + click to place — attaches to ALL frames
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !commenting) return;

    // Simple bounding box highlight
    const hl = document.createElement("div");
    Object.assign(hl.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "2147483646",
      border: "2px solid #3b82f6",
      borderRadius: "2px",
      background: "rgba(59, 130, 246, 0.06)",
      display: "none",
      transition: "top 0.06s, left 0.06s, width 0.06s, height 0.06s",
    });
    document.body.appendChild(hl);

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
          if (!commentingRef.current) return;
          const target = e.target as Element;
          if (!target) {
            hl.style.display = "none";
            return;
          }
          const rect = target.getBoundingClientRect();
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
          if (!commentingRef.current) return;
          const target = e.target as Element;
          if (!target) return;
          e.preventDefault();
          e.stopPropagation();
          const rect = target.getBoundingClientRect();
          setPending({
            el: target,
            frameId: frame.id,
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
      } catch {
        // cross-origin
      }
    }

    return () => {
      cleanups.forEach((fn) => fn());
      hl.remove();
    };
  }, [canvasRef, viewportRef, frames, commenting]);

  return {
    commenting,
    comments,
    pending,
    startCommenting,
    stopCommenting,
    submitComment,
    cancelPending,
    removeComment,
  };
}
