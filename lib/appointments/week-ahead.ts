// THE WEEK AHEAD (2026-11-10, the "Dashboard structure design" board, 1b): the dashboard's third top
// tile, a ROLLING seven days from tomorrow — today has its own two tiles beside it, and a Sunday-to-
// Saturday box would show a Thursday morning three days that are already behind it. Pure: the tile
// hands in the lists it already holds, this hands back the strip's seven days and the agenda.
//
// Dates are ISO yyyy-mm-dd throughout and the arithmetic is in UTC: a calendar day is not an instant,
// and the machine's timezone must not move one across midnight.
import type { EventSummary } from "@/lib/events/types";
import { calendarDay } from "@/lib/calendar/hebrew";
import { isMain } from "@/lib/self-check";
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

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const event = (id: string, date: string, time?: string, extra: Partial<EventSummary> = {}): EventSummary => ({
    id,
    clientName: id,
    phone: "",
    date,
    time,
    zoneIds: [],
    zonesLabel: "",
    guests: 0,
    step: 0,
    createdAt: 0,
    ...extra,
  });
  const entry = (id: string, date: string, kind: AppointmentKind, time?: string): Appointment => ({
    id,
    clientName: "",
    phone: "",
    date,
    time,
    durationMin: 60,
    kind,
    note: "",
    createdAt: 0,
  });
  const ids = (rows: AgendaRow[]) => rows.map((r) => (r.kind === "event" ? r.event.id : r.appointment.id)).join(",");

  // The board's week (Tuesday 10 November 2026 is today, so the week runs Wednesday 11 to Tuesday 17).
  const events = [
    event("today", "2026-11-10", "19:30"),
    event("michal", "2026-11-12", "20:00"),
    event("lost", "2026-11-13", "20:00", { lostAt: 1 }),
    event("archived", "2026-11-14", "19:00", { archived: true }),
    event("yoav", "2026-11-15", "18:00"),
    event("next-week", "2026-11-19", "19:00"),
    event("undated", ""),
  ];
  const appointments = [
    entry("past", "2026-11-10", "consultation", "10:00"),
    entry("supply", "2026-11-11", "supply", "09:00"),
    entry("tasting", "2026-11-12", "tasting", "12:00"),
    entry("family-day", "2026-11-13", "constraint"),
    // Out of order on purpose: the server sends the diary newest-first, not by the clock.
    entry("walk", "2026-11-15", "walkthrough", "19:00"),
    entry("intro", "2026-11-15", "consultation", "11:00"),
    entry("follow", "2026-11-15", "followup", "16:00"),
    entry("away-1", "2026-11-16", "vacation"),
    entry("away-2", "2026-11-17", "vacation"),
    entry("too-far", "2026-11-18", "personal", "10:00"),
  ];
  const week = weekAhead({ from: "2026-11-11", events, appointments });

  assert(week.days.length === 7, "seven days");
  assert(week.days[0].iso === "2026-11-11" && week.days[6].iso === "2026-11-17", "from tomorrow, rolling — not snapped to Sunday");
  assert(week.days[0].weekday === "ד׳" && week.days[0].num === 11, "the 11th is a Wednesday");
  assert(week.days[4].weekday === "א׳", "the 15th is a Sunday");
  assert(
    week.days.filter((d) => d.hasEvent).map((d) => d.num).join(",") === "12,15",
    "events on the 12th and the 15th only — today's, next week's, a lost and an archived one are not this week's work",
  );
  assert(week.days[0].kinds.join(",") === "supply", "the 11th's dot is the delivery");
  assert(week.days[4].kinds.join(",") === "consultation,followup,walkthrough", "the 15th's dots, in time order");
  assert(week.days[3].kinds.length === 0 && !week.days[3].hasEvent, "the 14th holds nothing");

  assert(week.agenda.map((d) => d.iso.slice(8)).join(",") === "11,12,13,15,16,17", "the empty 14th is not in the agenda");
  assert(week.agenda[0].label === "מחר · יום ד׳ 11", "the first day is tomorrow");
  assert(week.agenda[1].label === "יום ה׳ · 12", "the rest by weekday and number");
  assert(week.agenda[0].note === "ראש חודש כסלו", "the 11th carries its holiday");
  assert(week.agenda[1].note === undefined, "an ordinary day carries none");
  assert(ids(week.agenda[1].rows) === "tasting,michal", "the 12th: the 12:00 tasting, then the 20:00 evening");
  assert(ids(week.agenda[2].rows) === "family-day", "the 13th's untimed constraint is there; the lost event is not");
  assert(ids(week.agenda[3].rows) === "intro,follow,yoav,walk", "the 15th in time order: the 18:00 event between 16:00 and 19:00");
  assert(ids(week.agenda[4].rows) === "away-1" && ids(week.agenda[5].rows) === "away-2", "the vacation on both its days");
  assert(!week.agenda.some((d) => d.rows.some((r) => r.kind === "appointment" && r.appointment.id === "too-far")), "the 18th is past the week");

  // A busy day: an hourless entry after every timed one, an hourless event before an hourless entry,
  // and the strip holds three dots, the earliest ones.
  const busy = weekAhead({
    from: "2026-11-28",
    events: [event("evening", "2026-12-01"), event("dinner", "2026-12-01", "19:00")],
    appointments: [
      entry("someday", "2026-12-01", "other"),
      entry("late", "2026-12-01", "followup", "18:00"),
      entry("early", "2026-12-01", "supply", "08:00"),
      entry("noon", "2026-12-01", "walkthrough", "12:00"),
      entry("evening-walk", "2026-12-01", "consultation", "17:00"),
    ],
  });
  const dec1 = busy.days[3];
  assert(dec1.iso === "2026-12-01" && dec1.num === 1, "the week crosses into December");
  assert(dec1.kinds.join(",") === "supply,walkthrough,consultation", "three dots, the day's first three by the clock");
  assert(ids(busy.agenda[0].rows) === "early,noon,evening-walk,late,dinner,evening,someday", "timed by the clock, then the hourless event, then the hourless entry");
  assert(busy.agenda[0].label === "יום ג׳ · 1", "not tomorrow, so no מחר");

  const empty = weekAhead({ from: "2026-11-11", events: [], appointments: [] });
  assert(empty.days.length === 7 && empty.agenda.length === 0, "a free week has seven days and no agenda");

  assert(hourOf(entry("t", "2026-11-11", "followup", "16:00")) === "16:00", "a timed entry says its start");
  assert(hourOf(entry("c", "2026-11-11", "constraint")) === "כל היום", "an hourless אילוץ holds the day");
  assert(hourOf(entry("v", "2026-11-11", "vacation")) === "כל היום", "so does an hourless חופשה");
  assert(hourOf(entry("m", "2026-11-11", "consultation")) === "", "an hourless meeting's hour is not known — it does not hold the day");

  console.log("week-ahead: ok");
}
