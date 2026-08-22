"use server";
// Suppliers, expenses, and the procurement forecast — in Postgres.
//
// Same rules as every other action module: EVERY EXPORT HERE IS A PUBLIC POST ENDPOINT, so every
// one starts with currentOrg()/currentActor() and scopes every statement by it, and nothing trusts
// an id it was handed. An expense names an event and a supplier by id; a foreign key checks that a
// row EXISTS, never that it belongs to you, so both are verified against this studio before insert.
//
// ⚠ THIS MODULE IS THE STUDIO'S COST SIDE. `costPrice`, every expense, and the margin are internal:
// they must never reach /present, the client portal, a quote or a packing list. Nothing here is
// imported by any of those — `npm run check:costs` is what keeps that true as the app grows.
//
// The forecast is computed HERE rather than in the browser, unlike the packing list and the quote.
// Those two reduce ONE document the screen already has; this one reduces every document in a date
// window, which would mean shipping a month of drawings to the client to add up numbers. The pure
// reduction still lives in procurement.ts and still runs under node — this file only assembles its
// inputs.
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentActor, currentOrg } from "@/lib/db/org";
import {
  designDocuments,
  events,
  expenses,
  issuedQuotes,
  packingSpares,
  productVariants,
  products,
  suppliers,
  venueStructures,
} from "@/lib/db/schema";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import type { Product } from "@/lib/catalog/types";
import { toProducts } from "@/lib/catalog/db-mapping";
import { measureTotals, type MeasureContext, type MeasureUnit } from "@/lib/design-document/measure";
import { resolveFootprint, footprintBounds } from "@/lib/studio/footprint";
import { wallLengthMm as segmentLengthMm } from "@/lib/studio/geometry";
import { nodeMap, wallPoints, type VenueStructure } from "@/lib/venues/structure";
import { grantedVenueIds } from "@/lib/venues/granted";
import { assertEventOwned } from "@/lib/events/ownership";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import {
  procurementReport,
  type EventDemand,
  type ProcurementItem,
  type ProcurementReport,
} from "./procurement";
import { eventMargin, type EventMargin, type Expense, type Supplier, type SupplierSummary } from "./types";
import { toExpense, toExpenseRow, toSupplier, toSupplierRow } from "./db-mapping";

// ── Input guards ───────────────────────────────────────────────────────────────────────────────
// Shallow and hand-written, exactly like the catalog's: enough to keep malformed input out of SQL
// and out of a stack trace, not a schema validator.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${field} must be a uuid`);
}

function assertDate(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) throw new Error(`${field} must be yyyy-mm-dd`);
}

/** An amount is money, not a free number. Rejecting NaN/Infinity here is what stops a `numeric`
 *  column being handed the string "NaN" and the insert failing three layers down. */
const MAX_AMOUNT = 100_000_000;

function assertSupplier(value: unknown): asserts value is Supplier {
  if (!value || typeof value !== "object") throw new Error("supplier must be an object");
  const s = value as Partial<Supplier>;
  assertId(s.id, "supplier.id");
  if (typeof s.name !== "string" || s.name.trim() === "") throw new Error("supplier.name is required");
}

function assertExpense(value: unknown): asserts value is Expense {
  if (!value || typeof value !== "object") throw new Error("expense must be an object");
  const e = value as Partial<Expense>;
  assertId(e.id, "expense.id");
  assertId(e.supplierId, "expense.supplierId");
  if (e.eventId !== undefined) assertId(e.eventId, "expense.eventId");
  if (e.variantId !== undefined) assertId(e.variantId, "expense.variantId");
  assertDate(e.spentAt, "expense.spentAt");
  if (typeof e.amount !== "number" || !Number.isFinite(e.amount)) throw new Error("expense.amount must be a number");
  if (e.amount < 0 || e.amount > MAX_AMOUNT) throw new Error("expense.amount is out of range");
  if (typeof e.description !== "string") throw new Error("expense.description must be a string");
}

/** @throws when the supplier is not this studio's. The same hole assertEventOwned closes for
 *  events: an expense could otherwise be attached to another studio's supplier row. */
