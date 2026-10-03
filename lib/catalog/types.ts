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
  | "stadium"
  | "half-circle"
  | "quarter-circle"
  | "crescent"
  | "arc"
  | "oval-ring"
  | "horseshoe"
  | "triangle"
  | "trapezoid"
  | "hexagon"
  | "octagon"
  | "u-shape"
  | "rounded-u"
  | "custom";

/** The order the drawer offers them in: the three a catalog is mostly made of, then the curved
 *  tables a hall actually owns, then the polygons, then the ח — the one shape here that is a run of
 *  furniture rather than a single top — then "draw it yourself". */
export const MAP_SHAPES: MapShape[] = [
  "rect",
  "circle",
  "ellipse",
  "stadium",
  "half-circle",
  "quarter-circle",
  "crescent",
  "arc",
  "oval-ring",
  "horseshoe",
  "triangle",
  "trapezoid",
  "hexagon",
  "octagon",
  "u-shape",
  "rounded-u",
  "custom",
];

export const SHAPE_LABEL: Record<MapShape, string> = {
  rect: "מלבן",
  circle: "עיגול",
  ellipse: "אליפסה",
  stadium: "קפסולה (אובל)",
  "half-circle": "חצי עיגול",
  "quarter-circle": "רבע עיגול",
  crescent: "סהר (סרפנטינה)",
  arc: "קשת חלולה",
  "oval-ring": "אליפסה חלולה",
  horseshoe: "פרסה",
  triangle: "משולש",
  trapezoid: "טרפז",
  hexagon: "משושה",
  octagon: "מתומן",
  "u-shape": "צורת ח",
  "rounded-u": "צורת ח מעוגלת",
  custom: "מותאם",
};

/** The shapes measured by ONE round number rather than a width and a depth — everything cut from a
 *  circle. Given two free numbers a חצי עיגול is half an ELLIPSE the moment they are not exactly 2:1,
 *  and nobody owns a half-ellipse table; so its size is its circle's, and its box follows from it.
 *  Stored as `diameterMm` for all four; the quarter is ASKED as a radius (its box is one radius
 *  square), which is what ROUND_FIELD says. Rows from before this carry width/depth instead, and
 *  roundSizeMm (lib/studio/footprint.ts) reads those. */
export const usesDiameter = (shape: MapShape): boolean =>
  shape === "circle" || shape === "arc" || shape === "half-circle" || shape === "quarter-circle";

/** How the one round number is asked: its label, and how many mm of diameter one mm typed is. */
export const ROUND_FIELD: Partial<Record<MapShape, { label: string; factor: number }>> = {
  circle: { label: "קוטר", factor: 1 },
  "half-circle": { label: "קוטר", factor: 1 },
  arc: { label: "קוטר חיצוני", factor: 1 },
  "quarter-circle": { label: "רדיוס", factor: 2 },
};

/** The ring an "arc" is cut from, beyond its outer diameter (Dimensions.diameterMm).
 *
 *  `sweepDeg` is how much of the circle it is — 180 a half ring, 120 a third, 90 a quarter — and
 *  `bandMm` is how wide the band is, outer edge to inner edge: the depth of the tables it is made
 *  of. A band as wide as the radius leaves no hole, and the shape is a solid slice. */
export interface ArcSpec {
  sweepDeg: number;
  bandMm: number;
}

export const ARC_SWEEP = { min: 30, max: 330, default: 180 } as const;

/** The band the hollow curved shapes are built as, and where they open.
 *
 *  An "oval-ring" (אליפסה חלולה) is a stadium of the item's width × depth — semicircular ends joined
 *  by straight runs — hollowed to a band `bandMm` wide, outer edge to inner edge: the depth of the
 *  modules it is made of. The other two are its halves, each standing against the wall its cut side
 *  faces: a "horseshoe" (פרסה) is the half cut along the SHORT axis — two legs to the wall on the
 *  left and the round end away from it — and a "rounded-u" (צורת ח מעוגלת) the half cut along the
 *  LONG axis — the straight run on top and a quarter arc down each side to the wall along the bottom.
 *  Between them they are what a modular curved bar actually is (quarter-arc segments and straights),
 *  which neither the solid אליפסה nor the circular קשת could draw; and like every derived shape they
 *  are re-derived from their two numbers, so stretching one on the plan adds straight run and leaves
 *  the band alone.
 *
 *  `gapMm` is the opening the staff get in by. On the oval it is cut out of the bottom straight run
 *  (on an oval taller than it is wide, the run on its right), at that run's left end, its middle or
 *  its right end (`gapAt`), and it is either a real opening — at least RING_GAP.min wide unless the
 *  run itself is shorter — or 0: CLOSED, a bar entered through a lift-up hatch. A closed ring is an
 *  outline with a hole in it, which no single outline is, so it is drawn as a keyhole — the two caps
 *  of the opening laid on top of each other — and a hairline marks the hatch where `gapAt` says.
 *  On the horseshoe it is how far the bottom leg stops short of the open side (0 = it reaches the
 *  wall); `gapAt` is not read, the entrance is always at the wall end of the bottom leg, and a
 *  placement is turned or mirrored to put it elsewhere. The rounded ח reads neither: its sides ARE
 *  the arcs, and a shorter arc is not a shape its modules can build.
 *
 *  Parts ADD and never subtract, so a smaller circle dropped inside a bigger one is not a hole;
 *  that is the attempt these shapes replace. */
