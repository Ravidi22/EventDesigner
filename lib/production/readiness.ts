// Equipment readiness for ONE event — is what the drawing counts on actually going to be there?
//
// Pure, with the facts injected, exactly like runway.ts and procurement.ts: no database, no React,
// so the self-check at the bottom runs under plain node (`npm run check:readiness`).
//
// Procurement (lib/suppliers/procurement.ts) answers "what do I BUY this month" and reduces a window
// of events to one order. This answers the production question for one event on its own day:
//
//   OWNED items   — the studio's stock against everything standing on that day, this event AND the
//                   others beside it. A shortfall is a shortfall whoever is short.
//   SOURCED items — rented and consumable lines: is there an order out for them, and what did the
//                   supplier say. Matched by variant to the order lines whose window covers the day.
//
// Nothing here is typed by anyone: the demand is the drawing's, the stock is the catalog's, the
// orders are what was sent and what came back. And NO COST: this reaches the event drawer, which is
// an internal screen, but the shape is built without a price so that it never can carry one.
import { orderQuantity, type ProcurementItem } from "@/lib/suppliers/procurement";
import type { OrderStatus } from "@/lib/orders/types";
import { isMain } from "@/lib/self-check";

export interface OwnedLine {
  variantId: string;
  label: string;
  /** This event's demand, in placed units. */
  needed: number;
  /** Other events on the same day, in placed units. */
  elsewhere: number;
  /** How many the studio owns; absent = never counted (a real, different answer from zero). */
  stockQty?: number;
  /** (needed + elsewhere) − stockQty, only when a count exists and the day exceeds it. */
  shortfall?: number;
}

/** What an order says about a line. `none` = nothing was sent for it. */
export type SourcedState = "none" | "sent" | "confirmed" | "declined";

export interface SourcedLine {
  variantId: string;
  label: string;
  /** In ORDER units (stems, not arrangements). */
  needed: number;
  unitLabel: string;
  supplierName?: string;
  /** Order units already on an order whose window covers the day, declined ones excluded. */
  ordered: number;
  state: SourcedState;
}

export interface Readiness {
  owned: OwnedLine[];
  sourced: SourcedLine[];
  /** The counts the drawer's one line is built from. */
  summary: {
    ownedOk: number;
    ownedShort: number;
    ownedUncounted: number;
    sourcedCovered: number;
    sourcedOpen: number;
    sourcedMissing: number;
  };
}

/** A line of an order sent for the day, in order units. */
export interface OrderedLine {
  variantId: string;
  quantity: number;
  status: OrderStatus;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function unitLabelOf(item: ProcurementItem): string {
  if (item.orderUnit) return item.orderUnit;
  return item.unit === "unit" ? "יחידות" : item.unit === "m" ? "מטר" : 'מ"ר';
}

/** The state a set of orders leaves a line in: confirmed outranks sent; declined only when nothing
 *  else covers it. */
function stateOf(lines: OrderedLine[]): { ordered: number; state: SourcedState } {
  let ordered = 0;
  let confirmed = false;
  let sent = false;
  let declined = false;
  for (const l of lines) {
    if (l.status === "declined") {
      declined = true;
      continue;
    }
    ordered = round2(ordered + l.quantity);
    if (l.status === "sent") sent = true;
    else confirmed = true;
  }
  if (ordered === 0) return { ordered: 0, state: declined ? "declined" : "none" };
  return { ordered, state: confirmed && !sent ? "confirmed" : "sent" };
}

export function readiness(
  /** This event's demand — the packing list's rows, spares and derived consumables included. */
  mine: readonly { variantId: string; quantity: number }[],
  /** Every OTHER event on the same day, summed per variant. */
  elsewhere: ReadonlyMap<string, number>,
  lookup: (variantId: string) => ProcurementItem | undefined,
  /** Order lines whose window covers the day, by variant. */
  ordered: ReadonlyMap<string, OrderedLine[]>,
): Readiness {
  const owned: OwnedLine[] = [];
  const sourced: SourcedLine[] = [];

  for (const row of mine) {
    const item = lookup(row.variantId);
    if (!item) continue;
    if (item.stockKind === "owned") {
      const others = elsewhere.get(row.variantId) ?? 0;
      const onDay = round2(row.quantity + others);
      const shortfall = item.stockQty !== undefined && onDay > item.stockQty ? round2(onDay - item.stockQty) : undefined;
      owned.push({ variantId: row.variantId, label: item.label, needed: row.quantity, elsewhere: others, stockQty: item.stockQty, shortfall });
    } else {
      // The same units the order was sent in — factor and פחת included — or a 10% rate would read
      // as a line forever short by a tenth.
      const needed = orderQuantity(row.quantity, item);
      const { ordered: qty, state } = stateOf(ordered.get(row.variantId) ?? []);
      sourced.push({
        variantId: row.variantId,
        label: item.label,
        needed,
        unitLabel: unitLabelOf(item),
        supplierName: item.supplierName,
        ordered: qty,
        state,
      });
    }
  }

  // Shortfalls first, then the uncounted, then the covered — the list is read for what is wrong.
  owned.sort((a, b) => (b.shortfall ?? -1) - (a.shortfall ?? -1) || a.label.localeCompare(b.label, "he"));
  const rank: Record<SourcedState, number> = { declined: 0, none: 1, sent: 2, confirmed: 3 };
  sourced.sort((a, b) => rank[a.state] - rank[b.state] || a.label.localeCompare(b.label, "he"));

  return {
    owned,
    sourced,
    summary: {
      ownedOk: owned.filter((l) => l.stockQty !== undefined && l.shortfall === undefined).length,
      ownedShort: owned.filter((l) => l.shortfall !== undefined).length,
      ownedUncounted: owned.filter((l) => l.stockQty === undefined).length,
      sourcedCovered: sourced.filter((l) => l.state === "confirmed").length,
      sourcedOpen: sourced.filter((l) => l.state === "sent").length,
      sourcedMissing: sourced.filter((l) => l.state === "none" || l.state === "declined").length,
    },
  };
}

// ── Self-check ─────────────────────────────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`readiness: ${message}`);
}

