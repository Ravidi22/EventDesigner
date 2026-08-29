// UI-facing catalog types. This is the seam: today it feeds a seed array, later the
// same shapes come from mapping Drizzle rows (lib/db/schema.ts) — swap happens here only.
import type { Layer, Point } from "../design-document/types";
import type { EdgeCurve } from "../studio/hall";
import type { ElementStyle } from "../element-style";

export type { Layer };

/** What an item is drawn as on the plan.
 *
 *  Three of these are SVG primitives the renderer draws directly (rect, circle, ellipse) and one is
 *  an outline the designer drew by hand (custom). Everything between them is DERIVED: the outline
 *  is built from the item's own width and depth (lib/studio/footprint.ts), so a new shape costs no
 *  new column, and a חצי עיגול 120×60 is exactly what its two measurements say it is.
 *
 *  EVERY DERIVED SHAPE'S BOUNDING BOX IS ITS width × depth. That is the invariant that keeps the
 *  drawer's two number fields honest — a shape whose real extent lived somewhere other than its
 *  measurements would put the designer back where "the numbers I type don't change the plan"
 *  started. `npm run check:footprint` asserts it for every member of this union. */
export type MapShape =
  | "rect"
  | "circle"
  | "ellipse"
  | "half-circle"
  | "quarter-circle"
  | "crescent"
  | "triangle"
  | "trapezoid"
  | "hexagon"
  | "octagon"
  | "u-shape"
  | "custom";

/** The order the drawer offers them in: the three a catalog is mostly made of, then the curved
 *  tables a hall actually owns, then the polygons, then the ח — the one shape here that is a run of
 *  furniture rather than a single top — then "draw it yourself". */
export const MAP_SHAPES: MapShape[] = [
  "rect",
  "circle",
  "ellipse",
  "half-circle",
  "quarter-circle",
  "crescent",
  "triangle",
  "trapezoid",
  "hexagon",
  "octagon",
  "u-shape",
  "custom",
];

export const SHAPE_LABEL: Record<MapShape, string> = {
  rect: "מלבן",
  circle: "עיגול",
  ellipse: "אליפסה",
  "half-circle": "חצי עיגול",
  "quarter-circle": "רבע עיגול",
  crescent: "סהר (סרפנטינה)",
  triangle: "משולש",
  trapezoid: "טרפז",
  hexagon: "משושה",
  octagon: "מתומן",
  "u-shape": "צורת ח",
  custom: "מותאם",
};

// Map appearance (studio 2D plan). Footprint is always drawn at true scale; `content`
// is what appears inside it. Every shape but "custom" reads from `dimensions` (single source
// of truth) — only "custom" stores its own outline. Outline coordinates are in mm and
// are rendered centered on their bounding box (no pre-centering required).
export interface MapAppearance {
  shape: MapShape;
  outline?: Point[]; // required iff shape === "custom"
  edgeCurves?: (EdgeCurve | null)[]; // per-edge bezier bow, aligned to outline; null/absent = straight edge (see hall.ts)
  content: "icon" | "name" | "none";
  icon?: string; // Lucide name, iff content === "icon"
  style?: ElementStyle; // free-form footprint look (fill/stroke/dash); absent = the renderer's default
}

// A shade of a product — "זהב", "בורדו". This IS the colour list: a designer who stocks a drape in
// four colours adds four variants, and a placement's `variantId` already records which one is on the
// plan. `swatch` is what makes that colour real rather than a word — the picker shows it, the plan
// draws the item in it. Absent = a version that isn't a colour (a size, a finish), which still reads
// fine everywhere as a name.
export interface Variant {
  id: string;
  name: string; // shade / version, e.g. "זהב"
  swatch?: string; // CSS colour (hex) — the actual shade, for the picker and the plan
  imageUrl?: string;
  unitPrice?: number; // inherits the product price when undefined (F-4.2)
  archived?: boolean; // F-4.5: a placed variant is archived, never deleted
}

/** What a price is per. A drape bought by the running metre and stretched across a 14m wall is not
 *  one unit of anything — the quote multiplies by what was actually drawn (lib/outputs/quote.ts).
 *  Absent = "unit", which is every ordinary countable product. */
export type PriceUnit = "unit" | "m" | "m2";

