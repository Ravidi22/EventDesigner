// Which of a studio's rows are its BUILT-INS (lib/catalog/built-in.ts) — derived, never stored.
//
// A built-in's row id is the base library's UUIDv5 over (organisation, key) (./id.ts), so "is this
// row the studio's LED strip" is a hash and a comparison, with no column and no migration. A row
// made by hand — or copied off the marketplace into the same category — has a random id and is never
// one. That is also why this is the server's answer: minting the id needs node:crypto.
//
// ⚠ SERVER ONLY, like ./id.ts. Run: npm run check:built-in
import { standardProductId } from "./id";
import { STANDARD_ITEMS } from "./items";
import type { Product } from "../types";
import { isMain } from "../../self-check";
import { BUILT_IN_RUG, RAIL_BUILT_INS } from "../built-in";

const BUILT_IN_KEYS: readonly string[] = STANDARD_ITEMS.filter((i) => i.builtIn).map((i) => i.key);

/** This organisation's built-in row ids → their keys. ~20 hashes; cheap enough per read. */
export function builtInIds(organizationId: string): Map<string, string> {
  return new Map(BUILT_IN_KEYS.map((key) => [standardProductId(organizationId, key), key]));
}

/** The built-in key of row `id` in this organisation, or undefined. */
export function builtInKeyOf(organizationId: string, id: string): string | undefined {
  return builtInIds(organizationId).get(id);
}

/** The products with `builtIn` set where the row is one — and cleared where it is not, since the
 *  field is derived and a value that came from anywhere else is not the server's answer. */
export function markBuiltIns(list: Product[], organizationId: string): Product[] {
  const ids = builtInIds(organizationId);
  return list.map((p) => {
    const key = ids.get(p.id);
    if (key) return p.builtIn === key ? p : { ...p, builtIn: key };
    if (p.builtIn === undefined) return p;
    const { builtIn: _forged, ...rest } = p;
    return rest;
  });
}

if (isMain(import.meta.url)) {
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
}
