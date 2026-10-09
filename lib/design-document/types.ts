// ADR-4: the Design Document is a pure data structure that knows nothing about display.
// The 2D canvas, the operational PDF, and the phase-2 3D scene are all renderers of THIS.
// Shared verbatim between client (canvas) and server (packing list, quote) — principle #2.
// DesignTable.style (below) doesn't violate this: it's the designer's colour/dash *choice* for a
// table — design intent, serialisable, renderer-agnostic plain data — not a rendering concern.
// resolveStyle (lib/element-style.ts) is what turns it into pixels, and it lives outside this file.
import type { ElementStyle } from "../element-style";

export type Layer = "table" | "floor" | "ceiling";

export interface Point {
  x: number;
  y: number;
}

// A table on the plan, drawn in the meeting's hall-sketch stage.
export interface DesignTable {
  id: string;
  type: string; // "round" | "rectangle" | "knight" ... (drives smart-apply, F-3.3)
  number: number; // human-facing table number for the placement map
  position: Point;
  rotation: number; // degrees
  diameterMm?: number;
  widthMm?: number;
  depthMm?: number;
  seats?: number;
  /** How many of this table's chairs are spoken for. Drawn on the plan under the number as `4/12`,
   *  which is the one question a seating plan is repeatedly asked and could never answer: is this
   *  table full, and where is the room I still have.
   *
   *  TYPED, against this codebase's standing preference for derived facts — the same exception
   *  events.confirmedAt earns, and for the same reason. There is no guest list in this app to
   *  reduce, so there is nothing to derive it FROM; a count that is only ever wrong when the
   *  designer stops maintaining it is not the "status somebody forgot to flip" failure, because
   *  nothing downstream orders, bills or schedules off it. It is a note on the drawing.
   *
   *  Absent on every table drawn before this existed, and on a fresh drop — a new table starts
   *  empty. It is NOT clamped to `seats`: 13 at a table for 12 happens, and the plan says so in
   *  alert ink rather than quietly refusing the number the designer just typed. */
  seated?: number;
  /** The sides of THIS table nobody sits at, overriding its catalog row's (MapAppearance.blockedSides)
   *  — a table pushed against a wall on this plan. Indices into seatSides() of its footprint. Absent
   *  = inherit the catalog's; an empty list = open all round, whatever the catalog says. */
  blockedSides?: number[];
  /** Which chair stands round THIS table — a row of the catalog's `chairs` category. Absent = the
   *  studio's default chair (lib/catalog/chairs.ts), which is every table ever drawn: most rooms are
   *  one chair, and the plan only has to say so where a table differs (the head table's armchairs).
   *  It is what the chairs sheet names per table and what the packing list counts the chairs as. */
  chairVariantId?: string;
  style?: ElementStyle; // free-form per-table look (fill/stroke/dash); absent = the renderer's default
  /** Drawn as its own mirror image — see Placement.mirrored, which this means exactly. */
  mirrored?: boolean;
  /** The size THIS table was stretched to on the plan, for a catalog row that allows it
   *  (Product.resize) — a banquet run laid out to the length of the room. The bounding box of its
   *  shape, like Placement.sizeMm. Absent = the catalog's size, which is every table ever drawn. */
  sizeMm?: { widthMm: number; depthMm: number };
  /** The group this table belongs to, if the designer pushed several together and said they are one
   *  table now. A grouped table draws NO number of its own — the group carries the one number they
   *  share — and the chairs go round the outside of the lot rather than into the seam between two
   *  tables nobody can sit in. See DesignGroup. */
  groupId?: string;
  /** Where this table sits in the floor stack — see lib/design-document/stacking.ts and the note on
   *  Placement.order. A rug, a table and a candlestick are one stack, because what a designer
   *  overlaps is not sorted by category: a head table stands on a staging deck and a plinth stands
   *  on a rug. Absent on every table ever drawn, which is what keeps the default look. */
  order?: number;
  /** The catalog row this table is a copy of, set when it was dragged in off the rail. Absent on
   *  tables placed by the old toolbar tool, which is why every reader has to keep a fallback.
   *
   *  It earns its place twice: the plan draws the item's REAL outline through it (a חצי עיגול is
   *  not the 120×60 box its dimensions describe), and it is what puts a table on the packing list
   *  and the quote — a table drawn on the plan is a table the crew has to bring, and until tables
   *  came out of the catalog there was no row to count. */
  variantId?: string;
  /** The items on this table were placed by the designer — in the table's focus mode, or by one of
   *  its arrange actions — and each one's `position` is where it stands, in this table's own frame.
   *  Absent = laid out automatically every time it is drawn (lib/design-document/dressing.ts), which
   *  is every table dressed before this existed and every one dressed by "apply to all tables". */
  arranged?: boolean;
}

