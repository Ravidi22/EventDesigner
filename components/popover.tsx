"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

// One button, and a small panel of CONTROLS hung off it.
//
// The counterpart to components/menu.tsx, which hangs a list of ACTIONS off one button — same
// dismissal contract (a press outside closes it, Escape closes it), different contents. A menu's
// rows are chosen with the arrow keys and focus never leaves the trigger; this one holds fields, so
// focus goes INTO the panel and Tab walks them like any other form.
//
// It exists because the studio's inspector needed one and the app had already grown a hand-rolled
// twin — the toolbar's numbering panel (app/(app)/studio/toolbar.tsx), which predates this and is
// still its own code. This is the shared one; anything new that needs a panel of fields uses it, so
// that every floating surface in the app stays one of Select, Menu, or this.
//
// It opens UPWARDS, because the bars that use it run along the bottom of a canvas. Give it a `side`
// the day something at the top of a screen wants one.
//
// ESCAPE IS CAPTURED, DELIBERATELY. The screens that use this bind their own window-level shortcuts
// (Escape clears the studio's selection, Delete removes it), and a popover that closed AND wiped the
// selection behind it on one press would take its own trigger off the screen with it. The listener
// therefore runs in the capture phase and stops the event there, so Escape means "close this" for
// exactly as long as something is open.
export function Popover({
  label,
  icon: Icon,
  leading,
  value,
  tone = "default",
  disabled,
  chevron = true,
  panelClassName = "w-64",
  children,
}: {
  /** What the button opens, spelled out — it is the trigger's accessible name and its tooltip, and
   *  the panel's own label. "סיבוב", not "פתח". */
  label: string;
  icon?: LucideIcon;
  /** Anything that is not a lucide icon in the icon's place — a colour swatch, say. */
  leading?: ReactNode;
  /** The one number or word worth reading without opening the panel: an angle, a count, a shade's
   *  name. This is what makes a row of these readable as a summary rather than as a row of buttons. */
  value?: ReactNode;
  /** "warn" for a subject that is telling you something is wrong underneath it (a ceiling item with
   *  no rod above it) — the chip carries the warning ink so the bar says so before it is opened. */
  tone?: "default" | "warn";
  disabled?: boolean;
  /** Off for a trigger that is already obviously a disclosure by its shape. */
  chevron?: boolean;
  /** The panel's width, mostly — content decides its height. A fixed width and not a max: a panel
   *  that resizes as its own fields change value is a panel that moves under the cursor. */
  panelClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    // pointerdown, not click, matching Select and Menu: the panel is gone before the click lands, so
    // a press on the canvas underneath does what a press on the canvas normally does.
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation(); // see the note above the component
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);

  // The panel takes focus when it opens so that Escape and Tab both have somewhere to start. The
  // panel itself, not its first field: several of these open onto a colour picker or a pair of
  // buttons, and stealing the caret into a number field would make the arrow keys mean something
  // different depending on which subject was opened.
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={label}
        onClick={() => setOpen((o) => !o)}
        className={
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 " +
          (open
            ? "bg-accent-tint text-accent"
            : tone === "warn"
              ? "text-warn-ink hover:bg-warn-tint"
              : "text-ink-soft hover:bg-accent-tint hover:text-accent-hover")
        }
      >
        {leading}
        {Icon && <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />}
        {/* The label is carried by the tooltip and the accessible name; on the chip only the value
            is spelled out, which is what keeps a bar of eight subjects to the width of a toolbar. */}
        <span className="sr-only">{label}</span>
        {value != null && <span className="nums max-w-24 truncate">{value}</span>}
        {chevron && <ChevronDown className="h-3 w-3 shrink-0 opacity-60" strokeWidth={2.5} />}
      </button>

      {open && (
        // Upwards and centred on its own trigger: these bars live along the BOTTOM of a canvas, and
        // a panel that dropped downwards would open off the screen. Centring (a physical translate,
        // so it reads the same in both directions) keeps a panel inside the plane whichever end of
        // the bar its chip sits at.
        <div
          id={id}
          ref={panel}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          className={
            "absolute bottom-[calc(100%+8px)] left-1/2 z-40 -translate-x-1/2 rounded-md border border-border bg-surface p-3 shadow-lifted focus-visible:outline-none " +
            panelClassName
          }
        >
          <p className="mb-2 text-xs font-semibold text-muted">{label}</p>
          {children}
        </div>
      )}
    </div>
  );
}
