import {
  ArrowUpRight,
  Copy,
  Ellipsis,
  Maximize,
  MessageSquare,
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
import { getBridgeStatus, pushSnapshotToAgent } from "../bridge-client";
import { serializeElementChange } from "../utils";
import type { ElementEntry } from "../utils";
import { useCanvasComments, type PendingComment, type CanvasComment } from "./useCanvasComments";
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
  } = useCanvasInspector(canvasRef, viewportRef, frames, activeFrameId);

  const {
    commenting,
    comments,
    pending: pendingComment,
    startCommenting,
    stopCommenting,
    submitComment: rawSubmitComment,
    cancelPending,
    removeComment,
  } = useCanvasComments(canvasRef, viewportRef, frames);

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
      if (entries.length === 0) return;
      const snapshot = {
        updatedAt: new Date().toISOString(),
        changes: entries.map((e) => serializeElementChange(e)),
      };
      const result = await pushSnapshotToAgent(snapshot);
      if (result.ok) {
        editor.acknowledgeEntries(entries);
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

  const handleSubmitComment = useCallback(
    (text: string) => {
      const comment = rawSubmitComment(text);
      if (comment) void pushComment(comment);
    },
    [rawSubmitComment, pushComment],
  );

  // Toggle inspecting/commenting class on canvas for pointer-events + cursor
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.classList.toggle("f-canvas-inspecting", inspecting);
    el.classList.toggle("f-canvas-commenting", commenting);
  }, [inspecting, commenting, canvasRef]);

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
  const duplicateFrame = useCallback((frameId: string) => {
    const frame = framesRef.current.find((f) => f.id === frameId);
    if (!frame) return;
    const dup: FrameState = {
      ...frame,
      id: `frame-${++_nextId}`,
      x: frame.x + frame.width + FRAME_GAP,
    };
    setFrames((prev) => [...prev, dup]);
  }, []);

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
        return;
      }

      if (!frameEl && !spaceRef.current) {
        const isControl = t.closest(".f-canvas-hud, .f-canvas-topright");
        if (!isControl) {
          if (activeIframeRef.current) {
            activeIframeRef.current.style.pointerEvents = "";
            activeIframeRef.current = null;
          }
          setActiveFrameId(null);
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
        if (pendingComment) {
          cancelPending();
        } else if (commenting) {
          stopCommenting();
        } else if (inspecting) {
          stopInspecting();
        } else if (selectedEl) {
          selectElement(null);
        } else if (activeFrameId) {
          setActiveFrameId(null);
        } else {
          handleClose();
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
              className={`f-canvas-frame${activeFrameId === frame.id ? " f-frame-active" : ""}`}
              style={{
                left: frame.x,
                top: frame.y,
                width: frame.width,
                height: frame.height,
                animationDelay:
                  i === 0 && frames.length === 1 ? "0.15s" : "0s",
              }}
            >
              <div className="f-canvas-frame-label">
                {window.location.pathname} / {frame.width}&times;{frame.height}
              </div>
              <div className="f-canvas-frame-content">
                <iframe
                  src={frame.url}
                  className="f-canvas-iframe"
                  title="Page preview"
                />
                {guidesVisible &&
                  guides.map((guide, gi) => (
                    <GuideOverlay
                      key={gi}
                      guide={guide}
                      frameWidth={frame.width}
                      frameHeight={frame.height}
                    />
                  ))}
                {comments
                  .filter((c) => c.frameId === frame.id)
                  .map((c, ci) => (
                    <CommentPin key={c.id} comment={c} index={ci + 1} />
                  ))}
              </div>
              <button
                className="f-canvas-frame-dup"
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateFrame(frame.id);
                }}
                title="Duplicate frame"
              >
                <Copy size={14} strokeWidth={1.5} />
              </button>
              <FramePushButton
                frameId={frame.id}
                getChanges={getFrameChanges}
                onPush={pushFrame}
                bridgeAvailable={bridgeAvailable}
              />
            </div>
          ))}
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
            className={`f-canvas-hud-icon${commenting ? " f-active" : ""}`}
            onClick={commenting ? stopCommenting : startCommenting}
            title="Comment tool"
          >
            <MessageSquare size={14} strokeWidth={1.5} />
          </button>
          <button
            className="f-canvas-hud-icon"
            onClick={handleFit}
            title="Fit to view"
          >
            <Maximize size={14} strokeWidth={1.5} />
          </button>
          <span ref={zoomRef} className="f-canvas-hud-zoom" />
        </div>
      </div>

      <div className="f-canvas-panel">
        {!activeFrameId ? (
          <div className="f-empty-state">
            <SquareMousePointer size={16} strokeWidth={1.5} />
            <span>Select a frame</span>
          </div>
        ) : (
          <>
            <div className="f-inspect-bar">
              <button
                className={`f-inspect-btn${inspecting ? " active" : ""}`}
                onClick={inspecting ? stopInspecting : startInspecting}
              >
                <SquareMousePointer size={13} strokeWidth={1.5} />
                <span>{inspecting ? "Cancel" : "Select Element"}</span>
              </button>
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
              {selectedEl && (
                <ElementComment
                  key={commentKeyRef.current}
                  value={editor.comment}
                  onChange={editor.setComment}
                />
              )}
            </div>

            <div className="f-scroll">
              {selectedEl ? (
                <PropertySections editor={editor} selectedEl={selectedEl} />
              ) : (
                <>
                  <GuideSettings
                    guides={guides}
                    onChange={setGuides}
                    visible={guidesVisible}
                    onToggleVisible={() => setGuidesVisible((v) => !v)}
                  />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Per-frame push button ─────────────────────────

function FramePushButton({
  frameId,
  getChanges,
  onPush,
}: {
  frameId: string;
  getChanges: (id: string) => ElementEntry[];
  onPush: (id: string) => Promise<void>;
  bridgeAvailable: boolean;
}) {
  const changes = getChanges(frameId);
  if (changes.length === 0) return null;

  const count = changes.reduce((n, e) => {
    return n + Object.entries(e.overrides).filter(([p, v]) => v !== e.original[p]).length;
  }, 0);
  if (count === 0) return null;

  return (
    <button
      className="f-canvas-frame-push"
      onClick={(e) => {
        e.stopPropagation();
        void onPush(frameId);
      }}
      title={`Push ${count} change${count !== 1 ? "s" : ""}`}
    >
      <ArrowUpRight size={13} strokeWidth={2} />
      <span>{count}</span>
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

  return (
    <div
      className="f-comment-pin"
      style={{ left: pos.x, top: pos.y }}
      title={comment.text}
    >
      {index}
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
