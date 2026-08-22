// The fourth renderer over the design document (F-4.4): the packing list × a price column.
// Pure aggregation with an injected lookup, so this file has no runtime dependency on the
// catalog graph and the self-check runs under node (same shape as aggregate.ts).
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { measureTotals, type MeasureContext, type MeasureUnit } from "@/lib/design-document/measure";
import { isMain } from "../self-check";

export interface QuoteItemInfo {
  label: string;
  /** The catalog PRODUCT behind this variant. Not used to price anything — it is how the sheet
   *  finds the photographs of the item (GalleryImage.productId), which is what turns a table of
   *  rows into the document a client actually reads. */
  productId: string;
  categoryId: string;
  categoryLabel: string;
  categoryOrder: number;
  unitPrice?: number; // undefined = no price set on the product/variant
  priceUnit?: MeasureUnit; // what unitPrice is per; absent = "unit"
}

export type QuoteLookup = (variantId: string) => QuoteItemInfo | undefined;

export interface QuoteLine {
  variantId: string;
  productId: string;
  label: string;
  /** Billable amount: a count for ordinary items, metres or square metres for the ones drawn to
   *  fit (lib/design-document/measure.ts). The unit travels with it so the line can say so. */
  quantity: number;
  priceUnit: MeasureUnit;
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

/** A quote over the document. `ctx` measures the stretched items — hand it the venue plan and a
 *  drape bills the metres it actually covers; omit it and everything is counted, which is what a
 *  caller with no plan loaded can honestly say. */
export function quoteGroups(doc: DesignDocumentContent, lookup: QuoteLookup, ctx?: MeasureContext): QuoteGroup[] {
  const measureCtx: MeasureContext = ctx ?? { unitOf: (id) => lookup(id)?.priceUnit ?? "unit" };
  const totals = measureTotals(doc, measureCtx);

  const groups = new Map<string, QuoteGroup & { order: number }>();
  for (const [variantId, quantity] of totals) {
    const info = lookup(variantId);
    if (!info) continue;
    const priced = typeof info.unitPrice === "number";
    const lineTotal = round2((info.unitPrice ?? 0) * quantity);
    const line: QuoteLine = { variantId, productId: info.productId, label: info.label, quantity, priceUnit: info.priceUnit ?? "unit", unitPrice: info.unitPrice, lineTotal, priced };
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
if (isMain(import.meta.url)) {
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
      ? { label: "מפה · זהב", productId: "p-cloth", categoryId: "cloths", categoryLabel: "מפות", categoryOrder: 0, unitPrice: 50 }
      : id === "chair"
        ? { label: "כיסא", productId: "p-chair", categoryId: "chairs", categoryLabel: "כיסאות", categoryOrder: 1, unitPrice: 12.5 }
        : id === "noprice"
          ? { label: "פריט ללא מחיר", productId: "p-misc", categoryId: "misc", categoryLabel: "שונות", categoryOrder: 2 }
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
