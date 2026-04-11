import { Eye, EyeOff } from "lucide-react";
import { useCallback, useState } from "react";
import {
  ColorSwatch,
  SelectDropdown,
  ValueInput,
  Section,
  PropRow,
} from "../components";

// ── Types ─────────────────────────────────────────

export interface ColumnGuide {
  count: number;
  color: string;
  opacity: number;
  type: "stretch" | "left" | "center" | "right";
  width: number; // only used when type !== "stretch"
  margin: number;
  gutter: number;
}

export function defaultGuide(): ColumnGuide {
  return {
    count: 12,
    color: "#ff0000",
    opacity: 10,
    type: "stretch",
    width: 60,
    margin: 0,
    gutter: 20,
  };
}

// ── Overlay (rendered on the canvas surface inside each frame) ──

interface GuideOverlayProps {
  guide: ColumnGuide;
  frameWidth: number;
  frameHeight: number;
}

export function GuideOverlay({ guide, frameWidth, frameHeight }: GuideOverlayProps) {
  const { count, color, opacity, type, width, margin, gutter } = guide;
  if (count <= 0) return null;

  const columns: { left: number; w: number }[] = [];

  if (type === "stretch") {
    const available = frameWidth - margin * 2 - gutter * (count - 1);
    const colW = available / count;
    for (let i = 0; i < count; i++) {
      columns.push({
        left: margin + i * (colW + gutter),
        w: colW,
      });
    }
  } else {
    const totalWidth = count * width + (count - 1) * gutter;
    let startX: number;
    if (type === "left") {
      startX = margin;
    } else if (type === "right") {
      startX = frameWidth - margin - totalWidth;
    } else {
      startX = (frameWidth - totalWidth) / 2;
    }
    for (let i = 0; i < count; i++) {
      columns.push({
        left: startX + i * (width + gutter),
        w: width,
      });
    }
  }

  const rgba = hexToRgba(color, opacity / 100);

  return (
    <div
      className="f-guide-overlay"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {columns.map((col, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: col.left,
            top: 0,
            width: col.w,
            height: frameHeight,
            background: rgba,
          }}
        />
      ))}
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Settings Panel ────────────────────────────────

interface GuideSettingsProps {
  guides: ColumnGuide[];
  onChange: (guides: ColumnGuide[]) => void;
  visible: boolean;
  onToggleVisible: () => void;
}

export function GuideSettings({ guides, onChange, visible, onToggleVisible }: GuideSettingsProps) {
  const addGuide = useCallback(() => {
    onChange([...guides, defaultGuide()]);
  }, [guides, onChange]);

  const updateGuide = useCallback(
    (index: number, partial: Partial<ColumnGuide>) => {
      onChange(
        guides.map((g, i) => (i === index ? { ...g, ...partial } : g)),
      );
    },
    [guides, onChange],
  );

  const removeGuide = useCallback(
    (index: number) => {
      onChange(guides.filter((_, i) => i !== index));
    },
    [guides, onChange],
  );

  return (
    <Section
      title="Column Guides"
      defaultOpen
      action={
        <button
          className="f-settings-btn"
          onClick={(e) => { e.stopPropagation(); onToggleVisible(); }}
          title={visible ? "Hide guides" : "Show guides"}
          style={{ width: 22, height: 22 }}
        >
          {visible ? <Eye size={13} strokeWidth={1.5} /> : <EyeOff size={13} strokeWidth={1.5} />}
        </button>
      }
    >
      {guides.map((guide, i) => (
        <GuideEditor
          key={i}
          guide={guide}
          onChange={(partial) => updateGuide(i, partial)}
          onRemove={() => removeGuide(i)}
        />
      ))}
      <button className="f-inspect-btn" onClick={addGuide}>
        <span>Add Guide</span>
      </button>
    </Section>
  );
}

// ── Single guide editor ───────────────────────────

interface GuideEditorProps {
  guide: ColumnGuide;
  onChange: (partial: Partial<ColumnGuide>) => void;
  onRemove: () => void;
}

function GuideEditor({ guide, onChange, onRemove }: GuideEditorProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="f-subpanel">
      <div
        className="f-subpanel-label"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span>{guide.count} Columns</span>
        <button
          className="f-grid-track-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{ width: 16, height: 16 }}
        >
          &times;
        </button>
      </div>
      {expanded && (
        <div className="f-subpanel-body">
          <PropRow label="Count">
            <SelectDropdown
              options={["1", "2", "3", "4", "5", "6", "8", "10", "12", "16", "24"]}
              value={String(guide.count)}
              onChange={(v) => onChange({ count: parseInt(v) || 1 })}
            />
          </PropRow>
          <PropRow label="Color">
            <ColorSwatch
              color={guide.color}
              onChange={(v) => onChange({ color: v })}
            />
          </PropRow>
          <ValueInput
            prefix="Opacity"
            value={`${guide.opacity}%`}
            onChange={(v) =>
              onChange({ opacity: Math.max(0, Math.min(100, parseInt(v) || 10)) })
            }
          />
          <PropRow label="Type">
            <SelectDropdown
              options={["stretch", "left", "center", "right"]}
              value={guide.type}
              onChange={(v) =>
                onChange({ type: v as ColumnGuide["type"] })
              }
            />
          </PropRow>
          {guide.type !== "stretch" && (
            <ValueInput
              prefix="Width"
              value={`${guide.width}`}
              onChange={(v) => onChange({ width: parseInt(v) || 60 })}
            />
          )}
          <ValueInput
            prefix="Margin"
            value={`${guide.margin}`}
            onChange={(v) => onChange({ margin: parseInt(v) || 0 })}
          />
          <ValueInput
            prefix="Gutter"
            value={`${guide.gutter}`}
            onChange={(v) => onChange({ gutter: parseInt(v) || 0 })}
          />
        </div>
      )}
    </div>
  );
}
