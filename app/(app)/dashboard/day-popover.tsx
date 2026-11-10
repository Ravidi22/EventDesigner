"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CalendarDays, Plus } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import type { Appointment } from "@/lib/appointments/types";
import { byStartTime } from "@/lib/appointments/types";
import type { BusyBlock } from "@/lib/google/types";
import { CloseButton } from "@/components/close-button";
import { Menu, type MenuItem } from "@/components/menu";
import { AppointmentChip, BusyChip, EventCard, type EventLook } from "./calendar-cards";

// "+N נוספים" — EVERYTHING ON ONE DAY, in a panel over the month (the "Modals & popups" board, 4e).
//
// It replaces an expansion IN PLACE, which stretched all seven cells of the row and pushed the month
// down: the grid moved under the cursor. The row keeps its height now and the day opens beside it.
// In place was chosen once because a floating panel hung off the grid's last column was clipped by
// the very wrapper that keeps the columns legible (calendar-card.tsx's horizontal scroller) — so
// this one is PORTALLED into the body and fixed to the screen, where nothing clips it, and placed by
// hand: under the pill's start edge (its right edge, in Hebrew), flipped above it when the room
// below is short, then held 12px inside the window either way — so the last column and the last row
// open on screen too. Re-placed on every scroll (capture: the scroller is not the window) and
// resize.
//
// The panel is Popover's (components/popover.tsx): a white card, a header with the subject's icon,
// the day as its title and the shared ✕, a hairline, then the body — here the day's cards at their
// WEEK size (the note, the progress figure), events first, then the diary in hour order, then the
// Google blocks; and a footer: add on this day (the quick-add menu, never on a day that has gone)
// and, at the far end, the week this day is in.
//
// Escape closes it and ONLY it — captured, default prevented and stopped, like Popover's — unless
// the quick-add menu inside it is open (that Escape is the menu's) or a modal opened on top has the
// keys (that one is the dialog's). A press outside the panel and its pill closes it; so does any
// card, which goes on to open what it opens.

const WEEKDAY_LETTER = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const MARGIN = 12;
const GAP = 6;

/** "15 בנובמבר", and the title "יום א׳, 15 בנובמבר". */
function dayWords(iso: string): { day: string; title: string } {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.toLocaleDateString("he-IL", { day: "numeric", month: "long" });
  return { day, title: `יום ${WEEKDAY_LETTER[date.getDay()]}, ${day}` };
}

interface Place {
  top: number;
  left: number;
  maxH?: number;
  /** Which way the quick-add list opens from the footer: over the panel when there is more room
   *  above the footer than under the panel, else down past it. */
  menuSide: "top" | "bottom";
}

