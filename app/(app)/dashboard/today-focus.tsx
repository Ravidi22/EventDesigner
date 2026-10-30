"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarCheck, CheckCircle2, Lock, Plus, Users } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import { formatEventDate, zonesLabelOf } from "@/lib/events/types";
import type { Appointment } from "@/lib/appointments/types";
import {
  APPOINTMENT_KIND_LABEL,
  appointmentLabel,
  appointmentTimeLabel,
  byStartTime,
  hasPassed,
} from "@/lib/appointments/types";
import type { BusyBlock } from "@/lib/google/types";
import { EmptyState } from "@/components/empty-state";
import { KIND_ICON, kindTheme, toISODate } from "./dashboard-view-utils";

// TODAY, AS TWO TILES (2026-10-30, the user: "remove the event stats tile; instead separate
// meetings/events into 2 tiles — for the designer too"). The card used to be one "פוקוס היום" with
// an אירועים | פגישות switch beside a statistics card nobody read; the day's two lists now stand side
// by side, both visible without a click — the dashboard (designer's and hall's) renders this
// component as the top row's two cells.
//
// ONE BRAND MOMENT, NOT TWO. DESIGN.md allows one saturated surface a screen, so the EVENTS tile keeps
// the violet gradient (the day's work) and the MEETINGS tile is a white card — which is also where
// the diary's kind inks (KIND_CARD_THEME) were tuned to be read: on the gradient they went muddy and
// the rows had to give up their colour for white type.
//
// ⚠ THE MEETINGS LIST USED TO BE UNREACHABLE. It read `event.meetingDate`, a column no form ever
// wrote. It reads real records (lib/appointments/) and offers the way to make one.
export function TodayFocus({
  events,
  appointments,
  busy,
  onOpenEvent,
  onOpenAppointment,
  onCreateAppointment,
}: {
  events: EventSummary[];
  appointments: Appointment[];
  /** TODAY's entries from the person's own Google calendar. Read-only, listed under the diary's own. */
  busy: BusyBlock[];
  onOpenEvent: (e: EventSummary) => void;
  onOpenAppointment: (a: Appointment) => void;
  onCreateAppointment: () => void;
}) {
  const today = new Date();
  return (
    <>
      <TodayEvents events={events} today={today} onOpenEvent={onOpenEvent} />
      <TodayMeetings
        appointments={appointments}
        busy={busy}
        today={today}
        onOpenAppointment={onOpenAppointment}
        onCreateAppointment={onCreateAppointment}
      />
    </>
  );
}

const dateLine = (d: Date) => d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });

