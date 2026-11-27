// THE WEEK AHEAD (2026-11-10, the "Dashboard structure design" board, 1b): the dashboard's third top
// tile, a ROLLING seven days from tomorrow — today has its own two tiles beside it, and a Sunday-to-
// Saturday box would show a Thursday morning three days that are already behind it. Pure: the tile
// hands in the lists it already holds, this hands back the strip's seven days and the agenda.
//
// Dates are ISO yyyy-mm-dd throughout and the arithmetic is in UTC: a calendar day is not an instant,
// and the machine's timezone must not move one across midnight.
import type { EventSummary } from "@/lib/events/types";
import { calendarDay } from "@/lib/calendar/hebrew";
import type { Appointment, AppointmentKind } from "./types";
import { byStartTime, minutesOfDay } from "./types";

export const WEEKDAY_LETTERS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"] as const;

/** How many days, and how many kind dots a day in the strip can carry before it reads as noise. */
const DAYS = 7;
const MAX_DOTS = 3;

export interface WeekDay {
  iso: string;
  /** "א׳".."ש׳". */
  weekday: string;
  /** The day of the month. */
  num: number;
  /** A live event that day (archived and lost ones are not the week's work). */
  hasEvent: boolean;
  /** The day's diary kinds, in time order, at most three — the strip's dots. */
  kinds: AppointmentKind[];
}

export type AgendaRow = { kind: "event"; event: EventSummary } | { kind: "appointment"; appointment: Appointment };

export interface AgendaDay {
  iso: string;
  /** "מחר · יום ד׳ 11" for the first day (it is tomorrow), "יום ה׳ · 12" for the rest. */
  label: string;
  /** The day's first holiday (lib/calendar/hebrew.ts), when it has one. */
  note?: string;
  rows: AgendaRow[];
}

export interface WeekAhead {
  days: WeekDay[];
  /** Only the days with something on them. */
  agenda: AgendaDay[];
}

const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];

function dayAt(from: string, offset: number): Date {
  const [y, m, d] = parts(from);
  return new Date(Date.UTC(y, m - 1, d + offset));
}

const isoOf = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

/** An event the week should show: dated, and neither filed away nor lost. */
const live = (e: EventSummary) => !!e.date && !e.archived && !e.lostAt;

/** A row's place in its day: the clock, an hourless row after every timed one, and at a tie the
 *  event first — the evening is the day's headline, the diary works around it. */
function rowOrder(x: AgendaRow, y: AgendaRow): number {
  const tx = minutesOfDay(x.kind === "event" ? x.event.time : x.appointment.time);
  const ty = minutesOfDay(y.kind === "event" ? y.event.time : y.appointment.time);
  if (tx !== ty) {
    if (tx === null) return 1;
    if (ty === null) return -1;
    return tx - ty;
  }
  // Same kind at the same minute: the stable sort keeps the order they arrived in.
  return x.kind === y.kind ? 0 : x.kind === "event" ? -1 : 1;
}

/** The kinds that hold a WHOLE day when they carry no hour — the meeting dialog's strip reads them the
 *  same way (./day-strip.ts). */
const DAY_HOLDERS: readonly AppointmentKind[] = ["constraint", "vacation"];

/** What a diary row prints where its hour goes: the start; "כל היום" for an hourless אילוץ / חופשה;
 *  nothing for an hourless meeting — its hour is not known yet, and "all day" would be a claim. */
export function hourOf(a: Pick<Appointment, "time" | "kind">): string {
  if (a.time) return a.time;
  return DAY_HOLDERS.includes(a.kind) ? "כל היום" : "";
}

/** Seven days from `from` (tomorrow), and what is on each. */
export function weekAhead(input: { from: string; events: EventSummary[]; appointments: Appointment[] }): WeekAhead {
  const dates = Array.from({ length: DAYS }, (_, i) => dayAt(input.from, i));
  const inWeek = new Set(dates.map(isoOf));
  // One pass over each list, not seven: a studio's diary runs to hundreds of rows.
  const eventsOn = new Map<string, EventSummary[]>();
  for (const e of input.events) {
    if (!live(e) || !inWeek.has(e.date)) continue;
    eventsOn.set(e.date, [...(eventsOn.get(e.date) ?? []), e]);
  }
  const entriesOn = new Map<string, Appointment[]>();
  for (const a of input.appointments) {
    if (!inWeek.has(a.date)) continue;
    entriesOn.set(a.date, [...(entriesOn.get(a.date) ?? []), a]);
  }

  const days: WeekDay[] = [];
  const agenda: AgendaDay[] = [];
  dates.forEach((date, i) => {
    const iso = isoOf(date);
    const weekday = WEEKDAY_LETTERS[date.getUTCDay()];
    const num = date.getUTCDate();
    const dayEvents = eventsOn.get(iso) ?? [];
    const entries = [...(entriesOn.get(iso) ?? [])].sort(byStartTime);
    days.push({ iso, weekday, num, hasEvent: dayEvents.length > 0, kinds: entries.slice(0, MAX_DOTS).map((a) => a.kind) });

    if (dayEvents.length + entries.length === 0) return;
    const rows: AgendaRow[] = [
      ...dayEvents.map((event): AgendaRow => ({ kind: "event", event })),
      ...entries.map((appointment): AgendaRow => ({ kind: "appointment", appointment })),
    ].sort(rowOrder);
    agenda.push({
      iso,
      label: i === 0 ? `מחר · יום ${weekday} ${num}` : `יום ${weekday} · ${num}`,
      note: calendarDay(iso).holidays[0]?.name,
      rows,
    });
  });
  return { days, agenda };
}
