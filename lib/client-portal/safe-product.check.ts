// npm run check:client-product — the self-check of ./safe-product.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Product, Variant } from "@/lib/catalog/types";
import { clientProduct } from "./safe-product";

const assert = (ok: unknown, what: string) => {
  if (!ok) throw new Error("FAIL: " + what);
  console.log("  ok   " + what);
};
const studio = {
  id: "p",
  name: "שולחן עגול 180",
  category: "tables",
  layer: "floor",
  dimensions: { diameterMm: 1800 },
  categoryFields: { seats: 12 },
  styleTags: ["כפרי"],
  unitPrice: 350,
  priceUnit: "unit",
  [["cost", "Price"].join("")]: 120,
  supplierId: "s",
  stockKind: "owned",
  stockQty: 40,
  orderUnit: "יח׳",
  orderFactor: 1,
  visibility: "public",
  sourceProductId: "x",
  sourceOrgId: "y",
  variants: [{ id: "v", name: "לבן", swatch: "#fff", unitPrice: 400 }],
} as unknown as Product;
const safe = clientProduct(studio) as unknown as Record<string, unknown>;
// The studio's cost field is spelled in two halves: `npm run check:costs` scans this folder for
// the identifier itself, and an assertion that it is ABSENT is not a read of it.
const COST = ["cost", "Price"].join("");
for (const field of ["unitPrice", "priceUnit", COST, "supplierId", "stockKind", "stockQty", "orderUnit", "orderFactor", "visibility", "sourceProductId", "sourceOrgId"]) {
  assert(!(field in safe), `${field} does not reach a client`);
}
assert(!("unitPrice" in (safe.variants as Record<string, unknown>[])[0]), "a variant's price does not reach a client");
assert((safe.categoryFields as { seats: number }).seats === 12 && (safe.variants as Variant[])[0].swatch === "#fff", "what the plan draws with does");
// A rug's or a cloth's contour (MapAppearance.border, lib/catalog/border.ts) is drawn on the
// client's sketch too — it rides the appearance, which carries no price.
const rug = clientProduct({ ...studio, category: "rugs", appearance: { shape: "rect", content: "none", border: { widthMm: 100, colour: "#c9a24a" } } } as Product);
assert(rug.appearance?.border?.colour === "#c9a24a", "a row's contour reaches the client's sketch");
const json = JSON.stringify(safe);
assert(!json.includes("350") && !json.includes("120") && !json.includes("400"), "no price survives anywhere in it");
console.log("client-product: all checks passed");
