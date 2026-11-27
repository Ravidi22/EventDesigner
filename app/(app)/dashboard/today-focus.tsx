"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BadgeCheck, CalendarCheck, CircleCheck, Lock, Plus, Truck, Users } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import { formatEventDate, zonesLabelOf } from "@/lib/events/types";
import type { Appointment } from "@/lib/appointments/types";
import {
  APPOINTMENT_KIND_LABEL,
  appointmentEnd,
  appointmentLabel,
  byStartTime,
  hasPassed,
  minutesOfDay,
} from "@/lib/appointments/types";
import { hourOf } from "@/lib/appointments/week-ahead";
import type { BusyBlock } from "@/lib/google/types";
import { EmptyState } from "@/components/empty-state";
import { useEventLook } from "./calendar-card";
import type { EventLook } from "./calendar-cards";
import { KIND_ICON, kindTheme, toISODate } from "./dashboard-view-utils";
import { WeekAhead } from "./week-ahead";

// TODAY + THIS WEEK, AS THREE TILES (2026-11-10, the "Dashboard structure design" board, 1b). The
// top row was today's two lists (2026-10-30, the user: "remove the event stats tile; instead separate
// meetings/events into 2 tiles — for the designer too"); the board adds the week ahead as a third, so
// the row answers "today" AND "what is coming" before the calendar below answers "this month". Every
// tile keeps a job on an empty day: events say what is next, meetings offer to book one, the week
// says it is free. The dashboard (designer's and hall's) renders this component as the row's cells.
//
// ONE BRAND MOMENT, NOT TWO. DESIGN.md allows one saturated surface a screen, so the EVENTS tile keeps
// the violet gradient (the day's work) and the other two are white cards — which is also where the
// diary's kind inks (KIND_CARD_THEME) were tuned to be read: on the gradient they went muddy and the
// rows had to give up their colour for white type.
//
// ⚠ THE MEETINGS LIST USED TO BE UNREACHABLE. It read `event.meetingDate`, a column no form ever
// wrote. It reads real records (lib/appointments/) and offers the way to make one.
export function TodayFocus({
  events,
  appointments,
  busy,
  look,
  onOpenEvent,
  onOpenAppointment,
  onCreateAppointment,
  onJump,
}: {
  events: EventSummary[];
  appointments: Appointment[];
  /** TODAY's entries from the person's own Google calendar. Read-only, interleaved with the diary's. */
  busy: BusyBlock[];
  /** How an event reads — absent = a designer's meeting status (CalendarCard's own rule). */
  look?: (e: EventSummary) => EventLook;
  onOpenEvent: (e: EventSummary) => void;
  onOpenAppointment: (a: Appointment) => void;
  onCreateAppointment: () => void;
  /** A day in the week tile's strip: show its week on the calendar. */
  onJump: (iso: string) => void;
}) {
  const today = new Date();
  const lookOf = useEventLook(look);
  // Lost and archived events are no part of today or of what is next — the calendar keeps them.
  const live = useMemo(() => events.filter((e) => !e.archived && !e.lostAt), [events]);
  return (
    <>
      <TodayEvents events={live} today={today} lookOf={lookOf} onOpenEvent={onOpenEvent} />
      <TodayMeetings
        appointments={appointments}
        busy={busy}
        today={today}
        onOpenAppointment={onOpenAppointment}
        onCreateAppointment={onCreateAppointment}
      />
      {/* Two-up at `lg` (the sidebar takes 258px of the width before this grid sees any), so the
          week spans the row under today's two; three-up once there is room for three. */}
      <WeekAhead
        events={live}
        appointments={appointments}
        lookOf={lookOf}
        onOpenEvent={onOpenEvent}
        onOpenAppointment={onOpenAppointment}
        onJump={onJump}
        className="lg:col-span-2 xl:col-span-1"
      />
    </>
  );
}

const WEEKDAY_LETTER = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const dateLine = (d: Date) => d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
const dateOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
/** "יום ה׳, 12 בנוב׳". */
const nextLine = (iso: string) => `יום ${WEEKDAY_LETTER[dateOf(iso).getDay()]}, ${formatEventDate(iso)}`;
/** "מחר" / "בעוד יומיים" / "בעוד 9 ימים" — how far off the next event is. */
function inDays(todayIso: string, iso: string): string {
  const n = Math.round((dateOf(iso).getTime() - dateOf(todayIso).getTime()) / 86_400_000);
  return n === 1 ? "מחר" : n === 2 ? "בעוד יומיים" : `בעוד ${n} ימים`;
}

