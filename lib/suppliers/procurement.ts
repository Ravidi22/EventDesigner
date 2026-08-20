// What to order, derived from the drawings — the fifth renderer over the design document.
//
// Pure, with an injected lookup, exactly like aggregate.ts and quote.ts: no catalog import at
// runtime, no database, no React, so the self-check at the bottom runs under plain node.
//
// ── THE ONE IDEA IN THIS FILE ──────────────────────────────────────────────────────────────────
//
// "How much do I use per month" is the wrong question for most of a designer's catalog, and asking
// it produces a confidently wrong number. One 30-metre carpet laid at four events in a month is
// 30 metres of ASSET, not 120 metres of purchasing — a monthly sum would tell a studio that owns one
// chuppah to go and buy four. So the reduction is chosen by what KIND of stock an item is
// (Product.stockKind), and the three kinds get three different questions:
//
//   consumable → SUM over the window. It is used up, so the total is the order.
//   owned      → PEAK CONCURRENT demand, against how many are owned. The question is never "how
//                many this month", it is "does the busiest single day exceed what I have".
//   rented     → NEITHER. A rental is brought in for one event and returned, so it is a list of
//                order lines — one per event, per date, per supplier — and summing across events
//                would describe a single enormous delivery that never happens.
//
// ── TWO THINGS THIS REFUSES TO GUESS ───────────────────────────────────────────────────────────
//
// Only events with an issued quote feed the order (`EventDemand.committed`). Everything earlier is
// totalled separately as `potential` and rendered greyed: a first meeting is not a reason to buy
// flowers, and an ordering screen that cannot tell the difference is one that will be ignored after
// the first wasted delivery.
//
// An event with no drawing contributes NOTHING, and that is counted and reported rather than
// silently absorbed (`coverage.undrawn`). A purchase forecast that quietly omits a third of the
// month is worse than no forecast, because it looks complete.
import { PRICE_UNIT_LABEL, type StockKind } from "@/lib/catalog/types";
import type { MeasureUnit } from "@/lib/design-document/measure";
import { isMain } from "../self-check";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** What procurement needs to know about one catalog item. */
export interface ProcurementItem {
  label: string; // "מפה · זהב"
  categoryLabel: string;
  stockKind: StockKind;
  supplierId?: string;
  supplierName?: string;
  /** What the PLAN measures this in — units, metres, m². */
  unit: MeasureUnit;
  /** What the SUPPLIER sells it in, when that differs ("גבעולים"). */
  orderUnit?: string;
  /** Order-units per placed unit — 7 stems per centrepiece. Absent = 1. */
  orderFactor?: number;
  /** Cost per ORDER unit, always. When there is no separate order unit the two coincide, so this
   *  stays one number with one meaning rather than a column that means something different
   *  depending on a neighbouring field. */
  costPrice?: number;
  /** How many the studio owns. Absent = "not counted", which is a real and different answer from
   *  zero: it makes the item show demand and claim no shortfall. */
  stockQty?: number;
}

export type ProcurementLookup = (variantId: string) => ProcurementItem | undefined;

/** One event's demand — the packing list, already including its spares. */
export interface EventDemand {
  eventId: string;
  label: string;
  /** ISO `yyyy-mm-dd`. Lexicographic order is chronological order, which is why the dates stay
   *  strings all the way through this file rather than becoming Dates and picking up a timezone. */
  date: string;
  /** Has an issued quote. Only these feed the order. */
  committed: boolean;
  /** Has a design document. A false here is what `coverage.undrawn` counts. */
  drawn: boolean;
  /** Measured against the venue's real wall graph. False means a drape fell back to its catalog
   *  width — the quantity is a floor, not a measurement, and the screen has to say so. */
  measured: boolean;
  rows: { variantId: string; quantity: number }[];
}

export interface OrderLine {
  variantId: string;
  label: string;
  /** In ORDER units — placed quantity × orderFactor. */
  quantity: number;
  unitLabel: string;
  /** quantity × costPrice, when a cost is known. */
  cost?: number;
}

