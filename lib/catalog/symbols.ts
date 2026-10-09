// What a catalog item LOOKS LIKE on the plan, by category — a candelabrum seen from above, a bunch
// of flowers, a chair with its backrest, a sofa with its arms — rather than the bare outline of its
// footprint with a name or an icon written inside it.
//
// The outline was honest and said nothing: a 25cm circle with a flame icon in it is "something round
// on the table", and a centrepiece, a candlestick and a vase were three identical circles. A plan the
// client is shown has to be legible as a ROOM at a glance, and that is what the architectural symbol
// is for — the convention every furniture plan already uses.
//
// The picture is DERIVED, like the footprint: from the category, the item's own measurements and,
// where one exists, its count-multiplier (a five-arm candelabrum draws five candles). Nothing is
// stored but the designer's one opt-out (MapAppearance.symbol === false), which brings back the
// outline + name/icon they chose — for the item the category's picture gets wrong.
//
// Only a PRIMITIVE footprint (circle, ellipse, rectangle) is drawn this way. A ח-shaped bar or a
// hand-drawn outline is its own picture already, and a symbol laid into its bounding box would draw
// a sofa across the hole in the middle of it.
import type { Product } from "./types";
import { isRunner } from "./categories";
import type { Footprint } from "@/lib/studio/footprint";

export type SymbolKind =
  | "candlestick"
  | "flowers"
  | "centerpiece"
  | "chair"
  | "sofa"
  | "chandelier"
  | "column"
  | "fountain"
  | "arch"
  | "chuppah"
  | "bar"
  | "runner";

/** The categories that have a picture, and which one. A category not here draws as it always did. */
export const SYMBOL_BY_CATEGORY: Record<string, SymbolKind> = {
  candlesticks: "candlestick",
  "flower-arrangements": "flowers",
  centerpieces: "centerpiece",
  chairs: "chair",
  sofas: "sofa",
  chandeliers: "chandelier",
  columns: "column",
  fountains: "fountain",
  arches: "arch",
  chuppahs: "chuppah",
  bars: "bar",
};

/** Whether the category has a picture at all — what the appearance editor's switch is offered for. */
export function categoryHasSymbol(category: string): boolean {
  return category in SYMBOL_BY_CATEGORY;
}

/** The picture this item is drawn as, or null for "the outline and its name/icon, as before".
 *  `footprint` is the shape it is drawn at (stretched, when the placement stretched it). */
export function symbolOf(product: Product | undefined, footprint: Footprint): SymbolKind | null {
  if (!product || product.appearance?.symbol === false) return null;
  // A runner is filed with the cloths but is drawn as itself: a strip of fabric on the table.
  const kind = isRunner(product) ? "runner" : SYMBOL_BY_CATEGORY[product.category];
  if (!kind) return null;
  return footprint.kind === "circle" || footprint.kind === "ellipse" || footprint.kind === "rect" ? kind : null;
}

/** How many candles / arms / bulbs the picture draws — the category's own count-multiplier when the
 *  row has one, so the plan and the packing list agree on what a "5-arm" piece is. */
export function symbolCount(product: Product, kind: SymbolKind): number {
  const arms = Number(product.categoryFields?.arms);
  if (Number.isFinite(arms) && arms > 0) return Math.min(24, Math.round(arms));
  return kind === "chandelier" ? 8 : 1;
}

/** What KIND of chair a chair is — what it looks like from above (components/item-symbol.tsx). Set
 *  in the appearance editor (MapAppearance.symbolStyle); absent = a dining chair. */
export type ChairStyle = "dining" | "chiavari" | "crossback" | "ghost" | "folding" | "armchair" | "stool" | "bench";

export const CHAIR_STYLES: ChairStyle[] = ["dining", "chiavari", "crossback", "ghost", "folding", "armchair", "stool", "bench"];

export const CHAIR_STYLE_LABEL: Record<ChairStyle, string> = {
  dining: "כיסא אוכל",
  chiavari: "נפוליאון / טיפאני",
  crossback: "קרוס־בק (עץ)",
  ghost: "גוסט שקוף",
  folding: "מתקפל",
  armchair: "כורסה",
  stool: "שרפרף / בר",
  bench: "ספסל",
};

/** A chair's style, or undefined for anything that is not a chair. */
export function chairStyleOf(product: Product | undefined): ChairStyle | undefined {
  if (!product || product.category !== "chairs") return undefined;
  const s = product.appearance?.symbolStyle;
  return s && (CHAIR_STYLES as string[]).includes(s) ? (s as ChairStyle) : "dining";
}

/** How far a cloth shows past the tabletop seen from above — the fall of the fabric, not its full
 *  drop to the floor, which hangs straight down and is invisible on a plan. A runner hanging over a
 *  table's end shows the same. */
export const CLOTH_DROP_MM = 90;
