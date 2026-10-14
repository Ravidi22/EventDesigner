// Which thing on the floor is in front of which.
//
// Everything standing on the floor of the room is ONE stack: the rugs, the tables and the objects
// placed between them. It has to be one, because what a designer overlaps is not sorted by category
// — a head table sits on a staging deck, a plinth stands on a rug, a cake table overlaps the one
// beside it — and a "bring to front" that could only reorder an item against other items would be
// unable to answer any of those.
//
// It did work that way at first, and this file is what replaced it: three fixed passes (rugs, then
// tables, then objects) with reordering allowed only inside each. Every arrangement anyone actually
// wanted to fix crossed a pass boundary, so the buttons appeared to do nothing.
//
// WHAT KEEPS THE OLD LOOK. Nothing on an existing plan carries an order, so each kind falls back to
// a DEFAULT — rug behind table behind object, exactly the three passes it replaced, and ties broken
// by the order things were added. So a document nobody has restacked draws precisely as it always
// did, and the first press of a button is the first time anything moves.
//
// WHAT IS NOT IN THE STACK. A tablecloth is its table's surface and a drape hangs on a wall by both
// ends; neither is an object standing on the floor, and neither has anything to be in front of. They
// are drawn where they belong and no button offers to move them.
import type { DesignDocumentContent, DesignTable, Placement } from "./types";
import { isMain } from "../self-check";

/** The three kinds of thing that share the floor. Which one a placement is comes from the product's
 *  category, never from guessing at its fields — so the classifier is injected (see `stackOf`)
 *  rather than imported, exactly as the clipboard takes its is-this-a-drape question. */
export type StackKind = "carpet" | "table" | "item";

export interface StackRef {
  kind: "table" | "placement";
  id: string;
}

/** Where each kind sits when nobody has said otherwise. Far apart on purpose: the gaps are what let
 *  a run of restacks happen inside one band without ever colliding with the next, so a plan can be
 *  rearranged all evening and a rug that was never touched is still under the tables. */
export const DEFAULT_ORDER: Record<StackKind, number> = {
  carpet: -1_000_000,
  table: 0,
  item: 1_000_000,
};

/** One thing on the floor, ready to be sorted. `seq` is its position in the document, which is what
 *  breaks ties — the order things were added, which is the order they used to draw in. `ordered`
 *  says the order is STORED — a button or a settled drop put it there — rather than the kind's
 *  default band, which was never anybody's decision about this thing. */
export interface StackEntry {
  ref: StackRef;
  kind: StackKind;
  order: number;
  seq: number;
  ordered: boolean;
}

const effective = (stored: number | undefined, kind: StackKind) => stored ?? DEFAULT_ORDER[kind];

/**
 * Everything on the floor, back to front — the order it should be PAINTED in.
 *
 * `classify` says which kind a placement is; a table is always a table. It returns undefined for
 * anything not on the floor at all (a cloth, a drape), which is how those stay out of the stack
 * without this file having to know what they are.
 */
export function floorStack(
  doc: DesignDocumentContent,
  classify: (p: Placement) => StackKind | undefined,
): StackEntry[] {
  const out: StackEntry[] = [];
  let seq = 0;
  for (const t of doc.tables) {
    out.push({ ref: { kind: "table", id: t.id }, kind: "table", order: effective(t.order, "table"), seq: seq++, ordered: t.order !== undefined });
  }
  for (const p of doc.placements) {
    const kind = classify(p);
    if (!kind) continue;
    out.push({ ref: { kind: "placement", id: p.id }, kind, order: effective(p.order, kind), seq: seq++, ordered: p.order !== undefined });
  }
  // Ascending, so the LAST entry is painted last and is therefore the one in front. Ties go to
  // whichever was added first, which is the document order these lists always drew in.
  return out.sort((a, b) => a.order - b.order || a.seq - b.seq);
}

/** One thing's new place in the stack. A plain assignment, because the reducer that applies it has
 *  no way to work out what "front" means — that needs the whole stack, and the classifier with it. */
export interface StackAssignment extends StackRef {
  order: number;
}

