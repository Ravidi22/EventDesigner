// THE DAY IN CONTEXT (2026-11-10, the "Modals & popups" board, 4b): the meeting dialog draws what is
// already on the day it is booking — the diary and the designer's own Google entries — as an
// 08:00–20:00 strip, outlines the new slot on it, and when the slot lands on something says so in
// words and offers the next hours that are free. Pure: the dialog hands in the day's entries, this
// hands back minutes.
//
// Minutes past midnight throughout, like `minutesOfDay` — a clock face is not an instant.
import type { Appointment, AppointmentKind } from "./types";
import { appointmentEnd, minutesOfDay } from "./types";
import type { BusyBlock } from "@/lib/google/types";
import { isMain } from "@/lib/self-check";

/** The strip's window. A working day as a designer books it; anything outside is clamped onto it. */
export const STRIP = { from: 8 * 60, to: 20 * 60 } as const;

export interface DayItem {
  id: string;
  start: number;
  end: number;
  /** Who or what — the client's name, a Google title, else the kind. */
  label: string;
  /** A diary entry's kind (its colours on the strip); absent = a Google entry. */
  kind?: AppointmentKind;
  google?: boolean;
  /** An untimed אילוץ / חופשה: it takes the whole day, so anything booked on it collides. */
  allDay?: boolean;
}

/** The kinds that hold a WHOLE day when they carry no hour. A meeting with no hour yet is a meeting
 *  whose hour is not known — it blocks nothing; a vacation with no hour is the day. */
const DAY_HOLDERS: readonly AppointmentKind[] = ["constraint", "vacation"];

/** What is on `date`: the diary's timed entries (and the day-holding untimed ones) and the timed
 *  Google entries, the entry being edited left out. Untimed meetings and all-day Google entries are
 *  not on the strip — neither says which hours it holds. */
export function dayItems(date: string, appointments: Appointment[], busy: BusyBlock[], excludeId?: string): DayItem[] {
  const out: DayItem[] = [];
  for (const a of appointments) {
    if (a.date !== date || a.id === excludeId) continue;
    const label = a.clientName.trim();
    const start = minutesOfDay(a.time);
    if (start === null) {
      if (DAY_HOLDERS.includes(a.kind)) out.push({ id: a.id, start: STRIP.from, end: STRIP.to, label, kind: a.kind, allDay: true });
      continue;
    }
    const end = minutesOfDay(appointmentEnd(a)) ?? start;
    out.push({ id: a.id, start, end: Math.max(end, start), label, kind: a.kind });
  }
  for (const b of busy) {
    if (b.date !== date) continue;
    const start = minutesOfDay(b.time);
    const end = minutesOfDay(b.endTime);
    if (start === null || end === null) continue;
    out.push({ id: b.id, start, end: Math.max(end, start), label: b.title, google: true });
  }
  return out.sort((x, y) => x.start - y.start || x.end - y.end);
}

const overlaps = (s: number, e: number, item: DayItem) => s < item.end && item.start < e;

/** The first thing on the day the slot [start, start + duration) lands on — strictly: one ending
 *  exactly when the slot starts is not in its way. */
export function overlapOf(start: number, durationMin: number, items: DayItem[]): DayItem | null {
  const end = start + Math.max(durationMin, 1);
  return items.find((it) => overlaps(start, end, it)) ?? null;
}

/** Up to `max` hours the slot could move to instead: the moments something on the day ENDS, from
 *  the asked-for hour on — the times a designer would offer the couple ("15:30? 18:00?") — that fit
 *  the whole duration inside the strip's window without touching anything. */
export function freeStarts(start: number, durationMin: number, items: DayItem[], max = 2): number[] {
  const ends = [...new Set(items.map((it) => it.end))].filter((t) => t >= start).sort((a, b) => a - b);
  const out: number[] = [];
  for (const t of ends) {
    if (t < STRIP.from || t + durationMin > STRIP.to) continue;
    if (overlapOf(t, durationMin, items)) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Where an item stands on the strip, as percentages of its width from the START edge. */
export function stripSpan(start: number, end: number): { start: number; width: number } {
  const span = STRIP.to - STRIP.from;
  const s = Math.min(Math.max(start, STRIP.from), STRIP.to);
  const e = Math.min(Math.max(end, STRIP.from), STRIP.to);
  return { start: ((s - STRIP.from) / span) * 100, width: (Math.max(e - s, 0) / span) * 100 };
}

/** HH:mm for minutes past midnight. */
export function clock(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

if (isMain(import.meta.url)) {
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
}
