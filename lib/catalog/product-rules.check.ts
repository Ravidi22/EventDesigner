// npm run check:product-rules — the self-check of ./product-rules.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { type Product } from "./types";
import { AISLE_SIZE_MM } from "./aisle";
import { productProblem, sameDraft, shadeProblem, spareRateFor } from "./product-values";
import { recategorized } from "./product-rules";

// ponytail: self-check — of this file and of ./product-values.ts. Run: npm run check:product-rules
const assert = (ok: boolean, what: string) => {
  if (!ok) throw new Error("FAIL: " + what);
  console.log(`  ok   ${what}`);
};
const row = (over: Partial<Product>): Product => ({
  id: "row-1",
  name: "בר אובלי",
  category: "bars",
  layer: "floor",
  dimensions: { widthMm: 4000, depthMm: 2400, heightMm: 1100 },
  categoryFields: {},
  styleTags: [],
  variants: [],
  ...over,
});

// ── PR-2/PR-9: the numbers a row is stored with ──
assert(productProblem(row({})) === null, "an ordinary row has no problem");
assert(productProblem(row({ stockQty: 2.5 }))?.includes("שלם") === true, "a stock count of 2.5 is refused, in words");
assert(productProblem(row({ spareRate: 7.5 }))?.includes("אחוז שלם") === true && productProblem(row({ spareRate: 120 })) !== null, "…a פחת of 7.5% or 120% too");
assert(productProblem(row({ stockQty: 40, spareRate: 0 })) === null, "a whole count and a 0% פחת are fine");
assert(productProblem(row({ dimensions: { widthMm: -1800, depthMm: 900, heightMm: 750 } }))?.includes("הרוחב") === true, "a negative width is refused, by name");
assert(productProblem(row({ dimensions: { heightMm: Number.NaN } })) !== null && productProblem(row({ dimensions: { heightMm: 2e9 } })) !== null, "…a height that is no number, or a kilometre and more");
assert(productProblem(row({ dimensions: { heightMm: 0 } })) === null, "a row with no size but its (zero) height is fine — a cloth, a drape");
assert(productProblem(row({ unitPrice: -5 })) !== null && productProblem(row({ costPrice: Number.POSITIVE_INFINITY })) !== null, "a negative price or an infinite cost is refused");
assert(productProblem(row({ variants: [{ id: "v", name: "זהב", unitPrice: -1 }] }))?.includes("זהב") === true, "…a shade's price too, by the shade's name");

// ── PR-11: a shade with no name ──
assert(shadeProblem([{ id: "v", name: "", swatch: "#c9a227" }]) !== null, "a nameless shade with a colour is a problem, not a silent drop");
assert(shadeProblem([{ id: "v", name: " ", unitPrice: 40 }]) !== null, "…one with a price too");
assert(shadeProblem([{ id: "v", name: "" }, { id: "w", name: "שמנת", swatch: "#eee" }]) === null, "an empty row just added, and named shades, are fine");
assert(shadeProblem([{ id: "v", name: "", swatch: "#000", archived: true }]) === null, "an archived shade is kept as it is");

// ── PR-6: 0% פחת ──
assert(spareRateFor(0, 10) === 0, "0% on a category whose default is 10% is stored as 0 — not as the 10%");
assert(spareRateFor(10, 10) === undefined, "the category's own rate is stored as nothing (follows the category)");
assert(spareRateFor(7.5, 10) === 8 && spareRateFor(250, 10) === 100, "whole percent, 0–100");
assert(spareRateFor(0, undefined) === undefined && spareRateFor(5, undefined) === 5, "with no category rate, 0 is nothing");

// ── PR-3: re-filing a SAVED row ──
const bar = row({
  stockKind: "rented",
  supplierId: "s-1",
  appearance: { shape: "oval-ring", content: "none", ring: { bandMm: 600, gapMm: 1845, gapAt: "center" } },
  categoryFields: { hangHeightMm: 2800, seats: 8 },
});
const other = recategorized(bar, "other");
assert(other.category === "other" && other.appearance?.shape === "oval-ring" && other.appearance.ring?.gapMm === 1845, "a saved oval bar re-filed as אחר keeps its shape");
assert(other.stockKind === "rented" && other.supplierId === "s-1", "…stays rented from its supplier");
assert(other.layer === "floor" && other.dimensions.heightMm === 1100, "…keeps its layer and height");
assert(other.categoryFields.hangHeightMm === 2800 && other.categoryFields.seats === undefined, "…keeps the hang height אחר still asks, drops the seats it does not");
const table = row({ name: "שולחן עגול 180", category: "tables", layer: "floor", dimensions: { diameterMm: 1800, heightMm: 750 }, categoryFields: { seats: 12 }, appearance: { shape: "circle", content: "none" } });
const cloth = recategorized(table, "tablecloths");
assert(cloth.layer === "table" && cloth.categoryFields.seats === undefined && cloth.appearance?.shape === "circle", "a saved table re-filed as a cloth follows to the table layer (it was the seed), loses seats, stays round");
const hungFlowers = row({ category: "flower-arrangements", layer: "ceiling", stockKind: "consumable", categoryFields: { stems: 120, vessel: "jug", hangHeightMm: 2600 }, flowers: [{ id: "f", name: "ורד", qty: 120 }] });
const centre = recategorized(hungFlowers, "centerpieces");
assert(centre.layer === "ceiling" && centre.stockKind === "consumable", "a layer chosen by hand stays; a stock kind that was the seed follows (consumable → consumable)");
assert(centre.categoryFields.vessel === "jug" && centre.categoryFields.stems === undefined && centre.flowers === undefined, "…the vessel stays where the new category takes one; the stems and spec go");
const vase = recategorized(hungFlowers, "vases");
assert(vase.stockKind === undefined, "…and to a category whose seed is owned, a seeded stock kind follows (stored as absent = owned)");
assert(recategorized(table, "chairs").categoryFields.seats === undefined && recategorized(table, "tables").categoryFields.seats === 12, "seats are kept only where they are asked");

// …and a NEW row still follows the pick, whole.
const fresh = row({ id: "", category: "tables", layer: "floor", dimensions: { heightMm: 750 }, appearance: { shape: "rect", content: "none" } });
const chair = recategorized(fresh, "chairs");
assert(chair.dimensions.heightMm === 0 && chair.layer === "floor" && chair.appearance?.shape === "rect", "a new table turned chair loses the table's 75cm seed");
const arrangement = recategorized(fresh, "flower-arrangements");
assert(arrangement.layer === "table" && arrangement.stockKind === "consumable" && arrangement.appearance?.shape === "circle", "a new row follows the category's layer, stock and shape");
assert(recategorized(row({ id: "", category: "tables", dimensions: { heightMm: 0 } }), "aisles").dimensions.widthMm === AISLE_SIZE_MM.widthMm, "a new aisle starts at its size");

// ── PR-10: has the draft changed? ──
const base = row({ spec: "קטיפה" });
assert(sameDraft(base, { ...base }), "a copy is the same row");
assert(sameDraft(base, { ...base, stockQty: undefined, spec: "קטיפה" }), "…a field set to nothing, and one set back, change nothing");
assert(sameDraft({ ...base, dimensions: { heightMm: 1100, depthMm: 2400, widthMm: 4000 } }, base), "…nor does the order keys were written in");
assert(!sameDraft(base, { ...base, name: "בר עגול" }) && !sameDraft(base, { ...base, variants: [{ id: "v", name: "זהב" }] }), "a renamed row, or one with a new shade, has changed");

console.log("product-rules self-check passed");
