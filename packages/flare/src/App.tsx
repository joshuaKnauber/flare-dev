import {
  Ellipsis,
  EyeOff,
  ExternalLink,
  Frame,
  Minimize2,
  SquareMousePointer,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Breadcrumb,
  CopyPromptBar,
  ElementComment,
  PropertySections,
  SourceReference,
} from "./components";
import {
  useDrag,
  useElementSource,
  useInspector,
  useStyleEditor,
  useTheme,
} from "./hooks";
import {
  getBridgeStatus,
  pushSnapshotToAgent,
} from "./bridge-client";
import {
  IconFlare,
  IconMoon,
  IconSun,
} from "./icons";
import { buildPrompt, serializeElementChange } from "./utils";
import { Canvas } from "./canvas";

export default function App({ shadowHost }: { shadowHost: HTMLElement }) {
  const initOpen = (() => {
    try {
      return localStorage.getItem("flare-expanded") === "true";
    } catch {
      return false;
    }
  })();
  const [expanded, setExpanded] = useState(initOpen);
  const [closing, setClosing] = useState(false);
  const mounted = expanded || closing;

  const handleOpen = useCallback(() => {
    setExpanded(true);
    setClosing(false);
    try { localStorage.setItem("flare-expanded", "true"); } catch {}
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "flare-open") handleOpen();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [handleOpen]);

  const handleClose = useCallback(() => {
    setExpanded(false);
    setClosing(true);
    try { localStorage.setItem("flare-expanded", "false"); } catch {}
    setTimeout(() => {
      setClosing(false);
      drag.resetPosition();
    }, 400);
  }, []);

  const handleHideSession = useCallback(() => {
    try {
      sessionStorage.setItem("flare-hidden", "true");
    } catch {}
    const host = document.getElementById("flare-host");
    if (host) host.style.display = "none";
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    // RAF to skip the click that opened the menu
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

  const { theme, toggle: toggleTheme } = useTheme(shadowHost);
  const drag = useDrag(expanded);
  const {
    inspecting,
    selectedEl,
    startInspecting,
    stopInspecting,
    selectElement,
    highlightElement,
    clearHighlight,
  } = useInspector();
  const editor = useStyleEditor(selectedEl);
  const sourceInfo = useElementSource(selectedEl);
  const [canvasMode, setCanvasMode] = useState(false);
  const toggleCanvas = useCallback(() => {
    setCanvasMode((v) => {
      if (!v) stopInspecting();
      return !v;
    });
  }, [stopInspecting]);
  const { acknowledgeEntries, setElementSourceInfo } = editor;
  const commentKeyRef = useRef(0);
  const prevElRef = useRef(selectedEl);
  if (prevElRef.current !== selectedEl) {
    prevElRef.current = selectedEl;
    commentKeyRef.current += 1;
  }

  const changeCount = editor.totalChangeCount;
  const styleChangeCount = editor.totalStyleChangeCount;
  const commentChangeCount = editor.totalCommentCount;
  const [bridgeAvailable, setBridgeAvailable] = useState(false);
  const [autoPushState, setAutoPushState] = useState<"pushing" | null>(null);
  const autoPushInFlightRef = useRef(false);
  const prevCommentCountRef = useRef(commentChangeCount);

  useEffect(() => {
    if (!selectedEl) return;
    setElementSourceInfo(selectedEl, sourceInfo);
  }, [selectedEl, setElementSourceInfo, sourceInfo]);

  const buildAgentSnapshot = useCallback(() => {
    const entries = editor.getAllChanges();
    return {
      entries,
      snapshot: {
        updatedAt: new Date().toISOString(),
        changes: entries.map((entry) => serializeElementChange(entry)),
      },
    };
  }, [editor.getAllChanges]);

  useEffect(() => {
    if (!expanded) return;
    let active = true;

    const pollStatus = async () => {
      const status = await getBridgeStatus();
      if (!active) return;
      setBridgeAvailable(status.available);
    };

    void pollStatus();
    const interval = window.setInterval(() => {
      void pollStatus();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [expanded]);

  const handlePush = useCallback(async () => {
    const { entries, snapshot } = buildAgentSnapshot();
    if (entries.length === 0) return false;

    const result = await pushSnapshotToAgent(snapshot);
    if (result.ok) acknowledgeEntries(entries);

    return result.ok;
  }, [acknowledgeEntries, buildAgentSnapshot]);

  useEffect(() => {
    const prevCommentCount = prevCommentCountRef.current;
    prevCommentCountRef.current = commentChangeCount;

    if (!bridgeAvailable || autoPushInFlightRef.current) return;
    if (styleChangeCount !== 0) return;
    if (prevCommentCount !== 0 || commentChangeCount !== 1) return;

    autoPushInFlightRef.current = true;
    setAutoPushState("pushing");
    void handlePush().finally(() => {
      window.setTimeout(() => {
        autoPushInFlightRef.current = false;
        setAutoPushState(null);
      }, 800);
    });
  }, [bridgeAvailable, commentChangeCount, handlePush, styleChangeCount]);

  const bridgeStatus = bridgeAvailable
      ? {
          tone: "connected",
          label: "Bridge running",
          detail: "Push to Agent is ready.",
        }
      : {
          tone: "offline",
          label: "Bridge offline",
          detail: "Start the local bridge to enable agent push.",
        };

  return (
    <>
    {canvasMode && <Canvas onClose={() => setCanvasMode(false)} shadowHost={shadowHost} />}

    {/* Collapsed tab */}
    {!expanded && !canvasMode && (
      <button
        className="f-shell-tab"
        onClick={handleOpen}
        title="Open Flare"
      >
        <IconFlare />
      </button>
    )}

    {/* Expanded panel */}
    {mounted && !canvasMode && (
      <div
        ref={drag.shellRef}
        className={[
          "f-shell f-expanded",
          closing && "f-shell-closing",
          !selectedEl && "f-compact",
        ].filter(Boolean).join(" ")}
        style={drag.hasMoved ? { left: drag.pos.x, top: drag.pos.y } : undefined}
      >
        <div className="f-shell-content">
          {/* Top bar */}
          <div className="f-topbar" onPointerDown={drag.onPointerDown}>
            <button
              className="f-brand"
              onClick={handleClose}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <IconFlare />
              <span>Flare</span>
              <a
                className={`f-bridge-indicator f-bridge-${bridgeStatus.tone}`}
                href="https://tryflare.dev#bridge-onboarding"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                title={bridgeStatus.label}
                aria-label={bridgeStatus.label}
              >
                <span className="f-bridge-dot" />
              </a>
            </button>
            <div className="f-topbar-actions">
              <div className="f-settings-wrap" ref={menuRef} onPointerDown={(e) => e.stopPropagation()}>
                <button
                  className="f-settings-btn"
                  onClick={() => setMenuOpen((v) => !v)}
                  title="Menu"
                >
                  <Ellipsis size={14} strokeWidth={1.5} />
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
                      onClick={handleHideSession}
                    >
                      <EyeOff size={14} strokeWidth={1.5} />
                      <span>Hide for session</span>
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
                className="f-settings-btn"
                onClick={handleClose}
                onPointerDown={(e) => e.stopPropagation()}
                title="Minimize"
              >
                <Minimize2 size={14} strokeWidth={1.5} />
              </button>
              <button
                className={`f-canvas-mode-btn${canvasMode ? " f-active" : ""}`}
                onClick={toggleCanvas}
                onPointerDown={(e) => e.stopPropagation()}
                title="Canvas mode"
              >
                <Frame size={12} strokeWidth={1.5} />
                <span>Canvas</span>
              </button>
            </div>
          </div>

          {/* Inspect bar */}
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
                onSelect={selectElement}
                onHover={highlightElement}
                onHoverEnd={clearHighlight}
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

          {/* Scrollable content */}
          <div className="f-scroll">
            {!selectedEl ? (
              <div className="f-empty-state">
                <SquareMousePointer size={16} strokeWidth={1.5} />
                <span>Select an element</span>
              </div>
            ) : (
              <PropertySections editor={editor} selectedEl={selectedEl!} />
            )}
          </div>

          {/* Copy prompt bar */}
          <CopyPromptBar
            changeCount={changeCount}
            onPush={handlePush}
            onCopy={() => {
              const entries = editor.getAllChanges();
              const text = buildPrompt(entries);
              if (text) {
                void navigator.clipboard.writeText(text);
                editor.acknowledgeEntries(entries);
              }
            }}
            onReset={editor.resetAll}
            bridgeConnected={bridgeAvailable}
            externalState={autoPushState}
            externalProgressMs={800}
          />
        </div>
      </div>
    )}
    </>
  );
}
