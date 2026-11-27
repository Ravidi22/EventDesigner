// ADR-4: the ONE actions layer. No renderer mutates the document directly — every
// change is an action applied here. That constraint is what makes undo/redo nearly free.
import type { BenchSpec, ChairRows, DesignDocumentContent, DesignGroup, FeaturePlacement, Placement, PlacementClimb, DesignTable, Point, WallSpan, StageBuild } from "./types";
import type { PlacementCover } from "./types";
import { chairRowsCount, cleanRows } from "./chair-rows";
import type { ElementStyle } from "../element-style";
import { freeNumbers, numberedUnits } from "./groups";
import { carryHung } from "../studio/hang-over";
import { cleanBows, cleanCorners } from "../studio/rug-shape";
import { withRail, type Rail } from "../studio/rail";
import { cleanBorder, sameBorder, type Border } from "../catalog/border";
import { cleanAisle, type AislePlacement } from "../catalog/aisle";

/** Two small plain objects, key order aside. */
const sameJson = (x: object, y: object) => {
  const norm = (o: object) => JSON.stringify(Object.entries(o).sort(([p], [q]) => (p < q ? -1 : 1)));
  return norm(x) === norm(y);
};
import { cleanCover, detachCover, settleCovers } from "../studio/cover";

/** A table number as stored: whole and not negative (0 is the head table). Null for nothing usable. */
const tableNo = (n: number): number | null => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : null);

