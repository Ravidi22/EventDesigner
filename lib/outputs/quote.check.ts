// npm run check:quote — the self-check of ./quote.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { quoteGroups, quoteTotals, type QuoteLookup } from "./quote";

// ponytail: self-check for the money paths. Run: npm run check:quote
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
