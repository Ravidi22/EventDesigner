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
import { isMain } from "../self-check";
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

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const ev = (id: string, patch: Partial<EventSummary>): EventSummary => ({
    id,
    clientName: id,
    phone: "",
    date: "",
    zoneIds: [],
    zonesLabel: "",
    guests: 0,
    step: 0,
    createdAt: 0,
    ...patch,
  });
  const base = { date: "2026-11-12", venueId: "v1", zoneIds: ["hall"], place: "אולם גדול" };
  const line = (events: EventSummary[], over: Partial<typeof base> & { selfId?: string } = {}) =>
    availabilityLine({ ...base, ...over, events });

  // No date, nothing to say.
  assert(line([ev("נועה ואיתי", { date: "2026-11-12", venueId: "v1", zoneIds: ["hall"] })], { date: "" }) === null, "no date: null");

  // The same day, the same venue, a zone in common: the room is taken.
  const clash = line([ev("נועה ואיתי", { date: "2026-11-12", venueId: "v1", zoneIds: ["hall", "garden"], zonesLabel: "אולם גדול · גן" })]);
  assert(clash?.tone === "busy", "shared zone: busy");
  assert(!!clash?.text.startsWith("ביום הזה כבר: נועה ואיתי"), "shared zone: names the client — " + clash?.text);

  // The same day, the same venue, another part of it.
  const beside = line([ev("נועה ואיתי", { date: "2026-11-12", venueId: "v1", zoneIds: ["garden"], zonesLabel: "גן" })]);
  assert(beside?.tone === "info", "same venue, no shared zone: info");
  assert(beside?.text === "ביום הזה גם: נועה ואיתי · גן", "same venue, no shared zone: client and zones — " + beside?.text);

  // The same day somewhere else.
  const elsewhere = line([ev("נועה ואיתי", { date: "2026-11-12", venueId: "v2", zoneIds: ["hall"], zonesLabel: "אולם" })]);
  assert(elsewhere?.tone === "info", "another venue the same day: info");
  assert(!!elsewhere?.text.startsWith("ביום הזה גם: נועה ואיתי"), "another venue: names the client — " + elsewhere?.text);

  // A free day says so, in the place's own words.
  const free = line([ev("נועה ואיתי", { date: "2026-11-20", venueId: "v1", zoneIds: ["hall"] })]);
  assert(free?.tone === "free" && free.text === "אולם גדול פנוי ביום הזה", "free: the place is free — " + free?.text);
  assert(line([], { place: "" })?.text === "אין אירוע אחר ביום הזה", "free with no place: nothing else that day");
  assert(line([], { place: "אולם גדול · חופה", zoneIds: ["hall", "chuppah"] })?.text === "אולם גדול · חופה פנויים ביום הזה", "free, several zones: plural");

  // The evening before (one or two days), in the same venue.
  const eve = line([ev("נועה ואיתי", { date: "2026-11-10", venueId: "v1", zoneIds: ["hall"] })]);
  assert(eve?.tone === "free" && eve.text === "אולם גדול פנוי ביום הזה · ערב קודם: נועה ואיתי (10.11)", "two days before: the eve — " + eve?.text);
  assert(!!line([ev("א", { date: "2026-11-11", venueId: "v1" })])?.text.endsWith(" · ערב קודם: א (11.11)"), "the day before: the eve");
  assert(!line([ev("א", { date: "2026-11-09", venueId: "v1" })])?.text.includes("ערב קודם"), "three days before: not the eve");
  assert(!line([ev("א", { date: "2026-11-11", venueId: "v2" })])?.text.includes("ערב קודם"), "the eve at another venue does not count");
  assert(!!line([ev("א", { date: "2026-11-11", venueId: "v2" })], { venueId: "", zoneIds: [], place: "" })?.text.includes("ערב קודם: א (11.11)"), "no venue picked: any venue's eve counts");
  assert(!line([ev("א", { date: "2026-11-13", venueId: "v1" })])?.text.includes("ערב קודם"), "the day after is not the eve");
  assert(
    !!line([ev("א", { date: "2026-11-30", venueId: "v1" })], { date: "2026-12-01" })?.text.endsWith(" · ערב קודם: א (30.11)"),
    "the eve across a month",
  );
  const busyEve = line([
    ev("ב", { date: "2026-11-12", venueId: "v1", zoneIds: ["hall"] }),
    ev("א", { date: "2026-11-11", venueId: "v1" }),
  ]);
  assert(busyEve?.tone === "busy" && busyEve.text === "ביום הזה כבר: ב · ערב קודם: א (11.11)", "busy with an eve — " + busyEve?.text);

  // What never counts: archived, lost, the event itself.
  const sameDay = { date: "2026-11-12", venueId: "v1", zoneIds: ["hall"] };
  assert(line([ev("א", { ...sameDay, archived: true })])?.tone === "free", "archived does not count");
  assert(line([ev("א", { ...sameDay, lostAt: 1 })])?.tone === "free", "lost does not count");
  assert(line([ev("self", sameDay)], { selfId: "self" })?.tone === "free", "the event itself does not count");
  assert(!line([ev("א", { date: "2026-11-11", venueId: "v1", archived: true })])?.text.includes("ערב קודם"), "an archived eve does not count");
  assert(!line([ev("self", { date: "2026-11-11", venueId: "v1" })], { selfId: "self" })?.text.includes("ערב קודם"), "the event itself is no eve");

  console.log("availability: ok");
}
