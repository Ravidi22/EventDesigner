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
// Only a PRIMITIVE footprint (circle, ellipse, rectangle) is drawn this way — a symbol laid into
// the bounding box of a hand-drawn outline would draw a sofa across the hole in the middle of it.
// The one exception is a BAR: a ח, an oval ring, a horseshoe or an arc is what a bar in a hall
// mostly is, so its picture is laid along its band rather than into its box (lib/catalog/bar-draw.ts).
import type { Product } from "./types";
import { isRunner } from "./categories";
import type { Footprint } from "@/lib/studio/footprint";

export type SymbolKind =
  | "candlestick"
  | "flowers"
  | "centerpiece"
  | "vase"
  | "tree"
  | "chair"
  | "sofa"
  | "chandelier"
  | "column"
  | "fountain"
  | "arch"
  | "chuppah"
  | "bar"
  | "runner"
  | "stairs"
  | "ramp"
  | "bench"
  | "lamp";

/** The categories that have a picture, and which one. A category not here draws as it always did. */
export const SYMBOL_BY_CATEGORY: Record<string, SymbolKind> = {
  candlesticks: "candlestick",
  // A table lamp: its shade seen from above, lit from inside.
  lamps: "lamp",
  "flower-arrangements": "flowers",
  centerpieces: "centerpiece",
  // A stem on its own — the marketplace's cut flowers, greens and dried plumes — is one head of
  // its kind (lib/catalog/flower-spec.ts), the same drawing an arrangement is made of.
  flowers: "flowers",
  greenery: "flowers",
  "dried-flowers": "flowers",
  vases: "vase",
  trees: "tree",
  chairs: "chair",
  sofas: "sofa",
  chandeliers: "chandelier",
  columns: "column",
  fountains: "fountain",
  arches: "arch",
  chuppahs: "chuppah",
  bars: "bar",
  // A flight or a ramp standing on its own (lib/studio/climb-item.ts): its step edges and the line
  // it is walked up, as the venue's own stairs are drawn (components/climb-glyph.tsx).
  "stage-stairs": "stairs",
  "stage-ramps": "ramp",
  // A banquette standing on its own (lib/design-document/bench.ts): its top, the chairs along a
  // chairs side, the cushions of a sofa side. A stage's edge banquette is drawn by the stage itself.
  "stage-benches": "bench",
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
  // A climb is a straight run; a round "ramp" is a shape the steps cannot be drawn into. A banquette
  // is a strip with two long sides — the same.
  if (kind === "stairs" || kind === "ramp" || kind === "bench") return footprint.kind === "rect" ? kind : null;
  if (kind === "bar") return kind;
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

/** What KIND of candle piece a candlestick is, seen from above (components/item-symbol.tsx) — set in
 *  the appearance editor (MapAppearance.symbolStyle). Absent = by its footprint: a long piece is a row
 *  of candles on a bar, anything else its candles round a stem, which is what every row drew before
 *  there was a choice. The count is still the row's `arms` — candles, cylinders, glasses — so the
 *  plan and the packing list agree on how many there are. */
export type CandleStyle = "ring" | "row" | "tiered" | "sleeves" | "cluster" | "floating" | "pillars" | "powder" | "lantern" | "fire";

export const CANDLE_STYLES: CandleStyle[] = ["ring", "row", "tiered", "sleeves", "cluster", "floating", "pillars", "powder", "lantern", "fire"];

export const CANDLE_STYLE_LABEL: Record<CandleStyle, string> = {
  ring: "קנים במעגל",
  row: "קנים בשורה",
  tiered: "קומות (קריסטל)",
  sleeves: "שרוולי זכוכית",
  cluster: "מקבץ צילינדרים",
  floating: "נר צף",
  pillars: "נרות עמוד במגש",
  powder: "נרות אבקה",
  lantern: "פנס",
  fire: "תעלת אש",
};

export const CANDLE_STYLE_HINT: Record<CandleStyle, string> = {
  ring: "קנים שיוצאים מעמוד מרכזי לכל הכיוונים — פמוט פלורידה, קנדלברה עגולה",
  row: "קנים במישור אחד, כמו פמוט 5 קנים קלאסי — מלמעלה הם קו",
  tiered: "שתי טבעות נרות ונר במרכז, עם נטיפי קריסטל — פמוט 13 או 25 קנים",
  sleeves: "כל נר בתוך שרוול/הוריקן זכוכית",
  cluster: "צילינדרי זכוכית בגדלים שונים, נר עמוד בכל אחד — מקבץ סוליטר",
  floating: "צילינדר זכוכית עם מים ונר צף",
  pillars: "נרות עמוד על מגש או צלחת",
  powder: "כוסות מלאות שעווה גרגירית ופתיל",
  lantern: "פנס מרובע עם נר בתוכו",
  fire: "מבער אש לאורך השולחן — שולחן אש",
};

export const isCandleStyle = (s: string | undefined): s is CandleStyle => !!s && (CANDLE_STYLES as string[]).includes(s);

/** What KIND of chuppah, seen from above: four poles under a canopy (the default), or a round
 *  colonnade — columns on a ring under an entablature, draped at the back (a rotunda / "קוליסאום"). */
export type ChuppahStyle = "canopy" | "rotunda";

export const CHUPPAH_STYLES: ChuppahStyle[] = ["canopy", "rotunda"];

export const CHUPPAH_STYLE_LABEL: Record<ChuppahStyle, string> = {
  canopy: "4 עמודים וגגון",
  rotunda: "עמודים במעגל (רוטונדה)",
};

/** The drawing style of a candlestick or a chuppah (the two pictures with more than one version
 *  besides a chair, which has chairStyleOf). Undefined = the category's default picture. */
export function drawStyleOf(product: Product | undefined): CandleStyle | ChuppahStyle | undefined {
  const s = product?.appearance?.symbolStyle;
  if (!product || !s) return undefined;
  if (product.category === "candlesticks") return isCandleStyle(s) ? s : undefined;
  if (product.category === "chuppahs") return (CHUPPAH_STYLES as string[]).includes(s) ? (s as ChuppahStyle) : undefined;
  return undefined;
}

/** How far a cloth shows past the tabletop seen from above — the fall of the fabric, not its full
 *  drop to the floor, which hangs straight down and is invisible on a plan. A runner hanging over a
 *  table's end shows the same. */
export const CLOTH_DROP_MM = 90;