/**
 * What to write to put these things at the front (or the back) of the whole floor stack.
 *
 * Past the far END of it, not past the things they happen to already be in front of — otherwise
 * pressing "bring to front" on something already above half the room moves it by nothing, and the
 * button reads as broken for the second time.
 *
 * The moved set keeps its own internal order: sending three things forward together must not also
 * shuffle them against each other.
 *
 * To the FRONT, the moved things bring along what stands on them (`cargoOf`, given `boxes`): a
 * stage brought in front of a rug used to climb past its own head table and leave it underneath,
 * which read as the table having restacked itself. Only what is ABOVE it now and standing on it,
 * transitively — a table the designer deliberately sent behind the stage is nobody's cargo and stays
 * behind. To the BACK nothing is carried: what stood on the thing is still above it wherever it
 * goes. Without `boxes` nothing is carried — the inspector's "is there anything to do" needs no
 * geometry.
 *
 * Returns [] when there is nothing to do, so a caller can skip the edit — and so an undo stack never
 * collects entries that changed nothing.
 */
export function restackTo(stack: StackEntry[], refs: StackRef[], to: "front" | "back", boxes?: Map<string, StackBox>): StackAssignment[] {
  const wanted = new Set(refs.map((r) => `${r.kind}:${r.id}`));
  if (to === "front" && boxes) for (const k of cargoOf(stack, boxes, wanted)) wanted.add(k);
  const moving = stack.filter((e) => wanted.has(`${e.ref.kind}:${e.ref.id}`));
  if (moving.length === 0) return [];
  // Already where it is being sent? Then this is not an edit. Checked against the stack's own tail
  // (or head), which is what makes a second press of the same button a no-op rather than a slow
  // climb through ever-larger numbers.
  const edgeSlice = to === "front" ? stack.slice(-moving.length) : stack.slice(0, moving.length);
  if (edgeSlice.every((e) => wanted.has(`${e.ref.kind}:${e.ref.id}`))) return [];

  const orders = stack.map((e) => e.order);
  const edge = to === "front" ? Math.max(...orders) + 1 : Math.min(...orders) - 1;
  return moving.map((e, i) => ({
    ...e.ref,
    order: to === "front" ? edge + i : edge - (moving.length - 1 - i),
  }));
}

/** Is this thing anywhere in the floor stack — i.e. is there anything for the buttons to do to it?
 *  What the inspector asks before drawing them at all. */
export function isStackable(stack: StackEntry[], ref: StackRef): boolean {
  return stack.some((e) => e.ref.kind === ref.kind && e.ref.id === ref.id);
}

/** A thing's box on the floor — centred, axis-aligned, the extent the canvas measures everything with. */
export interface StackBox {
  x: number;
  y: number;
  widthMm: number;
  depthMm: number;
}

/** How much smaller a thing has to be, by area, to count as STANDING ON the other rather than merely
 *  overlapping it. Two tables of a size pushed into each other are neither on the other. */
const SMALLER_BY = 0.8;

/** Does `small` stand on `big`: clearly the smaller of the two, with its centre inside the other's
 *  box. The one definition of "on", for the drop that settles and the button that carries. */
function standsOn(small: StackBox, big: StackBox): boolean {
  const area = (b: StackBox) => b.widthMm * b.depthMm;
  if (area(small) > area(big) * SMALLER_BY) return false;
  return Math.abs(small.x - big.x) <= big.widthMm / 2 && Math.abs(small.y - big.y) <= big.depthMm / 2;
}

/** The keys of what stands on the given things and is ABOVE them in the stack, transitively — the
 *  head table on a stage, the candle on that table. Walked back to front, so a thing standing on
 *  something already found to be cargo is found in the same pass. */
function cargoOf(stack: StackEntry[], boxes: Map<string, StackBox>, keys: Set<string>): Set<string> {
  const key = (e: StackEntry) => `${e.ref.kind}:${e.ref.id}`;
  const out = new Set<string>();
  stack.forEach((e, i) => {
    const k = key(e);
    if (keys.has(k)) return;
    const eb = boxes.get(k);
    if (!eb) return;
    for (let j = 0; j < i; j++) {
      const m = key(stack[j]);
      if (!keys.has(m) && !out.has(m)) continue;
      const mb = boxes.get(m);
      if (mb && standsOn(eb, mb)) {
        out.add(k);
        return;
      }
    }
  });
  return out;
}

