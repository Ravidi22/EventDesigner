// A meeting with a client, on the calendar.
//
// ⚠ THE NAME. Everything on screen calls this a פגישה, and so does the designer. In code it is an
// "appointment", because "meeting" already means the MEETING FLOW — lib/meeting/steps.ts, /meeting,
// MeetingStepId: the guided stages a designer walks a client through inside one sitting. The two are
// related (you run the flow AT one of these) but they are not the same object, and a `lib/meetings/`
// one character away from `lib/meeting/` is a mis-import nobody would notice.
//
// ⚠ WHY IT IS A TABLE AND NOT A COLUMN. It used to be `events.meetingDate`, one nullable date on the
// event row, which permits exactly one meeting per event for the life of that event. docs/01
// §מצב פגישה says the opposite outright — "פגישה שנייה ושינויים הם חלק מהתהליך, לא חריגה ממנו" — and
// the column also could not exist before its event did, so the first meeting, the one where you find
// out whether there is going to be an event at all, had nowhere to be written down.
import { isMain } from "@/lib/self-check";

export type AppointmentKind = "consultation" | "followup" | "walkthrough" | "other";

export interface Appointment {
  id: string;
  /** The event this is about. ABSENT while the couple is still a prospect — that is the normal
   *  state of a first meeting, not an edge case. */
  eventId?: string;
  /** Who it is with, as typed. Seeded from the event when there is one, but stored either way: a
   *  prospect has no event to read a name off. */
  clientName: string;
  phone: string;
  /** The property this concerns. Absent = not tied to one yet. */
  venueId?: string;
  date: string; // ISO yyyy-mm-dd — required; an appointment with no date is not one
  time?: string; // HH:mm
  durationMin: number;
  kind: AppointmentKind;
  note: string;
  /** It was held. Not "the date is past" — see the column note in lib/db/schema.ts. */
  done?: boolean;
  createdAt: number;
}

export const APPOINTMENT_KINDS: readonly AppointmentKind[] = [
  "consultation",
  "followup",
  "walkthrough",
  "other",
] as const;

export const APPOINTMENT_KIND_LABEL: Record<AppointmentKind, string> = {
  consultation: "פגישת היכרות",
  followup: "פגישת המשך",
  walkthrough: "סיור במתחם",
  other: "אחר",
};

/** Guard for the action layer: `kind` arrives over HTTP from whoever chose to POST it, and the
 *  column is an enum that rejects anything else with a 500 rather than a message. */
export function isAppointmentKind(v: unknown): v is AppointmentKind {
  return typeof v === "string" && (APPOINTMENT_KINDS as readonly string[]).includes(v);
}

/** What to print where the meeting is named — a prospect meeting booked before the couple gave a
 *  name still has to say something. */
export function appointmentLabel(a: Pick<Appointment, "clientName">): string {
  return a.clientName.trim() || "פגישה";
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes past midnight, or null if `time` is absent or malformed. Both callers below want a
 *  number and neither wants a Date — a clock face is not an instant. */
export function minutesOfDay(time: string | undefined): number | null {
  if (!time) return null;
  const m = HHMM.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** When it ends, HH:mm — or undefined if it has no start.
 *
 *  CLAMPED TO 23:59 rather than wrapping: a meeting whose duration runs past midnight is a typo, and
 *  printing "17:00–00:30" on the day BEFORE would send the designer to the wrong cell. The date is
 *  the fact of record here; the end time is a convenience. */
export function appointmentEnd(a: Pick<Appointment, "time" | "durationMin">): string | undefined {
  const start = minutesOfDay(a.time);
  if (start === null) return undefined;
  const end = Math.min(start + Math.max(0, a.durationMin), 23 * 60 + 59);
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

/** "17:00–18:30", "17:00" when there is no duration to add, "" when there is no time at all — a
 *  meeting booked for a day but not yet an hour is a real and common state. */
export function appointmentTimeLabel(a: Pick<Appointment, "time" | "durationMin">): string {
  if (!a.time) return "";
  const end = a.durationMin > 0 ? appointmentEnd(a) : undefined;
  // LRM around the pair: the en dash between two Latin-digit clock times flips to the wrong side in
  // an RTL paragraph, which reads as 18:30–17:00.
  return end && end !== a.time ? `‎${a.time}–${end}` : `‎${a.time}`;
}

/** Day order: timed meetings first, in clock order; undated-hour ones after them. `Array#sort` is
 *  stable, so equal times keep the order they arrived in (newest-first from the server). */
export function byStartTime(a: Appointment, b: Appointment): number {
  const x = minutesOfDay(a.time);
  const y = minutesOfDay(b.time);
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x - y;
}

/** Group by ISO date — what both the calendar grid and Today's Focus read. */
export function byDate(list: Appointment[]): Map<string, Appointment[]> {
  const map = new Map<string, Appointment[]>();
  for (const a of list) {
    const day = map.get(a.date);
    if (day) day.push(a);
    else map.set(a.date, [a]);
  }
  for (const day of map.values()) day.sort(byStartTime);
  return map;
}

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const at = (time: string | undefined, durationMin = 60): Appointment => ({
    id: "a",
    clientName: "",
    phone: "",
    date: "2026-08-16",
    time,
    durationMin,
    kind: "consultation",
    note: "",
    createdAt: 0,
  });

  assert(minutesOfDay("17:00") === 1020, "17:00 is 1020 minutes in");
  assert(minutesOfDay("00:00") === 0, "midnight is zero, not falsy-null");
  assert(minutesOfDay(undefined) === null, "no time is null");
  assert(minutesOfDay("25:00") === null, "an impossible hour is null, not 1500");
  assert(minutesOfDay("7:5") === null, "unpadded is refused rather than guessed at");

  assert(appointmentEnd(at("17:00", 90)) === "18:30", "an hour and a half later");
  assert(appointmentEnd(at("17:00", 60)) === "18:00", "on the hour");
  assert(appointmentEnd(at("09:05", 20)) === "09:25", "both halves stay padded");
  assert(appointmentEnd(at(undefined)) === undefined, "no start, no end");
  assert(appointmentEnd(at("23:30", 120)) === "23:59", "past midnight clamps, never wraps to 01:30");

  assert(appointmentTimeLabel(at("17:00", 90)) === "‎17:00–18:30", "a range");
  assert(appointmentTimeLabel(at("17:00", 0)) === "‎17:00", "no duration, no dash");
  assert(appointmentTimeLabel(at(undefined)) === "", "a day without an hour prints nothing");

  assert(appointmentLabel({ clientName: "  " }) === "פגישה", "a blank name still says something");
  assert(appointmentLabel({ clientName: "נועה ואיתי" }) === "נועה ואיתי", "a real name is used");

  const day = [at("17:00"), at(undefined), at("09:00")];
  const sorted = [...day].sort(byStartTime);
  assert(sorted[0].time === "09:00" && sorted[1].time === "17:00", "the day runs in clock order");
  assert(sorted[2].time === undefined, "an hourless meeting sits at the end, not at 00:00");

  const grouped = byDate([{ ...at("17:00"), date: "2026-08-17" }, at("09:00"), at("08:00")]);
  assert(grouped.size === 2, "two dates, two buckets");
  assert(grouped.get("2026-08-16")?.[0].time === "08:00", "each bucket is sorted");

  assert(isAppointmentKind("walkthrough") && !isAppointmentKind("dinner"), "the kind guard holds");

  console.log("appointments self-check passed");
}
