// npm run check:variant-refs — the self-check of ./variant-refs.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { sql } from "drizzle-orm";
import type { Placement, StageBuild, StageTemplate } from "../design-document/types";
import { COMPOSITION_VARIANT_PATHS, DRAWING_VARIANT_PATHS, namesAny, STAGE_TEMPLATE_VARIANT_PATHS, valuesAt, variantIdsIn, type VariantPath } from "./variant-refs";

// ponytail: self-check. Run: npm run check:variant-refs
const assert = (ok: boolean, what: string) => {
  if (!ok) throw new Error("FAIL: " + what);
  console.log(`  ok   ${what}`);
};

// A drawing with EVERY field that names a row set, each to its own id.
const at = { x: 0, y: 0 };
const placement = (over: Partial<Placement>): Placement => ({ id: `pl-${Math.random()}`, variantId: "free-item", layer: "floor", quantity: 1, position: at, rotation: 0, scale: 1, ...over });
const stage: StageBuild = {
  outline: [at, { x: 1000, y: 0 }, { x: 1000, y: 1000 }],
  front: 0,
  decks: ["deck-244", "deck-122"],
  stairsVariant: "stairs-row",
  skirtVariant: "skirt-row",
  benchVariant: "bench-row",
  barrierVariant: "barrier-row",
  backdropVariant: "backdrop-row",
  rampVariant: "ramp-row",
  surfaceVariant: "carpet-row",
  pieces: [
    { variantId: "half-round", centre: at, rotation: 0 },
    { variantId: "hole-deck", centre: at, rotation: 0, hole: true },
  ],
};
const doc = {
  calibration: { mmPerUnit: 1 },
  tables: [{ id: "t1", number: 1, position: at, rotation: 0, variantId: "round-180", chairVariantId: "chiavari" }],
  placements: [
    placement({}),
    placement({ variantId: "peony", layer: "table", tableId: "t1", vessel: "gold-jug" }),
    placement({ variantId: "no-vase", vessel: null }),
    placement({ variantId: "rose-aisle", aisle: { piece: "rose-box" } }),
    placement({ variantId: "stage-row", stage }),
  ],
};
const named = variantIdsIn(doc, DRAWING_VARIANT_PATHS);
for (const id of ["free-item", "peony", "gold-jug", "rose-aisle", "rose-box"]) assert(named.has(id), `a placement names its row, its vase and its aisle's piece (${id})`);
assert(named.has("round-180") && named.has("chiavari"), "a TABLE names its row and its chair");
assert(named.has("deck-244") && named.has("deck-122"), "a stage names every deck it may be built from");
assert(named.has("half-round") && named.has("hole-deck"), "…every whole piece, a hole's deck too");
for (const f of ["stairs-row", "skirt-row", "bench-row", "barrier-row", "backdrop-row", "ramp-row", "carpet-row"]) assert(named.has(f), `…and every row its edges and floor are finished with (${f})`);
assert(!named.has("t1") && named.size === 20, `nothing else — a table's own id is not a row (${named.size})`);

// A composite's arrangement reads the same way, and its recipe too.
const composite = { tables: doc.tables, placements: doc.placements, groups: [], recipe: [{ id: "l1", productId: "lounge-sofa", variantId: "velvet", quantity: 2 }] };
const parts = variantIdsIn(composite, COMPOSITION_VARIANT_PATHS);
assert(parts.has("round-180") && parts.has("deck-244") && parts.has("lounge-sofa") && parts.has("velvet"), "a composite names its parts, its recipe's rows and their shades");

// The studio's saved stages.
const templates: StageTemplate[] = [{ id: "tp", name: "במה 6×4", stage, dressing: [{ itemId: "bench-1", variantId: "candles", quantity: 3 }] }];
const saved = variantIdsIn(templates, STAGE_TEMPLATE_VARIANT_PATHS);
assert(saved.has("deck-244") && saved.has("half-round") && saved.has("skirt-row") && saved.has("candles"), "a saved stage names its decks, pieces, finishes and what stood on its banquettes");

// Lax: a document from before a field, or with something odd in it, reads as naming nothing there.
assert(variantIdsIn({ calibration: { mmPerUnit: 1 } }, DRAWING_VARIANT_PATHS).size === 0, "a document with no tables or placements names nothing");
assert(variantIdsIn({ tables: null, placements: [{ stage: { decks: null } }, "x", 3] }, DRAWING_VARIANT_PATHS).size === 0, "…nor one holding the wrong kind of value");
assert(valuesAt({ a: { b: "x" } }, "$.a[*].b").join() === "x" && valuesAt({ a: [{ b: "x" }, { b: "y" }] }, "$.a.b").join() === "x,y", "lax: [*] takes a lone value, .key reaches into an array");

// The SQL: one exists per path, every id its own parameter, the paths written as jsonpath literals.
void (async () => {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const q = new PgDialect().sqlToQuery(namesAny(sql.raw(`"t"."c"`), DRAWING_VARIANT_PATHS, ["a", "b"]));
  assert((q.sql.match(/exists \(/g) ?? []).length === DRAWING_VARIANT_PATHS.length, "one exists per path");
  assert(q.params.length === 2 * DRAWING_VARIANT_PATHS.length && q.params.every((p) => p === "a" || p === "b"), "every id a bound parameter, in every exists");
  assert(DRAWING_VARIANT_PATHS.every((p) => q.sql.includes(`jsonb_path_query("t"."c", '${p}'::jsonpath)`)), "every path a jsonpath literal on the column");
  const depth = [...q.sql].reduce((d, c) => (d < 0 ? d : d + (c === "(" ? 1 : c === ")" ? -1 : 0)), 0);
  assert(depth === 0, "parentheses balance");
  assert(new PgDialect().sqlToQuery(namesAny(sql.raw("c"), [], ["a"])).sql === "false", "no path names nothing");
  let refused = false;
  try {
    namesAny(sql.raw("c"), ["$.a'; drop table x; --" as VariantPath], ["a"]);
  } catch {
    refused = true;
  }
  assert(refused, "a path that is not $ / .key / [*] never reaches the SQL");
  console.log("variant-refs self-check passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