export interface RentalLine extends OrderLine {
  eventId: string;
  eventLabel: string;
  date: string;
}

export interface SupplierGroup<L extends OrderLine = OrderLine> {
  /** Absent = items with no supplier set yet, and derived consumables (candles off a candlestick),
   *  which have no catalog row of their own to hang a supplier on. */
  supplierId?: string;
  supplierName: string;
  lines: L[];
  /** Sum of the lines whose cost is known. */
  cost: number;
  /** True when at least one line has no cost — the group total is a floor, and must not be
   *  presented as the price of the delivery. */
  partial: boolean;
}

export interface StockLine {
  variantId: string;
  label: string;
  /** The largest demand on any single day in the window, in PLACED units. */
  peak: number;
  peakDate: string;
  /** How many events share that peak day — what makes the number make sense at a glance. */
  peakEvents: number;
  unitLabel: string;
  stockQty?: number;
  /** peak − stockQty, only when a count exists and the peak exceeds it. */
  shortfall?: number;
}

export interface ProcurementReport {
  from: string;
  to: string;
  coverage: {
    /** Events in the window, whatever their state. */
    events: number;
    /** …of which have an issued quote and therefore feed the order. */
    committed: number;
    /** …of which have no drawing at all and therefore contribute nothing. */
    undrawn: number;
    /** …of which were counted rather than measured, for want of the venue's plan. */
    unmeasured: number;
  };
  order: SupplierGroup[];
  rentals: SupplierGroup<RentalLine>[];
  stock: StockLine[];
  /** Estimated spend on the committed events. */
  cost: number;
  costPartial: boolean;
  /** Events with no issued quote: what they would cost if every one of them closed. Shown so the
   *  exposure is visible, never added to the order. */
  potential: { events: number; cost: number };
}

const NO_SUPPLIER = "ללא ספק";

/** Order-units for a placed quantity. */
function orderQuantity(quantity: number, item: ProcurementItem): number {
  return round2(quantity * (item.orderFactor ?? 1));
}

function unitLabelOf(item: ProcurementItem): string {
  // An explicit order unit wins: the florist sells stems whatever the plan counts. Otherwise the
  // label follows the price unit, minus its leading preposition — "למטר" is how a PRICE reads, but
  // a quantity reads "14 מטר".
  if (item.orderUnit) return item.orderUnit;
  return item.unit === "unit" ? "יחידות" : item.unit === "m" ? "מטר" : 'מ"ר';
}

/** Collect lines into supplier groups, sorted by supplier then by label. */
function group<L extends OrderLine>(
  entries: { item: ProcurementItem; line: L }[],
): SupplierGroup<L>[] {
  const groups = new Map<string, SupplierGroup<L>>();
  for (const { item, line } of entries) {
    const key = item.supplierId ?? "";
    const g = groups.get(key) ?? {
      supplierId: item.supplierId,
      supplierName: item.supplierName ?? NO_SUPPLIER,
      lines: [] as L[],
      cost: 0,
      partial: false,
    };
    g.lines.push(line);
    if (line.cost === undefined) g.partial = true;
    else g.cost = round2(g.cost + line.cost);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, lines: g.lines.sort((a, b) => a.label.localeCompare(b.label, "he")) }))
    // Unsourced rows sink to the bottom: they are the ones needing a decision, not a phone call.
    .sort((a, b) =>
      a.supplierId === b.supplierId
        ? 0
        : !a.supplierId
          ? 1
          : !b.supplierId
            ? -1
            : a.supplierName.localeCompare(b.supplierName, "he"),
    );
}

