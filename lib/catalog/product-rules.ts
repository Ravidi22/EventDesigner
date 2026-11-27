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