/**
 * What to write after things were MOVED, so that the smaller thing stands on the bigger one.
 *
 * Two facts a designer never wants to set by hand: a table carried onto a stage is ON the stage, and
 * a stage dragged over a row of tables has the tables on it. Yet by the default bands above an item
 * draws over a table, so the table vanished under the stage either way, and the fix was a trip to
 * the stack menu per table. So: for every pair of floor things with a just-moved thing in it, where
 * one's CENTRE lies inside the other's box and it is clearly the smaller of the two, the smaller is
 * put just above the bigger. Equal sizes are left alone, and so is anything already in front.
 *
 * Only pairs with a moved thing in them: the rest of the plan is as the designer left it, and a
 * rule that re-sorted the whole room on every drop is one they would fight. A rug is bigger than
 * what stands on it and already underneath by its band, so this never touches one.
 *
 * AND ONLY WHAT THE GESTURE CHANGED. `before` is the boxes as they stood when the gesture began (a
 * thing missing from it did not move). A pair that was already standing before the drag, where the
 * smaller one carries a stored order — the designer sent it behind, or brought the bigger thing in
 * front of it — is not this gesture's to undo: that was the bug, a table deliberately sent behind a
 * stage came back up the moment either was nudged a millimetre. A NEW landing still lifts. A thing
 * in its DEFAULT band under what it stands on has been told nothing and is merely hidden (a table
 * dropped from the rail onto a stage), so that one comes up whether the gesture put it there or not.
 * Without `before`, every pair counts as new.
 *
 * What stands on a lifted thing rises with it, and stays above it: a stage carried onto a bigger
 * stage took its head table's own order and left the table painted underneath.
 *
 * Returns [] when nothing needs to change, like restackTo — so a drop that landed on open floor
 * costs no history entry.
 */
export function autoStack(
  stack: StackEntry[],
  boxes: Map<string, StackBox>,
  moved: StackRef[],
  before?: Map<string, StackBox>,
): StackAssignment[] {
  const key = (r: StackRef) => `${r.kind}:${r.id}`;
  const movedKeys = new Set(moved.map(key));
  const index = new Map(stack.map((e, i) => [key(e.ref), i]));
  // The smaller thing → the order it must rise to: just above the biggest thing it stands on.
  const rise = new Map<string, number>();
  const consider = (small: StackEntry, big: StackEntry) => {
    const ks = key(small.ref);
    const kb = key(big.ref);
    const sb = boxes.get(ks);
    const bb = boxes.get(kb);
    if (!sb || !bb || !standsOn(sb, bb)) return;
    if (index.get(ks)! > index.get(kb)!) return; // already in front of it
    if (before && small.ordered && standsOn(before.get(ks) ?? sb, before.get(kb) ?? bb)) return; // as the designer left it
    rise.set(ks, Math.max(rise.get(ks) ?? -Infinity, big.order + 1));
  };
  for (const m of stack) {
    if (!movedKeys.has(key(m.ref))) continue;
    for (const o of stack) {
      if (o === m) continue;
      consider(m, o);
      consider(o, m);
    }
  }
  // Carry what stands on a lifted thing: anything above it now (so never a thing sent behind it)
  // whose order would no longer sort above the one it is rising to. Back to front, so a chain —
  // the candle on the table on the stage — settles in one pass.
  for (let i = 0; i < stack.length; i++) {
    const kx = key(stack[i].ref);
    const ox = rise.get(kx);
    const xb = boxes.get(kx);
    if (ox === undefined || !xb) continue;
    for (let j = i + 1; j < stack.length; j++) {
      const ky = key(stack[j].ref);
      const yb = boxes.get(ky);
      if (!yb || !standsOn(yb, xb)) continue;
      if ((rise.get(ky) ?? stack[j].order) > ox) continue;
      rise.set(ky, ox + 1);
    }
  }
  return stack.filter((e) => rise.has(key(e.ref))).map((e) => ({ ...e.ref, order: rise.get(key(e.ref))! }));
}

/**
 * What to write when things were just ADDED — dropped from the rail, placed by a click, a stage
 * drawn — so that nothing new lands hidden under something already on the plan.
 *
 * By the default bands a new table went UNDER every object (a table dropped on a stage vanished
 * into it), and a new object under anything that had ever been brought to the front. So a new thing
 * goes to the FRONT of the whole floor stack, and then whatever already stands on it (smaller, its
 * centre inside the new thing — a stage drawn over a row of tables) is put back on top of it, cargo
 * and all, the way autoStack settles a drag. A new RUG keeps its band under everything — a rug is
 * what things stand on — and only comes up over what it is clearly ON (a rug laid on a stage).
 *
 * `added` may hold several things (a pasted block): they go up together and keep their own order.
 * Returns [] when nothing needs to change.
 */
