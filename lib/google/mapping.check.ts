// npm run check:google — the self-check of ./mapping.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Appointment } from "@/lib/appointments/types";
import { addDays, addMonths, defaultBusyWindow, EVE_SOURCE, localParts, toBusyBlocks, toGoogleEvent, type GoogleEvent } from "./mapping";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};

const base: Appointment = {
  id: "11111111-1111-4111-8111-111111111111",
  clientName: "נועה ואיתי",
  phone: "050-1234567",
  date: "2026-08-16",
  time: "17:00",
  durationMin: 90,
  kind: "consultation",
  note: "לבדוק חופה",
  createdAt: 0,
};

// ── push ──
const timed = toGoogleEvent(base);
assert(timed.start?.dateTime === "2026-08-16T17:00:00", "the wall clock goes out as typed");
assert(timed.end?.dateTime === "2026-08-16T18:30:00", "the end is start + duration");
assert(timed.start?.timeZone === "Asia/Jerusalem", "the timezone travels beside the clock");
assert(!timed.start?.dateTime?.includes("+"), "no offset is baked in — DST would make it a lie");
assert(timed.summary === "נועה ואיתי", "a client meeting is titled by the couple");
assert(timed.description?.includes("050-1234567") === true, "the phone rides along for the car journey");
assert(timed.extendedProperties?.private?.source === EVE_SOURCE, "everything written is stamped");
assert(timed.extendedProperties?.private?.appointmentId === base.id, "and carries its appointment id");

const untimed = toGoogleEvent({ ...base, time: undefined });
assert(untimed.start?.date === "2026-08-16", "no hour means an all-day event");
assert(untimed.end?.date === "2026-08-17", "all-day end is EXCLUSIVE — the next date");
assert(untimed.start?.dateTime === undefined, "and carries no dateTime at all");

const zero = toGoogleEvent({ ...base, durationMin: 0 });
assert(zero.end?.dateTime === "2026-08-16T17:30:00", "a zero-length meeting gets a renderable floor");

const late = toGoogleEvent({ ...base, time: "23:30", durationMin: 120 });
assert(late.end?.dateTime === "2026-08-16T23:59:00", "past midnight clamps to the day, never wraps");
const latest = toGoogleEvent({ ...base, time: "23:59", durationMin: 60 });
assert(latest.start?.date === "2026-08-16", "an hour with no room after it degrades to all-day");

const holiday = toGoogleEvent({ ...base, kind: "vacation", clientName: "", phone: "050-1234567" });
assert(holiday.summary === "חופשה", "a non-client kind is titled by the kind");
assert(holiday.description?.includes("050-1234567") === false, "and never carries a client phone");

// ── pull ──
const g = (e: GoogleEvent) => toBusyBlocks(e, "cal-1", "היומן שלי");

const one = g({ id: "e1", summary: "רופא שיניים", start: { dateTime: "2026-08-16T10:00:00+03:00" }, end: { dateTime: "2026-08-16T11:00:00+03:00" } });
assert(one.length === 1 && one[0].date === "2026-08-16", "a timed event lands on its local day");
assert(one[0].time === "10:00" && one[0].endTime === "11:00", "and keeps its local clock face");
assert(one[0].title === "רופא שיניים", "titles come through — this is why not freebusy");

// The DST case, stated as an instant rather than an offset: 07:00 UTC in August is 10:00 in
// Jerusalem (+03), and in January it is 09:00 (+02). A fixed offset would get one of them wrong.
const summer = g({ id: "e2", start: { dateTime: "2026-08-16T07:00:00Z" }, end: { dateTime: "2026-08-16T08:00:00Z" } });
const winter = g({ id: "e3", start: { dateTime: "2026-01-16T07:00:00Z" }, end: { dateTime: "2026-01-16T08:00:00Z" } });
assert(summer[0].time === "10:00", "August is +03");
assert(winter[0].time === "09:00", "January is +02 — a hard-coded offset would break one of these");

const crossesMidnight = g({ id: "e4", start: { dateTime: "2026-08-16T23:00:00+03:00" }, end: { dateTime: "2026-08-17T01:00:00+03:00" } });
assert(crossesMidnight.length === 1 && crossesMidnight[0].endTime === undefined, "tomorrow's end time is not printed beside today's start");

const week = g({ id: "e5", summary: "חופשה", start: { date: "2026-08-16" }, end: { date: "2026-08-19" } });
assert(week.length === 3, "an all-day span expands to one block per day, end exclusive");
assert(week[0].date === "2026-08-16" && week[2].date === "2026-08-18", "first and last day");
assert(week.every((b) => b.time === undefined), "all-day blocks carry no clock");
assert(new Set(week.map((b) => b.id)).size === 3, "each day gets its own React key");

assert(g({ id: "e6", start: { date: "2026-08-16" } }).length === 1, "a missing all-day end reads as one day");

assert(g({ id: "e7", extendedProperties: { private: { source: EVE_SOURCE } }, start: { date: "2026-08-16" } }).length === 0, "our own push never comes back as a busy block");
assert(g({ id: "e8", status: "cancelled", start: { date: "2026-08-16" } }).length === 0, "cancelled is not busy");
assert(g({ id: "e9", transparency: "transparent", start: { date: "2026-08-16" } }).length === 0, "marked-free is not busy");
assert(g({ id: "e10", attendees: [{ self: true, responseStatus: "declined" }], start: { date: "2026-08-16" } }).length === 0, "declined is not busy");
assert(g({ id: "e11", attendees: [{ self: true, responseStatus: "accepted" }], start: { date: "2026-08-16" } }).length === 1, "accepted is");
assert(g({ start: { date: "2026-08-16" } }).length === 0, "an event with no id is unusable");
assert(g({ id: "e12" }).length === 0, "an event with no start is unusable");

const noTitle = g({ id: "e13", start: { dateTime: "2026-08-16T10:00:00+03:00" } });
assert(noTitle[0].title === "עסוק", "a private entry still blocks the time");

assert(localParts("nonsense") === null, "an unparseable instant is null, not Invalid Date");

// ── date helpers ──
assert(addDays("2026-08-16", 1) === "2026-08-17", "a day on");
assert(addDays("2026-12-31", 1) === "2027-01-01", "across a year");
assert(addDays("2026-03-01", -1) === "2026-02-28", "backwards across a month");
assert(addMonths("2026-01-31", 1) === "2026-02-28", "31 Jan + 1 month clamps to February, never wraps to March");
assert(addMonths("2026-08-16", -1) === "2026-07-16", "and goes backwards");
assert(addMonths("2026-11-16", 3) === "2027-02-16", "and across a year");

const window = defaultBusyWindow("2026-08-16");
assert(window.from === "2026-07-16" && window.to === "2026-11-16", "the seeded window is a month back and three forward");

console.log("google mapping self-check passed");
