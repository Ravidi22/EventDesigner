// npm run check:week-ahead — the self-check of ./week-ahead.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { EventSummary } from "@/lib/events/types";
import type { Appointment, AppointmentKind } from "./types";
import { hourOf, weekAhead, type AgendaRow } from "./week-ahead";

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
