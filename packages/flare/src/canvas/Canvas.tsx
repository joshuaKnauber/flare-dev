import {
  ArrowUpRight,
  Copy,
  Ellipsis,
  ExternalLink,
  Maximize,
  MessageSquare,
  Split,
  SquareMousePointer,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Breadcrumb,
  ElementComment,
  PropertySections,
  SourceReference,
} from "../components";
import { useElementSource, useStyleEditor, useTheme } from "../hooks";
import { getBridgeStatus, pollAgentResponses, pushSnapshotToAgent } from "../bridge-client";
import { getCssSelector, serializeElementChange } from "../utils";
import type { ElementEntry } from "../utils";
import { useCanvasComments, type PendingComment, type CanvasComment } from "./useCanvasComments";
import { useCanvasVariants, type VariantTarget } from "./useCanvasVariants";
import { type ColumnGuide, defaultGuide, GuideOverlay, GuideSettings } from "./guides";
import { useCanvasInspector } from "./useCanvasInspector";
import { useCanvasPanZoom, type CanvasViewport } from "./useCanvasPanZoom";
import { IconMoon, IconSun } from "../icons";

interface CanvasProps {
  onClose: () => void;
  shadowHost: HTMLElement;
}

export interface FrameState {
  id: string;
  url: string;
  width: number;
  height: number;
  x: number;
  y: number;
  isVariant?: boolean;
  variantRequestId?: string;
  variantIndex?: number;
  loading?: boolean;
}

let _nextId = 0;

function embedUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set("__flare_embed", "1");
  return url.toString();
}

const FRAME_GAP = 100;

