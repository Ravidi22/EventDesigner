// npm run check:standard — the self-check of ./items.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { CATEGORY_BY_ID } from "../categories";
import { CATEGORIES } from "../categories";
import { resolveFootprint, resolveContent, footprintBounds } from "../../studio/footprint";
import { RETIRED_STANDARD_KEYS, STANDARD_BARS, STANDARD_DANCE_FLOOR, STANDARD_DECKS, STANDARD_ITEMS, STANDARD_KIT, STANDARD_STAGE_KEYS, STANDARD_STAGE_PART_KEYS, STANDARD_STAGE_PARTS, STANDARD_TABLES, standardProduct, TABLE_HEIGHT_MM } from "./items";

// ponytail: self-check. Run: npm run check:standard
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
check(!RETIRED_STANDARD_KEYS.some((k) => keys.includes(k)), "a retired key is never shipped again");

for (const item of STANDARD_ITEMS) {
  const p = item.product;
  const cat = CATEGORY_BY_ID[p.category];
  check(!!cat, `${item.key}: category "${p.category}" exists`);
  // A category that asks no height (a strip, a sail, a rug) carries 0 like a cloth; one that is cut
  // to fit (`sizing: "stretch"`) stores no width or depth — every other item has both.
  check(p.dimensions.heightMm > 0 || cat?.needsHeight === false, `${item.key}: has a height`);
  check(
    !!p.dimensions.diameterMm || !!(p.dimensions.widthMm && p.dimensions.depthMm) || cat?.sizing === "stretch" || cat?.needsHeight === false,
    `${item.key}: has a diameter, or a width and a depth`,
  );
  check(p.layer === cat?.defaultLayer, `${item.key}: stands on its category's layer`);
  check(p.visibility === "public", `${item.key}: is public — that is what the base library is`);
  check(p.unitPrice === undefined && p.costPrice === undefined, `${item.key}: carries no price`);
}

// The built-in kit (spec 2026-11-07): every built-in-only category has exactly ONE built-in row —
// it IS the category for a studio, which can make no other — and a built-in in a mixed category
// (rugs, curtains) stands beside the rows made by hand.
const builtIns = STANDARD_ITEMS.filter((i) => i.builtIn);
check(builtIns.length >= 16, `the kit ships its built-ins (${builtIns.length})`);
for (const c of CATEGORIES.filter((c) => c.builtIn)) {
  const n = builtIns.filter((i) => i.product.category === c.id).length;
  check(n === 1, `${c.id}: built-in only, so exactly one built-in row (${n})`);
}
for (const item of builtIns) {
  check(item.product.unitPrice === undefined && item.product.costPrice === undefined, `${item.key}: a built-in carries no price — the studio sets it`);
}
for (const key of ["stage-skirt", "stage-stairs-100", "stage-ramp", "stage-barrier", "stage-backdrop", "stage-carpet", "stage-bench"]) {
  check(builtIns.some((i) => i.key === key), `${key}: the stage part is a built-in, under the key it always had`);
}
// The stage tool installs its own basics (installStageBasics) — marking the parts built-in must
// not change which keys those are.
check(STANDARD_STAGE_PART_KEYS.length === STANDARD_STAGE_PARTS.length && STANDARD_STAGE_KEYS.length === STANDARD_DECKS.length + STANDARD_STAGE_PARTS.length, "the stage tool's basics are unchanged");
check(!STANDARD_KIT.some((i) => STANDARD_STAGE_KEYS.includes(i.key)), "…and never include the rest of the kit");

// One table height: the base library's and the drawer's seed for a new table (75cm) agree.
check(
  CATEGORY_BY_ID.tables.defaultHeightMm === TABLE_HEIGHT_MM && STANDARD_TABLES.every((t) => t.product.dimensions.heightMm === 750),
  "every base table, and every new table the drawer opens, is 75cm high",
);

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

// Every department's own floor: a deck without a height is a drawing, and a bar you can sit
// at is a table. Both numbers are what the 3D pass stands the item up with (R-3).
for (const item of STANDARD_DECKS) {
  check(item.product.dimensions.heightMm >= 200, `${item.key}: stands off the floor`);
}
// The decks are the 244 sheet and its three strips, at one height — nothing else (the user's
// explicit list, 2026-10-09). One height is what lets the fill lay them as one platform.
const deckSizes = STANDARD_DECKS.map((i) => `${i.product.dimensions.widthMm}x${i.product.dimensions.depthMm}`).sort();
check(
  JSON.stringify(deckSizes) === JSON.stringify(["2440x1220", "2440x400", "2440x600", "2440x800"]),
  `the decks are exactly 244×122, 244×80, 244×60 and 244×40 (${deckSizes.join(", ")})`,
);
check(new Set(STANDARD_DECKS.map((i) => i.product.dimensions.heightMm)).size === 1, "…all at one height");
for (const item of STANDARD_BARS) {
  check(item.product.dimensions.heightMm >= 1000, `${item.key}: is counter height, not table height`);
}

// The dance floor: a built-in of a built-in-only category, laid like a rug, billed per m².
const dance = STANDARD_DANCE_FLOOR.product;
check(
  STANDARD_DANCE_FLOOR.builtIn === true && CATEGORY_BY_ID[dance.category]?.builtIn === true && CATEGORY_BY_ID[dance.category]?.sizing === "stretch" && dance.priceUnit === "m2",
  "the dance floor is a built-in, stretched like a rug and priced by the square metre",
);

if (failures.length) {
  console.error(`${failures.length} failed`);
  process.exit(1);
}
console.log(`standard catalog: ${STANDARD_ITEMS.length} items ok`);
