// Put the base library into one studio's catalog.
//
// A PLAIN MODULE, not a "use server" one, for the same reason lib/db/revalidate.ts and
// lib/google/sync.ts are: "give this organisation the standard tables" must not be a POST endpoint
// that takes an organisation id from whoever calls it. It is reached from exactly two places — the
// moment a studio is created (lib/auth/actions.ts) and the backfill script next door.
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { toProductRow } from "../db-mapping";
import { standardProductId } from "./id";
import { RETIRED_STANDARD_KEYS, STANDARD_ITEMS, standardProduct } from "./items";

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
export async function installStandardCatalog(organizationId: string, keys?: readonly string[]): Promise<number> {
  const items = keys ? STANDARD_ITEMS.filter((item) => keys.includes(item.key)) : STANDARD_ITEMS;
  if (items.length === 0) return 0;
  const rows = items.map((item) =>
    toProductRow(standardProduct(item, standardProductId(organizationId, item.key)), organizationId),
  );

  const inserted = await db()
    .insert(products)
    .values(rows)
    .onConflictDoNothing({ target: products.id })
    .returning({ id: products.id });

  return inserted.length;
}

/**
 * Overwrite the DRAWING of this studio's base items, and nothing else. Returns how many rows
 * changed.
 *
 * The install above never overwrites, on purpose: a studio may have renamed or priced its copy, and
 * a later release of the list must not undo that. But that same rule means a correction to how a
 * base item is DRAWN can never reach the rows already sitting in a catalog, and the drawing is the
 * one part of a base item that is the app's answer rather than the studio's — a 120x60 half round
 * is a half round in every studio in the country.
 *
 * So it is its own function, reached only through `npm run catalog:standard -- --redraw`, and it
 * touches exactly one column. ⚠ That column includes a custom outline: a studio that has reshaped
 * its copy of a base item in the drawer loses that reshaping here.
 */
export async function redrawStandardCatalog(organizationId: string): Promise<number> {
  let changed = 0;
  for (const item of STANDARD_ITEMS) {
    const id = standardProductId(organizationId, item.key);
    const rows = await db()
      .update(products)
      .set({ appearance: item.product.appearance ?? null, updatedAt: new Date() })
      // Scoped by organisation as well as id. The id is derived from the organisation, so the
      // second clause cannot fail — and ownership in this codebase is a WHERE clause, always.
      .where(and(eq(products.id, id), eq(products.organizationId, organizationId)))
      .returning({ id: products.id });
    changed += rows.length;
  }
  return changed;
}

/**
 * Archive this studio's copies of the base items the app no longer ships (RETIRED_STANDARD_KEYS).
 * Returns how many rows changed.
 *
 * ARCHIVED, never deleted: a design drawn with one still has to resolve it, and an archived product
 * does (Product.archived). One column, like the redraw — a studio that renamed or priced its copy
 * keeps both, and can un-archive it in the catalog if it still wants the thing. Opt-in for the same
 * reason the redraw is: it is the app changing rows the studio owns.
 */
export async function retireStandardCatalog(organizationId: string): Promise<number> {
  const ids = RETIRED_STANDARD_KEYS.map((key) => standardProductId(organizationId, key));
  if (ids.length === 0) return 0;
  const rows = await db()
    .update(products)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(inArray(products.id, ids), eq(products.organizationId, organizationId), eq(products.archived, false)))
    .returning({ id: products.id });
  return rows.length;
}
