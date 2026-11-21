// Wiring: adapt the catalog resolver + category registry into the injected lookups that
// the pure aggregations (aggregate.ts, quote.ts) consume. This is the only outputs file that
// touches the catalog graph.
import { KANT_CATEGORY, kantRunMm } from "@/lib/catalog/kant";
import { bedRunMm, kantTableOfTable } from "@/components/footprint-shape";
import { aisleBrings, benchOf, deckOf, resolve } from "@/lib/studio/catalog-resolver";
import { loadProducts } from "@/lib/catalog/storage";
import { CATEGORIES, CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { stemsOf } from "@/lib/catalog/flowers";
import { resolveFootprint, footprintBounds } from "@/lib/studio/footprint";
import type { VenueStructure } from "@/lib/venues/structure";
import { nearestWall, wallTrack } from "@/lib/studio/anchor";
import { climbKindOf } from "@/lib/studio/climb-item";
import { vesselOf } from "@/lib/catalog/vessel";
import type { MeasureContext } from "@/lib/design-document/measure";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { arrangedStructure } from "@/lib/design-document/features";
import { railLengthMm, railOf, sketchRailContext } from "@/lib/studio/rail";
import { clothAreaMm2 } from "@/lib/studio/ceiling-cloth";
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
export function measureContext(structure?: VenueStructure, doc?: DesignDocumentContent): MeasureContext {
  // A drape on a side or a rod (lib/studio/rail.ts) is measured against the WHOLE document — the
  // thing a side rail hangs on may be in another quote section's subset — and the venue as this
  // event arranged it.
  const railCtx = structure && doc ? sketchRailContext(doc, structure, arrangedStructure(structure, doc), (v) => resolve(v)?.product) : null;
  return {
    railLengthMm: railCtx ? (p) => {
      const rail = railOf(p);
      return rail ? railLengthMm(rail, railCtx) : undefined;
    } : undefined,
    // A sail's polygon as it hangs in the room (lib/studio/ceiling-cloth.ts) — a corner tied to a wall
    // or a thing where that stands now.
    railAreaMm2: railCtx ? (p) => {
      const rail = railOf(p);
      return rail ? clothAreaMm2(rail, railCtx) : undefined;
    } : undefined,
    // The rod a curtain on a free-standing rod is billed as: the studio's first rod row.
    rodOf: () => {
      const p = loadProducts().find((x) => x.category === "curtain-rods" && !x.archived);
      return p ? (p.variants[0]?.id ?? p.id) : undefined;
    },
    isRod: (variantId) => resolve(variantId)?.product.category === "curtain-rods",
    // A קאנט: the sides of its table it runs on.
    // …and a table garden: its bed's length (lib/catalog/table-bed.ts).
    edgeRunMm: doc
      ? (p) => {
          const product = resolve(p.variantId)?.product;
          const t = p.tableId ? doc.tables.find((x) => x.id === p.tableId) : undefined;
          if (!product || !t) return undefined;
          if (product.category === KANT_CATEGORY) return kantRunMm(kantTableOfTable(t), p.edgeSides);
          return bedRunMm(t, product.appearance);
        }
      : undefined,
    unitOf: (variantId) => resolve(variantId)?.product.priceUnit ?? "unit",
    // Along the wall — a drape round a bowed wall covers the arc, not the chord.
    wallLengthMm: structure ? (wallId) => wallTrack(structure, wallId)?.lengthMm : undefined,
    footprintMm: (variantId) => {
      const product = resolve(variantId)?.product;
      if (!product) return undefined;
      const b = footprintBounds(resolveFootprint(product));
      return { widthMm: b.w, depthMm: b.h };
    },
    // A stage counts as its decks (lib/design-document/stage.ts) — laid by the same lookup the
    // studio draws them with, so the quote bills the build the designer saw.
    deckOf,
    // …and a standalone banquette packs its chairs (lib/design-document/bench.ts), told apart by the
    // same lookup the studio draws it with.
    benchOf,
    stagePart: (kind) => {
      const category = ({ stairs: "stage-stairs", bench: "stage-benches", barrier: "stage-barriers", backdrop: "stage-backdrops", ramp: "stage-ramps", skirt: "stage-skirts", chair: "chairs" })[kind];
      const p = loadProducts().find((x) => x.category === category && !x.archived);
      return p ? (p.variants[0]?.id ?? p.id) : undefined;
    },
    wallDistance: structure ? (p) => nearestWall(structure, p)?.distanceMm ?? Infinity : undefined,
    climbOf: (variantId) => climbKindOf(resolve(variantId)?.product),
    // An arrangement's vase is packed and counted with it (lib/catalog/vessel.ts).
    vesselOf: (p) => vesselOf(p, (id) => resolve(id)?.product),
    // An aisle is N of the piece that lines it, and of that piece's vase (lib/catalog/aisle.ts).
    aisleOf: (p) => aisleBrings(p, (piece) => vesselOf(piece, (id) => resolve(id)?.product)),
  };
}
