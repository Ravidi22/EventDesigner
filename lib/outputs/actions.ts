"use server";
// The operational outputs' own state, in Postgres: packing-list spares (F-6.3) and the log of what
// was actually produced (F-6.4).
//
// Both were per-event localStorage keys. The spare mattered most: it is the number a designer adds
// on top of what the plan counts — "two extra cloths, one always goes back dirty" — and it lived on
// the one laptop it was typed into, which is the same as not being written down at all when the
// crew loads the van from another device.
//
// An export is now a ROW rather than a counter. The counter said what the next number was; a row
// says what was printed, when, and from which drawing — which is what makes a sheet in a crew's
// hands checkable against the current design instead of merely numbered.
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentOrg } from "@/lib/db/org";
import { events, exports, packingSpares } from "@/lib/db/schema";
import { assertEventOwned } from "@/lib/events/ownership";
import { sealDocument } from "@/lib/studio/actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${field} must be a uuid`);
}

/** Manual spare quantity per variant, added on top of what the design document counts. */
export type Spares = Record<string, number>;

/** What kind of sheet was produced. Mirrors the export_type enum, and the three views the outputs
 *  screen actually renders. */
export type ExportType = "placement_map" | "packing_list" | "quote";

const EXPORT_TYPES: ExportType[] = ["placement_map", "packing_list", "quote"];

/** A reserve is a whole number of things, and a big one is a typo rather than a plan. The ceiling
 *  is here for the same reason the document's is: this arrives over HTTP. */
const MAX_SPARE = 100_000;

export async function fetchSpares(eventId: string): Promise<Spares> {
  assertId(eventId, "eventId");
  const organizationId = await currentOrg();
  // packing_spares carries no organizationId of its own — it is a leaf of one event, and the join
  // is what scopes it. Reading it without this join would be reading every studio's reserves.
  const rows = await db()
    .select({ variantId: packingSpares.variantId, quantity: packingSpares.quantity })
    .from(packingSpares)
    .innerJoin(events, eq(events.id, packingSpares.eventId))
    .where(and(eq(packingSpares.eventId, eventId), eq(events.organizationId, organizationId)));

  const spares: Spares = {};
  for (const row of rows) spares[row.variantId] = row.quantity;
  return spares;
}

/**
 * Set one row's reserve. Returns the whole map, because the screen re-renders one.
 *
 * Zero is a DELETE, not a stored zero — an absent row and "0 spare" are the same fact, and keeping
 * both invites them to disagree. That was true of the localStorage version too.
 */
export async function saveSpare(
  eventId: string,
  variantId: string,
  quantity: number,
): Promise<Spares> {
  assertId(eventId, "eventId");
  // Not a foreign key, deliberately: for a product with no variants this is the PRODUCT's id, the
  // implicit default a drop lands on. See the note on the table in lib/db/schema.ts.
  assertId(variantId, "variantId");
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_SPARE) {
    throw new Error("quantity must be a whole number of items");
  }
  const organizationId = await currentOrg();
  await assertEventOwned(organizationId, eventId);

  if (quantity === 0) {
    await db()
      .delete(packingSpares)
      .where(and(eq(packingSpares.eventId, eventId), eq(packingSpares.variantId, variantId)));
  } else {
    await db()
      .insert(packingSpares)
      .values({ eventId, variantId, quantity })
      .onConflictDoUpdate({
        target: [packingSpares.eventId, packingSpares.variantId],
        set: { quantity },
      });
  }
  return fetchSpares(eventId);
}

/** The number the NEXT sheet will carry (F-6.4), so the screen can print it before it is recorded. */
export async function fetchNextExportNumber(eventId: string): Promise<number> {
  assertId(eventId, "eventId");
  const organizationId = await currentOrg();
  const [row] = await db()
    .select({ number: exports.number })
    .from(exports)
    .where(and(eq(exports.eventId, eventId), eq(exports.organizationId, organizationId)))
    .orderBy(desc(exports.number))
    .limit(1);
  return (row?.number ?? 0) + 1;
}

/**
 * Record that a sheet went out of the door, and seal the drawing it was made from.
 *
 * The seal is the point (F-6.4): a placement map in a crew's hands can be compared against the
 * event's current version, and the drawing it shows is still on disk to compare against — which a
 * running counter in a browser could never say.
 *
 * Returns the number printed on the sheet.
 */
export async function recordExport(eventId: string, type: ExportType): Promise<number> {
  assertId(eventId, "eventId");
  if (!EXPORT_TYPES.includes(type)) throw new Error("unknown export type");
  const organizationId = await currentOrg();
  await assertEventOwned(organizationId, eventId);

  const sealed = await sealDocument(eventId);

  // Two devices printing the same event in the same second both compute the same next number; the
  // unique index on (event_id, number) turns that into an error rather than two sheets numbered 4.
  // Retry rather than surface it: the second one is not wrong, it is just second.
  for (let attempt = 0; attempt < 3; attempt++) {
    const number = await fetchNextExportNumber(eventId);
    try {
      await db().insert(exports).values({
        organizationId,
        eventId,
        designDocumentId: sealed.id,
        type,
        number,
        documentVersion: sealed.version,
      });
      return number;
    } catch (error) {
      // 23505 = unique_violation. Anything else is not ours to swallow.
      if ((error as { code?: string }).code !== "23505") throw error;
    }
  }
  throw new Error("could not number this export");
}

/** Every sheet produced for an event, newest first — the history behind the version indicator. */
export async function fetchExports(eventId: string): Promise<
  { number: number; type: ExportType; documentVersion: number; createdAt: number }[]
> {
  assertId(eventId, "eventId");
  const organizationId = await currentOrg();
  const rows = await db()
    .select({
      number: exports.number,
      type: exports.type,
      documentVersion: exports.documentVersion,
      createdAt: exports.createdAt,
    })
    .from(exports)
    .where(and(eq(exports.eventId, eventId), eq(exports.organizationId, organizationId)))
    .orderBy(desc(exports.number));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime() }));
}
