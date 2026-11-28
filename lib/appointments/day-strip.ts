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
  // An all-day entry holds the whole DAY, not just the strip's window: a 20:00 meeting on a
  // vacation day still lands on it.
  return items.find((it) => it.allDay || overlaps(start, end, it)) ?? null;
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
