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
  style?: ElementStyle; // free-form per-table look (fill/stroke/dash); absent = the renderer's default
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

/** Where a ceiling item hangs. When this is set, `position` is derived from the rod and ignored —
 *  the same contract WallSpan has, and for the same reason: the rod belongs to the PROPERTY, so a
 *  hall re-surveyed at /halls has to carry its chandeliers with it rather than leave them at old
 *  millimetres in mid-air.
 *
 *  A point, not a span, because that is what the thing is: a drape is pinned along a wall by both
 *  ends, a chandelier hangs off one fixing. Widening WallSpan to cover both would give every reader
 *  two optional ids to disambiguate for no gain.
 *
 *  A `rigId` that no longer resolves is ignored on read — the item falls back to its last free
 *  position — exactly like a dangling wallId. */
export interface RigHang {
  rigId: string;
  t: number; // 0..1 along the rod; always 0 on a single hanging point
  dropMm?: number; // how far below the rod it hangs; absent = flush to the rod
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
  position: Point; // free point for floor/ceiling; offset within table otherwise
  rotation: number;
  scale: number;
  /** Wall-anchored items (curtains). When set, `position` is ignored — the wall places it. */
  span?: WallSpan;
  /** Ceiling items hung on one of the venue's rods. When set, `position` is ignored — see RigHang. */
  hang?: RigHang;
  /** Stretch items sized on the plan rather than in the catalog (a carpet). Overrides the product's
   *  footprint; absent means "the size the catalog gives it". */
  sizeMm?: { widthMm: number; depthMm: number };
  /** The group this item belongs to. For anything that is not a table this means one thing only:
   *  select one and you have selected all of them, drag one and they all move. Two staging decks
   *  that make a single stage are not two decks the designer wants to nudge apart by accident. */
  groupId?: string;
  /** Where this sits in the floor stack — higher draws later, so higher is nearer the eye. See
   *  lib/design-document/stacking.ts, which owns what the number means; absent is the common case
   *  and falls back to a default per kind (rug behind table behind object), which is exactly how
   *  everything drew before this field existed. */
  order?: number;
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
