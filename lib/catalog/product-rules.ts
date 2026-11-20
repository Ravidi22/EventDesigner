// A catalog row RE-FILED under another category — the product drawer's category pill (QA 2026-11-20,
// PR-3) — pure, so a self-check can hold it. The values a row may be stored with are its neighbour,
// ./product-values.ts (kept free of the category registry for the CSV import); this file's self-check
// holds both.
//
//   recategorized  — a new row follows the pick; a saved one keeps what the designer made of it.
//   ownsField      — which category fields a category asks, so a re-filed row keeps those answers.
//
// Run: npm run check:product-rules
import { CATEGORY_BY_ID, type CategoryDef } from "./categories";
import { FRONT_THICK_MM, type MapAppearance, type MapShape, type Product } from "./types";
import { AISLE_CATEGORY, AISLE_PIECE_FIELD, AISLE_SIZE_MM } from "./aisle";
import { VESSEL_HOLDERS } from "./vessel";
import { HANG_FIELD } from "@/lib/studio/hang";
import { resolveContent } from "@/lib/studio/footprint";
import { productProblem, sameDraft, shadeProblem, spareRateFor } from "./product-values";
import { isMain } from "../self-check";

// ── Re-filing a row ────────────────────────────────────────────────────────────────────────────

/** What a NEW product of this category is drawn as (CategoryDef.dims seeds it). */
export const defaultShapeOf = (c: Pick<CategoryDef, "dims">): MapShape => (c.dims === "round" ? "circle" : "rect");

/** Does category `c` ask for the category field `key` — so a row re-filed into it keeps the answer? Its
 *  count fields (seats, arms, stems, a post), a vessel where an arrangement may stand in one, the piece
 *  an aisle is lined with, and a hang height anywhere a row may hang from the ceiling. */
export function ownsField(c: CategoryDef, key: string): boolean {
  if (c.fields.some((f) => f.key === key)) return true;
  if (key === "vessel") return VESSEL_HOLDERS.has(c.id);
  if (key === AISLE_PIECE_FIELD) return c.id === AISLE_CATEGORY;
  if (key === HANG_FIELD) return c.anchor !== "wall";
  return false;
}

/** Row `d` re-filed under category `id` — the product drawer's category pill.
 *
 *  A NEW row's category is still being chosen, so everything it seeds follows the pick: the shape, the
 *  layer, the stock kind, the count fields; its height, price unit and plane while they are still the
 *  old category's seed; an aisle's starting size.
 *
 *  A SAVED row is something the studio has drawn, stocked and priced, and re-filing it used to reset
 *  all of that (QA PR-3: a rented oval bar re-filed as "אחר" became a rectangle, owned — so no longer
 *  ordered from its supplier — and lost its vessel, hang height, seats and arms). Now it keeps:
 *    • its SHAPE and its whole drawing, height, price unit and plane;
 *    • its LAYER and STOCK KIND, unless they are still the old category's seed — then they follow the
 *      new category's (a table re-filed as a cloth goes on the table layer; a bar that was rented
 *      stays rented);
 *    • the category fields the new category also asks (ownsField); the rest go — a field nothing asks
 *      would sit unseen and still be read (seats left on a chair).
 *  The flower spec goes wherever the new category has none, as before. */
export function recategorized(d: Product, id: string): Product {
  const c = CATEGORY_BY_ID[id];
  const was = CATEGORY_BY_ID[d.category];
  if (!c) return d;
  const flowers = c.flowers ? d.flowers : undefined;

  if (d.id) {
    const seededLayer = !was || d.layer === was.defaultLayer;
    const seededStock = (d.stockKind ?? "owned") === (was?.defaultStock ?? "owned");
    const categoryFields = Object.fromEntries(Object.entries(d.categoryFields ?? {}).filter(([k]) => ownsField(c, k)));
    return {
      ...d,
      category: id,
      layer: seededLayer ? c.defaultLayer : d.layer,
      stockKind: seededStock ? (c.defaultStock === "owned" ? undefined : c.defaultStock) : d.stockKind,
      categoryFields,
      flowers,
    };
  }

  // A NEW row's height re-seeds with the category while it is still the old category's seed (or
  // empty) — a fresh row starts as a table at 75cm, and turning it into a chair must not leave it
  // 75cm tall.
  const seededHeight = was?.defaultHeightMm ?? 0;
  const reseedHeight = d.dimensions.heightMm === 0 || d.dimensions.heightMm === seededHeight;
  // A NEW row's PLANE follows the category's seed too (CategoryDef.front): picked as a backdrop it
  // becomes a front panel FRONT_THICK_MM thick (a plan depth is no thickness), and picked away from
  // one while still its front seed it is a plan shape again (a thickness is no plan depth). A
  // hand-drawn one is the designer's drawing and is never touched.
  const handDrawn = d.appearance?.shape === "custom";
  const fromFront = !!was?.front;
  const enterFront = !handDrawn && !!c.front && !fromFront && d.appearance?.plane !== "front";
  const leaveFront = !handDrawn && !c.front && fromFront && d.appearance?.plane === "front";
  const reseeded = reseedHeight ? { ...d.dimensions, heightMm: c.defaultHeightMm ?? 0 } : d.dimensions;
  const planeSeed: Partial<MapAppearance> = enterFront ? { plane: "front" } : leaveFront ? { plane: undefined, bendDeg: undefined, faceTurnDeg: undefined } : {};
  // A NEW aisle starts at a size (8 × 3 m — lib/catalog/aisle.ts): its two numbers are its length and
  // its width across, and an unmeasured one would draw nothing to line.
  const aisleSeed = id === AISLE_CATEGORY && !d.dimensions.widthMm && !d.dimensions.depthMm && !handDrawn;
  // What the plan already draws inside the shape is carried across, so a change of category cannot
  // silently blank the name off a row.
  const content = d.appearance?.content ?? resolveContent(d).mode;
  return {
    ...d,
    dimensions: aisleSeed
      ? { ...reseeded, ...AISLE_SIZE_MM, diameterMm: undefined }
      : enterFront
        ? { ...reseeded, depthMm: FRONT_THICK_MM }
        : leaveFront
          ? { ...reseeded, depthMm: undefined }
          : reseeded,
    category: id,
    layer: c.defaultLayer,
    categoryFields: {},
    flowers,
    // The category's opinion is a better start than the old one's, and it stays editable.
    stockKind: c.defaultStock,
    // The price unit follows while it is still the old category's seed — the height's rule: a sail
    // is sold by the m² until the designer says otherwise.
    ...((d.priceUnit ?? "unit") === (was?.defaultPriceUnit ?? "unit")
      ? { priceUnit: c.defaultPriceUnit && c.defaultPriceUnit !== "unit" ? c.defaultPriceUnit : undefined }
      : {}),
    // The shape re-seeds with them — a centrepiece is round, a stage is a box — except a shape drawn
    // by hand, which a change of category must never throw away.
    appearance: handDrawn ? d.appearance : { ...d.appearance, shape: defaultShapeOf(c), content, ...planeSeed },
  };
}

// ponytail: self-check — of this file and of ./product-values.ts. Run: npm run check:product-rules
if (isMain(import.meta.url)) {
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
}