export function Canvas({ onClose, shadowHost }: CanvasProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const spaceRef = useRef(false);
  const closingRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme(shadowHost);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    let id = requestAnimationFrame(() => {
      id = 0;
      document.addEventListener("pointerdown", onDown);
    });
    function onDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    }
    return () => {
      if (id) cancelAnimationFrame(id);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [menuOpen]);

  const [frames, setFrames] = useState<FrameState[]>(() => [
    {
      id: `frame-${++_nextId}`,
      url: embedUrl(),
      width: window.innerWidth,
      height: window.innerHeight,
      x: 0,
      y: 0,
    },
  ]);
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);

  // Content changes from applied comments (tracked for push)
  const [contentChanges, setContentChanges] = useState<
    { frameId: string; selector: string; originalHTML: string; newHTML: string; comment: string }[]
  >([]);
  const [guides, setGuides] = useState<ColumnGuide[]>(() => [defaultGuide()]);
  const [guidesVisible, setGuidesVisible] = useState(false);

  const initZoom = 0.65;

  const {
    viewportRef,
    canvasRef,
    surfaceRef,
    zoomRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    fitToView,
  } = useCanvasPanZoom({
    zoom: initZoom,
    x: (window.innerWidth - window.innerWidth * initZoom) / 2,
    y: (window.innerHeight - window.innerHeight * initZoom) / 2,
  });

  // ── Element inspection ──────────────────────────
  const {
    inspecting,
    selectedEl,
    selectedFrameId,
    startInspecting,
    stopInspecting,
    selectElement,
  } = useCanvasInspector(canvasRef, viewportRef, frames);

  const {
    commenting,
    comments,
    pending: pendingComment,
    startCommenting,
    stopCommenting,
    submitComment: rawSubmitComment,
    cancelPending,
    removeComment,
    addComment,
    updateCommentStatus,
  } = useCanvasComments(canvasRef, viewportRef, frames);

  const {
    variantMode,
    target: variantTarget,
    startVariantMode,
    stopVariantMode,
    cancelTarget: cancelVariantTarget,
    submitVariant: rawSubmitVariant,
  } = useCanvasVariants(canvasRef, viewportRef, frames);

  // When inspector selects an element, also activate its frame
  useEffect(() => {
    if (selectedFrameId) setActiveFrameId(selectedFrameId);
  }, [selectedFrameId]);

  const editor = useStyleEditor(selectedEl);
  const sourceInfo = useElementSource(selectedEl);

  const commentKeyRef = useRef(0);
  const prevElRef = useRef(selectedEl);
  if (prevElRef.current !== selectedEl) {
    prevElRef.current = selectedEl;
    commentKeyRef.current += 1;
  }

  useEffect(() => {
    if (!selectedEl) return;
    editor.setElementSourceInfo(selectedEl, sourceInfo);
  }, [selectedEl, editor.setElementSourceInfo, sourceInfo]);

  // ── Bridge status ─────────────────────────────────
  const [bridgeAvailable, setBridgeAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      const status = await getBridgeStatus();
      if (active) setBridgeAvailable(status.available);
    };
    void poll();
    const id = setInterval(() => void poll(), 2000);
    return () => { active = false; clearInterval(id); };
  }, []);

  // ── Poll for agent DOM responses ─────────────────
  useEffect(() => {
    if (!bridgeAvailable) return;
    let active = true;
    const poll = async () => {
      const responses = await pollAgentResponses();
      if (!active || responses.length === 0) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      for (const resp of responses) {
        // Variant response → find the placeholder frame and apply
        if (resp.variantRequestId) {
          const reqId = resp.variantRequestId;
          // Find the first loading placeholder for this request
          const placeholder = framesRef.current.find(
            (f) => f.variantRequestId === reqId && f.loading,
          );
          if (placeholder) {
            // Apply the outerHTML after the iframe loads
            const applyToFrame = () => {
              const frameEl = canvas.querySelector<HTMLElement>(
                `[data-frame-id="${placeholder.id}"]`,
              );
              const iframe = frameEl?.querySelector("iframe") as HTMLIFrameElement | null;
              if (!iframe) return;
              const apply = () => {
                let success = false;
                let error = "";
                try {
                  const doc = iframe.contentDocument;
                  if (!doc) { error = "No contentDocument"; return; }
                  let el: Element | null = null;
                  try { el = doc.querySelector(resp.selector); } catch {}
                  if (!el) {
                    try {
                      const escaped = resp.selector.replace(
                        /\.([^.#\s]+)/g, (_, cls: string) => `.${CSS.escape(cls)}`,
                      );
                      el = doc.querySelector(escaped);
                    } catch {}
                  }
                  if (el) {
                    el.outerHTML = resp.outerHTML;
                    success = true;
                  } else {
                    error = `Element not found: ${resp.selector}`;
                  }
                } catch (err) {
                  error = err instanceof Error ? err.message : String(err);
                }
                // Mark as done loading
                setFrames((prev) =>
                  prev.map((f) =>
                    f.id === placeholder.id ? { ...f, loading: !success } : f,
                  ),
                );
                // Retry on failure
                if (!success) {
                  const retrySnapshot = {
                    updatedAt: new Date().toISOString(),
                    changes: [{
                      selector: resp.selector,
                      path: resp.selector,
                      textSnippet: "",
                      comment: [
                        `[VARIANT RETRY] Previous variant response failed to apply: ${error}`,
                        `Request ID: ${reqId}`,
                        `Selector used: ${resp.selector}`,
                        ``,
                        `Original outerHTML that failed:`,
                        resp.outerHTML,
                        ``,
                        `Please respond again with a corrected selector and outerHTML via POST /api/agent/respond with variantRequestId: "${reqId}"`,
                      ].join("\n"),
                      changes: [],
                    }],
                  };
                  void pushSnapshotToAgent(retrySnapshot);
                }
              };
              if (iframe.contentDocument?.readyState === "complete") {
                apply();
              } else {
                iframe.addEventListener("load", apply, { once: true });
              }
            };
            setTimeout(applyToFrame, 100);
          }
          continue;
        }

        // Find the matching comment to determine which frame to target
        const match = comments.find((c) => c.selector === resp.selector && c.status === "pending");
        let applied = false;
        let error = "";

        // Target only the specific frame's iframe, not all iframes
        const targetFrameId = match?.frameId;
        const targetFrameEl = targetFrameId
          ? canvas.querySelector<HTMLElement>(`[data-frame-id="${targetFrameId}"]`)
          : null;
        const targetIframe = targetFrameEl
          ? (targetFrameEl.querySelector("iframe") as HTMLIFrameElement | null)
          : null;
        const iframesToCheck = targetIframe
          ? [targetIframe]
          : Array.from(canvas.querySelectorAll<HTMLIFrameElement>(".f-canvas-iframe"));

        for (const iframe of iframesToCheck) {
          try {
            const doc = iframe.contentDocument;
            if (!doc) continue;

            let el: Element | null = null;
            try {
              el = doc.querySelector(resp.selector);
            } catch {
              try {
                const escaped = resp.selector.replace(
                  /\.([^.#\s]+)/g,
                  (_, cls: string) => `.${CSS.escape(cls)}`,
                );
                el = doc.querySelector(escaped);
              } catch { /* selector unusable */ }
            }

            if (el) {
              const originalHTML = el.outerHTML;
              el.outerHTML = resp.outerHTML;
              applied = true;
              if (match) {
                updateCommentStatus(match.id, "applied");
                setContentChanges((prev) => [
                  ...prev,
                  {
                    frameId: match.frameId,
                    selector: match.selector,
                    originalHTML,
                    newHTML: resp.outerHTML,
                    comment: match.text,
                  },
                ]);
              }
              break;
            }
          } catch (err) {
            error = err instanceof Error ? err.message : String(err);
          }
        }

        if (!applied) {
          // Mark matching comment as failed
          const match = comments.find((c) => c.selector === resp.selector);
          if (match && match.status === "pending") {
            updateCommentStatus(match.id, "failed");
            // Retry: re-push with error context
            void pushCommentRef.current({
              ...match,
              text: `[RETRY] Previous attempt failed${error ? `: ${error}` : ""}. Original request: ${match.text}`,
            });
          }
        }
      }
    };
    const id = setInterval(() => void poll(), 1000);
    return () => { active = false; clearInterval(id); };
  }, [bridgeAvailable, canvasRef, comments, removeComment, updateCommentStatus]);

  // ── Per-frame push ──────────────────────────────
  const getFrameChanges = useCallback(
    (frameId: string): ElementEntry[] => {
      const canvas = canvasRef.current;
      if (!canvas) return [];
      const frameEl = canvas.querySelector<HTMLElement>(
        `[data-frame-id="${frameId}"]`,
      );
      const iframe = frameEl?.querySelector("iframe") as HTMLIFrameElement | null;
      if (!iframe?.contentDocument) return [];
      const doc = iframe.contentDocument;
      return editor.getAllChanges().filter((entry) => {
        try { return doc.contains(entry.el); } catch { return false; }
      });
    },
    [canvasRef, editor.getAllChanges],
  );

  const pushFrame = useCallback(
    async (frameId: string) => {
      const entries = getFrameChanges(frameId);
      const frameContentChanges = contentChanges.filter((c) => c.frameId === frameId);
      if (entries.length === 0 && frameContentChanges.length === 0) return;

      // Serialize style changes
      const styleChanges = entries.map((e) => serializeElementChange(e));

      // Serialize content changes as comment-only entries
      const contentEntries = frameContentChanges.map((c) => ({
        selector: c.selector,
        path: c.selector,
        comment: `Apply this content change to source:\n${c.comment}\n\nOriginal HTML:\n${c.originalHTML}\n\nNew HTML (apply this):\n${c.newHTML}`,
        changes: [],
      }));

      const snapshot = {
        updatedAt: new Date().toISOString(),
        changes: [...styleChanges, ...contentEntries],
      };
      const result = await pushSnapshotToAgent(snapshot);
      if (result.ok) {
        if (entries.length > 0) editor.acknowledgeEntries(entries);
        setContentChanges((prev) => prev.filter((c) => c.frameId !== frameId));
        // Remove all other frames — pushed frame is now the source of truth
        setFrames((prev) => prev.filter((f) => f.id === frameId));
        setActiveFrameId(frameId);
      }
    },
    [getFrameChanges, editor.acknowledgeEntries],
  );

  // ── Immediate comment push ──────────────────────
  const pushComment = useCallback(
    async (comment: CanvasComment) => {
      const snapshot = {
        updatedAt: new Date().toISOString(),
        changes: [
          {
            selector: comment.selector,
            path: comment.selector,
            textSnippet: comment.el.textContent?.slice(0, 80) || undefined,
            comment: `${comment.text}\n\nCurrent element HTML:\n${comment.outerHTML}`,
            changes: [],
          },
        ],
      };
      await pushSnapshotToAgent(snapshot);
    },
    [],
  );

  const pushCommentRef = useRef(pushComment);
  pushCommentRef.current = pushComment;

  const handleSubmitComment = useCallback(
    (text: string) => {
      const comment = rawSubmitComment(text);
      if (comment) void pushComment(comment);
    },
    [rawSubmitComment, pushComment],
  );

  // ── Variant submission ───────────────────────────
  const handleSubmitVariant = useCallback(
    (prompt: string, count: number) => {
      const req = rawSubmitVariant(prompt, count);
      if (!req) return;

      // Find the source frame to position variants below it
      const sourceFrame = framesRef.current.find((f) => f.id === req.frameId);
      if (!sourceFrame) return;

      // Remove any existing variants first
      setFrames((prev) => prev.filter((f) => !f.isVariant));

      // Create placeholder frames (loading skeletons) stacked vertically
      const VARIANT_GAP = 40;
      const VARIANT_TOP_GAP = 120;
      const VARIANT_PAD = 30; // padding inside the dashed container
      const placeholders: FrameState[] = [];
      for (let i = 0; i < count; i++) {
        placeholders.push({
          id: `variant-${req.id}-${i}`,
          url: sourceFrame.url,
          width: sourceFrame.width,
          height: sourceFrame.height,
          x: sourceFrame.x,
          y: sourceFrame.y + sourceFrame.height + VARIANT_TOP_GAP + VARIANT_PAD + i * (sourceFrame.height + VARIANT_GAP),
          isVariant: true,
          variantRequestId: req.id,
          variantIndex: i,
          loading: true,
        });
      }
      setFrames((prev) => [...prev, ...placeholders]);

      // Stop variant mode
      stopVariantMode();

      // Push variant request to bridge
      const snapshot = {
        updatedAt: new Date().toISOString(),
        changes: [
          {
            selector: req.selector,
            path: req.selector,
            textSnippet: "",
            comment: [
              `[VARIANT REQUEST] Generate ${req.count} variant(s) of this element.`,
              `Prompt: ${req.prompt}`,
              `Request ID: ${req.id}`,
              ``,
              `Current element HTML:`,
              req.outerHTML,
              ``,
              `Respond with ${req.count} separate POST requests to /api/agent/respond, each with:`,
              `{ "origin": "<origin>", "selector": "${req.selector}", "outerHTML": "<modified html>", "variantRequestId": "${req.id}" }`,
            ].join("\n"),
            changes: [],
          },
        ],
      };
      void pushSnapshotToAgent(snapshot);
    },
    [rawSubmitVariant, stopVariantMode],
  );

  // Toggle inspecting/commenting class on canvas for pointer-events + cursor
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.classList.toggle("f-canvas-inspecting", inspecting);
    el.classList.toggle("f-canvas-commenting", commenting);
    el.classList.toggle("f-canvas-variant-mode", variantMode);
  }, [inspecting, commenting, variantMode, canvasRef]);

  // ── Close with exit transition ───────────────────
  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const el = shellRef.current;
    if (el) {
      el.classList.remove("f-canvas-visible");
      el.addEventListener("transitionend", () => onClose(), { once: true });
      setTimeout(onClose, 400);
    } else {
      onClose();
    }
  }, [onClose]);

  // ── Duplicate ─────────────────────────────────────
  const deleteFrame = useCallback((frameId: string) => {
    const all = framesRef.current;
    const mainFrames = all.filter((f) => !f.isVariant);
    if (mainFrames.length <= 1) return;
    const deleted = all.find((f) => f.id === frameId);
    if (!deleted || deleted.isVariant) return;
    // Remove the frame and its variants
    const remaining = all.filter(
      (f) => f.id !== frameId && f.variantRequestId !== frameId,
    );
    // Shift frames that were to the right of the deleted one
    const shifted = remaining.map((f) => {
      if (!f.isVariant && f.y === deleted.y && f.x > deleted.x) {
        return { ...f, x: f.x - deleted.width - FRAME_GAP };
      }
      return f;
    });
    setFrames(shifted);
    if (activeFrameId === frameId) {
      setActiveFrameId(null);
      selectElement(null);
    }
  }, [activeFrameId, selectElement]);

  const chooseVariant = useCallback((variantFrameId: string) => {
    const all = framesRef.current;
    const variant = all.find((f) => f.id === variantFrameId);
    if (!variant || !variant.isVariant || !variant.variantRequestId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Find the variant's iframe and the source frame's iframe
    const variantEl = canvas.querySelector<HTMLElement>(`[data-frame-id="${variant.id}"]`);
    const variantIframe = variantEl?.querySelector("iframe") as HTMLIFrameElement | null;

    // Find source frame — a non-variant frame (the one the variants were generated from)
    // Use the first non-variant frame at the expected position
    const reqId = variant.variantRequestId;
    const sourceFrame = all.find((f) => !f.isVariant);
    if (!sourceFrame) return;
    const sourceEl = canvas.querySelector<HTMLElement>(`[data-frame-id="${sourceFrame.id}"]`);
    const sourceIframe = sourceEl?.querySelector("iframe") as HTMLIFrameElement | null;

    if (variantIframe?.contentDocument && sourceIframe?.contentDocument) {
      // Copy the variant's full body HTML to the source frame
      const variantBody = variantIframe.contentDocument.body;
      const sourceBody = sourceIframe.contentDocument.body;
      sourceBody.innerHTML = variantBody.innerHTML;

      // Track as a content change for pushing later
      setContentChanges((prev) => [
        ...prev,
        {
          frameId: sourceFrame.id,
          selector: "body",
          originalHTML: "",
          newHTML: sourceBody.innerHTML,
          comment: `Applied variant ${(variant.variantIndex ?? 0) + 1}`,
        },
      ]);
    }

    // Remove all variants in this group
    setFrames((prev) => prev.filter((f) => f.variantRequestId !== reqId));
  }, [canvasRef]);

  const duplicateFrame = useCallback((frameId: string) => {
    const frame = framesRef.current.find((f) => f.id === frameId);
    if (!frame) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Place to the right of the rightmost frame at the same y level
    const sameRow = framesRef.current.filter(
      (f) => !f.isVariant && Math.abs(f.y - frame.y) < 10,
    );
    const rightEdge = Math.max(...sameRow.map((f) => f.x + f.width));
    const dupId = `frame-${++_nextId}`;
    const dup: FrameState = {
      ...frame,
      id: dupId,
      x: rightEdge + FRAME_GAP,
    };
    setFrames((prev) => [...prev, dup]);

    // Capture source body HTML (includes inline style changes + DOM mods)
    const sourceEl = canvas.querySelector<HTMLElement>(`[data-frame-id="${frameId}"]`);
    const sourceIframe = sourceEl?.querySelector("iframe") as HTMLIFrameElement | null;
    const sourceBodyHTML = sourceIframe?.contentDocument?.body?.innerHTML;

    // Copy content changes + convert style editor changes to content changes
    const styleEntries = getFrameChanges(frameId);
    const styleAsContent = styleEntries.map((entry) => {
      const changes = Object.entries(entry.overrides)
        .filter(([p, v]) => v !== entry.original[p])
        .map(([p, v]) => `${p}: ${entry.original[p]} → ${v}`)
        .join("; ");
      return {
        frameId: dupId,
        selector: getCssSelector(entry.el),
        originalHTML: "",
        newHTML: "",
        comment: `Style changes: ${changes}`,
      };
    });
    setContentChanges((prev) => [
      ...prev,
      ...prev
        .filter((c) => c.frameId === frameId)
        .map((c) => ({ ...c, frameId: dupId })),
      ...styleAsContent,
    ]);

    if (!sourceBodyHTML) return;

    // After the new iframe loads naturally, replace body content
    setTimeout(() => {
      const dupEl = canvas.querySelector<HTMLElement>(`[data-frame-id="${dupId}"]`);
      const dupIframe = dupEl?.querySelector("iframe") as HTMLIFrameElement | null;
      if (!dupIframe) return;
      const apply = () => {
        try {
          const doc = dupIframe.contentDocument;
          if (doc) doc.body.innerHTML = sourceBodyHTML;
        } catch {}
      };
      if (dupIframe.contentDocument?.readyState === "complete") {
        apply();
      } else {
        dupIframe.addEventListener("load", apply, { once: true });
      }
    }, 50);
  }, [canvasRef]);

  const duplicateSelection = useCallback(() => {
    // Duplicate the frame containing the selected element, or all frames
    const targetId = selectedFrameId ?? framesRef.current[0]?.id;
    if (targetId) duplicateFrame(targetId);
  }, [selectedFrameId, duplicateFrame]);

  // ── Fit all frames in viewport ───────────────────
  const handleFit = useCallback(() => {
    const all = framesRef.current;
    const el = canvasRef.current;
    if (all.length === 0 || !el) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const f of all) {
      minX = Math.min(minX, f.x);
      minY = Math.min(minY, f.y);
      maxX = Math.max(maxX, f.x + f.width);
      maxY = Math.max(maxY, f.y + f.height);
    }
    fitToView(minX, minY, maxX - minX, maxY - minY, vw, vh);
  }, [fitToView, canvasRef]);

  // ── Pointer down — frame activation + pan ─────────
  const activeIframeRef = useRef<HTMLIFrameElement | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".f-canvas-frame-dup") || t.closest(".f-canvas-frame-push")) return;

      const frameEl = t.closest<HTMLElement>("[data-frame-id]");
      if (frameEl && !spaceRef.current) {
        // Deactivate previous iframe immediately
        if (activeIframeRef.current) {
          activeIframeRef.current.style.pointerEvents = "";
        }
        // Activate new iframe immediately (no wait for React render)
        const iframe = frameEl.querySelector<HTMLIFrameElement>("iframe");
        if (iframe) iframe.style.pointerEvents = "auto";
        activeIframeRef.current = iframe;
        setActiveFrameId(frameEl.dataset.frameId!);
        selectElement(null);
        return;
      }

      if (!frameEl && !spaceRef.current) {
        const isControl = t.closest(".f-canvas-hud, .f-canvas-topright");
        if (!isControl) {
          // Cancel any active tool mode
          stopInspecting();
          stopCommenting();
          stopVariantMode();

          if (activeIframeRef.current) {
            activeIframeRef.current.style.pointerEvents = "";
            activeIframeRef.current = null;
          }
          setActiveFrameId(null);
          selectElement(null);
        }
      }

      onPointerDown(e);
    },
    [onPointerDown],
  );

  // ── Center on mount, then fade in ────────────────
  useLayoutEffect(() => {
    handleFit();
  }, [handleFit]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      shellRef.current?.classList.add("f-canvas-visible");
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Lock body scroll while canvas is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── Keyboard ─────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        const origin = (e.composedPath()[0] as HTMLElement)?.tagName;
        if (origin === "TEXTAREA" || origin === "INPUT") return;
        e.preventDefault();
        spaceRef.current = true;
        canvasRef.current?.classList.add("f-canvas-space");
      }
      if (e.key === "Escape") {
        if (variantTarget) {
          cancelVariantTarget();
        } else if (variantMode) {
          stopVariantMode();
        } else if (pendingComment) {
          cancelPending();
        } else if (commenting) {
          stopCommenting();
        } else if (inspecting) {
          stopInspecting();
        } else if (selectedEl) {
          selectElement(null);
        } else if (activeFrameId) {
          setActiveFrameId(null);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        duplicateSelection();
      }
      if (e.shiftKey && e.key === "G") {
        setGuidesVisible((v) => !v);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = false;
        canvasRef.current?.classList.remove("f-canvas-space");
      }
    };
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
    };
  }, [
    handleClose,
    duplicateSelection,
    canvasRef,
    inspecting,
    stopInspecting,
    commenting,
    stopCommenting,
    pendingComment,
    cancelPending,
    selectedEl,
    selectElement,
  ]);

  // ── Render ───────────────────────────────────────
  return (
    <div ref={shellRef} className="f-canvas-shell">
      <div
        ref={canvasRef}
        className="f-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div ref={surfaceRef} className="f-canvas-surface">
          {frames.map((frame, i) => (
            <div
              key={frame.id}
              data-frame-id={frame.id}
              className={[
                "f-canvas-frame",
                activeFrameId === frame.id && "f-frame-active",
                frame.isVariant && "f-frame-variant",
                frame.loading && "f-frame-loading",
              ].filter(Boolean).join(" ")}
              style={{
                left: frame.x,
                top: frame.y,
                width: frame.width,
                height: frame.height,
                animationDelay:
                  i === 0 && frames.length === 1 ? "0.15s" : "0s",
              }}
            >
              <div
                className="f-canvas-frame-label"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveFrameId(frame.id);
                }}
              >
                {frame.isVariant ? `Variant ${(frame.variantIndex ?? 0) + 1}` : window.location.pathname} / {frame.width}&times;{frame.height}
              </div>
              {frame.loading && <div className="f-frame-skeleton" />}
              <div className="f-canvas-frame-content">
                <iframe
                  src={frame.url}
                  className="f-canvas-iframe"
                  title="Page preview"
                />
                {!frame.isVariant && guidesVisible &&
                  guides.map((guide, gi) => (
                    <GuideOverlay
                      key={gi}
                      guide={guide}
                      frameWidth={frame.width}
                      frameHeight={frame.height}
                    />
                  ))}
                {!frame.isVariant &&
                  comments
                    .filter((c) => c.frameId === frame.id)
                    .map((c, ci) => (
                      <CommentPin key={c.id} comment={c} index={ci + 1} />
                    ))}
              </div>
              {frame.isVariant && !frame.loading && (
                <button
                  className="f-canvas-frame-choose"
                  onClick={(e) => {
                    e.stopPropagation();
                    chooseVariant(frame.id);
                  }}
                  title="Use this variant"
                >
                  Choose
                </button>
              )}
              {!frame.isVariant && (
                <>
                  {frames.filter((f) => !f.isVariant).length > 1 && (
                    <button
                      className="f-canvas-frame-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFrame(frame.id);
                      }}
                      title="Delete frame"
                    >
                      Delete
                    </button>
                  )}
                  <button
                    className="f-canvas-frame-dup"
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateFrame(frame.id);
                    }}
                    title="Duplicate frame"
                  >
                    Duplicate
                  </button>
                  <FramePushButton
                    frameId={frame.id}
                    getChanges={getFrameChanges}
                    contentChangeCount={contentChanges.filter((c) => c.frameId === frame.id).length}
                    onPush={pushFrame}
                    bridgeAvailable={bridgeAvailable}
                  />
                </>
              )}
            </div>
          ))}
          {/* Dashed containers around variant groups */}
          {(() => {
            const groups = new Map<string, FrameState[]>();
            for (const f of frames) {
              if (f.isVariant && f.variantRequestId) {
                const arr = groups.get(f.variantRequestId) ?? [];
                arr.push(f);
                groups.set(f.variantRequestId, arr);
              }
            }
            const PAD = 30;
            return Array.from(groups.entries()).map(([reqId, variantFrames]) => {
              const minX = Math.min(...variantFrames.map((f) => f.x));
              const minY = Math.min(...variantFrames.map((f) => f.y));
              const maxX = Math.max(...variantFrames.map((f) => f.x + f.width));
              const maxY = Math.max(...variantFrames.map((f) => f.y + f.height));
              return (
                <div
                  key={`vg-${reqId}`}
                  className="f-variant-group"
                  style={{
                    left: minX - PAD,
                    top: minY - PAD,
                    width: maxX - minX + PAD * 2,
                    height: maxY - minY + PAD * 2,
                  }}
                >
                  <button
                    className="f-canvas-frame-dismiss"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFrames((prev) => prev.filter((f) => f.variantRequestId !== reqId));
                    }}
                    title="Dismiss variants"
                  >
                    Dismiss variants
                  </button>
                </div>
              );
            });
          })()}
        </div>

        <div className="f-canvas-topright">
          <div className="f-settings-wrap" ref={menuRef} onPointerDown={(e) => e.stopPropagation()}>
            <button
              className="f-canvas-close"
              onClick={() => setMenuOpen((v) => !v)}
              title="Menu"
            >
              <Ellipsis size={16} strokeWidth={1.5} />
            </button>
            {menuOpen && (
              <div className="f-settings-popover">
                <button
                  className="f-settings-item"
                  onClick={() => { toggleTheme(); setMenuOpen(false); }}
                >
                  {theme === "dark" ? <IconSun /> : <IconMoon />}
                  <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
                </button>
                <button
                  className="f-settings-item"
                  onClick={() => { handleFit(); setMenuOpen(false); }}
                >
                  <Maximize size={14} strokeWidth={1.5} />
                  <span>Fit to view</span>
                </button>
                <a
                  className="f-settings-item"
                  href="https://x.com/joshuaKnauber"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                >
                  <ExternalLink size={14} strokeWidth={1.5} />
                  <span>Give feedback</span>
                </a>
              </div>
            )}
          </div>
          <button
            className="f-canvas-close"
            onClick={handleClose}
            title="Exit canvas"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {variantTarget && (
          <VariantPopover
            canvasRef={canvasRef}
            viewportRef={viewportRef}
            target={variantTarget}
            frame={frames.find((f) => f.id === variantTarget.frameId)!}
            onSubmit={handleSubmitVariant}
            onCancel={cancelVariantTarget}
          />
        )}

        {pendingComment && (
          <CommentInput
            canvasRef={canvasRef}
            viewportRef={viewportRef}
            pending={pendingComment}
            frame={frames.find((f) => f.id === pendingComment.frameId)!}
            onSubmit={handleSubmitComment}
            onCancel={cancelPending}
          />
        )}

        <div className="f-canvas-hud">
          <button
            className={`f-canvas-hud-icon${inspecting ? " f-active" : ""}`}
            onClick={inspecting ? stopInspecting : startInspecting}
            title="Inspect element"
          >
            <SquareMousePointer size={14} strokeWidth={1.5} />
          </button>
          <button
            className={`f-canvas-hud-icon${variantMode ? " f-active" : ""}`}
            onClick={variantMode ? stopVariantMode : startVariantMode}
            title="Generate variants"
          >
            <Split size={14} strokeWidth={1.5} />
          </button>
          <button
            className={`f-canvas-hud-icon${commenting ? " f-active" : ""}`}
            onClick={commenting ? stopCommenting : startCommenting}
            title="Comment tool"
          >
            <MessageSquare size={14} strokeWidth={1.5} />
          </button>
          <span ref={zoomRef} className="f-canvas-hud-zoom" />
        </div>
      </div>

      <div className="f-canvas-panel">
        {selectedEl ? (
          <>
            <div className="f-inspect-bar">
              {sourceInfo?.source ? (
                <SourceReference info={sourceInfo} />
              ) : (
                <Breadcrumb
                  el={selectedEl}
                  onSelect={(el) => selectElement(el, selectedFrameId)}
                  onHover={() => {}}
                  onHoverEnd={() => {}}
                />
              )}
              <ElementComment
                key={commentKeyRef.current}
                value=""
                onChange={(text) => {
                  if (!text.trim() || !selectedEl || !selectedFrameId) return;
                  const comment = addComment(selectedEl, selectedFrameId, text.trim());
                  if (comment) void pushComment(comment);
                  commentKeyRef.current += 1;
                }}
              />
            </div>
            <div className="f-scroll">
              <PropertySections editor={editor} selectedEl={selectedEl} />
            </div>
          </>
        ) : (
          <div className="f-scroll">
            <>
                  <GuideSettings
                    guides={guides}
                    onChange={setGuides}
                    visible={guidesVisible}
                    onToggleVisible={() => setGuidesVisible((v) => !v)}
                  />
            </>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Per-frame push button ─────────────────────────

function FramePushButton({
  frameId,
  getChanges,
  contentChangeCount,
  onPush,
}: {
  frameId: string;
  getChanges: (id: string) => ElementEntry[];
  contentChangeCount: number;
  onPush: (id: string) => Promise<void>;
  bridgeAvailable: boolean;
}) {
  const changes = getChanges(frameId);
  const styleCount = changes.reduce((n, e) => {
    return n + Object.entries(e.overrides).filter(([p, v]) => v !== e.original[p]).length;
  }, 0);
  const count = styleCount + contentChangeCount;
  if (count === 0) return null;

  return (
    <button
      className="f-canvas-frame-push"
      onClick={(e) => {
        e.stopPropagation();
        void onPush(frameId);
      }}
      title={`Make ${count} change${count !== 1 ? "s" : ""} real`}
    >
      <ArrowUpRight size={13} strokeWidth={2} />
      <span>Make {count} change{count !== 1 ? "s" : ""} real</span>
    </button>
  );
}

// ── Floating comment input ────────────────────────

function CommentInput({
  canvasRef,
  viewportRef,
  pending,
  frame,
  onSubmit,
  onCancel,
}: {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  viewportRef: React.RefObject<CanvasViewport>;
  pending: PendingComment;
  frame: FrameState;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const cr = canvasRef.current?.getBoundingClientRect();
  const vp = viewportRef.current;
  if (!cr || !vp) return null;

  const screenX = cr.left + vp.x + (frame.x + pending.x) * vp.zoom;
  const screenY =
    cr.top + vp.y + (frame.y + pending.y) * vp.zoom + 32;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) onSubmit(text);
    }
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <div
      className="f-comment-input"
      style={{ left: screenX, top: screenY }}
    >
      <textarea
        ref={inputRef}
        className="f-comment-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Describe the change..."
        rows={2}
      />
    </div>
  );
}

