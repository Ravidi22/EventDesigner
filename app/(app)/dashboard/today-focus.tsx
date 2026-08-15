"use client";

import { useState } from "react";
import { ArrowLeft, CalendarCheck, MapPin, Plus, Users } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import { STATUS_LABEL, STATUS_TONE, eventProgress, eventStatus, formatEventDate, zonesLabelOf } from "@/lib/events/types";
import type { Appointment } from "@/lib/appointments/types";
import {
  APPOINTMENT_KIND_LABEL,
  appointmentLabel,
  appointmentTimeLabel,
  byStartTime,
} from "@/lib/appointments/types";
import { useMeetingFlow } from "@/lib/meeting/use-flow";
import { EmptyState } from "@/components/empty-state";
import { Switch } from "@/components/toggle";
import { toISODate, TONE_CLASS } from "./dashboard-view-utils";

type Tab = "events" | "meetings";

// "פוקוס היום": what's actually happening today, split into two clear segments — the event itself
// (the wedding/event day, `event.date`) and the meetings in the diary (lib/appointments/), with
// location up front on the event side.
//
// ⚠ THE פגישות TAB USED TO BE UNREACHABLE. It read `event.meetingDate`, a column no form in the app
// ever wrote, so `todayMeetings` was empty on every device on every day since it shipped and the tab
// only ever rendered its own empty state. It reads real records now, and — the actual fix — offers
// the way to create one.
export function TodayFocus({
  events,
  appointments,
  venueColor,
  onOpenEvent,
  onOpenAppointment,
  onCreateAppointment,
  onToggleDone,
}: {
  events: EventSummary[];
  appointments: Appointment[];
  venueColor: (e: EventSummary) => string;
  onOpenEvent: (e: EventSummary) => void;
  onOpenAppointment: (a: Appointment) => void;
  onCreateAppointment: () => void;
  /** Mark a meeting held, straight from the card — the one action worth not opening a dialog for. */
  onToggleDone: (a: Appointment, done: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>("events");
  const flow = useMeetingFlow();
  const today = new Date();
  const todayIso = toISODate(today);

  const todayEvents = events.filter((e) => e.date === todayIso);
  const todayAppointments = appointments.filter((a) => a.date === todayIso).sort(byStartTime);

  // The soonest thing still ahead on this tab's own timeline. An empty day is the common case for a
  // designer with three events a month, so the card answers "then when?" rather than just reporting
  // that today is empty — the same arrays, no extra read.
  const nextEvent = events
    .filter((e) => !!e.date && e.date > todayIso)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const nextAppointment = appointments
    .filter((a) => a.date > todayIso)
    .sort((a, b) => (a.date === b.date ? byStartTime(a, b) : a.date < b.date ? -1 : 1))[0];

  const isEmpty = tab === "events" ? todayEvents.length === 0 : todayAppointments.length === 0;

  return (
    // The one brand-toned card on this page — a quiet echo of the accent, not the full mesh
    // (no grain, no radial blooms: those are tuned for a large hero and just read as noise
    // at card size). A plain two-stop gradient in the accent/accent-deep range, dark enough
    // throughout that white text always clears AA (DESIGN.md: accent vs. white is 5.7:1).
    // No `h-fit`: this card stretches to the dashboard grid row so it stays level with
    // EventStats beside it (which does the same) instead of each sizing to its own content.
    <div className="flex flex-col gap-4 rounded-lg bg-[linear-gradient(150deg,#6d55bd,#4b3a8c)] p-5 shadow-lifted">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-h2 text-canvas">פוקוס היום</h3>
          <p className="mt-0.5 text-xs text-canvas/75">
            {today.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <div className="glass flex gap-1 rounded-pill p-1">
          <button
            type="button"
            onClick={() => setTab("events")}
            aria-pressed={tab === "events"}
            className={
              "rounded-pill px-3.5 py-1.5 text-sm transition-colors " +
              (tab === "events" ? "bg-canvas font-semibold text-accent-hover shadow-floating" : "text-canvas/85 hover:text-canvas")
            }
          >
            אירועים
          </button>
          <button
            type="button"
            onClick={() => setTab("meetings")}
            aria-pressed={tab === "meetings"}
            className={
              "rounded-pill px-3.5 py-1.5 text-sm transition-colors " +
              (tab === "meetings" ? "bg-canvas font-semibold text-accent-hover shadow-floating" : "text-canvas/85 hover:text-canvas")
            }
          >
            פגישות
          </button>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState
          variant="card"
          icon={tab === "events" ? CalendarCheck : Users}
          title={tab === "events" ? "אין אירועים היום" : "אין פגישות היום"}
          body={
            tab === "events"
              ? nextEvent
                ? `האירוע הקרוב: ${nextEvent.clientName}, ${formatEventDate(nextEvent.date)}.`
                : "אין אירועים נוספים מתוכננים במתחם הזה."
              : nextAppointment
                ? `הפגישה הקרובה: ${appointmentLabel(nextAppointment)}, ${formatEventDate(nextAppointment.date)}.`
                : "אפשר לקבוע פגישה גם לפני שיש אירוע — היכרות ראשונה, סיור במתחם."
          }
          action={
            // Not the shared Button: every one of its variants is tuned for the light plane, and the
            // gradient CTA on this violet card would be violet on violet. This is the card's own
            // active-tab pill, reused as an action.
            //
            // The two tabs offer different things on purpose. An event is not created from here (it
            // starts in the meeting flow, which needs a venue and zones), so the events tab can only
            // point at the next one. A meeting IS created from here — that is the whole gap this
            // work closes — so the meetings tab books one whether or not a next one exists.
            tab === "meetings" ? (
              <button
                type="button"
                onClick={onCreateAppointment}
                className="inline-flex items-center gap-1.5 rounded-pill bg-canvas px-4 py-2 text-[13px] font-bold text-accent-hover shadow-floating transition-colors hover:text-accent"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                קביעת פגישה
              </button>
            ) : (
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
            )
          }
        />
      ) : tab === "events" ? (
        // Capped and scrolling, not free-growing. This card shares a grid row with EventStats, so an
        // uncapped list doesn't just get tall — it drags the statistics card's whole row down with
        // it, and a Saturday in season with six events would push the calendar below the fold. 18rem
        // is the same max-height MultiSelect's panel already uses, and it keeps the two cards level.
        // `scroll-on-dark` because the scrollbar's ground here is the card's violet gradient, not
        // the light plane the default thumb is tuned for — see globals.css. It is the only dark
        // scroller in the app, so this is the one place that pairing is needed.
        <div className="scroll-slim scroll-on-dark flex max-h-72 flex-col gap-3 overflow-y-auto pe-0.5">
          {todayEvents.map((e) => {
            const status = eventStatus(e, flow);
            const progress = eventProgress(e, flow);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => onOpenEvent(e)}
                // shrink-0 because this is a flex column with a max-height: without it the cards
                // squash to fit instead of scrolling, and a six-event day renders as six slivers.
                className="flex shrink-0 flex-col gap-2 rounded-md bg-canvas p-3 text-start shadow-floating transition-all hover:shadow-lifted"
              >
                <div className="flex items-center gap-2">
                  <span className={"h-2.5 w-2.5 shrink-0 rounded-full " + venueColor(e)} aria-hidden />
                  <span className="flex-1 truncate text-sm font-semibold text-ink">{e.clientName}</span>
                  <span className={"shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-medium " + TONE_CLASS[STATUS_TONE[status]]}>
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <span className="flex items-center gap-1 text-xs font-medium text-ink-soft">
                  <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  {zonesLabelOf(e)}
                </span>
                <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        // Same cap as the events tab, with one difference: the booking button sits OUTSIDE the
        // scrolling region. It is the point of this tab, and a "קביעת פגישה" you have to scroll a
        // full day of meetings to reach is one nobody finds.
        <div className="flex min-h-0 flex-col gap-3">
          {/* Same dark-ground scrollbar as the events tab above. */}
          <div className="scroll-slim scroll-on-dark flex max-h-72 flex-col gap-3 overflow-y-auto pe-0.5">
            {todayAppointments.map((a) => (
              // NOT a <button> wrapping everything, unlike the event card above: this row carries a
              // switch of its own, and a control inside a button is neither valid HTML nor operable
              // with a keyboard. The name is the button; the switch is its own.
              <div key={a.id} className="flex shrink-0 items-center gap-3 rounded-md bg-canvas p-3 shadow-floating">
                <button
                  type="button"
                  onClick={() => onOpenAppointment(a)}
                  className="flex min-w-0 flex-1 flex-col gap-1 text-start"
                >
                  <div className="flex items-center gap-2">
                    <span className={"min-w-0 flex-1 truncate text-sm font-semibold " + (a.done ? "text-muted line-through" : "text-ink")}>
                      {appointmentLabel(a)}
                    </span>
                    {a.time && (
                      <span className="nums shrink-0 rounded-pill bg-accent-tint px-2 py-0.5 text-[11px] font-bold text-accent-hover" dir="ltr">
                        {appointmentTimeLabel(a)}
                      </span>
                    )}
                  </div>
                  <span className="truncate text-xs text-ink-soft">
                    {APPOINTMENT_KIND_LABEL[a.kind]}
                    {a.note && ` · ${a.note}`}
                  </span>
                </button>
                <Switch
                  checked={!!a.done}
                  onChange={(next) => onToggleDone(a, next)}
                  label={`סימון הפגישה עם ${appointmentLabel(a)} כהתקיימה`}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onCreateAppointment}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-dashed border-canvas/40 py-2 text-[13px] font-medium text-canvas/85 transition-colors hover:border-canvas/70 hover:text-canvas"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            קביעת פגישה
          </button>
        </div>
      )}
    </div>
  );
}
