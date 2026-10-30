// Category registry (F-4.3): a structured field exists ONLY when it multiplies quantities in
// the packing list — chandelier/candlestick arms (candles = fixtures × arms), standard chairs
// per table type. Every other trait lives in the product's free-text spec.
import {
  Armchair,
  Table2,
  Lightbulb,
  Flame,
  Frame,
  Square,
  Flower2,
  Boxes,
  Grid2x2,
  Footprints,
  PanelBottom,
  RectangleHorizontal,
  Fence,
  PanelTop,
  Accessibility,
  Layers2,
  Wine,
  Tent,
  Blinds,
  Rainbow,
  Milestone,
  Sprout,
  Sofa,
  Droplets,
  Shapes,
  Amphora,
  TreeDeciduous,
  Flower,
  Leaf,
  Wheat,
  Combine,
  Lamp,
  DoorOpen,
  type LucideIcon,
} from "lucide-react";
import type { Layer, ResizeSpec, StockKind } from "./types";

export interface CategoryField {
  key: string;
  label: string;
  suffix?: string; // what the multiplication yields ("נרות")
}

/** What a NEW product of this category starts out drawn as: "round" seeds a circle, the other two
 *  a rectangle. It is a seed and nothing more.
 *
 *  It used to decide which size FIELDS the drawer showed, and that is how a product could carry a
 *  diameter while being drawn as a rectangle that read neither of its numbers — the footprint fell
 *  back to MIN_FOOTPRINT_MM and drew a 60×60 box no measurement in the form could change. The SHAPE
 *  picks the fields now (app/(app)/catalog/product-drawer.tsx), so a product's dimensions are always
 *  measurements of the thing it is drawn as. */
export type DimsMode = "round" | "box" | "both";

// The department a designer browses by (F-4.3 catalog UX) — coarser than CategoryDef, which
// stays the real, structural unit (studio icon, dims mode, count-multiplier fields). A handful
// of fine categories share one department (e.g. tablecloths/centerpieces/candlesticks all live
// under "table design"), so this is a many-to-one label on top of CATEGORIES, not a replacement
// for it — existing products keep their exact `category`, only the catalog filter groups by this.
export type CategoryGroupId =
  | "grp-seating"
  | "grp-stages"
  | "grp-bars"
  | "grp-chuppahs"
  | "grp-table-design"
  | "grp-ceiling-design"
  | "grp-flowers"
  | "grp-accessories"
  | "grp-composites";

export interface CategoryGroup {
  id: CategoryGroupId;
  label: string;
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  { id: "grp-seating", label: "הושבה" },
  { id: "grp-stages", label: "במות" },
  { id: "grp-bars", label: "ברים ומזנונים" },
  { id: "grp-chuppahs", label: "חופות" },
  { id: "grp-table-design", label: "עיצוב שולחן" },
  { id: "grp-ceiling-design", label: "עיצובי תקרה" },
  // The flowers THEMSELVES — stems, greens, dried — as a florist sells them: what a supplier
  // publishes on the marketplace, and what an arrangement's spec rows are picked from.
  { id: "grp-flowers", label: "פרחים וירק" },
  { id: "grp-accessories", label: "מוצרים נלווים" },
  // Items MADE OF other items (lib/catalog/composition.ts) — a dressed head table, a lounge corner.
  // A department of their own: they are found by what they are for, not by any one of their parts.
  { id: "grp-composites", label: "פריטים מורכבים" },
];

// What a placed item of this category attaches to, and therefore how it is drawn and moved:
//
//   free   — an object standing somewhere. It has a position and that is all. (Every category
//            that isn't one of the two below.)
//   wall   — a drape. It hangs ON a wall of the venue, spanning some run of it, and follows that
//            wall if the plan is later redrawn. Dropping one lands it across the whole wall.
//   table  — a cloth. It covers ONE table, and is drawn as that table's surface rather than as an
//            object sitting on it — which is also why it consumes no table area (catalog-resolver).
export type Anchor = "free" | "wall" | "table";

// Whether the catalog knows this item's size:
//
//   fixed   — it is a thing of a size. A 1.8m round cloth fits a 1.8m round table and nothing else.
//   stretch — it is cut/laid to fit: the size is drawn per placement and the catalog stores none.
//             These are the ones priced by the metre or the m² (Product.priceUnit).
export type Sizing = "fixed" | "stretch";

