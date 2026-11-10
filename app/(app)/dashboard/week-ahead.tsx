"use client";

import { useMemo } from "react";
import { CircleCheck, Sparkles } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import type { Appointment, AppointmentKind } from "@/lib/appointments/types";
import { APPOINTMENT_KIND_LABEL } from "@/lib/appointments/types";
import { hourOf, weekAhead, type AgendaRow, type WeekDay } from "@/lib/appointments/week-ahead";
import type { EventLook } from "./calendar-cards";
import { KIND_ICON, STATUS_CARD_THEME, addDays, kindTheme, toISODate } from "./dashboard-view-utils";

// השבוע הקרוב — the top row's third tile (2026-11-10, the "Dashboard structure design" board, 1b): a
// rolling seven days from TOMORROW (today has the two tiles beside it), as a strip of days over an
// agenda of what is on them. The strip is the week at a glance — ✦ where there is an event, a dot per
// diary entry in its kind's hue — and a day in it jumps the calendar below to that week. The agenda
// is the same days in words, each row opening what it names: an event its drawer, a diary entry the
// meeting dialog. Google's blocks stay on the calendar: this tile is the studio's own week.
//
// The days and their rows are lib/appointments/week-ahead.ts — pure and self-checked.

/** A diary kind's DOT: the saturated rail hue KIND_CARD_THEME draws as a card's 3px edge, as a fill.
 *  Mirrored here rather than derived — the theme holds `border-s-*` classes, and Tailwind only
 *  generates a class it can read whole in the source. Keep the two tables in step. */
const KIND_DOT: Record<AppointmentKind, string> = {
  consultation: "bg-accent",
  followup: "bg-accent-deep",
  walkthrough: "bg-success",
  constraint: "bg-alert",
  vacation: "bg-warn",
  supply: "bg-magenta",
  personal: "bg-blush-ink",
  other: "bg-faint",
  tasting: "bg-warn",
};

/** "11–17 בנובמבר", or "28 בנובמבר – 4 בדצמבר" across a month. The number range is isolated
 *  left-to-right (LRI…PDI), or the bidi algorithm prints 11–17 as 17–11. */
function rangeLabel(first: string, last: string): string {
  const month = (iso: string) => {
    const [y, m] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("he-IL", { month: "long", timeZone: "UTC" });
  };
  const day = (iso: string) => Number(iso.slice(8));
  if (first.slice(0, 7) === last.slice(0, 7)) return `⁦${day(first)}–${day(last)}⁩ ב${month(first)}`;
  return `${day(first)} ב${month(first)} – ${day(last)} ב${month(last)}`;
}

