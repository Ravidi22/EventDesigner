// The presentation half of the runway: how a date is written, which week and which month a row
// falls in, and where a collision band goes once a filter has been applied.
//
// Kept out of lib/production/runway.ts on purpose. That file is pure logic with a self-check that
// runs under plain node — it decides WHAT is late. Nothing in here decides anything; it only turns
// what that file already computed into strings and buckets a list can be drawn from. The same split
// app/(app)/dashboard/dashboard-view-utils.ts makes, for the same reason: a Hebrew month name has
// no business inside a module that has to keep passing `npm run check:runway`.
//
// ── DATES, AND THE ONE TRAP ────────────────────────────────────────────────────────────────────
//
// Every date here is an ISO `yyyy-mm-dd`, and none of them is ever handed to `new Date(string)`.
// `new Date("2026-08-09")` parses as midnight UTC, so `toLocaleDateString` in Israel prints the
// 8th — the same trap runway.ts and lib/db/db-mapping.ts both document. Where a Date object is
// genuinely needed (Intl wants one), it is built from integer parts with Date.UTC AND formatted
// with `timeZone: "UTC"`, so both ends of the round trip agree and the offset cancels.
import type { Collision, Runway, RunwayRow } from "@/lib/production/runway";
import { shiftDays } from "@/lib/production/runway";

const DAY_MS = 86_400_000;

/** Midnight-UTC epoch for a `yyyy-mm-dd`. Not exported — nothing outside should hold one. */
function utcDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** The ISO date for a Date read in the LOCAL zone. Only used for "what day is it in this browser",
 *  which is a fallback — see `todayOf`. */
function localToday(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * The SERVER's idea of today, recovered from the runway itself.
 *
 * The runway was built on the server against one `today`, and every `daysUntil` in it counts from
 * that day. If the client recomputed its own — from a browser sitting on the far side of midnight,
 * or in another timezone — the ribbon would highlight a different week than the one the rows were
 * measured against, and nothing on screen would say so. So instead of asking the clock, we invert
 * an answer the server already gave us: for any dated row, `date − daysUntil` IS the server's today.
 *
 * The local clock is the fallback for a runway with no dated rows at all, where there is nothing to
 * invert and nothing on screen that could disagree with it anyway.
 */
export function todayOf(runway: Runway): string {
  const anchored = runway.rows.find((r) => r.event.date && r.daysUntil !== null);
  return anchored ? shiftDays(anchored.event.date, -anchored.daysUntil!) : localToday();
}

/** The Sunday of the week `iso` falls in. Sunday because that is where an Israeli week starts and
 *  where every other calendar surface in this app already snaps (weekGrid, dashboard-view-utils). */
export function sundayOf(iso: string): string {
  const t = utcDay(iso);
  const dow = new Date(t).getUTCDay(); // 0 = Sunday, in UTC because `t` is UTC
  return new Date(t - dow * DAY_MS).toISOString().slice(0, 10);
}

// ── Labels ─────────────────────────────────────────────────────────────────────────────────────

/** he-IL, formatted from a UTC instant with a UTC timezone so the two never disagree. */
function fmt(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(utcDay(iso)).toLocaleDateString("he-IL", { ...options, timeZone: "UTC" });
}

/** The row's date line — "יום ה׳, 12 באוג׳". The weekday is not decoration: which day of the week
 *  an event falls on is half of what makes it hard or easy to staff. The year is deliberately
 *  absent — the month header above the row is already carrying it. */
export function rowDateLabel(iso: string): string {
  return iso ? fmt(iso, { weekday: "short", day: "numeric", month: "short" }) : "טרם נקבע";
}

/** The ribbon cell's date — deliberately numeric and tiny ("12.8"), because thirteen of them sit
 *  side by side and a month name in each would be the loudest thing on the screen. */
export function weekCellLabel(sunday: string): string {
  const d = new Date(utcDay(sunday));
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
}

/** "בעוד 12 ימים" / "היום" / "לפני 3 ימים". The single most important number on the row — the whole
 *  file this screen is built on exists to answer "how long do I have". */
export function daysUntilLabel(days: number | null): string {
  if (days === null) return "אין תאריך";
  if (days === 0) return "היום";
  if (days === 1) return "מחר";
  if (days === -1) return "אתמול";
  return days > 0 ? `בעוד ${days} ימים` : `לפני ${-days} ימים`;
}

// ── Grouping by month ──────────────────────────────────────────────────────────────────────────

export interface MonthGroup {
  /** `yyyy-mm`, or "" for the undated group. Also the React key. */
  key: string;
  label: string;
  rows: RunwayRow[];
}

/** Undated events have no place on a time axis but still have to be reachable — buildRunway
 *  already sorts them to the end, so they collect into one trailing group under their own header
 *  rather than being silently dropped or, worse, filed under whatever month happens to be last. */
const UNDATED_LABEL = "ללא תאריך";

/**
 * The visible rows, cut into months, IN THE ORDER THEY ARRIVED.
 *
 * ⚠ This never sorts. `runway.rows` is chronological already and a timeline you can re-sort is not
 * a timeline (see the note on `Runway.rows`) — so this walks the list once and starts a new group
 * whenever the month changes, which is also why a month can only ever appear once.
 */
export function groupByMonth(rows: readonly RunwayRow[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const row of rows) {
    const key = row.event.date ? row.event.date.slice(0, 7) : "";
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.rows.push(row);
      continue;
    }
    groups.push({
      key,
      label: key ? fmt(`${key}-01`, { month: "long", year: "numeric" }) : UNDATED_LABEL,
      rows: [row],
    });
  }
  return groups;
}

// ── The load ribbon ────────────────────────────────────────────────────────────────────────────