async function assertSupplierOwned(organizationId: string, supplierId: string): Promise<void> {
  const [row] = await db()
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new Error("supplier not found");
}

// ── Suppliers ──────────────────────────────────────────────────────────────────────────────────

/** Every supplier of this studio, with the two numbers its card shows.
 *
 *  Three aggregate queries rather than a card that fetches its own counts: a screen with twenty
 *  suppliers would otherwise fire forty-one requests, and the totals are two GROUP BYs. */
export async function fetchSuppliers(): Promise<SupplierSummary[]> {
  const organizationId = await currentOrg();
  const database = db();

  const rows = await database
    .select()
    .from(suppliers)
    .where(eq(suppliers.organizationId, organizationId))
    .orderBy(suppliers.name);
  if (rows.length === 0) return [];

  const productCounts = await database
    .select({ supplierId: products.supplierId, count: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.organizationId, organizationId), sql`${products.supplierId} is not null`))
    .groupBy(products.supplierId);

  const spend = await database
    .select({
      supplierId: expenses.supplierId,
      spent: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
      outstanding: sql<string>`coalesce(sum(${expenses.amount}) filter (where ${expenses.paid} = false), 0)`,
    })
    .from(expenses)
    .where(eq(expenses.organizationId, organizationId))
    .groupBy(expenses.supplierId);

  const byProduct = new Map(productCounts.map((r) => [r.supplierId, r.count]));
  const bySpend = new Map(spend.map((r) => [r.supplierId, r]));

  return rows.map((row) => {
    const s = bySpend.get(row.id);
    return {
      ...toSupplier(row),
      productCount: byProduct.get(row.id) ?? 0,
      spent: Number(s?.spent ?? 0),
      outstanding: Number(s?.outstanding ?? 0),
    };
  });
}

export async function saveSupplier(supplier: Supplier): Promise<SupplierSummary[]> {
  assertSupplier(supplier);
  const organizationId = await currentOrg();
  const row = toSupplierRow(supplier, organizationId);

  await db()
    .insert(suppliers)
    .values(row)
    .onConflictDoUpdate({
      target: suppliers.id,
      // Scoped: without this, a crafted id would edit another studio's supplier.
      setWhere: eq(suppliers.organizationId, organizationId),
      set: { ...row, updatedAt: new Date() },
    });

  return fetchSuppliers();
}

/** Delete a supplier, or archive it when anything still points at it.
 *
 *  Same shape as removeProduct, and for a stronger reason: `expenses.supplier_id` is ON DELETE
 *  RESTRICT, so a supplier with history CANNOT be deleted — the database would refuse and the
 *  screen would show a stack trace. Asking first turns that into an archive and a sentence. */
export async function removeSupplier(id: string): Promise<{ suppliers: SupplierSummary[]; archived: boolean }> {
  assertId(id, "id");
  const organizationId = await currentOrg();
  const database = db();

  const [spent] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(expenses)
    .where(and(eq(expenses.supplierId, id), eq(expenses.organizationId, organizationId)));
  const [sourced] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.supplierId, id), eq(products.organizationId, organizationId)));

  const referenced = (spent?.count ?? 0) > 0 || (sourced?.count ?? 0) > 0;

  if (referenced) {
    await database
      .update(suppliers)
      .set({ archived: true, updatedAt: new Date() })
      .where(and(eq(suppliers.id, id), eq(suppliers.organizationId, organizationId)));
  } else {
    await database
      .delete(suppliers)
      .where(and(eq(suppliers.id, id), eq(suppliers.organizationId, organizationId)));
  }

  return { suppliers: await fetchSuppliers(), archived: referenced };
}

// ── Expenses ───────────────────────────────────────────────────────────────────────────────────

/** The ledger, newest spend first.
 *
 *  Capped rather than paginated. A studio books a few hundred expenses a year, so the cap is a
 *  guard against a runaway payload and not a feature — the day it is reached is the day this wants
 *  a real window, and a silent truncation would be the wrong way to find that out, which is why the
 *  screen is told how many it got. */
const EXPENSE_LIMIT = 2000;

