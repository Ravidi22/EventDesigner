// From a catalog row to the drawing of its flowers: the one place a Product becomes a
// FlowerDrawSpec (lib/catalog/flower-draw.ts).
//
// Every surface that draws an arrangement — the studio canvas, the rail's drag image, the catalog
// card, the appearance editor, the printed map — asks here, with the footprint it is drawing at and
// the shade it is drawing in, and gets the SAME object back for the same row, size and shade. That
// identity is what lets the drawing memoise (ItemSymbol compares its props by identity) and the
// layout run once per arrangement rather than once per table.
//
// What the spec is made of: the row's flower lines, each read to a kind by the kind it carries or
// by its name (lib/catalog/flower-kinds.ts); its form — the appearance editor's choice, else by its
// height; its shade. A row with no lines draws the default mix at its typed stem count. A stem
// product (the marketplace's cut flowers) is a single head of its own kind.
import type { Product } from "./types";
import type { Footprint } from "@/lib/studio/footprint";
import { footprintBounds } from "@/lib/studio/footprint";
import { stemsOf } from "./flowers";
import { kindOfLine, kindOfName, type FlowerKindId } from "./flower-kinds";
import { defaultFlowerForm, defaultMix, isFlowerForm, seedOf, type DrawLine, type FlowerDrawSpec, type FlowerForm } from "./flower-draw";

/** The categories whose product IS one flower — a stem, a sprig, a dried plume — sold by the
 *  supplier and drawn as a single head. Which kind a name in them falls back to when no word in it
 *  is known: a greenery row nobody recognises is still green. */
export const STEM_CATEGORY_FALLBACK: Record<string, FlowerKindId> = {
  flowers: "filler",
  greenery: "green",
  "dried-flowers": "dried",
};

export const isStemCategory = (category: string): boolean => category in STEM_CATEGORY_FALLBACK;

/** The lines the drawing reads: the row's spec resolved to kinds, else the default mix scaled to
 *  its typed stems; for a stem product, itself. */
export function drawLinesOf(product: Product): DrawLine[] {
  if (isStemCategory(product.category)) {
    return [{ kind: kindOfName(product.name, STEM_CATEGORY_FALLBACK[product.category]), qty: 1, headMm: product.dimensions.diameterMm }];
  }
  const lines = (product.flowers ?? [])
    .filter((l) => l.name.trim() !== "" && l.qty > 0)
    .map((l): DrawLine => ({ kind: kindOfLine(l), qty: l.qty, colour: l.colour }));
  return lines.length ? lines : defaultMix(stemsOf(product));
}

/** The form a row is drawn in: a stem on its own, the editor's choice, else by its height. */
export function flowerFormOf(product: Product, w: number, h: number): FlowerForm {
  if (isStemCategory(product.category)) return "single";
  const chosen = product.appearance?.symbolStyle;
  if (isFlowerForm(chosen) && chosen !== "single") return chosen;
  return defaultFlowerForm(product.dimensions.heightMm, w, h);
}

const specs = new WeakMap<Product, Map<string, FlowerDrawSpec>>();

/**
 * The spec an arrangement is drawn from, at this footprint, in this shade. One object per
 * (row, size, shade), kept for the row's lifetime.
 *
 * `shade` is the colour the caller resolved for the placement — its variant's swatch, else the
 * row's fill — the same `tone` every ItemSymbol gets. A stem product's shade is its own colour.
 */
export function flowerDrawSpecOf(product: Product, footprint: Footprint, shade?: string): FlowerDrawSpec {
  const b = footprintBounds(footprint);
  const w = Math.round(b.w);
  const h = Math.round(b.h);
  const key = `${w}|${h}|${shade ?? ""}`;
  let byKey = specs.get(product);
  if (!byKey) {
    byKey = new Map();
    specs.set(product, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  const lines = drawLinesOf(product);
  const stem = isStemCategory(product.category);
  const spec: FlowerDrawSpec = {
    form: flowerFormOf(product, w, h),
    w,
    h,
    // A stem's one line is drawn in the shade it was placed in (its variant), over its kind's own
    // colour: a dyed eucalyptus is the colour it was dyed.
    lines: stem && shade ? lines.map((l) => ({ ...l, colour: shade })) : lines,
    shade,
    seed: seedOf(product.id || product.name),
  };
  byKey.set(key, spec);
  return spec;
}
