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
  | "lamp"
  | "gate";

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
  // Two columns joined overhead — a straight lintel or an arch — that guests walk through.
  gates: "gate",
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

// The other pictures with more than one version. Each list starts with its DEFAULT — what the
// category drew before there was a choice, stored as no style at all — so no existing row changes
// by itself. Like a chair's style, it is what the thing looks like from above; never a count.

/** A chandelier: arms and bulbs round a hub (the default), crystal tiers, a hoop of lights, a
 *  sputnik, a cluster of pendant globes, a linear piece, a ring dressed in flowers. */
export type ChandelierStyle = "arms" | "crystal" | "hoop" | "sputnik" | "pendants" | "linear" | "floral";
/** A sofa: back, arms and cushions (the default), a buttoned Chesterfield, an L corner, a curved
 *  one, armless modules, a backless upholstered bench. */
export type SofaStyle = "classic" | "chesterfield" | "corner" | "curved" | "armless" | "ottoman";
/** A vessel — the 3D builder's own forms (lib/scene/items.ts VesselForm) plus the plain vase. */
export type VaseStyle = "vase" | "cylinder" | "trumpet" | "urn" | "pedestal" | "bowl";
export type TreeStyle = "canopy" | "olive" | "blossom" | "palm" | "cypress" | "topiary" | "potted";
export type ColumnStyle = "classic" | "smooth" | "square" | "pedestal";
export type FountainStyle = "classic" | "tiered" | "jets" | "bowl";
export type ArchStyle = "floral" | "corner" | "draped" | "bare";
export type LampStyle = "empire" | "drum" | "mushroom" | "globe";
/** A gate's ENTRANCE: square under a straight lintel, or round under an arch. */
export type GateStyle = "square" | "arched";

export type DrawStyle =
  | CandleStyle
  | ChuppahStyle
  | ChandelierStyle
  | SofaStyle
  | VaseStyle
  | TreeStyle
  | ColumnStyle
  | FountainStyle
  | ArchStyle
  | LampStyle
  | GateStyle;

export interface SymbolStyleSet {
  /** The editor's heading over the tiles. */
  title: string;
  /** Every version, the default first. */
  styles: readonly DrawStyle[];
  label: Partial<Record<DrawStyle, string>>;
  hint?: Partial<Record<DrawStyle, string>>;
  /** What a tile draws the version at — a typical piece of it, not the row's own size, so a linear
   *  chandelier is long and a corner sofa is an L whatever the row being edited measures. */
  sample: (style: DrawStyle) => Footprint;
}

const circle = (diameterMm: number): Footprint => ({ kind: "circle", diameterMm });
const rect = (widthMm: number, depthMm: number): Footprint => ({ kind: "rect", widthMm, depthMm });

/** The pictures whose version the appearance editor offers as tiles (a chair's and a candlestick's
 *  have tiles of their own, an arrangement's form is lib/catalog/flower-draw.ts). */