export interface RingSpec {
  bandMm: number;
  gapMm?: number;
  gapAt?: "left" | "center" | "right";
}

export const RING_GAP = { min: 600, default: 900 } as const;

/** A shape added to an item beside its base shape — a bar that is a counter with a round end, a
 *  head table with a piece set against it. The item is still ONE catalog row, dragged, priced and
 *  counted once; the parts only change what the plan draws.
 *
 *  `x`/`y` place the part's centre relative to the BASE shape's centre, in mm, and `rotation` turns
 *  it about its own centre. Its size is read exactly the way a base shape's is: a diameter for the
 *  diameter shapes (usesDiameter), a width and a depth for everything else. No "custom" part — a
 *  hand-drawn outline belongs to the base, where the outline editor is. */
export interface ShapePart {
  id: string;
  shape: Exclude<MapShape, "custom">;
  widthMm?: number;
  depthMm?: number;
  diameterMm?: number;
  arc?: ArcSpec;
  ring?: RingSpec;
  x: number;
  y: number;
  rotation: number;
}

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
  arc?: ArcSpec; // iff shape === "arc"; absent = a half ring (ARC_SWEEP.default) with a default band
  ring?: RingSpec; // iff shape is a hollow curved one (RingShape, lib/studio/footprint.ts); absent = defaults (ringSpecOf)
  parts?: ShapePart[]; // shapes drawn beside the base one, as one item (see ShapePart)
  /** The sides nobody sits on — a head table facing the room, a table against a wall. Indices into
   *  seatSides() (lib/studio/seating.ts) of the item's resolved footprint. The chairs are not lost:
   *  the seat count is what the packing list orders, so they move to the sides that are open. A
   *  placed table may override this per table (DesignTable.blockedSides). */
  blockedSides?: number[];
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

/** One measurement the plan may change, and how far. Millimetres, like every size in the catalog. */
export interface ResizeRange {
  minMm: number;
  maxMm: number;
}

/** A product the plan may SIZE rather than a product that comes in sizes.
 *
 *  A stage is a run of decks, a straight bar is a run of modules, a sofa is so many seats wide: the
 *  catalog used to hold one row per size (במה 200×100 … במה 800×400, six rows of the same deck), and
 *  every one of those rows is a price, a stock count and a drawing to keep in step. A resizable row
 *  is ONE item the designer stretches on the plan to the size this event needs, in the steps it is
 *  actually built in.
 *
 *  The measurements are the item's BOUNDING BOX — the same width × depth every derived shape is
 *  drawn from (see MapShape), so a resized ח is still a ח and a resized hexagon is still regular in
 *  the way it was before. A round shape has one measurement: `width` is its diameter and `depth`
 *  is never asked.
 *
 *  The price does not follow the size on its own. A product priced ליחידה costs the same at any
 *  size, because "unit" is what the designer said it is; one that should cost more when it is bigger
 *  is priced למ"ר or למטר, and the quote then multiplies by the size drawn (lib/design-document/
 *  measure.ts already does, for any placement carrying `sizeMm`). The drawer says so beside the
 *  switch rather than guessing a rule. */
export interface ResizeSpec {
  /** The module it is built in. Every size the plan writes is a whole number of these. */
  stepMm: number;
  /** Absent = that side is fixed at the catalog's measurement. */
  width?: ResizeRange;
  depth?: ResizeRange;
}

export const RESIZE_DEFAULT_STEP_MM = 100;

/** One flower in an arrangement's spec: which, and how many stems of it per arrangement. The list
 *  these make up (Product.flowers) is the florist's order in rows — "12 ורדים, 5 פיאוניות" as two
 *  lines that multiply, not as a sentence in the free spec. Its sum IS the arrangement's stem count
 *  (lib/catalog/flowers.ts), so an arrangement with lines never types a total of its own. */
export interface FlowerLine {
  id: string;
  name: string; // "ורד", "פיאוני", "אקליפטוס" — singular, as a spec lists them
  qty: number; // stems of it in ONE arrangement; whole and positive
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
  /** The flower spec — only for a category that takes one (CategoryDef.flowers). Absent = no spec,
   *  and the stem count, if any, is the typed `categoryFields.stems`. See FlowerLine. */
  flowers?: FlowerLine[];
  unitPrice?: number; // feeds the quote (F-4.6); never shown in operational output
  priceUnit?: PriceUnit; // what unitPrice is per; absent = "unit"
  styleTags: string[];
  variants: Variant[];
  appearance?: MapAppearance; // absent → derived from dimensions (see resolveFootprint)
  visibility?: Visibility; // absent = private (see Visibility) — publishing is always explicit
  archived?: boolean; // F-4.5: hidden from the catalog but still resolvable by placements
  /** Absent = a thing of one size (see ResizeSpec). */
  resize?: ResizeSpec;
  /** SAFETY DISTANCE — the clear floor this item needs around it, in mm, and the one number the
   *  studio warns against when anything else comes closer: a table's chairs and the aisle behind
   *  them, a drape kept away from candles, the front of a stage kept clear.
   *  Absent = no rule. Most of a catalog has no opinion about its neighbours, and a halo round every
   *  candlestick would bury the few that do. */
  clearanceMm?: number;

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