function TodayEvents({
  events,
  today,
  lookOf,
  onOpenEvent,
}: {
  events: EventSummary[];
  today: Date;
  lookOf: (e: EventSummary) => EventLook;
  onOpenEvent: (e: EventSummary) => void;
}) {
  const todayIso = toISODate(today);
  const todayEvents = events.filter((e) => e.date === todayIso);
  // An empty day is the common case for a designer with three events a month, so the tile always
  // ends on "then when?" — and on a full day, on what comes after it. A lapsed option is not next.
  const nextEvent = events
    .filter((e) => !!e.date && e.date > todayIso && !lookOf(e).struck)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];

  return (
    // The one brand-toned card on this page — a quiet echo of the accent, not the full mesh. A
    // two-stop gradient dark enough throughout that white text clears AA. No `h-fit`: it stretches
    // to the grid row so it stays level with the tiles beside it.
    <div className="flex flex-col gap-4 rounded-lg bg-[linear-gradient(150deg,#6d55bd,#4b3a8c)] p-5 shadow-lifted">
      <div>
        <h3 className="font-display text-h2 text-canvas">אירועים היום</h3>
        <p className="mt-0.5 text-xs text-canvas/75">{dateLine(today)}</p>
      </div>

      {todayEvents.length === 0 ? (
        <EmptyState
          variant="card"
          icon={CalendarCheck}
          title="אין אירועים היום"
          body={nextEvent ? `האירוע הבא ${inDays(todayIso, nextEvent.date)}.` : "אין אירועים נוספים מתוכננים במתחם הזה."}
        />
      ) : (
        // Capped and scrolling, so a Saturday in season with six events does not push the calendar
        // below the fold. `scroll-on-dark`: the scrollbar's ground is the violet (globals.css).
        <div className="scroll-slim scroll-on-dark flex max-h-72 flex-col gap-3 overflow-y-auto pe-0.5">
          {todayEvents.map((e) => (
            <TodayEventCard key={e.id} event={e} look={lookOf(e)} todayIso={todayIso} onOpen={() => onOpenEvent(e)} />
          ))}
        </div>
      )}

      {nextEvent && (
        <div className="mt-auto flex items-center gap-2.5 border-t border-canvas/20 pt-3.5">
          <span className="min-w-0 flex-1 truncate text-[13px] text-canvas/80">
            הבא: <b className="font-bold text-canvas">{nextEvent.clientName}</b> · {nextLine(nextEvent.date)}
          </span>
          {/* Not the shared Button: every variant is tuned for the light plane. The card's own pill. */}
          <button
            type="button"
            onClick={() => onOpenEvent(nextEvent)}
            aria-label={`פתיחת האירוע של ${nextEvent.clientName}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-canvas px-3.5 py-1.5 text-[13px] font-bold text-accent-hover shadow-floating transition-colors hover:text-accent"
          >
            פתיחה
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

const CHIP = "inline-flex items-center gap-1.5 rounded-pill bg-canvas/16 px-2.5 py-1 text-xs font-semibold text-canvas";

function TodayEventCard({ event: e, look, todayIso, onOpen }: { event: EventSummary; look: EventLook; todayIso: string; onOpen: () => void }) {
  // On the day itself: when it starts, which zones, how many — not the stage it is parked on.
  const meta = [zonesLabelOf(e), e.guests > 0 ? `${e.guests} אורחים` : ""].filter(Boolean).join(" · ");
  // The load-in is a DAY, never an hour — there is no typed load-in hour (CLAUDE.md, the runway). An
  // event with no setup day is set up on the day.
  const setupEarlier = !!e.setupDate && e.setupDate < todayIso;
  const [, sm, sd] = (e.setupDate ?? "").split("-").map(Number);
  return (
    // ⚠ GLASS, NOT `bg-canvas`: a white card on the violet gradient reads as a hole punched in it.
    // `.glass-deep` keeps the row a surface while white type clears 8:1. Its border and background
    // are unlayered CSS, so the hover is a lift, not a colour.
    <button
      type="button"
      onClick={onOpen}
      className="glass-deep flex shrink-0 flex-col gap-1.5 rounded-md p-3.5 text-start transition-transform hover:-translate-y-px"
    >
      <div className="flex items-center gap-2">
        <span className={"min-w-0 flex-1 truncate text-base font-bold text-canvas " + (look.struck ? "line-through opacity-75" : "")}>
          {e.clientName}
        </span>
        {e.time && (
          <span className="nums shrink-0 rounded-pill bg-canvas/20 px-2 py-0.5 text-[11px] font-bold text-canvas" dir="ltr">
            {e.time}
          </span>
        )}
      </div>
      <span className="truncate text-[13px] text-canvas/85">{meta}</span>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <span className={CHIP}>
          {look.tone === "success" && <BadgeCheck className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />}
          {look.label}
        </span>
        <span className={CHIP}>
          <Truck className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
          {setupEarlier ? `הקמה מ־${sd}.${sm}` : "הקמה היום"}
        </span>
      </div>
    </button>
  );
}

/** "45 דק׳", "1 ש׳", "1½ ש׳", "1:15 ש׳" — empty for an entry with no length. */
function durationLabel(min: number): string {
  if (min <= 0) return "";
  if (min < 60) return `${min} דק׳`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  if (rest === 0) return `${h} ש׳`;
  if (rest === 30) return `${h}½ ש׳`;
  return `${h}:${String(rest).padStart(2, "0")} ש׳`;
}

/** One line of the day: a diary entry or a Google block, with the minutes it starts and ends at
 *  (null = no hour — it sorts after every timed line and never passes). */
type Line =
  | { kind: "entry"; id: string; start: number | null; end: number | null; a: Appointment }
  | { kind: "busy"; id: string; start: number | null; end: number | null; b: BusyBlock };

function TodayMeetings({
  appointments,
  busy,
  today,
  onOpenAppointment,
  onCreateAppointment,
}: {
  appointments: Appointment[];
  busy: BusyBlock[];
  today: Date;
  onOpenAppointment: (a: Appointment) => void;
  onCreateAppointment: () => void;
}) {
  const todayIso = toISODate(today);

  // The clock crosses a meeting off, not a switch nobody flips (a designer walking out of a meeting
  // is holding a bag, not a laptop). `null` until mounted — the hour is not the same fact on the
  // server — and re-read every minute. `done` is still edited in the dialog: "booked and never
  // held" is a fact only a person knows.
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const todayAppointments = appointments.filter((a) => a.date === todayIso);
  const isBehind = (a: Appointment) => !!a.done || (nowMinutes !== null && hasPassed(a, nowMinutes));

  // A TIMELINE: the diary and the person's Google entries in ONE clock order — a Google block used to
  // be appended under the diary, so a 08:30 dentist sat below a 17:00 walkthrough. Hourless lines go
  // last (byStartTime's rule); at the same minute the diary's own entry leads.
  const lines: Line[] = [
    ...todayAppointments.map((a): Line => {
      const start = minutesOfDay(a.time);
      return { kind: "entry", id: a.id, start, end: minutesOfDay(appointmentEnd(a)) ?? start, a };
    }),
    ...busy.map((b): Line => {
      const start = minutesOfDay(b.time);
      return { kind: "busy", id: b.id, start, end: minutesOfDay(b.endTime) ?? start, b };
    }),
  ].sort((x, y) => {
    if (x.start !== y.start) {
      if (x.start === null) return 1;
      if (y.start === null) return -1;
      return x.start - y.start;
    }
    return x.kind === y.kind ? 0 : x.kind === "entry" ? -1 : 1;
  });
  // The NOW line stands before the first line that ends after now (an hourless one never ends), at
  // the foot once the whole day is behind us. Drawn only once the clock is read — see nowMinutes.
  const firstAhead = nowMinutes === null ? -1 : lines.findIndex((l) => l.end === null || l.end > nowMinutes);
  const nowAt = nowMinutes === null ? -1 : firstAhead === -1 ? lines.length : firstAhead;
  const left = todayAppointments.filter((a) => !isBehind(a)).length;
  const nextAppointment = appointments
    .filter((a) => a.date > todayIso)
    .sort((a, b) => (a.date === b.date ? byStartTime(a, b) : a.date < b.date ? -1 : 1))[0];
  // A day with nothing of the diary's own but a Google entry is NOT an empty day.
  const isEmpty = lines.length === 0;
  const summary =
    todayAppointments.length === 0 ? dateLine(today) : `${dateLine(today)} · ${left === 0 ? "הכל מאחור" : `עוד ${left} היום`}`;

  // Nothing is hidden — a meeting that ran over is still the thing you want at 15:05 — the list just
  // parks the NOW line at the top. Keyed on where the line stands, not the minute, so it moves only
  // when an entry crosses over.
  const listRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const now = nowRef.current;
    if (list && now) list.scrollTop = now.offsetTop - list.offsetTop;
  }, [nowAt]);

  const clock = nowMinutes === null ? "" : `${String(Math.floor(nowMinutes / 60)).padStart(2, "0")}:${String(nowMinutes % 60).padStart(2, "0")}`;
  const nowLine = (
    <div key="now" ref={nowRef} className="flex shrink-0 items-center gap-2 py-0.5">
      <span className="nums w-11 shrink-0 text-start text-[11px] font-bold text-accent">{clock}</span>
      <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
      <span className="h-[1.5px] flex-1 bg-accent" aria-hidden />
      <span className="text-[11px] font-bold text-accent">עכשיו</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-h2 text-ink">פגישות היום</h3>
          <p className="nums mt-0.5 text-xs text-muted">{summary}</p>
        </div>
        {/* The booking is in the HEADER, so it never scrolls away with the day it books into. */}
        <button
          type="button"
          onClick={onCreateAppointment}
          aria-label="קביעת פגישה"
          title="קביעת פגישה"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-accent-tint text-accent transition-colors hover:bg-accent-wash"
        >
          <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </button>
      </div>

      {isEmpty ? (
        <EmptyState
          variant="tile"
          icon={Users}
          title="אין פגישות היום"
          body={
            nextAppointment
              ? `הפגישה הקרובה: ${appointmentLabel(nextAppointment)}, ${formatEventDate(nextAppointment.date)}.`
              : "אפשר לקבוע פגישה גם לפני שיש אירוע — היכרות ראשונה, סיור במתחם."
          }
          action={
            <button
              type="button"
              onClick={onCreateAppointment}
              className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-canvas px-4 py-2 text-[13px] font-bold text-accent transition-colors hover:border-accent-line hover:text-accent-hover"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              קביעת פגישה
            </button>
          }
        />
      ) : (
        <div ref={listRef} className="scroll-slim flex max-h-72 flex-col gap-1.5 overflow-y-auto pe-0.5">
          {lines.flatMap((l, i) => {
            const row = l.kind === "entry" ? (
              <EntryLine key={l.id} appointment={l.a} behind={isBehind(l.a)} onOpen={() => onOpenAppointment(l.a)} />
            ) : (
              <BusyLine key={l.id} block={l.b} />
            );
            return i === nowAt ? [nowLine, row] : [row];
          })}
          {nowAt === lines.length && nowLine}
        </div>
      )}
    </div>
  );
}

/** The 44px column the timeline's hours stand in, at the tile's start edge. One clock needs no
 *  isolation (a range would — appointmentTimeLabel's LRM); "כל היום" is set a step smaller to fit. */
function HourCell({ text, tone }: { text: string; tone: string }) {
  return (
    <span className={"nums w-11 shrink-0 text-start font-semibold " + (/^\d/.test(text) ? "text-xs " : "text-[11px] ") + tone}>
      {text}
    </span>
  );
}

function EntryLine({ appointment: a, behind, onOpen }: { appointment: Appointment; behind: boolean; onOpen: () => void }) {
  const name = appointmentLabel(a);
  const kind = APPOINTMENT_KIND_LABEL[a.kind];
  // A חופשה has no client, so the label already IS the kind.
  const meta = [name === kind ? "" : kind, a.note].filter(Boolean).join(" · ");
  // The calendar's own diary card: the kind's tint, its 3px rail and its glyph — retired to grey with
  // a tick once its hour is behind us or it is marked held.
  const theme = kindTheme(a.kind, behind);
  const Icon = behind ? CircleCheck : KIND_ICON[a.kind];
  const length = a.time ? durationLabel(a.durationMin) : "";
  return (
    <div className="flex shrink-0 items-center gap-2">
      <HourCell text={hourOf(a)} tone={behind ? "text-quiet" : "text-ink"} />
      <button
        type="button"
        onClick={onOpen}
        className={
          "flex min-w-0 flex-1 flex-col gap-0.5 rounded-md border-s-[3px] px-2.5 py-2 text-start transition-transform hover:-translate-y-px hover:shadow-floating " +
          theme.bg + " " + theme.rail
        }
      >
        <div className="flex items-center gap-1.5">
          <Icon className={"h-[13px] w-[13px] shrink-0 " + theme.text} strokeWidth={1.75} aria-hidden />
          <span className={"min-w-0 flex-1 truncate text-[13px] font-semibold " + (behind ? "text-muted line-through" : "text-ink")}>
            {name}
          </span>
          {length && <span className="nums shrink-0 text-[11px] text-muted">{length}</span>}
        </div>
        {meta && <span className={"truncate text-xs " + (behind ? "text-muted" : "text-ink-soft")}>{meta}</span>}
      </button>
    </div>
  );
}

// The person's own Google entries, visibly not the diary's: dashed, grey, a lock, "Google" at the end
// — and not a button, there is nothing in this app to open.
function BusyLine({ block: b }: { block: BusyBlock }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <HourCell text={b.time ?? "כל היום"} tone="text-muted" />
      <div
        title={[b.title, b.calendarName, "יומן Google"].filter(Boolean).join(" · ")}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-dashed border-border bg-inset/60 px-2.5 py-2"
      >
        <Lock className="h-[13px] w-[13px] shrink-0 text-faint" strokeWidth={1.75} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-muted">{b.title}</span>
        <span className="shrink-0 text-[11px] text-muted">Google</span>
      </div>
    </div>
  );
}
