// ADR-4: the ONE actions layer. No renderer mutates the document directly — every
// change is an action applied here. That constraint is what makes undo/redo nearly free.
import type { BenchSpec, ChairRows, DesignDocumentContent, DesignGroup, FeaturePlacement, Placement, PlacementClimb, DesignTable, Point, WallSpan, StageBuild } from "./types";
import { chairRowsCount, cleanRows } from "./chair-rows";
import type { ElementStyle } from "../element-style";
import { isMain } from "../self-check";
import { freeNumbers, numberedUnits } from "./groups";
import { carryHung } from "../studio/hang-over";
import { cleanBows } from "../studio/rug-shape";

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

export function apply(doc: DesignDocumentContent, action: Action): DesignDocumentContent {
  return settleHung(doc, reduce(doc, action));
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
          const { diameterMm: _d, widthMm: _w, depthMm: _dp, seats: _s, sizeMm: _z, blockedSides: _b, ...kept } = t;
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
    case "loadDocument": {
      const c = action.content;
      return {
        calibration: doc.calibration,
        tables: c.tables,
        placements: c.placements,
        ...(c.groups?.length ? { groups: c.groups } : {}),
        ...(c.features?.length ? { features: c.features } : {}),
        ...(c.exceptions?.length ? { exceptions: c.exceptions } : {}),
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
function pruneGroups(doc: DesignDocumentContent): DesignDocumentContent {
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
        if (p.variantId === cover.variantId) return p;
        recoloured++;
        return { ...p, variantId: cover.variantId };
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

  const placements = doc.placements.map((p) => {
    if (!p.tableId || !targets.has(p.tableId) || p.layer !== "table") return p;
    if (!swap.has(p.variantId) || p.variantId === placement.variantId) return p;
    covered.add(p.tableId);
    return { ...p, variantId: placement.variantId };
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

  if (added.length === 0 && covered.size === 0) return doc;
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

// ponytail: self-check for the reducer + history. Run: node --experimental-strip-types lib/design-document/actions.ts
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  let h = initHistory({ calibration: { mmPerUnit: 1 }, tables: [], placements: [] });
  h = dispatch(h, { type: "addTable", table: { id: "t1", type: "round", number: 1, position: { x: 0, y: 0 }, rotation: 0 } });
  h = dispatch(h, { type: "addTable", table: { id: "t2", type: "round", number: 2, position: { x: 5, y: 0 }, rotation: 0 } });
  const applyV1 = {
    type: "applyToTables" as const,
    tableIds: ["t1", "t2"],
    placement: { variantId: "v1", layer: "table" as const, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
  };
  h = dispatch(h, applyV1);
  assert(h.present.placements.length === 2, "apply-to-list places on each named table");
  h = dispatch(h, applyV1);
  assert(h.present.placements.length === 2, "re-apply is idempotent, no duplicates");
  h = undo(h);
  assert(h.present.placements.length === 0, "undo reverts the smart-apply");
  h = redo(h);
  assert(h.present.placements.length === 2, "redo restores it");
  h = dispatch(h, { type: "removeTable", id: "t1" });
  assert(h.present.placements.length === 1, "removing a table drops its placements");
  h = dispatch(h, { type: "renumberTable", id: "t2", number: 12 });
  assert(h.present.tables.find((t) => t.id === "t2")?.number === 12, "renumber edits one table");
  h = undo(h);
  assert(h.present.tables.find((t) => t.id === "t2")?.number === 2, "renumber undoes");

  // A group drag: one action, one history entry, both kinds of thing carried by the same delta.
  {
    let g = initHistory({
      calibration: { mmPerUnit: 1 },
      tables: [{ id: "gt", type: "עגול", number: 1, position: { x: 0, y: 0 }, rotation: 0 }],
      placements: [{ id: "gp", variantId: "v", layer: "floor", quantity: 1, position: { x: 100, y: 0 }, rotation: 0, scale: 1 }],
    });
    const before = g.present;
    g = dispatch(g, {
      type: "moveMany",
      moves: [
        { kind: "table", id: "gt", position: { x: 500, y: 500 } },
        { kind: "placement", id: "gp", position: { x: 600, y: 500 } },
      ],
    });
    assert(g.present.tables[0].position.x === 500 && g.present.placements[0].position.y === 500, "moveMany moves both kinds");
    assert(g.past.length === 1, "…in one history entry");
    // Every later frame of the same drag amends that entry instead of opening another.
    g = amend(g, { type: "moveMany", moves: [{ kind: "table", id: "gt", position: { x: 900, y: 500 } }] });
    g = amend(g, { type: "moveMany", moves: [{ kind: "table", id: "gt", position: { x: 1200, y: 500 } }] });
    assert(g.past.length === 1 && g.present.tables[0].position.x === 1200, "amend folds later frames into the open entry");
    assert(undo(g).present === before, "one undo takes back the whole gesture");
    assert(apply(g.present, { type: "moveMany", moves: [] }) === g.present, "an empty move is not an edit");
  }

  h = dispatch(h, { type: "styleTable", id: "t2", style: { fill: "#c9a227", dash: "dashed" } });
  assert(h.present.tables.find((t) => t.id === "t2")?.style?.fill === "#c9a227", "styleTable sets a table's free-form style");
  h = dispatch(h, { type: "styleTable", id: "t2", style: undefined });
  assert(h.present.tables.find((t) => t.id === "t2")?.style === undefined, "styleTable clears back to the renderer's default");

  // F-5.3: an exception (manual removal) survives a later bulk re-apply.
  const t2placement = h.present.placements.find((p) => p.tableId === "t2")!;
  h = dispatch(h, { type: "removePlacement", id: t2placement.id });
  assert(h.present.exceptions?.length === 1, "removal records an exception");
  h = dispatch(h, applyV1);
  assert(h.present.placements.filter((p) => p.tableId === "t2").length === 0, "re-apply skips the excepted table");
  h = dispatch(h, { type: "addPlacement", placement: { ...t2placement, id: "p-back" } });
  assert(h.present.exceptions?.length === 0, "manual re-add clears the exception");

  // A shade swap keeps the item — same id, same place, same stretched size — and only recolours it.
  h = dispatch(h, { type: "setPlacementVariant", id: "p-back", variantId: "v2" });
  const recoloured = h.present.placements.find((p) => p.id === "p-back")!;
  assert(recoloured.variantId === "v2" && recoloured.tableId === "t2", "setPlacementVariant recolours in place");

  // A drape's run along its wall, and a carpet's drawn size.
  h = dispatch(h, {
    type: "addPlacement",
    placement: { id: "drape", variantId: "curtain", layer: "ceiling", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, span: { wallId: "w1", from: 0, to: 1 } },
  });
  h = dispatch(h, { type: "setPlacementSpan", id: "drape", span: { wallId: "w1", from: 0.25, to: 0.75 } });
  assert(h.present.placements.find((p) => p.id === "drape")?.span?.from === 0.25, "setPlacementSpan shortens the run");
  h = dispatch(h, { type: "resizePlacement", id: "drape", sizeMm: { widthMm: 3000, depthMm: 2000 } });
  assert(h.present.placements.find((p) => p.id === "drape")?.sizeMm?.widthMm === 3000, "resizePlacement records the drawn size");

  // A saved sketch loaded whole: it replaces the drawing, keeps the calibration, and is one undo.
  {
    const tb = (id: string, number: number): DesignTable => ({ id, type: "עגול", number, position: { x: 0, y: 0 }, rotation: 0 });
    let h = initHistory({ calibration: { mmPerUnit: 2 }, tables: [tb("old", 1)], placements: [] });
    h = dispatch(h, { type: "loadDocument", content: { calibration: { mmPerUnit: 9 }, tables: [tb("a", 4), tb("b", 5)], placements: [], groups: [{ id: "g", number: 4 }] } });
    assert(h.present.tables.length === 2 && h.present.tables[0].id === "a", "loadDocument puts the sketch's tables in place of the old ones");
    assert(h.present.calibration.mmPerUnit === 2, "…and keeps the venue's own calibration");
    assert(h.present.groups?.length === 1, "…with the sketch's groups");
    assert(undo(h).present.tables[0].id === "old", "…and one undo brings the old drawing back");
  }

  // "על כל השולחנות" — every table, whatever its type.
  let g = initHistory({ calibration: { mmPerUnit: 1 }, tables: [], placements: [] });
  g = dispatch(g, { type: "addTable", table: { id: "r1", type: "עגול", number: 1, position: { x: 0, y: 0 }, rotation: 0 } });
  g = dispatch(g, { type: "addTable", table: { id: "k1", type: "אביר", number: 2, position: { x: 0, y: 0 }, rotation: 0 } });
  const cloth = { variantId: "gold", layer: "table" as const, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 };
  g = dispatch(g, { type: "applyToTables", tableIds: g.present.tables.filter((t) => t.type === "עגול").map((t) => t.id), placement: cloth });
  assert(g.present.placements.length === 1, "applying to just the round tables' ids reaches only the round table");
  g = dispatch(g, { type: "applyToTables", tableIds: g.present.tables.map((t) => t.id), placement: cloth });
  assert(g.present.placements.length === 2, "applying to every table's id reaches the knight table too, without duplicating the round one");

  // A cover is one per table: spreading cream over a room wearing gold swaps, never stacks.
  g = dispatch(g, { type: "applyToTables", tableIds: g.present.tables.map((t) => t.id), placement: { ...cloth, variantId: "cream" }, replaces: ["gold", "cream"] });
  assert(g.present.placements.length === 2, "recolouring every table adds no second cloth");
  assert(g.present.placements.every((p) => p.variantId === "cream"), "…and every table now wears cream");
  assert((g.present.exceptions?.length ?? 0) === 0, "a swap is not a removal, so it records no exception");

  // Applying to an explicit list of tables — the general case the two old actions were both
  // special cases of.
  {
    let g = initHistory({
      calibration: { mmPerUnit: 1 },
      tables: [
        { id: "t1", type: "עגול", number: 1, position: { x: 0, y: 0 }, rotation: 0 },
        { id: "t2", type: "עגול", number: 2, position: { x: 0, y: 0 }, rotation: 0 },
        { id: "t3", type: "אביר", number: 3, position: { x: 0, y: 0 }, rotation: 0 },
      ],
      placements: [],
    });
    const cloth = { variantId: "gold", layer: "table" as const, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 };

    g = dispatch(g, { type: "applyToTables", tableIds: ["t1", "t3"], placement: cloth });
    assert(g.present.placements.length === 2, "only the two tables named are dressed");
    assert(!g.present.placements.some((p) => p.tableId === "t2"), "…and the one that was not is left bare");

    const before = g.present;
    g = dispatch(g, { type: "applyToTables", tableIds: ["t1"], placement: cloth });
    assert(g.present === before, "re-applying to a table that already wears it is not an edit");

    g = dispatch(g, { type: "applyToTables", tableIds: ["gone"], placement: cloth });
    assert(g.present === before, "a table id that is not there is ignored, not a crash");

    g = dispatch(g, { type: "applyToTables", tableIds: [], placement: cloth });
    assert(g.present === before, "applying to nothing is not an edit");
  }

  // Copying one table's whole dressing onto others.
  {
    const dressed = (id: string, tableId: string, variantId: string) => ({
      id, variantId, layer: "table" as const, tableId, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1,
    });
    const table = (id: string, type: string): DesignTable => ({ id, type, number: 1, position: { x: 0, y: 0 }, rotation: 0 });
    const g = initHistory({
      calibration: { mmPerUnit: 1 },
      tables: [table("t1", "עגול"), table("t2", "עגול"), table("t3", "עגול")],
      placements: [
        dressed("a", "t1", "gold-cloth"),
        dressed("b", "t1", "centrepiece"),
        dressed("c", "t2", "cream-cloth"),
      ],
    });

    // add: the target gains what it lacks — but a table wears ONE cloth, so its cream one is
    // RECOLOURED to the source's gold rather than joined by it. Without `replaces` the reducer has
    // no way to know cream and gold are the same garment, which is why the caller passes the shade
    // list; an earlier version of this assertion expected 3 items here, and that second invisible
    // cloth was billed to the client by the quote.
    const shades = ["gold-cloth", "cream-cloth"];
    const add = dispatch(g, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "add", replaces: shades });
    const onT2 = add.present.placements.filter((p) => p.tableId === "t2");
    assert(onT2.length === 2, "the target ends up with one cloth and the centrepiece, not two cloths");
    assert(onT2.some((p) => p.variantId === "gold-cloth"), "…and the cloth it wears is the source's");
    assert(!onT2.some((p) => p.variantId === "cream-cloth"), "…its own having been recoloured, not doubled");
    assert(add.present.placements.filter((p) => p.tableId === "t1" && p.variantId === "gold-cloth").length === 1, "the source still wears exactly one");

    // Told nothing about shades, it cannot know two cloths are one garment — the old behaviour,
    // kept deliberately so a caller that omits `replaces` is never silently lossy.
    const naive = dispatch(g, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "add" });
    assert(naive.present.placements.filter((p) => p.tableId === "t2").length === 3, "without a shade list it adds rather than recolours");

    // Recolouring is itself the edit: nothing added, but the document moved.
    const already = dispatch(add, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "add", replaces: shades });
    assert(already.present === add.present, "…and re-running it once the shades already match is not an edit");

    // replace: the target ends up identical to the source.
    const rep = dispatch(g, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2", "t3"], mode: "replace" });
    for (const t of ["t2", "t3"]) {
      const on = rep.present.placements.filter((p) => p.tableId === t).map((p) => p.variantId).sort();
      assert(on.join(",") === "centrepiece,gold-cloth", `${t} is now dressed exactly like the source`);
    }
    assert(rep.present.placements.filter((p) => p.tableId === "t1").length === 2, "the source is untouched");

    // Every copy is its own row.
    const ids = new Set(rep.present.placements.map((p) => p.id));
    assert(ids.size === rep.present.placements.length, "each copy gets its own id");

    // Nothing to copy, and copying onto itself, are both no-ops rather than edits.
    assert(dispatch(g, { type: "copyDressing", fromTableId: "t3", toTableIds: ["t2"], mode: "add" }).present === g.present, "an undressed source copies nothing");
    assert(dispatch(g, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t1"], mode: "add" }).present === g.present, "a table cannot be dressed from itself");
    assert(dispatch(g, { type: "copyDressing", fromTableId: "t1", toTableIds: [], mode: "add" }).present === g.present, "copying onto nothing is not an edit");

    // replace clears the target's exceptions: "make it identical" overrides an older divergence.
    const ex = initHistory({
      calibration: { mmPerUnit: 1 },
      tables: [table("t1", "עגול"), table("t2", "עגול")],
      placements: [dressed("a", "t1", "gold-cloth")],
      exceptions: [{ tableId: "t2", variantId: "gold-cloth" }],
    });
    const kept = dispatch(ex, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "add" });
    assert(kept.present.placements.filter((p) => p.tableId === "t2").length === 0, "add honours a recorded exception");
    const forced = dispatch(ex, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "replace" });
    assert(forced.present.placements.some((p) => p.tableId === "t2"), "replace overrides it");
    assert((forced.present.exceptions ?? []).length === 0, "…and clears it, so it cannot come back");
  }

  // ── where things stand on a table ─────────────────────────────────────────────────────────────
  {
    const t = (id: string): DesignTable => ({ id, type: "מלבן", number: 1, position: { x: 0, y: 0 }, rotation: 0, widthMm: 2400, depthMm: 1000 });
    const item = (id: string, tableId: string, variantId: string): Placement => ({ id, variantId, layer: "table", tableId, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 });
    const base: DesignDocumentContent = {
      calibration: { mmPerUnit: 1 },
      tables: [t("t1"), t("t2")],
      placements: [item("a", "t1", "candle"), item("b", "t1", "flowers")],
    };
    const arranged = apply(base, { type: "arrangeDressing", tableId: "t1", positions: [{ id: "a", position: { x: -700, y: 0 } }, { id: "b", position: { x: 0.4, y: 0 } }] });
    assert(arranged.tables[0].arranged === true, "arranging a table marks it arranged");
    assert(arranged.placements[0].position.x === -700 && arranged.placements[1].position.x === 0, "…and stores where each item stands, to the millimetre");
    assert(apply(base, { type: "arrangeDressing", tableId: "gone", positions: [] }) === base, "arranging a missing table is not an edit");
    assert(apply(base, { type: "arrangeDressing", tableId: "t2", positions: [{ id: "a", position: { x: 9, y: 9 } }] }).placements[0].position.x === 0, "an item on another table is not moved");

    // A table set worn by tables (the studio's wearSet: one wearItems per table it lands on).
    const items: Omit<Placement, "id" | "tableId">[] = [{ variantId: "candle", layer: "table", quantity: 2, position: { x: 600, y: 0 }, rotation: 0, scale: 1 }];
    const worn = ["t1", "t2", "gone"].reduce((d, tableId) => apply(d, { type: "wearItems", tableId, items, arranged: true, mode: "replace" }), base);
    assert(worn.placements.filter((p) => p.variantId === "candle").length === 2 && !worn.placements.some((p) => p.variantId === "flowers"), "a table set worn in place replaces what each table wore");
    assert(worn.tables.every((t) => t.arranged) && worn.placements.every((p) => p.position.x === 600 && p.quantity === 2), "…standing where it was saved, as many as it was");
    const added = apply(base, { type: "wearItems", tableId: "t1", items, arranged: true, mode: "add" });
    assert(added === base, "add gives a table only what it lacks — t1 already has its candle");

    const vased = apply(base, { type: "setPlacementVessel", ids: ["a"], vessel: "jug" });
    assert(vased.placements[0].vessel === "jug", "an arrangement is set in the vase it is given");
    assert(apply(vased, { type: "setPlacementVessel", ids: ["a"], vessel: null }).placements[0].vessel === null, "…taken out of every vase with null");
    assert(!("vessel" in apply(vased, { type: "setPlacementVessel", ids: ["a"], vessel: undefined }).placements[0]), "…and back to its row's own with undefined");
    assert(apply(vased, { type: "setPlacementVessel", ids: ["a"], vessel: "jug" }) === vased, "the same vase again changes nothing");
    const big = apply(base, { type: "setPlacementScale", id: "a", scale: 1.256 });
    assert(big.placements[0].scale === 1.26 && apply(base, { type: "setPlacementScale", id: "a", scale: 9 }).placements[0].scale === 3, "a drawing size is rounded and held to 30%–300%");
    const hung = apply(base, { type: "setPlacementHang", id: "a", heightMm: 3204 });
    assert(hung.placements[0].hangHeightMm === 3200, "a hang height is kept in whole centimetres");
    assert(!("hangHeightMm" in apply(hung, { type: "setPlacementHang", id: "a", heightMm: null }).placements[0]), "null hands it back to the catalog's height");
    const climbed = apply(base, { type: "setPlacementClimb", id: "a", climb: { heightMm: 290 }, sizeMm: { widthMm: 1200, depthMm: 3480 }, position: { x: 5, y: 1860 } });
    assert(climbed.placements[0].climb?.heightMm === 290 && climbed.placements[0].sizeMm?.depthMm === 3480 && climbed.placements[0].position.y === 1860, "a climb's rise, run and place land as one edit");
    assert(!("climb" in apply(climbed, { type: "setPlacementClimb", id: "a", climb: {} }).placements[0]), "an empty climb leaves no field behind");
    const block = apply(base, { type: "setChairRows", id: "a", rows: { rows: 5, perRow: 5 }, position: { x: 0, y: 900 } });
    assert(block.placements[0].rows?.perRow === 5 && block.placements[0].quantity === 25 && block.placements[0].position.y === 900, "a block of 5×5 is 25 chairs on the quote, its front row kept in place");
    const single = apply(block, { type: "setChairRows", id: "a", rows: null });
    assert(!("rows" in single.placements[0]) && single.placements[0].quantity === 1, "…and put back, one chair again");

    const reset = apply(arranged, { type: "resetDressing", tableId: "t1" });
    assert(!("arranged" in reset.tables[0]) && reset.placements.every((p) => p.position.x === 0), "reset hands the table back to the automatic layout");
    assert(apply(base, { type: "resetDressing", tableId: "t1" }) === base, "resetting an unarranged table is not an edit");

    const copied = apply(arranged, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "replace" });
    assert(copied.tables[1].arranged === true, "replace carries the arrangement");
    assert(copied.placements.find((p) => p.tableId === "t2" && p.variantId === "candle")?.position.x === -700, "…and each item's place on it");
    const auto = apply(copied, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "replace" });
    assert(auto.tables[1].arranged === true, "re-copying an arranged table keeps the target arranged");
    const fromAuto = apply({ ...copied, tables: [t("t1"), copied.tables[1]] }, { type: "copyDressing", fromTableId: "t1", toTableIds: ["t2"], mode: "replace" });
    assert(!("arranged" in fromAuto.tables[1]), "copying from an automatic table makes the target automatic too");
  }

  // ── grouping ──────────────────────────────────────────────────────────────────────────────────
  {
    const tbl = (id: string, number: number): DesignTable => ({ id, type: "עגול 180", number, position: { x: 0, y: 0 }, rotation: 0, diameterMm: 1800, seats: 12 });
    let g = initHistory({
      calibration: { mmPerUnit: 1 },
      tables: [tbl("a", 3), tbl("b", 7), tbl("c", 9)],
      placements: [{ id: "deck", variantId: "stage", layer: "floor", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 }],
    });
    const before = g.present;

    assert(apply(before, { type: "group", groupId: "g1", refs: [{ kind: "table", id: "a" }] }) === before, "one thing is not a group");

    g = dispatch(g, { type: "group", groupId: "g1", refs: [{ kind: "table", id: "a" }, { kind: "table", id: "b" }], number: 3 });
    assert(g.present.groups?.length === 1 && g.present.groups[0].number === 3, "a group carries the one number");
    assert(g.present.tables.filter((t) => t.groupId === "g1").length === 2, "…and its members point at it");
    assert(g.present.tables.find((t) => t.id === "b")?.number === 7, "a grouped table keeps its own number underneath");

    g = dispatch(g, { type: "renumberGroup", groupId: "g1", number: 12 });
    assert(g.present.groups?.[0].number === 12, "the group renumbers as one");
    assert(g.present.tables.find((t) => t.id === "a")?.number === 3, "…without touching any member's own number");

    // Pulling a member into a new group empties the old one, which then has to go.
    let h2 = dispatch(g, { type: "group", groupId: "g2", refs: [{ kind: "table", id: "b" }, { kind: "table", id: "c" }] });
    assert(h2.present.groups?.length === 1 && h2.present.groups[0].id === "g2", "a group emptied by a re-group is dropped");
    assert(h2.present.tables.find((t) => t.id === "a")?.groupId === undefined, "…and its last member stops claiming it");

    // Deleting one of a pair does the same.
    h2 = dispatch(g, { type: "removeTable", id: "a" });
    assert(h2.present.groups?.length === 0, "a group of one is not a group");
    assert(h2.present.tables.find((t) => t.id === "b")?.groupId === undefined, "…and the survivor is loose again");

    // Ungrouping puts everything back exactly as it was.
    const ungrouped = apply(g.present, { type: "ungroup", groupId: "g1" });
    assert(ungrouped.groups?.length === 0, "ungroup drops the group");
    assert(ungrouped.tables.every((t) => t.groupId === undefined), "…and releases every member");
    assert(ungrouped.tables.map((t) => t.number).join(",") === "3,7,9", "…leaving the numbers they always had");

    // BUG (was): a block of 1 and 2, renumbered to 1 with a table beside it renumbered to 2, came
    // apart as two table 2s — the member's hidden 2 was handed back as though nothing had changed.
    {
      const pair = apply(
        { calibration: { mmPerUnit: 1 }, tables: [tbl("p", 1), tbl("q", 2), tbl("r", 3)], placements: [] },
        { type: "group", groupId: "b", refs: [{ kind: "table", id: "p" }, { kind: "table", id: "q" }], number: 1 },
      );
      const room = apply(pair, { type: "renumberTable", id: "r", number: 2 });
      const apart = apply(room, { type: "ungroup", groupId: "b" });
      const nums = apart.tables.map((t) => t.number);
      assert(new Set(nums).size === 3, `an ungrouped block never duplicates a number the room now shows (${nums.join(",")})`);
      assert(apart.tables.find((t) => t.id === "p")?.number === 1, "…a member whose own number is still free keeps it");
      assert(apart.tables.find((t) => t.id === "q")?.number === 3, "…and one whose number was taken goes to the end");
    }

    // BUG (was): the number field parses decimals and minus signs; the reducer stored them.
    assert(apply(before, { type: "renumberTable", id: "a", number: 2.6 }).tables[0].number === 3, "a table number is whole");
    assert(apply(before, { type: "renumberTable", id: "a", number: -4 }).tables[0].number === 0, "…and never negative");
    assert(apply(before, { type: "renumberTable", id: "a", number: NaN }) === before, "…and nothing usable is no edit");
    assert(apply(g.present, { type: "renumberGroup", groupId: "g1", number: 4.4 }).groups?.[0].number === 4, "a block's number is whole too");

    // Out of the numbering, and back.
    {
      const off = apply(before, { type: "setTablesNumbered", tableIds: ["b"], numbered: false });
      assert(off.tables.find((t) => t.id === "b")?.unnumbered === true, "a table can be taken out of the numbering");
      assert(off.tables.find((t) => t.id === "b")?.number === 7, "…keeping its number underneath");
      assert(apply(off, { type: "setTablesNumbered", tableIds: ["b"], numbered: false }) === off, "…and doing it again is no edit");
      const taken = apply(off, { type: "renumberTable", id: "c", number: 7 });
      const back = apply(taken, { type: "setTablesNumbered", tableIds: ["b"], numbered: true });
      const b = back.tables.find((t) => t.id === "b")!;
      assert(!("unnumbered" in b), "back in, the flag goes rather than reading false");
      assert(b.number === 8, "…and a number another table took meanwhile is not handed back: it goes to the end");
      const free = apply(off, { type: "setTablesNumbered", tableIds: ["b"], numbered: true });
      assert(free.tables.find((t) => t.id === "b")?.number === 7, "…while one still free is kept");
      const block = apply(g.present, { type: "setTablesNumbered", tableIds: ["a", "b"], numbered: false });
      const blockTaken = apply(block, { type: "renumberTable", id: "c", number: 12 });
      const blockBack = apply(blockTaken, { type: "setTablesNumbered", tableIds: ["a", "b"], numbered: true });
      assert(blockBack.groups?.[0].number === 13, "a block coming back into the numbering takes a number nobody shows");
    }

    // Tables and placements group together — a stage deck and the tables beside it are one thing if
    // the designer says so.
    const mixed = apply(before, { type: "group", groupId: "g3", refs: [{ kind: "table", id: "a" }, { kind: "placement", id: "deck" }] });
    assert(mixed.placements[0].groupId === "g3" && mixed.tables[0].groupId === "g3", "a group can hold both kinds");
    assert(groupOf(mixed, "g3")?.number === undefined, "a group nobody numbered carries no number");
    assert(groupOf(mixed, undefined) === undefined, "an ungrouped thing has no group");

    // Ctrl+G over a group of stages (studio-screen groupStages): the ones that touched were merged
    // — the folded-in member removed — and what was left re-grouped under a new id, in one entry.
    // The old group goes with its member; the survivors belong to the new one and to nothing else.
    const deckAt = (id: string, x: number): Placement => ({ id, variantId: "stage", layer: "floor", quantity: 1, position: { x, y: 0 }, rotation: 0, scale: 1 });
    let regrouped: DesignDocumentContent = { calibration: { mmPerUnit: 9 }, tables: [], placements: [deckAt("p", 0), deckAt("q", 2000), deckAt("r", 9000)] };
    regrouped = apply(regrouped, { type: "group", groupId: "old", refs: ["p", "q", "r"].map((id) => ({ kind: "placement" as const, id })) });
    regrouped = apply(regrouped, { type: "removePlacement", id: "q" });
    regrouped = apply(regrouped, { type: "group", groupId: "new", refs: [{ kind: "placement", id: "p" }, { kind: "placement", id: "r" }] });
    assert(regrouped.groups?.length === 1 && regrouped.groups[0].id === "new", "a stage group whose touching members merged is re-grouped under a new id, the old one gone");
    assert(regrouped.placements.length === 2 && regrouped.placements.every((p) => p.groupId === "new"), "…and every survivor belongs to it alone");
    // All of them merged into one: a group of one is no group, so the lone stage stands free.
    const allOne = apply(apply(regrouped, { type: "removePlacement", id: "r" }), { type: "setPlacementStage", id: "p", stage: { outline: [{ x: -1000, y: -500 }, { x: 1000, y: -500 }, { x: 1000, y: 500 }, { x: -1000, y: 500 }], front: 0, decks: ["stage"] } });
    assert(!allOne.groups?.length && allOne.placements[0].groupId === undefined && !!allOne.placements[0].stage, "…and when every member merged into one, that stage is in no group");

    // Occupancy: never negative, and never silently trimmed to the seat count either.
    const chaired = apply(before, { type: "setTableChair", ids: ["a"], variantId: "napoleon" });
    assert(chaired.tables[0].chairVariantId === "napoleon", "a table takes the chair it was given");
    assert(!("chairVariantId" in apply(chaired, { type: "setTableChair", ids: ["a"], variantId: null }).tables[0]), "null puts it back on the studio's default");
    const filled = apply(before, { type: "setTableSeated", id: "a", seated: 9 });
    assert(filled.tables[0].seated === 9, "a table remembers how many of its chairs are taken");
    assert(apply(before, { type: "setTableSeated", id: "a", seated: -2 }).tables[0].seated === 0, "…never a negative number of people");
    const crowded = apply(apply(before, { type: "setTableSeats", id: "a", seats: 8 }), { type: "setTableSeated", id: "a", seated: 9 });
    const walled = apply(before, { type: "setTableBlockedSides", id: "a", sides: [2, 0, 2, -1] });
    assert(JSON.stringify(walled.tables[0].blockedSides) === "[0,2]", "a table's blocked sides are stored once each, in order");
    assert(!("blockedSides" in apply(walled, { type: "setTableBlockedSides", id: "a", sides: null }).tables[0]), "…and null hands them back to the catalog");
    assert(crowded.tables[0].seated === 9, "…and over-seating is recorded, not refused — the plan says 9/8 rather than losing the number");

    const reseated = apply(before, { type: "setTableSeats", id: "a", seats: 8 });
    assert(reseated.tables[0].seats === 8, "a table can be seated differently from its catalog row");
    assert(apply(before, { type: "setTableSeats", id: "a", seats: -4 }).tables[0].seats === 0, "…but never by a negative number of people");
  }

  // ── rotation ────────────────────────────────────────────────────────────────────────────────────
  {
    const base: DesignDocumentContent = {
      calibration: { mmPerUnit: 1 },
      tables: [
        { id: "a", type: "round", number: 1, position: { x: 0, y: 0 }, rotation: 0 },
        { id: "b", type: "round", number: 2, position: { x: 1000, y: 0 }, rotation: 0 },
      ],
      placements: [{ id: "p", variantId: "v", layer: "floor", quantity: 1, position: { x: 0, y: 1000 }, rotation: 0, scale: 1 }],
    };
    assert(apply(base, { type: "rotateTable", id: "a", rotation: 90 }).tables[0].rotation === 90, "a table can be turned");
    assert(apply(base, { type: "rotateTable", id: "a", rotation: 450 }).tables[0].rotation === 90, "…and the angle wraps into [0,360)");
    assert(apply(base, { type: "rotateTable", id: "a", rotation: -90 }).tables[0].rotation === 270, "…including backwards");
    assert(apply(base, { type: "rotatePlacement", id: "p", rotation: 30 }).placements[0].rotation === 30, "so can a placed item");

    // A group spun about a pivot: both the centres and the facings come from the handle, absolute.
    const spun = apply(base, {
      type: "rotateMany",
      turns: [
        { kind: "table", id: "a", position: { x: 500, y: -500 }, rotation: 90 },
        { kind: "table", id: "b", position: { x: 500, y: 500 }, rotation: 90 },
        { kind: "placement", id: "p", position: { x: -500, y: 0 }, rotation: 90 },
      ],
    });
    assert(spun.tables[0].position.y === -500 && spun.tables[1].position.y === 500, "a group rotate moves every member's centre");
    assert(spun.tables.every((t) => t.rotation === 90) && spun.placements[0].rotation === 90, "…and turns each of them too");
    assert(apply(base, { type: "rotateMany", turns: [] }) === base, "an empty rotation is not an edit");

    // One entry per gesture, however many frames it took — the same amend() the drag already uses.
    let r = initHistory(base);
    r = dispatch(r, { type: "rotateTable", id: "a", rotation: 10 });
    r = amend(r, { type: "rotateTable", id: "a", rotation: 45 });
    assert(r.present.tables[0].rotation === 45 && r.past.length === 1, "a rotate drag is one history entry");
    assert(undo(r).present.tables[0].rotation === 0, "…and one undo puts the table back square");
  }

  // ── stacking ────────────────────────────────────────────────────────────────────────────────────
  // What "front" MEANS is in ./stacking.ts and self-checked there. This is only that the reducer
  // writes what it is handed, to both kinds of thing, and touches nothing else.
  {
    const item = (id: string): Placement => ({
      id,
      variantId: "v",
      layer: "floor",
      quantity: 1,
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: 1,
    });
    const base: DesignDocumentContent = {
      calibration: { mmPerUnit: 1 },
      tables: [{ id: "t", type: "round", number: 1, position: { x: 0, y: 0 }, rotation: 0 }],
      placements: [item("x"), item("y")],
    };
    const done = apply(base, {
      type: "restack",
      assign: [
        { kind: "placement", id: "x", order: 7 },
        { kind: "table", id: "t", order: -3 },
      ],
    });
    assert(done.placements.find((p) => p.id === "x")!.order === 7, "an assignment lands on a placement");
    assert(done.tables[0].order === -3, "…and on a table, in the same action");
    assert(done.placements.find((p) => p.id === "y")!.order === undefined, "…and leaves everything unnamed alone");
    assert(apply(base, { type: "restack", assign: [] }) === base, "restacking nothing is not an edit");
    assert(base.tables[0].order === undefined, "…and the document it was applied to is not mutated");
  }

  // ── the venue's own movable features, arranged for THIS event ───────────────────────────────────
  {
    const base: DesignDocumentContent = { calibration: { mmPerUnit: 1 }, tables: [], placements: [] };
    const arranged = apply(base, { type: "arrangeFeature", featureId: "bar", dx: 500, dy: -250 });
    assert(arranged.features?.length === 1 && arranged.features[0].dx === 500, "an event can push the venue's bar across the room");
    assert(arranged.features![0].rotationDeg === undefined, "…without claiming to have turned it");

    // Dragging a turned feature keeps its facing: a move is not a straighten.
    const turned = apply(arranged, { type: "arrangeFeature", featureId: "bar", dx: 0, dy: 0, rotationDeg: 90 });
    const dragged = apply(turned, { type: "arrangeFeature", featureId: "bar", dx: 800, dy: 800 });
    assert(dragged.features![0].rotationDeg === 90, "dragging a turned feature does not straighten it");
    assert(dragged.features![0].dx === 800, "…and it still moves");
    assert(dragged.features!.length === 1, "…on the one row it already had, not a second");

    // Put it back: the row goes, and the last one takes the field with it.
    const reset = apply(dragged, { type: "resetFeature", featureId: "bar" });
    assert(reset.features === undefined, "putting the last feature back leaves no trace that one moved");
    assert(apply(base, { type: "resetFeature", featureId: "bar" }) === base, "…and resetting one nobody moved is not an edit");
    const two = apply(dragged, { type: "arrangeFeature", featureId: "pool", dx: 10, dy: 10 });
    assert(apply(two, { type: "resetFeature", featureId: "bar" }).features?.length === 1, "putting one back leaves the other arranged");
    // Taken out for this event, and brought back — where it last stood.
    const gone = apply(dragged, { type: "removeFeatures", featureIds: ["bar"] });
    assert(gone.features?.find((f) => f.featureId === "bar")?.removed === true, "taking a feature out flags its row");
    assert(gone.features?.find((f) => f.featureId === "bar")?.dx === dragged.features?.find((f) => f.featureId === "bar")?.dx, "…and keeps where this event had it");
    const back = apply(gone, { type: "restoreFeatures", featureIds: ["bar"] });
    assert(!back.features?.find((f) => f.featureId === "bar")?.removed, "bringing it back clears the flag");
    assert(back.features?.find((f) => f.featureId === "bar")?.dx === dragged.features?.find((f) => f.featureId === "bar")?.dx, "…at the same offset");
    const fresh = apply(base, { type: "removeFeatures", featureIds: ["pool"] });
    assert(fresh.features?.length === 1 && fresh.features[0].removed === true && fresh.features[0].dx === 0, "an unmoved feature gets a row that only says 'taken out'");
    assert(!("features" in apply(fresh, { type: "restoreFeatures", featureIds: ["pool"] })), "…which leaves no trace once it is back");

    // A feature travels in a group drag with the tables beside it, in the one action.
    const withTable: DesignDocumentContent = {
      ...base,
      tables: [{ id: "t", type: "round", number: 1, position: { x: 0, y: 0 }, rotation: 0 }],
    };
    const moved = apply(withTable, {
      type: "moveMany",
      moves: [
        { kind: "table", id: "t", position: { x: 100, y: 100 } },
        { kind: "feature", id: "bar", position: { x: 100, y: 100 } },
      ],
    });
    assert(moved.tables[0].position.x === 100 && moved.features?.[0].dx === 100, "one delta carries a table and a venue feature together");
  }

  // ── mirroring and resizing ──────────────────────────────────────────────────────────────────────
  {
    const base: DesignDocumentContent = {
      calibration: { mmPerUnit: 1 },
      tables: [{ id: "t", type: "round", number: 1, position: { x: 0, y: 0 }, rotation: 30 }],
      placements: [{ id: "p", variantId: "sofa", layer: "floor", quantity: 1, position: { x: 1000, y: 0 }, rotation: 0, scale: 1 }],
    };
    const once = apply(base, {
      type: "mirrorMany",
      flips: [
        { kind: "table", id: "t", position: { x: 1000, y: 0 }, rotation: -30, mirrored: true },
        { kind: "placement", id: "p", position: { x: 0, y: 0 }, rotation: 0, mirrored: true },
      ],
    });
    assert(once.tables[0].mirrored === true && once.tables[0].rotation === 330, "a mirror writes the flip and the reflected facing");
    assert(once.placements[0].position.x === 0 && once.placements[0].mirrored === true, "…and moves a member across the axis");
    const back = apply(once, { type: "mirrorMany", flips: [{ kind: "placement", id: "p", position: { x: 1000, y: 0 }, rotation: 0, mirrored: false }] });
    assert(!("mirrored" in back.placements[0]), "unflipping removes the field rather than storing false");
    assert(apply(base, { type: "mirrorMany", flips: [] }) === base, "mirroring nothing is not an edit");

    const wide = apply(base, { type: "resizeTable", id: "t", sizeMm: { widthMm: 4800, depthMm: 1200 } });
    assert(wide.tables[0].sizeMm?.widthMm === 4800, "a table can be stretched");
    assert(!("sizeMm" in apply(wide, { type: "resizeTable", id: "t", sizeMm: null }).tables[0]), "…and null hands it back to the catalog's size");
    const sized = apply(base, { type: "resizePlacement", id: "p", sizeMm: { widthMm: 2400, depthMm: 900 } });
    assert(!("sizeMm" in apply(sized, { type: "resizePlacement", id: "p", sizeMm: null }).placements[0]), "a placement's size resets the same way");
    const curved = apply(sized, { type: "setPlacementBows", id: "p", bows: [0.2, 0, 0, -0.1] });
    assert(curved.placements[0].bows?.[0] === 0.2 && curved.placements[0].sizeMm?.widthMm === 2400, "a rug's sides bow and keep their size");
    assert(apply(curved, { type: "resizePlacement", id: "p", sizeMm: { widthMm: 3000, depthMm: 900 } }).placements[0].bows?.[3] === -0.1, "stretching keeps the curves (they are fractions)");
    assert(!("bows" in apply(curved, { type: "setPlacementBows", id: "p", bows: [0, 0, 0, 0] }).placements[0]), "all sides straight takes the field away");
    assert(!("bows" in apply(curved, { type: "setPlacementBows", id: "p", bows: null }).placements[0]), "null straightens it too");

    // A swap keeps the table and replaces only what described its old catalog row.
    const dressed: DesignDocumentContent = {
      ...wide,
      tables: [{ ...wide.tables[0], number: 7, seats: 10, seated: 8, blockedSides: [0], groupId: "g", style: { fill: "#fff" } }],
    };
    const round = apply(dressed, {
      type: "retypeTable",
      id: "t",
      table: { type: "עגול 150", variantId: "round-150", diameterMm: 1500, seats: 12 },
    }).tables[0];
    assert(round.type === "עגול 150" && round.variantId === "round-150" && round.diameterMm === 1500, "a swap takes the new row's type and size");
    assert(round.seats === 12 && !("widthMm" in round) && !("sizeMm" in round) && !("blockedSides" in round), "…drops the old row's size, stretch and blocked sides");
    assert(round.number === 7 && round.seated === 8 && round.groupId === "g" && round.style?.fill === "#fff", "…and keeps its number, occupancy, group and look");
    const seatless = apply(dressed, { type: "retypeTable", id: "t", table: { type: "בר", variantId: "bar", widthMm: 600, depthMm: 600 } });
    assert(!("seats" in seatless.tables[0]), "a row with no seats leaves no stale chair count behind");
    const replaced = apply(dressed, { type: "retypeTable", id: "t", table: { type: "x", variantId: "x" }, position: { x: 5, y: 6 } });
    assert(replaced.tables[0].position.x === 5 && replaced.placements === dressed.placements, "a swap may re-place the table, and leaves its dressing alone");
  }

  // HUNG OVER A TABLE. A chandelier linked to a table goes where the table goes — moved, turned —
  // and is left hanging free where it was when the table is removed; one in the same drag as its
  // table is placed by the drag, not carried twice.
  {
    let g = initHistory({ calibration: { mmPerUnit: 1 }, tables: [], placements: [] });
    g = dispatch(g, { type: "addTable", table: { id: "t7", type: "מלבן", number: 7, position: { x: 5000, y: 3000 }, rotation: 0 } });
    const chand: Placement = { id: "ch", variantId: "chand", layer: "ceiling", quantity: 1, position: { x: 5600, y: 3000 }, rotation: 0, scale: 1, over: "t7" };
    const freeOne: Placement = { id: "fr", variantId: "chand", layer: "ceiling", quantity: 1, position: { x: 9000, y: 9000 }, rotation: 0, scale: 1 };
    g = dispatch(g, { type: "addPlacement", placement: chand });
    g = dispatch(g, { type: "addPlacement", placement: freeOne });
    g = dispatch(g, { type: "moveTable", id: "t7", position: { x: 8000, y: 3000 } });
    const at = (id: string) => g.present.placements.find((p) => p.id === id)!;
    assert(at("ch").position.x === 8600 && at("ch").position.y === 3000, "a moved table carries the chandelier hung over it");
    assert(at("fr").position.x === 9000, "…and leaves a free one alone");
    g = dispatch(g, { type: "rotateMany", turns: [{ kind: "table", id: "t7", position: { x: 8000, y: 3000 }, rotation: 90 }] });
    assert(at("ch").position.x === 8000 && at("ch").position.y === 3600 && at("ch").rotation === 90, "a turned table turns what hangs over it round with it");
    g = dispatch(g, { type: "moveMany", moves: [{ kind: "table", id: "t7", position: { x: 1000, y: 1000 } }, { kind: "placement", id: "ch", position: { x: 1234, y: 1234 } }] });
    assert(at("ch").position.x === 1234 && at("ch").position.y === 1234, "an item dragged together with its table is placed by the drag, not carried twice");
    g = dispatch(g, { type: "setPlacementOver", id: "ch", over: null });
    assert(at("ch").over === undefined, "unlinked");
    g = dispatch(g, { type: "setPlacementOver", id: "ch", over: "t7" });
    assert(at("ch").over === "t7", "…and linked again");
    assert(apply(g.present, { type: "setPlacementOver", id: "ch", over: "t7" }) === g.present, "the same link is no edit");
    // Over other tables: a copy per target, already placed by the caller; replace takes the old down.
    g = dispatch(g, { type: "addTable", table: { id: "t8", type: "מלבן", number: 8, position: { x: 6000, y: 6000 }, rotation: 0 } });
    g = dispatch(g, { type: "hangOverTables", hangs: [{ tableId: "t8", items: [{ variantId: "chand", layer: "ceiling", quantity: 1, position: { x: 6600, y: 6000 }, rotation: 0, scale: 1 }] }], mode: "add" });
    const over8 = () => g.present.placements.filter((p) => p.over === "t8");
    assert(over8().length === 1 && over8()[0].position.x === 6600, "a copy hangs over the target where the caller placed it");
    g = dispatch(g, { type: "hangOverTables", hangs: [{ tableId: "t8", items: [{ variantId: "chand", layer: "ceiling", quantity: 1, position: { x: 6000, y: 6000 }, rotation: 0, scale: 1 }] }], mode: "add" });
    assert(over8().length === 1, "add does not hang a variant twice over one table");
    g = dispatch(g, { type: "hangOverTables", hangs: [{ tableId: "t8", items: [{ variantId: "pend", layer: "ceiling", quantity: 1, position: { x: 5500, y: 6000 }, rotation: 0, scale: 1 }, { variantId: "pend", layer: "ceiling", quantity: 1, position: { x: 6500, y: 6000 }, rotation: 0, scale: 1 }] }], mode: "replace" });
    assert(over8().length === 2 && over8().every((p) => p.variantId === "pend"), "replace takes down what hung there and hangs the run of two");
    assert(apply(g.present, { type: "hangOverTables", hangs: [{ tableId: "nope", items: [] }], mode: "add" }) === g.present, "no target, no edit");
    g = dispatch(g, { type: "removeTable", id: "t7" });
    assert(at("ch").over === undefined && at("ch").position.x === 1234, "a removed table leaves its chandelier hanging free where it was");
  }

  // ── blocks: one half removed, stray group ids, items worn and moved across a block ──────────────
  {
    const T = (id: string, number: number, x: number, groupId?: string): DesignTable => ({ id, type: "rect", number, position: { x, y: 0 }, rotation: 0, widthMm: 1800, depthMm: 900, ...(groupId ? { groupId } : {}) });
    const item = (id: string, tableId: string, variantId: string): Placement => ({ id, variantId, layer: "table", quantity: 1, tableId, position: { x: 0, y: 0 }, rotation: 0, scale: 1 });
    // A block shown as 1 over members carrying 3 and 4; another table has since been renumbered 4.
    const base: DesignDocumentContent = {
      calibration: { mmPerUnit: 1 },
      tables: [T("a", 3, 0, "blk"), T("b", 4, 1800, "blk"), T("c", 4, 6000)],
      placements: [item("i1", "a", "candle"), item("i2", "b", "candle")],
      groups: [{ id: "blk", number: 1 }],
    };
    const one = apply(base, { type: "removeTable", id: "a" });
    const b = one.tables.find((t) => t.id === "b")!;
    assert(!b.groupId && !one.groups?.length, "half a block of two removed: the other half is a lone table");
    assert(b.number === 1, `…showing the number the block showed, not the hidden 4 table c also shows (${b.number})`);

    // A table pointing at a group that is not there loses the pointer on the next prune.
    const stray = apply({ ...base, groups: [], tables: [T("x", 7, 0, "ghost"), T("y", 8, 3000)] }, { type: "removeTable", id: "y" });
    assert(stray.tables[0].groupId === undefined, "a groupId naming no group is let go");

    // wearItems: placed as given; "replace" with nothing to wear leaves the table bare and automatic.
    const worn = apply(base, { type: "wearItems", tableId: "c", items: [{ variantId: "vase", layer: "table", quantity: 1, position: { x: 300, y: 0 }, rotation: 0, scale: 1 }], arranged: true, mode: "replace" });
    const onC = worn.placements.filter((p) => p.tableId === "c");
    assert(onC.length === 1 && onC[0].position.x === 300 && worn.tables.find((t) => t.id === "c")?.arranged === true, "worn items stand where the caller put them, the table arranged");
    const bare = apply({ ...base, tables: base.tables.map((t) => (t.id === "b" ? { ...t, arranged: true } : t)) }, { type: "wearItems", tableId: "b", items: [], mode: "replace" });
    assert(!bare.placements.some((p) => p.tableId === "b") && !bare.tables.find((t) => t.id === "b")?.arranged, "replace with nothing to wear strips the table");
    assert(apply(base, { type: "wearItems", tableId: "b", items: [], mode: "add" }) === base, "…and add with nothing is no edit");

    // arrangeOnTables: an item slid across the seam belongs to the half it is on now.
    const slid = apply(base, { type: "arrangeOnTables", positions: [{ id: "i1", tableId: "b", position: { x: -400, y: 0 } }, { id: "i2", tableId: "b", position: { x: 400, y: 0 } }] });
    assert(slid.placements.find((p) => p.id === "i1")?.tableId === "b" && slid.placements.find((p) => p.id === "i1")?.position.x === -400, "an item moves to the table it was put on");
    assert(slid.tables.find((t) => t.id === "b")?.arranged === true, "…which is arranged from then on");
    assert(apply(base, { type: "arrangeOnTables", positions: [{ id: "i1", tableId: "nope", position: { x: 0, y: 0 } }] }) === base, "no such table, no edit");
  }

  console.log("actions self-check passed");
}
