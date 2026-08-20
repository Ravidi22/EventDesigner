"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Clock } from "lucide-react";
import { controlClassName, fieldLabelClassName } from "./control";

const pad2 = (n: number) => String(n).padStart(2, "0");
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface Clock24 {
  h: number;
  m: number;
}

function parseClock(v: string): Clock24 | null {
  const m = HHMM.exec(v);
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
}

const format = (c: Clock24) => `${pad2(c.h)}:${pad2(c.m)}`;

/** Now, snapped to the nearest step. Rounding 23:58 at a 5-minute step would land on 24:00, which is
 *  not a time — it becomes 23:55 rather than wrapping to the next day, because this is the value a
 *  designer gets from pressing "עכשיו" and it must never move the meeting to tomorrow. */
function roundedNow(step: number): Clock24 {
  const now = new Date();
  const total = Math.round((now.getHours() * 60 + now.getMinutes()) / step) * step;
  return total > 23 * 60 + 59 ? { h: 23, m: Math.floor(59 / step) * step } : { h: Math.floor(total / 60), m: total % 60 };
}

type Column = "h" | "m";

/**
 * The hour half of a booking, in the same shape as DateField beside it.
 *
 * WHY IT IS NOT `<input type="time">`. The appointment dialog shipped with the native control on the
 * argument that a time input "has no popup to clash with". It does, in every browser that draws one,
 * and the rest of the argument was worse: the field sat next to DateField — which exists precisely
 * because the OS control ignores our RTL layout and draws itself in the browser's locale, not ours —
 * wearing a different height, a different focus ring and the platform's own spin arrows. Two fields
 * on one row that answer the same question about the same meeting should not come from two design
 * systems. So this is DateField's sibling: the same trigger, the same popover shell, the same
 * roving-focus keyboard model, the same footer.
 *
 * ⚠ THE COLUMNS RUN LTR, ON PURPOSE, AND THIS IS THE ONE PLACE IN THE APP WHERE → MEANS "NEXT".
 * Everything else here is RTL-first and CLAUDE.md says arrow handlers must read → as *previous*.
 * A clock does not: "17:30" is written hour-then-minute left to right in Hebrew exactly as in
 * English — it is the same LTR run the trigger, the calendar chips and the quote all print with
 * `dir="ltr"`. Laying the picker out in RTL would put the minutes to the LEFT of the hours while the
 * value above it read the other way, so the column you reach for would be the one you did not want.
 * The columns are therefore `dir="ltr"` and the arrow keys follow what is on screen. Do not
 * "correct" this to match the RTL rule without also mirroring the value, which would be worse.
 */
