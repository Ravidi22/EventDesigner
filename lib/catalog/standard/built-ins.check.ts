// npm run check:built-in — the self-check of ./built-ins.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { standardProductId } from "./id";
import type { Product } from "../types";
import { BUILT_IN_RUG, RAIL_BUILT_INS } from "../built-in";
import { BUILT_IN_KEYS, builtInIds, builtInKeyOf, markBuiltIns } from "./built-ins";

const assert = (ok: boolean, what: string) => {
  if (!ok) throw new Error("FAIL: " + what);
  console.log(`  ok   ${what}`);
};
const org = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const row = (id: string, extra: Partial<Product> = {}): Product => ({ id, name: "x", category: "led-strips", layer: "ceiling", dimensions: { heightMm: 0 }, categoryFields: {}, styleTags: [], variants: [], ...extra });

const strip = standardProductId(org, "builtin-led-strip");
const skirt = standardProductId(org, "stage-skirt");
const table = standardProductId(org, "table-round-180");
const [a, b, c, d, e] = markBuiltIns(
  [row(strip), row(skirt, { category: "stage-skirts" }), row(table, { category: "tables" }), row("11111111-1111-4111-8111-111111111111", { builtIn: "builtin-led-strip" }), row(standardProductId(other, "builtin-led-strip"))],
  org,
);
assert(a.builtIn === "builtin-led-strip", "the studio's own LED strip is its built-in");
assert(b.builtIn === "stage-skirt", "…and so is the stage skirt, under the key it always had");
assert(c.builtIn === undefined, "a base table is base furniture, not a built-in");
assert(d.builtIn === undefined && !("builtIn" in d), "a row that only CLAIMS to be one is cleared — the field is derived");
assert(e.builtIn === undefined, "another studio's built-in id is nobody's here");
assert(builtInKeyOf(org, strip) === "builtin-led-strip" && builtInKeyOf(org, table) === undefined, "builtInKeyOf answers the same");
assert(builtInIds(org).size === BUILT_IN_KEYS.length && BUILT_IN_KEYS.length >= 15, `every built-in has an id (${BUILT_IN_KEYS.length})`);
// Every key the rail pins is a shipped built-in — no typo leaves a card that never appears. The
// dance floor ships with its own category.
for (const key of RAIL_BUILT_INS) {
  if (key === "builtin-dance-floor" && !BUILT_IN_KEYS.includes(key)) continue;
  assert(BUILT_IN_KEYS.includes(key), `${key}: the rail pins a shipped built-in`);
}
assert(BUILT_IN_KEYS.includes(BUILT_IN_RUG), "the carpet cover's rug is a shipped built-in");
console.log("built-ins self-check passed");
