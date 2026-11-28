// npm run check:day-strip — the self-check of ./day-strip.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Appointment } from "./types";
import { minutesOfDay } from "./types";
import { clock, dayItems, freeStarts, overlapOf, stripSpan, type DayItem } from "./day-strip";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const item = (id: string, from: string, to: string, extra: Partial<DayItem> = {}): DayItem => ({
  id,
  start: minutesOfDay(from)!,
  end: minutesOfDay(to)!,
  label: id,
  ...extra,
});

// The board's own day: a follow-up 14:00–15:30 and a walkthrough 17:00–18:00; the new meeting at
// 15:00 for an hour lands on the first, and the pills offer 15:30 and 18:00.
const board = [item("followup", "14:00", "15:30"), item("walk", "17:00", "18:00")];
assert(overlapOf(900, 60, board)?.id === "followup", "15:00 for an hour lands on the 14:00 follow-up");
assert(same(freeStarts(900, 60, board), [930, 1080]), "the board's pills: 15:30 and 18:00");
assert(overlapOf(930, 30, board) === null, "touching the end of one is free");

const longer = [item("a", "14:00", "15:30"), item("b", "16:00", "18:00")];
assert(same(freeStarts(900, 60, longer), [1080]), "15:30 does not fit an hour before 16:00");
assert(same(freeStarts(900, 30, longer), [930, 1080]), "half an hour fits at 15:30");

assert(same(freeStarts(1170, 60, [item("late", "19:30", "20:00")]), []), "nothing may run past 20:00");

const vacation = [item("v", "08:00", "20:00", { allDay: true })];
assert(overlapOf(600, 60, vacation)?.id === "v", "an all-day vacation is in the way of anything");
assert(same(freeStarts(600, 60, vacation), []), "and leaves no free hour");
assert(overlapOf(1200, 60, vacation)?.id === "v" && overlapOf(420, 30, vacation)?.id === "v", "even outside 08:00–20:00");

const base = { phone: "", note: "", createdAt: 0, durationMin: 60 } as const;
const list: Appointment[] = [
  { ...base, id: "x", clientName: "נועה", date: "2026-11-10", time: "10:00", kind: "consultation" },
  { ...base, id: "y", clientName: "", date: "2026-11-10", kind: "consultation" },
  { ...base, id: "z", clientName: "", date: "2026-11-10", kind: "constraint" },
  { ...base, id: "o", clientName: "דנה", date: "2026-11-11", time: "10:00", kind: "followup" },
];
const day = dayItems("2026-11-10", list, [{ id: "g", date: "2026-11-10", time: "08:30", endTime: "09:15", title: "רופא", calendarName: "" }], "x");
assert(!day.some((d) => d.id === "x"), "the entry being edited is left out");
assert(!day.some((d) => d.id === "y"), "an untimed meeting holds no hours");
assert(day.find((d) => d.id === "z")?.allDay === true, "an untimed constraint holds the day");
assert(!day.some((d) => d.id === "o"), "another day's entry is not on this strip");
assert(day.find((d) => d.id === "g")?.google === true && day[0].id === "z", "Google's timed entry is on it; sorted by start");

const span = stripSpan(600, 660);
assert(Math.abs(span.start - (120 / 720) * 100) < 1e-9 && Math.abs(span.width - (60 / 720) * 100) < 1e-9, "10:00–11:00 sits a sixth in, a twelfth wide");
assert(stripSpan(420, 500).start === 0 && stripSpan(1150, 1300).start + stripSpan(1150, 1300).width === 100, "clamped onto the window");
assert(clock(930) === "15:30" && clock(480) === "08:00", "clock");

console.log("day-strip: ok");
