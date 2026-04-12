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
  action,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
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
      <div className="f-section-header">
        <button className="f-section-toggle" onClick={toggle}>
          <IconChevron open={open} />
          <span>{title}</span>
        </button>
        {action}
      </div>
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
    setDraft(value);
    if (!value.trim()) setEditing(true);
  }, [value]);

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
  onPush,
  onCopy,
  onReset,
  bridgeConnected = false,
  externalState = null,
  externalProgressMs = 800,
}: {
  changeCount: number;
  onPush?: () => Promise<boolean>;
  onCopy?: () => void;
  onReset: () => void;
  bridgeConnected?: boolean;
  externalState?: "pushing" | null;
  externalProgressMs?: number;
}) {
  const [state, setState] = useState<"idle" | "countdown" | "pushing" | "applied">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const startAppliedState = (durationMs = 1200) => {
    setState("applied");
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setState("idle");
    }, durationMs);
  };

  const handlePush = async () => {
    if (!onPush) return;
    setState("pushing");
    const ok = await onPush();
    if (!ok) {
      setState("idle");
      return;
    }
    startAppliedState();
  };

  useEffect(() => clearTimer, []);

  const effectiveState = externalState ?? state;

  if (changeCount === 0 && !externalState && state === "idle") return null;

  return (
    <div
      className={`f-copy-bar${
        effectiveState === "applied"
          ? " f-copy-bar-countdown"
          : ""
      }`}
    >
      {externalState === "pushing" && (
        <div
          className="f-copy-progress"
          style={{ animationDuration: `${externalProgressMs}ms` }}
        />
      )}
      {effectiveState === "applied" && (
        <div
          className="f-copy-progress"
          style={{ animationDuration: "1200ms" }}
        />
      )}
      <div className="f-copy-bar-inner">
        {effectiveState === "idle" ? (
          <>
            <span className="f-changes-count">
              {changeCount} {changeCount === 1 ? "update" : "updates"}
            </span>
            <div className="f-copy-bar-actions">
              <button className="f-reset-btn" onClick={onReset}>Reset</button>
              {bridgeConnected ? (
                <button className="f-copy-btn" onClick={handlePush}>
                  Push to Agent
                </button>
              ) : (
                <button className="f-copy-btn" onClick={() => {
                  onCopy?.();
                  startAppliedState();
                }}>
                  Copy Prompt
                </button>
              )}
            </div>
          </>
        ) : effectiveState === "pushing" ? (
          <span className="f-changes-count">Applying changes…</span>
        ) : effectiveState === "applied" ? (
          <span className="f-changes-count">Applied</span>
        ) : null}
      </div>
    </div>
  );
}
