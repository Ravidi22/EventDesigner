// Appointment → Google event, and Google event → BusyBlock. Pure, no I/O, no directive — its own
// file because a "use server" module may only export async functions, and because this is the half
// worth asserting on without a network.
//
// THE ONE THING THAT MAKES THIS EASY, and it was not an accident: an Appointment stores a CLOCK FACE
// (`date` + `time` + `durationMin`), never a timestamptz — see the column note in lib/db/schema.ts.
// Google's API accepts exactly that shape on the way in: a naive local `dateTime` plus an explicit
// `timeZone` field. So the push does no instant conversion at all and there is no DST arithmetic to
// get wrong. The PULL is where the conversion lives, in one direction, in one function, because
// Google hands back a real instant and the grid needs to know which cell it falls in.
import type { Appointment } from "@/lib/appointments/types";
import { APPOINTMENT_KIND_LABEL, appointmentLabel, isClientKind } from "@/lib/appointments/types";
import type { BusyBlock } from "./types";
import { BUSY_WINDOW_BACK_MONTHS, BUSY_WINDOW_FORWARD_MONTHS, STUDIO_TIMEZONE, busyKey } from "./types";

// ── Google's wire shapes, only as far as this app reads them ───────────────────────────────────
// Hand-written rather than imported from a types package: three fields of one resource do not
// justify a dependency, and the fields this app touches are the stable, documented core of v3.