if (isMain(import.meta.url)) {
  const items: Record<string, ProcurementItem> = {
    chair: { label: "כיסא", categoryLabel: "", stockKind: "owned", unit: "unit", stockQty: 100 },
    rug: { label: "שטיח", categoryLabel: "", stockKind: "owned", unit: "m2" },
    rose: { label: "ורד", categoryLabel: "", stockKind: "consumable", unit: "unit", orderUnit: "גבעולים", orderFactor: 7, supplierName: "בוקי" },
    tent: { label: "אוהל", categoryLabel: "", stockKind: "rented", unit: "unit" },
  };
  const lookup = (id: string) => items[id];

  const r = readiness(
    [
      { variantId: "chair", quantity: 80 },
      { variantId: "rug", quantity: 12 },
      { variantId: "rose", quantity: 10 },
      { variantId: "tent", quantity: 1 },
    ],
    new Map([["chair", 40]]),
    lookup,
    new Map([
      ["rose", [{ variantId: "rose", quantity: 70, status: "confirmed" }]],
      ["tent", [{ variantId: "tent", quantity: 1, status: "declined" }]],
    ]),
  );
  const chair = r.owned.find((l) => l.variantId === "chair")!;
  assert(chair.shortfall === 20, "80 here + 40 elsewhere against 100 owned is 20 short");
  const rug = r.owned.find((l) => l.variantId === "rug")!;
  assert(rug.stockQty === undefined && rug.shortfall === undefined, "an uncounted item claims no shortfall");
  assert(r.owned[0].variantId === "chair", "the shortfall is listed first");
  const rose = r.sourced.find((l) => l.variantId === "rose")!;
  assert(rose.needed === 70 && rose.unitLabel === "גבעולים", "consumables are counted in order units");
  assert(rose.state === "confirmed" && rose.ordered === 70, "a confirmed order covers it");
  const tent = r.sourced.find((l) => l.variantId === "tent")!;
  assert(tent.state === "declined" && tent.ordered === 0, "a declined order covers nothing");
  assert(r.sourced[0].variantId === "tent", "the refused line is listed first");
  assert(r.summary.ownedShort === 1 && r.summary.ownedUncounted === 1 && r.summary.ownedOk === 0, "owned counts");
  assert(r.summary.sourcedCovered === 1 && r.summary.sourcedMissing === 1 && r.summary.sourcedOpen === 0, "sourced counts");

  // A sent order is open; sent + confirmed is still open until every line is answered.
  const mixed = stateOf([
    { variantId: "x", quantity: 5, status: "sent" },
    { variantId: "x", quantity: 5, status: "confirmed" },
  ]);
  assert(mixed.state === "sent" && mixed.ordered === 10, "partly answered is still open");
  assert(stateOf([]).state === "none", "nothing sent is nothing");

  console.log("readiness: all checks passed");
}