export type Action =
  | { type: "addTable"; table: DesignTable }
  | { type: "moveTable"; id: string; position: DesignTable["position"] }
  | { type: "removeTable"; id: string }
  | { type: "renumberTable"; id: string; number: number }
  // Take these tables out of the numbering (DesignTable.unnumbered), or put them back — a block by
  // all its tables at once. Back in, each takes a number nobody else shows (freeNumbers).
  | { type: "setTablesNumbered"; tableIds: string[]; numbered: boolean }
  /** Pin tables and items where they stand, or free them (DesignTable.locked / Placement.locked). */
  | { type: "setLocked"; refs: { kind: "table" | "placement"; id: string }[]; locked: boolean }
  | { type: "styleTable"; id: string; style: ElementStyle | undefined }
  // How many chairs go round this one table. Seeded from the catalog row when it was dropped, and
  // editable after: a head table seats what the family is, not what the product says.
  | { type: "setTableSeats"; id: string; seats: number }
  // How many of those chairs are spoken for. Deliberately NOT clamped to the seat count — a table
  // seating thirteen at twelve places is a thing that happens on the night, and the plan showing
  // 13/12 in alert ink is more use than a field that refuses the number.
  | { type: "setTableSeated"; id: string; seated: number }
  /** null = back to the catalog row's sides (see DesignTable.blockedSides). */
  | { type: "setTableBlockedSides"; id: string; sides: number[] | null }
  // Which chair goes round these tables — one action for a whole selection, one undo. null = back
  // to the studio's default chair (DesignTable.chairVariantId).
  | { type: "setTableChair"; ids: string[]; variantId: string | null }
  | { type: "addPlacement"; placement: Placement }
  | { type: "movePlacement"; id: string; position: Placement["position"] }
  // A whole selection dragged at once. ONE action rather than N, because N of them is N history
  // entries per animation frame — an undo that has to be pressed six hundred times to put a group
  // back where it was is not an undo. Tables and free placements travel together here for the same
  // reason they were selected together: the delta is shared, and the group is one thing while the
  // pointer is down.
  | { type: "moveMany"; moves: { kind: MovableKind; id: string; position: Point }[] }
  // Which way a thing FACES. A rectangular table set across the room rather than along it, a stage
  // turned to the corner it actually plays to. Both DesignTable and Placement have carried a
  // `rotation` since the document was first written and nothing could ever set it — every table
  // that has ever been drawn in this app is at 0°, because the only way to turn one was to pick a
  // catalog row whose width and depth happened to be the other way round.
  | { type: "rotateTable"; id: string; rotation: number }
  | { type: "rotatePlacement"; id: string; rotation: number }
  // A whole selection spun about one pivot: every member's new CENTRE and new facing, computed by
  // the handle and sent as one action. Absolute, like moveMany and for the same reason — a rotation
  // accumulated from per-frame deltas drifts, and drift in a rotation is a group that comes back
  // from a 360° sweep no longer square to the room it started square to.
  | { type: "rotateMany"; turns: { kind: MovableKind; id: string; position: Point; rotation: number }[] }
  // A selection turned into its own mirror image — each member's new centre, facing and flip,
  // computed by ./mirror.ts and written here as given. Absolute for the same reason rotateMany is.
  // A venue feature takes the position and facing and ignores the flip: an event may say where the
  // property's bar stands and which way it faces, never that it is now a different shape.
  | { type: "mirrorMany"; flips: { kind: MovableKind; id: string; position: Point; rotation: number; mirrored: boolean }[] }
  // A table stretched on the plan (Product.resize). null = back to the catalog's size.
  | { type: "resizeTable"; id: string; sizeMm: { widthMm: number; depthMm: number } | null }
  // A table swapped for another of the studio's tables — the client wants rounds of 12 instead of
  // the 180×90s. Not a remove+add, for the reason setPlacementVariant is not one: the table keeps its
  // id, number, group, place on the plan, facing, look, occupancy and everything dressed on it. What
  // goes is what described the OLD row — its size, seats, a stretch and the sides blocked by index
  // into its outline — replaced by the new row's. `position` when a block is re-closed around it.
  | { type: "retypeTable"; id: string; table: RetypedTable; position?: Point }
  | { type: "setPlacementQuantity"; id: string; quantity: number }
  // How big THIS one is drawn — a fuller arrangement on the head table, a smaller one on a cocktail
  // round. A drawing size, not a different product: the quote, the packing list and the order count
  // it as the row it is. Held to 30%–300%; 1 = the catalog's size.
  | { type: "setPlacementScale"; id: string; scale: number }
  /** The vase these arrangements stand in (lib/catalog/vessel.ts): a variant id, null = none on this
   *  plan, undefined = back to what their catalog row says. */
  | { type: "setPlacementVessel"; ids: string[]; vessel: string | null | undefined }
  /** A rug's or a cloth's contour on THIS plan (Placement.border, lib/catalog/border.ts): a contour of
   *  its own, null = none here whatever its row says, undefined = back to its row's ("כמו בקטלוג").
   *  Several ids: a block's cloths, every member at once. */
  | { type: "setPlacementBorder"; ids: string[]; border: Border | null | undefined }
  /** An aisle's own answers on this plan (lib/catalog/aisle.ts): `patch` is laid over what it carries;
   *  a field given as `null` goes back to its row's. */
  | { type: "setPlacementAisle"; ids: string[]; patch: { [K in keyof AislePlacement]?: AislePlacement[K] | null } }
  // How high THIS ceiling item hangs above the floor, mm (Placement.hangHeightMm). null = back to its
  // catalog row's default. A rigging fact, like scale a drawing one: nothing priced or packed reads it.
  | { type: "setPlacementHang"; id: string; heightMm: number | null }
  // Which table a ceiling item hangs OVER (Placement.over): read off what is under its hang point
  // when a drag of it ends, set by a drop over a table, cleared (null) over bare floor. From then on
  // the table carries it (settleHung below) and the focus mode arranges it.
  | { type: "setPlacementOver"; id: string; over: string | null }
  // A table's ceiling design hung over other tables — each copy already placed by the caller at the
  // same relative spot (lib/studio/hang-over.ts hungCopy), since only the caller has the tables'
  // sizes. "replace" takes down what already hangs over a target first; "add" hangs beside it,
  // skipping a variant the target already has above it.
  | { type: "hangOverTables"; hangs: { tableId: string; items: Omit<Placement, "id" | "over" | "tableId">[] }[]; mode: "add" | "replace" }
  // A free-standing flight or ramp's rise, steps or direction (Placement.climb), together with the
  // run that follows from them and where it now stands — its head kept in place
  // (lib/studio/climb-item.ts builds all three). One entry, because it was one number typed.
  | { type: "setPlacementClimb"; id: string; climb: PlacementClimb; sizeMm?: { widthMm: number; depthMm: number }; position?: Point }
  // Switching a placed item to another shade of the same product (F-4.2). Not a remove+add: the
  // item keeps its id, its place on the plan and the size it was stretched to — only its colour
  // changes, which is exactly what the designer is doing when the client says "in cream instead".
  | { type: "setPlacementVariant"; id: string; variantId: string }
  // A drape's run along its wall, or a moved/relaid one.
  | { type: "setPlacementSpan"; id: string; span: WallSpan }
  // A drape's RAIL (lib/studio/rail.ts) — its stretch slid or typed, a rod bent, a side flipped —
  // and its drop (null = to the floor). Writes `rail` and lets a legacy `span` go.
  | { type: "setPlacementRail"; id: string; rail: Rail; dropMm?: number | null }
  // A rug laid over a venue surface or a stage, or its margin changed (Placement.cover,
  // lib/studio/cover.ts — the shape is laid by settleCovers after this); null lets the link go and
  // keeps the shape it was laid in ("ניתוק מהמשטח").
  | { type: "setPlacementCover"; id: string; cover: PlacementCover | null }
  // A whole drawing put in place of this one — a saved sketch loaded (lib/studio/sketches.ts). The
  // calibration stays: it is the venue's, not the sketch's. One entry, so one Ctrl+Z brings back the
  // drawing it replaced.
  | { type: "loadDocument"; content: DesignDocumentContent }
  // A stretch item resized on the plan (a carpet's corners), or a resizable one stretched to size.
  // null = back to the catalog's size — the field goes, rather than a copy of the catalog's number
  // staying behind to go stale the day the catalog row is edited.
  | { type: "resizePlacement"; id: string; sizeMm: { widthMm: number; depthMm: number } | null }
  // A rug's sides curved (Placement.bows). null, or every side straight, takes the field away.
  | { type: "setPlacementBows"; id: string; bows: [number, number, number, number] | null }
  // A rug's corners rounded (Placement.corners). null, or every corner square, takes the field away.
  | { type: "setPlacementCorners"; id: string; corners: [number, number, number, number] | null }
  /** A קאנט's sides (Placement.edgeSides) — `null` = every side again. */
  | { type: "setPlacementEdgeSides"; id: string; sides: number[] | null }
  | { type: "removePlacement"; id: string }
  // A stage re-drawn, re-fronted, or stretched by its handles — its build, and where it now stands.
  // `mirrored: false` when the outline was re-drawn in the room: a new outline is already the way
  // round it was drawn, and flipping it again would build the stage backwards.
  | { type: "setPlacementStage"; id: string; stage: StageBuild; position?: Point; rotation?: number; mirrored?: boolean; scale?: number }
  // A design item put on (or taken off) a stage's banquette.
  | { type: "setPlacementPerch"; id: string; perch: { stageId: string; itemId: string } | null }
  // A STANDALONE banquette's sides, heights, number and occupancy (Placement.bench) — the whole spec,
  // replaced; null puts it back to the defaults. The caller merges, so one history entry is one edit.
  | { type: "setPlacementBench"; id: string; bench: BenchSpec | null }
  // A sofa counted as seating or not (Placement.notSeating, the bar's "לא נספר כישיבה") — the
  // studio's seating readout only (lib/catalog/sofa.ts).
  | { type: "setPlacementSeating"; ids: string[]; counted: boolean }
  // A chair set out as a BLOCK OF ROWS, or put back to one chair (null) — the spec and the count it
  // is, together (lib/design-document/chair-rows.ts): `quantity` = rows × chairs per row, so the
  // quote and the packing list count every chair. `position` keeps the front row where it stood.
  | { type: "setChairRows"; id: string; rows: ChairRows | null; position?: Point }
  // F-3.3 smart-apply, generalised: put this item on exactly these tables. The caller decides which
  // tables those are — every table of a type, every table on the plan, the ones the designer has
  // selected, the ones inside a zone. Two narrower actions (applyToTableType / applyToAllTables)
  // used to answer the first two of those and could not be made to answer the others; this is the
  // same body with the list lifted out, so it is one branch here instead of two.
  | { type: "applyToTables"; tableIds: string[]; placement: Omit<Placement, "id" | "tableId">; replaces?: string[] }
  // One table's WHOLE dressing onto others — the cloth, the centrepiece, the candlesticks, the
  // runner, in one press. A designer dresses one table until it is right and then wants the room to
  // match it; before this that was one smart-apply per item, and the fifth one was always the one
  // that got forgotten.
  //
  // "add" leaves what a target already wears and gives it what it lacks, honouring any recorded
  // divergence (F-5.3). "replace" makes the target identical to the source and CLEARS its
  // exceptions: an explicit "make these match that one" outranks a divergence recorded weeks ago,
  // and silently honouring the old one would read as the button being broken.
  | { type: "copyDressing"; fromTableId: string; toTableIds: string[]; mode: "add" | "replace"; replaces?: string[] }
  // Where the items on one table stand, in its own frame (lib/design-document/dressing.ts) — a drag in
  // the table's focus mode, or an arrange action. Writing any of them marks the table ARRANGED: from
  // then on it is drawn as placed rather than laid out automatically. The caller sends every item on
  // the table, so freezing the automatic layout and moving one item are the same single action.
  | { type: "arrangeDressing"; tableId: string; positions: { id: string; position: Point }[] }
  // The same across a BLOCK of tables, which is dressed as the one table it is: each item where it
  // stands, in the frame of the table it now stands on — which may be another table of the block than
  // before (a candlestick slid across the seam of a head table belongs to the half it is on now).
  // Every table named is marked arranged; the caller sends every item on them, as above.
  | { type: "arrangeOnTables"; positions: { id: string; tableId: string; position: Point }[] }
  // These items worn by this ONE table, each already placed by the caller in the table's own frame —
  // what a block's dressing comes to on each of its members when it is carried onto another table or
  // block (app/(app)/studio/dressing-units.ts). The same rules as copyDressing; and "replace" with
  // nothing to wear leaves the table bare, which is what "make it match" means for a member of a
  // block nothing lands on.
  | { type: "wearItems"; tableId: string; items: Omit<Placement, "id" | "tableId">[]; arranged?: boolean; mode: "add" | "replace"; replaces?: string[] }
  // Back to the automatic layout: the table forgets it was arranged, and its items' offsets go.
  | { type: "resetDressing"; tableId: string }
  // Several things become one: selecting any of them selects all, dragging any drags all, and a set
  // of tables carries a single number as though it were the one larger table it now is.
  | { type: "group"; groupId: string; refs: { kind: "table" | "placement"; id: string }[]; number?: number }
  | { type: "ungroup"; groupId: string }
  | { type: "renumberGroup"; groupId: string; number: number }
  // Which thing on the floor is in front of which. A plain ASSIGNMENT rather than a "front"/"back"
  // instruction, because working out what front means needs the whole floor stack AND the catalog
  // question of whether a placement is a rug or an object — neither of which a pure reducer over one
  // document can answer. The policy lives in ./stacking.ts, is self-checked there, and hands the
  // answer here. Same shape, and the same reason, as moveMany and rotateMany being absolute.
  | { type: "restack"; assign: { kind: "table" | "placement"; id: string; order: number }[] }
  // Where THIS EVENT stands one of the venue's own movable features. An offset from the property's
  // own position, never an absolute point — see FeaturePlacement and ./features.ts.
  | { type: "arrangeFeature"; featureId: string; dx: number; dy: number; rotationDeg?: number }
  | { type: "arrangeFeatures"; arrangements: FeaturePlacement[] }
  // Put it back where the property has it: a deleted row, not a remembered number.
  | { type: "resetFeature"; featureId: string }
  // Take movable features out of THIS event's room, and bring them back — a flag on the event's
  // row (FeaturePlacement.removed); the venue never loses anything. Bringing one back keeps where
  // this event last had it.
  | { type: "removeFeatures"; featureIds: string[] }
  | { type: "restoreFeatures"; featureIds: string[] };

