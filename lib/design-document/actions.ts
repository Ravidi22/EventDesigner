// ADR-4: the ONE actions layer. No renderer mutates the document directly — every
// change is an action applied here. That constraint is what makes undo/redo nearly free.
import type { DesignDocumentContent, DesignGroup, FeaturePlacement, Placement, DesignTable, Point, WallSpan, RigHang } from "./types";
import type { ElementStyle } from "../element-style";
import { isMain } from "../self-check";

export type Action =
  | { type: "addTable"; table: DesignTable }
  | { type: "moveTable"; id: string; position: DesignTable["position"] }
  | { type: "removeTable"; id: string }
  | { type: "renumberTable"; id: string; number: number }
  | { type: "styleTable"; id: string; style: ElementStyle | undefined }
  // How many chairs go round this one table. Seeded from the catalog row when it was dropped, and
  // editable after: a head table seats what the family is, not what the product says.
  | { type: "setTableSeats"; id: string; seats: number }
  // How many of those chairs are spoken for. Deliberately NOT clamped to the seat count — a table
  // seating thirteen at twelve places is a thing that happens on the night, and the plan showing
  // 13/12 in alert ink is more use than a field that refuses the number.
  | { type: "setTableSeated"; id: string; seated: number }
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
  | { type: "setPlacementQuantity"; id: string; quantity: number }
  // Switching a placed item to another shade of the same product (F-4.2). Not a remove+add: the
  // item keeps its id, its place on the plan and the size it was stretched to — only its colour
  // changes, which is exactly what the designer is doing when the client says "in cream instead".
  | { type: "setPlacementVariant"; id: string; variantId: string }
  // A drape's run along its wall, or a moved/relaid one.
  | { type: "setPlacementSpan"; id: string; span: WallSpan }
  // A ceiling item hung on one of the venue's rods, or taken off it. `null` removes the field
  // entirely rather than storing an empty one, so "is this hung" stays one question.
  | { type: "setPlacementHang"; id: string; hang: RigHang | null }
  // A stretch item resized on the plan (a carpet's corners).
  | { type: "resizePlacement"; id: string; sizeMm: { widthMm: number; depthMm: number } }
  | { type: "removePlacement"; id: string }
  // F-3.3 smart-apply: copy a placement onto every table of a given type, or onto every table on
  // the plan regardless of type ("על כל השולחנות" — a cloth the whole room shares).
  | { type: "applyToTableType"; tableType: string; placement: Omit<Placement, "id" | "tableId">; replaces?: string[] }
  | { type: "applyToAllTables"; placement: Omit<Placement, "id" | "tableId">; replaces?: string[] }
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
  | { type: "resetFeature"; featureId: string };

/** The three kinds of thing on the plan that have a free position of their own, and so can be
 *  dragged and turned as a set. A cloth and a drape are not among them: one is its table's surface
 *  and the other belongs to a wall, so neither has a centre a shared delta could move. */
export type MovableKind = "table" | "placement" | "feature";