export interface CategoryDef {
  id: string;
  label: string;
  group: CategoryGroupId;
  defaultLayer: Layer;
  icon: LucideIcon;
  dims: DimsMode;
  fields: CategoryField[]; // count-multipliers only (F-4.3); always numeric
  anchor?: Anchor; // absent = "free"
  sizing?: Sizing; // absent = "fixed"
  /** What a NEW product of this category starts as in the procurement model — absent = "owned",
   *  which is most of a designer's catalog. It is a SEED for the drawer, not a lookup: the value is
   *  then stored on the product, so a studio that rents its chairs rather than owning them can say
   *  so without the category disagreeing with the row. */
  defaultStock?: StockKind;
  /** פחת for a consumable of this category when the row sets none (Product.spareRate): cut flowers
   *  and the arrangements made of them lose stems to the bucket, so the florist's order is always a
   *  little over the count. Whole percent. */
  defaultSpareRate?: number;
  /** Absent/true = the drawer asks for height and will not save without one (most of the catalog —
   *  it is what the 3D visualisation stands the item up with). False = this category has no height
   *  of its own to ask for: a cloth drapes over its table's height rather than carrying one, and a
   *  rug lies flat on the floor it is drawn onto. Independent of `sizing: "stretch"` — a stretch
   *  drape's height is its DROP, the one thing that still tells two rolls of curtain apart, so that
   *  category keeps asking. */
  needsHeight?: boolean;
  /** The height a NEW product of this category starts with, in mm — a seed for the drawer like
   *  `defaultStock`, stored on the row and editable. Absent = the drawer starts empty and asks. Only
   *  where nearly every row agrees: an event table is 75cm (the base library's tables are too). */
  defaultHeightMm?: number;
  /** Clicking this item on the studio's rail arms it for ONE placement rather than keeping it armed
   *  until Escape (see `placesOnce`). For the things an event has one of — a stage, a chuppah —
   *  where the click after the first is far likelier to be "now let me edit it" than "another one". */
  placeOnce?: boolean;
  /** This category's products carry a flower spec (Product.flowers): rows of flower × stems, edited
   *  in the drawer, summed into the `stems` count-multiplier, and fanned out per flower on the
   *  packing list and the florist's order. A category with this MUST also have the `stems` field —
   *  the list is what fills it. Turn it on for an arch or a chuppah the day a studio specs those by
   *  the stem; nothing else needs to change. */
  flowers?: boolean;
  /** How the plan may stretch a product of this category that says nothing about it itself
   *  (Product.resize absent): a banquette is a run along a stage or a wall and is laid to the length
   *  the room needs, and asking every studio to switch that on row by row is asking them to type what
   *  the category already knows. The row's own `resize` wins when set — this is the default under
   *  it, read through `resizeSpecOf` (lib/studio/footprint.ts). */
  defaultResize?: ResizeSpec;
}

/** Whether click-to-place lets go after one placement. Everything else stays armed until Escape,
 *  because the catalog is mostly things laid in runs: forty tables, forty cloths, a row of columns.
 *
 *  Stretch items let go too, without a flag: a rug or a drape is drawn to its size the moment it
 *  lands, and that needs it selected with its handles up — not a second one stamped beside it.
 *  Shift on the click keeps any of them armed for the one event that really does want two. */
export function placesOnce(c: CategoryDef | undefined): boolean {
  return !!c && (c.placeOnce === true || c.sizing === "stretch");
}