/** The three kinds of thing on the plan that have a free position of their own, and so can be
 *  dragged and turned as a set. A cloth and a drape are not among them: one is its table's surface
 *  and the other belongs to a wall, so neither has a centre a shared delta could move. */
export type MovableKind = "table" | "placement" | "feature";

/** What a table takes from the catalog row it is a copy of — written on drop, and again on a swap. */
export type RetypedTable = Pick<DesignTable, "type" | "variantId"> &
  Pick<Partial<DesignTable>, "diameterMm" | "widthMm" | "depthMm" | "seats">;

/** The middle of a rod's posts' box — where a placement on it says it is. */
function railMiddle(points: readonly { x: number; y: number }[]): { x: number; y: number } {
  const xs = points.map((q) => q.x);
  const ys = points.map((q) => q.y);
  return { x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2), y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2) };
}

export function apply(doc: DesignDocumentContent, action: Action): DesignDocumentContent {
  // …and a carpet laid over a stage or a venue surface goes where that goes, in the same entry
  // (lib/studio/cover.ts settleCovers — the venue it reads is the one the studio primed).
  return settleCovers(doc, settleHung(doc, reduce(doc, action)));
}

/** What hangs over a table goes where the table goes. Run after EVERY action rather than inside the
 *  dozen that can move a table (moveTable, moveMany, rotateMany, mirrorMany, retypeTable…): each
 *  linked ceiling item whose table's frame changed is carried by the offset it had
 *  (lib/studio/hang-over.ts carryHung) — unless the action placed the item itself (it is in the
 *  drag too, or it was the thing arranged), in which case where it was put is where it goes. */
function settleHung(before: DesignDocumentContent, after: DesignDocumentContent): DesignDocumentContent {
  if (after === before || after.tables === before.tables) return after;
  const was = new Map(before.tables.map((t) => [t.id, t]));
  const now = new Map(after.tables.map((t) => [t.id, t]));
  const wasPlacement = new Map(before.placements.map((p) => [p.id, p]));
  let changed = false;
  const placements = after.placements.map((p) => {
    if (p.layer !== "ceiling" || !p.over || wasPlacement.get(p.id) !== p) return p;
    const t0 = was.get(p.over);
    const t1 = now.get(p.over);
    if (!t0 || !t1 || t0 === t1) return p;
    const next = carryHung(p, t0, t1);
    if (next !== p) changed = true;
    return next;
  });
  return changed ? { ...after, placements } : after;
}

