// npm run check:quote-layout — the self-check of ./layout.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { QuoteSection, SectionLine } from "@/lib/outputs/quote-sections";
import { applyOrder, DEFAULT_LAYOUT, discountShown, extrasSection, layoutSignature, MAX_SECTION_PHOTOS, normalizeLayout, quoteFigures, quoteTitle, resolveSections } from "./layout";

// ponytail: self-check. Run: npm run check:quote-layout
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const line = (key: string, total: number, priced = true): SectionLine => ({
  key, variantId: key, productId: key, label: key, quantity: 1, priceUnit: "unit", unitPrice: priced ? total : undefined, lineTotal: priced ? total : 0, priced, categoryOrder: 0,
});
const sections: QuoteSection[] = [
  { key: "zone:c", kind: "zone", title: "עיצוב חופה", lines: [line("zone:c|arch", 10000)] },
  { key: "kit:a", kind: "kit", title: "עיצוב 18 שולחנות עגולים", lines: [line("kit:a|lamp", 30000), line("kit:a|x", 0, false)] },
  { key: "ceiling", kind: "ceiling", title: "עיצוב תקרה", lines: [line("ceiling|chand", 6000)] },
];

const plain = resolveSections(sections, DEFAULT_LAYOUT);
const f0 = quoteFigures(plain, DEFAULT_LAYOUT, { vatRate: 0.18, vatIncluded: true });
assert(f0.catalogSum === 46000 && f0.total === 46000, "no typed price → the catalog sum");
assert(f0.unpriced === 1, "the unpriced line is counted");

// The studio's own case: 85,000 including VAT, the chandeliers a gift.
const layout = normalizeLayout({ ...DEFAULT_LAYOUT, finalPrice: 40000, gifts: ["ceiling|chand"] });
const resolved = resolveSections(sections, layout);
assert(resolved.find((s) => s.key === "ceiling")!.lines[0].gift, "a gift stays listed");
assert(resolved.find((s) => s.key === "ceiling")!.subtotal === 0, "a gift is never charged");
const f = quoteFigures(resolved, layout, { vatRate: 0.18, vatIncluded: true });
assert(f.catalogSum === 40000 && f.total === 40000 && f.discount === 0, "gift off the list sum");
assert(f.vat === 6101.69 && f.net === 33898.31, `VAT inside a VAT-inclusive price: ${f.vat}`);
const ex = quoteFigures(resolved, { ...layout, finalPrice: 10000 }, { vatRate: 0.18, vatIncluded: false });
assert(ex.total === 11800 && ex.vat === 1800 && ex.discount === 30000, "VAT added on top when prices exclude it");

// Discount visibility.
const typed = { ...layout, finalPrice: 35000 };
const ft = quoteFigures(resolved, typed, { vatRate: 0.18, vatIncluded: true });
assert(!discountShown(typed, ft), "total-only hides the gap unless asked");
assert(discountShown({ ...typed, showDiscount: true }, ft), "…and shows it when asked");
assert(discountShown({ ...typed, priceMode: "sections" }, ft), "section prices always show what makes them add up");

// Hidden, titles, order.
const reordered = resolveSections(sections, normalizeLayout({ hidden: ["zone:c|arch"], titles: { "kit:a": "השולחנות" }, order: ["ceiling", "kit:a"] }));
assert(!reordered.some((s) => s.key === "zone:c"), "a section with every line hidden is gone");
assert(reordered[0].key === "ceiling" && reordered[1].title === "השולחנות", "the designer's order and title");
assert(applyOrder([{ key: "a" }, { key: "new" }, { key: "b" }], ["b", "a"]).map((x) => x.key).join() === "b,new,a", "an unmoved section keeps its slot");

// Garbage in, a layout out.
const junk = normalizeLayout({ priceMode: "free", finalPrice: -3, hidden: [1, "x", "x"], photos: { a: ["1", "2", "3", "4"] } });
assert(junk.priceMode === "total" && junk.finalPrice === null && junk.hidden.join() === "x", "junk normalised");
assert(junk.photos.a.length === MAX_SECTION_PHOTOS, "photos capped");
assert(quoteTitle("חתונה") === "הצעת מחיר לעיצוב חתונה" && quoteTitle() === "הצעת מחיר לעיצוב האירוע", "title");
const withExtras = normalizeLayout({ extras: [{ id: "a", label: "הובלה", price: 4800 }, { id: "b", label: " ", price: 9 }, { label: "no id", price: 1 }] });
assert(withExtras.extras.length === 2, "an extra without an id is dropped");
const ex2 = extrasSection(withExtras)!;
assert(ex2.lines.length === 1 && ex2.lines[0].lineTotal === 4800, "a blank extra is not shown");
const fx = quoteFigures(resolveSections([...sections, ex2], DEFAULT_LAYOUT), DEFAULT_LAYOUT, { vatRate: 0.18, vatIncluded: true });
assert(fx.catalogSum === 46000 + 4800, "extras are summed");
assert(normalizeLayout({}).sketch === true && normalizeLayout({ sketch: false }).sketch === false, "the sketch defaults on");
const one = normalizeLayout({ titles: { a: "1", b: "2" }, gifts: ["x", "y"], photos: { s: ["p2", "p1"] } });
const two = normalizeLayout({ photos: { s: ["p2", "p1"] }, gifts: ["y", "x"], titles: { b: "2", a: "1" } });
assert(layoutSignature(one) === layoutSignature(two), "key order (a jsonb round-trip) is not a change");
assert(layoutSignature(one) !== layoutSignature({ ...one, photos: { s: ["p1", "p2"] } }), "photo order is");

console.log("quote-layout self-check passed");
