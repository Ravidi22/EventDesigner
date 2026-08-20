// Rows ↔ Product. Pure functions, no I/O, no directive — deliberately its own file, because a
// "use server" module may only export async functions, and these are neither async nor actions.
//
// The two shapes differ on purpose. The app wants ONE nested object per product (dimensions inside
// it, variants inside it) because that is what a drawer edits and what the canvas resolves. The
// database wants dimensions flat (so `height_mm NOT NULL` can enforce the phase-2 3D requirement,
// and so "everything over 2m" is a query) and variants in their own table (so a placement can carry
// a foreign key to the exact shade). This file is the whole of that translation.
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { products, productVariants } from "@/lib/db/schema";
import type { Product, Variant, PriceUnit, Visibility, StockKind } from "./types";
import type { Layer } from "@/lib/design-document/types";

export type ProductRow = InferSelectModel<typeof products>;
export type VariantRow = InferSelectModel<typeof productVariants>;
export type ProductInsert = InferInsertModel<typeof products>;
export type VariantInsert = InferInsertModel<typeof productVariants>;

/** Postgres `numeric` arrives as a string — it is arbitrary-precision, so the driver refuses to
 *  silently narrow it to a float. Money in this app is shekels with agorot, well inside what a
 *  double represents exactly, so the narrowing is safe here and has to be explicit. */
const toNumber = (v: string | null): number | undefined => (v === null ? undefined : Number(v));

/** The app treats "no value" as an absent key; the database treats it as NULL. */
const orUndefined = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

export function toVariant(row: VariantRow): Variant {
  return {
    id: row.id,
    name: row.name,
    swatch: orUndefined(row.swatch),
    imageUrl: orUndefined(row.imageUrl),
    unitPrice: toNumber(row.unitPrice),
    archived: row.archived || undefined,
  };
}

export function toProduct(row: ProductRow, variantRows: VariantRow[]): Product {
  return {
    id: row.id,
    name: row.name,
    imageUrl: orUndefined(row.imageUrl),
    category: row.category,
    layer: row.layer as Layer,
    dimensions: {
      diameterMm: orUndefined(row.diameterMm),
      widthMm: orUndefined(row.widthMm),
      depthMm: orUndefined(row.depthMm),
      heightMm: row.heightMm,
    },
    categoryFields: row.categoryFields,
    spec: orUndefined(row.spec),
    unitPrice: toNumber(row.unitPrice),
    // The column is NOT NULL DEFAULT 'unit', but the type says "absent = unit, which is every
    // ordinary countable product" — so they are the same value spelled two ways. Collapsing the
    // default back to undefined keeps the round-trip lossless: saving a product and reloading it
    // returns the object you saved, rather than one that has quietly grown a field.
    priceUnit: row.priceUnit === "unit" ? undefined : (row.priceUnit as PriceUnit),
    styleTags: row.styleTags,
    appearance: orUndefined(row.appearance),
    // Same collapse as priceUnit: the column defaults to 'private', the type says absent = private,
    // so they are one value spelled twice and the round-trip stays lossless.
    visibility: row.visibility === "private" ? undefined : (row.visibility as Visibility),
    supplierId: orUndefined(row.supplierId),
    costPrice: toNumber(row.costPrice),
    // Same collapse as priceUnit and visibility: the column is NOT NULL DEFAULT 'owned' and the
    // type says absent = owned, so they are one value spelled twice — folding the default back to
    // undefined is what keeps save → reload lossless.
    stockKind: row.stockKind === "owned" ? undefined : (row.stockKind as StockKind),
    stockQty: orUndefined(row.stockQty),
    orderUnit: orUndefined(row.orderUnit),
    orderFactor: toNumber(row.orderFactor),
    variants: variantRows
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(toVariant),
    archived: row.archived || undefined,
  };
}

/** Assemble many products from two flat result sets — one pass over the variants, so this stays
 *  O(n) rather than a find() per product (which is the N+1 that makes a 300-item catalog crawl). */
export function toProducts(rows: ProductRow[], variantRows: VariantRow[]): Product[] {
  const byProduct = new Map<string, VariantRow[]>();
  for (const v of variantRows) {
    const list = byProduct.get(v.productId);
    if (list) list.push(v);
    else byProduct.set(v.productId, [v]);
  }
  return rows.map((r) => toProduct(r, byProduct.get(r.id) ?? []));
}

/** Money going the other way: the driver wants a string for `numeric`, and passing a float here is
 *  how you get 1234.5600000000001 in a quote. */
const toNumeric = (v: number | undefined): string | null => (v === undefined ? null : String(v));

export function toProductRow(p: Product, organizationId: string): ProductInsert {
  return {
    id: p.id,
    organizationId,
    name: p.name,
    imageUrl: p.imageUrl ?? null,
    layer: p.layer,
    category: p.category,
    diameterMm: p.dimensions.diameterMm ?? null,
    widthMm: p.dimensions.widthMm ?? null,
    depthMm: p.dimensions.depthMm ?? null,
    heightMm: p.dimensions.heightMm,
    categoryFields: p.categoryFields,
    spec: p.spec ?? null,
    unitPrice: toNumeric(p.unitPrice),
    priceUnit: p.priceUnit ?? "unit",
    styleTags: p.styleTags,
    appearance: p.appearance ?? null,
    visibility: p.visibility ?? "private",
    archived: p.archived ?? false,
    supplierId: p.supplierId ?? null,
    costPrice: toNumeric(p.costPrice),
    stockKind: p.stockKind ?? "owned",
    stockQty: p.stockQty ?? null,
    orderUnit: p.orderUnit ?? null,
    orderFactor: toNumeric(p.orderFactor),
  };
}

/** `position` is assigned from array order — the designer's own ordering of the shades is the
 *  ordering, and the first one is what a drop onto the plan defaults to. */
export function toVariantRows(p: Product, organizationId: string): VariantInsert[] {
  return p.variants.map((v, i) => ({
    id: v.id,
    organizationId,
    productId: p.id,
    name: v.name,
    swatch: v.swatch ?? null,
    imageUrl: v.imageUrl ?? null,
    unitPrice: toNumeric(v.unitPrice),
    archived: v.archived ?? false,
    position: i,
  }));
}