/** A drape's run along one wall of the venue, as fractions of that wall's length (0 = the wall's
 *  start node, 1 = its end). Fractions rather than millimetres on purpose: the wall belongs to the
 *  property, not to this document, so a wall later redrawn at /halls carries its curtain with it
 *  instead of leaving it hanging in the air. `wallId` may dangle if the wall is deleted — the
 *  renderer draws nothing and the inspector says so, same contract as a zone id. */
export interface WallSpan {
  wallId: string;
  from: number; // 0..1 along the wall
  to: number; // 0..1, always > from
}

// One product-variant placed somewhere. Targets a table (table layer), a wall (a drape), or a free
// point. Which of those it is comes from the product's category (CategoryDef.anchor), never from
// guessing at which fields happen to be set.
export interface Placement {
  id: string;
  variantId: string;
  layer: Layer;
  quantity: number;
  tableId?: string; // set when layer === "table"
  /** A free point for floor/ceiling. On a table: the offset from the table's centre IN THE TABLE'S
   *  OWN FRAME (before its turn and mirror) — read only when the table is `arranged`. */
  position: Point;
  rotation: number;
  scale: number;
  /** Wall-anchored items (curtains). When set, `position` is ignored — the wall places it. */
  span?: WallSpan;
  /** Stretch items sized on the plan rather than in the catalog (a carpet), and resizable ones
   *  (Product.resize) stretched to this event's size. Overrides the product's footprint — for a
   *  shaped item it is the BOUNDING BOX the shape is redrawn into; absent means "the size the
   *  catalog gives it". */
  sizeMm?: { widthMm: number; depthMm: number };
  /** Set on a design item standing on a stage's BANQUETTE (StageEdgeItem kind "bench") rather than on
   *  a table: the stage, and which of its edge items. Its `position` is ignored — the bench places it,
   *  spread along its length with the rest of its dressing — so it travels with the stage. Removing
   *  the stage removes what stood on it, as removing a table does. */
  perch?: { stageId: string; itemId: string };
  /** Drawn as its own mirror image, flipped across its own width before it is turned — a corner
   *  sofa with its long arm on the other side, a bar whose service end faces the other wall. One
   *  flag, not two: a flip top-to-bottom is a flip side-to-side and half a turn, and the mirror
   *  actions (lib/design-document/mirror.ts) write it that way. Absent = as the catalog draws it. */
  mirrored?: boolean;
  /** The group this item belongs to. For anything that is not a table this means one thing only:
   *  select one and you have selected all of them, drag one and they all move. Two staging decks
   *  that make a single stage are not two decks the designer wants to nudge apart by accident. */
  groupId?: string;
  /** Where this sits in the floor stack — higher draws later, so higher is nearer the eye. See
   *  lib/design-document/stacking.ts, which owns what the number means; absent is the common case
   *  and falls back to a default per kind (rug behind table behind object), which is exactly how
   *  everything drew before this field existed. */
  order?: number;
  /** Set on a STAGE: one platform built from the studio's decks (see StageBuild). Its footprint is
   *  this outline rather than the catalog's, and it counts on the quote and the packing list as the
   *  decks it is built from — never as one of `variantId`. Absent on everything else. */
  stage?: StageBuild;
}

/** A stage as the designer drew it: an outline, the side that faces the room, and which decks it may
 *  be built from. The DECKS are not stored — which deck goes where is derived from these three
 *  (lib/design-document/stage.ts), every time, by the one function the canvas, the quote and the
 *  packing list all call. Resize the outline and the decks follow; there is no second copy of the
 *  build to fall out of step with the drawing.
 *
 *  The outline is in the placement's own frame, centred on its box and before its turn — so moving,
 *  turning, flipping, grouping and copying a stage are the ordinary placement actions. A rectangle
 *  is stored with its front as edge 0 along the TOP (−y) side, which is what lets the ordinary
 *  resize handles stretch it. */
