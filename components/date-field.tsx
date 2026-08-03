"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Calendar, ChevronRight } from "lucide-react";
import { controlClassName, fieldLabelClassName } from "./control";
import { IconButton } from "./icon-button";

const WEEKDAY_LABELS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"]; // Sun..Sat — matches Date#getDay()

function parseISODate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

// 6 full weeks (42 cells) so the grid never changes height between months.
function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

const monthLabel = (d: Date) => d.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
const fullLabel = (d: Date) => d.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });

// Custom Hebrew calendar popover, replacing the OS-drawn <input type="date"> — same reasoning as
// Select: the native control can't take the EvE pill/hairline treatment, its picker ignores our
// RTL layout, and it renders the month/day names in the browser's own locale, not necessarily Hebrew.
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  placeholder = "בחירת תאריך",
  required,
  error,
  errorMessage,
  id,
  className = "",
  wrapperClassName = "",
  "aria-label": ariaLabel,
  disabled,
}: {
  label?: string;
  value: string; // ISO yyyy-mm-dd, "" = unset
  onChange: (value: string) => void;
  min?: string; // ISO yyyy-mm-dd
  max?: string; // ISO yyyy-mm-dd
  placeholder?: string;
  required?: boolean;
  error?: boolean;
  errorMessage?: string;
  id?: string;
  className?: string;
  wrapperClassName?: string;
  "aria-label"?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseISODate(value);
  const minDate = min ? parseISODate(min) : null;
  const maxDate = max ? parseISODate(max) : null;
  const [focusDate, setFocusDate] = useState(() => selected ?? new Date());
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const today = new Date();

  // Re-sync the visible month to the field's own value each time the popover opens.
  useEffect(() => {
    if (open) setFocusDate(selected ?? new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) cellRefs.current.get(toISODate(focusDate))?.focus();
  }, [focusDate, open]);

  const isDisabledDate = (d: Date) => (!!minDate && d < minDate) || (!!maxDate && d > maxDate);

  const commit = (d: Date) => {
    if (isDisabledDate(d)) return;
    onChange(toISODate(d));
    setOpen(false);
    triggerRef.current?.focus();
  };

  const clear = () => {
    onChange("");
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  // RTL: the right arrow steps backward in time and the left arrow forward, since a later date
  // sits toward the reading-start's left in the week grid (CLAUDE.md — arrow keys account for RTL).
  const onGridKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        setFocusDate((d) => addDays(d, -1));
        break;
      case "ArrowLeft":
        e.preventDefault();
        setFocusDate((d) => addDays(d, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusDate((d) => addDays(d, -7));
        break;
      case "ArrowDown":
        e.preventDefault();
        setFocusDate((d) => addDays(d, 7));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(focusDate);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  const grid = monthGrid(focusDate);
  const todayDisabled = isDisabledDate(today);

  return (
    <div ref={rootRef} className={`relative ${wrapperClassName}`}>
      {label && (
        <span className={fieldLabelClassName}>
          {label}
          {required && <span className="text-alert"> *</span>}
        </span>
      )}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className={`${controlClassName} flex w-full items-center gap-2 ps-3 pe-2.5 text-start disabled:cursor-not-allowed disabled:opacity-50 ${
          error ? "border-alert hover:border-alert" : ""
        } ${className}`}
      >
        <Calendar className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} />
        <span className={`nums flex-1 truncate ${selected ? "text-ink" : "text-muted"}`}>{selected ? fullLabel(selected) : placeholder}</span>
      </button>
      {error && errorMessage && <p className="mt-1 text-xs text-alert">{errorMessage}</p>}

      {open && (
        <div className="absolute start-0 top-[calc(100%+6px)] z-20 w-72 rounded-md border border-border bg-surface p-3 shadow-lifted">
          <div className="flex items-center justify-between">
            <IconButton label="החודש הקודם" onClick={() => setFocusDate((d) => addMonths(d, -1))}>
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </IconButton>
            <span className="text-sm font-semibold text-ink">{monthLabel(focusDate)}</span>
            <IconButton label="החודש הבא" onClick={() => setFocusDate((d) => addMonths(d, 1))}>
              <ChevronRight className="h-4 w-4 rotate-180" strokeWidth={2} />
            </IconButton>
          </div>

          <div className="mt-2 grid grid-cols-7 place-items-center gap-y-1">
            {WEEKDAY_LABELS.map((w, i) => (
              <span key={i} className="flex h-7 w-8 items-center justify-center text-xs text-muted">
                {w}
              </span>
            ))}
            {grid.map((d) => {
              const iso = toISODate(d);
              const inMonth = d.getMonth() === focusDate.getMonth();
              const isSelected = !!selected && sameDay(d, selected);
              const isToday = sameDay(d, today);
              const isFocusable = sameDay(d, focusDate);
              const isDisabled = isDisabledDate(d);
              return (
                <button
                  key={iso}
                  ref={(el) => {
                    if (el) cellRefs.current.set(iso, el);
                    else cellRefs.current.delete(iso);
                  }}
                  type="button"
                  tabIndex={isFocusable ? 0 : -1}
                  disabled={isDisabled}
                  aria-label={fullLabel(d)}
                  aria-pressed={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  onClick={() => commit(d)}
                  onKeyDown={onGridKeyDown}
                  className={`nums flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors ${
                    isSelected
                      ? "bg-accent font-semibold text-canvas"
                      : isToday
                        ? "border border-accent-line text-ink"
                        : inMonth
                          ? "text-ink hover:bg-accent-tint"
                          : "text-faint hover:bg-accent-tint"
                  } ${isDisabled ? "cursor-not-allowed opacity-35 hover:bg-transparent" : ""}`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-border-soft pt-2">
            <button
              type="button"
              disabled={todayDisabled}
              onClick={() => commit(today)}
              className="rounded-sm px-1.5 py-1 text-xs font-medium text-accent hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:text-accent"
            >
              היום
            </button>
            {!required && value && (
              <button type="button" onClick={clear} className="rounded-sm px-1.5 py-1 text-xs font-medium text-muted hover:text-ink-soft">
                ניקוי
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
