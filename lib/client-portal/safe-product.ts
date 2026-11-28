// The catalog as a CLIENT may receive it: what the plan needs to draw an item, and nothing a
// studio keeps to itself.
//
// AN ALLOW-LIST, never a delete-list. Spreading the product and blanking the studio's cost would be one line and
// it would be wrong the day somebody adds a field to Product: the new field would leave the studio
// by default. Here a field reaches a client only because a line below copies it — the client's
// price, the studio's cost, the supplier, stock, provenance and visibility are not copied, and a
// variant keeps its name, swatch and photo but not its price.
//
// Pure, so the canvas can use what it returns exactly as it uses a studio's Product. Self-checked:
// `npm run check:client-product`.
import type { Product, Variant } from "@/lib/catalog/types";

function clientVariant(v: Variant): Variant {
  return {
    id: v.id,
    name: v.name,
    ...(v.swatch ? { swatch: v.swatch } : {}),
    ...(v.imageUrl ? { imageUrl: v.imageUrl } : {}),
    ...(v.archived ? { archived: true } : {}),
  };
}

export function clientProduct(p: Product): Product {
  return {
    id: p.id,
    name: p.name,
    ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}),
    category: p.category,
    layer: p.layer,
    dimensions: p.dimensions,
    // The category's own fields (seats, arms, stems, a hang height…) are drawing and seating facts.
    // None of them is a price — prices live on the product and the variant, never in here.
    categoryFields: p.categoryFields,
    ...(p.flowers ? { flowers: p.flowers } : {}),
    styleTags: [],
    variants: p.variants.map(clientVariant),
    ...(p.appearance ? { appearance: p.appearance } : {}),
    ...(p.archived ? { archived: true } : {}),
    ...(p.resize ? { resize: p.resize } : {}),
    ...(p.clearanceMm ? { clearanceMm: p.clearanceMm } : {}),
  };
}
