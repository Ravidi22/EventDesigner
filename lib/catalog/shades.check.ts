// npm run check:shades — the self-check of ./shades.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Product, Variant } from "./types";
import { catalogShades, cleanShades, hasShade, MAX_EVENT_SHADES, shadeKey, shadeVariant, toggleShade } from "./shades";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const v = (id: string, name: string, extra: Partial<Variant> = {}): Variant => ({ id, name, ...extra });

assert(shadeKey("  זָהָב  ") === "זהב", "niqqud and edges dropped");
assert(shadeKey("Rose  GOLD") === "rose gold", "case folded, inner space collapsed");

const cloth = [v("w", "לבן"), v("g", "זהב", { swatch: "#c9a227" }), v("b", "בורדו"), v("x", "שמפניה", { archived: true })];
assert(shadeVariant(cloth, []) === undefined, "no palette, no opinion");
assert(shadeVariant(cloth, ["בורדו", "זהב"])?.id === "b", "the event's order wins, not the variant order");
assert(shadeVariant(cloth, ["ירוק", "זָהָב "])?.id === "g", "the first shade the item stocks, matched by key");
assert(shadeVariant(cloth, ["שמפניה"]) === undefined, "an archived variant is never chosen");
assert(shadeVariant(cloth, ["זהב מט"]) === undefined, "a name is matched whole, not by prefix");

assert(cleanShades(["זהב", " זָהָב", "", 3, "לבן"]).join("|") === "זהב|לבן", "clean: one per key, order kept, junk out");
assert(cleanShades(Array.from({ length: 20 }, (_, i) => `s${i}`)).length === MAX_EVENT_SHADES, "clean: capped");
assert(cleanShades("זהב").length === 0, "clean: not an array is nothing");

let picked = toggleShade([], "זהב");
picked = toggleShade(picked, "לבן");
assert(picked.join("|") === "זהב|לבן", "toggle appends in click order");
assert(toggleShade(picked, "זָהָב").join("|") === "לבן", "toggle removes by key");
assert(hasShade(picked, " לבן "), "hasShade by key");

const product = (id: string, variants: Variant[], archived = false) =>
  ({ id, name: id, variants, archived }) as unknown as Product;
const shades = catalogShades([
  product("a", [v("a1", "זהב", { swatch: "#d4af37" }), v("a2", "לבן")]),
  product("b", [v("b1", "זָהָב", { swatch: "#d4af37" }), v("b2", "בורדו", { archived: true })]),
  product("c", [v("c1", "זהב", { swatch: "#c9a227" })]),
  product("d", [v("d1", "ירוק")], true),
]);
assert(shades.map((s) => s.name).join("|") === "זהב|לבן", "distinct live shades, most stocked first");
assert(shades[0].products === 3 && shades[0].swatch === "#d4af37", "the commonest swatch, products counted once each");
assert(!shades.some((s) => s.name === "בורדו" || s.name === "ירוק"), "archived rows and variants are not offered");

console.log("shades: ok");
