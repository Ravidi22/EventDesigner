// Rows ↔ EventSummary. Pure, no I/O, no directive — its own file because a "use server" module may
// only export async functions.
//
// Two translations carry real risk and are the reason this file has comments at all: the date/time
// columns, which must never round-trip through a `Date`, and the zone list, which is a join table on
// one side and an ordered array on the other.
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { events, eventZones } from "@/lib/db/schema";
import type { EventSummary } from "./types";

export type EventRow = InferSelectModel<typeof events>;
export type EventZoneRow = InferSelectModel<typeof eventZones>;
export type EventInsert = InferInsertModel<typeof events>;
export type EventZoneInsert = InferInsertModel<typeof eventZones>;

/** The app treats "no value" as an absent key; the database treats it as NULL. */
const orUndefined = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

/** Postgres `time` is HH:MM:SS; the app writes and shows HH:mm (it comes from `<input type=time>`).
 *  Trimming rather than parsing, deliberately — see the note on dates below. */
const toClock = (v: string | null): string | undefined => (v ? v.slice(0, 5) : undefined);
const toTimeColumn = (v: string | undefined): string | null =>
  v ? (v.length === 5 ? `${v}:00` : v) : null;

export function toEvent(row: EventRow, zoneIds: string[]): EventSummary {
  return {
    id: row.id,
    clientName: row.clientName,
    phone: row.phone,
    contactName: orUndefined(row.contactName),
    contact2Name: orUndefined(row.contact2Name),
    contact2Phone: orUndefined(row.contact2Phone),
    // `date` is a Postgres `date` column and arrives as a plain "yyyy-mm-dd" string, which is
    // exactly what the app stores and what the date field reads and writes. Nothing here constructs
    // a Date, and nothing should: `new Date("2026-08-09")` is parsed as MIDNIGHT UTC, so formatting
    // it anywhere west of Greenwich prints the 8th. A wedding is a calendar day, not an instant, and
    // the string is already the right shape for it.
    date: row.eventDate ?? "", // "" = not set yet; every formatter in the app already reads it so
    time: toClock(row.startTime),
    venueId: orUndefined(row.venueId),
    zoneIds,
    zonesLabel: row.zonesLabel,
    guests: row.guests,
    step: row.step,
    // These two ARE instants — "when was the quote sent", "when was this record created" — and the
    // app carries instants as epoch milliseconds, because it sorts and compares them and never
    // formats them in another timezone.
    quoteSentAt: row.quoteSentAt?.getTime(),
    // The column is NOT NULL DEFAULT false while the type says `archived?: boolean`. Same collapse
    // as the catalog's: absent and false are one value spelled twice, so folding it back keeps the
    // round-trip lossless.
    archived: row.archived || undefined,
    createdAt: row.createdAt.getTime(),
  };
}

export function toEventRow(e: EventSummary, organizationId: string): EventInsert {
  return {
    id: e.id,
    organizationId,
    clientName: e.clientName,
    phone: e.phone,
    contactName: e.contactName ?? null,
    contact2Name: e.contact2Name ?? null,
    contact2Phone: e.contact2Phone ?? null,
    // `|| null` rather than `?? null`: the app's "not set yet" is the empty string, and "" is not a
    // date Postgres will accept.
    eventDate: e.date || null,
    startTime: toTimeColumn(e.time),
    venueId: e.venueId ?? null,
    zonesLabel: e.zonesLabel,
    guests: e.guests,
    step: e.step,
    quoteSentAt: e.quoteSentAt ? new Date(e.quoteSentAt) : null,
    archived: e.archived ?? false,
    createdAt: new Date(e.createdAt),
  };
}

/** The zones an event occupies, as rows. `position` is the array index because the ORDER is the
 *  designer's own — the first zone is the one they reached for first, and the quote's header prints
 *  them in that order. A join table without it would hand back whatever the planner chose. */
export function toEventZoneRows(eventId: string, zoneIds: string[]): EventZoneInsert[] {
  return zoneIds.map((zoneId, position) => ({ eventId, zoneId, position }));
}

/** Assemble many events from two flat result sets — one pass over the zone rows, so this stays O(n)
 *  rather than a filter() per event. */
export function toEvents(rows: EventRow[], zoneRows: EventZoneRow[]): EventSummary[] {
  const byEvent = new Map<string, EventZoneRow[]>();
  for (const z of zoneRows) {
    const list = byEvent.get(z.eventId);
    if (list) list.push(z);
    else byEvent.set(z.eventId, [z]);
  }
  return rows.map((r) =>
    toEvent(
      r,
      (byEvent.get(r.id) ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((z) => z.zoneId),
    ),
  );
}
