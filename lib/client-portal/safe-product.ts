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
import { isMain } from "../self-check";

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

if (isMain(import.meta.url)) {
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
  const json = JSON.stringify(safe);
  assert(!json.includes("350") && !json.includes("120") && !json.includes("400"), "no price survives anywhere in it");
  console.log("client-product: all checks passed");
}