export interface StageBuild {
  outline: Point[];
  /** Edge i runs outline[i] → outline[i+1]; this one faces the room, and rows are laid from it. */
  front: number;
  /** Variant ids of the decks it may be built from — the choice made in the fill tool. */
  decks: string[];
  /** The deck surface above the floor, mm. Absent = the tallest chosen deck's own height. The same
   *  decks stand at 20cm or 80cm on their adjustable legs, so this is the stage's, not the deck's. */
  heightMm?: number;
  /** Raised parts of the stage — a drum riser, a DJ booth — each laid with its own decks at its own
   *  height. They PARTITION the floor with the base rather than stacking on it, which is how a crew
   *  builds one: the riser's decks stand on longer legs where the base's would have been. */
  levels?: StageLevel[];
  /** What stands against each OPEN edge — stairs, a banquette, a barrier (StageEdgeItem). Every open
   *  edge is meant to be covered by one of the three, so nobody walks off a stage: a new stage gets
   *  stairs along every side that is not against a wall, and the bar says where a stretch is bare.
   *  (Named for the first kind it held; it holds all three.) */
  stairs?: StageStair[];
  /** The catalog rows the quote counts a flight of stairs and a metre of skirt as. Absent = the
   *  studio has none, and the stage is still drawn with both; the quote then says nothing of them. */
  stairsVariant?: string;
  skirtVariant?: string;
  /** …and a metre of banquette and of barrier, of backdrop, and a ramp. */
  benchVariant?: string;
  barrierVariant?: string;
  backdropVariant?: string;
  rampVariant?: string;
  /** What the deck is covered with — a carpet, a dance floor — priced by the square metre of the
   *  stage (and its levels). Absent = bare decks. */
  surfaceVariant?: string;
  /** Fill the outside corner where two runs of stairs (or two banquettes) meet. Absent = yes; a
   *  stage whose corners should stay open says false. */
  corners?: boolean;
  /** Decks may reach past the outline where a deck covers more of the drawn floor than it hangs
   *  over (lib/studio/stage-fill.ts, FillOptions.exceed): a 6.90m front built as seven metres of
   *  deck rather than six and a bare strip. The designer's choice, made in the fill tool and
   *  changeable on the stage's bar; absent = the outline is the line. */
  exceed?: boolean;
}

/** A stage saved to be used again — its shape, levels, edges, height, decks and finishes, and what
 *  stood on its banquettes — under the studio's own name for it. Stored per studio
 *  (studio_settings.stage_templates), placed from the stage tool. */
export interface StageTemplate {
  id: string;
  name: string;
  stage: StageBuild;
  /** Design items on its banquettes: which banquette, which item, how many. */
  dressing?: { itemId: string; variantId: string; quantity: number }[];
}

/** A table's dressing saved under the studio's own name for it — "גולד רומנטי": the cloth, the
 *  centrepiece, the candlesticks, how many of each and where each stood — to be put on any table of
 *  any event in one press. Stored per studio (studio_settings.table_designs). The items name catalog
 *  VARIANTS, like every placement; one archived since is still placed and still counted. */
export interface TableDesign {
  id: string;
  name: string;
  /** Whether the items stand where they were saved (`position`, in the table's frame) or are laid
   *  out automatically on whatever table wears it — see DesignTable.arranged. */
  arranged?: boolean;
  items: { variantId: string; quantity: number; position: Point; rotation: number; scale: number }[];
}

/** A raised part of a stage, in the stage's own frame. */
export interface StageLevel {
  id: string;
  outline: Point[];
  heightMm: number;
}

/** What one stretch of an edge is finished with. STAIRS climb onto the stage from outside it; a
 *  BENCH (בנקט) is a low seat along the outside of the edge — a step people sit on, and a surface the
 *  designer dresses with flowers and candles; a BARRIER is a rail along the edge itself, on the
 *  stage; a BACKDROP (קיר רקע) is a wall standing on the edge — a flower wall, a draped frame —
 *  and may stand on a side against the venue's wall too; a RAMP climbs at 1:12 for a wheelchair.
 *  Absent on a StageStair = stairs, which is what every item was before the others. */
export type StageEdgeKind = "stairs" | "bench" | "barrier" | "backdrop" | "ramp";

/** One edge item: on edge `edge` of the stage's outline (or of level `level`'s), centred `t` of the
 *  way along it. Stairs and benches stand outside the edge; a barrier stands on it. */
