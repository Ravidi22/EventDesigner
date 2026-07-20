// The fourth renderer over the design document (F-4.4): the packing list × a price column.
// Pure aggregation with an injected lookup, so this file has no runtime dependency on the
// catalog graph and the self-check runs under node (same shape as aggregate.ts).
import type { DesignDocumentContent } from "@/lib/design-document/types";

export interface QuoteItemInfo {
  label: string;
  categoryId: string;
  categoryLabel: string;
  categoryOrder: number;
  unitPrice?: number; // undefined = no price set on the product/variant
}

export type QuoteLookup = (variantId: string) => QuoteItemInfo | undefined;

export interface QuoteLine {
  variantId: string;
  label: string;
  quantity: number;
  unitPrice?: number;
  lineTotal: number;
  priced: boolean; // false when the item has no price — surfaced, never silently zeroed
}

export interface QuoteGroup {
  categoryId: string;
  label: string;
  lines: QuoteLine[];
  subtotal: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function quoteGroups(doc: DesignDocumentContent, lookup: QuoteLookup): QuoteGroup[] {
  const totals = new Map<string, number>();
  for (const p of doc.placements) totals.set(p.variantId, (totals.get(p.variantId) ?? 0) + p.quantity);

  const groups = new Map<string, QuoteGroup & { order: number }>();
  for (const [variantId, quantity] of totals) {
    const info = lookup(variantId);
    if (!info) continue;
    const priced = typeof info.unitPrice === "number";
    const lineTotal = round2((info.unitPrice ?? 0) * quantity);
    const line: QuoteLine = { variantId, label: info.label, quantity, unitPrice: info.unitPrice, lineTotal, priced };
    const g = groups.get(info.categoryId) ?? {
      categoryId: info.categoryId,
      label: info.categoryLabel,
      lines: [],
      subtotal: 0,
      order: info.categoryOrder,
    };
    g.lines.push(line);
    g.subtotal = round2(g.subtotal + lineTotal);
    groups.set(info.categoryId, g);
  }

  return [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ categoryId, label, lines, subtotal }) => ({
      categoryId,
      label,
      subtotal,
      lines: lines.sort((a, b) => a.label.localeCompare(b.label, "he")),
    }));
}

export type DiscountType = "amount" | "percent";

export interface QuoteTotals {
  subtotal: number;
  discount: number;
  afterDiscount: number;
  vat: number;
  total: number;
}

// F-4.4: subtotal → discount (amount or percent) → VAT → total. VAT default 18% (Israel).
export function quoteTotals(
  subtotal: number,
  opts: { discountType: DiscountType; discountValue: number; vatRate?: number },
): QuoteTotals {
  const vatRate = opts.vatRate ?? 0.18;
  const raw = opts.discountType === "percent" ? (subtotal * opts.discountValue) / 100 : opts.discountValue;
  const discount = round2(Math.min(Math.max(raw, 0), subtotal)); // never below zero, never past subtotal
  const afterDiscount = round2(subtotal - discount);
  const vat = round2(afterDiscount * vatRate);
  return { subtotal: round2(subtotal), discount, afterDiscount, vat, total: round2(afterDiscount + vat) };
}

// ponytail: self-check for the money paths. Run: node --experimental-strip-types lib/outputs/quote.ts
if ((import.meta as { main?: boolean }).main) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const doc: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [],
    placements: [
      { id: "p1", variantId: "cloth-gold", layer: "table", quantity: 2, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
      { id: "p2", variantId: "cloth-gold", layer: "table", quantity: 3, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
      { id: "p3", variantId: "chair", layer: "floor", quantity: 10, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
      { id: "p4", variantId: "noprice", layer: "floor", quantity: 4, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    ],
  };
  const lookup: QuoteLookup = (id) =>
    id === "cloth-gold"
      ? { label: "מפה · זהב", categoryId: "cloths", categoryLabel: "מפות", categoryOrder: 0, unitPrice: 50 }
      : id === "chair"
        ? { label: "כיסא", categoryId: "chairs", categoryLabel: "כיסאות", categoryOrder: 1, unitPrice: 12.5 }
        : id === "noprice"
          ? { label: "פריט ללא מחיר", categoryId: "misc", categoryLabel: "שונות", categoryOrder: 2 }
          : undefined;

  const groups = quoteGroups(doc, lookup);
  assert(groups.length === 3, "three category groups");
  assert(groups[0].lines[0].quantity === 5, "cloth summed across placements");
  assert(groups[0].subtotal === 250, "cloth subtotal = 5 × 50");
  assert(groups[1].subtotal === 125, "chairs subtotal = 10 × 12.5");
  assert(groups[2].lines[0].priced === false && groups[2].subtotal === 0, "unpriced item flagged, not zeroed silently");

  const subtotal = groups.reduce((s, g) => s + g.subtotal, 0);
  assert(subtotal === 375, "grand subtotal");

  const pct = quoteTotals(subtotal, { discountType: "percent", discountValue: 10, vatRate: 0.18 });
  assert(pct.discount === 37.5, "10% discount");
  assert(pct.afterDiscount === 337.5, "after discount");
  assert(pct.vat === 60.75, "18% VAT on discounted");
  assert(pct.total === 398.25, "total");

  const amt = quoteTotals(subtotal, { discountType: "amount", discountValue: 500, vatRate: 0.18 });
  assert(amt.discount === 375 && amt.afterDiscount === 0, "discount clamped to subtotal");

  console.log("quote self-check passed");
}