export function procurementReport(
  demands: EventDemand[],
  lookup: ProcurementLookup,
  window: { from: string; to: string },
): ProcurementReport {
  const inWindow = demands.filter((d) => d.date >= window.from && d.date <= window.to);
  const committed = inWindow.filter((d) => d.committed);

  // ── consumables: one summed line per variant ─────────────────────────────────────────────────
  const consumed = new Map<string, number>();
  // ── rentals: one line per (event, variant) ───────────────────────────────────────────────────
  const rentalEntries: { item: ProcurementItem; line: RentalLine }[] = [];
  // ── owned: demand per variant per DATE, so the peak is a max over days ───────────────────────
  const perDay = new Map<string, Map<string, number>>(); // variantId → date → quantity
  const eventsOnDay = new Map<string, Set<string>>(); // date → eventIds

  for (const d of committed) {
    const day = eventsOnDay.get(d.date) ?? new Set<string>();
    day.add(d.eventId);
    eventsOnDay.set(d.date, day);

    for (const row of d.rows) {
      const item = lookup(row.variantId);
      if (!item) continue;
      if (item.stockKind === "consumable") {
        consumed.set(row.variantId, round2((consumed.get(row.variantId) ?? 0) + row.quantity));
      } else if (item.stockKind === "rented") {
        const quantity = orderQuantity(row.quantity, item);
        rentalEntries.push({
          item,
          line: {
            variantId: row.variantId,
            label: item.label,
            quantity,
            unitLabel: unitLabelOf(item),
            cost: item.costPrice === undefined ? undefined : round2(quantity * item.costPrice),
            eventId: d.eventId,
            eventLabel: d.label,
            date: d.date,
          },
        });
      } else {
        const byDate = perDay.get(row.variantId) ?? new Map<string, number>();
        byDate.set(d.date, round2((byDate.get(d.date) ?? 0) + row.quantity));
        perDay.set(row.variantId, byDate);
      }
    }
  }

  const orderEntries: { item: ProcurementItem; line: OrderLine }[] = [];
  for (const [variantId, placed] of consumed) {
    const item = lookup(variantId)!;
    const quantity = orderQuantity(placed, item);
    orderEntries.push({
      item,
      line: {
        variantId,
        label: item.label,
        quantity,
        unitLabel: unitLabelOf(item),
        cost: item.costPrice === undefined ? undefined : round2(quantity * item.costPrice),
      },
    });
  }

  // The peak is taken over CALENDAR DAYS, and turnaround is deliberately not modelled: whether a
  // carpet is back from Thursday's event in time for Friday's depends on load-out times this app
  // does not hold, and inventing them would make the shortfall a guess wearing a number's clothes.
  // Same-day overlap is the part that is certainly true.
  const stock: StockLine[] = [];
  for (const [variantId, byDate] of perDay) {
    const item = lookup(variantId)!;
    let peak = 0;
    let peakDate = "";
    for (const [date, quantity] of byDate) {
      if (quantity > peak) {
        peak = quantity;
        peakDate = date;
      }
    }
    const shortfall =
      item.stockQty !== undefined && peak > item.stockQty ? round2(peak - item.stockQty) : undefined;
    stock.push({
      variantId,
      label: item.label,
      peak,
      peakDate,
      peakEvents: eventsOnDay.get(peakDate)?.size ?? 0,
      unitLabel: unitLabelOf(item),
      stockQty: item.stockQty,
      shortfall,
    });
  }
  stock.sort((a, b) => (b.shortfall ?? -1) - (a.shortfall ?? -1) || a.label.localeCompare(b.label, "he"));

  const order = group(orderEntries);
  const rentals = group(rentalEntries);

  const cost = round2([...order, ...rentals].reduce((s, g) => s + g.cost, 0));
  const costPartial = [...order, ...rentals].some((g) => g.partial);

  // What the uncommitted half of the window would cost if it all closed.
  //
  // Consumables and rentals ONLY. An owned item is already paid for — counting a carpet the studio
  // has stood on for three years as money it is about to spend would make this number large,
  // meaningless, and worse than absent. What it is for is "if these all sign, what leaves the bank",
  // and for owned stock the answer is nothing (a shortfall is a different question, and the מלאי
  // section is where it is asked).
  let potentialCost = 0;
  for (const d of inWindow) {
    if (d.committed) continue;
    for (const row of d.rows) {
      const item = lookup(row.variantId);
      if (!item?.costPrice || item.stockKind === "owned") continue;
      potentialCost = round2(potentialCost + orderQuantity(row.quantity, item) * item.costPrice);
    }
  }

  return {
    from: window.from,
    to: window.to,
    coverage: {
      events: inWindow.length,
      committed: committed.length,
      undrawn: inWindow.filter((d) => !d.drawn).length,
      unmeasured: inWindow.filter((d) => d.drawn && !d.measured).length,
    },
    order,
    rentals,
    stock,
    cost,
    costPartial,
    potential: { events: inWindow.length - committed.length, cost: potentialCost },
  };
}