export interface GoogleDateTime {
  /** All-day form: yyyy-mm-dd. */
  date?: string;
  /** Timed form: RFC3339. On the way OUT this app writes it WITHOUT an offset and pairs it with
   *  `timeZone`; on the way IN Google always includes one. */
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleEvent {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleDateTime;
  end?: GoogleDateTime;
  /** "transparent" means the organiser marked it as NOT blocking their time. */
  transparency?: string;
  attendees?: { self?: boolean; responseStatus?: string }[];
  /** Set by this app on everything it writes — see `EVE_SOURCE`. */
  extendedProperties?: { private?: Record<string, string> };
}

/** Stamped into every event this app writes, so a pull can recognise its own push and skip it.
 *
 *  WITHOUT THIS THE TWO DIRECTIONS FEED EACH OTHER: the diary is pushed into a calendar in the
 *  designer's account, the pull reads the designer's calendars, and every appointment comes back as
 *  a busy block sitting on top of the appointment it came from. Filtering by calendar id alone
 *  would mostly work and would break the moment someone renames or re-shares the calendar, so the
 *  marker travels on the event itself. */
export const EVE_SOURCE = "eve.appointment";

/** A zero-duration meeting still has to occupy something in Google's grid, which has no way to draw
 *  an instant. Thirty minutes is Google's own quick-add default and reads as "an appointment",
 *  which is nearer the truth than a sliver. It is a RENDERING floor, not a claim about length —
 *  `durationMin` in this app's database stays whatever the designer typed. */
const MIN_PUSHED_DURATION = 30;

const LAST_MINUTE_OF_DAY = 23 * 60 + 59;

// ── Push: Appointment → Google ─────────────────────────────────────────────────────────────────

/**
 * The Google event body for one appointment.
 *
 * WHAT GOES IN THE TITLE. `appointmentLabel` already answers "what do you call this thing" for the
 * whole diary — a couple's name when there is one, the kind's Hebrew label when there is not — so
 * the title is that, prefixed with the kind for anything that is not a client sit-down. A חופשה in
 * a phone's month view has to say חופשה; a meeting with נועה ואיתי has to say their names.
 *
 * ⚠ THE CLIENT'S PHONE NUMBER GOES IN THE DESCRIPTION, and that is a deliberate call with a cost:
 * it puts client contact details on Google's servers. It is here because the entire reason a
 * designer wants this on their phone is to ring the couple from the car on the way to the meeting,
 * and a calendar entry that omits the number sends them back to the laptop. It is limited to the
 * CLIENT kinds — a חופשה or an אילוץ carries no client and gets no contact block.
 */
export function toGoogleEvent(a: Appointment): GoogleEvent {
  const title = isClientKind(a.kind)
    ? appointmentLabel(a)
    : `${APPOINTMENT_KIND_LABEL[a.kind]}${a.clientName.trim() ? ` — ${a.clientName.trim()}` : ""}`;

  const lines: string[] = [];
  if (isClientKind(a.kind) && a.phone.trim()) lines.push(`טלפון: ${a.phone.trim()}`);
  if (a.note.trim()) lines.push(a.note.trim());
  // Says where it came from, in the one place a human will actually look — the event they are
  // staring at on their phone wondering why they cannot edit it usefully.
  lines.push("", "נוצר מתוך Eve. עריכה כאן לא תחזור ליומן הסטודיו.");

  return {
    summary: title,
    description: lines.join("\n"),
    ...span(a),
    extendedProperties: {
      // `private` = visible to this app on this account, not to other apps and not to guests.
      private: { source: EVE_SOURCE, appointmentId: a.id, kind: a.kind },
    },
  };
}

/**
 * Start and end, in whichever of Google's two forms fits.
 *
 * NO HOUR MEANS ALL-DAY, not midnight. "A meeting booked for a day but not yet an hour is a real
 * and common state" (lib/appointments/types.ts), and pushing those as 00:00 would stack every
 * un-timed meeting at the top of the day looking like a 5am appointment.
 *
 * Google's all-day `end.date` is EXCLUSIVE — a one-day event ends on the following date. Getting
 * that wrong produces an event that renders as zero days and disappears, which is exactly the kind
 * of bug that looks like "the sync is broken".
 */
function span(a: Appointment): Pick<GoogleEvent, "start" | "end"> {
  const start = minutesOfDay(a.time);

  // No hour, or an hour so late that no end can be placed after it on the same day — the second
  // case terminates what would otherwise be an unrepresentable event (see the clamp below).
  if (start === null || start >= LAST_MINUTE_OF_DAY) {
    return { start: { date: a.date }, end: { date: addDays(a.date, 1) } };
  }

  const requested = a.durationMin > 0 ? a.durationMin : MIN_PUSHED_DURATION;
  // CLAMPED TO THE END OF THE DAY, never wrapped — the same rule appointmentEnd() follows, and for
  // the same reason: the date is the fact of record, so an event that ran into tomorrow would move
  // a meeting off the day the designer booked it on.
  const end = Math.min(start + requested, LAST_MINUTE_OF_DAY);

  return {
    // No offset and no "Z" on the dateTime: this is a wall clock, and `timeZone` is what gives it
    // meaning. Appending an offset here would hard-code today's DST state into a future event.
    start: { dateTime: `${a.date}T${clock(start)}:00`, timeZone: STUDIO_TIMEZONE },
    end: { dateTime: `${a.date}T${clock(end)}:00`, timeZone: STUDIO_TIMEZONE },
  };
}

// ── Pull: Google → BusyBlock ───────────────────────────────────────────────────────────────────

/**
 * One Google event as zero or more busy blocks — one per day it covers.
 *
 * ZERO IS A NORMAL ANSWER, and there are four ways to get it. An event this app pushed (it would
 * otherwise be drawn on top of the appointment it came from). A cancelled one. One the designer
 * marked "free", which is Google's own way of saying "this does not block me". And one they
 * declined, which is the same statement made through an invitation.
 *
 * ALL-DAY EVENTS EXPAND ACROSS THEIR DAYS; timed ones do not. That asymmetry is the useful half: a
 * week's חופשה is exactly the thing a designer needs to see greyed across a week, and it is always
 * all-day. A timed event crossing midnight is a 23:00 dinner, which belongs on the day it started.
 */
export function toBusyBlocks(event: GoogleEvent, calendarId: string, calendarName: string): BusyBlock[] {
  if (!event.id) return [];
  if (event.status === "cancelled") return [];
  if (event.extendedProperties?.private?.source === EVE_SOURCE) return [];
  if (event.transparency === "transparent") return [];
  if (event.attendees?.some((at) => at.self && at.responseStatus === "declined")) return [];

  // A private entry on a shared calendar comes back with no summary at all — the time is the fact
  // that matters, so it becomes a block with a placeholder rather than being dropped.
  const title = event.summary?.trim() || "עסוק";
  const id = busyKey(event.id, calendarId);

  if (event.start?.date) {
    const from = event.start.date;
    // Exclusive, per Google. `end.date` may be absent on a malformed row; one day is the safe read.
    const until = event.end?.date ?? addDays(from, 1);
    const days: BusyBlock[] = [];
    // Bounded, so a decade-long "event" (they exist, usually by accident) cannot spin here.
    for (let day = from, guard = 0; day < until && guard < 400; day = addDays(day, 1), guard++) {
      days.push({ id: `${id}:${day}`, date: day, title, calendarName });
    }
    return days;
  }

  if (!event.start?.dateTime) return [];
  const start = localParts(event.start.dateTime);
  if (!start) return [];
  const end = event.end?.dateTime ? localParts(event.end.dateTime) : null;

  return [
    {
      id,
      date: start.date,
      time: start.time,
      // Only when it ends on the same day — an end time from tomorrow printed next to today's start
      // reads as a meeting running backwards, the same trap appointmentEnd() clamps for.
      endTime: end && end.date === start.date ? end.time : undefined,
      title,
      calendarName,
    },
  ];
}

/**
 * An RFC3339 instant as a wall clock in the studio's timezone.
 *
 * Intl, NOT hand arithmetic and NOT a library. Israel observes DST, so the offset between UTC and
 * Jerusalem is not a constant and any fixed +02:00/+03:00 would be wrong for half the year — which
 * would show as meetings landing an hour off, seasonally, which is the worst kind of bug to be told
 * about second-hand. `Intl.DateTimeFormat` carries the full tz database and is in the standard
 * library.
 *
 * `formatToParts` rather than a format string: the parts are named, so this cannot be broken by a
 * locale that orders or punctuates the pieces differently.
 */
export function localParts(rfc3339: string, timeZone: string = STUDIO_TIMEZONE): { date: string; time: string } | null {
  const at = new Date(rfc3339);
  if (Number.isNaN(at.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const [year, month, day, hour, minute] = [get("year"), get("month"), get("day"), get("hour"), get("minute")];
  if (!year || !month || !day || !hour || !minute) return null;

  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

// ── Small date helpers ─────────────────────────────────────────────────────────────────────────
// Local to this file rather than imported from the dashboard's view utils: those live under app/
// and are bundled for the browser, and this module is server-side. UTC throughout — `new Date(iso)`
// is midnight UTC, so any use of a LOCAL getter here would print the previous day west of
// Greenwich, which is the one bug the whole diary cannot afford.

/** yyyy-mm-dd, n days on. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + n));
  return at.toISOString().slice(0, 10);
}

/** yyyy-mm-dd, n months on, clamped to the end of the target month — 31 January plus one month is
 *  28 or 29 February, never 2 or 3 March. Used only to size the pull window, where an overshoot
 *  fetches a few extra days and a wrap would silently shift the whole window. */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** The window the dashboard seeds, expressed once so the server's read and the client hook's idea
 *  of "what is already loaded" cannot drift apart.
 *
 *  ⚠ IT LIVES HERE, NOT IN use-busy.ts, and the reason is a Next.js boundary rather than taste.
 *  use-busy.ts is a "use client" module, and a server component importing a function from one gets
 *  a CLIENT REFERENCE rather than the function — calling it during the render throws at runtime,
 *  not at build. dashboard/page.tsx is a server component and calls this, so it has to come from a
 *  module with no directive on it. */
export function defaultBusyWindow(todayISO: string): { from: string; to: string } {
  return {
    from: addMonths(todayISO, -BUSY_WINDOW_BACK_MONTHS),
    to: addMonths(todayISO, BUSY_WINDOW_FORWARD_MONTHS),
  };
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutesOfDay(time: string | undefined): number | null {
  if (!time) return null;
  const m = HHMM.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
