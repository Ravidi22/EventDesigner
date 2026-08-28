// The base library — the items a studio has because every hall has them.
//
// A 1.80m round table is not a designer's product. It is furniture with a standard size, and asking
// each studio to type in the seven tables stacked against the wall of every catering hall in the
// country is asking them to re-enter the numbers everyone else has already entered. So the app
// ships with them, and a new studio opens a catalog that already knows what an עגול 180 is.
//
// EACH STUDIO GETS ITS OWN COPY — a row in its own organisation, not one shared row read across
// organisations (see ./install.ts). That is the whole design decision, and it is what makes the
// base library cost nothing anywhere else in the app:
//
//   • a placement always points at a row inside its own studio, so no design can be broken by
//     another studio's edit, and the cross-org read that the schema note on `products.visibility`
//     deliberately defers is not needed in order to ship this;
//   • the price and the stock count belong to the studio, which they must — one designer owns their
//     tables and the next one rents them;
//   • every screen still reads exactly one catalog.
//
// The copies are flagged `public`, because that is honestly what these items are: nothing in this
// file is anyone's design. It is also what makes them recognisable in the catalog — the product
// card already badges a public item.
//
// The list is data. A new department is a new array below and one more run of the install.
import { CATEGORY_BY_ID } from "../categories";
import type { MapAppearance, Product } from "../types";
import { resolveFootprint, resolveContent, footprintBounds } from "../../studio/footprint";
import { isMain } from "../../self-check";

export interface StandardItem {
  /** Stable forever. Each studio's copy derives its id from this (./id.ts), so renaming a key mints
   *  a SECOND copy of the same table in every catalog that already has the first. Names may change;
   *  keys may not. */
  key: string;
  /** Everything but the id and the shades. A base item has no variants on purpose: a shade is a
   *  studio's own stock, and a bare table is the same table everywhere. */
  product: Omit<Product, "id" | "variants">;
}

/** One studio's copy of a base item. The id comes from the caller — the install derives a stable
 *  one per organisation (./id.ts) and nothing else should be minting these. */
export function standardProduct(item: StandardItem, id: string): Product {
  return { ...item.product, id, variants: [] };
}

// ── שולחנות ────────────────────────────────────────────────────────────────────────────────────

const TABLE_HEIGHT_MM = 750; // every event table in the country, within a centimetre

// ⚠ `seats` is a MULTIPLIER, not a note: the packing list counts chairs as tables × seats (F-4.3),
// so these numbers reach a real order. They are the ordinary Israeli event settings — roughly 60cm
// of edge per seat, with the short ends of a rectangle laid where they are normally laid — and a
// studio that seats a 180 round at ten changes one field in the drawer.
function table(
  key: string,
  name: string,
  dimensions: { diameterMm?: number; widthMm?: number; depthMm?: number },
  seats: number,
  appearance?: MapAppearance,
): StandardItem {
  return {
    key,
    product: {
      name,
      category: "tables",
      layer: "floor",
      dimensions: { ...dimensions, heightMm: TABLE_HEIGHT_MM },
      categoryFields: { seats },
      styleTags: [],
      visibility: "public",
      // The tables draw EMPTY — the footprint, and nothing written inside it. `content: "none"` is
      // what says so: left absent it would default to "name", and every table in the room would
      // carry its own size as a label, which on a true-scale plan is one word repeated forty times
      // to say what the shape is already saying. The designer who wants the label back sets it on
      // their own copy, in the drawer.
      //
      // The SHAPE is still derived from the dimensions — the rule here is resolveFootprint's own
      // (a diameter means a circle, anything else a rectangle), written out only because a
      // MapAppearance cannot state a content without also stating a shape.
      appearance: appearance ?? { shape: dimensions.diameterMm ? "circle" : "rect", content: "none" },
    },
  };
}