// ── Comment pin (reads live position from element) ──

function CommentPin({ comment, index }: { comment: CanvasComment; index: number }) {
  const [pos, setPos] = useState({ x: comment.x, y: comment.y });

  useEffect(() => {
    try {
      const rect = comment.el.getBoundingClientRect();
      setPos({ x: rect.left, y: rect.top });
    } catch {
      // element may have been removed
    }
  });

  const statusClass =
    comment.status === "pending"
      ? " f-comment-pin-pending"
      : comment.status === "failed"
        ? " f-comment-pin-failed"
        : "";

  return (
    <div
      className={`f-comment-pin${statusClass}`}
      style={{ left: pos.x, top: pos.y }}
      title={comment.text}
    >
      {comment.status === "pending" ? "…" : index}
    </div>
  );
}

// ── Variant popover ───────────────────────────────

function VariantPopover({
  canvasRef,
  viewportRef,
  target,
  frame,
  onSubmit,
  onCancel,
}: {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  viewportRef: React.RefObject<CanvasViewport>;
  target: VariantTarget;
  frame: FrameState;
  onSubmit: (prompt: string, count: number) => void;
  onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(3);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const cr = canvasRef.current?.getBoundingClientRect();
  const vp = viewportRef.current;
  if (!cr || !vp) return null;

  const screenX = cr.left + vp.x + (frame.x + target.x) * vp.zoom;
  const screenY = cr.top + vp.y + (frame.y + target.y) * vp.zoom + 32;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (prompt.trim()) onSubmit(prompt, count);
    }
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <div className="f-variant-popover" style={{ left: screenX, top: screenY }}>
      <div className="f-variant-count">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            className={`f-variant-count-btn${count === n ? " active" : ""}`}
            onClick={() => setCount(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <textarea
        ref={inputRef}
        className="f-comment-textarea"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Describe the variants..."
        rows={2}
      />
    </div>
  );
}

// ── Comment list (sidebar) ────────────────────────

import { Section } from "../components";

function CommentList({
  comments,
  onRemove,
}: {
  comments: CanvasComment[];
  onRemove: (id: string) => void;
}) {
  if (comments.length === 0) return null;

  return (
    <Section title="Comments" defaultOpen>
      <div className="f-comment-list">
        {comments.map((c, i) => (
          <div key={c.id} className="f-comment-list-item">
            <div className="f-comment-list-badge">{i + 1}</div>
            <div className="f-comment-list-body">
              <div className="f-comment-list-selector">{c.selector}</div>
              <div className="f-comment-list-text">{c.text}</div>
            </div>
            <button
              className="f-grid-track-remove"
              onClick={() => onRemove(c.id)}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}