export interface StageStair {
  id: string;
  kind?: StageEdgeKind;
  /** A bench's depth from the edge, mm. Absent = BENCH_DEPTH_MM. */
  depthMm?: number;
  /** A bench's seat height, mm. Absent = BENCH_HEIGHT_MM (never above the stage it stands against). */
  heightMm?: number;
  /** How many chairs stand on a bench, when the designer said. Absent = one per SEAT_WIDTH_MM; 0 =
   *  none. They are drawn on it, counted as seats, and packed as chairs. */
  seats?: number;
  level?: string;
  edge: number;
  t: number;
  widthMm: number;
  /** Runs the whole length of its side — a stage front that is stairs from end to end. Follows the
   *  side when the stage is resized, which a typed width could not. `widthMm` is kept underneath, so
   *  turning it off gives back the width it had. */
  full?: boolean;
  /** How many steps up, when the designer said — the studio's own flight has four whatever the
   *  height. Absent = derived from the height it climbs (risers of at most 18cm). */
  risers?: number;
}

/** Where THIS EVENT puts one of the venue's own features — the rolling bar pushed against the far
 *  wall for a wedding and into the middle of the room for a launch.
 *
 *  Stored as an OFFSET from wherever /halls has the feature, never as an absolute point, for the
 *  same reason a drape stores fractions of its wall (see WallSpan): the venue owns the geometry,
 *  and a property re-surveyed at /halls has to carry every event's arrangement with it rather than
 *  leaving a bar hanging in the air three metres outside a corrected wall. `rotationDeg` is likewise
 *  a turn ON TOP of the feature's own facing.
 *
 *  This is the ONE thing an event may say about the property it is held in, and it is deliberately
 *  the smallest one: it moves a thing that was always meant to be moved. It cannot resize a
 *  feature, cannot delete one, cannot add one, and touches no wall, door or zone — those are the
 *  property, drawn once at /halls, and an event is designed inside them. A `featureId` that no
 *  longer resolves is ignored on read, exactly like a dangling wallId. */
export interface FeaturePlacement {
  featureId: string;
  dx: number; // mm from where the venue puts it
  dy: number;
  rotationDeg?: number; // degrees on top of the venue's own facing
}

/** Several things on the plan the designer has said are ONE thing.
 *
 *  Membership lives on the members (`groupId`), because that is where the question is always asked —
 *  "is this thing grouped, and with what". What lives HERE is the only fact that belongs to the
 *  group rather than to any member: the single number a set of pushed-together tables carries.
 *
 *  It has to be stored rather than derived from the members. "The lowest member's number" reads
 *  fine until the designer renumbers the group: writing that number back onto the lowest member can
 *  make a different member the lowest, and the group silently jumps to a third number. A group of
 *  non-tables leaves it absent — a stage has nothing to be numbered.
 *
 *  Ungrouping touches nothing but this row and the members' `groupId`, so every table's own number
 *  is still there underneath, exactly as it was before they were pushed together. */
export interface DesignGroup {
  id: string;
  number?: number;
}

export interface Calibration {
  /** Maps document units to real millimetres (F-3.4). Copied from the VENUE plan when the event is
   *  opened — scale is a property of the property, so it is measured there, once, and never asked
   *  again per event. A plan drawn with the wall tools is already in millimetres: 1. */
  mmPerUnit: number;
}

// F-5.3: a table the designer explicitly diverged from smart-apply for this variant.
// Recorded when a table-layer placement is removed; a later bulk re-apply skips these.
export interface SmartApplyException {
  tableId: string;
  variantId: string;
}

// The whole document. Stored as JSONB in design_documents.content; the packing list
// and quote are pure aggregations over `placements`.
export interface DesignDocumentContent {
  calibration: Calibration;
  tables: DesignTable[];
  placements: Placement[];
  exceptions?: SmartApplyException[];
  /** Absent on every document drawn before grouping existed, which is why every reader defaults it. */
  groups?: DesignGroup[];
  /** Per-event arrangements of the venue's own movable features. Absent on every document drawn
   *  before this existed — and on every event that simply left the room as the property has it,
   *  which is most of them. See FeaturePlacement. */
  features?: FeaturePlacement[];
}

export function emptyDocument(mmPerUnit = 1): DesignDocumentContent {
  return { calibration: { mmPerUnit }, tables: [], placements: [] };
}

/** A document as it comes back from the database (lib/studio/actions.ts): the drawing, plus the two
 *  facts that only exist once it is stored.
 *
 *  `version` counts issued outputs, not saves — the studio autosaves continuously and that does not
 *  mint versions. `sealed` says this exact content is pinned by a quote or an export and will never
 *  change again; the next edit opens `version + 1`. See the note on the table in lib/db/schema.ts. */
export interface StoredDocument {
  version: number;
  content: DesignDocumentContent;
  sealed: boolean;
}