export async function fetchExpenses(): Promise<Expense[]> {
  const organizationId = await currentOrg();
  const rows = await db()
    .select()
    .from(expenses)
    .where(eq(expenses.organizationId, organizationId))
    .orderBy(desc(expenses.spentAt), desc(expenses.createdAt))
    .limit(EXPENSE_LIMIT);
  return rows.map(toExpense);
}

export async function saveExpense(expense: Expense): Promise<Expense[]> {
  assertExpense(expense);
  const organizationId = await currentOrg();
  await assertSupplierOwned(organizationId, expense.supplierId);
  if (expense.eventId) await assertEventOwned(organizationId, expense.eventId);

  const row = toExpenseRow(expense, organizationId);
  await db()
    .insert(expenses)
    .values(row)
    .onConflictDoUpdate({
      target: expenses.id,
      setWhere: eq(expenses.organizationId, organizationId),
      set: row,
    });

  return fetchExpenses();
}

export async function removeExpense(id: string): Promise<Expense[]> {
  assertId(id, "id");
  const organizationId = await currentOrg();
  await db()
    .delete(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.organizationId, organizationId)));
  return fetchExpenses();
}

/** What one event cost against what it was quoted — the whole point of letting an expense name an
 *  event (F-7.4's total, minus the money).
 *
 *  ⚠ INTERNAL. Never rendered for a client, on any surface. */
export async function fetchEventMargin(eventId: string): Promise<EventMargin> {
  assertId(eventId, "eventId");
  const organizationId = await currentOrg();
  await assertEventOwned(organizationId, eventId);
  const database = db();

  const [spent] = await database
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(and(eq(expenses.eventId, eventId), eq(expenses.organizationId, organizationId)));

  const [quote] = await database
    .select({ total: issuedQuotes.total })
    .from(issuedQuotes)
    .where(and(eq(issuedQuotes.eventId, eventId), eq(issuedQuotes.organizationId, organizationId)))
    .limit(1);

  return eventMargin(eventId, quote ? Number(quote.total) : undefined, Number(spent?.total ?? 0));
}

// ── The procurement forecast ───────────────────────────────────────────────────────────────────

/** The catalog, as the procurement reduction wants to see it — plus the derived consumables.
 *
 *  A 5-arm candlestick is an OWNED fixture that burns five candles per event (F-6.2, the packing
 *  list's `derived` row). The candle has no catalog row of its own, so it has no supplier and no
 *  cost — but leaving it out would mean the one screen whose job is "what do I need to buy" is
 *  silent about the most obviously consumable thing in the business. So it appears as a synthetic
 *  line under "ללא ספק", which is the honest state: a real quantity, an unanswered supplier.
 *
 *  The synthetic key is prefixed rather than a bare uuid so it can never collide with a variant id
 *  and can never be mistaken for one by anything downstream. */
const derivedKey = (variantId: string, field: string) => `derived:${variantId}:${field}`;

function buildItemIndex(
  catalog: Product[],
  supplierNames: Map<string, string>,
): Map<string, ProcurementItem> {
  const index = new Map<string, ProcurementItem>();

  for (const product of catalog) {
    const cat = CATEGORY_BY_ID[product.category];
    const categoryLabel = cat?.label ?? product.category;
    const base = {
      categoryLabel,
      stockKind: product.stockKind ?? ("owned" as const),
      supplierId: product.supplierId,
      supplierName: product.supplierId ? supplierNames.get(product.supplierId) : undefined,
      unit: (product.priceUnit ?? "unit") as MeasureUnit,
      orderUnit: product.orderUnit,
      orderFactor: product.orderFactor,
      costPrice: product.costPrice,
      stockQty: product.stockQty,
    };

    // A placement references a VARIANT, except when the product has none — then the product's own
    // id is the variant id (defaultVariantId). Both keys resolve, exactly as everywhere else.
    index.set(product.id, { ...base, label: product.name });
    for (const v of product.variants) {
      index.set(v.id, { ...base, label: `${product.name} · ${v.name}` });
    }

    // The derived consumable, if this category has a count multiplier with a stated yield.
    const field = cat?.fields.find((f) => f.suffix);
    const count = field ? Number(product.categoryFields?.[field.key] ?? 0) : 0;
    if (field?.suffix && count > 0) {
      for (const id of [product.id, ...product.variants.map((v) => v.id)]) {
        index.set(derivedKey(id, field.key), {
          label: `${field.suffix} · ${product.name}`,
          categoryLabel,
          stockKind: "consumable",
          unit: "unit",
          orderFactor: count,
        });
      }
    }
  }

  return index;
}