function reduce(doc: DesignDocumentContent, action: Action): DesignDocumentContent {
  switch (action.type) {
    case "addTable":
      return { ...doc, tables: [...doc.tables, action.table] };
    case "moveTable":
      return {
        ...doc,
        tables: doc.tables.map((t) => (t.id === action.id ? { ...t, position: action.position } : t)),
      };
    case "moveMany": {
      if (action.moves.length === 0) return doc;
      const tables = new Map(action.moves.filter((m) => m.kind === "table").map((m) => [m.id, m.position]));
      const placements = new Map(action.moves.filter((m) => m.kind === "placement").map((m) => [m.id, m.position]));
      // A feature in the drag is a venue feature this event is pushing around. It reaches here as
      // the absolute point everything else does — the caller converts it to the offset the document
      // actually stores, because only the caller knows where the PROPERTY has the thing.
      const features = action.moves.filter((m) => m.kind === "feature");
      const next = {
        ...doc,
        tables: tables.size === 0 ? doc.tables : doc.tables.map((t) => (tables.has(t.id) ? { ...t, position: tables.get(t.id)! } : t)),
        placements:
          placements.size === 0
            ? doc.placements
            : doc.placements.map((p) => (placements.has(p.id) ? { ...p, position: placements.get(p.id)! } : p)),
      };
      return features.length === 0
        ? next
        : withArrangements(next, features.map((m) => ({ featureId: m.id, dx: m.position.x, dy: m.position.y })));
    }

    case "rotateTable":
      return {
        ...doc,
        tables: doc.tables.map((t) => (t.id === action.id ? { ...t, rotation: norm360(action.rotation) } : t)),
      };
    case "rotatePlacement":
      return {
        ...doc,
        placements: doc.placements.map((p) => (p.id === action.id ? { ...p, rotation: norm360(action.rotation) } : p)),
      };

    case "rotateMany": {
      if (action.turns.length === 0) return doc;
      const tables = new Map(action.turns.filter((m) => m.kind === "table").map((m) => [m.id, m]));
      const placements = new Map(action.turns.filter((m) => m.kind === "placement").map((m) => [m.id, m]));
      const features = action.turns.filter((m) => m.kind === "feature");
      const next = {
        ...doc,
        tables:
          tables.size === 0
            ? doc.tables
            : doc.tables.map((t) => {
                const u = tables.get(t.id);
                return u ? { ...t, position: u.position, rotation: norm360(u.rotation) } : t;
              }),
        placements:
          placements.size === 0
            ? doc.placements
            : doc.placements.map((p) => {
                const u = placements.get(p.id);
                return u ? { ...p, position: u.position, rotation: norm360(u.rotation) } : p;
              }),
      };
      return features.length === 0
        ? next
        : withArrangements(
            next,
            features.map((m) => ({ featureId: m.id, dx: m.position.x, dy: m.position.y, rotationDeg: norm360(m.rotation) })),
          );
    }
    case "mirrorMany": {
      if (action.flips.length === 0) return doc;
      const tables = new Map(action.flips.filter((m) => m.kind === "table").map((m) => [m.id, m]));
      const placements = new Map(action.flips.filter((m) => m.kind === "placement").map((m) => [m.id, m]));
      const features = action.flips.filter((m) => m.kind === "feature");
      const flip = <T extends { position: Point; rotation: number; mirrored?: boolean }>(x: T, u: (typeof action.flips)[number]): T => {
        const { mirrored: _was, ...rest } = x;
        // Unflipped is ABSENT, not false — the spelling every document drawn before this has, so
        // mirroring twice leaves no trace that anything happened.
        return { ...(rest as T), position: u.position, rotation: norm360(u.rotation), ...(u.mirrored ? { mirrored: true } : {}) };
      };
      const next = {
        ...doc,
        tables: tables.size === 0 ? doc.tables : doc.tables.map((t) => (tables.has(t.id) ? flip(t, tables.get(t.id)!) : t)),
        placements:
          placements.size === 0 ? doc.placements : doc.placements.map((p) => (placements.has(p.id) ? flip(p, placements.get(p.id)!) : p)),
      };
      return features.length === 0
        ? next
        : withArrangements(
            next,
            features.map((m) => ({ featureId: m.id, dx: m.position.x, dy: m.position.y, rotationDeg: norm360(m.rotation) })),
          );
    }
    case "resizeTable":
      return {
        ...doc,
        tables: doc.tables.map((t) => {
          if (t.id !== action.id) return t;
          if (action.sizeMm) return { ...t, sizeMm: action.sizeMm };
          const { sizeMm: _catalog, ...rest } = t;
          return rest;
        }),
      };
    case "retypeTable":
      return {
        ...doc,
        tables: doc.tables.map((t) => {
          if (t.id !== action.id) return t;
          const { diameterMm: _d, widthMm: _w, depthMm: _dp, seats: _s, sizeMm: _z, blockedSides: _b, footprint: _f, ...kept } = t;
          return { ...kept, ...action.table, ...(action.position ? { position: action.position } : {}) };
        }),
      };
    case "setTableSeats":
      return {
        ...doc,
        tables: doc.tables.map((t) => (t.id === action.id ? { ...t, seats: Math.max(0, Math.round(action.seats)) } : t)),
      };
    case "setTableSeated":
      return {
        ...doc,
        tables: doc.tables.map((t) => (t.id === action.id ? { ...t, seated: Math.max(0, Math.round(action.seated)) } : t)),
      };
    case "setTableChair": {
      const ids = new Set(action.ids);
      return {
        ...doc,
        tables: doc.tables.map((t) => {
          if (!ids.has(t.id)) return t;
          if (action.variantId) return { ...t, chairVariantId: action.variantId };
          const { chairVariantId: _, ...rest } = t;
          void _;
          return rest;
        }),
      };
    }
    case "setTableBlockedSides":
      return {
        ...doc,
        tables: doc.tables.map((t) => {
          if (t.id !== action.id) return t;
          if (action.sides === null) {
            const { blockedSides: _inherit, ...rest } = t;
            return rest;
          }
          return { ...t, blockedSides: [...new Set(action.sides)].filter((i) => Number.isInteger(i) && i >= 0).sort((a, b) => a - b) };
        }),
      };
    case "renumberTable": {
      // A whole, non-negative number. The inspector's field formats to no decimals but PARSES them,
      // so "2.5" typed into it was stored as table 2.5 and printed that way on the placement map.
      const number = tableNo(action.number);
      if (number === null) return doc;
      return {
        ...doc,
        tables: doc.tables.map((t) => (t.id === action.id ? { ...t, number } : t)),
      };
    }
    case "setLocked": {
      const tables = new Set(action.refs.filter((r) => r.kind === "table").map((r) => r.id));
      const items = new Set(action.refs.filter((r) => r.kind === "placement").map((r) => r.id));
      const changes = (x: { id: string; locked?: boolean }, ids: Set<string>) => ids.has(x.id) && !!x.locked !== action.locked;
      if (!doc.tables.some((t) => changes(t, tables)) && !doc.placements.some((p) => changes(p, items))) return doc;
      // Set = the flag; cleared = the key gone, so a freed thing is the plain object it was.
      const flag = <T extends { id: string; locked?: boolean }>(x: T): T => {
        if (action.locked) return { ...x, locked: true };
        const { locked: _off, ...rest } = x;
        void _off;
        return rest as T;
      };
      return {
        ...doc,
        tables: doc.tables.map((t) => (changes(t, tables) ? flag(t) : t)),
        placements: doc.placements.map((p) => (changes(p, items) ? flag(p) : p)),
      };
    }
    case "setTablesNumbered": {
      const ids = new Set(action.tableIds);
      if (!doc.tables.some((t) => ids.has(t.id) && !!t.unnumbered === action.numbered)) return doc;
      const flagged: DesignDocumentContent = {
        ...doc,
        tables: doc.tables.map((t) => {
          if (!ids.has(t.id)) return t;
          if (!action.numbered) return { ...t, unnumbered: true };
          const { unnumbered: _out, ...rest } = t;
          return rest;
        }),
      };
      if (!action.numbered) return flagged;
      // Back into the numbering: a returning table keeps its number unless another table has taken
      // it meanwhile — two table 4s is the one outcome this must never produce.
      const lone = flagged.tables.filter((t) => ids.has(t.id) && !t.groupId).map((t) => t.id);
      const renum = freeNumbers(flagged, lone);
      let next: DesignDocumentContent = renum.size
        ? { ...flagged, tables: flagged.tables.map((t) => (renum.has(t.id) ? { ...t, number: renum.get(t.id)! } : t)) }
        : flagged;
      // …and a returning BLOCK is numbered as the block it is.
      for (const gid of new Set(flagged.tables.filter((t) => ids.has(t.id) && t.groupId).map((t) => t.groupId!))) {
        const units = numberedUnits(next).filter((u) => !u.unnumbered);
        const mine = units.find((u) => u.id === gid);
        const taken = units.filter((u) => u.id !== gid).map((u) => u.number);
        if (!mine || mine.number === 0 || !taken.includes(mine.number)) continue;
        const number = taken.reduce((m, n) => Math.max(m, n), 0) + 1;
        next = { ...next, groups: (next.groups ?? []).map((g) => (g.id === gid ? { ...g, number } : g)) };
      }
      return next;
    }
    case "styleTable":
      return {
        ...doc,
        tables: doc.tables.map((t) => (t.id === action.id ? { ...t, style: action.style } : t)),
      };
    case "removeTable": {
      const gone = doc.tables.find((t) => t.id === action.id);
      const next = pruneGroups({
        ...doc,
        tables: doc.tables.filter((t) => t.id !== action.id),
        // What stood ON it goes with it; what hung OVER it stays, hanging free where it is.
        placements: doc.placements
          .filter((p) => p.tableId !== action.id)
          .map((p) => {
            if (p.over !== action.id) return p;
            const { over: _gone, ...rest } = p;
            void _gone;
            return rest;
          }),
      });
      // Half of a block of two taken away: the other half is a lone table again, and it shows the
      // number the BLOCK showed (the one the crew was reading) when nobody else does — not the
      // number it carried hidden underneath, which a renumber may since have handed to another table.
      const survivor = gone?.groupId ? next.tables.find((t) => !t.groupId && doc.tables.find((o) => o.id === t.id)?.groupId === gone.groupId) : undefined;
      if (!survivor || survivor.unnumbered) return next;
      const shown = numberedUnits(doc).find((u) => u.kind === "group" && u.id === gone!.groupId)?.number;
      const named = shown !== undefined && shown !== survivor.number ? { ...next, tables: next.tables.map((t) => (t.id === survivor.id ? { ...t, number: shown } : t)) } : next;
      const renum = freeNumbers(named, [survivor.id]);
      return renum.size ? { ...named, tables: named.tables.map((t) => (renum.has(t.id) ? { ...t, number: renum.get(t.id)! } : t)) } : named;
    }
    case "addPlacement": {
      // Manually placing a variant back on a table clears its smart-apply exception (F-5.3).
      const p = action.placement;
      const exceptions =
        p.tableId && doc.exceptions?.some((e) => e.tableId === p.tableId && e.variantId === p.variantId)
          ? doc.exceptions.filter((e) => !(e.tableId === p.tableId && e.variantId === p.variantId))
          : doc.exceptions;
      return { ...doc, placements: [...doc.placements, p], exceptions };
    }
    case "movePlacement":
      return {
        ...doc,
        placements: doc.placements.map((p) =>
          p.id === action.id ? { ...p, position: action.position } : p,
        ),
      };
    case "setPlacementQuantity":
      return {
        ...doc,
        placements: doc.placements.map((p) =>
          p.id === action.id ? { ...p, quantity: action.quantity } : p,
        ),
      };
    case "setPlacementScale": {
      const scale = Math.round(Math.min(3, Math.max(0.3, action.scale)) * 100) / 100;
      return {
        ...doc,
        placements: doc.placements.map((p) => (p.id === action.id ? { ...p, scale } : p)),
      };
    }
    case "setPlacementVessel": {
      const ids = new Set(action.ids);
      let changed = false;
      const placements = doc.placements.map((p) => {
        if (!ids.has(p.id) || p.vessel === action.vessel) return p;
        changed = true;
        const { vessel: _old, ...rest } = p;
        void _old;
        return action.vessel === undefined ? rest : { ...rest, vessel: action.vessel };
      });
      return changed ? { ...doc, placements } : doc;
    }
    case "setPlacementAisle": {
      const ids = new Set(action.ids);
      let changed = false;
      const placements = doc.placements.map((p) => {
        if (!ids.has(p.id)) return p;
        const next: Record<string, unknown> = { ...p.aisle };
        for (const [k, v] of Object.entries(action.patch)) {
          if (v === null) delete next[k];
          else if (v !== undefined) next[k] = v;
        }
        // The piece is a variant id; everything else is cleaned as the layout will trust it (an
        // explicit "both sides" / "no stagger" is kept — on a placement it answers over the row's).
        const { piece, ...rest } = next as AislePlacement;
        const cleaned: AislePlacement = { ...cleanAisle(rest) };
        if (typeof piece === "string" && piece) cleaned.piece = piece;
        if (sameJson(cleaned, p.aisle ?? {})) return p;
        changed = true;
        const { aisle: _old, ...bare } = p;
        void _old;
        return Object.keys(cleaned).length ? { ...bare, aisle: cleaned } : bare;
      });
      return changed ? { ...doc, placements } : doc;
    }
    case "setPlacementBorder": {
      const ids = new Set(action.ids);
      // Cleaned on the way in (whole millimetres, a colour on every band) — the drawing trusts it.
      const want = action.border === null || action.border === undefined ? action.border : cleanBorder(action.border);
      if (action.border && !want) return doc;
      let changed = false;
      const placements = doc.placements.map((p) => {
        if (!ids.has(p.id)) return p;
        const next = withBorder(p, want);
        if (next !== p) changed = true;
        return next;
      });
      return changed ? { ...doc, placements } : doc;
    }
    case "setPlacementHang": {
      // Whole centimetres, inside a room; 0 or null clears it back to the row's default.
      const h = action.heightMm === null ? 0 : Math.round(Math.min(30000, Math.max(0, action.heightMm)) / 10) * 10;
      return {
        ...doc,
        placements: doc.placements.map((p) => {
          if (p.id !== action.id) return p;
          const { hangHeightMm: _old, ...rest } = p;
          void _old;
          return h > 0 ? { ...rest, hangHeightMm: h } : rest;
        }),
      };
    }
    case "setPlacementOver": {
      const p = doc.placements.find((x) => x.id === action.id);
      if (!p || (p.over ?? null) === action.over) return doc;
      const { over: _old, ...rest } = p;
      void _old;
      const next: Placement = action.over ? { ...rest, over: action.over } : rest;
      return { ...doc, placements: doc.placements.map((x) => (x.id === action.id ? next : x)) };
    }
    case "hangOverTables": {
      const targets = new Set(action.hangs.filter((h) => doc.tables.some((t) => t.id === h.tableId)).map((h) => h.tableId));
      if (targets.size === 0) return doc;
      const kept = action.mode === "replace" ? doc.placements.filter((p) => !(p.layer === "ceiling" && p.over && targets.has(p.over))) : doc.placements;
      const added: Placement[] = [];
      for (const h of action.hangs) {
        if (!targets.has(h.tableId)) continue;
        for (const it of h.items) {
          // "add" gives a table what it lacks: a variant already hanging over it is not hung twice —
          // judged against what hung there BEFORE this action, so a run of three of one pendant
          // over a table that had none lands as three.
          if (action.mode === "add" && kept.some((p) => p.layer === "ceiling" && p.over === h.tableId && p.variantId === it.variantId)) continue;
          const { id: _old, tableId: _t, over: _o, groupId: _g, ...rest } = it as Placement;
          void _old; void _t; void _o; void _g;
          added.push({ ...rest, layer: "ceiling", id: crypto.randomUUID(), over: h.tableId });
        }
      }
      if (added.length === 0 && kept === doc.placements) return doc;
      return { ...doc, placements: [...kept, ...added] };
    }
    case "setPlacementClimb":
      return {
        ...doc,
        placements: doc.placements.map((p) => {
          if (p.id !== action.id) return p;
          const { climb: _old, ...rest } = p;
          void _old;
          return {
            ...rest,
            ...(Object.keys(action.climb).length ? { climb: action.climb } : {}),
            ...(action.sizeMm ? { sizeMm: action.sizeMm } : {}),
            ...(action.position ? { position: action.position } : {}),
          };
        }),
      };
    case "setPlacementVariant":
      return {
        ...doc,
        placements: doc.placements.map((p) =>
          p.id === action.id ? { ...p, variantId: action.variantId } : p,
        ),
      };
    case "setPlacementSpan":
      return {
        ...doc,
        placements: doc.placements.map((p) => (p.id === action.id ? { ...p, span: action.span } : p)),
      };
    case "setPlacementRail":
      return {
        ...doc,
        placements: doc.placements.map((p) => {
          if (p.id !== action.id) return p;
          const railed = withRail(p, action.rail);
          // A rod carries its place in its posts; `position` is kept at their middle, as a fresh drop
          // puts it (rodAt) — a body drag or a redraw used to leave it where the rod was first dropped
          // (QA CR-4), wrong for anything that reads a placement's position.
          const next = action.rail.type === "rod" && action.rail.points.length > 0 ? { ...railed, position: railMiddle(action.rail.points) } : railed;
          if (action.dropMm === undefined) return next;
          const { dropMm: _old, ...rest } = next;
          void _old;
          return action.dropMm && action.dropMm > 0 ? { ...rest, dropMm: Math.round(action.dropMm) } : rest;
        }),
      };
    case "loadDocument": {
      const c = action.content;
      return {
        calibration: doc.calibration,
        tables: c.tables,
        placements: c.placements,
        ...(c.groups?.length ? { groups: c.groups } : {}),
        ...(c.features?.length ? { features: c.features } : {}),
        ...(c.exceptions?.length ? { exceptions: c.exceptions } : {}),
        // Once the venue's tables were copied in, a drawing loaded over it does not invite them back.
        ...(c.layoutAdopted || doc.layoutAdopted ? { layoutAdopted: true as const } : {}),
      };
    }
    case "setPlacementStage":
      return {
        ...doc,
        placements: doc.placements.map((p) =>
          p.id !== action.id
            ? p
            : {
                ...p,
                stage: action.stage,
                ...(action.position ? { position: action.position } : {}),
                ...(action.rotation !== undefined ? { rotation: norm360(action.rotation) } : {}),
                ...(action.mirrored !== undefined ? { mirrored: action.mirrored } : {}),
                ...(action.scale !== undefined ? { scale: action.scale } : {}),
              },
        ),
      };
    case "resizePlacement":
      return {
        ...doc,
        placements: doc.placements.map((p) => {
          if (p.id !== action.id) return p;
          if (action.sizeMm) return { ...p, sizeMm: action.sizeMm };
          const { sizeMm: _catalog, ...rest } = p;
          return rest;
        }),
      };
    case "setPlacementBows":
      return {
        ...doc,
        placements: doc.placements.map((p) => {
          if (p.id !== action.id) return p;
          const bows = action.bows ? cleanBows(action.bows) : undefined;
          const { bows: _old, ...rest } = p;
          return bows ? { ...rest, bows } : rest;
        }),
      };
    case "setPlacementCover": {
      const want = cleanCover(action.cover);
      let changed = false;
      const placements = doc.placements.map((p) => {
        if (p.id !== action.id) return p;
        const next = want ? { ...p, cover: want } : detachCover(p);
        if (next !== p) changed = true;
        return next;
      });
      return changed ? { ...doc, placements } : doc;
    }
    case "setPlacementEdgeSides":
      return {
        ...doc,
        placements: doc.placements.map((p) => {
          if (p.id !== action.id) return p;
          const { edgeSides: _old, ...rest } = p;
          return action.sides ? { ...rest, edgeSides: [...new Set(action.sides)].sort((a, b) => a - b) } : rest;
        }),
      };
    case "setPlacementCorners":
      return {
        ...doc,
        placements: doc.placements.map((p) => {
          if (p.id !== action.id) return p;
          const corners = action.corners ? cleanCorners(action.corners) : undefined;
          const { corners: _old, ...rest } = p;
          return corners ? { ...rest, corners } : rest;
        }),
      };
    case "removePlacement": {
      // Removing a table-layer placement records an exception, so a later bulk re-apply
      // of the same variant respects the designer's deliberate divergence (F-5.3).
      const removed = doc.placements.find((p) => p.id === action.id);
      const exceptions =
        removed?.tableId &&
        !doc.exceptions?.some((e) => e.tableId === removed.tableId && e.variantId === removed.variantId)
          ? [...(doc.exceptions ?? []), { tableId: removed.tableId, variantId: removed.variantId }]
          : doc.exceptions;
      // What stood on a stage's banquettes goes with the stage, as a table's dressing goes with the
      // table — an item perched on nothing would draw nowhere and still be counted.
      return pruneGroups({
        ...doc,
        placements: doc.placements.filter((p) => p.id !== action.id && p.perch?.stageId !== action.id),
        exceptions,
      });
    }
    case "setPlacementBench":
      return {
        ...doc,
        placements: doc.placements.map((p) => {
          if (p.id !== action.id) return p;
          if (action.bench) return { ...p, bench: action.bench };
          const { bench: _plain, ...rest } = p;
          return rest;
        }),
      };
    case "setPlacementSeating": {
      const ids = new Set(action.ids);
      if (!doc.placements.some((p) => ids.has(p.id) && !!p.notSeating === action.counted)) return doc;
      return {
        ...doc,
        placements: doc.placements.map((p) => {
          if (!ids.has(p.id)) return p;
          if (!action.counted) return p.notSeating ? p : { ...p, notSeating: true as const };
          const { notSeating: _was, ...rest } = p;
          void _was;
          return rest;
        }),
      };
    }
    case "setChairRows":
      return {
        ...doc,
        placements: doc.placements.map((p) => {
          if (p.id !== action.id) return p;
          const { rows: _old, ...rest } = p;
          const at = action.position ? { position: action.position } : {};
          if (!action.rows) return { ...rest, ...at, quantity: 1 };
          const rows = cleanRows(action.rows);
          // A block is drawn at its chairs' real size: a drawing scale left on the chair it was
          // made from would stretch every chair in it.
          return { ...rest, ...at, rows, quantity: chairRowsCount(rows), scale: 1 };
        }),
      };
    case "setPlacementPerch":
      return {
        ...doc,
        placements: doc.placements.map((p) => {
          if (p.id !== action.id) return p;
          if (action.perch) return { ...p, perch: action.perch };
          const { perch: _gone, ...rest } = p;
          return rest;
        }),
      };
    case "applyToTables": {
      const wanted = new Set(action.tableIds);
      return spreadOverTables(doc, doc.tables.filter((t) => wanted.has(t.id)), action.placement, action.replaces);
    }

    case "copyDressing": {
      const source = doc.placements.filter((p) => p.layer === "table" && p.tableId === action.fromTableId);
      const targets = action.toTableIds.filter((id) => id !== action.fromTableId && doc.tables.some((t) => t.id === id));
      const fromArranged = doc.tables.find((t) => t.id === action.fromTableId)?.arranged;
      return wearDressing(doc, source, fromArranged, targets, action.mode, action.replaces);
    }

    case "wearItems": {
      if (!doc.tables.some((t) => t.id === action.tableId)) return doc;
      if (action.items.length > 0) return wearDressing(doc, action.items, action.arranged, [action.tableId], action.mode, action.replaces);
      if (action.mode !== "replace") return doc;
      // Bare: what it wore goes, its exceptions with it, and it is laid out automatically again.
      const bare = doc.placements.filter((p) => !(p.layer === "table" && p.tableId === action.tableId));
      const table = doc.tables.find((t) => t.id === action.tableId)!;
      if (bare.length === doc.placements.length && !table.arranged) return doc;
      const { arranged: _a, ...plain } = table;
      void _a;
      return {
        ...doc,
        tables: doc.tables.map((t) => (t.id === action.tableId ? plain : t)),
        placements: bare,
        exceptions: doc.exceptions?.filter((e) => e.tableId !== action.tableId),
      };
    }

    case "arrangeDressing": {
      const table = doc.tables.find((t) => t.id === action.tableId);
      if (!table) return doc;
      const at = new Map(action.positions.map((m) => [m.id, m.position]));
      return {
        ...doc,
        tables: table.arranged ? doc.tables : doc.tables.map((t) => (t.id === action.tableId ? { ...t, arranged: true } : t)),
        placements: doc.placements.map((p) =>
          p.tableId === action.tableId && at.has(p.id) ? { ...p, position: { x: Math.round(at.get(p.id)!.x), y: Math.round(at.get(p.id)!.y) } } : p,
        ),
      };
    }

    case "arrangeOnTables": {
      const tableIds = new Set(action.positions.map((m) => m.tableId).filter((id) => doc.tables.some((t) => t.id === id)));
      if (tableIds.size === 0) return doc;
      const at = new Map(action.positions.map((m) => [m.id, m]));
      return {
        ...doc,
        tables: doc.tables.map((t) => (tableIds.has(t.id) && !t.arranged ? { ...t, arranged: true } : t)),
        placements: doc.placements.map((p) => {
          const m = at.get(p.id);
          if (!m || p.layer !== "table" || !p.tableId || !tableIds.has(m.tableId)) return p;
          return { ...p, tableId: m.tableId, position: { x: Math.round(m.position.x), y: Math.round(m.position.y) } };
        }),
      };
    }

    case "resetDressing": {
      const table = doc.tables.find((t) => t.id === action.tableId);
      if (!table?.arranged) return doc;
      const { arranged: _auto, ...rest } = table;
      return {
        ...doc,
        tables: doc.tables.map((t) => (t.id === action.tableId ? rest : t)),
        placements: doc.placements.map((p) => (p.tableId === action.tableId ? { ...p, position: { x: 0, y: 0 } } : p)),
      };
    }

    case "group": {
      // Fewer than two things is not a group, it is a thing.
      if (action.refs.length < 2) return doc;
      const tableIds = new Set(action.refs.filter((r) => r.kind === "table").map((r) => r.id));
      const placementIds = new Set(action.refs.filter((r) => r.kind === "placement").map((r) => r.id));
      // A member that was in another group LEAVES it — a thing belongs to one group, and pruneGroups
      // below clears up whatever it left behind.
      const next: DesignDocumentContent = {
        ...doc,
        tables: doc.tables.map((t) => (tableIds.has(t.id) ? { ...t, groupId: action.groupId } : t)),
        placements: doc.placements.map((p) => (placementIds.has(p.id) ? { ...p, groupId: action.groupId } : p)),
        groups: [...(doc.groups ?? []), { id: action.groupId, ...(action.number === undefined ? {} : { number: action.number }) }],
      };
      return pruneGroups(next);
    }

    case "ungroup": {
      if (!doc.groups?.some((g) => g.id === action.groupId)) return doc;
      const clear = <T extends { groupId?: string }>(x: T): T => (x.groupId === action.groupId ? { ...x, groupId: undefined } : x);
      const released: DesignDocumentContent = {
        ...doc,
        tables: doc.tables.map(clear),
        placements: doc.placements.map(clear),
        groups: doc.groups.filter((g) => g.id !== action.groupId),
      };
      // Each table comes back with the number it had underneath — unless the room was renumbered
      // round the block meanwhile and another table now shows it. Without this, a block of 1 and 2
      // renumbered to 1 beside a table renumbered to 2 came apart as two table 2s.
      const renum = freeNumbers(released, doc.tables.filter((t) => t.groupId === action.groupId).map((t) => t.id));
      return renum.size ? { ...released, tables: released.tables.map((t) => (renum.has(t.id) ? { ...t, number: renum.get(t.id)! } : t)) } : released;
    }

    case "renumberGroup": {
      if (!doc.groups?.some((g) => g.id === action.groupId)) return doc;
      const number = tableNo(action.number);
      if (number === null) return doc;
      return {
        ...doc,
        groups: doc.groups.map((g) => (g.id === action.groupId ? { ...g, number } : g)),
      };
    }

    case "restack": {
      if (action.assign.length === 0) return doc;
      const tables = new Map(action.assign.filter((a) => a.kind === "table").map((a) => [a.id, a.order]));
      const placements = new Map(action.assign.filter((a) => a.kind === "placement").map((a) => [a.id, a.order]));
      return {
        ...doc,
        tables: tables.size === 0 ? doc.tables : doc.tables.map((t) => (tables.has(t.id) ? { ...t, order: tables.get(t.id)! } : t)),
        placements:
          placements.size === 0
            ? doc.placements
            : doc.placements.map((p) => (placements.has(p.id) ? { ...p, order: placements.get(p.id)! } : p)),
      };
    }

    case "arrangeFeature":
      return withArrangements(doc, [
        { featureId: action.featureId, dx: action.dx, dy: action.dy, ...(action.rotationDeg === undefined ? {} : { rotationDeg: action.rotationDeg }) },
      ]);

    case "arrangeFeatures":
      return action.arrangements.length === 0 ? doc : withArrangements(doc, action.arrangements);

    case "removeFeatures": {
      const ids = new Set(action.featureIds);
      if (ids.size === 0) return doc;
      const rows = [...(doc.features ?? [])];
      for (const id of ids) {
        const i = rows.findIndex((f) => f.featureId === id);
        if (i >= 0) rows[i] = { ...rows[i], removed: true };
        else rows.push({ featureId: id, dx: 0, dy: 0, removed: true });
      }
      return { ...doc, features: rows };
    }

    case "restoreFeatures": {
      const ids = new Set(action.featureIds);
      if (!doc.features?.some((f) => ids.has(f.featureId) && f.removed)) return doc;
      const rows = doc.features.flatMap((f) => {
        if (!ids.has(f.featureId) || !f.removed) return [f];
        const { removed: _gone, ...kept } = f;
        // A row that only ever said "taken out" says nothing once it is back: no trace left.
        return kept.dx === 0 && kept.dy === 0 && !norm360(kept.rotationDeg ?? 0) ? [] : [kept];
      });
      return rows.length === 0 ? withoutFeatures(doc) : { ...doc, features: rows };
    }

    case "resetFeature": {
      if (!doc.features?.some((f) => f.featureId === action.featureId)) return doc;
      const rest = doc.features.filter((f) => f.featureId !== action.featureId);
      // The LAST arrangement dropped takes the key with it. An empty array and an absent field mean
      // the same thing to every reader, and the absent one is what a document that never arranged
      // anything looks like — so putting the last feature back leaves no trace that one ever moved.
      return rest.length === 0 ? withoutFeatures(doc) : { ...doc, features: rest };
    }
  }
}