export function WeekAhead({
  events,
  appointments,
  lookOf,
  onOpenEvent,
  onOpenAppointment,
  onJump,
  className = "",
}: {
  events: EventSummary[];
  appointments: Appointment[];
  lookOf: (e: EventSummary) => EventLook;
  onOpenEvent: (e: EventSummary) => void;
  onOpenAppointment: (a: Appointment) => void;
  /** A day in the strip: show its week on the calendar. */
  onJump: (iso: string) => void;
  className?: string;
}) {
  const from = toISODate(addDays(new Date(), 1));
  const week = useMemo(() => weekAhead({ from, events, appointments }), [from, events, appointments]);
  const counts = week.agenda.reduce(
    (n, day) => {
      for (const r of day.rows) n[r.kind === "event" ? 0 : 1]++;
      return n;
    },
    [0, 0],
  );
  const eventCount = counts[0] === 1 ? "אירוע אחד" : `${counts[0]} אירועים`;

  return (
    <div className={"flex min-h-0 flex-col gap-3.5 rounded-lg border border-border bg-surface p-5 " + className}>
      <div>
        <h3 className="font-display text-h2 text-ink">השבוע הקרוב</h3>
        <p className="nums mt-0.5 text-xs text-muted">
          {rangeLabel(week.days[0].iso, week.days[week.days.length - 1].iso)} · {eventCount} · {counts[1]} ביומן
        </p>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {week.days.map((d) => (
          <StripDay key={d.iso} day={d} onJump={onJump} />
        ))}
      </div>

      {week.agenda.length === 0 ? (
        // A free week is an answer, not a blank: the strip above still jumps the calendar.
        <p className="flex flex-1 items-center justify-center rounded-md bg-inset px-4 py-6 text-center text-[13px] text-muted">
          שבוע פנוי — אין אירועים ורשומות ביומן
        </p>
      ) : (
        <div className="scroll-slim flex max-h-[248px] flex-col gap-3 overflow-y-auto overflow-x-hidden pe-0.5">
          {week.agenda.map((day) => (
            <div key={day.iso} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="nums shrink-0 text-xs font-bold text-ink-soft">{day.label}</span>
                {day.note && (
                  <span className="shrink-0 rounded-pill bg-accent-tint px-2 py-0.5 text-[11px] font-bold text-accent">{day.note}</span>
                )}
                <span className="h-px min-w-2 flex-1 bg-border-soft" aria-hidden />
              </div>
              {day.rows.map((r) => (
                <AgendaLine
                  key={r.kind === "event" ? r.event.id : r.appointment.id}
                  row={r}
                  lookOf={lookOf}
                  onOpenEvent={onOpenEvent}
                  onOpenAppointment={onOpenAppointment}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StripDay({ day: d, onJump }: { day: WeekDay; onJump: (iso: string) => void }) {
  const what = [d.hasEvent ? "יש אירוע" : "", d.kinds.length > 0 ? "רשומות ביומן" : ""].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={() => onJump(d.iso)}
      aria-label={`יום ${d.weekday} ${d.num}${what ? ` · ${what}` : ""} — הצגת השבוע ביומן`}
      title="הצגת השבוע ביומן"
      className={
        "flex min-w-0 flex-col items-center gap-1 rounded-md border pb-2.5 pt-2 transition-colors hover:border-accent-line " +
        (d.hasEvent ? "border-badge-line bg-accent-tint" : "border-border-soft bg-surface")
      }
    >
      <span className="text-[11px] font-semibold text-muted">{d.weekday}</span>
      <span className="nums text-[15px] font-bold text-ink">{d.num}</span>
      <span className="flex h-3 max-w-full items-center gap-[3px] overflow-hidden" aria-hidden>
        {d.hasEvent && <Sparkles className="h-[11px] w-[11px] shrink-0 text-accent" strokeWidth={2.25} />}
        {d.kinds.map((k, i) => (
          <span key={i} className={"h-1.5 w-1.5 shrink-0 rounded-full " + KIND_DOT[k]} />
        ))}
      </span>
    </button>
  );
}

function AgendaLine({
  row,
  lookOf,
  onOpenEvent,
  onOpenAppointment,
}: {
  row: AgendaRow;
  lookOf: (e: EventSummary) => EventLook;
  onOpenEvent: (e: EventSummary) => void;
  onOpenAppointment: (a: Appointment) => void;
}) {
  if (row.kind === "event") {
    const e = row.event;
    const look = lookOf(e);
    const theme = STATUS_CARD_THEME[look.tone];
    // An event's row is the week's headline: bold, on its status's tint, the status word beside it.
    return (
      <button
        type="button"
        onClick={() => onOpenEvent(e)}
        className={"flex items-center gap-2 rounded-sm px-1.5 py-[5px] text-start transition-shadow hover:shadow-floating " + theme.bg}
      >
        <Sparkles className={"h-[13px] w-[13px] shrink-0 " + theme.text} strokeWidth={2} aria-hidden />
        <span className={"min-w-0 flex-1 truncate text-[13px] font-bold " + (look.struck ? "text-muted line-through" : "text-ink")}>
          {e.clientName}
        </span>
        <span className={"shrink-0 text-[11px] font-bold " + theme.text}>{look.label}</span>
        {e.time && (
          <span className="nums shrink-0 text-xs font-semibold text-muted" dir="ltr">
            {e.time}
          </span>
        )}
      </button>
    );
  }

  const a = row.appointment;
  const kind = APPOINTMENT_KIND_LABEL[a.kind];
  const theme = kindTheme(a.kind, a.done);
  const Icon = a.done ? CircleCheck : KIND_ICON[a.kind];
  // The kind leads — "פגישת המשך · תמר ויונתן" — because in a list of a week the KIND is what tells a
  // sit-down from a delivery; a nameless entry says its note instead ("אספקה · פרחי השרון").
  const name = a.clientName.trim() ? `${kind} · ${a.clientName.trim()}` : [kind, a.note].filter(Boolean).join(" · ");
  const hour = hourOf(a);
  return (
    <button
      type="button"
      onClick={() => onOpenAppointment(a)}
      className="flex items-center gap-2 rounded-sm px-1.5 py-[5px] text-start transition-colors hover:bg-inset"
    >
      <Icon className={"h-[13px] w-[13px] shrink-0 " + theme.text} strokeWidth={2} aria-hidden />
      <span className={"min-w-0 flex-1 truncate text-[13px] font-medium " + (a.done ? "text-muted line-through" : "text-ink")}>{name}</span>
      {hour && (
        <span className="nums shrink-0 text-xs font-semibold text-muted" dir={a.time ? "ltr" : undefined}>
          {hour}
        </span>
      )}
    </button>
  );
}