/** A MeasureContext built from product ROWS rather than the browser's primed catalog cache
 *  (lib/studio/catalog-resolver.ts is client-only). Same three questions, same fallbacks. */
function serverMeasureContext(byVariant: Map<string, Product>, structure?: VenueStructure): MeasureContext {
  const nodes = structure ? nodeMap(structure) : null;
  return {
    unitOf: (variantId) => (byVariant.get(variantId)?.priceUnit ?? "unit") as MeasureUnit,
    wallLengthMm:
      structure && nodes
        ? (wallId) => {
            const wall = structure.walls.find((w) => w.id === wallId);
            const pts = wall ? wallPoints(structure, wall, nodes) : null;
            return pts ? segmentLengthMm(pts.a, pts.b) : undefined;
          }
        : undefined,
    footprintMm: (variantId) => {
      const product = byVariant.get(variantId);
      if (!product) return undefined;
      const b = footprintBounds(resolveFootprint(product));
      return { widthMm: b.w, depthMm: b.h };
    },
  };
}

/**
 * What to order between two dates, and what it is expected to cost.
 *
 * Reads a month of the studio at once — events, their current drawings, their spares, the venue
 * plans those drawings were measured against, the catalog and the suppliers — and hands the pure
 * reduction one `EventDemand` per event.
 *
 * Venue access is honoured: a designer who cannot open a property does not get its wall graph, so
 * a drape at that venue falls back to its catalog width. That is a real, quiet mispricing, so the
 * events it happened to are COUNTED (`coverage.unmeasured`) and the screen says so.
 */