export const CATEGORIES: CategoryDef[] = [
  { id: "tables", label: "שולחנות", group: "grp-seating", defaultLayer: "floor", icon: Table2, dims: "both", defaultHeightMm: 750, fields: [{ key: "seats", label: "כמות כסאות תקנית", suffix: "כסאות" }] },
  { id: "chairs", label: "כיסאות", group: "grp-seating", defaultLayer: "floor", icon: Armchair, dims: "box", fields: [] },
  // Lounge seating — a corner of sofas and armchairs round a low table, not a place laid for dinner.
  // No seat field: a sofa is counted as one sofa on the packing list, and nothing multiplies off it.
  { id: "sofas", label: "ספות", group: "grp-seating", defaultLayer: "floor", icon: Sofa, dims: "box", fields: [] },
  { id: "tablecloths", label: "מפות", group: "grp-table-design", defaultLayer: "table", icon: Square, dims: "both", fields: [], anchor: "table", needsHeight: false },
  // The one category that defaults to consumable: a centrepiece is flowers far more often than it
  // is the vase they stand in, and a designer who stocks reusable pieces changes one field.
  { id: "centerpieces", label: "מרכזי שולחן", group: "grp-table-design", defaultLayer: "table", icon: Flower2, dims: "round", fields: [], defaultStock: "consumable" },
  // Flowers, bought by the stem and arranged into one piece. The stem count is a count-multiplier
  // like a chandelier's arms and behaves as one everywhere: the packing list prints "גבעולים ×
  // arrangements" and procurement orders that many (lib/suppliers/actions.ts). It is DERIVED when
  // the arrangement carries a flower spec (`flowers` — rows of flower × stems, lib/catalog/
  // flowers.ts) and typed only when it carries none. How many stems the supplier sells in a bunch
  // is a different question, and it stays where it lives — orderUnit.
  { id: "flower-arrangements", label: "סידורי פרחים", group: "grp-table-design", defaultLayer: "table", icon: Sprout, dims: "round", fields: [{ key: "stems", label: "כמות גבעולים בסידור", suffix: "גבעולים" }], defaultStock: "consumable", defaultSpareRate: 10, flowers: true },
  // The VESSEL — a vase, an urn, a footed bowl, a glass cylinder — as the studio stocks it: bought
  // once and set again at every event, so owned. Not a centrepiece: that is what is arranged in it,
  // used up and priced as a design, and a catalog that filed the 80cm gold vase there would count it
  // as consumed every time it went out.
  { id: "vases", label: "אגרטלים וכלים", group: "grp-table-design", defaultLayer: "table", icon: Amphora, dims: "round", fields: [] },
  // One flower, as the florist sells it: a cut stem, a sprig of greenery, a dried plume. The size
  // is the HEAD seen from above (what the plan draws — lib/catalog/flower-kinds.ts knows the
  // usual one per kind), the height the stem's length, neither required. Consumable, and what an
  // arrangement's spec rows are made of; a supplier organisation publishes these on the
  // marketplace, and a studio that copies one can still drop it on a table as a single head.
  { id: "flowers", label: "פרחים", group: "grp-flowers", defaultLayer: "table", icon: Flower, dims: "round", fields: [], needsHeight: false, defaultStock: "consumable", defaultSpareRate: 10 },
  { id: "greenery", label: "ירק וענפים", group: "grp-flowers", defaultLayer: "table", icon: Leaf, dims: "round", fields: [], needsHeight: false, defaultStock: "consumable", defaultSpareRate: 10 },
  { id: "dried-flowers", label: "פרחים יבשים", group: "grp-flowers", defaultLayer: "table", icon: Wheat, dims: "round", fields: [], needsHeight: false, defaultStock: "consumable", defaultSpareRate: 10 },
  { id: "chandeliers", label: "שנדליירים", group: "grp-ceiling-design", defaultLayer: "ceiling", icon: Lightbulb, dims: "round", fields: [{ key: "arms", label: "כמות קנים", suffix: "נרות" }] },
  { id: "candlesticks", label: "פמוטים", group: "grp-table-design", defaultLayer: "table", icon: Flame, dims: "box", fields: [{ key: "arms", label: "כמות קנים", suffix: "נרות" }] },
  // Table lamps — a turned base under a linen shade, set along a knights table like candlesticks.
  // Not a candlestick: nothing burns and nothing is packed per arm, so no count-multiplier.
  { id: "lamps", label: "מנורות ואהילים", group: "grp-table-design", defaultLayer: "table", icon: Lamp, dims: "round", fields: [] },
  { id: "rugs", label: "שטיחים", group: "grp-accessories", defaultLayer: "floor", icon: Frame, dims: "box", fields: [], sizing: "stretch", needsHeight: false },
  { id: "stages", label: "במות", group: "grp-stages", defaultLayer: "floor", icon: Boxes, dims: "box", fields: [], placeOnce: true },
  // The loose modules a stage is built from — a 244×122 sheet, the 244×80/60/40 strips that finish a row's depth.
  // The stage-fill tool (lib/studio/stage-fill.ts) builds from these AND from the studio's own
  // platforms in "stages": a studio that owns a 400×300 builds a 7×4 from it and a few decks.
  { id: "stage-decks", label: "פלטות במה", group: "grp-stages", defaultLayer: "floor", icon: Grid2x2, dims: "box", fields: [] },
  // What a stage needs besides its decks, counted off the stage itself (lib/design-document/stage.ts)
  // rather than placed by hand: a flight of STAIRS per opening the designer put on the plan, and the
  // SKIRT that hides the legs along every open side — measured, so a skirt is usually priced למטר.
  { id: "stage-stairs", label: "מדרגות במה", group: "grp-stages", defaultLayer: "floor", icon: Footprints, dims: "box", fields: [] },
  { id: "stage-skirts", label: "חצאיות במה", group: "grp-stages", defaultLayer: "floor", icon: PanelBottom, dims: "box", fields: [] },
  // The other two ways an open stage edge is finished (StageEdgeKind): a banquette people sit on
  // along the outside of the edge, and a barrier on it. Both counted by the metre off the stage.
  //
  // A banquette also stands FREE on the floor (Placement.bench, lib/design-document/bench.ts): a run
  // of chairs along its back with its top as their table, or a sofa sat on facing the room, numbered
  // like a table. No count-multiplier field, deliberately — its chairs come from the PLAN (how long
  // it was stretched to, which sides are laid), never from a number typed on the row. Table height,
  // and stretched along its length by default: 60cm to 12m in 10cm steps, its depth fixed.
  {
    id: "stage-benches",
    label: "בנקטים",
    group: "grp-stages",
    defaultLayer: "floor",
    icon: RectangleHorizontal,
    dims: "box",
    fields: [],
    defaultHeightMm: 750,
    defaultResize: { stepMm: 100, width: { minMm: 600, maxMm: 12000 } },
  },
  { id: "stage-barriers", label: "מחסומי במה", group: "grp-stages", defaultLayer: "floor", icon: Fence, dims: "box", fields: [] },
  // A wall standing on a stage edge (a flower wall, a draped frame) by the metre; a ramp by the ramp;
  // and what covers the deck (carpet, dance floor) by the square metre of stage.
  { id: "stage-backdrops", label: "קירות רקע לבמה", group: "grp-stages", defaultLayer: "floor", icon: PanelTop, dims: "box", fields: [] },
  { id: "stage-ramps", label: "רמפות נגישות", group: "grp-stages", defaultLayer: "floor", icon: Accessibility, dims: "box", fields: [] },
  { id: "stage-surfaces", label: "משטחי במה", group: "grp-stages", defaultLayer: "floor", icon: Layers2, dims: "box", fields: [], needsHeight: false },
  { id: "bars", label: "ברים", group: "grp-bars", defaultLayer: "floor", icon: Wine, dims: "both", fields: [] },
  { id: "chuppahs", label: "חופות", group: "grp-chuppahs", defaultLayer: "floor", icon: Tent, dims: "both", fields: [], placeOnce: true },
  { id: "curtains", label: "ווילונות", group: "grp-accessories", defaultLayer: "ceiling", icon: Blinds, dims: "box", fields: [], anchor: "wall", sizing: "stretch" },
  { id: "arches", label: "קשתות", group: "grp-accessories", defaultLayer: "floor", icon: Rainbow, dims: "box", fields: [] },
  // A gate — two columns joined overhead by a lintel (a square entrance) or an arch (a round one),
  // set where the guests come in or at the head of the aisle. Not an arch: an arch is a dressed
  // frame, a gate is built — and the plan has to show the passage between its columns.
  { id: "gates", label: "שערים", group: "grp-accessories", defaultLayer: "floor", icon: DoorOpen, dims: "box", fields: [] },
  // Columns and pillars — a Roman column, a display plinth, a pedestal a bust stands on.
  { id: "columns", label: "עמודים", group: "grp-accessories", defaultLayer: "floor", icon: Milestone, dims: "round", fields: [] },
  // Water features: a fountain is round far more often than not.
  { id: "fountains", label: "מזרקות", group: "grp-accessories", defaultLayer: "floor", icon: Droplets, dims: "round", fields: [] },
  // Trees and standing greenery — an artificial blossom tree, an olive in a planter. Measured by its
  // CANOPY, because that is what the plan has to keep clear of tables and what the client sees.
  { id: "trees", label: "עצים וצמחייה", group: "grp-accessories", defaultLayer: "floor", icon: TreeDeciduous, dims: "round", fields: [] },
  // The long tail. "אחר" is the box for the thing the catalog has no name for yet — a prop, a sign,
  // a sculpture, a photo booth — so it is drawn on the plan at its measured size and counted on the
  // packing list rather than left off both for want of a category. Both shapes, because it is
  // whatever it is.
  { id: "other", label: "אחר", group: "grp-accessories", defaultLayer: "floor", icon: Shapes, dims: "both", fields: [] },
  // A composite (Product.composition): never placed itself — placing one pastes its parts — so it
  // has no height, no price of its own and nothing that multiplies.
  { id: "composites", label: "פריטים מורכבים", group: "grp-composites", defaultLayer: "floor", icon: Combine, dims: "box", fields: [], needsHeight: false },
];

