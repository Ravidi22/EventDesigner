"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { CloseButton } from "./close-button";

// One button, and a small panel of CONTROLS hung off it.
//
// The counterpart to components/menu.tsx, which hangs a list of ACTIONS off one button — same
// dismissal contract (a press outside closes it, Escape closes it), different contents. A menu's
// rows are chosen with the arrow keys and focus never leaves the trigger; this one holds fields, so
// focus goes INTO the panel and Tab walks them like any other form.
//
// This is THE floating panel of the app: the inspector bars' subjects, the toolbar's numbering and
// saved-sketch panels, the catalog appearance editor's bars. Anything new that needs a panel of
// fields uses it, so that every floating surface stays one of Select, Menu, or this.
//
// THE PANEL, every time (it used to be a bare card with a 12px muted line for a heading, and each
// caller decided its own padding):
//   - a white card: `rounded-md`, hairline `border-border`, `shadow-lifted` — the dropdown elevation;
//   - a HEADER: the subject's icon in accent, its name in ink at 14px bold, and the shared ✕
//     (components/close-button.tsx) — every popup has one, visible at rest;
//   - a hairline under the header, then the body at `p-4` (16px, the md spacing step).
// Width is the caller's (`panelClassName`), but never wider than the viewport, and the panel is
// CLAMPED: it opens centred on its trigger and is then slid back inside whatever clips it (the
// canvas, or the window) with a 12px margin, and given a scrolling body if it is taller than the
// room above (or below) its trigger. A centred 320px panel off a chip at the end of a wide bar used
// to open half off the canvas.
//
// It opens UPWARDS by default, because the bars that use it run along the bottom of a canvas;
// `side="bottom"` is for the ones along a top edge (the dressing bar, the studio toolbar).
//
// ESCAPE IS CAPTURED, DELIBERATELY. The screens that use this bind their own window-level shortcuts
// (Escape clears the studio's selection, Delete removes it), and a popover that closed AND wiped the
// selection behind it on one press would take its own trigger off the screen with it. The listener
// therefore runs in the capture phase and stops the event there, so Escape means "close this" for
// exactly as long as something is open. An Escape that lands inside a native <dialog> opened FROM
// the panel (a ConfirmDialog) is that dialog's, and leaves the panel alone.
export function Popover({
  label,
  icon: Icon,
  leading,
  value,
  tone = "default",
  disabled,
  chevron = true,
  trigger: triggerKind = "chip",
  panelClassName = "w-72",
  side = "top",
  children,
}: {
  /** What the button opens, spelled out — it is the trigger's accessible name and its tooltip, and
   *  the panel's own heading. "סיבוב", not "פתח". */
  label: string;
  icon?: LucideIcon;
  /** Anything that is not a lucide icon in the icon's place — a colour swatch, say. */
  leading?: ReactNode;
  /** The one number or word worth reading without opening the panel: an angle, a count, a shade's
   *  name. This is what makes a row of these readable as a summary rather than as a row of buttons. */
  value?: ReactNode;
  /** "warn" for a subject that is telling you something is wrong underneath it — the chip carries
   *  the warning ink so the bar says so before it is opened. */
  tone?: "default" | "warn";
  disabled?: boolean;
  /** Off for a trigger that is already obviously a disclosure by its shape. */
  chevron?: boolean;
  /** "chip" — the inspector bars' icon + value + chevron. "icon" — a round icon-only button, the
   *  studio toolbar's own shape (IconButton, md). */
  trigger?: "chip" | "icon";
  /** The panel's width, mostly — content decides its height. A fixed width and not a max: a panel
   *  that resizes as its own fields change value is a panel that moves under the cursor. */
  panelClassName?: string;
  /** Which way the panel opens. Upwards by default — these chips live in bars along the BOTTOM of
   *  a canvas; "bottom" is for a bar along its top. */
  side?: "top" | "bottom";
  /** The body. A function gets `close`, for a panel whose main button is also its last step. */
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  // Where the clamp put it: a horizontal nudge from centred, and a height cap when the room above
  // (or below) the trigger is shorter than the panel. Reset on every open.
  const [place, setPlace] = useState<{ dx: number; maxH?: number }>({ dx: 0 });
  const root = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const placed = useRef(0);
  const id = useId();
  const titleId = `${id}-title`;

  const triggerId = `${id}-trigger`;
  // Handed to the body as well as to the ✕, so it reaches the trigger by id rather than through the
  // ref: a ref read inside something passed down during render is what the React compiler refuses.
  const close = () => {
    setOpen(false);
    document.getElementById(triggerId)?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // pointerdown, not click, matching Select and Menu: the panel is gone before the click lands, so
    // a press on the canvas underneath does what a press on the canvas normally does.
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A ConfirmDialog opened FROM the panel keeps its own Escape. Only a <dialog> inside the panel:
      // the catalog's appearance editor is itself a <dialog> these panels open within.
      const nested = e.target instanceof Element ? e.target.closest("dialog") : null;
      if (nested && panel.current?.contains(nested)) return;
      e.stopPropagation(); // see the note above the component
      // And the default action: a <dialog> ENCLOSING the panel (the appearance editor) closes on
      // Escape through its close watcher, which stopPropagation does not reach — the panel closed
      // and the whole editor cancelled with it, outline edits and all.
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);

  // The clamp. Measured before paint, against the panel as laid out centred (the nudge already
  // applied is taken back off first, so a resize re-measures from the same origin).
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = panel.current;
      const t = triggerRef.current;
      if (!el || !t || !root.current) return;
      const b = clipBounds(root.current);
      const M = 12;
      const r = el.getBoundingClientRect();
      const left = r.left - placed.current;
      const right = r.right - placed.current;
      let dx = 0;
      if (left < b.left + M) dx = b.left + M - left;
      else if (right > b.right - M) dx = b.right - M - right;
      const tr = t.getBoundingClientRect();
      const room = side === "top" ? tr.top - 8 - (b.top + M) : b.bottom - M - (tr.bottom + 8);
      // Header + the body's whole content (scrollHeight, so a body already capped still reports
      // what it would need) + the two hairlines.
      const head = el.firstElementChild as HTMLElement | null;
      const body = el.lastElementChild as HTMLElement | null;
      const natural = (head?.offsetHeight ?? 0) + (body?.scrollHeight ?? 0) + 2;
      const maxH = natural > room ? Math.max(160, Math.floor(room)) : undefined;
      placed.current = dx;
      setPlace((p) => (p.dx === dx && p.maxH === maxH ? p : { dx, maxH }));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, side]);

  // The panel takes focus when it opens so that Escape and Tab both have somewhere to start. The
  // panel itself, not its first field: several of these open onto a colour picker or a pair of
  // buttons, and stealing the caret into a number field would make the arrow keys mean something
  // different depending on which subject was opened.
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    placed.current = 0;
    setPlace({ dx: 0 });
    setOpen(true);
  };

  return (
    <div ref={root} className="relative">
      {triggerKind === "icon" ? (
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          aria-label={label}
          title={label}
          onClick={toggle}
          className={
            "rounded-pill p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-35 " +
            (open ? "bg-accent-tint text-accent hover:bg-accent-wash" : "text-muted hover:bg-accent-tint hover:text-accent-hover")
          }
        >
          {Icon && <Icon className="h-4 w-4" strokeWidth={2} />}
        </button>
      ) : (
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          title={label}
          onClick={toggle}
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
          {value != null && <span className="nums max-w-28 truncate">{value}</span>}
          {chevron && <ChevronDown className="h-3 w-3 shrink-0 opacity-60" strokeWidth={2.5} />}
        </button>
      )}

      {open && (
        // Centred on its own trigger (a physical translate, so it reads the same in both directions),
        // then nudged by the clamp above.
        <div
          id={id}
          ref={panel}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          style={{ transform: `translateX(calc(-50% + ${place.dx}px))`, maxHeight: place.maxH }}
          className={
            (side === "bottom" ? "top-[calc(100%+8px)] " : "bottom-[calc(100%+8px)] ") +
            "absolute left-1/2 z-40 flex max-w-[calc(100vw-24px)] flex-col rounded-md border border-border bg-surface text-start shadow-lifted focus-visible:outline-none " +
            panelClassName
          }
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-border-soft py-2 ps-4 pe-2">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />}
            <h2 id={titleId} className="min-w-0 flex-1 text-sm font-bold leading-snug text-ink">
              {label}
            </h2>
            <CloseButton label="סגירה · Esc" onClick={close} />
          </div>
          {/* Scrolls only when the clamp had to cap the height: a scrolling box clips everything
              absolutely placed inside it, and a Select's list drops out of its trigger that way. */}
          <div className={"min-h-0 p-4 " + (place.maxH ? "scroll-slim overflow-y-auto" : "")}>
            {typeof children === "function" ? children(close) : children}
          </div>
        </div>
      )}
    </div>
  );
}

/** The box a panel must stay inside: the window, cut down by every ancestor that clips — and by the
 *  nearest `<dialog>`, which clips nothing (it sits in the top layer, and an absolutely placed panel
 *  simply hangs out past its frame) but IS the whole screen as far as the person using it is
 *  concerned: the appearance editor's bars opened their panels half outside the modal. */
function clipBounds(from: HTMLElement): { left: number; right: number; top: number; bottom: number } {
  const b = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const cut = (r: DOMRect) => {
    b.left = Math.max(b.left, r.left);
    b.top = Math.max(b.top, r.top);
    b.right = Math.min(b.right, r.right);
    b.bottom = Math.min(b.bottom, r.bottom);
  };
  for (let el = from.parentElement; el && el !== document.body; el = el.parentElement) {
    if (el.tagName === "DIALOG") {
      cut(el.getBoundingClientRect());
      break;
    }
    const s = getComputedStyle(el);
    if (s.overflowX === "visible" && s.overflowY === "visible") continue;
    cut(el.getBoundingClientRect());
  }
  return b;
}
