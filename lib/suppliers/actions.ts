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
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentActor, currentOrg } from "@/lib/db/org";
import { events, expenses, issuedQuotes, productVariants, products, suppliers } from "@/lib/db/schema";
import { assertEventOwned } from "@/lib/events/ownership";
import { procurementReport, type ProcurementReport } from "./procurement";
import { assembleDemands } from "./demand";
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

/** Name who sells a catalog row — the "ללא ספק" group's one-click fix. `variantId` is whatever the
 *  procurement line carries: a variant's id, or the product's own id when it has no variants. */
export async function assignSupplier(variantId: string, supplierId: string | null): Promise<void> {
  assertId(variantId, "variantId");
  if (supplierId !== null) assertId(supplierId, "supplierId");
  const organizationId = await currentOrg();
  if (supplierId) await assertSupplierOwned(organizationId, supplierId);
  const database = db();
  const [variant] = await database
    .select({ productId: productVariants.productId })
    .from(productVariants)
    .where(and(eq(productVariants.id, variantId), eq(productVariants.organizationId, organizationId)))
    .limit(1);
  const productId = variant?.productId ?? variantId;
  await database
    .update(products)
    .set({ supplierId, updatedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.organizationId, organizationId)));
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
//
// The item index, the server-side measure context and the per-event demand assembly live in
// ./demand.ts, a plain module, so the production side can ask the same question of ONE event's
// day (lib/production/actions.ts) without a second copy of the reduction.

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

  const eventRows = await db()
    .select({
      id: events.id,
      clientName: events.clientName,
      eventDate: events.eventDate,
      venueId: events.venueId,
      confirmedAt: events.confirmedAt,
    })
    .from(events)
    .where(
      and(
        eq(events.organizationId, organizationId),
        eq(events.archived, false),
        // An event the client turned down is not potential spend — it is a closed file, and
        // totalling it as exposure would overstate the window it sits in forever.
        isNull(events.lostAt),
        gte(events.eventDate, from),
        lte(events.eventDate, to),
      ),
    );

  const { demands, lookup } = await assembleDemands(actor, eventRows);
  return procurementReport(demands, lookup, { from, to });
}