export interface WeekCell {
  /** ISO date of the week's Sunday — also the anchor a click scrolls the list to. */
  start: string;
  count: number;
  /** True for the week containing the server's today. */
  current: boolean;
}

/** A quarter. Thirteen weeks is how far a designer can actually see: far enough that a booking made
 *  today lands inside it, short enough that thirteen slim cells still fit the content width without
 *  a horizontal scrollbar — which this screen does not have anywhere, by construction. */
export const RIBBON_WEEKS = 13;

/**
 * Where the ribbon's window starts.
 *
 * Normally this week: the runway is about what is ahead, and "now" belongs at the leading edge.
 * The exception is a lane whose rows are all behind us — the closed lane is exactly that — where a
 * window pinned to today would be thirteen empty cells. So when the earliest visible row is in the
 * past, the window starts there instead.
 *
 * A closed lane holding years of history therefore only gets a ribbon over its first quarter. That
 * is a real limitation and it is the right trade: the ribbon is a scrollbar with information in it,
 * not a chart of the archive, and everything outside the window is still in the list below.
 */
export function ribbonStart(visible: readonly RunwayRow[], today: string): string {
  const firstDated = visible.find((r) => r.event.date)?.event.date;
  return sundayOf(firstDated && firstDated < today ? firstDated : today);
}

/** One cell per week from `start`, each counting the VISIBLE rows that fall in it — the ribbon
 *  navigates the list you are looking at, so it has to count the list you are looking at. */
export function weekCells(visible: readonly RunwayRow[], start: string, today: string): WeekCell[] {
  const counts = new Map<string, number>();
  for (const row of visible) {
    if (!row.event.date) continue;
    const week = sundayOf(row.event.date);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  const thisWeek = sundayOf(today);
  return Array.from({ length: RIBBON_WEEKS }, (_, i) => {
    const weekStart = shiftDays(start, i * 7);
    return { start: weekStart, count: counts.get(weekStart) ?? 0, current: weekStart === thisWeek };
  });
}

/** How many visible dated rows the ribbon's window does NOT cover. Stated on screen rather than
 *  hidden: a ribbon that silently omits half the list is worse than no ribbon. */
export function rowsOutsideRibbon(visible: readonly RunwayRow[], start: string): number {
  const end = shiftDays(start, RIBBON_WEEKS * 7); // exclusive
  return visible.filter((r) => r.event.date && (r.event.date < start || r.event.date >= end)).length;
}

// ── Collisions, after filtering ────────────────────────────────────────────────────────────────

export interface CollisionPlan {
  /** eventId → the message for the band drawn immediately BEFORE that row, joining it to the row
   *  above. Only ever set when the two events the collision names are genuinely adjacent on screen. */
  bandBefore: Map<string, string>;
  /** eventId → notes drawn inside that row, for a collision whose other half a filter has hidden
   *  or separated. The band cannot join two rows that are not next to each other, and dropping the
   *  warning instead is not an option: the whole reason this screen exists is that a clash the
   *  designer does not see costs them a truck. */
  notes: Map<string, string[]>;
}

/**
 * Decide how each collision gets drawn against the rows that survived the filter.
 *
 * `collisionsIn` pairs events that are adjacent in the FULL chronological list, but this screen
 * shows one lane at a time — and a collision is specifically the kind of thing that crosses lanes
 * (a confirmed event and an unanswered proposal wanting the same chuppah on the same Thursday). So
 * a pair is only ever drawn as a joining band when both halves are visible AND consecutive inside
 * the same month group; otherwise it becomes a note on whichever half is on screen, naming the
 * other one so the designer can go and find it.
 */
export function planCollisions(
  groups: readonly MonthGroup[],
  collisions: readonly Collision[],
  allRows: readonly RunwayRow[],
): CollisionPlan {
  const bandBefore = new Map<string, string>();
  const notes = new Map<string, string[]>();

  // Adjacency is computed per GROUP, not across the whole visible list: a band drawn across a
  // sticky month header would have to be two bands, and two events either side of the 31st are
  // exactly the pair most likely to collide. They fall through to the note path instead.
  const adjacent = new Set<string>();
  const visibleIds = new Set<string>();
  for (const group of groups) {
    for (let i = 0; i < group.rows.length; i++) {
      visibleIds.add(group.rows[i].event.id);
      if (i > 0) adjacent.add(`${group.rows[i - 1].event.id}|${group.rows[i].event.id}`);
    }
  }

  for (const collision of collisions) {
    const [earlier, later] = collision.eventIds;
    if (adjacent.has(`${earlier}|${later}`)) {
      bandBefore.set(later, collision.message);
      continue;
    }
    const laterVisible = visibleIds.has(later);
    const earlierVisible = visibleIds.has(earlier);
    if (!laterVisible && !earlierVisible) continue;

    // One note, on one row — the later of the two when both are on screen, because that is the one
    // whose load-in is being squeezed by the other's breakdown.
    const on = laterVisible ? later : earlier;
    const otherId = on === later ? earlier : later;
    const other = allRows.find((r) => r.event.id === otherId);
    const message = other
      ? `${collision.message} — ${other.event.clientName}, ${rowDateLabel(other.event.date)}`
      : collision.message;
    notes.set(on, [...(notes.get(on) ?? []), message]);
  }

  return { bandBefore, notes };
}

// ── Misc ───────────────────────────────────────────────────────────────────────────────────────

/** Whether this browser has asked for less motion. Checked in JS because `scroll-behavior: auto`
 *  in the reduced-motion block of globals.css does NOT reach `scrollIntoView({ behavior: "smooth" })`
 *  — the option beats the stylesheet, so honouring the preference has to be done by hand. */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined" || !window.matchMedia) return "auto";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
