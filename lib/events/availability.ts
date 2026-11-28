// The line under the event's date in the details form (components/event-form.tsx): is the room
// free that day, and who was in it the evening before.
//
// A HINT, NEVER A REFUSAL. Two events at one venue on one day are normal — the חופה at noon and the
// hall at night, two halls of one site — and the studio may have been told something this app was
// not. So the form saves whatever it says; it only makes the clash visible while the date is typed,
// which is the one moment the answer is still cheap to change.
//
// "Taken" is the same day, the same venue AND a zone in common — the only clash the app can see.
// Another part of the venue, or another venue, is said as information ("ביום הזה גם"): the designer
// may be at both, and the crew is the same crew. The evening before (one or two days back) is named
// because an event is a WINDOW, not a day — the truck is at the hall the afternoon before
// (EventSummary.setupDate), and a wedding the night before in the same hall is the load-in that has
// to wait for its strike. Archived and lost events, and the event being edited, never count.
//
// Pure, so it can be asserted without a browser: `npm run check:availability`.
import type { EventSummary } from "./types";

export interface Availability {
  tone: "free" | "busy" | "info";
  text: string;
}

const DAY_MS = 86_400_000;

/** A calendar day as a whole number, or null for anything that is not an ISO yyyy-mm-dd. UTC, so a
 *  daylight-saving night never makes two days 23 hours apart. */
function dayNumber(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) ? null : Math.round(t / DAY_MS);
}

/** "10.11" — the day and month the way a Hebrew calendar note writes them. */
function dayMonth(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)}.${Number(m)}`;
}

/**
 * @param date    the date the form names ("" = not set yet → null, nothing to say)
 * @param venueId the venue the form names ("" = none picked)
 * @param zoneIds the zones picked on it
 * @param selfId  the event being edited, which never clashes with itself
 * @param events  the studio's events (fetchEvents)
 * @param place   the picked zones' names joined with " · ", else the venue's name, else ""
 */
export function availabilityLine({
  date,
  venueId,
  zoneIds,
  selfId,
  events,
  place,
}: {
  date: string;
  venueId: string;
  zoneIds: string[];
  selfId?: string;
  events: EventSummary[];
  place: string;
}): Availability | null {
  const day = dayNumber(date);
  if (day === null) return null;

  const live = events.filter((e) => e.id !== selfId && !e.archived && !e.lostAt);
  const here = (e: EventSummary) => !!venueId && e.venueId === venueId;
  // Who else, in words: the zones they hold when they are at this venue, "another venue" when the
  // form has picked one and they are elsewhere, the name alone when either side has no venue yet.
  const describe = (e: EventSummary) =>
    !venueId || !e.venueId
      ? e.clientName
      : here(e)
        ? e.zonesLabel
          ? `${e.clientName} · ${e.zonesLabel}`
          : e.clientName
        : `${e.clientName} · במתחם אחר`;

  const sameDay = live.filter((e) => e.date === date);
  const taken = sameDay.filter((e) => here(e) && e.zoneIds.some((z) => zoneIds.includes(z)));

  const line: Availability = taken.length
    ? { tone: "busy", text: `ביום הזה כבר: ${taken.map(describe).join(", ")}` }
    : sameDay.length
      ? { tone: "info", text: `ביום הזה גם: ${sameDay.map(describe).join(", ")}` }
      : {
          tone: "free",
          // `place` is several zones exactly when it is a " · " join — the verb agrees with it.
          text: place ? `${place} ${place.includes(" · ") ? "פנויים" : "פנוי"} ביום הזה` : "אין אירוע אחר ביום הזה",
        };

  // The evening before — at this venue, or anywhere while no venue is picked. Nearest first.
  const eves = live
    .flatMap((e) => {
      const d = dayNumber(e.date);
      const back = d === null ? 0 : day - d;
      return back >= 1 && back <= 2 && (!venueId || here(e)) ? [{ e, back }] : [];
    })
    .sort((a, b) => a.back - b.back);
  if (eves.length) line.text += ` · ערב קודם: ${eves.map(({ e }) => `${e.clientName} (${dayMonth(e.date)})`).join(", ")}`;

  return line;
}