export const SYMBOL_STYLES: Partial<Record<SymbolKind, SymbolStyleSet>> = {
  chuppah: {
    title: "סוג החופה",
    styles: CHUPPAH_STYLES,
    label: CHUPPAH_STYLE_LABEL,
    sample: () => circle(4200),
  },
  chandelier: {
    title: "סוג השנדליר",
    styles: ["arms", "crystal", "hoop", "sputnik", "pendants", "linear", "floral"],
    label: {
      arms: "קנים ונורות",
      crystal: "קריסטל בקומות",
      hoop: "טבעת אור",
      sputnik: "ספוטניק",
      pendants: "מקבץ גלובוסים",
      linear: "שנדליר אורך",
      floral: "טבעת פרחים",
    },
    hint: {
      arms: "זרועות מרכזיות ונורה או נר בקצה כל אחת — השנדליר הקלאסי",
      crystal: "טבעות של נטיפי קריסטל סביב הנורות",
      hoop: "חישוק אחד עם נורות לאורכו, תלוי בשלושה כבלים",
      sputnik: "כדור מרכזי ומוטות לכל הכיוונים עם נורה בקצה",
      pendants: "גלובוסים בגדלים שונים התלויים מאותה פלטה",
      linear: "מוט ארוך עם מנורות בשורה — מעל שולחן אבירים",
      floral: "חישוק עטוף פרחים וירק",
    },
    sample: (s) => (s === "linear" ? rect(1400, 320) : circle(900)),
  },
  sofa: {
    title: "סוג הספה",
    styles: ["classic", "chesterfield", "corner", "curved", "armless", "ottoman"],
    label: {
      classic: "ספה קלאסית",
      chesterfield: "צ׳סטרפילד",
      corner: "ספה פינתית",
      curved: "ספה מעוגלת",
      armless: "מודולרית",
      ottoman: "ספסל מרופד",
    },
    hint: {
      classic: "גב, ידית בכל צד וכריות ישיבה",
      chesterfield: "ידיות בגובה הגב וריפוד מכופתר",
      corner: "צורת ר — גב לאורך שני צדדים",
      curved: "ספה בקשת, הגב בצד החיצוני",
      armless: "מודולים בלי ידיות, צמודים זה לזה",
      ottoman: "בלי גב — פוף ארוך או ספסל מרופד",
    },
    sample: (s) => (s === "corner" ? rect(2400, 1700) : s === "curved" ? rect(2600, 1100) : s === "ottoman" ? rect(1400, 600) : rect(2100, 900)),
  },
  vase: {
    title: "צורת הכלי",
    styles: ["vase", "cylinder", "trumpet", "urn", "pedestal", "bowl"],
    label: {
      vase: "אגרטל",
      cylinder: "צילינדר",
      trumpet: "מרטיני",
      urn: "כד עם ידיות",
      pedestal: "קערה על רגל",
      bowl: "קערה",
    },
    hint: {
      cylinder: "צילינדר זכוכית ישר — רואים את התחתית דרכו",
      trumpet: "גביע רחב על רגל דקה — אגרטל מרטיני / חצוצרה",
      urn: "כד בטני עם שתי ידיות",
      pedestal: "קערה רדודה על רגל — קומפוט",
      bowl: "קערה נמוכה ורחבה",
    },
    sample: (s) => (s === "bowl" || s === "pedestal" ? circle(420) : s === "cylinder" ? circle(220) : circle(320)),
  },
  tree: {
    title: "סוג העץ",
    styles: ["canopy", "olive", "blossom", "palm", "cypress", "topiary", "potted"],
    label: {
      canopy: "עץ נוי",
      olive: "זית",
      blossom: "עץ פורח",
      palm: "דקל",
      cypress: "ברוש",
      topiary: "כדור גזום",
      potted: "צמח בעציץ",
    },
    hint: {
      canopy: "צמרת מלאה של אשכולות עלים",
      olive: "צמרת פתוחה וכסופה, גזע מפוצל",
      blossom: "צמרת מכוסה פריחה — דובדבן, שקד",
      palm: "כפות ארוכות מכתר אחד",
      cypress: "עץ צר וזקוף",
      topiary: "שיח גזום לכדור מושלם",
      potted: "עלים גדולים מעל עציץ",
    },
    sample: (s) => (s === "cypress" ? circle(900) : s === "topiary" || s === "potted" ? circle(1000) : circle(2400)),
  },
  column: {
    title: "סוג העמוד",
    styles: ["classic", "smooth", "square", "pedestal"],
    label: {
      classic: "עמוד רומי",
      smooth: "עמוד חלק",
      square: "עמוד מרובע",
      pedestal: "פודיום תצוגה",
    },
    hint: {
      classic: "פיר מחורץ על בסיס ריבועי",
      smooth: "פיר עגול חלק על בסיס עגול",
      square: "פיר מרובע עם כותרת",
      pedestal: "תיבה עם משטח עליון — לפסל, לעוגה או לסידור",
    },
    sample: (s) => (s === "square" || s === "pedestal" ? rect(450, 450) : circle(450)),
  },
  fountain: {
    title: "סוג המזרקה",
    styles: ["classic", "tiered", "jets", "bowl"],
    label: {
      classic: "אגן וקערה",
      tiered: "קומות",
      jets: "סילונים",
      bowl: "קערה גבוהה",
    },
    hint: {
      classic: "אגן מים וקערה במרכזו",
      tiered: "שלוש קערות זו מעל זו, המים יורדים ביניהן",
      jets: "בריכה עם סילונים בשורה",
      bowl: "קערה אחת על רגל, המים גולשים משפתה",
    },
    sample: (s) => (s === "jets" ? rect(2400, 1000) : s === "bowl" ? circle(1000) : circle(2000)),
  },
  arch: {
    title: "עיצוב הקשת",
    styles: ["floral", "corner", "draped", "bare"],
    label: {
      floral: "פרחים לכל האורך",
      corner: "פרחים בפינות",
      draped: "בד נשפך",
      bare: "שלד בלבד",
    },
    hint: {
      floral: "זר פרחים לאורך כל הקשת",
      corner: "מקבץ גדול בפינה אחת ומקבץ קטן בפינה שמנגד",
      draped: "בד שנשפך על הקשת בגלים",
      bare: "המסגרת עצמה — מתכת, עץ או ניאון",
    },
    sample: () => rect(2400, 600),
  },
  lamp: {
    title: "סוג האהיל",
    styles: ["empire", "drum", "mushroom", "globe"],
    label: {
      empire: "אהיל מתרחב",
      drum: "אהיל תוף",
      mushroom: "פטריה",
      globe: "גלובוס זכוכית",
    },
    hint: {
      empire: "אהיל צר למעלה ורחב למטה",
      drum: "אהיל ישר, אותו רוחב למעלה ולמטה",
      mushroom: "כיפה אטומה — מנורת פטריה",
      globe: "כדור זכוכית, הבסיס נראה דרכו",
    },
    sample: () => circle(400),
  },
  gate: {
    title: "צורת הכניסה",
    styles: ["square", "arched"],
    label: {
      square: "כניסה מרובעת",
      arched: "כניסה עגולה (קשת)",
    },
    hint: {
      square: "שני עמודים ומשקוף ישר ביניהם",
      arched: "שני עמודים וקשת עגולה ביניהם",
    },
    sample: () => rect(3000, 650),
  },
};

/** The drawing style of any picture that has versions besides a chair's (chairStyleOf): a
 *  candlestick's, or one of SYMBOL_STYLES. Undefined = the category's default picture. */
export function drawStyleOf(product: Product | undefined): DrawStyle | undefined {
  const s = product?.appearance?.symbolStyle;
  if (!product || !s) return undefined;
  if (product.category === "candlesticks") return isCandleStyle(s) ? s : undefined;
  const kind = SYMBOL_BY_CATEGORY[product.category];
  const set = kind ? SYMBOL_STYLES[kind] : undefined;
  return set && (set.styles as readonly string[]).includes(s) ? (s as DrawStyle) : undefined;
}

/** How far a cloth shows past the tabletop seen from above — the fall of the fabric, not its full
 *  drop to the floor, which hangs straight down and is invisible on a plan. A runner hanging over a
 *  table's end shows the same. */
export const CLOTH_DROP_MM = 90;
