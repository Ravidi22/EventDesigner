"use server";
// Venues, their wall graph and their zones, in Postgres.
//
// Same rules as the catalog's actions: every export is a public POST endpoint, so every one starts
// with currentOrg() and scopes every statement by it, and nothing trusts an id it was handed.
//
// WHAT IS *NOT* HERE: which venue you are currently looking at. That is a per-device UI preference,
// not studio data — it belongs in this browser, changes when you click the switcher, and would be
// actively wrong to share between a designer's laptop and their tablet mid-setup. It stays in
// lib/venues/storage.ts, which is now the only thing left in that file.
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentOrg } from "@/lib/db/org";
import { venues, zones, venueStructures } from "@/lib/db/schema";
import { emptyStructure, type VenueStructure } from "./structure";
import { emptyPlan, type Venue, type VenueGeometry } from "./types";
import type { Zone } from "./zone";
import { toVenue, toVenueRow, toZone, toZoneRow, toStructureRow } from "./db-mapping";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${field} must be a uuid`);
}

function assertName(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
}

/** Every venue this studio owns, oldest first — the switcher's order, and stable across reloads. */
export async function fetchVenues(): Promise<Venue[]> {
  const organizationId = await currentOrg();
  const rows = await db()
    .select()
    .from(venues)
    .where(eq(venues.organizationId, organizationId))
    .orderBy(asc(venues.createdAt));
  return rows.map(toVenue);
}

/** The plan editor's whole working set for one property: the wall graph and every zone on it.
 *
 *  One call rather than two, because the editor loads them together, holds them in one undo history
 *  together, and saves them together — a zone is a named region OF that graph, so fetching them
 *  apart invites a moment where one has loaded and the other has not. */
export async function fetchVenuePlan(
  venueId: string,
): Promise<{ structure: VenueStructure; zones: Zone[] }> {
  assertId(venueId, "venueId");
  const organizationId = await currentOrg();
  const database = db();

  const [structureRow] = await database
    .select()
    .from(venueStructures)
    .where(and(eq(venueStructures.venueId, venueId), eq(venueStructures.organizationId, organizationId)))
    .limit(1);

  const zoneRows = await database
    .select()
    .from(zones)
    .where(and(eq(zones.venueId, venueId), eq(zones.organizationId, organizationId)))
    .orderBy(asc(zones.createdAt));

  return {
    // A property nobody has drawn yet has no structure row at all — an empty graph, not an error.
    structure: (structureRow?.structure as VenueStructure) ?? emptyStructure(),
    zones: zoneRows.map(toZone),
  };
}

/** Everything eventPlan() needs to draw an event on its property (VenueGeometry): the walls, every
 *  zone on the plane, and the scale they are measured in. */
export async function fetchVenueGeometry(venueId: string | undefined): Promise<VenueGeometry> {
  // An event whose details step has not picked a venue yet is a normal state, not a bad request.
  if (!venueId) return { structure: emptyStructure(), zones: [], mmPerUnit: 1 };
  assertId(venueId, "venueId");
  const organizationId = await currentOrg();

  const [venueRow] = await db()
    .select({ plan: venues.plan })
    .from(venues)
    .where(and(eq(venues.id, venueId), eq(venues.organizationId, organizationId)))
    .limit(1);

  const { structure, zones: zoneList } = await fetchVenuePlan(venueId);
  return {
    structure,
    zones: zoneList,
    mmPerUnit: (venueRow?.plan as { mmPerUnit?: number } | undefined)?.mmPerUnit ?? 1,
  };
}

/** Save the plan editor's current state. Structure and zones move together, in ONE transaction.
 *
 *  Zones are replaced wholesale rather than diffed, and that is the only shape that can express an
 *  UNDO: stepping back over "I named that room" leaves the list simply SHORTER than what is stored,
 *  with no per-zone delete to derive from a snapshot. Deleting and re-inserting inside a transaction
 *  means a reader never sees a property with no zones, and a failure leaves the previous plan whole.
 *
 *  ⚠ Callers must debounce. The editor writes on every history entry — every wall dragged — and one
 *  request per mouse-up would be both slow and pointless. See the editor's autosave. */
export async function saveVenuePlan(
  venueId: string,
  structure: VenueStructure,
  zoneList: Zone[],
): Promise<void> {
  assertId(venueId, "venueId");
  if (!structure || typeof structure !== "object") throw new Error("structure must be an object");
  if (!Array.isArray(zoneList)) throw new Error("zones must be an array");
  for (const z of zoneList) {
    assertId(z?.id, "zone.id");
    if (z.venueId !== venueId) throw new Error("zone belongs to another venue");
  }
  const organizationId = await currentOrg();

  await db().transaction(async (tx) => {
    const row = toStructureRow(venueId, structure, organizationId);
    await tx
      .insert(venueStructures)
      .values(row)
      .onConflictDoUpdate({
        target: venueStructures.venueId,
        setWhere: eq(venueStructures.organizationId, organizationId),
        set: { structure: row.structure, updatedAt: row.updatedAt },
      });

    await tx
      .delete(zones)
      .where(and(eq(zones.venueId, venueId), eq(zones.organizationId, organizationId)));
    if (zoneList.length) {
      await tx.insert(zones).values(zoneList.map((z) => toZoneRow(z, organizationId)));
    }
  });
}

/** A new, unnamed property with an empty plan. Returns the full list plus the id to switch to. */
export async function createVenue(): Promise<{ venues: Venue[]; id: string }> {
  const organizationId = await currentOrg();
  const id = crypto.randomUUID();
  await db()
    .insert(venues)
    .values(toVenueRow({ id, name: "מתחם חדש", plan: emptyPlan() }, organizationId));
  return { venues: await fetchVenues(), id };
}

export async function renameVenue(id: string, name: string): Promise<Venue[]> {
  assertId(id, "id");
  assertName(name, "name");
  const organizationId = await currentOrg();
  await db()
    .update(venues)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(and(eq(venues.id, id), eq(venues.organizationId, organizationId)));
  return fetchVenues();
}

/** Persist a venue record itself — its name, logo, and the plan's calibration/underlay. */
export async function saveVenue(venue: Venue): Promise<Venue[]> {
  if (!venue || typeof venue !== "object") throw new Error("venue must be an object");
  assertId(venue.id, "venue.id");
  assertName(venue.name, "venue.name");
  const organizationId = await currentOrg();
  const row = toVenueRow(venue, organizationId);
  await db()
    .insert(venues)
    .values(row)
    .onConflictDoUpdate({
      target: venues.id,
      setWhere: eq(venues.organizationId, organizationId),
      set: { name: row.name, logoUrl: row.logoUrl, plan: row.plan, updatedAt: new Date() },
    });
  return fetchVenues();
}