// Into [0, 360) AND to the hundredth of a degree. A turn computed with trigonometry — the rotate
// handle's sweep, a mirror, a stage laid along an angled wall — comes back as 179.99999999999454,
// and a stored angle is also a DISPLAYED one: the inspector printed every one of those digits. A
// hundredth of a degree is under a tenth of a millimetre across a 6m stage.
const norm360 = (deg: number) => {
  const r = Math.round((((deg % 360) + 360) % 360) * 100) / 100;
  return r >= 360 ? r - 360 : r;
};

/** Write these arrangements over whatever the document already had, keeping the rest.
 *
 *  A rotation the caller left out is INHERITED rather than cleared: dragging a bar across the room
 *  must not straighten one that was turned to face the terrace. Only `rotateMany` and the rotate
 *  handle say anything about the angle, and they always say it explicitly. */
function withArrangements(doc: DesignDocumentContent, rows: FeaturePlacement[]): DesignDocumentContent {
  const next = [...(doc.features ?? [])];
  for (const row of rows) {
    const i = next.findIndex((f) => f.featureId === row.featureId);
    const kept = i >= 0 ? next[i].rotationDeg : undefined;
    const merged: FeaturePlacement = {
      featureId: row.featureId,
      dx: Math.round(row.dx),
      dy: Math.round(row.dy),
      ...(row.rotationDeg !== undefined ? { rotationDeg: norm360(row.rotationDeg) } : kept !== undefined ? { rotationDeg: kept } : {}),
      // An arrangement never brings a feature back on its own — that is restoreFeatures' job.
      ...(i >= 0 && next[i].removed ? { removed: true as const } : {}),
    };
    if (i >= 0) next[i] = merged;
    else next.push(merged);
  }
  return { ...doc, features: next };
}