export function apply(doc: DesignDocumentContent, action: Action): DesignDocumentContent {
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
    case "renumberTable":
      return {
        ...doc,
        tables: doc.tables.map((t) => (t.id === action.id ? { ...t, number: action.number } : t)),
      };
    case "styleTable":
      return {
        ...doc,
        tables: doc.tables.map((t) => (t.id === action.id ? { ...t, style: action.style } : t)),
      };
    case "removeTable":
      return pruneGroups({
        ...doc,
        tables: doc.tables.filter((t) => t.id !== action.id),
        placements: doc.placements.filter((p) => p.tableId !== action.id),
      });
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
    case "setPlacementHang":
      return {
        ...doc,
        placements: doc.placements.map((p) => {
          if (p.id !== action.id) return p;
          if (action.hang) return { ...p, hang: action.hang };
          const { hang: _dropped, ...rest } = p;
          return rest;
        }),
      };
    case "resizePlacement":
      return {
        ...doc,
        placements: doc.placements.map((p) => (p.id === action.id ? { ...p, sizeMm: action.sizeMm } : p)),
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
      return pruneGroups({ ...doc, placements: doc.placements.filter((p) => p.id !== action.id), exceptions });
    }
    case "applyToTableType":
      return spreadOverTables(
        doc,
        doc.tables.filter((t) => t.type === action.tableType),
        action.placement,
        action.replaces,
      );
    case "applyToAllTables":
      return spreadOverTables(doc, doc.tables, action.placement, action.replaces);

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
      return {
        ...doc,
        tables: doc.tables.map(clear),
        placements: doc.placements.map(clear),
        groups: doc.groups.filter((g) => g.id !== action.groupId),
      };
    }

    case "renumberGroup": {
      if (!doc.groups?.some((g) => g.id === action.groupId)) return doc;
      return {
        ...doc,
        groups: doc.groups.map((g) => (g.id === action.groupId ? { ...g, number: action.number } : g)),
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

const norm360 = (deg: number) => ((deg % 360) + 360) % 360;

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
  if (!doc.groups?.length) return doc;
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
    const excepted = doc.exceptions?.some((e) => e.tableId === t.id && e.variantId === placement.variantId);
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
    type: "applyToTableType" as const,
    tableType: "round",
    placement: { variantId: "v1", layer: "table" as const, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
  };
  h = dispatch(h, applyV1);
  assert(h.present.placements.length === 2, "apply-to-type places on each round table");
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

  // A ceiling item hung on a rod, and taken off it again.
  {
    let h = initHistory({
      calibration: { mmPerUnit: 1 },
      tables: [],
      placements: [{ id: "ch", variantId: "chandelier", layer: "ceiling", quantity: 1, position: { x: 100, y: 100 }, rotation: 0, scale: 1 }],
    });
    h = dispatch(h, { type: "setPlacementHang", id: "ch", hang: { rigId: "r1", t: 0.5 } });
    assert(h.present.placements[0].hang?.rigId === "r1", "a ceiling item can be hung on a rod");
    h = dispatch(h, { type: "setPlacementHang", id: "ch", hang: null });
    assert(h.present.placements[0].hang === undefined, "…and taken off it, back to a free point");
    assert(h.present.placements[0].position.x === 100, "…keeping the position it had");
  }

  // "על כל השולחנות" — every table, whatever its type.
  let g = initHistory({ calibration: { mmPerUnit: 1 }, tables: [], placements: [] });
  g = dispatch(g, { type: "addTable", table: { id: "r1", type: "עגול", number: 1, position: { x: 0, y: 0 }, rotation: 0 } });
  g = dispatch(g, { type: "addTable", table: { id: "k1", type: "אביר", number: 2, position: { x: 0, y: 0 }, rotation: 0 } });
  const cloth = { variantId: "gold", layer: "table" as const, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 };
  g = dispatch(g, { type: "applyToTableType", tableType: "עגול", placement: cloth });
  assert(g.present.placements.length === 1, "per-type apply reaches only the round table");
  g = dispatch(g, { type: "applyToAllTables", placement: cloth });
  assert(g.present.placements.length === 2, "apply-to-all reaches the knight table too, without duplicating the round one");

  // A cover is one per table: spreading cream over a room wearing gold swaps, never stacks.
  g = dispatch(g, { type: "applyToAllTables", placement: { ...cloth, variantId: "cream" }, replaces: ["gold", "cream"] });
  assert(g.present.placements.length === 2, "recolouring every table adds no second cloth");
  assert(g.present.placements.every((p) => p.variantId === "cream"), "…and every table now wears cream");
  assert((g.present.exceptions?.length ?? 0) === 0, "a swap is not a removal, so it records no exception");

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

    // Tables and placements group together — a stage deck and the tables beside it are one thing if
    // the designer says so.
    const mixed = apply(before, { type: "group", groupId: "g3", refs: [{ kind: "table", id: "a" }, { kind: "placement", id: "deck" }] });
    assert(mixed.placements[0].groupId === "g3" && mixed.tables[0].groupId === "g3", "a group can hold both kinds");
    assert(groupOf(mixed, "g3")?.number === undefined, "a group nobody numbered carries no number");
    assert(groupOf(mixed, undefined) === undefined, "an ungrouped thing has no group");

    // Occupancy: never negative, and never silently trimmed to the seat count either.
    const filled = apply(before, { type: "setTableSeated", id: "a", seated: 9 });
    assert(filled.tables[0].seated === 9, "a table remembers how many of its chairs are taken");
    assert(apply(before, { type: "setTableSeated", id: "a", seated: -2 }).tables[0].seated === 0, "…never a negative number of people");
    const crowded = apply(apply(before, { type: "setTableSeats", id: "a", seats: 8 }), { type: "setTableSeated", id: "a", seated: 9 });
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

  console.log("actions self-check passed");
}
