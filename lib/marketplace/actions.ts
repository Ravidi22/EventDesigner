"use server";
// The marketplace: the ONE place in this codebase that reads another organisation's rows.
//
// Every other module scopes every statement by currentOrg() (ADR-2). This one reads products that
// belong to SUPPLIER organisations — and only those: `organizations.kind = 'supplier'` AND
// `visibility = 'public'` AND not archived, joined to the supplier's public profile and to nothing
// else. A studio's own public rows (the base library every studio carries) never cross; an event,
// a venue, a quote, an expense are never joined. `npm run check:marketplace` scans this folder for
// exactly those names and fails if one appears (lib/marketplace/boundary.ts).
//
// ADDING IS COPYING. A designer never places a supplier's row: `addToCatalog` copies it into the
// studio's own catalog with a new id, the supplier's price as the studio's COST, no client price
// yet, and the photo copied under the studio's own key prefix. Same rule as the base library
// (lib/catalog/standard/): a library seeds a catalog, it does not own it afterwards. The copy
// remembers where it came from (`sourceProductId`) so the drawer can say the supplier changed the
// price — and that is all the source ever does to it.
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentActor } from "@/lib/db/org";
import { revalidateCatalog } from "@/lib/db/revalidate";
import { organizations, productVariants, products, studioSettings, suppliers } from "@/lib/db/schema";
import { toProducts, toProductRow, toVariantRows } from "@/lib/catalog/db-mapping";
import type { Product } from "@/lib/catalog/types";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { knownFlowerOfProduct, type KnownFlower } from "@/lib/catalog/flowers";
import { STEM_CATEGORY_FALLBACK } from "@/lib/catalog/flower-spec";
import { copyFileInto } from "@/lib/files/copy";
import type { MarketItem, MarketShop, MarketSupplier, SourceStatus } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${field} must be a uuid`);
}

/** The rows the marketplace is made of. Published, live, a supplier's — the three conditions are
 *  written once, here, and every read below goes through them. */
const published = () =>
  and(eq(organizations.kind, "supplier"), eq(products.visibility, "public"), eq(products.archived, false));

/** The supplier's public profile: the name the organisation was opened under, and the phone, logo,
 *  Instagram and address from their settings — their letterhead. Nothing else of theirs. */
async function profilesOf(orgIds: string[]): Promise<Map<string, MarketSupplier>> {
  if (orgIds.length === 0) return new Map();
  const rows = await db()
    .select({
      orgId: organizations.id,
      name: organizations.name,
      businessName: studioSettings.businessName,
      phone: studioSettings.phone,
      logoUrl: studioSettings.logoUrl,
      instagram: studioSettings.instagram,
      address: studioSettings.address,
    })
    .from(organizations)
    .leftJoin(studioSettings, eq(studioSettings.organizationId, organizations.id))
    .where(inArray(organizations.id, orgIds));
  return new Map(
    rows.map((r) => [
      r.orgId,
      {
        orgId: r.orgId,
        name: r.businessName?.trim() || r.name,
        phone: r.phone?.trim() || undefined,
        logoUrl: r.logoUrl?.trim() || undefined,
        instagram: r.instagram?.trim().replace(/^@/, "") || undefined,
        address: r.address?.trim() || undefined,
      },
    ]),
  );
}

/** A supplier's row as the designer may see it: the price moved to the cost side, the supplier's
 *  own procurement fields (their supplier, their cost, their stock) dropped. */
function asMarketItem(p: Product, supplier: MarketSupplier, inCatalog?: string): MarketItem {
  const { unitPrice, supplierId: _s, costPrice: _c, stockQty: _q, orderUnit: _ou, orderFactor: _of, ...rest } = p;
  return {
    product: { ...rest, variants: p.variants.map(({ unitPrice: _vp, ...v }) => v) },
    wholesalePrice: unitPrice,
    supplier,
    inCatalog,
  };
}

/** Everything published by every supplier — or by one, `supplierOrgId` — with this studio's own
 *  copies marked. */
export async function fetchMarketplace(supplierOrgId?: string): Promise<MarketItem[]> {
  if (supplierOrgId !== undefined) assertId(supplierOrgId, "supplierOrgId");
  const actor = await currentActor();
  const database = db();

  const rows = await database
    .select({ product: products })
    .from(products)
    .innerJoin(organizations, eq(organizations.id, products.organizationId))
    .where(supplierOrgId ? and(published(), eq(products.organizationId, supplierOrgId)) : published());
  if (rows.length === 0) return [];
  const productRows = rows.map((r) => r.product);

  const [variantRows, mine, profiles] = await Promise.all([
    database
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.archived, false), inArray(productVariants.productId, productRows.map((r) => r.id)))),
    database
      .select({ id: products.id, sourceProductId: products.sourceProductId })
      .from(products)
      .where(and(eq(products.organizationId, actor.organizationId), isNotNull(products.sourceProductId), eq(products.archived, false))),
    profilesOf([...new Set(productRows.map((r) => r.organizationId))]),
  ]);
  const copyOf = new Map(mine.map((m) => [m.sourceProductId!, m.id]));

  return toProducts(productRows, variantRows)
    .map((p, i) => {
      const supplier = profiles.get(productRows[i].organizationId);
      return supplier ? asMarketItem(p, supplier, copyOf.get(p.id)) : null;
    })
    .filter((x): x is MarketItem => x !== null)
    .sort((a, b) => a.supplier.name.localeCompare(b.supplier.name, "he") || a.product.name.localeCompare(b.product.name, "he"));
}

/** The marketplace's first page: one shop front per supplier, digested from the same published
 *  rows `fetchMarketplace` reads. The rows themselves stay on the server — a supplier with 300
 *  stems sends three of them for its cover. */
export async function fetchMarketShops(): Promise<MarketShop[]> {
  const shops = new Map<string, { supplier: MarketSupplier; items: MarketItem[] }>();
  for (const item of await fetchMarketplace()) {
    const shop = shops.get(item.supplier.orgId) ?? { supplier: item.supplier, items: [] };
    shop.items.push(item);
    shops.set(item.supplier.orgId, shop);
  }
  return [...shops.values()].map(({ supplier, items }) => {
    const byCategory = new Map<string, number>();
    for (const i of items) byCategory.set(i.product.category, (byCategory.get(i.product.category) ?? 0) + 1);
    const photographed = items.filter((i) => i.product.imageUrl);
    return {
      supplier,
      count: items.length,
      categories: [...byCategory.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count),
      preview: [...photographed, ...items.filter((i) => !i.product.imageUrl)].slice(0, 3).map((i) => i.product),
      inCatalog: items.filter((i) => i.inCatalog).length,
      names: items.map((i) => i.product.name),
    };
  });
}

/**
 * Copy a published row into this studio's catalog.
 *
 * Returns the id of the copy — the existing one when the studio already has it, so a double click
 * never mints two. The supplier becomes a row in the studio's directory (linked to their
 * organisation) if they were not one already, and the copy points at it, so procurement groups
 * the item under them with nothing further to set.
 */
export async function addToCatalog(sourceProductId: string): Promise<{ productId: string } | { error: string }> {
  assertId(sourceProductId, "sourceProductId");
  const actor = await currentActor();
  if (actor.organizationKind !== "studio") return { error: "רק סטודיו יכול להוסיף פריטים לקטלוג שלו" };
  const organizationId = actor.organizationId;
  const database = db();

  const [existing] = await database
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.organizationId, organizationId), eq(products.sourceProductId, sourceProductId), eq(products.archived, false)))
    .limit(1);
  if (existing) return { productId: existing.id };

  const [row] = await database
    .select({ product: products })
    .from(products)
    .innerJoin(organizations, eq(organizations.id, products.organizationId))
    .where(and(eq(products.id, sourceProductId), published()))
    .limit(1);
  if (!row) return { error: "הפריט כבר לא מפורסם" };
  const source = row.product;
  const variantRows = await database
    .select()
    .from(productVariants)
    .where(and(eq(productVariants.productId, source.id), eq(productVariants.archived, false)));
  const [sourceProduct] = toProducts([source], variantRows);
  const profile = (await profilesOf([source.organizationId])).get(source.organizationId);
  if (!profile) return { error: "הספק לא נמצא" };

  // The supplier's row in THIS studio's directory — found by the link, else created.
  let [supplier] = await database
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.organizationId, organizationId), eq(suppliers.linkedOrgId, source.organizationId)))
    .limit(1);
  if (!supplier) {
    [supplier] = await database
      .insert(suppliers)
      .values({
        organizationId,
        name: profile.name,
        phone: profile.phone ?? null,
        supplies: profile.supplies ?? null,
        linkedOrgId: source.organizationId,
      })
      .returning({ id: suppliers.id });
  }

  // Photos come across under the studio's own prefix, or not at all — never as a pointer at the
  // supplier's object (lib/files/copy.ts). A copy that fails costs the picture, not the product.
  const image = await copyFileInto(source.imageUrl, organizationId, "product").catch(() => null);
  const variants = await Promise.all(
    sourceProduct.variants.map(async (v) => ({
      ...v,
      id: crypto.randomUUID(),
      unitPrice: undefined,
      imageUrl: (await copyFileInto(v.imageUrl, organizationId, "product").catch(() => null)) ?? undefined,
    })),
  );

  const { supplierId: _s, costPrice: _c, stockQty: _q, ...copyable } = sourceProduct;
  const copy: Product = {
    ...copyable,
    id: crypto.randomUUID(),
    imageUrl: image ?? undefined,
    // Their price is our cost. The client price is the designer's to type — a product with none
    // shows the catalog's own "חסר מחיר" state until they do.
    unitPrice: undefined,
    costPrice: sourceProduct.unitPrice,
    supplierId: supplier.id,
    // Bought from them, so the category's own default (a centrepiece is consumable, a chair is
    // owned) — the supplier's stock kind describes THEIR shelf, not ours.
    stockKind: CATEGORY_BY_ID[sourceProduct.category]?.defaultStock,
    visibility: undefined,
    archived: undefined,
    sourceProductId: source.id,
    sourceOrgId: source.organizationId,
    variants,
  };

  await database.transaction(async (tx) => {
    await tx.insert(products).values({ ...toProductRow(copy, organizationId), syncedAt: new Date() });
    const rows = toVariantRows(copy, organizationId);
    if (rows.length) await tx.insert(productVariants).values(rows);
  });
  revalidateCatalog();
  return { productId: copy.id };
}

/** What the drawer says under a copied row: the supplier's current price, whether it moved since
 *  the cost was taken, and whether the source is gone. */
export async function fetchSourceStatus(productId: string): Promise<SourceStatus | null> {
  assertId(productId, "productId");
  const { organizationId } = await currentActor();
  const database = db();
  const [mine] = await database
    .select({ sourceProductId: products.sourceProductId, syncedAt: products.syncedAt, costPrice: products.costPrice })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.organizationId, organizationId)))
    .limit(1);
  if (!mine?.sourceProductId) return null;

  const [src] = await database
    .select({
      unitPrice: products.unitPrice,
      updatedAt: products.updatedAt,
      archived: products.archived,
      visibility: products.visibility,
      orgId: products.organizationId,
    })
    .from(products)
    .innerJoin(organizations, eq(organizations.id, products.organizationId))
    .where(and(eq(products.id, mine.sourceProductId), eq(organizations.kind, "supplier")))
    .limit(1);
  if (!src) return { updated: false, gone: true, supplierName: "" };
  const profile = (await profilesOf([src.orgId])).get(src.orgId);
  const price = src.unitPrice === null ? undefined : Number(src.unitPrice);
  const mineCost = mine.costPrice === null ? undefined : Number(mine.costPrice);
  return {
    wholesalePrice: price,
    updated: price !== mineCost && (!mine.syncedAt || src.updatedAt > mine.syncedAt),
    gone: src.archived || src.visibility !== "public",
    supplierName: profile?.name ?? "",
  };
}

/** Take the supplier's current price as this row's cost. The one write the source ever causes,
 *  and it happens because the designer pressed the button. */
export async function acceptSourcePrice(productId: string): Promise<Product[]> {
  assertId(productId, "productId");
  const { organizationId } = await currentActor();
  const status = await fetchSourceStatus(productId);
  if (status && !status.gone) {
    await db()
      .update(products)
      .set({
        costPrice: status.wholesalePrice === undefined ? null : String(status.wholesalePrice),
        syncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, productId), eq(products.organizationId, organizationId)));
    revalidateCatalog();
  }
  const { fetchProducts } = await import("@/lib/catalog/actions");
  return fetchProducts();
}

/**
 * The stems the marketplace sells, as the drawer's flower rows offer them (KnownFlower,
 * lib/catalog/flowers.ts): name, what it draws as, its colour, the supplier's name. Published
 * supplier rows in the three stem categories and nothing else of theirs — the same `published()`
 * every read here goes through. For any studio account; a supplier filling its own spec rows sees
 * the other suppliers' stems too, which is the marketplace working as designed.
 */
export async function fetchMarketFlowers(): Promise<KnownFlower[]> {
  await currentActor();
  const database = db();
  const rows = await database
    .select({ product: products })
    .from(products)
    .innerJoin(organizations, eq(organizations.id, products.organizationId))
    .where(and(published(), inArray(products.category, Object.keys(STEM_CATEGORY_FALLBACK))));
  if (rows.length === 0) return [];
  const productRows = rows.map((r) => r.product);
  const [variantRows, profiles] = await Promise.all([
    database
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.archived, false), inArray(productVariants.productId, productRows.map((r) => r.id)))),
    profilesOf([...new Set(productRows.map((r) => r.organizationId))]),
  ]);
  return toProducts(productRows, variantRows)
    .map((p, i) => knownFlowerOfProduct(p, profiles.get(productRows[i].organizationId)?.name, STEM_CATEGORY_FALLBACK[p.category]))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
}