export function DayPopover({
  iso,
  anchor,
  events,
  appointments,
  busy,
  lookOf,
  addItems,
  past,
  onOpenEvent,
  onOpenAppointment,
  onWeek,
  onClose,
}: {
  iso: string;
  /** The "+N נוספים" pill it hangs from — measured, never re-parented. */
  anchor: HTMLElement;
  /** The day's events, appointments and Google blocks — ALL of them, not the cell's visible few. */
  events: EventSummary[];
  appointments: Appointment[];
  busy: BusyBlock[];
  lookOf: (e: EventSummary) => EventLook;
  /** The day's "+" rows (the grid's own). Absent = no quick-add in the footer. */
  addItems?: (iso: string) => MenuItem[];
  /** The day has been and gone: no quick-add, as no "+" in its cell. */
  past: boolean;
  onOpenEvent: (e: EventSummary) => void;
  onOpenAppointment: (a: Appointment) => void;
  /** Week mode, anchored on this day. */
  onWeek: () => void;
  onClose: () => void;
}) {
  const [place, setPlace] = useState<Place | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const menuOpen = useRef(false);
  const titleId = useId();
  const { day: dayLabel, title } = dayWords(iso);

  // Focus goes back to the pill on every close that is the panel's own doing (✕, Escape, a card, a
  // menu row) — a drawer or dialog opened from a card then hands it back there when it closes. Not
  // on a press outside: that press is putting the focus somewhere itself.
  const close = useCallback(
    (refocus: boolean) => {
      if (refocus && anchor.isConnected) anchor.focus({ preventScroll: true });
      onClose();
    },
    [anchor, onClose],
  );

  const measure = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    // The pill went (the day's last extra entry was deleted, the month moved): nothing to hang from.
    if (!anchor.isConnected) {
      onClose();
      return;
    }
    const a = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const w = el.offsetWidth;
    // Header + the body's whole content (scrollHeight, so a body already capped still reports what
    // it would need) + the footer + the two border lines.
    const natural =
      (headRef.current?.offsetHeight ?? 0) +
      (bodyRef.current?.scrollHeight ?? 0) +
      (footRef.current?.offsetHeight ?? 0) +
      2;
    const roomAll = vh - 2 * MARGIN;
    const h = Math.min(natural, roomAll);
    const below = vh - MARGIN - (a.bottom + GAP);
    const above = a.top - GAP - MARGIN;
    // Under the pill unless it does not fit there AND above has more room; then clamped inside.
    let top = h <= below || below >= above ? a.bottom + GAP : a.top - GAP - h;
    top = Math.max(MARGIN, Math.min(top, vh - MARGIN - h));
    // The panel's inline-START edge on the pill's: right edges in Hebrew, left edges otherwise.
    const rtl = getComputedStyle(anchor).direction === "rtl";
    let left = rtl ? a.right - w : a.left;
    left = Math.max(MARGIN, Math.min(left, vw - MARGIN - w));
    const maxH = natural > roomAll ? Math.floor(roomAll) : undefined;
    const footTop = top + h - (footRef.current?.offsetHeight ?? 0);
    const menuSide: Place["menuSide"] = footTop - MARGIN >= vh - MARGIN - (top + h) ? "top" : "bottom";
    setPlace((p) =>
      p && p.top === top && p.left === left && p.maxH === maxH && p.menuSide === menuSide
        ? p
        : { top, left, maxH, menuSide },
    );
  }, [anchor, onClose]);

  // Before paint, and after every render (the day's lists can change under it while it is open);
  // the equality check above makes a render that moved nothing cost one measurement.
  useLayoutEffect(() => {
    measure();
  });

  useEffect(() => {
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // The panel takes focus when it opens, so Escape and Tab have somewhere to start.
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchor.contains(t)) return;
      close(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target instanceof Element ? e.target : null;
      // A modal opened on top owns its Escape.
      if (t?.closest("dialog")) return;
      // The quick-add list closes first, from its own trigger (components/menu.tsx stops it there).
      if (menuOpen.current && t && panelRef.current?.contains(t) && t.closest('[aria-haspopup="menu"]')) return;
      e.preventDefault();
      e.stopPropagation();
      close(true);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key, true);
    };
  }, [anchor, close]);

  const onMenuOpen = useCallback((open: boolean) => {
    menuOpen.current = open;
  }, []);

  const diary = [...appointments].sort(byStartTime);
  // A row chosen closes the day first: what it opens (the meeting dialog, the event form) takes the
  // screen, and hands the focus back to the pill when it closes.
  const quickAdd =
    addItems && !past
      ? addItems(iso).map((item) => ({
          ...item,
          onSelect: () => {
            close(true);
            item.onSelect();
          },
        }))
      : null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={{
        position: "fixed",
        top: place?.top ?? 0,
        left: place?.left ?? 0,
        maxHeight: place?.maxH,
        visibility: place ? undefined : "hidden",
      }}
      className="z-40 flex w-[336px] max-w-[calc(100vw-24px)] flex-col rounded-md border border-border bg-surface text-start shadow-lifted focus-visible:outline-none"
    >
      <div ref={headRef} className="flex shrink-0 items-center gap-2 border-b border-border-soft py-2 ps-4 pe-2">
        <CalendarDays className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
        <h2 id={titleId} className="min-w-0 flex-1 text-sm font-bold leading-snug text-ink">
          {title}
        </h2>
        <CloseButton label="סגירה · Esc" onClick={() => close(true)} />
      </div>

      {/* Scrolls only when the window is shorter than the day. */}
      <div ref={bodyRef} className={"flex min-h-0 flex-col gap-2 px-4 py-3.5 " + (place?.maxH ? "scroll-slim overflow-y-auto" : "")}>
        {events.map((e) => (
          <EventCard
            key={e.id}
            event={e}
            look={lookOf(e)}
            compact={false}
            onClick={() => {
              close(true);
              onOpenEvent(e);
            }}
          />
        ))}
        {diary.map((a) => (
          <AppointmentChip
            key={a.id}
            appointment={a}
            compact={false}
            onClick={() => {
              close(true);
              onOpenAppointment(a);
            }}
          />
        ))}
        {busy.map((b) => (
          <BusyChip key={b.id} block={b} compact={false} />
        ))}
      </div>

      <div ref={footRef} className="flex shrink-0 items-center gap-2 border-t border-border-soft px-4 py-2.5">
        {quickAdd && (
          <Menu
            label={`הוספה ב־${dayLabel}`}
            trigger="link"
            triggerText="הוספה ביום הזה"
            icon={Plus}
            items={quickAdd}
            align="start"
            side={place?.menuSide ?? "top"}
            panelClassName="w-[232px]"
            onOpenChange={onMenuOpen}
          />
        )}
        <button
          type="button"
          onClick={() => {
            close(false);
            onWeek();
          }}
          className="ms-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm text-[13px] font-semibold text-accent transition-colors hover:text-accent-hover"
        >
          פתיחה בתצוגת שבוע
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
        </button>
      </div>
    </div>,
    document.body,
  );
}
