import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Ban,
  CaseLower,
  CaseSensitive,
  CaseUpper,
  CircleDot,
  Ellipsis,
  EyeOff,
  Italic,
  MoveHorizontal,
  Square,
  SquareDashed,
  SquareMousePointer,
  Strikethrough,
  Type,
  Underline,
  WrapText,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignmentMatrix,
  BoxShadowEditor,
  Breadcrumb,
  ColorSwatch,
  CopyPromptBar,
  DisplayModePicker,
  ElementComment,
  ExpandableInput,
  FontDropdown,
  GridTrackEditor,
  IconButton,
  PropRow,
  Section,
  SelectDropdown,
  SourceReference,
  SubPanel,
  ValueInput,
} from "./components";
import { FONT_SIZE_UNITS, TYPO_UNITS } from "./constants";
import {
  useAvailableFonts,
  useDrag,
  useElementSource,
  useInspector,
  useStyleEditor,
  useTheme,
} from "./hooks";
import {
  getBridgeConnectionInfo,
  getBridgeStatus,
  pushSnapshotToAgent,
} from "./bridge-client";
import {
  IconCollapse,
  IconCorners,
  IconDashedRect,
  IconFlare,
  IconMoon,
  IconRoundedRect,
  IconSolidRect,
  IconSun,
} from "./icons";
import { serializeElementChange } from "./utils";

const ICO = { size: 14, strokeWidth: 1.5 };

const RADIUS_DETAILS = [
  { prefix: "TL", prop: "borderTopLeftRadius" },
  { prefix: "TR", prop: "borderTopRightRadius" },
  { prefix: "BL", prop: "borderBottomLeftRadius" },
  { prefix: "BR", prop: "borderBottomRightRadius" },
];

const BORDER_WIDTH_DETAILS = [
  { prefix: "T", prop: "borderTopWidth" },
  { prefix: "R", prop: "borderRightWidth" },
  { prefix: "B", prop: "borderBottomWidth" },
  { prefix: "L", prop: "borderLeftWidth" },
];

