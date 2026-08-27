// Wiring: adapt the catalog resolver + category registry into the injected lookups that
// the pure aggregations (aggregate.ts, quote.ts) consume. This is the only outputs file that
// touches the catalog graph.
import { resolve } from "@/lib/studio/catalog-resolver";
import { CATEGORIES, CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { resolveFootprint, footprintBounds } from "@/lib/studio/footprint";
import { nodeMap, wallPoints, type VenueStructure } from "@/lib/venues/structure";
import { wallLengthMm as segmentLengthMm } from "@/lib/studio/geometry";
import type { MeasureContext } from "@/lib/design-document/measure";
import type { ItemLookup } from "./aggregate";
import type { QuoteLookup } from "./quote";

const catOrder = new Map(CATEGORIES.map((c, i) => [c.id, i]));

export const itemLookup: ItemLookup = (variantId) => {
  const r = resolve(variantId);
  if (!r) return undefined;
  const cat = CATEGORY_BY_ID[r.product.category];
  const armsField = cat?.fields.find((f) => f.key === "arms");
  const arms = r.product.categoryFields?.arms;
  return {
    productName: r.product.name,
    variantLabel: r.label,
    categoryId: r.product.category,
    categoryLabel: cat?.label ?? r.product.category,
    categoryOrder: catOrder.get(r.product.category) ?? 99,
    priceUnit: r.product.priceUnit ?? "unit",
    armsMultiplier:
      armsField && typeof arms === "number" && arms > 0
        ? { label: armsField.suffix ?? "נרות", count: arms }
        : undefined,
  };
};

export const productName = (variantId: string): string | undefined => resolve(variantId)?.product.name;

export const priceLookup: QuoteLookup = (variantId) => {
  const r = resolve(variantId);
  if (!r) return undefined;
  const cat = CATEGORY_BY_ID[r.product.category];
  return {
    label: r.label,
    productId: r.product.id,
    categoryId: r.product.category,
    categoryLabel: cat?.label ?? r.product.category,
    categoryOrder: catOrder.get(r.product.category) ?? 99,
    unitPrice: r.price,
    priceUnit: r.product.priceUnit ?? "unit",
  };
};

/** How to measure the stretched items, against a real venue plan (F-4.6). A drape charges for the
 *  run it covers, so the quote has to be able to ask how long that wall is — which means reaching
 *  the venue structure the document deliberately doesn't carry. Pass the event's structure; without
 *  one every item falls back to being counted, which is what a caller with no plan can honestly say. */
export function measureContext(structure?: VenueStructure): MeasureContext {
  const nodes = structure ? nodeMap(structure) : null;
  return {
    unitOf: (variantId) => resolve(variantId)?.product.priceUnit ?? "unit",
    wallLengthMm: structure && nodes
      ? (wallId) => {
          const wall = structure.walls.find((w) => w.id === wallId);
          const pts = wall ? wallPoints(structure, wall, nodes) : null;
          return pts ? segmentLengthMm(pts.a, pts.b) : undefined;
        }
      : undefined,
    footprintMm: (variantId) => {
      const product = resolve(variantId)?.product;
      if (!product) return undefined;
      const b = footprintBounds(resolveFootprint(product));
      return { widthMm: b.w, depthMm: b.h };
    },
  };
}
