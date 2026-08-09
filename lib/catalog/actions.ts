"use server";
// The catalog, in Postgres. This is the first storage seam to cross over, and it is the template
// for the rest.
//
// EVERY EXPORT HERE IS A PUBLIC POST ENDPOINT. Next's own docs are blunt about it: "Server
// Functions are reachable via direct POST requests, not just through your application's UI." So
// every function starts with currentOrg() and scopes every statement by it — not because there are
// two studios today, but because the day there are, the check has to already be in the query rather
// than in a code review. Nothing in this file trusts an id it was handed; ownership is a WHERE
// clause, always.
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentOrg } from "@/lib/db/org";
import { products, productVariants, designDocuments } from "@/lib/db/schema";
import type { Product } from "./types";
import { toProducts, toProductRow, toVariantRows } from "./db-mapping";

// ── Input guards ───────────────────────────────────────────────────────────────────────────────
//
// Every function below is reachable by a direct POST from anyone, with any body — the arguments are
// NOT guaranteed to be what the type signature claims. Without these, a request carrying no
// arguments at all reaches the query layer as `undefined` and throws a TypeError from somewhere
// deep inside; that is how it was found. These reject early and say what was wrong.
//
// Deliberately hand-written and shallow: enough to keep malformed input out of SQL and out of a
// stack trace, not a full schema validator. When the shapes grow past this, reach for a real one
// (zod) rather than extending this by hand.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new Error(`${field} must be a uuid`);
  }
}

function assertIdList(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  for (const id of value) assertId(id, `${field}[]`);
}

/** The fields a row cannot be built without. Everything else has a default or is nullable. */
function assertProduct(value: unknown): asserts value is Product {
  if (!value || typeof value !== "object") throw new Error("product must be an object");
  const p = value as Partial<Product>;
  assertId(p.id, "product.id");
  if (typeof p.name !== "string" || p.name.trim() === "") throw new Error("product.name is required");
  if (typeof p.category !== "string" || p.category === "") throw new Error("product.category is required");
  if (p.layer !== "table" && p.layer !== "floor" && p.layer !== "ceiling") {
    throw new Error("product.layer must be table | floor | ceiling");
  }
  if (!p.dimensions || typeof p.dimensions.heightMm !== "number") {
    throw new Error("product.dimensions.heightMm is required");
  }
  if (!Array.isArray(p.styleTags)) throw new Error("product.styleTags must be an array");
  if (!Array.isArray(p.variants)) throw new Error("product.variants must be an array");
  for (const v of p.variants) assertId(v?.id, "variant.id");
}

/** The whole catalog for this studio, archived items included — the caller filters.
 *
 *  Two queries and an in-memory join, rather than one query with a LEFT JOIN: a join would repeat
 *  every product row once per variant and make the driver hand back a result set several times the
 *  size, which then has to be de-duplicated anyway. At catalog scale both are instant; this one is
 *  simply less code and less garbage. */
export async function fetchProducts(): Promise<Product[]> {
  const organizationId = await currentOrg();
  const database = db();

  const rows = await database.select().from(products).where(eq(products.organizationId, organizationId));
  if (rows.length === 0) return [];

  const variantRows = await database
    .select()
    .from(productVariants)
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        inArray(
          productVariants.productId,
          rows.map((r) => r.id),
        ),
      ),
    );

  return toProducts(rows, variantRows);
}

/** Create or update one product and its variants, atomically.
 *
 *  The variants are replaced wholesale rather than diffed: the drawer edits the list as a unit, and
 *  a diff would have to guess whether a missing variant was deleted or simply not sent. Deleting
 *  and re-inserting inside ONE transaction means a reader never observes a product with no shades —
 *  and means a failure leaves the previous state intact rather than a half-applied edit. */
