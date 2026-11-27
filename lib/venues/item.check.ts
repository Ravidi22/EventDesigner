// npm run check:venue-item — the self-check of ./item.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Product } from "@/lib/catalog/types";
import { itemProductOf, itemSnapshot, itemVariantId, venueItemOffered } from "./item";

// ponytail: self-check. Run: npm run check:venue-item
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const row = (over: Partial<Product>): Product => ({
  id: "p1",
  name: "נברשת קריסטל 90",
  category: "chandeliers",
  layer: "ceiling",
  dimensions: { widthMm: 900, depthMm: 900, heightMm: 1100, diameterMm: 900 },
  categoryFields: { arms: 8, hangHeightMm: 2800, vessel: "v-secret" },
  styleTags: ["זהב"],
  variants: [
    { id: "old", name: "ישן", swatch: "#000000", archived: true },
    { id: "gold", name: "זהב", swatch: "#c9a24a" },
    { id: "silver", name: "כסף", swatch: "#c0c0c0" },
  ],
  unitPrice: 4321,
  costPrice: 1234,
  supplierId: "s-secret",
  stockKind: "owned",
  stockQty: 7,
  spareRate: 10,
  imageUrl: "https://example.com/secret.jpg",
  appearance: { shape: "circle", content: "none", symbolStyle: "crystal" },
  ...over,
});

const snap = itemSnapshot(row({}), { w: 900, h: 900 });
const text = JSON.stringify(snap);
for (const secret of ["4321", "1234", "s-secret", "secret.jpg", "stockQty", "spareRate", "unitPrice", "costPrice", "supplier", "v-secret"])
  assert(!text.includes(secret), `the copy carries nothing of the money, stock or another catalog's ids (${secret})`);
assert(snap.shade?.name === "זהב" && snap.shade.swatch === "#c9a24a", "the first live shade comes with it");
assert(itemSnapshot(row({}), { w: 900, h: 900 }, "silver").shade?.name === "כסף", "…or the one asked for");
assert(snap.categoryFields?.arms === 8 && snap.categoryFields?.hangHeightMm === 2800, "the drawing's fields come with it");

const f = { id: "f1", label: "נברשת קריסטל 90", widthMm: 900, depthMm: 900, item: snap };
const p = itemProductOf(f)!;
assert(p.dimensions.widthMm === 900 && p.dimensions.diameterMm === 900 && p.layer === "ceiling", "read back at its own size");
assert(p.variants.length === 1 && itemVariantId(p) === "venue-item:f1:shade", "…in its shade, under the feature's own id");
assert(p.unitPrice === undefined && p.costPrice === undefined, "…with no price");
assert(itemProductOf({ ...f, heightMm: 1500 })!.dimensions.heightMm === 1500, "its height is the feature's when typed");
const big = itemProductOf({ ...f, widthMm: 1200, depthMm: 1200 })!;
assert(big.dimensions.widthMm === 1200 && big.dimensions.diameterMm === 1200 && big.dimensions.heightMm === 1100, "resized, it is drawn at the new box (its height kept)");
const bare = itemProductOf({ ...f, item: itemSnapshot(row({ variants: [] }), { w: 900, h: 900 }) })!;
assert(bare.variants.length === 0 && itemVariantId(bare) === bare.id, "a row with no shade resolves under the product itself");
assert(itemProductOf({ ...f, item: undefined }) === null, "a feature with no copy is no item");

assert(venueItemOffered(row({})), "a chandelier is offered");
assert(venueItemOffered(row({ category: "sofas", layer: "floor" })), "…and a sofa");
assert(!venueItemOffered(row({ category: "candlesticks", layer: "table" })), "not what stands on a table");
assert(!venueItemOffered(row({ category: "tables", layer: "floor" })), "not a table");
assert(!venueItemOffered(row({ category: "curtains", layer: "floor" })), "not a curtain (the build tab has the venue's own)");
assert(!venueItemOffered(row({ category: "bars", layer: "floor" })), "not a bar (placed as built)");
assert(!venueItemOffered(row({ archived: true })), "not an archived row");

console.log("venue item: ok");
