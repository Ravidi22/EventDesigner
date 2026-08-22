"use server";
// Events, in Postgres.
//
// Same rules as the catalog's and the venues' actions: every export is a public POST endpoint, so
// every one starts with currentOrg() and scopes every statement by it, and nothing trusts an id it
// was handed. Here that matters more than usual, because an event carries FOREIGN KEYS — a venue and
// its zones — and a foreign key checks that a row EXISTS, never that it belongs to you. Without the
// ownership check below, a caller could attach their event to another studio's property and the
// database would happily agree. assertPlacement() is that check.
//
// WHAT IS *NOT* HERE: which event you currently have open. Like the active venue, that is a
// per-device pointer — it belongs in this browser and stays in lib/events/storage.ts.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentOrg } from "@/lib/db/org";
import { events, eventZones, venues, zones } from "@/lib/db/schema";
import type { EventSummary } from "./types";
import { toEvent, toEvents, toEventRow, toEventZoneRows } from "./db-mapping";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${field} must be a uuid`);
}

function assertIdList(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  for (const v of value) assertId(v, `${field}[]`);
}

/** The event fields a caller may set. Everything else about a row — its id, its organisation, when
 *  it was created — is either fixed at creation or the server's to decide. */
export type EventPatch = Omit<Partial<EventSummary>, "id" | "createdAt">;

function assertEvent(value: unknown): asserts value is EventSummary {
  if (!value || typeof value !== "object") throw new Error("event must be an object");
  const e = value as Partial<EventSummary>;
  assertId(e.id, "event.id");
  if (typeof e.clientName !== "string" || e.clientName.trim() === "")
    throw new Error("event.clientName is required");
  assertIdList(e.zoneIds ?? [], "event.zoneIds");
  if (e.venueId !== undefined) assertId(e.venueId, "event.venueId");
  if (typeof e.createdAt !== "number") throw new Error("event.createdAt must be epoch ms");
}

/** A venue and zones this studio actually owns, and zones that are actually ON that venue.
 *
 *  Both halves matter. The first stops an event being attached to another studio's property; the
 *  second stops a plan being assembled out of rooms from two different sites, which the geometry
 *  layer has no way to draw and no way to report. */
async function assertPlacement(
  organizationId: string,
  venueId: string | undefined,
  zoneIds: string[],
): Promise<void> {
  if (!venueId) {
    if (zoneIds.length) throw new Error("zones were given without a venue");
    return;
  }
  const database = db();
  const [venue] = await database
    .select({ id: venues.id })
    .from(venues)
    .where(and(eq(venues.id, venueId), eq(venues.organizationId, organizationId)))
    .limit(1);
  if (!venue) throw new Error("venue not found");

  if (!zoneIds.length) return;
  const unique = [...new Set(zoneIds)];
  const found = await database
    .select({ id: zones.id })
    .from(zones)
    .where(
      and(
        inArray(zones.id, unique),
        eq(zones.venueId, venueId),
        eq(zones.organizationId, organizationId),
      ),
    );
  if (found.length !== unique.length) throw new Error("zone not found on this venue");
}

/** Every event this studio has, newest first — the order the dashboard and the Gantt both read in,
 *  and the order the list was in when it lived in this browser. */
export async function fetchEvents(): Promise<EventSummary[]> {
  const organizationId = await currentOrg();
  const database = db();
  const rows = await database
    .select()
    .from(events)
    .where(eq(events.organizationId, organizationId))
    .orderBy(desc(events.createdAt));
  if (!rows.length) return [];

  // One join-table read for the whole page rather than one per event: the N+1 that turns a season's
  // worth of events into a season's worth of round trips.
  const zoneRows = await database
    .select()
    .from(eventZones)
    .where(
      inArray(
        eventZones.eventId,
        rows.map((r) => r.id),
      ),
    );
  return toEvents(rows, zoneRows);
}

export async function fetchEvent(id: string): Promise<EventSummary | null> {
  assertId(id, "id");
  const organizationId = await currentOrg();
  const database = db();
  const [row] = await database
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  const zoneRows = await database.select().from(eventZones).where(eq(eventZones.eventId, id));
  return toEvent(
    row,
    zoneRows.sort((a, b) => a.position - b.position).map((z) => z.zoneId),
  );
}

/** The event a device currently has open, resolved against what exists.
 *
 *  The id comes from the browser (lib/events/storage.ts), so it can name an event that was archived
 *  on another device, or belonged to a studio this user has left — hence "resolved". Falling back to
 *  the newest event keeps the studio and outputs screens usable on a device that has never picked
 *  one; a studio with no events at all gets null, which those screens already render. */
export async function fetchActiveEvent(id: string | null): Promise<EventSummary | null> {
  if (id) {
    const found = await fetchEvent(id);
    if (found) return found;
  }
  const list = await fetchEvents();
  return list[0] ?? null;
}

/** Create or replace an event, with its zone list, in ONE transaction.
 *
 *  Zones are replaced wholesale for the same reason the venue plan's are: the details form hands
 *  back the selection it is holding, and a selection that got SHORTER cannot be expressed as a
 *  series of adds. Returns the whole list, because every caller re-renders one. */
export async function saveEvent(event: EventSummary): Promise<EventSummary[]> {
  assertEvent(event);
  const organizationId = await currentOrg();
  const zoneIds = event.zoneIds ?? [];
  await assertPlacement(organizationId, event.venueId, zoneIds);

  const row = toEventRow(event, organizationId);
  await db().transaction(async (tx) => {
    await tx
      .insert(events)
      .values(row)
      .onConflictDoUpdate({
        target: events.id,
        setWhere: eq(events.organizationId, organizationId),
        // createdAt is deliberately absent: re-saving an event must not move the day it was opened.
        set: {
          clientName: row.clientName,
          phone: row.phone,
          contactName: row.contactName,
          contact2Name: row.contact2Name,
          contact2Phone: row.contact2Phone,
          eventDate: row.eventDate,
          startTime: row.startTime,
          venueId: row.venueId,
          zonesLabel: row.zonesLabel,
          guests: row.guests,
          step: row.step,
          quoteSentAt: row.quoteSentAt,
          archived: row.archived,
        },
      });
    await tx.delete(eventZones).where(eq(eventZones.eventId, event.id));
    if (zoneIds.length) await tx.insert(eventZones).values(toEventZoneRows(event.id, zoneIds));
  });
  return fetchEvents();
}

/** Patch an event in place — a details edit, an archive, a quote stamp.
 *
 *  The fields are copied across ONE BY ONE rather than spread. `patch` arrives over HTTP from
 *  whoever chose to POST it, and spreading it into .set() would let a caller write any column in the
 *  table, including organization_id — which is the whole tenant boundary. */
export async function patchEvent(id: string, patch: EventPatch): Promise<EventSummary[]> {
  assertId(id, "id");
  if (!patch || typeof patch !== "object") throw new Error("patch must be an object");
  // No currentOrg() call of its own: fetchEvent scopes the read and saveEvent scopes the write, so
  // an event belonging to another studio is simply not found here.
  const current = await fetchEvent(id);
  if (!current) throw new Error("event not found");

  const next: EventSummary = { ...current, ...patch, id, createdAt: current.createdAt };
  if (patch.zoneIds !== undefined) assertIdList(patch.zoneIds, "patch.zoneIds");
  return saveEvent(next);
}

/** F-1.2: the meeting flow only ever moves the furthest-reached stage FORWARD; revisiting an earlier
 *  one never regresses it.
 *
 *  GREATEST in SQL rather than read-modify-write, so two devices in the same meeting — the laptop
 *  driving and the tablet the client is holding — cannot race one another back down a stage. */
export async function reachStep(id: string, step: number): Promise<EventSummary[]> {
  assertId(id, "id");
  if (!Number.isInteger(step) || step < 0) throw new Error("step must be a non-negative integer");
  const organizationId = await currentOrg();
  await db()
    .update(events)
    .set({ step: sql`greatest(${events.step}, ${step})` })
    .where(and(eq(events.id, id), eq(events.organizationId, organizationId)));
  return fetchEvents();
}
