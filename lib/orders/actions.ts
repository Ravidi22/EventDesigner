"use server";
// Orders: a procurement group sent to a supplier, and the supplier's answer.
//
// Two tenants meet on one row, so this module has two halves with two scopes. The STUDIO half
// (sendOrder, fetchOrders, setOrderStatus) scopes by organization_id like every other module. The
// SUPPLIER half (fetchIncomingOrders, answerOrder) scopes by supplier_org_id — the one column in
// the schema that names another tenant on purpose — and only ever for the organisation signed in,
// so a supplier reads orders addressed to them and nothing else of the studio's: not its events,
// not its catalog, not what it pays anyone else.
//
// ⚠ COST SIDE. An order line carries the studio's unit cost, so this module is on the same side of
// the line as lib/suppliers/ — never imported by a client-facing surface (npm run check:costs).
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentActor } from "@/lib/db/org";
import { orderLines, orders, organizations, studioSettings, suppliers } from "@/lib/db/schema";
import { isOrderStatus, type IncomingOrder, type Order, type OrderLine, type OrderLineInput, type OrderStatus } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${field} must be a uuid`);
}
function assertDate(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) throw new Error(`${field} must be yyyy-mm-dd`);
}
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: string | null): number | undefined => (v === null ? undefined : Number(v));

function assertLines(value: unknown): asserts value is OrderLineInput[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("an order needs at least one line");
  if (value.length > 500) throw new Error("too many lines");
  for (const l of value as Partial<OrderLineInput>[]) {
    if (typeof l?.variantId !== "string" || !l.variantId) throw new Error("line.variantId is required");
    if (typeof l.description !== "string" || !l.description.trim()) throw new Error("line.description is required");
    if (typeof l.quantity !== "number" || !Number.isFinite(l.quantity) || l.quantity <= 0) throw new Error("line.quantity must be positive");
    if (typeof l.unitLabel !== "string") throw new Error("line.unitLabel is required");
    if (l.unitCost !== undefined && (typeof l.unitCost !== "number" || !Number.isFinite(l.unitCost) || l.unitCost < 0)) {
      throw new Error("line.unitCost must be a non-negative number");
    }
  }
}

type LineRow = typeof orderLines.$inferSelect;
function toLine(r: LineRow): OrderLine {
  return {
    id: r.id,
    variantId: r.variantId,
    description: r.description,
    quantity: Number(r.quantity),
    unitLabel: r.unitLabel,
    unitCost: num(r.unitCost),
  };
}

async function linesOf(orderIds: string[]): Promise<Map<string, OrderLine[]>> {
  const out = new Map<string, OrderLine[]>();
  if (orderIds.length === 0) return out;
  const rows = await db().select().from(orderLines).where(inArray(orderLines.orderId, orderIds)).orderBy(asc(orderLines.position));
  for (const r of rows) {
    const list = out.get(r.orderId) ?? [];
    list.push(toLine(r));
    out.set(r.orderId, list);
  }
  return out;
}

function costOf(lines: OrderLine[]): { cost: number; costPartial: boolean } {
  let cost = 0;
  let costPartial = false;
  for (const l of lines) {
    if (l.unitCost === undefined) costPartial = true;
    else cost = round2(cost + l.quantity * l.unitCost);
  }
  return { cost, costPartial };
}

// ── The studio's half ──────────────────────────────────────────────────────────────────────────

/** Every order this studio sent, newest first. */
export async function fetchOrders(): Promise<Order[]> {
  const { organizationId } = await currentActor();
  const rows = await db()
    .select({ order: orders, supplierName: suppliers.name })
    .from(orders)
    .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
    .where(eq(orders.organizationId, organizationId))
    .orderBy(desc(orders.sentAt))
    .limit(300);
  const lines = await linesOf(rows.map((r) => r.order.id));
  return rows.map(({ order: o, supplierName }) => {
    const ls = lines.get(o.id) ?? [];
    return {
      id: o.id,
      supplierId: o.supplierId,
      supplierName,
      linked: o.supplierOrgId !== null,
      windowFrom: o.windowFrom,
      windowTo: o.windowTo,
      status: o.status,
      note: o.note,
      reply: o.reply,
      sentAt: o.sentAt.toISOString(),
      answeredAt: o.answeredAt?.toISOString(),
      lines: ls,
      ...costOf(ls),
    };
  });
}

/**
 * Send a procurement group to its supplier.
 *
 * The lines are a SNAPSHOT: what the screen showed when the button was pressed, quantities as the
 * designer left them. A linked supplier sees it in their inbox the moment it is written; an
 * unlinked one gets it however the studio hands it over, and the studio marks it by hand.
 */
export async function sendOrder(input: {
  supplierId: string;
  windowFrom: string;
  windowTo: string;
  note?: string;
  lines: OrderLineInput[];
}): Promise<Order[]> {
  assertId(input?.supplierId, "supplierId");
  assertDate(input.windowFrom, "windowFrom");
  assertDate(input.windowTo, "windowTo");
  if (input.windowFrom > input.windowTo) throw new Error("windowFrom must not be after windowTo");
  assertLines(input.lines);
  const note = String(input.note ?? "").trim().slice(0, 2000);
  const { organizationId } = await currentActor();
  const database = db();

  const [supplier] = await database
    .select({ id: suppliers.id, linkedOrgId: suppliers.linkedOrgId })
    .from(suppliers)
    .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.organizationId, organizationId)))
    .limit(1);
  if (!supplier) throw new Error("supplier not found");

  await database.transaction(async (tx) => {
    const [row] = await tx
      .insert(orders)
      .values({
        organizationId,
        supplierId: supplier.id,
        supplierOrgId: supplier.linkedOrgId,
        windowFrom: input.windowFrom,
        windowTo: input.windowTo,
        note,
      })
      .returning({ id: orders.id });
    await tx.insert(orderLines).values(
      input.lines.map((l, i) => ({
        orderId: row.id,
        variantId: l.variantId,
        description: l.description.trim(),
        quantity: String(round2(l.quantity)),
        unitLabel: l.unitLabel,
        unitCost: l.unitCost === undefined ? null : String(l.unitCost),
        position: i,
      })),
    );
  });
  return fetchOrders();
}

/** The studio's own mark on an order — what it does for a supplier with no account, and the one
 *  way to close an order whose supplier never answered in-app. */
export async function setOrderStatus(id: string, status: OrderStatus): Promise<Order[]> {
  assertId(id, "id");
  if (!isOrderStatus(status)) throw new Error("bad status");
  const { organizationId } = await currentActor();
  await db()
    .update(orders)
    .set({ status, answeredAt: new Date() })
    .where(and(eq(orders.id, id), eq(orders.organizationId, organizationId)));
  return fetchOrders();
}

// ── The supplier's half ────────────────────────────────────────────────────────────────────────

/** Orders addressed to the signed-in SUPPLIER organisation, newest first. Refused for a studio. */
export async function fetchIncomingOrders(): Promise<IncomingOrder[]> {
  const actor = await currentActor();
  if (actor.organizationKind !== "supplier") throw new Error("only a supplier has an order inbox");
  const rows = await db()
    .select({ order: orders, studio: organizations.name, businessName: studioSettings.businessName, phone: studioSettings.phone })
    .from(orders)
    .innerJoin(organizations, eq(organizations.id, orders.organizationId))
    .leftJoin(studioSettings, eq(studioSettings.organizationId, orders.organizationId))
    .where(eq(orders.supplierOrgId, actor.organizationId))
    .orderBy(desc(orders.sentAt))
    .limit(300);
  const lines = await linesOf(rows.map((r) => r.order.id));
  return rows.map(({ order: o, studio, businessName, phone }) => ({
    id: o.id,
    studioName: businessName?.trim() || studio,
    studioPhone: phone?.trim() || undefined,
    windowFrom: o.windowFrom,
    windowTo: o.windowTo,
    status: o.status,
    note: o.note,
    reply: o.reply,
    sentAt: o.sentAt.toISOString(),
    answeredAt: o.answeredAt?.toISOString(),
    // The supplier sees the price they quoted, which is what the studio's cost IS for a marketplace
    // row. Nothing else of the studio's rides along.
    lines: lines.get(o.id) ?? [],
  }));
}

/** The supplier's answer. Scoped by supplier_org_id: an order not addressed to this organisation
 *  matches no row, whatever id was sent. */
export async function answerOrder(id: string, status: OrderStatus, reply?: string): Promise<IncomingOrder[]> {
  assertId(id, "id");
  if (!isOrderStatus(status) || status === "sent") throw new Error("bad status");
  const actor = await currentActor();
  if (actor.organizationKind !== "supplier") throw new Error("only a supplier answers an order");
  await db()
    .update(orders)
    .set({ status, reply: String(reply ?? "").trim().slice(0, 2000), answeredAt: new Date() })
    .where(and(eq(orders.id, id), eq(orders.supplierOrgId, actor.organizationId)));
  return fetchIncomingOrders();
}
