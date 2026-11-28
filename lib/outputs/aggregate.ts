// Pure aggregations over the design document (ADR-4): the packing list and the placement
// legend are just reductions. Both take an injected lookup so this file has no runtime
// dependency on the catalog/alias graph — which keeps the self-check runnable under node.
import type { DesignDocumentContent, DesignTable } from "@/lib/design-document/types";
import { measureTotals, type MeasureContext, type MeasureUnit } from "@/lib/design-document/measure";
import { numberedUnits } from "../design-document/groups";

export interface ItemInfo {
  productName: string;
  variantLabel: string; // "product · variant", or just the product name
  categoryId: string;
  categoryLabel: string;
  categoryOrder: number;
  priceUnit?: MeasureUnit; // what this item is counted in; absent = "unit"
  // Per-category multiplier (F-2.5): a chandelier with N arms yields N×qty candles/bulbs.
  armsMultiplier?: { label: string; count: number };
  /** What the multiplier is made of, per placed unit — a flower arrangement's "ורד ×12, פיאוני ×5"
   *  (Product.flowers). The counts sum to armsMultiplier.count; the list is what the florist is
   *  phoned with, so it is carried beside the total rather than folded into it. */
  components?: { label: string; count: number }[];
  /** The shade's own photo, else the product's — shown beside the item on the kit pages. */
  imageUrl?: string;
}

export type ItemLookup = (variantId: string) => ItemInfo | undefined;

export interface PackRow {
  variantId: string;
  label: string;
  /** What the crew has to bring: a count, or the metres/square metres to cut. */
  quantity: number;
  unit: MeasureUnit;
  derived?: { label: string; quantity: number };
  /** The derived quantity broken down by component — each already × quantity, like `derived`. */
  breakdown?: { label: string; quantity: number }[];
}

export interface PackGroup {
  categoryId: string;
  label: string;
  rows: PackRow[];
}

/** The group a table's chairs land in when the studio has no chair in its catalog to count them
 *  as — counted anyway, because a crew short of 240 chairs finds out at the door. */
export const UNTYPED_CHAIRS = "__untyped-chairs";

export function packingList(
  doc: DesignDocumentContent,
  lookup: ItemLookup,
  ctx?: MeasureContext,
  /** The chair round a table (lib/catalog/chairs.ts → chairOf). When given, every table's seats are
   *  packed as that chair — they never were: chairs were derived from the seat count on the plan
   *  and counted nowhere, so a 240-seat event packed none. Not part of measureTotals on purpose:
   *  the quote reads that too, and whether a studio bills the chairs (or the venue provides them)
   *  is a pricing question, not a packing one. */
  chairOf?: (table: DesignTable) => string | undefined,
): PackGroup[] {
  const measureCtx: MeasureContext = ctx ?? { unitOf: (id) => lookup(id)?.priceUnit ?? "unit" };
  const totals = measureTotals(doc, measureCtx);
  let untyped = 0;
  if (chairOf) {
    for (const t of doc.tables) {
      const seats = t.seats ?? 0;
      if (seats <= 0) continue;
      const chair = chairOf(t);
      if (chair && lookup(chair)) totals.set(chair, (totals.get(chair) ?? 0) + seats);
      else untyped += seats;
    }
  }

  const groups = new Map<string, PackGroup & { order: number }>();
  for (const [variantId, quantity] of totals) {
    const info = lookup(variantId);
    if (!info) continue;
    const row: PackRow = { variantId, label: info.variantLabel, quantity, unit: info.priceUnit ?? "unit" };
    if (info.armsMultiplier) {
      row.derived = { label: info.armsMultiplier.label, quantity: info.armsMultiplier.count * quantity };
      if (info.components?.length) {
        row.breakdown = info.components.map((c) => ({ label: c.label, quantity: c.count * quantity }));
      }
    }
    const g = groups.get(info.categoryId) ?? {
      categoryId: info.categoryId,
      label: info.categoryLabel,
      rows: [],
      order: info.categoryOrder,
    };
    g.rows.push(row);
    groups.set(info.categoryId, g);
  }

  if (untyped > 0) {
    groups.set(UNTYPED_CHAIRS, {
      categoryId: UNTYPED_CHAIRS,
      label: "כיסאות",
      rows: [{ variantId: UNTYPED_CHAIRS, label: "כיסאות — אין כיסא בקטלוג", quantity: untyped, unit: "unit" }],
      order: -1,
    });
  }
  return [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ categoryId, label, rows }) => ({
      categoryId,
      label,
      rows: rows.sort((a, b) => a.label.localeCompare(b.label, "he")),
    }));
}

export interface LegendEntry {
  tableNumbers: number[];
  items: string[];
}

// Group tables that carry the same set of table-layer items → the map's "שולחן ← ערכת עיצוב".
//
// Over NUMBERED UNITS, not over tables: four tables the designer pushed together are one table on
// this list, carrying one number and the dressing of all four between them. Walking doc.tables
// directly would print that number four times and send the crew looking for four table 4s.
export function placementLegend(
  doc: DesignDocumentContent,
  productName: (variantId: string) => string | undefined,
): LegendEntry[] {
  const itemsOn = (tableIds: string[]): string[] => {
    const ids = new Set(tableIds);
    const counts = new Map<string, number>();
    for (const p of doc.placements) {
      if (p.layer !== "table" || !p.tableId || !ids.has(p.tableId)) continue;
      const name = productName(p.variantId);
      if (name) counts.set(name, (counts.get(name) ?? 0) + p.quantity);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "he"))
      .map(([name, q]) => (q > 1 ? `${name} ×${q}` : name));
  };

  const bySignature = new Map<string, LegendEntry>();
  for (const unit of numberedUnits(doc)) {
    const items = itemsOn(unit.tableIds);
    const sig = items.join("|");
    const entry = bySignature.get(sig) ?? { tableNumbers: [], items };
    entry.tableNumbers.push(unit.number);
    bySignature.set(sig, entry);
  }

  return [...bySignature.values()]
    .map((e) => ({ ...e, tableNumbers: e.tableNumbers.sort((a, b) => a - b) }))
    .sort((a, b) => a.tableNumbers[0] - b.tableNumbers[0]);
}