export function TimeField({
  label,
  value,
  onChange,
  /** Minutes offered, as a step. 5 gives twelve rows — fine enough for a meeting at 17:45, coarse
   *  enough that nobody scrolls sixty of them. */
  minuteStep = 5,
  placeholder = "בחירת שעה",
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
  value: string; // HH:mm, "" = unset
  onChange: (value: string) => void;
  minuteStep?: number;
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
  const [focusAt, setFocusAt] = useState<{ column: Column; index: number }>({ column: "h", index: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());

  const selected = parseClock(value);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  // The step grid, PLUS whatever minute the field was actually handed if it is off-grid. A control
  // has to be able to show the value it was given: a record written at :23 — by an import, by a
  // hand-edited row, or by this field back when the step was 1 — would otherwise render with nothing
  // selected and silently round itself the moment anything else was touched.
  const minutes = (() => {
    const grid = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);
    return selected && !grid.includes(selected.m) ? [...grid, selected.m].sort((a, b) => a - b) : grid;
  })();
  // What an empty field commits from. The hour is now-ish so the list opens where the designer is
  // standing in the day; the minute is :00, NOT now's minute — picking "17" out of an empty field
  // has to give 17:00, which is what anyone booking a meeting means.
  const fallback: Clock24 = { h: roundedNow(minuteStep).h, m: 0 };
  const current = selected ?? fallback;

  /** Open at the value the field is holding, not wherever the cursor was left last time.
   *
   *  Placed here rather than in an effect on `open` (which is how DateField does it) so the cursor
   *  is already in the right place on the popover's FIRST render. Via an effect, the focus pass
   *  below runs once against the stale position first — which on a scrolling column means opening on
   *  00, jumping to 17, visibly. */
  const openPicker = () => {
    setFocusAt({ column: "h", index: Math.max(0, hours.indexOf(current.h)) });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Real DOM focus on the cell, the way DateField moves focus around its day grid — which also buys
  // the scroll-into-view inside these overflowing columns for free.
  useEffect(() => {
    if (open) cellRefs.current.get(`${focusAt.column}-${focusAt.index}`)?.focus();
  }, [focusAt, open]);

  /** Write one half of the clock, keeping the other. The popover deliberately STAYS OPEN: a time
   *  takes two picks, and DateField's close-on-click would shut the panel before the minutes. */
  const commit = (column: Column, index: number) => {
    const next = column === "h" ? { ...current, h: hours[index] } : { ...current, m: minutes[index] };
    onChange(format(next));
    setFocusAt({ column, index });
  };

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  };

  const onCellKeyDown = (e: KeyboardEvent, column: Column, index: number) => {
    const length = column === "h" ? hours.length : minutes.length;
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        setFocusAt({ column, index: Math.max(0, index - 1) });
        break;
      case "ArrowDown":
        e.preventDefault();
        setFocusAt({ column, index: Math.min(length - 1, index + 1) });
        break;
      // See the note on the component: these columns are LTR, so left is the hour and right is the
      // minute — the same order the value itself is written in.
      case "ArrowLeft":
        e.preventDefault();
        setFocusAt({ column: "h", index: Math.max(0, hours.indexOf(current.h)) });
        break;
      case "ArrowRight":
        e.preventDefault();
        setFocusAt({ column: "m", index: Math.max(0, minutes.indexOf(current.m)) });
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(column, index);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  const column = (kind: Column, heading: string, values: number[]) => (
    <div className="flex flex-col">
      <span className="mb-1 text-center text-[11px] font-medium text-muted">{heading}</span>
      {/* Height is `min(11rem, 38vh)`, not a flat pixel number. 11rem is a hair over five 34px rows,
          so a partial sixth is always cut off at the bottom — that clipped row is what tells you the
          column scrolls at all. The vh term is what stops the popover running off a short window:
          this opens inside a dialog that is itself capped to the viewport, and 24 hours at a fixed
          176px would otherwise put the footer buttons below the fold on a laptop in a call.
          `pe-0.5` reserves the scrollbar's own gutter — and reads as padding-RIGHT here, because
          these columns are the `dir="ltr"` island described above. */}
      <div role="listbox" aria-label={heading} className="scroll-slim max-h-[min(11rem,38vh)] w-[68px] overflow-y-auto pe-0.5">
        {values.map((n, index) => {
          const isSelected = !!selected && (kind === "h" ? selected.h : selected.m) === n;
          const isFocusable = focusAt.column === kind && focusAt.index === index;
          return (
            <button
              key={n}
              ref={(el) => {
                if (el) cellRefs.current.set(`${kind}-${index}`, el);
                else cellRefs.current.delete(`${kind}-${index}`);
              }}
              type="button"
              role="option"
              aria-selected={isSelected}
              tabIndex={isFocusable ? 0 : -1}
              onClick={() => commit(kind, index)}
              onKeyDown={(e) => onCellKeyDown(e, kind, index)}
              className={`nums mb-0.5 flex h-8 w-full items-center justify-center rounded-sm text-sm transition-colors ${
                isSelected ? "bg-accent font-semibold text-canvas" : "text-ink hover:bg-accent-tint"
              }`}
            >
              {pad2(n)}
            </button>
          );
        })}
      </div>
    </div>
  );

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
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openPicker())}
        onKeyDown={onTriggerKeyDown}
        className={`${controlClassName} flex w-full items-center gap-2 ps-3 pe-2.5 text-start disabled:cursor-not-allowed disabled:opacity-50 ${
          error ? "border-alert hover:border-alert" : ""
        } ${className}`}
      >
        <Clock className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} />
        <span className={`nums flex-1 truncate ${selected ? "text-ink" : "text-faint"}`} dir="ltr">
          {selected ? format(selected) : placeholder}
        </span>
      </button>
      {error && errorMessage && <p className="mt-1 text-xs text-alert">{errorMessage}</p>}

      {open && (
        <div className="absolute start-0 top-[calc(100%+6px)] z-20 rounded-md border border-border bg-surface p-3 shadow-lifted">
          {/* The one LTR island in an RTL app — see the note on the component. */}
          <div className="flex gap-2" dir="ltr">
            {column("h", "שעה", hours)}
            {column("m", "דקות", minutes)}
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 border-t border-border-soft pt-2">
            <button
              type="button"
              onClick={() => {
                onChange(format(roundedNow(minuteStep)));
                close();
              }}
              className="rounded-sm px-1.5 py-1 text-xs font-medium text-accent hover:text-accent-hover"
            >
              עכשיו
            </button>
            <div className="flex items-center gap-1">
              {!required && value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    close();
                  }}
                  className="rounded-sm px-1.5 py-1 text-xs font-medium text-muted hover:text-ink-soft"
                >
                  ניקוי
                </button>
              )}
              {/* DateField has no equivalent because a date is one click and then it closes. Two
                  columns need a way out that isn't "click somewhere else". */}
              <button
                type="button"
                onClick={close}
                className="rounded-sm px-1.5 py-1 text-xs font-medium text-accent hover:text-accent-hover"
              >
                אישור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
