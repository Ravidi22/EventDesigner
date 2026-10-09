// Wiring: adapt the catalog resolver + category registry into the injected lookups that
// the pure aggregations (aggregate.ts, quote.ts) consume. This is the only outputs file that
// touches the catalog graph.
import { deckOf, resolve } from "@/lib/studio/catalog-resolver";
import { loadProducts } from "@/lib/catalog/storage";
import { CATEGORIES, CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { stemsOf } from "@/lib/catalog/flowers";
import { resolveFootprint, footprintBounds } from "@/lib/studio/footprint";
import { nodeMap, wallPoints, type VenueStructure } from "@/lib/venues/structure";
import { wallLengthMm as segmentLengthMm } from "@/lib/studio/geometry";
import { nearestWall } from "@/lib/studio/anchor";
import type { MeasureContext } from "@/lib/design-document/measure";
import type { ItemLookup } from "./aggregate";
import type { QuoteLookup } from "./quote";

const catOrder = new Map(CATEGORIES.map((c, i) => [c.id, i]));

export const itemLookup: ItemLookup = (variantId) => {
  const r = resolve(variantId);
  if (!r) return undefined;
  const cat = CATEGORY_BY_ID[r.product.category];
  // Any count-multiplier that states what it yields, not the "arms" key specifically — the same
  // rule procurement reduces by (lib/suppliers/actions.ts). A category is allowed exactly one, so a
  // chandelier prints its candles and a flower arrangement its stems through this one branch. For
  // the flower categories the count is the spec's sum (stemsOf), and the spec's rows ride along as
  // the breakdown the florist is actually phoned with.
  const armsField = cat?.fields.find((f) => f.suffix);
  const flowers = cat?.flowers ? r.product.flowers : undefined;
  const arms = armsField ? (cat?.flowers ? stemsOf(r.product) : r.product.categoryFields?.[armsField.key]) : undefined;
  return {
    productName: r.product.name,
    variantLabel: r.label,
    categoryId: r.product.category,
    categoryLabel: cat?.label ?? r.product.category,
    categoryOrder: catOrder.get(r.product.category) ?? 99,
    priceUnit: r.product.priceUnit ?? "unit",
    armsMultiplier:
      armsField && typeof arms === "number" && arms > 0
        ? { label: armsField.suffix!, count: arms }
        : undefined,
    components: flowers?.length ? flowers.map((f) => ({ label: f.name, count: f.qty })) : undefined,
    imageUrl: r.variant?.imageUrl || r.product.imageUrl || undefined,
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
    // A stage counts as its decks (lib/design-document/stage.ts) — laid by the same lookup the
    // studio draws them with, so the quote bills the build the designer saw.
    deckOf,
    stagePart: (kind) => {
      const category = ({ stairs: "stage-stairs", bench: "stage-benches", barrier: "stage-barriers", backdrop: "stage-backdrops", ramp: "stage-ramps", skirt: "stage-skirts", chair: "chairs" })[kind];
      const p = loadProducts().find((x) => x.category === category && !x.archived);
      return p ? (p.variants[0]?.id ?? p.id) : undefined;
    },
    wallDistance: structure ? (p) => nearestWall(structure, p)?.distanceMm ?? Infinity : undefined,
  };
}