export function landOnTop(stack: StackEntry[], boxes: Map<string, StackBox>, added: StackRef[]): StackAssignment[] {
  const key = (r: StackRef) => `${r.kind}:${r.id}`;
  const addedKeys = new Set(added.map(key));
  const raised = restackTo(
    stack,
    stack.filter((e) => addedKeys.has(key(e.ref)) && e.kind !== "carpet").map((e) => e.ref),
    "front",
  );
  const order = new Map(raised.map((a) => [key(a), a.order]));
  // The stack as it stands with the new things at the front — what autoStack settles against.
  const after = stack
    .map((e) => (order.has(key(e.ref)) ? { ...e, order: order.get(key(e.ref))!, ordered: true } : e))
    .sort((a, b) => a.order - b.order || a.seq - b.seq);
  for (const a of autoStack(after, boxes, added)) order.set(key(a), a.order);
  return stack.filter((e) => order.has(key(e.ref))).map((e) => ({ ...e.ref, order: order.get(key(e.ref))! }));
}

// ponytail: self-check. Run: npm run check:stacking
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const table = (id: string, order?: number): DesignTable => ({
    id,
    type: "עגול",
    number: 1,
    position: { x: 0, y: 0 },
    rotation: 0,
    diameterMm: 1800,
    ...(order === undefined ? {} : { order }),
  });
  const place = (id: string, extra: Partial<Placement> = {}): Placement => ({
    id,
    variantId: "v",
    layer: "floor",
    quantity: 1,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: 1,
    ...extra,
  });

  // rug + two tables + an object, plus a cloth, a drape and a CHANDELIER that are in no stack.
  const kinds: Record<string, StackKind | undefined> = {
    rug: "carpet",
    lamp: "item",
    cloth: undefined,
    drape: undefined,
    chandelier: undefined, // overhead — nothing on the floor for it to be in front of
  };
  const classify = (p: Placement) => kinds[p.id];
  const doc: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [table("t1"), table("t2")],
    placements: [
      place("rug"),
      place("lamp"),
      place("cloth", { tableId: "t1", layer: "table" }),
      place("drape"),
      place("chandelier", { layer: "ceiling" }),
    ],
  };

  const names = (s: StackEntry[]) => s.map((e) => e.ref.id).join(" ");
  const stack = floorStack(doc, classify);

  // The default look IS the three passes this replaced.
  assert(names(stack) === "rug t1 t2 lamp", "with nothing restacked, a rug is under the tables and an object above them");
  assert(stack.length === 4, "a cloth, a drape and a chandelier are in no stack");
  assert(!isStackable(stack, { kind: "placement", id: "cloth" }), "…so the buttons are not offered for them");
  assert(isStackable(stack, { kind: "table", id: "t1" }), "…and are offered for a table");
  assert(!isStackable(stack, { kind: "placement", id: "chandelier" }), "a ceiling item is in no floor stack");
  assert(names(stack) === "rug t1 t2 lamp", "…and does not appear among the things on the floor");
  assert(restackTo(stack, [{ kind: "placement", id: "chandelier" }], "front").length === 0, "…so it cannot be restacked");

  // A table brought to the front clears the object above it — the thing three fixed passes could not do.
  {
    const a = restackTo(stack, [{ kind: "table", id: "t1" }], "front");
    assert(a.length === 1 && a[0].kind === "table" && a[0].id === "t1", "a table can be brought to the front");
    const after = floorStack(
      { ...doc, tables: doc.tables.map((t) => (t.id === "t1" ? { ...t, order: a[0].order } : t)) },
      classify,
    );
    assert(names(after) === "rug t2 lamp t1", "…and lands in front of the object that was above it");
  }

  // An object sent to the back goes under the rug, which is the other half of the same idea.
  {
    const a = restackTo(stack, [{ kind: "placement", id: "lamp" }], "back");
    const after = floorStack(
      { ...doc, placements: doc.placements.map((p) => (p.id === "lamp" ? { ...p, order: a[0].order } : p)) },
      classify,
    );
    assert(names(after) === "lamp rug t1 t2", "an object can be sent behind the rug");
  }

  // Pressing the same button twice is a no-op, not a climb.
  {
    const a = restackTo(stack, [{ kind: "placement", id: "lamp" }], "front");
    assert(a.length === 0, "the thing already in front is already in front");
    const b = restackTo(stack, [{ kind: "placement", id: "rug" }], "back");
    assert(b.length === 0, "…and so is the thing already at the back");
    assert(restackTo(stack, [], "front").length === 0, "restacking nothing is not an edit");
    assert(restackTo(stack, [{ kind: "table", id: "gone" }], "front").length === 0, "…nor is restacking something that is not there");
  }

  // Several at once: they clear the stack together and keep their order against each other.
  {
    // A ref naming the right id but the wrong kind matches nothing — the rug is a placement, and
    // asking for a TABLE called "rug" is asking for something that does not exist.
    const wrongKind = restackTo(stack, [{ kind: "table", id: "rug" }], "front");
    assert(wrongKind.length === 0, "a ref with the wrong kind matches nothing");
    const b = restackTo(stack, [{ kind: "table", id: "t2" }, { kind: "placement", id: "rug" }], "front");
    assert(b.length === 2, "two things move together");
    const byId = new Map(b.map((x) => [x.id, x.order]));
    assert(byId.get("rug")! < byId.get("t2")!, "…keeping the order they already had between them");
    const after = floorStack(
      {
        tables: doc.tables.map((t) => (t.id === "t2" ? { ...t, order: byId.get("t2") } : t)),
        placements: doc.placements.map((p) => (p.id === "rug" ? { ...p, order: byId.get("rug") } : p)),
        calibration: doc.calibration,
      },
      classify,
    );
    assert(names(after) === "t1 lamp rug t2", "…and the pair clears everything that stayed behind");
  }

  // A whole evening of restacking never lets an untouched rug climb over an untouched table: the
  // default bands are a million apart, and one press moves something by one.
  {
    let d = doc;
    for (let i = 0; i < 50; i++) {
      const s = floorStack(d, classify);
      const a = restackTo(s, [{ kind: "table", id: i % 2 === 0 ? "t1" : "t2" }], "front");
      d = { ...d, tables: d.tables.map((t) => { const m = a.find((x) => x.id === t.id); return m ? { ...t, order: m.order } : t; }) };
    }
    const s = floorStack(d, classify);
    assert(s[0].ref.id === "rug", "after fifty restacks an untouched rug is still on the floor");
    assert(s[s.length - 1].ref.id === "t2" || s[s.length - 1].ref.id === "t1", "…and the last table pressed is in front");
  }

  // Moving things settles what stands on what: a table carried onto a stage is drawn ON it, and a
  // stage dragged over tables leaves the tables on top — without a trip to the menu per table.
  {
    const d: DesignDocumentContent = { ...doc, placements: [...doc.placements, place("stage")] };
    const k2: Record<string, StackKind | undefined> = { ...kinds, stage: "item" };
    const s = floorStack(d, (p) => k2[p.id]);
    const boxes = new Map<string, StackBox>([
      ["table:t1", { x: 0, y: 0, widthMm: 1800, depthMm: 1800 }],
      ["table:t2", { x: 9000, y: 0, widthMm: 1800, depthMm: 1800 }],
      ["placement:rug", { x: 0, y: 0, widthMm: 8000, depthMm: 8000 }],
      ["placement:lamp", { x: 500, y: 500, widthMm: 400, depthMm: 400 }],
      ["placement:stage", { x: 0, y: 0, widthMm: 6000, depthMm: 4000 }],
    ]);
    const onto = autoStack(s, boxes, [{ kind: "table", id: "t1" }]);
    const ontoBy = new Map(onto.map((x) => [x.id, x.order]));
    assert(ontoBy.get("t1")! > DEFAULT_ORDER.item, "a table moved onto a stage is put above it");
    // The lamp at (500,500) stands on that table: it rises with it, and stays above it, rather than
    // being left at its band under the table it is on.
    assert(onto.length === 2 && ontoBy.get("lamp")! > ontoBy.get("t1")!, "…and the lamp standing on the table rises with it");
    const under = autoStack(s, boxes, [{ kind: "placement", id: "stage" }]);
    assert(under.some((x) => x.id === "t1"), "…and a stage moved over a table lifts the table");
    assert(!under.some((x) => x.id === "t2"), "…but not a table it does not cover");
    assert(autoStack(s, boxes, [{ kind: "placement", id: "rug" }]).length === 0, "a rug moved under a table changes nothing — the table is already on it");
    const lamp = autoStack(s, boxes, [{ kind: "placement", id: "lamp" }]);
    assert(lamp.length === 1 && lamp[0].id === "lamp", "a lamp placed before the stage was, moved onto it, comes up above it");
    const lifted = floorStack({ ...d, placements: d.placements.map((p) => (p.id === "lamp" ? { ...p, order: lamp[0].order } : p)) }, (p) => k2[p.id]);
    assert(autoStack(lifted, boxes, [{ kind: "placement", id: "lamp" }]).length === 0, "…and moved again, it is already where it should be");
    assert(autoStack(s, boxes, [{ kind: "table", id: "t2" }]).length === 0, "a table moved onto open floor changes nothing");
  }

  // THE DESIGNER'S ORDER STANDS. A drag settles only what it changed: a table deliberately sent
  // behind a stage stays behind it when either is nudged, and comes up again only on a NEW landing.
  // (The bug: every nudge put it back on top.)
  {
    const d: DesignDocumentContent = { ...doc, placements: [...doc.placements, place("stage")] };
    const k2: Record<string, StackKind | undefined> = { ...kinds, stage: "item" };
    const cls = (p: Placement) => k2[p.id];
    const t1 = { kind: "table" as const, id: "t1" };
    const stageRef = { kind: "placement" as const, id: "stage" };
    const boxes = new Map<string, StackBox>([
      ["table:t1", { x: 0, y: 0, widthMm: 1800, depthMm: 1800 }],
      ["table:t2", { x: 9000, y: 0, widthMm: 1800, depthMm: 1800 }],
      ["placement:rug", { x: 0, y: 0, widthMm: 8000, depthMm: 8000 }],
      ["placement:lamp", { x: 9000, y: 9000, widthMm: 400, depthMm: 400 }],
      ["placement:stage", { x: 0, y: 0, widthMm: 6000, depthMm: 4000 }],
    ]);
    const withOrders = (base: DesignDocumentContent, a: StackAssignment[]): DesignDocumentContent => ({
      ...base,
      tables: base.tables.map((t) => { const m = a.find((x) => x.kind === "table" && x.id === t.id); return m ? { ...t, order: m.order } : t; }),
      placements: base.placements.map((p) => { const m = a.find((x) => x.kind === "placement" && x.id === p.id); return m ? { ...p, order: m.order } : p; }),
    });

    // A table in its DEFAULT band under a stage — dropped there from the rail, never dragged — has
    // been told nothing: nudged, it still comes up, and so does nudging the stage under it.
    const s0 = floorStack(d, cls);
    assert(!s0.find((e) => e.ref.id === "t1")!.ordered && s0.find((e) => e.ref.id === "stage")!.ordered === false, "nothing restacked carries no stored order");
    assert(autoStack(s0, boxes, [t1], boxes).some((a) => a.id === "t1"), "a table standing under a stage in its default band comes up when nudged — nobody said it goes under");
    assert(autoStack(s0, boxes, [stageRef], boxes).some((a) => a.id === "t1"), "…and when the stage under it is nudged");

    // Lifted onto the stage by a drag, then sent to the back by the designer.
    const lifted = withOrders(d, autoStack(s0, boxes, [t1]));
    const s1 = floorStack(lifted, cls);
    assert(names(s1) === "rug t2 lamp stage t1", "a table dragged onto the stage stands on it");
    const backed = withOrders(lifted, restackTo(s1, [t1], "back", boxes));
    const s2 = floorStack(backed, cls);
    assert(names(s2) === "t1 rug t2 lamp stage", "…and sent to the back by the designer, it is behind everything");
    assert(autoStack(s2, boxes, [t1], boxes).length === 0, "nudged on the stage, a table deliberately sent behind it STAYS behind it");
    assert(autoStack(s2, boxes, [stageRef], boxes).length === 0, "…and nudging the stage does not bring it up either");
    assert(autoStack(s2, boxes, [t1]).length === 1, "(without the gesture's start to compare against it would have come back up — the bug)");
    // Carried off the stage and back onto it: a new landing, and it lands on top again.
    const away = new Map(boxes);
    away.set("table:t1", { x: 20000, y: 0, widthMm: 1800, depthMm: 1800 });
    const landing = autoStack(s2, boxes, [t1], away);
    assert(landing.length === 1 && landing[0].id === "t1" && landing[0].order > DEFAULT_ORDER.item, "…but carried off and back onto the stage, it lands on top");
    // The stage dragged out from under it and back under it: the same new landing, seen from the other side.
    const stageAway = new Map(boxes);
    stageAway.set("placement:stage", { x: 20000, y: 0, widthMm: 6000, depthMm: 4000 });
    assert(autoStack(s2, boxes, [stageRef], stageAway).some((a) => a.id === "t1"), "…as it does when the stage is dragged back under it");

    // BRING TO FRONT CARRIES WHAT STANDS ON IT. The lamp is brought in front of everything; then the
    // stage — and its head table comes along, above it, instead of being left underneath.
    const lampFront = withOrders(lifted, restackTo(s1, [{ kind: "placement", id: "lamp" }], "front"));
    const s3 = floorStack(lampFront, cls);
    assert(names(s3) === "rug t2 stage t1 lamp", "a lamp brought to the front is in front of the stage and its table");
    const carried = restackTo(s3, [stageRef], "front", boxes);
    assert(carried.length === 2, "a stage brought to the front carries the table standing on it");
    assert(names(floorStack(withOrders(lampFront, carried), cls)) === "rug t2 lamp stage t1", "…and the table is still above the stage");
    assert(names(floorStack(withOrders(lampFront, restackTo(s3, [stageRef], "front")), cls)) === "rug t2 t1 lamp stage", "(without boxes nothing is carried — the table goes under)");
    assert(restackTo(floorStack(withOrders(lampFront, carried), cls), [stageRef], "front", boxes).length === 0, "pressed again, the stage and its cargo are already in front");
    // A table deliberately sent BEHIND the stage is nobody's cargo: the stage goes to the front alone.
    const backedLampFront = withOrders(backed, restackTo(s2, [{ kind: "placement", id: "lamp" }], "front"));
    const s4 = floorStack(backedLampFront, cls);
    const alone = restackTo(s4, [stageRef], "front", boxes);
    assert(alone.length === 1 && alone[0].id === "stage", "a table the designer sent behind the stage is not carried to the front with it");
    assert(names(floorStack(withOrders(backedLampFront, alone), cls)) === "t1 rug t2 lamp stage", "…and stays behind");
    // Sending to the back carries nothing: what stood on the stage is still above it.
    const sent = restackTo(s3, [stageRef], "back", boxes);
    assert(sent.length === 1 && sent[0].id === "stage", "a stage sent to the back goes alone");
    assert(names(floorStack(withOrders(lampFront, sent), cls)) === "stage rug t2 t1 lamp", "…and its table is still above it");
  }

  // WHAT STANDS ON A LIFTED THING RISES WITH IT. Stage A, with a table on it, is dragged onto the
  // bigger stage B: A comes up above B, and the table comes up above A rather than sharing A's new
  // order and losing the tie to it.
  {
    const d: DesignDocumentContent = { ...doc, placements: [...doc.placements, place("stageA"), place("stageB")] };
    const k2: Record<string, StackKind | undefined> = { ...kinds, stageA: "item", stageB: "item" };
    const cls = (p: Placement) => k2[p.id];
    const boxes = new Map<string, StackBox>([
      ["table:t1", { x: 0, y: 0, widthMm: 1800, depthMm: 1800 }],
      ["table:t2", { x: 30000, y: 0, widthMm: 1800, depthMm: 1800 }],
      ["placement:rug", { x: 30000, y: 30000, widthMm: 8000, depthMm: 8000 }],
      ["placement:lamp", { x: 30000, y: 9000, widthMm: 400, depthMm: 400 }],
      ["placement:stageA", { x: 0, y: 0, widthMm: 6000, depthMm: 4000 }],
      ["placement:stageB", { x: 0, y: 0, widthMm: 12000, depthMm: 8000 }],
    ]);
    const onA: DesignDocumentContent = { ...d, tables: d.tables.map((t) => (t.id === "t1" ? { ...t, order: DEFAULT_ORDER.item + 1 } : t)) };
    const s = floorStack(onA, cls);
    assert(names(s) === "rug t2 lamp stageA stageB t1", "the table stands on stage A, which B was added after");
    const before = new Map(boxes);
    before.set("placement:stageA", { x: 20000, y: 0, widthMm: 6000, depthMm: 4000 });
    const a = autoStack(s, boxes, [{ kind: "placement", id: "stageA" }], before);
    const by = new Map(a.map((x) => [x.id, x.order]));
    assert(by.get("stageA")! > DEFAULT_ORDER.item, "stage A carried onto stage B rises above it");
    assert(by.get("t1")! > by.get("stageA")!, "…and the table on A rises above A");
    const after = floorStack(
      { ...onA, placements: onA.placements.map((p) => (by.has(p.id) ? { ...p, order: by.get(p.id) } : p)), tables: onA.tables.map((t) => (by.has(t.id) ? { ...t, order: by.get(t.id) } : t)) },
      cls,
    );
    assert(names(after) === "rug t2 lamp stageB stageA t1", "…so the room paints B, then A, then the table");
  }

  // WHAT IS NEW LANDS ON TOP. A table dropped onto a stage is on it, not under it; a stage drawn
  // over a row of tables comes in front of the room and the tables come back up onto it; a rug
  // keeps its place under everything unless it was laid ON something.
  {
    const k2: Record<string, StackKind | undefined> = { ...kinds, stage: "item", rug2: "carpet", lamp2: "item" };
    const cls = (p: Placement) => k2[p.id];
    const boxes = new Map<string, StackBox>([
      ["table:t1", { x: 0, y: 0, widthMm: 1800, depthMm: 1800 }],
      ["table:t2", { x: 9000, y: 0, widthMm: 1800, depthMm: 1800 }],
      ["placement:rug", { x: 30000, y: 30000, widthMm: 8000, depthMm: 8000 }],
      ["placement:lamp", { x: 9000, y: 500, widthMm: 400, depthMm: 400 }],
      ["placement:stage", { x: 0, y: 0, widthMm: 6000, depthMm: 4000 }],
      ["placement:rug2", { x: 0, y: 0, widthMm: 3000, depthMm: 2000 }],
      ["placement:lamp2", { x: 40000, y: 0, widthMm: 400, depthMm: 400 }],
    ]);
    const withOrders = (base: DesignDocumentContent, a: StackAssignment[]): DesignDocumentContent => ({
      ...base,
      tables: base.tables.map((t) => { const m = a.find((x) => x.kind === "table" && x.id === t.id); return m ? { ...t, order: m.order } : t; }),
      placements: base.placements.map((p) => { const m = a.find((x) => x.kind === "placement" && x.id === p.id); return m ? { ...p, order: m.order } : p; }),
    });
    // The stage is on the plan; table t1 is the one just dropped onto it.
    const d: DesignDocumentContent = { ...doc, placements: [...doc.placements, place("stage")] };
    const s = floorStack(d, cls);
    assert(names(s) === "rug t1 t2 lamp stage", "by the bands alone a table dropped on a stage is under it");
    const a = landOnTop(s, boxes, [{ kind: "table", id: "t1" }]);
    assert(names(floorStack(withOrders(d, a), cls)).endsWith("stage t1"), "…landing on top puts it on the stage");
    // The stage is the new thing, drawn over t1: it comes to the front, and t1 back up onto it.
    const b = landOnTop(s, boxes, [{ kind: "placement", id: "stage" }]);
    assert(names(floorStack(withOrders(d, b), cls)).endsWith("stage t1"), "a stage drawn over a table leaves the table on it");
    assert(!b.some((x) => x.id === "t2"), "…and does not touch a table it does not cover");
    // Already at the front: nothing to write.
    const lamp2: DesignDocumentContent = { ...d, placements: [...d.placements, place("lamp2")] };
    assert(landOnTop(floorStack(lamp2, cls), boxes, [{ kind: "placement", id: "lamp2" }]).length === 0, "a new object on open floor, already in front, costs nothing");
    // A rug keeps its band — and is lifted only onto what it lies on.
    const rug2: DesignDocumentContent = { ...d, placements: [...d.placements, place("rug2")] };
    const r = landOnTop(floorStack(rug2, cls), boxes, [{ kind: "placement", id: "rug2" }]);
    const rugNames = names(floorStack(withOrders(rug2, r), cls));
    assert(rugNames.indexOf("rug2") > rugNames.indexOf("stage"), "a rug laid on a stage lies on it");
    assert(rugNames.indexOf("rug2") < rugNames.indexOf("t1") || !r.some((x) => x.id === "t1"), "…under the table that stands there");
  }

  console.log("stacking self-check passed");
}
