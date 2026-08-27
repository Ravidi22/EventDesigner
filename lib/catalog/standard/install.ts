// Put the base library into one studio's catalog.
//
// A PLAIN MODULE, not a "use server" one, for the same reason lib/db/revalidate.ts and
// lib/google/sync.ts are: "give this organisation the standard tables" must not be a POST endpoint
// that takes an organisation id from whoever calls it. It is reached from exactly two places — the
// moment a studio is created (lib/auth/actions.ts) and the backfill script next door.
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { toProductRow } from "../db-mapping";
import { standardProductId } from "./id";
import { STANDARD_ITEMS, standardProduct } from "./items";

/**
 * Insert whatever this studio is missing. Returns how many rows were actually added.
 *
 * Idempotent by construction: the ids are derived from the organisation and the item key (./id.ts),
 * so a second run conflicts on every row it already wrote and changes nothing — no upsert, because
 * a studio that has renamed "עגול 180" to "עגול גדול" and priced it must not have that overwritten
 * by a later release of this list. The base library seeds a catalog; it does not own it afterwards.
 *
 * One statement, no transaction: a base item has no variants (see StandardItem), so there is no
 * second insert that a half-written first one could strand.
 *
 * It does NOT revalidate — at sign-up there is no screen yet, and the backfill runs outside Next
 * where there is no router cache to invalidate.
 */
export async function installStandardCatalog(organizationId: string): Promise<number> {
  const rows = STANDARD_ITEMS.map((item) =>
    toProductRow(standardProduct(item, standardProductId(organizationId, item.key)), organizationId),
  );

  const inserted = await db()
    .insert(products)
    .values(rows)
    .onConflictDoNothing({ target: products.id })
    .returning({ id: products.id });

  return inserted.length;
}