export default function App({ shadowHost }: { shadowHost: HTMLElement }) {
  const initOpen = (() => {
    try {
      return localStorage.getItem("flare-expanded") === "true";
    } catch {
      return false;
    }
  })();
  const [expanded, setExpanded] = useState(initOpen); // content mounted
  const [open, setOpen] = useState(initOpen); // morph target (CSS class)
  const [contentReady, setContentReady] = useState(initOpen);
  const morphTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleOpen = useCallback(() => {
    setExpanded(true);
    // rAF ensures the DOM has the collapsed size before we trigger the morph
    requestAnimationFrame(() => setOpen(true));
    try {
      localStorage.setItem("flare-expanded", "true");
    } catch {}
    clearTimeout(morphTimer.current);
    morphTimer.current = setTimeout(() => setContentReady(true), 200);
  }, []);

  // Allow external code to open Flare by writing to localStorage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "flare-open") handleOpen();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [handleOpen]);

  const handleClose = useCallback(() => {
    setContentReady(false);
    setOpen(false); // start morph immediately
    try {
      localStorage.setItem("flare-expanded", "false");
    } catch {}
    clearTimeout(morphTimer.current);
    morphTimer.current = setTimeout(() => setExpanded(false), 250);
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
  const drag = useDrag(open);
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
  const availableFonts = useAvailableFonts();
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
  const [bridgeDialogOpen, setBridgeDialogOpen] = useState(false);
  const [autoPushState, setAutoPushState] = useState<"pushing" | null>(null);
  const bridgeInfo = getBridgeConnectionInfo();
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
    let active = true;

    const pollStatus = async () => {
      const status = await getBridgeStatus();
      if (!active) return;
      setBridgeAvailable(status.available);
    };

    void pollStatus();
    const interval = window.setInterval(() => {
      void pollStatus();
    }, 2000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

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

  const bridgePrompt = [
    "Flare is a visual CSS editing tool. I make style changes in the browser and Flare writes structured update files for this app origin.",
    "",
    "Run this command:",
    `npx flare-dev watch --origin "${bridgeInfo.origin ?? ""}"`,
    "",
    "It will wait until Flare has one or more pending pushed updates for this origin, then print one JSON object and exit.",
    "",
    'When it returns a `{"type":"watch.batch"}` object:',
    `- these files belong to origin ${bridgeInfo.origin ?? ""}`,
    "- apply all files in `files` in the repo you are currently editing",
    "- each item contains `filePath` and `payload`",
    "- always pay attention to `comment`, even if `snapshot.changes` or an item's `changes` array is empty",
    "- after successfully applying a file, delete that `filePath`",
    "- when done, run the same command again to wait for the next batch",
  ].join("\n");

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

  const shellClass = ["f-shell", open ? "f-expanded" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={drag.shellRef}
      className={shellClass}
      style={{ left: drag.pos.x, top: drag.pos.y }}
      onPointerDown={!expanded ? drag.onPointerDown : undefined}
      onClick={
        !expanded ? () => { if (!drag.moved.current) handleOpen(); } : undefined
      }
      role={!expanded ? "button" : undefined}
      tabIndex={!expanded ? 0 : undefined}
      onKeyDown={
        !expanded
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") handleOpen();
            }
          : undefined
      }
    >
      {/* Trigger icon — fades out as shell expands */}
      <div className="f-shell-icon">
        <IconFlare />
      </div>

      {/* Panel content — mounts when expanded, fades in after morph */}
      {expanded && (
        <div className={`f-shell-content${contentReady ? " f-visible" : ""}`}>
          {/* Top bar */}
          <div className="f-topbar" onPointerDown={drag.onPointerDown}>
            <div className="f-brand">
              <IconFlare />
              <span>Flare</span>
              <button
                className={`f-bridge-indicator f-bridge-${bridgeStatus.tone}`}
                onClick={() => setBridgeDialogOpen(true)}
                onPointerDown={(e) => e.stopPropagation()}
                title={bridgeStatus.label}
                aria-label={bridgeStatus.label}
              >
                <span className="f-bridge-dot" />
              </button>
            </div>
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
                  </div>
                )}
              </div>
              <button
                className="f-collapse-btn"
                onClick={handleClose}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <IconCollapse />
              </button>
            </div>
          </div>

          {bridgeDialogOpen && (
            <div className="f-bridge-dialog-backdrop" onClick={() => setBridgeDialogOpen(false)}>
              <div
                className="f-bridge-dialog"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="f-bridge-dialog-header">
                  <div>
                    <div className="f-bridge-dialog-title">Bridge Connection</div>
                    <div className="f-bridge-dialog-status">
                      <span className={`f-bridge-dot f-bridge-${bridgeStatus.tone}`} />
                      <span>{bridgeStatus.label}</span>
                    </div>
                  </div>
                  <button
                    className="f-bridge-dialog-close"
                    onClick={() => setBridgeDialogOpen(false)}
                    aria-label="Close bridge dialog"
                  >
                    <X size={14} strokeWidth={1.5} />
                  </button>
                </div>

                <div className="f-bridge-dialog-body">
                  <p className="f-bridge-dialog-copy">{bridgeStatus.detail}</p>

                  <div className="f-bridge-dialog-section">
                    <span className="f-bridge-dialog-label">Start the bridge</span>
                    <code className="f-bridge-dialog-code">npx flare-dev bridge</code>
                  </div>

                  <div className="f-bridge-dialog-section">
                    <span className="f-bridge-dialog-label">Prompt for your agent</span>
                    <code className="f-bridge-dialog-code">{bridgePrompt}</code>
                  </div>
                </div>
              </div>
            </div>
          )}

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
              <>
                <Section title="Layout" defaultOpen={false}>
                  <DisplayModePicker
                    value={editor.getValue("display")}
                    onChange={(v) => editor.setValue("display", v)}
                  />

                  {/* Flex Container */}
                  {(editor.getValue("display") === "flex" ||
                    editor.getValue("display") === "inline-flex") && (
                    <>
                      <div className="f-flex-bar">
                        <IconButton
                          options={[
                            {
                              value: "row",
                              icon: <ArrowRight {...ICO} />,
                              label: "row",
                            },
                            {
                              value: "row-reverse",
                              icon: <ArrowLeft {...ICO} />,
                              label: "row-reverse",
                            },
                            {
                              value: "column",
                              icon: <ArrowDown {...ICO} />,
                              label: "column",
                            },
                            {
                              value: "column-reverse",
                              icon: <ArrowUp {...ICO} />,
                              label: "column-reverse",
                            },
                          ]}
                          value={editor.getValue("flexDirection")}
                          onChange={(v) => editor.setValue("flexDirection", v)}
                        />
                        <IconButton
                          options={[
                            {
                              value: "nowrap",
                              icon: <MoveHorizontal {...ICO} />,
                              label: "nowrap",
                            },
                            {
                              value: "wrap",
                              icon: <WrapText {...ICO} />,
                              label: "wrap",
                            },
                          ]}
                          value={editor.getValue("flexWrap")}
                          onChange={(v) => editor.setValue("flexWrap", v)}
                        />
                      </div>
                      <div className="f-flex-align-row">
                        <AlignmentMatrix
                          justifyContent={editor.getValue("justifyContent")}
                          alignItems={editor.getValue("alignItems")}
                          direction={editor.getValue("flexDirection")}
                          onChangeJustify={(v) =>
                            editor.setValue("justifyContent", v)
                          }
                          onChangeAlign={(v) =>
                            editor.setValue("alignItems", v)
                          }
                        />
                        <div className="f-flex-align-fields">
                          <SelectDropdown
                            options={[
                              "flex-start",
                              "center",
                              "flex-end",
                              "space-between",
                              "space-around",
                              "space-evenly",
                            ]}
                            value={editor.getValue("justifyContent")}
                            onChange={(v) =>
                              editor.setValue("justifyContent", v)
                            }
                          />
                          <SelectDropdown
                            options={[
                              "flex-start",
                              "center",
                              "flex-end",
                              "stretch",
                              "baseline",
                            ]}
                            value={editor.getValue("alignItems")}
                            onChange={(v) => editor.setValue("alignItems", v)}
                          />
                        </div>
                      </div>
                      <ValueInput
                        prefix="Gap"
                        value={editor.getValue("gap")}
                        onChange={(v) => editor.setValue("gap", v)}
                      />
                    </>
                  )}

                  {/* Flex Child */}
                  {selectedEl?.parentElement &&
                    (() => {
                      const parentDisplay = getComputedStyle(
                        selectedEl.parentElement,
                      ).display;
                      return (
                        parentDisplay === "flex" ||
                        parentDisplay === "inline-flex"
                      );
                    })() && (
                      <SubPanel label="Flex Child">
                        <div className="f-prop-grid f-prop-grid-3">
                          <ValueInput
                            prefix="Grow"
                            value={editor.getValue("flexGrow")}
                            onChange={(v) => editor.setValue("flexGrow", v)}
                          />
                          <ValueInput
                            prefix="Shrink"
                            value={editor.getValue("flexShrink")}
                            onChange={(v) => editor.setValue("flexShrink", v)}
                          />
                          <ValueInput
                            prefix="Basis"
                            value={editor.getValue("flexBasis")}
                            onChange={(v) => editor.setValue("flexBasis", v)}
                          />
                        </div>
                        <PropRow label="Self">
                          <SelectDropdown
                            options={[
                              "auto",
                              "flex-start",
                              "center",
                              "flex-end",
                              "stretch",
                              "baseline",
                            ]}
                            value={editor.getValue("alignSelf")}
                            onChange={(v) => editor.setValue("alignSelf", v)}
                          />
                        </PropRow>
                      </SubPanel>
                    )}

                  {/* Grid */}
                  {(editor.getValue("display") === "grid" ||
                    editor.getValue("display") === "inline-grid") && (
                    <>
                      <GridTrackEditor
                        columns={editor.getValue("gridTemplateColumns")}
                        rows={editor.getValue("gridTemplateRows")}
                        onChangeColumns={(v) =>
                          editor.setValue("gridTemplateColumns", v)
                        }
                        onChangeRows={(v) =>
                          editor.setValue("gridTemplateRows", v)
                        }
                      />
                      <div className="f-prop-grid">
                        <ValueInput
                          prefix="Col Gap"
                          value={editor.getValue("columnGap")}
                          onChange={(v) => editor.setValue("columnGap", v)}
                        />
                        <ValueInput
                          prefix="Row Gap"
                          value={editor.getValue("rowGap")}
                          onChange={(v) => editor.setValue("rowGap", v)}
                        />
                      </div>
                      <div className="f-flex-align-row">
                        <AlignmentMatrix
                          justifyContent={editor.getValue("justifyContent")}
                          alignItems={editor.getValue("alignItems")}
                          direction={
                            editor.getValue("gridAutoFlow") === "column"
                              ? "column"
                              : "row"
                          }
                          onChangeJustify={(v) =>
                            editor.setValue("justifyContent", v)
                          }
                          onChangeAlign={(v) =>
                            editor.setValue("alignItems", v)
                          }
                        />
                        <div className="f-flex-align-fields">
                          <SelectDropdown
                            options={[
                              "start",
                              "center",
                              "end",
                              "stretch",
                              "space-between",
                              "space-around",
                              "space-evenly",
                            ]}
                            value={editor.getValue("justifyContent")}
                            onChange={(v) =>
                              editor.setValue("justifyContent", v)
                            }
                          />
                          <SelectDropdown
                            options={[
                              "start",
                              "center",
                              "end",
                              "stretch",
                              "baseline",
                            ]}
                            value={editor.getValue("alignItems")}
                            onChange={(v) => editor.setValue("alignItems", v)}
                          />
                        </div>
                      </div>
                      <PropRow label="Flow">
                        <IconButton
                          options={[
                            {
                              value: "row",
                              icon: <ArrowRight {...ICO} />,
                              label: "row",
                            },
                            {
                              value: "column",
                              icon: <ArrowDown {...ICO} />,
                              label: "column",
                            },
                          ]}
                          value={editor.getValue("gridAutoFlow")}
                          onChange={(v) => editor.setValue("gridAutoFlow", v)}
                        />
                      </PropRow>
                    </>
                  )}

                  {/* Size & overflow sub-panel */}
                  <SubPanel label="Size">
                    <div className="f-prop-grid">
                      <ValueInput
                        prefix="W"
                        value={editor.getValue("width")}
                        onChange={(v) => editor.setValue("width", v)}
                      />
                      <ValueInput
                        prefix="H"
                        value={editor.getValue("height")}
                        onChange={(v) => editor.setValue("height", v)}
                      />
                    </div>
                    <div className="f-prop-grid">
                      <ValueInput
                        prefix="Min W"
                        value={editor.getValue("minWidth")}
                        onChange={(v) => editor.setValue("minWidth", v)}
                      />
                      <ValueInput
                        prefix="Max W"
                        value={editor.getValue("maxWidth")}
                        onChange={(v) => editor.setValue("maxWidth", v)}
                      />
                    </div>
                    <PropRow label="Overflow">
                      <SelectDropdown
                        options={["visible", "hidden", "scroll", "auto"]}
                        value={editor.getValue("overflow")}
                        onChange={(v) => editor.setValue("overflow", v)}
                      />
                    </PropRow>
                  </SubPanel>

                  <SubPanel label="Position">
                    <SelectDropdown
                      options={[
                        "static",
                        "relative",
                        "absolute",
                        "fixed",
                        "sticky",
                      ]}
                      value={editor.getValue("position")}
                      onChange={(v) => editor.setValue("position", v)}
                    />
                    {editor.getValue("position") !== "static" && (
                      <>
                        <div className="f-prop-grid">
                          <ValueInput
                            prefix="Top"
                            value={editor.getValue("top")}
                            onChange={(v) => editor.setValue("top", v)}
                          />
                          <ValueInput
                            prefix="Right"
                            value={editor.getValue("right")}
                            onChange={(v) => editor.setValue("right", v)}
                          />
                        </div>
                        <div className="f-prop-grid">
                          <ValueInput
                            prefix="Bottom"
                            value={editor.getValue("bottom")}
                            onChange={(v) => editor.setValue("bottom", v)}
                          />
                          <ValueInput
                            prefix="Left"
                            value={editor.getValue("left")}
                            onChange={(v) => editor.setValue("left", v)}
                          />
                        </div>
                        <ValueInput
                          prefix="Z-Index"
                          value={editor.getValue("zIndex")}
                          onChange={(v) => editor.setValue("zIndex", v)}
                        />
                      </>
                    )}
                  </SubPanel>
                </Section>

                <Section title="Spacing" defaultOpen={false}>
                  <SubPanel label="Padding">
                    <div className="f-prop-grid">
                      <ValueInput
                        prefix="T"
                        value={editor.getValue("paddingTop")}
                        onChange={(v) => editor.setValue("paddingTop", v)}
                      />
                      <ValueInput
                        prefix="R"
                        value={editor.getValue("paddingRight")}
                        onChange={(v) => editor.setValue("paddingRight", v)}
                      />
                    </div>
                    <div className="f-prop-grid">
                      <ValueInput
                        prefix="B"
                        value={editor.getValue("paddingBottom")}
                        onChange={(v) => editor.setValue("paddingBottom", v)}
                      />
                      <ValueInput
                        prefix="L"
                        value={editor.getValue("paddingLeft")}
                        onChange={(v) => editor.setValue("paddingLeft", v)}
                      />
                    </div>
                  </SubPanel>
                  <SubPanel label="Margin">
                    <div className="f-prop-grid">
                      <ValueInput
                        prefix="T"
                        value={editor.getValue("marginTop")}
                        onChange={(v) => editor.setValue("marginTop", v)}
                      />
                      <ValueInput
                        prefix="R"
                        value={editor.getValue("marginRight")}
                        onChange={(v) => editor.setValue("marginRight", v)}
                      />
                    </div>
                    <div className="f-prop-grid">
                      <ValueInput
                        prefix="B"
                        value={editor.getValue("marginBottom")}
                        onChange={(v) => editor.setValue("marginBottom", v)}
                      />
                      <ValueInput
                        prefix="L"
                        value={editor.getValue("marginLeft")}
                        onChange={(v) => editor.setValue("marginLeft", v)}
                      />
                    </div>
                  </SubPanel>
                </Section>

                <Section title="Typography" defaultOpen={false}>
                  <FontDropdown
                    fonts={availableFonts}
                    value={editor.getValue("fontFamily")}
                    onChange={(v) => editor.setValue("fontFamily", v)}
                  />
                  <div className="f-prop-grid">
                    <SelectDropdown
                      options={[
                        "100",
                        "200",
                        "300",
                        "400",
                        "500",
                        "600",
                        "700",
                        "800",
                        "900",
                      ]}
                      value={editor.getValue("fontWeight")}
                      onChange={(v) => editor.setValue("fontWeight", v)}
                    />
                    <IconButton
                      options={[
                        {
                          value: "normal",
                          icon: <Type {...ICO} />,
                          label: "normal",
                        },
                        {
                          value: "italic",
                          icon: <Italic {...ICO} />,
                          label: "italic",
                        },
                      ]}
                      value={editor.getValue("fontStyle")}
                      onChange={(v) => editor.setValue("fontStyle", v)}
                    />
                  </div>
                  <div className="f-prop-grid">
                    <ValueInput
                      prefix="Size"
                      value={editor.getValue("fontSize")}
                      onChange={(v) => editor.setValue("fontSize", v)}
                      units={FONT_SIZE_UNITS}
                    />
                    <ValueInput
                      prefix="Line H"
                      value={editor.getValue("lineHeight")}
                      onChange={(v) => editor.setValue("lineHeight", v)}
                      units={TYPO_UNITS}
                    />
                  </div>
                  <div className="f-prop-grid">
                    <ValueInput
                      prefix="Letter"
                      value={editor.getValue("letterSpacing")}
                      onChange={(v) => editor.setValue("letterSpacing", v)}
                      units={TYPO_UNITS}
                    />
                    <ValueInput
                      prefix="Word"
                      value={editor.getValue("wordSpacing")}
                      onChange={(v) => editor.setValue("wordSpacing", v)}
                      units={TYPO_UNITS}
                    />
                  </div>
                  <IconButton
                    options={[
                      {
                        value: "left",
                        icon: <AlignLeft {...ICO} />,
                        label: "left",
                      },
                      {
                        value: "center",
                        icon: <AlignCenter {...ICO} />,
                        label: "center",
                      },
                      {
                        value: "right",
                        icon: <AlignRight {...ICO} />,
                        label: "right",
                      },
                      {
                        value: "justify",
                        icon: <AlignJustify {...ICO} />,
                        label: "justify",
                      },
                    ]}
                    value={editor.getValue("textAlign")}
                    onChange={(v) => editor.setValue("textAlign", v)}
                  />
                  <div className="f-prop-grid">
                    <IconButton
                      options={[
                        {
                          value: "none",
                          icon: <Type {...ICO} />,
                          label: "none",
                        },
                        {
                          value: "underline",
                          icon: <Underline {...ICO} />,
                          label: "underline",
                        },
                        {
                          value: "line-through",
                          icon: <Strikethrough {...ICO} />,
                          label: "line-through",
                        },
                      ]}
                      value={editor.getValue("textDecoration").split(" ")[0]}
                      onChange={(v) => editor.setValue("textDecoration", v)}
                    />
                    <IconButton
                      options={[
                        {
                          value: "none",
                          icon: <Type {...ICO} />,
                          label: "none",
                        },
                        {
                          value: "uppercase",
                          icon: <CaseUpper {...ICO} />,
                          label: "uppercase",
                        },
                        {
                          value: "lowercase",
                          icon: <CaseLower {...ICO} />,
                          label: "lowercase",
                        },
                        {
                          value: "capitalize",
                          icon: <CaseSensitive {...ICO} />,
                          label: "capitalize",
                        },
                      ]}
                      value={editor.getValue("textTransform")}
                      onChange={(v) => editor.setValue("textTransform", v)}
                    />
                  </div>
                  <PropRow label="Color">
                    <ColorSwatch
                      color={editor.getValue("color")}
                      onChange={(v) => editor.setValue("color", v)}
                    />
                  </PropRow>
                </Section>

                <Section title="Appearance" defaultOpen={false}>
                  <div className="f-prop-grid">
                    <ValueInput
                      prefix="Opacity"
                      value={editor.getValue("opacity")}
                      onChange={(v) => editor.setValue("opacity", v)}
                      units={["", "%"]}
                    />
                    <SelectDropdown
                      options={[
                        "auto",
                        "default",
                        "pointer",
                        "text",
                        "move",
                        "grab",
                        "grabbing",
                        "not-allowed",
                        "crosshair",
                        "wait",
                        "help",
                        "col-resize",
                        "row-resize",
                        "none",
                      ]}
                      value={editor.getValue("cursor")}
                      onChange={(v) => editor.setValue("cursor", v)}
                      placeholder="Cursor"
                    />
                  </div>
                  <ExpandableInput
                    label="Radius"
                    shorthandProp="borderRadius"
                    detailProps={RADIUS_DETAILS}
                    collapsedIcon={<IconCorners />}
                    expandedIcon={<IconRoundedRect />}
                    getValue={editor.getValue}
                    setValue={editor.setValue as (p: string, v: string) => void}
                  />
                </Section>

                <Section title="Fill & Borders" defaultOpen={false}>
                  <PropRow label="Background">
                    <ColorSwatch
                      color={editor.getValue("backgroundColor")}
                      onChange={(v) => editor.setValue("backgroundColor", v)}
                    />
                  </PropRow>

                  <SubPanel label="Border">
                    <PropRow label="Color">
                      <ColorSwatch
                        color={editor.getValue("borderColor")}
                        onChange={(v) => editor.setValue("borderColor", v)}
                      />
                    </PropRow>
                    <IconButton
                      options={[
                        {
                          value: "none",
                          icon: <Ban {...ICO} />,
                          label: "none",
                        },
                        {
                          value: "solid",
                          icon: <Square {...ICO} />,
                          label: "solid",
                        },
                        {
                          value: "dashed",
                          icon: <SquareDashed {...ICO} />,
                          label: "dashed",
                        },
                        {
                          value: "dotted",
                          icon: <CircleDot {...ICO} />,
                          label: "dotted",
                        },
                      ]}
                      value={editor.getValue("borderStyle")}
                      onChange={(v) => editor.setValue("borderStyle", v)}
                    />
                    <ExpandableInput
                      label="Width"
                      shorthandProp="borderWidth"
                      detailProps={BORDER_WIDTH_DETAILS}
                      collapsedIcon={<IconDashedRect />}
                      expandedIcon={<IconSolidRect />}
                      getValue={editor.getValue}
                      setValue={
                        editor.setValue as (p: string, v: string) => void
                      }
                    />
                  </SubPanel>

                  <SubPanel label="Outline">
                    <PropRow label="Color">
                      <ColorSwatch
                        color={editor.getValue("outlineColor")}
                        onChange={(v) => editor.setValue("outlineColor", v)}
                      />
                    </PropRow>
                    <div className="f-prop-grid">
                      <IconButton
                        options={[
                          {
                            value: "none",
                            icon: <Ban {...ICO} />,
                            label: "none",
                          },
                          {
                            value: "solid",
                            icon: <Square {...ICO} />,
                            label: "solid",
                          },
                          {
                            value: "dashed",
                            icon: <SquareDashed {...ICO} />,
                            label: "dashed",
                          },
                          {
                            value: "dotted",
                            icon: <CircleDot {...ICO} />,
                            label: "dotted",
                          },
                        ]}
                        value={editor.getValue("outlineStyle")}
                        onChange={(v) => editor.setValue("outlineStyle", v)}
                      />
                      <ValueInput
                        prefix="W"
                        value={editor.getValue("outlineWidth")}
                        onChange={(v) => editor.setValue("outlineWidth", v)}
                      />
                    </div>
                    <ValueInput
                      prefix="Offset"
                      value={editor.getValue("outlineOffset")}
                      onChange={(v) => editor.setValue("outlineOffset", v)}
                    />
                  </SubPanel>

                  <SubPanel label="Shadow">
                    <BoxShadowEditor
                      value={editor.getValue("boxShadow")}
                      onChange={(v) => editor.setValue("boxShadow", v)}
                    />
                  </SubPanel>
                </Section>
              </>
            )}
          </div>

          {/* Copy prompt bar */}
          <CopyPromptBar
            changeCount={changeCount}
            onPush={handlePush}
            onReset={editor.resetAll}
            bridgeConnected={bridgeAvailable}
            externalState={autoPushState}
            externalProgressMs={800}
          />
        </div>
      )}
    </div>
  );
}
