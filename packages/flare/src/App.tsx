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
  Italic,
  MoveHorizontal,
  Square,
  SquareDashed,
  SquareMousePointer,
  Strikethrough,
  Type,
  Underline,
  WrapText,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import {
  AlignmentMatrix,
  BoxShadowEditor,
  Breadcrumb,
  ColorSwatch,
  CopyPromptBar,
  DisplayModePicker,
  ExpandableInput,
  FontDropdown,
  GridTrackEditor,
  IconButton,
  PropRow,
  Section,
  SelectDropdown,
  SettingsPopover,
  SubPanel,
  ValueInput,
} from "./components";
import { FONT_SIZE_UNITS, TYPO_UNITS } from "./constants";
import {
  useAvailableFonts,
  useInspector,
  usePosition,
  useStyleEditor,
  useTheme,
} from "./hooks";
import {
  IconCollapse,
  IconCorners,
  IconDashedRect,
  IconFlare,
  IconRoundedRect,
  IconSolidRect,
} from "./icons";
import { buildPrompt } from "./utils";

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

  const handleClose = useCallback(() => {
    setContentReady(false);
    setOpen(false); // start morph immediately
    try {
      localStorage.setItem("flare-expanded", "false");
    } catch {}
    clearTimeout(morphTimer.current);
    morphTimer.current = setTimeout(() => setExpanded(false), 250);
  }, []);

  const { theme, toggle: toggleTheme } = useTheme(shadowHost);
  const { side, toggle: toggleSide } = usePosition();
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
  const availableFonts = useAvailableFonts();

  const changeCount = editor.totalChangeCount;

  const handleCopy = () => {
    const entries = editor.getAllChanges();
    if (entries.length === 0) return;
    const prompt = buildPrompt(entries);
    navigator.clipboard.writeText(prompt);
  };

  const shellClass = [
    "f-shell",
    open ? "f-expanded" : "",
    side === "left" ? "f-left" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={shellClass}
      onClick={!expanded ? handleOpen : undefined}
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
          <div className="f-topbar">
            <div className="f-brand">
              <IconFlare />
              <span>Flare</span>
            </div>
            <div className="f-topbar-actions">
              <SettingsPopover
                theme={theme}
                onToggleTheme={toggleTheme}
                side={side}
                onToggleSide={toggleSide}
              />
              <button className="f-collapse-btn" onClick={handleClose}>
                <IconCollapse />
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
            <Breadcrumb
              el={selectedEl}
              onSelect={selectElement}
              onHover={highlightElement}
              onHoverEnd={clearHighlight}
            />
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
                <Section title="Layout">
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
            onCopy={handleCopy}
            onReset={editor.resetAll}
          />
        </div>
      )}
    </div>
  );
}