export const CATEGORY_BY_ID: Record<string, CategoryDef> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
);

/** A RUNNER — a strip of fabric laid along a table, over its cloth — is filed with the cloths
 *  (מפות), but it is not the table's cloth: a table wears one cloth AND a runner on top of it. Told
 *  apart by its shape, which no cloth has: a strip, at most 70cm wide and at least two and a half
 *  times as long (an organza runner is 300×40; the narrowest cloth is the table's own width plus its
 *  drop). A row with no measurements is read by its name. Derived rather than a category of its own,
 *  so the runners already in a catalog are runners without anyone moving them. */
export function isRunner(p: { category: string; name: string; dimensions: { widthMm?: number; depthMm?: number } }): boolean {
  if (p.category !== "tablecloths") return false;
  const { widthMm: w, depthMm: d } = p.dimensions;
  if (w && d) return Math.min(w, d) <= 700 && Math.max(w, d) >= 2.5 * Math.min(w, d);
  return /ראנר|רנר|runner/i.test(p.name);
}

/** Where a product sits on the plan — its category's anchor, except that a runner is not the table's
 *  cover but an item laid ON the table, so it is "free" (an item on the table's top, like a
 *  centrepiece) and never replaces or is replaced by the cloth. */
export function anchorOf(p: { category: string; name: string; dimensions: { widthMm?: number; depthMm?: number } }): Anchor {
  if (isRunner(p)) return "free";
  return CATEGORY_BY_ID[p.category]?.anchor ?? "free";
}

