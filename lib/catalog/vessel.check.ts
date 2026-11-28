// npm run check:vessel — the self-check of ./vessel.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Product } from "./types";
import { vesselOf } from "./vessel";

// ponytail: self-check. Run: npm run check:vessel
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const row = (id: string, category: string, fields: Record<string, string | number> = {}) =>
  ({ id, category, categoryFields: fields, variants: [] }) as unknown as Product;
const rows = new Map<string, Product>([
  ["peony", row("peony", "flower-arrangements", { vessel: "jug-gold" })],
  ["bare", row("bare", "flower-arrangements")],
  ["candle", row("candle", "candlesticks", { vessel: "jug-gold" })],
  ["jug-gold", row("jug", "vases")],
  ["glass", row("glass", "vases")],
  ["napkin", row("napkin", "napkins")],
]);
const of = (id: string) => rows.get(id);

assert(vesselOf({ variantId: "peony" }, of) === "jug-gold", "an arrangement stands in the vessel its row is made in");
assert(vesselOf({ variantId: "peony", vessel: "glass" }, of) === "glass", "…or the one this placement names");
assert(vesselOf({ variantId: "peony", vessel: null }, of) === undefined, "…or in none, when the plan says none");
assert(vesselOf({ variantId: "bare" }, of) === undefined, "a row that names no vessel stands in none");
assert(vesselOf({ variantId: "bare", vessel: "glass" }, of) === "glass", "…until a placement puts it in one");
assert(vesselOf({ variantId: "candle", vessel: "glass" }, of) === undefined, "a candlestick is not set in a vase");
assert(vesselOf({ variantId: "bare", vessel: "napkin" }, of) === undefined, "a vessel must be a vessel");
assert(vesselOf({ variantId: "bare", vessel: "gone" }, of) === undefined, "…and must still be in the catalog");
// QA PR-7: an arrangement row moved to "תלוי מהתקרה" kept the vase it was given on a table — the
// field is not offered for a hung row, so nobody could see it, and it was still counted and quoted.
const hung = { ...row("cloud", "flower-arrangements", { vessel: "jug-gold" }), layer: "ceiling" } as Product;
rows.set("cloud", hung);
assert(vesselOf({ variantId: "cloud" }, of) === undefined, "a HUNG arrangement stands in no vase, whatever its row still holds");
assert(vesselOf({ variantId: "cloud", vessel: "glass" }, of) === undefined, "…nor in one a placement names");
console.log("vessel self-check passed");
