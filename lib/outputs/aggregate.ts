// Pure aggregations over the design document (ADR-4): the packing list and the placement
// legend are just reductions. Both take an injected lookup so this file has no runtime
// dependency on the catalog/alias graph — which keeps the self-check runnable under node.
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { measureTotals, type MeasureContext, type MeasureUnit } from "@/lib/design-document/measure";

export interface ItemInfo {
  productName: string;
  variantLabel: string; // "product · variant", or just the product name
  categoryId: string;
  categoryLabel: string;
  categoryOrder: number;
  priceUnit?: MeasureUnit; // what this item is counted in; absent = "unit"
  // Per-category multiplier (F-2.5): a chandelier with N arms yields N×qty candles/bulbs.
  armsMultiplier?: { label: string; count: number };
}

export type ItemLookup = (variantId: string) => ItemInfo | undefined;

export interface PackRow {
  variantId: string;
  label: string;
  /** What the crew has to bring: a count, or the metres/square metres to cut. */
  quantity: number;
  unit: MeasureUnit;
  derived?: { label: string; quantity: number };
}

export interface PackGroup {
  categoryId: string;
  label: string;
  rows: PackRow[];
}

export function packingList(doc: DesignDocumentContent, lookup: ItemLookup, ctx?: MeasureContext): PackGroup[] {
  const measureCtx: MeasureContext = ctx ?? { unitOf: (id) => lookup(id)?.priceUnit ?? "unit" };
  const totals = measureTotals(doc, measureCtx);

  const groups = new Map<string, PackGroup & { order: number }>();
  for (const [variantId, quantity] of totals) {
    const info = lookup(variantId);
    if (!info) continue;
    const row: PackRow = { variantId, label: info.variantLabel, quantity, unit: info.priceUnit ?? "unit" };
    if (info.armsMultiplier) {
      row.derived = { label: info.armsMultiplier.label, quantity: info.armsMultiplier.count * quantity };
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
export function placementLegend(
  doc: DesignDocumentContent,
  productName: (variantId: string) => string | undefined,
): LegendEntry[] {
  const itemsForTable = (tableId: string): string[] => {
    const counts = new Map<string, number>();
    for (const p of doc.placements) {
      if (p.layer !== "table" || p.tableId !== tableId) continue;
      const name = productName(p.variantId);
      if (name) counts.set(name, (counts.get(name) ?? 0) + p.quantity);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "he"))
      .map(([name, q]) => (q > 1 ? `${name} ×${q}` : name));
  };

  const bySignature = new Map<string, LegendEntry>();
  for (const t of doc.tables) {
    const items = itemsForTable(t.id);
    const sig = items.join("|");
    const entry = bySignature.get(sig) ?? { tableNumbers: [], items };
    entry.tableNumbers.push(t.number);
    bySignature.set(sig, entry);
  }

  return [...bySignature.values()]
    .map((e) => ({ ...e, tableNumbers: e.tableNumbers.sort((a, b) => a - b) }))
    .sort((a, b) => a.tableNumbers[0] - b.tableNumbers[0]);
}

if ((import.meta as { main?: boolean }).main) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const doc: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [
      { id: "t1", type: "עגול", number: 1, position: { x: 0, y: 0 }, rotation: 0 },
      { id: "t2", type: "עגול", number: 2, position: { x: 0, y: 0 }, rotation: 0 },
      { id: "t3", type: "עגול", number: 3, position: { x: 0, y: 0 }, rotation: 0 },
    ],
    placements: [
      { id: "p1", variantId: "cloth", layer: "table", quantity: 1, tableId: "t1", position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
      { id: "p2", variantId: "cloth", layer: "table", quantity: 1, tableId: "t2", position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
      { id: "p3", variantId: "chand", layer: "ceiling", quantity: 2, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    ],
  };
  const lookup: ItemLookup = (id) =>
    id === "cloth"
      ? { productName: "מפה", variantLabel: "מפה · זהב", categoryId: "cloths", categoryLabel: "מפות", categoryOrder: 0 }
      : { productName: "שנדליר", variantLabel: "שנדליר", categoryId: "chand", categoryLabel: "שנדליירים", categoryOrder: 1, armsMultiplier: { label: "נרות", count: 5 } };

  const pl = packingList(doc, lookup);
  assert(pl.length === 2, "two category groups");
  assert(pl[0].rows[0].quantity === 2, "cloth counted across two tables");
  assert(pl[1].rows[0].derived?.quantity === 10, "candles = 5 arms × 2 fixtures");

  const legend = placementLegend(doc, (id) => lookup(id)?.productName);
  const withCloth = legend.find((e) => e.items.length > 0)!;
  assert(withCloth.tableNumbers.join(",") === "1,2", "tables 1 & 2 grouped by same item");
  assert(legend.some((e) => e.items.length === 0 && e.tableNumbers.includes(3)), "empty table 3 in its own group");
  console.log("aggregate self-check passed");
}
