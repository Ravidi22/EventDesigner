"use server";
// A venue's bookings, in Postgres: its own `events` rows, each with its `event_hosting` record
// (lib/hosting/types.ts), and the link to the designer working that evening (lib/event-links).
//
// Same rules as lib/events/actions.ts: every export is a public POST endpoint, so each starts with
// the venue guard and scopes every statement by the organisation; nothing trusts an id it was
// handed. A booking stands on a property THIS venue owns — a hall books its own rooms.
//
// The client's answer (confirmedAt / lostAt), the delete and the diary are NOT here: a booking is
// an event, and lib/events/actions.ts's confirmEvent / markEventLost / reopenEvent / deleteEvent
// already own those columns with the guarantees they need. This file writes the details.
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventHosting, eventZones, events, menuPackages, venues, zones } from "@/lib/db/schema";
import { revalidateBookings } from "@/lib/db/revalidate";
import type { EventSummary } from "@/lib/events/types";
import { toEvents, toEventRow, toEventZoneRows } from "@/lib/events/db-mapping";
import { businessName, venueSideLinks } from "@/lib/event-links/reads";
import { followBooking } from "@/lib/event-links/sync";
import type { VenueSideLink } from "@/lib/event-links/types";
import { requireVenueActor } from "./guard";
import { toHosting, toHostingRow } from "./db-mapping";
import type { EventHosting } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${field} must be a uuid`);
}

/** One evening at the venue: the event, its hosting details, and the designer link if any. */
export interface Booking {
  event: EventSummary;
  hosting: EventHosting;
  link: VenueSideLink | null;
}

async function bookingsOf(organizationId: string): Promise<Booking[]> {
  const database = db();
  const [rows, zoneRows, hostingRows] = await Promise.all([
    database.select().from(events).where(eq(events.organizationId, organizationId)).orderBy(desc(events.eventDate)),
    database
      .select()
      .from(eventZones)
      .where(inArray(eventZones.eventId, database.select({ id: events.id }).from(events).where(eq(events.organizationId, organizationId)))),
    database.select().from(eventHosting).where(eq(eventHosting.organizationId, organizationId)),
  ]);
  if (!rows.length) return [];
  const list = toEvents(rows, zoneRows);
  const hostingBy = new Map(hostingRows.map((h) => [h.eventId, h]));
  const links = await venueSideLinks(list.map((e) => e.id));
  return list.map((event) => ({ event, hosting: toHosting(hostingBy.get(event.id)), link: links.get(event.id) ?? null }));
}

/** Every evening this venue has on its books, newest date first. */
export async function fetchBookings(): Promise<Booking[]> {
  const actor = await requireVenueActor();
  return bookingsOf(actor.organizationId);
}

/** A venue this organisation OWNS, and zones on it. */
async function assertOwnRooms(organizationId: string, venueId: string | undefined, zoneIds: string[]): Promise<void> {
  if (!venueId) {
    if (zoneIds.length) throw new Error("zones were given without a venue");
    return;
  }
  assertId(venueId, "event.venueId");
  const [venue] = await db()
    .select({ id: venues.id })
    .from(venues)
    .where(and(eq(venues.id, venueId), eq(venues.organizationId, organizationId)))
    .limit(1);
  if (!venue) throw new Error("venue not found");
  if (!zoneIds.length) return;
  const unique = [...new Set(zoneIds)];
  for (const z of unique) assertId(z, "event.zoneIds[]");
  const found = await db().select({ id: zones.id }).from(zones).where(and(inArray(zones.id, unique), eq(zones.venueId, venueId)));
  if (found.length !== unique.length) throw new Error("zone not found on this venue");
}

/** Create or replace a booking — the event row, its rooms and its hosting details in ONE
 *  transaction — then carry the shared facts onto the linked designer's event (event-links/sync).
 *
 *  The client's answer is not written here (see the head of file): the stamps are kept as stored. */
export async function saveBooking(event: EventSummary, hosting: EventHosting): Promise<Booking[]> {
  const actor = await requireVenueActor(true);
  const organizationId = actor.organizationId;
  assertId(event?.id, "event.id");
  if (typeof event.clientName !== "string" || !event.clientName.trim()) throw new Error("event.clientName is required");
  if (event.date && !ISO_DATE.test(event.date)) throw new Error("event.date must be yyyy-mm-dd");
  const zoneIds = Array.isArray(event.zoneIds) ? event.zoneIds : [];
  await assertOwnRooms(organizationId, event.venueId, zoneIds);
  if (hosting?.packageId) {
    assertId(hosting.packageId, "hosting.packageId");
    const [own] = await db()
      .select({ id: menuPackages.id })
      .from(menuPackages)
      .where(and(eq(menuPackages.id, hosting.packageId), eq(menuPackages.organizationId, organizationId)))
      .limit(1);
    if (!own) throw new Error("package not found");
  }

  const row = toEventRow({ ...event, step: 0, createdAt: event.createdAt || Date.now() }, organizationId);
  const hostingRow = toHostingRow(event.id, organizationId, hosting);
  // Every column but the keys, for the update half of the upsert.
  const { eventId: _eventId, organizationId: _orgId, ...hostingSet } = hostingRow;
  void _eventId;
  void _orgId;
  await db().transaction(async (tx) => {
    await tx
      .insert(events)
      .values(row)
      .onConflictDoUpdate({
        target: events.id,
        setWhere: eq(events.organizationId, organizationId),
        set: {
          clientName: row.clientName,
          phone: row.phone,
          contactName: row.contactName,
          contact2Name: row.contact2Name,
          contact2Phone: row.contact2Phone,
          eventDate: row.eventDate,
          startTime: row.startTime,
          eventType: row.eventType,
          venueId: row.venueId,
          zonesLabel: row.zonesLabel,
          guests: row.guests,
          archived: row.archived,
        },
      });
    await tx.delete(eventZones).where(eq(eventZones.eventId, event.id));
    if (zoneIds.length) await tx.insert(eventZones).values(toEventZoneRows(event.id, zoneIds));
    await tx
      .insert(eventHosting)
      .values(hostingRow)
      .onConflictDoUpdate({
        target: eventHosting.eventId,
        setWhere: eq(eventHosting.organizationId, organizationId),
        set: hostingSet,
      });
  });

  await followBooking(event.id, (await businessName(organizationId)).name);
  revalidateBookings();
  return bookingsOf(organizationId);
}

/** Close the head count (or reopen it with null) — stamped now, and followed by the linked
 *  designer's event like any other save. */
export async function closeFinalCount(eventId: string, finalGuests: number | null): Promise<Booking[]> {
  const actor = await requireVenueActor(true);
  assertId(eventId, "eventId");
  const [own] = await db()
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.organizationId, actor.organizationId)))
    .limit(1);
  if (!own) throw new Error("event not found");
  const n = finalGuests === null ? null : Math.max(0, Math.round(Number(finalGuests)));
  if (n !== null && !Number.isFinite(n)) throw new Error("finalGuests must be a number");
  await db()
    .insert(eventHosting)
    .values({ eventId, organizationId: actor.organizationId, finalGuests: n, finalClosedAt: n === null ? null : new Date() })
    .onConflictDoUpdate({
      target: eventHosting.eventId,
      setWhere: eq(eventHosting.organizationId, actor.organizationId),
      set: { finalGuests: n, finalClosedAt: n === null ? null : new Date(), updatedAt: new Date() },
    });
  await followBooking(eventId, (await businessName(actor.organizationId)).name);
  revalidateBookings();
  return bookingsOf(actor.organizationId);
}