function withoutFeatures(doc: DesignDocumentContent): DesignDocumentContent {
  const rest = { ...doc };
  delete rest.features;
  return rest;
}

/** Drop every group that no longer holds at least two things, and clear the stale `groupId` its last
 *  member is left carrying.
 *
 *  Run after every removal and after every re-grouping, because both can empty a group out from
 *  underneath: deleting one of a pair leaves a "group" of one, and pulling a table into a new group
 *  can do the same to the group it left. A lone member with a groupId is worse than untidy — it
 *  would draw no number of its own, waiting for a group that is no longer there to draw one for it. */
export function pruneGroups(doc: DesignDocumentContent): DesignDocumentContent {
  // No groups at all: still let go of any `groupId` left pointing at nothing — a table carrying one
  // draws no number and no chairs, waiting for a block that is not there.
  if (!doc.groups?.length) {
    if (!doc.tables.some((t) => t.groupId) && !doc.placements.some((p) => p.groupId)) return doc;
    const drop = <T extends { groupId?: string }>(x: T): T => (x.groupId ? { ...x, groupId: undefined } : x);
    return { ...doc, tables: doc.tables.map(drop), placements: doc.placements.map(drop) };
  }
  const count = new Map<string, number>();
  for (const x of [...doc.tables, ...doc.placements]) {
    if (x.groupId) count.set(x.groupId, (count.get(x.groupId) ?? 0) + 1);
  }
  const keep = new Set(doc.groups.filter((g) => (count.get(g.id) ?? 0) >= 2).map((g) => g.id));
  if (keep.size === doc.groups.length && [...count.keys()].every((id) => keep.has(id))) return doc;
  const clear = <T extends { groupId?: string }>(x: T): T =>
    x.groupId && !keep.has(x.groupId) ? { ...x, groupId: undefined } : x;
  return {
    ...doc,
    tables: doc.tables.map(clear),
    placements: doc.placements.map(clear),
    groups: doc.groups.filter((g) => keep.has(g.id)),
  };
}