// The meeting draws the room in two passes (lib/meeting/steps.ts), and each one wants a different
// half of the catalog on the rail: first the furniture that decides where people sit and look, then
// the design that goes on top of it. Departments, not fine categories — the split is about what the
// designer is thinking about, and it stays coarse enough to hold new categories without edits here.
//
// Chuppahs sit in the design pass on purpose: it is the object the client picked out of the gallery
// a moment earlier, not a piece of furniture the seating plan works around.
//
// Composites are in both: a dressed head table is the hall pass's table and the design pass's
// dressing at once, and placing one never leaves a composite row on the plan to be filtered by pass.
export const HALL_PASS_GROUPS: CategoryGroupId[] = ["grp-seating", "grp-stages", "grp-bars", "grp-composites"];
export const DESIGN_PASS_GROUPS: CategoryGroupId[] = [
  "grp-table-design",
  "grp-ceiling-design",
  "grp-chuppahs",
  "grp-flowers",
  "grp-accessories",
  "grp-composites",
];

export const LAYERS: { id: Layer; label: string }[] = [
  { id: "table", label: "שולחן" },
  { id: "floor", label: "רצפה" },
  { id: "ceiling", label: "תקרה" },
];

export const LAYER_LABEL: Record<Layer, string> = {
  table: "שולחן",
  floor: "רצפה",
  ceiling: "תקרה",
};

/** The studio's style vocabulary — what the drawer offers when tagging a product, and what the
 *  catalog and the studio rail filter by.
 *
 *  It lives here, with the rest of the taxonomy, because it is not sample data: it survived the
 *  catalog's move to Postgres untouched, and the products that carry these tags are real rows now.
 *  It sat in the seed file only because that is where it was first written. */
export const STYLE_TAGS = ["קלאסי", "מודרני", "טרופי", "שחור-לבן", "כפרי", "זוהר", "רומנטי"];

/** The list above is a STARTING vocabulary, not the whole of it: the product drawer lets a designer
 *  type a tag of their own, so every surface that offers tags reads them off the catalog it is
 *  showing rather than off the constant — otherwise a tag exists on a product that nothing can
 *  filter by. Order is stable: the built-ins first, the studio's own after them. */
export const styleTagsOf = (products: readonly { styleTags: string[] }[]): string[] => [
  ...new Set([...STYLE_TAGS, ...products.flatMap((p) => p.styleTags)]),
];
