import { ArrowUp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useClickOutside } from "../hooks";
import { IconChevron } from "../icons";
import {
  formatSourceLocation,
  getElementLabel,
  isFlareElement,
  type ElementInfo,
} from "../utils";

const SECTION_KEY = "flare-section-";

export function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(SECTION_KEY + title);
      if (stored !== null) return stored === "true";
    } catch {}
    return defaultOpen;
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(SECTION_KEY + title, String(next));
    } catch {}
  };

  return (
    <div className="f-section">
      <button className="f-section-header" onClick={toggle}>
        <IconChevron open={open} />
        <span>{title}</span>
      </button>
      {open && <div className="f-section-body">{children}</div>}
    </div>
  );
}

export function SubPanel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="f-subpanel">
      <span className="f-subpanel-label">{label}</span>
      <div className="f-subpanel-body">{children}</div>
    </div>
  );
}

export function PropRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="f-prop-row">
      <span className="f-prop-label">{label}</span>
      <div className="f-prop-value">{children}</div>
    </div>
  );
}

export function IconButton({
  options,
  value,
  onChange,
}: {
  options: { value: string; icon: React.ReactNode; label: string }[];
  value: string;
  onChange?: (val: string) => void;
}) {
  return (
    <div className="f-icon-btn-group">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`f-icon-btn${opt.value === value ? " active" : ""}`}
          onClick={() => onChange?.(opt.value)}
          title={opt.label}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}

export function Breadcrumb({
  el,
  onSelect,
  onHover,
  onHoverEnd,
}: {
  el: Element | null;
  onSelect: (el: Element) => void;
  onHover?: (el: Element) => void;
  onHoverEnd?: () => void;
}) {
  if (!el) return null;

  const path: Element[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.documentElement) {
    if (!isFlareElement(cur)) path.unshift(cur);
    cur = cur.parentElement;
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = scrollRef.current;
    if (container) container.scrollLeft = container.scrollWidth;
  }, [el]);

  return (
    <div className="f-breadcrumb" ref={scrollRef}>
      {path.map((node, i) => {
        const { tag, id, cls } = getElementLabel(node);
        const isActive = node === el;
        return (
          <span key={i} className="f-crumb-item">
            {i > 0 && <span className="f-crumb-sep">&gt;</span>}
            <button
              className={`f-crumb${isActive ? " active" : ""}`}
              onClick={() => onSelect(node)}
              onMouseEnter={() => onHover?.(node)}
              onMouseLeave={() => onHoverEnd?.()}
            >
              {tag}
              {id}
              {cls}
            </button>
          </span>
        );
      })}
    </div>
  );
}

export function SourceReference({
  info,
}: {
  info: ElementInfo | null;
}) {
  if (!info?.source) return null;

  const label = formatSourceLocation(info.source);
  const stack = info.stack
    .slice(1, 4)
    .map((frame) => {
      const location = formatSourceLocation(frame);
      return frame.componentName ? `${frame.componentName} · ${location}` : location;
    })
    .filter(Boolean);

  return (
    <div className="f-source-ref" title={label}>
      <div className="f-source-ref-main">
        <span className="f-source-ref-label">Source</span>
        <span className="f-source-ref-path">{label}</span>
      </div>
      {stack.length > 0 && (
        <div className="f-source-ref-stack">
          {stack.join("  |  ")}
        </div>
      )}
    </div>
  );
}

export function ElementComment({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(true);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const submit = () => {
    const nextValue = draft.trim();
    onChange(nextValue);
    setDraft(nextValue);
    setEditing(!nextValue);
  };

  const handleDelete = () => {
    setDraft("");
    onChange("");
    setEditing(true);
  };

  if (!editing && value.trim()) {
    return (
      <div className="f-element-comment">
        <div
          className="f-element-comment-pill"
          role="button"
          tabIndex={0}
          onClick={() => setEditing(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setEditing(true);
            }
          }}
          title="Edit comment"
        >
          <span className="f-element-comment-pill-text">
            {value}
          </span>
          <button
            className="f-element-comment-delete"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            title="Delete comment"
            aria-label="Delete comment"
          >
            <X size={12} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="f-element-comment">
      <div className="f-element-comment-editor">
        <textarea
          ref={inputRef}
          className="f-element-comment-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") {
              setDraft(value);
              onChange(value.trim());
              setEditing(!value.trim());
            }
          }}
          placeholder="Add a note for this component"
          rows={3}
        />
        <button
          className="f-element-comment-submit"
          onMouseDown={(e) => e.preventDefault()}
          onClick={submit}
          title="Save comment"
          aria-label="Save comment"
        >
          <ArrowUp size={13} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

export function CopyPromptBar({
  changeCount,
  onCopy,
  onReset,
}: {
  changeCount: number;
  onCopy: () => void;
  onReset: () => void;
}) {
  const [state, setState] = useState<"idle" | "countdown">("idle");
  const [seconds, setSeconds] = useState(5);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleCopy = () => {
    onCopy();
    setState("countdown");
    setSeconds(5);
    clearTimer();
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const remaining = Math.ceil(5 - elapsed);
      if (remaining <= 0) {
        clearTimer();
        setState("idle");
        onReset();
      } else {
        setSeconds(remaining);
      }
    }, 100);
  };

  const handleCancel = () => {
    clearTimer();
    setState("idle");
  };

  useEffect(() => clearTimer, []);

  if (changeCount === 0) return null;

  return (
    <div
      className={`f-copy-bar${state === "countdown" ? " f-copy-bar-countdown" : ""}`}
    >
      {state === "countdown" && <div className="f-copy-progress" />}
      <div className="f-copy-bar-inner">
        {state === "idle" ? (
          <>
            <span className="f-changes-count">
              {changeCount} {changeCount === 1 ? "update" : "updates"}
            </span>
            <div className="f-copy-bar-actions">
              <button className="f-reset-btn" onClick={onReset}>
                Reset
              </button>
              <button className="f-copy-btn" onClick={handleCopy}>
                Copy Prompt
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="f-changes-count">
              Copied! Resetting changes in {seconds}s…
            </span>
            <button className="f-cancel-btn" onClick={handleCancel}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
