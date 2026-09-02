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

// חצי עיגול — the one table here that its two numbers alone would get wrong. Derived by the old
// rule (a diameter is a circle, anything else a rectangle) a half round is a 120×60 box, which is
// the wrong table on the plan and the wrong thing entirely where two of them cap a head table. So
// it NAMES its shape, and lib/studio/footprint.ts builds the outline — the chord and the two
// quarter-arcs back over the top — from the same 120×60 the row already carries.
//
// It used to spell that outline out here, by hand, at a fixed 600mm radius. The built one is the
// same table to the millimetre (check:footprint asserts precisely that against these numbers), and
// unlike the hand-written one it FOLLOWS the dimensions instead of ignoring them: a studio whose
// half rounds are 140×70 changes two fields rather than needing a new outline drawn.
const HALF_ROUND: MapAppearance = { shape: "half-circle", content: "none" };

export const STANDARD_TABLES: StandardItem[] = [
  table("table-round-180", "עגול 180", { diameterMm: 1800 }, 12),
  table("table-square-160", "מרובע 160×160", { widthMm: 1600, depthMm: 1600 }, 8),
  table("table-rect-180x120", "מלבן 180×120", { widthMm: 1800, depthMm: 1200 }, 8),
  table("table-rect-240x120", "מלבן 240×120", { widthMm: 2400, depthMm: 1200 }, 10),
  table("table-square-120", "מרובע 120×120", { widthMm: 1200, depthMm: 1200 }, 6),
  table("table-half-round-120", "חצי עיגול 120×60", { widthMm: 1200, depthMm: 600 }, 4, HALF_ROUND),
  table("table-round-244", "עגול 244", { diameterMm: 2440 }, 16),
];

// ── במות ────────────────────────────────────────────────────────────────────

// Every one of these is a run of 100×200 modules on adjustable legs — the deck a hall stacks in its
// store room, not a built platform. So the sizes below are all whole modules, and the height is the
// one number a studio routinely changes: 60cm is where a band or a chuppah usually ends up, and the
// same legs go down to 20 and up to 80.
const STAGE_HEIGHT_MM = 600;
const STAGE_SPEC = "מורכבת ממודולים 100×200 · רגליים מתכווננות 20–80 סמ";

function stage(key: string, name: string, widthMm: number, depthMm: number): StandardItem {
  return {
    key,
    product: {
      name,
      category: "stages",
      layer: "floor",
      dimensions: { widthMm, depthMm, heightMm: STAGE_HEIGHT_MM },
      categoryFields: {},
      spec: STAGE_SPEC,
      styleTags: [],
      visibility: "public",
      appearance: { shape: "rect", content: "none" },
    },
  };
}

export const STANDARD_STAGES: StandardItem[] = [
  stage("stage-200x100", "במה 200×100", 2000, 1000),
  stage("stage-300x200", "במה 300×200", 3000, 2000),
  stage("stage-400x300", "במה 400×300", 4000, 3000),
  stage("stage-600x400", "במה 600×400", 6000, 4000),
  stage("stage-800x400", "במה 800×400", 8000, 4000),
];

// ── ברים ────────────────────────────────────────────────────────────────────

const BAR_HEIGHT_MM = 1100; // counter height — what you stand at, not what you sit at

// בצורת ח. The shape a bar is mostly built in, and the one its two measurements alone would get
// most wrong: derived by the old rule a 360×180 ח is a solid 3.6×1.8m slab — 6.5 square metres of
// floor the plan says are gone, when the truth is a counter around an opening the staff stand in.
// So it NAMES its shape and lib/studio/footprint.ts builds the outline from those same two numbers,
// counter included (a third of the shorter side, which is 60cm on the sizes below).
const U_BAR: MapAppearance = { shape: "u-shape", content: "none" };

function bar(
  key: string,
  name: string,
  dimensions: { diameterMm?: number; widthMm?: number; depthMm?: number },
  appearance?: MapAppearance,
): StandardItem {
  return {
    key,
    product: {
      name,
      category: "bars",
      layer: "floor",
      dimensions: { ...dimensions, heightMm: BAR_HEIGHT_MM },
      categoryFields: {},
      styleTags: [],
      visibility: "public",
      // Empty, for the same reason the tables are (see above): drawn at true scale a ח says ח and a
      // 2m counter says counter, and on the hall plan the feature carries its own name beside it.
      appearance: appearance ?? { shape: dimensions.diameterMm ? "circle" : "rect", content: "none" },
    },
  };
}

export const STANDARD_BARS: StandardItem[] = [
  bar("bar-straight-200", "בר ישר 200×60", { widthMm: 2000, depthMm: 600 }),
  bar("bar-straight-300", "בר ישר 300×60", { widthMm: 3000, depthMm: 600 }),
  bar("bar-u-240", "בר בצורת ח 240×120", { widthMm: 2400, depthMm: 1200 }, U_BAR),
  bar("bar-u-360", "בר בצורת ח 360×180", { widthMm: 3600, depthMm: 1800 }, U_BAR),
  bar("bar-u-480", "בר בצורת ח 480×180", { widthMm: 4800, depthMm: 1800 }, U_BAR),
  bar("bar-round-150", "בר עגול 150", { diameterMm: 1500 }),
];

/** Everything the install writes. Concatenate the next department here. */
export const STANDARD_ITEMS: StandardItem[] = [...STANDARD_TABLES, ...STANDARD_STAGES, ...STANDARD_BARS];

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
  check(halfFootprint.kind === "custom", "חצי עיגול resolves to a real outline, not a box");
  const bounds = footprintBounds(halfFootprint);
  check(
    bounds.w === 1200 && bounds.h === 600,
    `חצי עיגול is 120×60 on the plan, not a 120×60 box (${bounds.w}×${bounds.h})`,
  );

  // The ח bars: the shape the two numbers alone would get wrong, and the reason this department
  // states an appearance at all. A ח that resolved to a rectangle would look like a bar and eat the
  // floor of a slab — six square metres the plan says are taken and the staff are actually standing in.
  const uBars = STANDARD_BARS.filter((b) => b.product.appearance?.shape === "u-shape");
  check(uBars.length > 0, "the base library ships ח-shaped bars — that is how a bar is mostly built");
  for (const item of uBars) {
    const f = resolveFootprint(standardProduct(item, "x"));
    const b = footprintBounds(f);
    const d = item.product.dimensions;
    check(f.kind === "custom", `${item.key}: is a real ח outline, not a box`);
    check(
      b.w === d.widthMm && b.h === d.depthMm,
      `${item.key}: measures exactly the two numbers on the row (${b.w}×${b.h})`,
    );
    // The counter is a third of the shorter side; on every ח in the list that has to land on a
    // width a person can actually work behind, or the shape is right and the bar is not.
    const counter = Math.min(d.widthMm!, d.depthMm!) / 3;
    check(counter >= 400 && counter <= 800, `${item.key}: the counter is ${counter}mm — a bar, not a shelf`);
  }

  // Every department's own floor: a stage without a deck height is a drawing, and a bar you can sit
  // at is a table. Both numbers are what the 3D pass stands the item up with (R-3).
  for (const item of STANDARD_STAGES) {
    check(item.product.dimensions.heightMm >= 200, `${item.key}: stands off the floor`);
  }
  for (const item of STANDARD_BARS) {
    check(item.product.dimensions.heightMm >= 1000, `${item.key}: is counter height, not table height`);
  }

  if (failures.length) {
    console.error(`${failures.length} failed`);
    process.exit(1);
  }
  console.log(`standard catalog: ${STANDARD_ITEMS.length} items ok`);
}