export async function fetchProcurement(from: string, to: string): Promise<ProcurementReport> {
  assertDate(from, "from");
  assertDate(to, "to");
  if (from > to) throw new Error("from must not be after to");

  const actor = await currentActor();
  const organizationId = actor.organizationId;
  const database = db();

  const eventRows = await database
    .select({
      id: events.id,
      clientName: events.clientName,
      eventDate: events.eventDate,
      venueId: events.venueId,
    })
    .from(events)
    .where(
      and(
        eq(events.organizationId, organizationId),
        eq(events.archived, false),
        gte(events.eventDate, from),
        lte(events.eventDate, to),
      ),
    );

  // The catalog is needed whether or not any event is drawn — an empty report still has to be a
  // valid one — but everything else can be skipped when the window is empty.
  const [productRows, variantRows, supplierRows] = await Promise.all([
    database.select().from(products).where(eq(products.organizationId, organizationId)),
    database.select().from(productVariants).where(eq(productVariants.organizationId, organizationId)),
    database.select().from(suppliers).where(eq(suppliers.organizationId, organizationId)),
  ]);
  const catalog = toProducts(productRows, variantRows);
  const supplierNames = new Map(supplierRows.map((s) => [s.id, s.name]));
  const itemIndex = buildItemIndex(catalog, supplierNames);
  const lookup = (variantId: string) => itemIndex.get(variantId);

  if (eventRows.length === 0) return procurementReport([], lookup, { from, to });

  const eventIds = eventRows.map((e) => e.id);

  // The CURRENT drawing per event — the highest version, which is the only one the studio is still
  // editing. DISTINCT ON does it in one query; fetching every version and picking in JS would ship
  // every sealed copy of every document in the window.
  const docRows = await database
    .selectDistinctOn([designDocuments.eventId], {
      eventId: designDocuments.eventId,
      content: designDocuments.content,
    })
    .from(designDocuments)
    .where(
      and(eq(designDocuments.organizationId, organizationId), inArray(designDocuments.eventId, eventIds)),
    )
    .orderBy(designDocuments.eventId, desc(designDocuments.version));

  const [quoteRows, spareRows] = await Promise.all([
    database
      .select({ eventId: issuedQuotes.eventId })
      .from(issuedQuotes)
      .where(and(eq(issuedQuotes.organizationId, organizationId), inArray(issuedQuotes.eventId, eventIds))),
    // packing_spares carries no organizationId — it is a leaf of one event, and the join is what
    // scopes it. Same reason as fetchSpares in lib/outputs/actions.ts.
    database
      .select({
        eventId: packingSpares.eventId,
        variantId: packingSpares.variantId,
        quantity: packingSpares.quantity,
      })
      .from(packingSpares)
      .innerJoin(events, eq(events.id, packingSpares.eventId))
      .where(and(inArray(packingSpares.eventId, eventIds), eq(events.organizationId, organizationId))),
  ]);

  // Wall graphs, for the venues this person may actually open.
  const allowed = await grantedVenueIds(actor);
  const wantedVenues = [...new Set(eventRows.map((e) => e.venueId).filter((v): v is string => !!v))].filter(
    (v) => allowed === null || allowed.includes(v),
  );
  const structureRows = wantedVenues.length
    ? await database
        .select({ venueId: venueStructures.venueId, structure: venueStructures.structure })
        .from(venueStructures)
        .where(
          and(
            eq(venueStructures.organizationId, organizationId),
            inArray(venueStructures.venueId, wantedVenues),
          ),
        )
    : [];

  const structureByVenue = new Map(structureRows.map((r) => [r.venueId, r.structure]));
  const docByEvent = new Map(docRows.map((r) => [r.eventId, r.content as DesignDocumentContent]));
  const committedEvents = new Set(quoteRows.map((r) => r.eventId));
  const sparesByEvent = new Map<string, { variantId: string; quantity: number }[]>();
  for (const s of spareRows) {
    const list = sparesByEvent.get(s.eventId) ?? [];
    list.push({ variantId: s.variantId, quantity: s.quantity });
    sparesByEvent.set(s.eventId, list);
  }

  const byVariant = new Map<string, Product>();
  for (const p of catalog) {
    byVariant.set(p.id, p);
    for (const v of p.variants) byVariant.set(v.id, p);
  }

  const demands: EventDemand[] = eventRows
    // An event with no date cannot be in a window; the SQL filter already excluded nulls, and this
    // narrows the type for the rest of the function.
    .filter((e): e is typeof e & { eventDate: string } => !!e.eventDate)
    .map((e) => {
      const doc = docByEvent.get(e.id);
      const structure = e.venueId ? structureByVenue.get(e.venueId) : undefined;
      const rows: { variantId: string; quantity: number }[] = [];

      if (doc) {
        const ctx = serverMeasureContext(byVariant, structure);
        const totals = measureTotals(doc, ctx);
        for (const [variantId, quantity] of totals) rows.push({ variantId, quantity });
      }

      // Spares are what the crew brings on top of the plan, and they get bought too.
      for (const spare of sparesByEvent.get(e.id) ?? []) {
        const existing = rows.find((r) => r.variantId === spare.variantId);
        if (existing) existing.quantity += spare.quantity;
        else rows.push({ variantId: spare.variantId, quantity: spare.quantity });
      }

      // Fan the count-multipliers out into their own consumable rows (candles off candlesticks).
      for (const row of [...rows]) {
        const product = byVariant.get(row.variantId);
        const field = product ? CATEGORY_BY_ID[product.category]?.fields.find((f) => f.suffix) : undefined;
        if (!field) continue;
        const key = derivedKey(row.variantId, field.key);
        if (itemIndex.has(key)) rows.push({ variantId: key, quantity: row.quantity });
      }

      // "Measured" only matters where something is measured rather than counted. An event with no
      // stretch items is fully measured whether or not its plan was reachable.
      const stretched = rows.some((r) => (byVariant.get(r.variantId)?.priceUnit ?? "unit") !== "unit");

      return {
        eventId: e.id,
        label: e.clientName,
        date: e.eventDate,
        committed: committedEvents.has(e.id),
        drawn: !!doc,
        measured: !stretched || !!structure,
        rows,
      };
    });

  return procurementReport(demands, lookup, { from, to });
}
