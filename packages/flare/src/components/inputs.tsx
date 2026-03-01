import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CSS_UNITS, KEYWORD_UNITS } from "../constants";
import { useClickOutside } from "../hooks";
import { toHex } from "../utils";

// ── Value Parsing ──────────────────────────────────

function parseValue(val: string): { num: number; unit: string; raw: string } {
  const m = val.match(
    /^([\d.+-]+)\s*(px|em|rem|%|vw|vh|ch|vmin|vmax|pt|cm|mm|in)?$/,
  );
  if (m) return { num: parseFloat(m[1]), unit: m[2] || "", raw: val };
  return { num: NaN, unit: "", raw: val };
}

function isNumericInput(s: string): boolean {
  return s === "" || /^[+-]?\d*\.?\d*$/.test(s);
}

function stripUnit(val: string): string {
  const p = parseValue(val);
  return !isNaN(p.num) && p.unit ? String(p.num) : val;
}

// ── ValueInput ─────────────────────────────────────

export function ValueInput({
  value,
  suffix,
  prefix,
  onChange,
  units,
}: {
  value: string;
  suffix?: string;
  prefix?: string;
  onChange?: (val: string) => void;
  units?: string[];
}) {
  const [draft, setDraft] = useState(value);
  const [inputStr, setInputStr] = useState(() => stripUnit(value));
  const [focused, setFocused] = useState(false);
  const [unitOpen, setUnitOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrubRef = useRef<{
    startX: number;
    startVal: number;
    unit: string;
  } | null>(null);

  const draftParsed = parseValue(draft);
  const lastUnitRef = useRef(draftParsed.unit);
  if (draftParsed.unit) lastUnitRef.current = draftParsed.unit;
  const currentUnit = draftParsed.unit || lastUnitRef.current;

  useEffect(() => {
    if (!focused) {
      setDraft(value);
      setInputStr(stripUnit(value));
      const parsed = parseValue(value);
      if (parsed.unit) lastUnitRef.current = parsed.unit;
    }
  }, [value, focused]);

  const emit = (fullVal: string) => {
    setDraft(fullVal);
    onChange?.(fullVal);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputStr(raw);

    const typed = parseValue(raw);
    if (!isNaN(typed.num) && typed.unit) {
      emit(raw);
      return;
    }

    if (currentUnit && isNumericInput(raw)) {
      emit(raw === "" ? "" : `${raw}${currentUnit}`);
    } else {
      emit(raw);
    }
  };

  const handleFocus = () => {
    setFocused(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleBlur = () => {
    setFocused(false);
    setUnitOpen(false);
    setInputStr(stripUnit(draft));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setDraft(value);
      setInputStr(stripUnit(value));
      onChange?.(value);
      inputRef.current?.blur();
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (!isNaN(draftParsed.num)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const next = draftParsed.num + (e.key === "ArrowUp" ? step : -step);
        const newVal = `${next}${currentUnit}`;
        setDraft(newVal);
        setInputStr(String(next));
        onChange?.(newVal);
      }
    }
  };

  const handleScrubStart = (e: React.MouseEvent) => {
    if (!onChange) return;
    e.preventDefault();
    if (isNaN(draftParsed.num)) return;
    scrubRef.current = {
      startX: e.clientX,
      startVal: draftParsed.num,
      unit: currentUnit,
    };

    const onMove = (ev: MouseEvent) => {
      if (!scrubRef.current) return;
      const delta = ev.clientX - scrubRef.current.startX;
      const step = ev.shiftKey ? 10 : 1;
      const raw = scrubRef.current.startVal + Math.round(delta / 2) * step;
      const next = Math.round(raw * 100) / 100;
      const newVal = `${next}${scrubRef.current.unit}`;
      setDraft(newVal);
      setInputStr(String(next));
      onChange(newVal);
    };
    const onUp = () => {
      scrubRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "ew-resize";
  };

  const unitList = units ?? CSS_UNITS;

  const handleUnitChange = (newUnit: string) => {
    if (KEYWORD_UNITS.has(newUnit)) {
      setDraft(newUnit);
      setInputStr(newUnit);
      onChange?.(newUnit);
    } else {
      const num = isNaN(draftParsed.num) ? 0 : draftParsed.num;
      const newVal = `${num}${newUnit}`;
      setDraft(newVal);
      setInputStr(String(num));
      onChange?.(newVal);
    }
    setUnitOpen(false);
  };

  const isKeywordVal =
    unitList.includes(draft.trim()) && parseValue(draft.trim()).unit === "";
  const showUnit =
    onChange && (currentUnit || !isNaN(draftParsed.num) || isKeywordVal);

  if (!onChange) {
    return (
      <div className="f-value-input">
        {prefix && <span className="f-value-prefix">{prefix}</span>}
        <span>{stripUnit(value)}</span>
        {suffix && <span className="f-value-suffix">{suffix}</span>}
      </div>
    );
  }

  return (
    <div
      className={`f-value-input editable${focused ? " focused" : ""}${isKeywordVal && !focused ? " keyword" : ""}`}
    >
      {prefix && (
        <span
          className={`f-value-prefix${!isKeywordVal ? " scrubable" : ""}`}
          onMouseDown={!isKeywordVal ? handleScrubStart : undefined}
          title={!isKeywordVal ? "Drag to adjust" : undefined}
        >
          {prefix}
        </span>
      )}
      {isKeywordVal && !focused ? (
        <span className="f-keyword-label">{draft}</span>
      ) : (
        <input
          ref={inputRef}
          value={inputStr}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      )}
      {showUnit && (
        <div className="f-unit-dropdown-wrap">
          <button
            className="f-unit-btn"
            onMouseDown={(e) => {
              e.preventDefault();
              setUnitOpen(!unitOpen);
            }}
            tabIndex={-1}
          >
            {isKeywordVal ? draft.trim() : currentUnit || "—"}
          </button>
          {unitOpen && (
            <div className="f-unit-menu">
              {unitList.map((u) => (
                <button
                  key={u}
                  className={`f-unit-option${u === currentUnit || (isKeywordVal && u === draft.trim()) ? " active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleUnitChange(u);
                  }}
                >
                  {u}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {suffix && <span className="f-value-suffix">{suffix}</span>}
    </div>
  );
}

// ── ColorSwatch ────────────────────────────────────

export function ColorSwatch({
  color,
  onChange,
}: {
  color: string;
  onChange?: (val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(color);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(color);
  }, [color]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== color && onChange) onChange(draft);
  };

  const openPicker = (e: React.MouseEvent) => {
    e.stopPropagation();
    pickerRef.current?.click();
  };

  return (
    <div
      className={`f-color-row${onChange ? " editable" : ""}`}
      onClick={() => onChange && setEditing(true)}
    >
      <div
        className="f-swatch"
        style={{ background: color }}
        onClick={onChange ? openPicker : undefined}
      />
      {onChange && (
        <input
          ref={pickerRef}
          type="color"
          className="f-color-picker"
          value={toHex(color)}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
      )}
      {editing ? (
        <input
          ref={inputRef}
          className="f-color-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(color);
              setEditing(false);
            }
          }}
        />
      ) : (
        <span className="f-color-hex">{color}</span>
      )}
    </div>
  );
}

// ── SelectDropdown ─────────────────────────────────

export function SelectDropdown({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: string[];
  value: string;
  onChange?: (val: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, open, () => setOpen(false));

  const displayLabel = value || placeholder || "";

  return (
    <div className="f-dropdown" ref={ref}>
      <button
        className="f-dropdown-trigger"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span className={!value && placeholder ? "f-dropdown-placeholder" : ""}>
          {displayLabel}
        </span>
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          className={`f-dropdown-chevron${open ? " open" : ""}`}
        >
          <path
            d="M1 1l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="f-dropdown-menu">
          {options.map((opt) => (
            <button
              key={opt}
              className={`f-dropdown-option${opt === value ? " active" : ""}`}
              onClick={() => {
                onChange?.(opt);
                setOpen(false);
              }}
              type="button"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── FontDropdown ───────────────────────────────────

export function FontDropdown({
  fonts,
  value,
  onChange,
}: {
  fonts: string[];
  value: string;
  onChange?: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useClickOutside(ref, open, () => {
    setOpen(false);
    setSearch("");
  });

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return fonts;
    const q = search.toLowerCase();
    return fonts.filter((f) => f.toLowerCase().includes(q));
  }, [fonts, search]);

  const handleSelect = useCallback(
    (font: string) => {
      onChange?.(font);
      setOpen(false);
      setSearch("");
    },
    [onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    } else if (e.key === "Enter" && search) {
      handleSelect(search);
    }
  };

  const displayValue = value.replace(/^["']|["']$/g, "");

  return (
    <div className="f-font-dropdown" ref={ref}>
      <button
        className="f-dropdown-trigger"
        onClick={() => setOpen(!open)}
        type="button"
        style={displayValue ? { fontFamily: displayValue } : undefined}
      >
        <span>{displayValue || "Select font…"}</span>
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          className={`f-dropdown-chevron${open ? " open" : ""}`}
        >
          <path
            d="M1 1l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="f-font-dropdown-menu">
          <input
            ref={inputRef}
            className="f-font-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search fonts…"
            spellCheck={false}
          />
          <div className="f-font-list" ref={listRef}>
            {filtered.length === 0 && (
              <div className="f-font-empty">
                {search ? (
                  <button
                    className="f-dropdown-option"
                    onClick={() => handleSelect(search)}
                    type="button"
                  >
                    Use "{search}"
                  </button>
                ) : (
                  "No fonts found"
                )}
              </div>
            )}
            {filtered.map((font) => (
              <button
                key={font}
                className={`f-dropdown-option${font === displayValue ? " active" : ""}`}
                onClick={() => handleSelect(font)}
                type="button"
                style={{ fontFamily: font }}
              >
                {font}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ExpandableInput ────────────────────────────────

export function ExpandableInput({
  label,
  shorthandProp,
  detailProps,
  collapsedIcon,
  expandedIcon,
  getValue,
  setValue,
  units,
}: {
  label: string;
  shorthandProp: string;
  detailProps: { prefix: string; prop: string }[];
  collapsedIcon: React.ReactNode;
  expandedIcon: React.ReactNode;
  getValue: (prop: string) => string;
  setValue: (prop: string, value: string) => void;
  units?: string[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <div className="f-radius-row">
        <ValueInput
          prefix={label}
          value={getValue(shorthandProp)}
          onChange={(v) => setValue(shorthandProp, v)}
          units={units}
        />
        <button
          className="f-radius-toggle"
          onClick={() => setExpanded(true)}
          type="button"
          title={`Edit individual ${label.toLowerCase()} values`}
        >
          {collapsedIcon}
        </button>
      </div>
    );
  }

  const pairs: { prefix: string; prop: string }[][] = [];
  for (let i = 0; i < detailProps.length; i += 2) {
    pairs.push(detailProps.slice(i, i + 2));
  }

  return (
    <div className="f-radius-expanded">
      <div className="f-radius-header">
        <span className="f-radius-label">{label}</span>
        <button
          className="f-radius-toggle"
          onClick={() => setExpanded(false)}
          type="button"
          title={`Use single ${label.toLowerCase()} value`}
        >
          {expandedIcon}
        </button>
      </div>
      {pairs.map((pair, i) => (
        <div key={i} className="f-prop-grid">
          {pair.map((detail) => (
            <ValueInput
              key={detail.prop}
              prefix={detail.prefix}
              value={getValue(detail.prop)}
              onChange={(v) => setValue(detail.prop, v)}
              units={units}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
