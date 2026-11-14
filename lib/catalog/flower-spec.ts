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
import type { ArrangementSpec, Product } from "./types";
import type { BuiltOutline, Footprint } from "@/lib/studio/footprint";
import { flattenEdge, footprintBounds, footprintOutlines } from "@/lib/studio/footprint";
import type { CoverShape } from "./flower-cover";
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

/** Whether an arrangement on this footprint FOLLOWS ITS SHAPE (form `shape`, ./flower-cover.ts): any
 *  footprint that is not a plain circle, ellipse or rectangle — a ring, an arc, a spiral, lines, a
 *  hexagon, several shapes together. A plain one keeps its form (a dome, a runner…). */
export const followsShape = (footprint: Footprint): boolean => footprint.kind === "custom" || footprint.kind === "multi";

/** An arrangement's drawing options with `patch` laid over them: a field handed `undefined` (or 0)
 *  is dropped, and nothing left is stored as nothing — a row that says nothing is a full arrangement
 *  with no fall, no strands and no spiral. */
export function arrangementPatch(prev: ArrangementSpec | undefined, patch: { [K in keyof ArrangementSpec]?: ArrangementSpec[K] | undefined }): ArrangementSpec | undefined {
  const next: ArrangementSpec = { ...prev, ...patch };
  if (next.fullness !== "spec") delete next.fullness;
  if (!next.fall) delete next.fall;
  if (!(next.trailMm && next.trailMm > 0)) delete next.trailMm;
  if (!(next.spiral && next.spiral > 0)) delete next.spiral;
  return Object.keys(next).length ? next : undefined;
}

/** One outline as a shape to cover: its curves flattened; lines only stay lines. */
export function coverShapeOf(o: BuiltOutline): CoverShape {
  const n = o.outline.length;
  const sides = o.open ? n - 1 : n;
  const poly = Array.from({ length: sides }, (_, i) => flattenEdge(o.outline[i], o.outline[(i + 1) % n], o.edgeCurves?.[i], 10).slice(0, -1)).flat();
  if (o.open) poly.push(o.outline[n - 1]);
  return o.open ? { poly, open: true } : { poly };
}

/** A footprint's outlines as the shapes to cover, in its own frame. */
export function coverShapesOf(footprint: Footprint): CoverShape[] {
  return footprintOutlines(footprint).map(coverShapeOf);
}

const faceSpecs = new WeakMap<Product, Map<string, FlowerDrawSpec>>();

/** The row's flowers over a FRONT shape's face, as a card or the drawer draws it standing (app/(app)/
 *  catalog/front-preview.tsx): the face's outlines, where they stand in the picture, covered in the
 *  row's own mix and shade. One object per row, shape and shade, so the drawing memoises. */
export function faceFlowerSpecOf(product: Product, key: string, pieces: readonly BuiltOutline[], shade?: string): FlowerDrawSpec {
  let byKey = faceSpecs.get(product);
  if (!byKey) faceSpecs.set(product, (byKey = new Map()));
  const k = `${key}|${shade ?? ""}`;
  const hit = byKey.get(k);
  if (hit) return hit;
  const cover = pieces.map(coverShapeOf);
  const xs = cover.flatMap((c) => c.poly.map((p) => p.x));
  const ys = cover.flatMap((c) => c.poly.map((p) => p.y));
  const spec: FlowerDrawSpec = { form: "shape", w: Math.round(Math.max(...xs) - Math.min(...xs)) || 1, h: Math.round(Math.max(...ys) - Math.min(...ys)) || 1, lines: drawLinesOf(product), shade, seed: seedOf((product.id || product.name) + key), cover, coverMax: 420 };
  byKey.set(k, spec);
  return spec;
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
  // Anything but a plain circle, ellipse or rectangle: the flowers follow the shape as drawn — and a
  // plain one too when its form says so (picked, or a box too long for a round form).
  const shaped = !stem && (followsShape(footprint) || flowerFormOf(product, w, h) === "shape");
  const spec: FlowerDrawSpec = {
    form: shaped ? "shape" : flowerFormOf(product, w, h),
    w,
    h,
    // A stem's one line is drawn in the shade it was placed in (its variant), over its kind's own
    // colour: a dyed eucalyptus is the colour it was dyed.
    lines: stem && shade ? lines.map((l) => ({ ...l, colour: shade })) : lines,
    shade,
    seed: seedOf(product.id || product.name),
  };
  // The base's body is the arrangement's envelope (flower-draw.ts FlowerDrawSpec.profile); a stem
  // has none.
  const profile = product.appearance?.revolve;
  if (!stem && !shaped && profile && profile.length >= 2) spec.profile = profile;
  if (shaped) spec.cover = coverShapesOf(footprint);
  // Fullness, a runner's fall, a hung piece's strands, a tall piece's spiral (ArrangementSpec).
  const a = stem ? undefined : product.appearance?.arrangement;
  if (a?.fullness === "spec") spec.sparse = true;
  if (a?.fall) spec.fall = a.fall;
  if (a?.trailMm && a.trailMm > 0) spec.trailMm = a.trailMm;
  if (a?.spiral && a.spiral > 0) spec.spiral = a.spiral;
  byKey.set(key, spec);
  return spec;
}