export async function saveProduct(product: Product): Promise<Product[]> {
  assertProduct(product);
  const organizationId = await currentOrg();
  const row = toProductRow(product, organizationId);
  const variantRows = toVariantRows(product, organizationId);

  await db().transaction(async (tx) => {
    await tx
      .insert(products)
      .values(row)
      .onConflictDoUpdate({
        target: products.id,
        // Scoped: an UPDATE that omitted this would let a crafted id edit another studio's row.
        setWhere: eq(products.organizationId, organizationId),
        set: { ...row, updatedAt: new Date() },
      });

    await tx
      .delete(productVariants)
      .where(
        and(
          eq(productVariants.productId, product.id),
          eq(productVariants.organizationId, organizationId),
        ),
      );
    if (variantRows.length) await tx.insert(productVariants).values(variantRows);
  });

  return fetchProducts();
}

/** F-4.5: is any of these variant ids placed in ANY design document of this studio?
 *
 *  ⚠ This is the one query that reaches INSIDE design_documents.content, which the schema notes say
 *  is otherwise only ever read and written whole. It is a containment test over the placements
 *  array, and it runs on a sequential scan today — correct, and fine at one document per event.
 *  The moment a studio has thousands of documents this wants a GIN index on `content`; it is not
 *  worth the write cost before then, and this is the query that would justify it. */
export async function isPlacedAnywhere(variantIds: string[]): Promise<boolean> {
  assertIdList(variantIds, "variantIds");
  if (variantIds.length === 0) return false;
  const organizationId = await currentOrg();

  // Bound one parameter per id (`in ($2, $3, …)`) rather than handing Postgres a JS array for
  // `= any(...)`: the driver serialises a bare array as a single scalar, which arrives as the
  // string "656136df-…" and fails with `malformed array literal`. sql.join keeps every id a
  // separate placeholder, so this is still fully parameterised — no interpolation into the text.
  const idList = sql.join(
    variantIds.map((v) => sql`${v}`),
    sql`, `,
  );

  const [hit] = await db()
    .select({ one: sql<number>`1` })
    .from(designDocuments)
    .where(
      and(
        eq(designDocuments.organizationId, organizationId),
        sql`exists (
          select 1
          from jsonb_array_elements(${designDocuments.content} -> 'placements') as placement
          where placement ->> 'variantId' in (${idList})
        )`,
      ),
    )
    .limit(1);

  return !!hit;
}

/** F-4.5: delete a product, or archive it when it is standing in someone's design.
 *
 *  A design document must never point at nothing, so anything already placed is hidden from the
 *  catalog instead of removed. Returns which of the two happened, so the screen can say so. */
export async function removeProduct(
  id: string,
): Promise<{ products: Product[]; archived: boolean }> {
  assertId(id, "id");
  const organizationId = await currentOrg();
  const database = db();

  const [row] = await database
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.organizationId, organizationId)))
    .limit(1);
  if (!row) return { products: await fetchProducts(), archived: false };

  const variantRows = await database
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.productId, id),
        eq(productVariants.organizationId, organizationId),
      ),
    );

  // The product's own id is a variant id too — it is what a placement references when a product has
  // no shades of its own.
  const placed = await isPlacedAnywhere([id, ...variantRows.map((v) => v.id)]);

  if (placed) {
    await database
      .update(products)
      .set({ archived: true, updatedAt: new Date() })
      .where(and(eq(products.id, id), eq(products.organizationId, organizationId)));
  } else {
    // Variants cascade from the product's own foreign key.
    await database
      .delete(products)
      .where(and(eq(products.id, id), eq(products.organizationId, organizationId)));
  }

  return { products: await fetchProducts(), archived: placed };
}

/** Bulk create, for the CSV import (F-4.4). One transaction: a half-imported file is worse than a
 *  rejected one, because the designer cannot tell which half landed. */
export async function importProducts(list: Product[]): Promise<Product[]> {
  if (!Array.isArray(list)) throw new Error("list must be an array");
  list.forEach(assertProduct);
  if (list.length === 0) return fetchProducts();
  const organizationId = await currentOrg();

  await db().transaction(async (tx) => {
    await tx.insert(products).values(list.map((p) => toProductRow(p, organizationId)));
    const variantRows = list.flatMap((p) => toVariantRows(p, organizationId));
    if (variantRows.length) await tx.insert(productVariants).values(variantRows);
  });

  return fetchProducts();
}