/** The price-unit label, re-exported so a screen rendering a cost field says "עלות למטר" with the
 *  same words the price field uses. */
export const costUnitLabel = (unit: MeasureUnit, orderUnit?: string): string =>
  orderUnit ? `ל${orderUnit}` : PRICE_UNIT_LABEL[unit];

// ponytail: self-check for the three reductions. Run:
//   node --experimental-strip-types lib/suppliers/procurement.ts
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };

  const ITEMS: Record<string, ProcurementItem> = {
    // A consumable bought in stems: 7 per centrepiece, ₪4 a stem.
    flowers: {
      label: "מרכז שולחן · לבן",
      categoryLabel: "מרכזי שולחן",
      stockKind: "consumable",
      supplierId: "s-flora",
      supplierName: "פלורה",
      unit: "unit",
      orderUnit: "גבעולים",
      orderFactor: 7,
      costPrice: 4,
    },
    // Owned, and the studio has counted 40 of them.
    chairs: {
      label: "כיסא נפוליאון",
      categoryLabel: "כיסאות",
      stockKind: "owned",
      unit: "unit",
      stockQty: 40,
      supplierId: "s-wood",
      supplierName: "עץ ועיצוב",
    },
    // Owned, never counted — must show demand and claim no shortfall.
    carpet: { label: "שטיח", categoryLabel: "שטיחים", stockKind: "owned", unit: "m2" },
    // Rented per event, priced per metre, no cost recorded yet.
    drape: {
      label: "וילון קטיפה",
      categoryLabel: "ווילונות",
      stockKind: "rented",
      supplierId: "s-fabric",
      supplierName: "בדי הצפון",
      unit: "m",
    },
  };
  const lookup: ProcurementLookup = (id) => ITEMS[id];

  const demands: EventDemand[] = [
    {
      eventId: "e1", label: "כהן", date: "2026-09-03", committed: true, drawn: true, measured: true,
      rows: [{ variantId: "flowers", quantity: 20 }, { variantId: "chairs", quantity: 30 }, { variantId: "drape", quantity: 14 }],
    },
    // Same DAY as e1 — this is what makes the chairs peak 55, not 30.
    {
      eventId: "e2", label: "לוי", date: "2026-09-03", committed: true, drawn: true, measured: true,
      rows: [{ variantId: "chairs", quantity: 25 }, { variantId: "carpet", quantity: 7.5 }],
    },
    // A different week: chairs again, but they are the SAME chairs — must not add to the peak.
    {
      eventId: "e3", label: "מזרחי", date: "2026-09-17", committed: true, drawn: true, measured: false,
      rows: [{ variantId: "chairs", quantity: 38 }, { variantId: "flowers", quantity: 10 }],
    },
    // No quote yet: must not reach the order, and must be counted as exposure — but only the
    // flowers. The chairs are already owned, so they are not money about to be spent.
    {
      eventId: "e4", label: "פרץ", date: "2026-09-20", committed: false, drawn: true, measured: true,
      rows: [{ variantId: "flowers", quantity: 100 }, { variantId: "chairs", quantity: 60 }],
    },
    // Booked, never drawn: contributes nothing and must be confessed.
    { eventId: "e5", label: "אזולאי", date: "2026-09-25", committed: true, drawn: false, measured: false, rows: [] },
    // Outside the window entirely.
    {
      eventId: "e6", label: "דהן", date: "2026-11-02", committed: true, drawn: true, measured: true,
      rows: [{ variantId: "flowers", quantity: 999 }],
    },
  ];

  const r = procurementReport(demands, lookup, { from: "2026-09-01", to: "2026-09-30" });

  assert(r.coverage.events === 5, "the November event is outside the window");
  assert(r.coverage.committed === 4, "four of the five have a quote");
  assert(r.coverage.undrawn === 1, "the undrawn event is counted, not absorbed");
  assert(r.coverage.unmeasured === 1, "…and so is the one measured off the catalog");

  // Consumables: (20 + 10) centrepieces × 7 stems = 210 stems. e4 is excluded — no quote.
  const flora = r.order.find((g) => g.supplierId === "s-flora")!;
  assert(flora.lines.length === 1, "one summed line per consumable variant");
  assert(flora.lines[0].quantity === 210, "20 + 10 centrepieces × 7 = 210 stems");
  assert(flora.lines[0].unitLabel === "גבעולים", "quantities read in the unit the supplier sells in");
  assert(flora.cost === 840 && !flora.partial, "210 × ₪4, and the total is complete");

  // Owned: the peak is the busiest DAY, never the monthly sum.
  const chairs = r.stock.find((s) => s.variantId === "chairs")!;
  assert(chairs.peak === 55, "30 + 25 on one day is the peak — not 93 across the month");
  assert(chairs.peakDate === "2026-09-03" && chairs.peakEvents === 2, "the peak names its day and how many events share it");
  assert(chairs.shortfall === 15, "55 needed against 40 owned");
  const carpet = r.stock.find((s) => s.variantId === "carpet")!;
  assert(carpet.peak === 7.5 && carpet.shortfall === undefined, "an uncounted item shows demand and claims no shortfall");
  assert(r.stock[0].variantId === "chairs", "shortfalls sort to the top");

  // Rentals: per event, never summed.
  const fabric = r.rentals.find((g) => g.supplierId === "s-fabric")!;
  assert(fabric.lines.length === 1 && fabric.lines[0].eventId === "e1", "a rental is an order line for one event");
  assert(fabric.lines[0].quantity === 14 && fabric.lines[0].unitLabel === "מטר", "14 metres of drape");
  assert(fabric.lines[0].cost === undefined && fabric.partial, "no cost recorded — flagged, never zeroed");

  assert(r.cost === 840, "the estimate counts only what has a cost");
  assert(r.costPartial, "…and says that it is a floor");

  // Exposure: e4's 100 centrepieces × 7 × ₪4 = 2,800, kept out of the order entirely.
  assert(r.potential.events === 1 && r.potential.cost === 2800, "uncommitted work is priced separately");
  assert(!r.order.some((g) => g.lines.some((l) => l.quantity === 700)), "…and never reaches the order");
  // e4's 60 chairs are owned and cost nothing to stand up again — if they were counted the figure
  // would be larger and meaningless. This is the assertion that keeps that true.
  assert(chairs.peak === 55, "an uncommitted event does not raise the owned peak either");

  // An item the catalog no longer resolves must be skipped, not crash the screen.
  const orphan = procurementReport(
    [{ eventId: "x", label: "x", date: "2026-09-05", committed: true, drawn: true, measured: true, rows: [{ variantId: "gone", quantity: 5 }] }],
    lookup,
    { from: "2026-09-01", to: "2026-09-30" },
  );
  assert(orphan.order.length === 0 && orphan.stock.length === 0, "an unresolvable variant is skipped");

  console.log("procurement self-check passed");
}
