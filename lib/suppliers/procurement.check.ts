// npm run check:procurement — the self-check of ./procurement.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { procurementReport, type EventDemand, type ProcurementItem, type ProcurementLookup } from "./procurement";

// ponytail: self-check for the three reductions. Run:
//   node --experimental-strip-types lib/suppliers/procurement.ts
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

// פחת: a consumable with a rate orders that much over the count; a rental never does.
const spared = procurementReport(
  [{ eventId: "s", label: "s", date: "2026-09-05", committed: true, drawn: true, measured: true, rows: [{ variantId: "roses", quantity: 20 }, { variantId: "drape", quantity: 10 }] }],
  (id) => (id === "roses" ? { ...ITEMS.flowers, spareRate: 10 } : id === "drape" ? { ...ITEMS.drape, spareRate: 10 } : undefined),
  { from: "2026-09-01", to: "2026-09-30" },
);
const roses = spared.order[0].lines[0];
assert(roses.quantity === 154 && roses.spare?.units === 14 && roses.spare.rate === 10, "20 × 7 stems + 10% = 154, 14 of them spare");
assert(roses.cost === 616, "…and the spare is paid for");
assert(spared.rentals[0].lines[0].quantity === 10 && spared.rentals[0].lines[0].spare === undefined, "a rental takes no פחת");

// An item the catalog no longer resolves must be skipped, not crash the screen.
const orphan = procurementReport(
  [{ eventId: "x", label: "x", date: "2026-09-05", committed: true, drawn: true, measured: true, rows: [{ variantId: "gone", quantity: 5 }] }],
  lookup,
  { from: "2026-09-01", to: "2026-09-30" },
);
assert(orphan.order.length === 0 && orphan.stock.length === 0, "an unresolvable variant is skipped");

console.log("procurement self-check passed");