// חצי עיגול — the one shape the dimensions cannot describe. Every other table here is a circle
// derived from its diameter or a rectangle derived from its width and depth (resolveFootprint); a
// half round derived that way is a 120×60 box, which is the wrong table on the plan and the wrong
// thing entirely where two of them cap a head table. So it carries an explicit outline: the chord,
// then two quarter-arc beziers back over the top.
//
// K is the standard cubic approximation of a quarter circle (0.5523 × r) — the constant every
// circle-to-path conversion uses; the error is a fraction of a millimetre at this radius. Control
// points are RELATIVE to their own edge's endpoints (absoluteControlPoints, lib/studio/geometry).
const HALF_ROUND_R = 600;
const K = Math.round(0.5523 * HALF_ROUND_R);
const HALF_ROUND: MapAppearance = {
  shape: "custom",
  content: "none",
  outline: [
    { x: -HALF_ROUND_R, y: 0 }, // left end of the flat edge
    { x: HALF_ROUND_R, y: 0 }, // right end of the flat edge
    { x: 0, y: -HALF_ROUND_R }, // top of the arc
  ],
  edgeCurves: [
    null, // the flat edge is the diameter — straight
    { c1: { x: 0, y: -K }, c2: { x: K, y: 0 } }, // right end → apex
    { c1: { x: -K, y: 0 }, c2: { x: 0, y: -K } }, // apex → left end
  ],
};

export const STANDARD_TABLES: StandardItem[] = [
  table("table-round-180", "עגול 180", { diameterMm: 1800 }, 12),
  table("table-square-160", "מרובע 160×160", { widthMm: 1600, depthMm: 1600 }, 8),
  table("table-rect-180x120", "מלבן 180×120", { widthMm: 1800, depthMm: 1200 }, 8),
  table("table-rect-240x120", "מלבן 240×120", { widthMm: 2400, depthMm: 1200 }, 10),
  table("table-square-120", "מרובע 120×120", { widthMm: 1200, depthMm: 1200 }, 6),
  table("table-half-round-120", "חצי עיגול 120×60", { widthMm: 1200, depthMm: 600 }, 4, HALF_ROUND),
  table("table-round-244", "עגול 244", { diameterMm: 2440 }, 16),
];

/** Everything the install writes. Concatenate the next department here. */
export const STANDARD_ITEMS: StandardItem[] = [...STANDARD_TABLES];

// ponytail: self-check. Run: npm run check:standard
if (isMain(import.meta.url)) {
  const failures: string[] = [];
  const check = (ok: boolean, what: string) => {
    if (ok) {
      console.log(`  ok   ${what}`);
    } else {
      console.error(`FAIL: ${what}`);
      failures.push(what);
    }
  };

  const keys = STANDARD_ITEMS.map((i) => i.key);
  check(new Set(keys).size === keys.length, "keys are unique — a duplicate key is a duplicate row");
  check(keys.every((k) => /^[a-z0-9-]+$/.test(k)), "keys are stable slugs");

  for (const item of STANDARD_ITEMS) {
    const p = item.product;
    check(!!CATEGORY_BY_ID[p.category], `${item.key}: category "${p.category}" exists`);
    check(p.dimensions.heightMm > 0, `${item.key}: has a height`);
    check(
      !!p.dimensions.diameterMm || !!(p.dimensions.widthMm && p.dimensions.depthMm),
      `${item.key}: has a diameter, or a width and a depth`,
    );
    check(p.visibility === "public", `${item.key}: is public — that is what the base library is`);
    check(p.unitPrice === undefined && p.costPrice === undefined, `${item.key}: carries no price`);
  }

  // Chairs = tables × seats: a table whose count is missing silently packs no chairs.
  for (const item of STANDARD_TABLES) {
    const seats = item.product.categoryFields.seats;
    check(typeof seats === "number" && seats > 0, `${item.key}: has a standard seat count`);
  }

  check(
    STANDARD_ITEMS.every((item) => resolveContent(standardProduct(item, "x")).mode === "none"),
    "base items draw empty — the footprint, with nothing written inside it",
  );

  // The shape the plan derives, and the one it would get wrong without an outline.
  const round = standardProduct(STANDARD_TABLES[0], "x");
  check(
    JSON.stringify(resolveFootprint(round)) === JSON.stringify({ kind: "circle", diameterMm: 1800 }),
    "עגול 180 is a circle of its own diameter — the appearance states the shape, never the size",
  );
  const half = standardProduct(STANDARD_TABLES.find((t) => t.key === "table-half-round-120")!, "x");
  const halfFootprint = resolveFootprint(half);
  check(halfFootprint.kind === "custom", "חצי עיגול keeps its outline");
  const bounds = footprintBounds(halfFootprint);
  check(
    bounds.w === 1200 && bounds.h === 600,
    `חצי עיגול is 120×60 on the plan, not a 120×60 box (${bounds.w}×${bounds.h})`,
  );

  if (failures.length) {
    console.error(`${failures.length} failed`);
    process.exit(1);
  }
  console.log(`standard catalog: ${STANDARD_ITEMS.length} items ok`);
}