/** The body of copyDressing and wearItems: these tables put on this dressing. `source` is the
 *  items as they stand on the table they come from (or in the saved design); `fromArranged` is
 *  whether that table was arranged by hand, which a replace carries onto every target. */
function wearDressing(
  doc: DesignDocumentContent,
  source: Omit<Placement, "id" | "tableId">[],
  fromArranged: boolean | undefined,
  targets: string[],
  mode: "add" | "replace",
  replaces?: string[],
): DesignDocumentContent {
  if (source.length === 0 || targets.length === 0) return doc;
  const targetSet = new Set(targets);

  // In replace mode the targets are stripped first, so what they end up with is exactly the
  // source's set rather than the union of the two.
  const kept =
    mode === "replace"
      ? doc.placements.filter((p) => !(p.layer === "table" && p.tableId && targetSet.has(p.tableId)))
      : doc.placements;

  // A TABLE WEARS ONE CLOTH. `replaces` names the shades of the source's own cover, so a
  // target already wearing gold is RECOLOURED to cream rather than handed a second cloth — the
  // same rule spreadOverTables applies, and it matters for the same reason. Only one cover is
  // ever drawn (coverByTable is keyed on tableId, so the second is invisible), but the packing
  // list and the quote sum EVERY placement: a second cloth tells the crew to bring one that
  // does not exist and charges the client for it.
  const swap = new Set(replaces ?? []);
  const cover = source.find((x) => swap.has(x.variantId));
  const covered = new Set<string>(); // targets whose own cover answered for the source's
  let recoloured = 0;
  const based = !cover
    ? kept
    : kept.map((p) => {
        if (p.layer !== "table" || !p.tableId || !targetSet.has(p.tableId) || !swap.has(p.variantId)) return p;
        covered.add(p.tableId);
        // …and its contour (Placement.border): "make these match that one" is the hem as well.
        if (p.variantId === cover.variantId) {
          const same = withBorder(p, cover.border);
          if (same !== p) recoloured++;
          return same;
        }
        recoloured++;
        return withBorder({ ...p, variantId: cover.variantId }, cover.border);
      });

  const added: Placement[] = [];
  for (const tableId of targets) {
    for (const s of source) {
      // Its cover is already on that table, in the source's shade — recoloured just above.
      if (s === cover && covered.has(tableId)) continue;
      const has = based.some((p) => p.layer === "table" && p.tableId === tableId && p.variantId === s.variantId);
      const excepted =
        mode === "add" &&
        doc.exceptions?.some((e) => e.tableId === tableId && (e.variantId === s.variantId || (s === cover && swap.has(e.variantId))));
      if (has || excepted) continue;
      // groupId goes too. A group means "select one and you have selected all of them, drag one
      // and they all move" — copying the source's membership onto twenty-three copies would
      // make every one of them move when the original is nudged, which is not what "make these
      // match that one" asks for.
      const { id: _old, tableId: _t, groupId: _g, ...rest } = s as Placement;
      added.push({ ...rest, id: crypto.randomUUID(), tableId });
    }
  }
  if (added.length === 0 && recoloured === 0 && kept === doc.placements) return doc;

  const exceptions =
    mode === "replace"
      ? doc.exceptions?.filter((e) => !targetSet.has(e.tableId))
      : doc.exceptions;
  // "Make these match that one" means the arrangement too: a target in replace mode is laid out
  // the way the source is — by hand where the source was arranged (the copies carry its
  // offsets), automatically where it was not.
  const tables =
    mode !== "replace"
      ? doc.tables
      : doc.tables.map((t) => {
          if (!targetSet.has(t.id) || !!t.arranged === !!fromArranged) return t;
          if (fromArranged) return { ...t, arranged: true };
          const { arranged: _auto, ...rest } = t;
          return rest;
        });
  return { ...doc, tables, placements: [...based, ...added], exceptions };
}