function TodayEvents({ events, today, onOpenEvent }: { events: EventSummary[]; today: Date; onOpenEvent: (e: EventSummary) => void }) {
  const todayIso = toISODate(today);
  const todayEvents = events.filter((e) => e.date === todayIso);
  // An empty day is the common case for a designer with three events a month, so the tile answers
  // "then when?" rather than only reporting that today is empty.
  const nextEvent = events
    .filter((e) => !!e.date && e.date > todayIso)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];

  return (
    // The one brand-toned card on this page — a quiet echo of the accent, not the full mesh. A
    // two-stop gradient dark enough throughout that white text clears AA. No `h-fit`: it stretches
    // to the grid row so it stays level with the meetings tile beside it.
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
          body={nextEvent ? `האירוע הקרוב: ${nextEvent.clientName}, ${formatEventDate(nextEvent.date)}.` : "אין אירועים נוספים מתוכננים במתחם הזה."}
          action={
            // Not the shared Button: every variant is tuned for the light plane. The card's own pill.
            nextEvent && (
              <button
                type="button"
                onClick={() => onOpenEvent(nextEvent)}
                className="inline-flex items-center gap-1.5 rounded-pill bg-canvas px-4 py-2 text-[13px] font-bold text-accent-hover shadow-floating transition-colors hover:text-accent"
              >
                פתיחת האירוע הקרוב
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            )
          }
        />
      ) : (
        // Capped and scrolling, so a Saturday in season with six events does not push the calendar
        // below the fold. `scroll-on-dark`: the scrollbar's ground is the violet (globals.css).
        <div className="scroll-slim scroll-on-dark flex max-h-72 flex-col gap-3 overflow-y-auto pe-0.5">
          {todayEvents.map((e) => {
            // On the day itself: when it starts, which zones, how many — not the stage it is parked on.
            const meta = [zonesLabelOf(e), e.guests > 0 ? `${e.guests} אורחים` : ""].filter(Boolean).join(" · ");
            return (
              // ⚠ GLASS, NOT `bg-canvas`: a white card on the violet gradient reads as a hole punched
              // in it. `.glass-deep` keeps the row a surface while white type clears 8:1. Its border
              // and background are unlayered CSS, so the hover is a lift, not a colour.
              <button
                key={e.id}
                type="button"
                onClick={() => onOpenEvent(e)}
                className="glass-deep flex shrink-0 flex-col gap-1 rounded-md p-3 text-start transition-transform hover:-translate-y-px"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-canvas">{e.clientName}</span>
                  {e.time && (
                    <span className="nums shrink-0 rounded-pill bg-canvas/20 px-2 py-0.5 text-[11px] font-bold text-canvas" dir="ltr">
                      {e.time}
                    </span>
                  )}
                </div>
                <span className="truncate text-xs text-canvas/80">{meta}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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

  const todayAppointments = appointments.filter((a) => a.date === todayIso).sort(byStartTime);
  const isBehind = (a: Appointment) => !!a.done || (nowMinutes !== null && hasPassed(a, nowMinutes));
  // The first entry still ahead — where the list should be standing. -1 once the day is behind us.
  const firstAhead = todayAppointments.findIndex((a) => !isBehind(a));
  const nextAppointment = appointments
    .filter((a) => a.date > todayIso)
    .sort((a, b) => (a.date === b.date ? byStartTime(a, b) : a.date < b.date ? -1 : 1))[0];
  // A day with nothing of the diary's own but a Google entry is NOT an empty day.
  const isEmpty = todayAppointments.length + busy.length === 0;

  // Nothing is hidden — a meeting that ran over is still the thing you want at 15:05 — the list just
  // parks the next entry at the top. Keyed on `firstAhead`, not the minute, so it moves only when an
  // entry crosses over.
  const listRef = useRef<HTMLDivElement>(null);
  const aheadRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const ahead = aheadRef.current;
    list.scrollTop = ahead ? ahead.offsetTop - list.offsetTop : list.scrollHeight;
  }, [firstAhead]);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <div>
        <h3 className="font-display text-h2 text-ink">פגישות היום</h3>
        <p className="mt-0.5 text-xs text-muted">{dateLine(today)}</p>
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
        // The booking button sits OUTSIDE the scrolling region: it is the point of this tile.
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div ref={listRef} className="scroll-slim flex max-h-72 flex-col gap-3 overflow-y-auto pe-0.5">
            {todayAppointments.map((a, i) => {
              const behind = isBehind(a);
              const name = appointmentLabel(a);
              const kind = APPOINTMENT_KIND_LABEL[a.kind];
              // A חופשה has no client, so the label already IS the kind.
              const meta = [name === kind ? "" : kind, a.note].filter(Boolean).join(" · ");
              // The calendar's own diary card: the kind's tint, its 3px rail and its glyph.
              const theme = kindTheme(a.kind, a.done);
              const KindIcon = a.done ? CheckCircle2 : KIND_ICON[a.kind];
              return (
                <button
                  key={a.id}
                  ref={i === firstAhead ? aheadRef : undefined}
                  type="button"
                  onClick={() => onOpenAppointment(a)}
                  className={
                    "flex shrink-0 flex-col gap-1 rounded-md border-s-[3px] p-3 text-start transition-transform hover:-translate-y-px hover:shadow-floating " +
                    theme.bg + " " + theme.rail
                  }
                >
                  <div className="flex items-center gap-2">
                    <KindIcon className={"h-3.5 w-3.5 shrink-0 " + theme.text} strokeWidth={1.75} />
                    <span className={"min-w-0 flex-1 truncate text-sm font-semibold " + (behind ? "text-muted line-through" : "text-ink")}>{name}</span>
                    {a.time && (
                      <span className={"nums shrink-0 text-xs font-semibold " + (behind ? "text-muted" : theme.text)} dir="ltr">
                        {appointmentTimeLabel(a)}
                      </span>
                    )}
                  </div>
                  {meta && <span className={"truncate text-xs " + (behind ? "text-muted" : "text-ink-soft")}>{meta}</span>}
                </button>
              );
            })}

            {/* The person's own Google entries for today, visibly not the diary's: dashed, grey, a
                lock — and not a button, there is nothing in this app to open. */}
            {busy.map((b) => (
              <div
                key={b.id}
                title={[b.title, b.calendarName, "יומן Google"].filter(Boolean).join(" · ")}
                className="flex shrink-0 items-center gap-2 rounded-md border border-dashed border-border bg-inset/60 p-3"
              >
                <Lock className="h-3.5 w-3.5 shrink-0 text-faint" strokeWidth={1.75} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted">{b.title}</span>
                {b.time && (
                  <span className="nums shrink-0 text-xs font-medium text-faint" dir="ltr">
                    {b.endTime ? `‎${b.time}–${b.endTime}` : `‎${b.time}`}
                  </span>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onCreateAppointment}
            className="mt-auto flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-[13px] font-medium text-muted transition-colors hover:border-accent-line hover:text-accent-hover"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            קביעת פגישה
          </button>
        </div>
      )}
    </div>
  );
}