/** Who may see a catalog item.
 *
 *  `private` — it exists only in this studio's catalog. `public` — other studios may see it.
 *
 *  Absent means private, and that direction is not an accident: an item with no stated opinion about
 *  who may see it stays in. Publishing is something the designer does on purpose, in the drawer,
 *  one product at a time. */
export type Visibility = "private" | "public";

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: "פרטי",
  public: "ציבורי",
};

export const VISIBILITY_HINT: Record<Visibility, string> = {
  private: "רק בקטלוג שלך.",
  public: "מעצבים אחרים יוכלו לראות את הפריט. המחיר שלך נשאר פרטי.",
};

export const PRICE_UNIT_LABEL: Record<PriceUnit, string> = {
  unit: "ליחידה",
  m: "למטר",
  m2: 'למ"ר',
};

/** What kind of stock an item is — and therefore which question the procurement forecast may
 *  honestly ask about it (lib/suppliers/procurement.ts).
 *
 *  `owned` — the studio has it and lays it again at every event. Never summed over a month: one
 *  30m carpet used at four events is 30m of asset, not 120m to buy. Its report is peak concurrent
 *  demand against `stockQty`.
 *
 *  `consumable` — used up. The sum over a window IS the order.
 *
 *  `rented` — brought in for one event and returned. Neither summed nor peaked: a list of order
 *  lines, one per event and date.
 *
 *  Absent = `owned`, which is what most of a designer's catalog is. */
export type StockKind = "owned" | "consumable" | "rented";

export const STOCK_KIND_LABEL: Record<StockKind, string> = {
  owned: "בבעלות",
  consumable: "מתכלה",
  rented: "בהשכרה",
};

export const STOCK_KIND_HINT: Record<StockKind, string> = {
  owned: "יש לך את זה ואתה מציב שוב בכל אירוע. ברכש נבדק השיא — כמה צריך ביום העמוס ביותר.",
  consumable: "נגמר אחרי השימוש. ברכש מסוכם כמה צריך להזמין בטווח.",
  rented: "מובא מספק לאירוע אחד וחוזר. ברכש מופיע כשורת הזמנה לכל אירוע בנפרד.",
};

// A stretch product (a drape, a carpet — see CategoryDef.sizing) has no width or depth here: it is
// cut or laid to whatever it has to cover, so its size is a property of the PLACEMENT, not of the
// catalog entry. Height still matters — a 2.8m drape and a 4m drape are different stock.
export interface Dimensions {
  diameterMm?: number;
  widthMm?: number;
  depthMm?: number;
  heightMm: number; // required — needed for phase-2 3D (R-3)
}

export interface Product {
  id: string;
  name: string;
  imageUrl?: string;
  category: string; // CategoryDef id
  layer: Layer;
  dimensions: Dimensions;
  // F-4.3: structured fields exist ONLY where they multiply quantities (arms, seats);
  // every other trait goes in the free-text spec.
  categoryFields: Record<string, string | number>;
  spec?: string; // free specification text ("6 מודולים, 2 מדרגות")
  unitPrice?: number; // feeds the quote (F-4.6); never shown in operational output
  priceUnit?: PriceUnit; // what unitPrice is per; absent = "unit"
  styleTags: string[];
  variants: Variant[];
  appearance?: MapAppearance; // absent → derived from dimensions (see resolveFootprint)
  visibility?: Visibility; // absent = private (see Visibility) — publishing is always explicit
  archived?: boolean; // F-4.5: hidden from the catalog but still resolvable by placements

  // ── Procurement (lib/suppliers/) ─────────────────────────────────────────────────────────────
  supplierId?: string; // who it is bought or rented from
  /** What the STUDIO pays, per `priceUnit` — the mirror of `unitPrice`, which is what the CLIENT
   *  pays. ⚠ Internal: never rendered in /present, the client portal, a quote or a packing list. */
  costPrice?: number;
  stockKind?: StockKind; // absent = "owned" (see StockKind)
  /** How many the studio owns. Only meaningful for `owned`, and absent is a real answer — it means
   *  "I haven't counted", and the forecast then shows demand without claiming a shortfall. */
  stockQty?: number;
  orderUnit?: string; // what the SUPPLIER sells in ("גבעולים") when it isn't the placed unit
  orderFactor?: number; // order-units per placed unit; absent = 1
}