/** The group a thing belongs to, or undefined. The one lookup every renderer needs. */
export function groupOf(doc: DesignDocumentContent, groupId: string | undefined): DesignGroup | undefined {
  return groupId ? doc.groups?.find((g) => g.id === groupId) : undefined;
}

/** The body of both smart-applies (F-3.3): put this item on each of these tables.
 *
 *  Idempotent — a table that already carries this variant is left alone, so re-applying (or
 *  applying from a table that already has it) never stacks duplicates. Tables with a recorded
 *  exception for this variant are skipped (F-5.3).
 *
 *  `replaces` is for the covers: a table has ONE cloth, so spreading cream over a room where three
 *  tables wear gold must swap those three, not give them two cloths each. The caller passes the
 *  product's other variant ids — it is the one holding the catalog; this layer stays pure. The swap
 *  is a straight substitution rather than remove+add, so it never records the removal as a
 *  deliberate divergence the next apply would then have to honour. */
/** `p` with `border` as its contour on this plan (Placement.border): a contour, null (none here) or
 *  undefined (the field taken away — its row's again). The same object back when nothing changes. */
function withBorder(p: Placement, border: Border | null | undefined): Placement {
  if (border === undefined) {
    if (!("border" in p)) return p;
    const { border: _b, ...rest } = p;
    void _b;
    return rest;
  }
  if (border === null ? p.border === null : !!p.border && sameBorder(p.border, border)) return p;
  return { ...p, border };
}

function spreadOverTables(
  doc: DesignDocumentContent,
  tables: DesignTable[],
  placement: Omit<Placement, "id" | "tableId">,
  replaces?: string[],
): DesignDocumentContent {
  const swap = new Set(replaces ?? []);
  const targets = new Set(tables.map((t) => t.id));
  const added: Placement[] = [];
  const covered = new Set<string>(); // tables whose existing item was recoloured in place
  let carried = 0; // tables that already wore it and took its contour

  const placements = doc.placements.map((p) => {
    if (!p.tableId || !targets.has(p.tableId) || p.layer !== "table") return p;
    // A table already wearing it takes its contour (Placement.border) — "על כל השולחנות" is the hem
    // too; one wearing another shade it replaces is recoloured, contour and all.
    if (p.variantId === placement.variantId) {
      const same = withBorder(p, placement.border);
      if (same !== p) carried++;
      return same;
    }
    if (!swap.has(p.variantId)) return p;
    covered.add(p.tableId);
    return withBorder({ ...p, variantId: placement.variantId }, placement.border);
  });

  for (const t of tables) {
    if (covered.has(t.id)) continue;
    const has = placements.some(
      (p) => p.layer === "table" && p.tableId === t.id && p.variantId === placement.variantId,
    );
    // F-5.3: a table the designer took this item off keeps it off — in this shade or ANOTHER of the
    // ones it replaces (spreading cream after table 5's gold cloth was removed on purpose is the
    // same divergence, and it used to put a cloth back on table 5).
    const excepted = doc.exceptions?.some((e) => e.tableId === t.id && (e.variantId === placement.variantId || swap.has(e.variantId)));
    if (!has && !excepted) added.push({ ...placement, id: crypto.randomUUID(), tableId: t.id });
  }

  if (added.length === 0 && covered.size === 0 && carried === 0) return doc;
  return { ...doc, placements: [...placements, ...added] };
}

// Undo/redo history — the payoff of routing every edit through apply().
export interface History {
  present: DesignDocumentContent;
  past: DesignDocumentContent[];
  future: DesignDocumentContent[];
}

export function initHistory(doc: DesignDocumentContent): History {
  return { present: doc, past: [], future: [] };
}

export function dispatch(h: History, action: Action): History {
  const next = apply(h.present, action);
  if (next === h.present) return h;
  return { present: next, past: [...h.past, h.present], future: [] };
}

/** The same edit, folded into the history entry the current gesture already opened.
 *
 *  A drag is ONE thing the designer did, however many pointermove frames it took to do it. dispatch
 *  pushes a past entry per call, so a table dragged across a hall used to leave a hundred of them
 *  in the stack — each a full copy of the document, and each one Ctrl+Z had to walk back through a
 *  pixel at a time. The caller opens the entry with dispatch on the first frame and amends every
 *  frame after it (see the studio's `drag`/`endDrag`), so undo steps over the whole gesture.
 *
 *  `future` is still cleared: an amended edit is a new edit, and there is nothing left to redo. */
export function amend(h: History, action: Action): History {
  const next = apply(h.present, action);
  if (next === h.present) return h;
  return { ...h, present: next, future: [] };
}

export function undo(h: History): History {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1];
  return { present: previous, past: h.past.slice(0, -1), future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { present: next, past: [...h.past, h.present], future: rest };
}
