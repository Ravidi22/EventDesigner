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

// ⚠ NOT ONLY MEETINGS ANYMORE. The diary holds whatever occupies a day: a client sit-down, but also
// a blocked date, a holiday the studio is away for, a delivery to be there for. They share this one
// table rather than getting one each, because every one of them answers the same question — "what is
// on the 12th?" — and a second table would have to be joined into every read that asks it.
//
// The list is FIXED, in an enum, on purpose: a studio-defined type would need a settings surface, a
// text column and a migration of every existing row, to earn a label the four built-in ones already
// cover. When a studio actually asks for its own, that is the moment to spend it.
export type AppointmentKind =
  | "consultation"
  | "followup"
  | "walkthrough"
  | "constraint"
  | "vacation"
  | "supply"
  | "personal"
  | "other"
  /** A venue's: the couple tastes the menu before choosing it (lib/hosting). */
  | "tasting";

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
  "constraint",
  "vacation",
  "supply",
  "personal",
  "other",
  "tasting",
] as const;

export const APPOINTMENT_KIND_LABEL: Record<AppointmentKind, string> = {
  consultation: "פגישת היכרות",
  followup: "פגישת המשך",
  walkthrough: "סיור במתחם",
  constraint: "אילוץ",
  vacation: "חופשה",
  supply: "אספקה",
  personal: "אישי",
  other: "אחר",
  tasting: "טעימה",
};

/** Is this entry ABOUT A CLIENT? Only these carry a couple, a phone and an event — a חופשה has no
 *  client to name, and showing it three blank fields is how a form teaches you to ignore it.
 *  `other` counts as one: it predates the non-client kinds and rows already exist under it with
 *  names on them, so hiding those fields would make old records uneditable. */
export function isClientKind(kind: AppointmentKind): boolean {
  return kind === "consultation" || kind === "followup" || kind === "walkthrough" || kind === "other" || kind === "tasting";
}

/** Guard for the action layer: `kind` arrives over HTTP from whoever chose to POST it, and the
 *  column is an enum that rejects anything else with a 500 rather than a message. */
export function isAppointmentKind(v: unknown): v is AppointmentKind {
  return typeof v === "string" && (APPOINTMENT_KINDS as readonly string[]).includes(v);
}

/** What to print where the entry is named — a prospect meeting booked before the couple gave a name
 *  still has to say something, and a חופשה never has a name to give. Falls back to the kind, which
 *  is the whole label for the non-client kinds. */
export function appointmentLabel(a: Pick<Appointment, "clientName" | "kind">): string {
  return a.clientName.trim() || APPOINTMENT_KIND_LABEL[a.kind];
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

/** Its hour has come and gone, measured against `nowMinutes` (minutes past midnight) ON ITS OWN DAY
 *  — the caller has already filtered to today, so this is a clock comparison, not a date one.
 *
 *  ⚠ NOT the same fact as `done`. This says the time is behind us; `done` says the designer confirms
 *  it happened. Today's Focus crosses out on THIS, because a list of today's hours re-reading its
 *  own clock is worth more than a switch nobody remembers to flip — but the column stays, because
 *  "booked and never held" is still a thing only a person can tell you.
 *
 *  An entry with no hour never passes: a day it belongs to is all it claims. */
export function hasPassed(a: Pick<Appointment, "time" | "durationMin">, nowMinutes: number): boolean {
  const end = minutesOfDay(appointmentEnd(a));
  return end !== null && end <= nowMinutes;
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
