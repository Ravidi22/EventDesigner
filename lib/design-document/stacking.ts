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
 *  breaks ties — the order things were added, which is the order they used to draw in. */
export interface StackEntry {
  ref: StackRef;
  kind: StackKind;
  order: number;
  seq: number;
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
    out.push({ ref: { kind: "table", id: t.id }, kind: "table", order: effective(t.order, "table"), seq: seq++ });
  }
  for (const p of doc.placements) {
    const kind = classify(p);
    if (!kind) continue;
    out.push({ ref: { kind: "placement", id: p.id }, kind, order: effective(p.order, kind), seq: seq++ });
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
 * Returns [] when there is nothing to do, so a caller can skip the edit — and so an undo stack never
 * collects entries that changed nothing.
 */
export function restackTo(stack: StackEntry[], refs: StackRef[], to: "front" | "back"): StackAssignment[] {
  const wanted = new Set(refs.map((r) => `${r.kind}:${r.id}`));
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
 * Returns [] when nothing needs to change, like restackTo — so a drop that landed on open floor
 * costs no history entry.
 */
export function autoStack(stack: StackEntry[], boxes: Map<string, StackBox>, moved: StackRef[]): StackAssignment[] {
  const key = (r: StackRef) => `${r.kind}:${r.id}`;
  const movedKeys = new Set(moved.map(key));
  const index = new Map(stack.map((e, i) => [key(e.ref), i]));
  const area = (b: StackBox) => b.widthMm * b.depthMm;
  const centreIn = (s: StackBox, b: StackBox) => Math.abs(s.x - b.x) <= b.widthMm / 2 && Math.abs(s.y - b.y) <= b.depthMm / 2;
  // The smaller thing → the order it must rise to: just above the biggest thing it stands on.
  const rise = new Map<string, number>();
  const consider = (small: StackEntry, big: StackEntry) => {
    const sb = boxes.get(key(small.ref));
    const bb = boxes.get(key(big.ref));
    if (!sb || !bb) return;
    if (area(sb) > area(bb) * SMALLER_BY) return;
    if (!centreIn(sb, bb)) return;
    if (index.get(key(small.ref))! > index.get(key(big.ref))!) return; // already in front of it
    const k = key(small.ref);
    rise.set(k, Math.max(rise.get(k) ?? -Infinity, big.order + 1));
  };
  for (const m of stack) {
    if (!movedKeys.has(key(m.ref))) continue;
    for (const o of stack) {
      if (o === m) continue;
      consider(m, o);
      consider(o, m);
    }
  }
  return stack.filter((e) => rise.has(key(e.ref))).map((e) => ({ ...e.ref, order: rise.get(key(e.ref))! }));
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
    assert(onto.length === 1 && onto[0].id === "t1" && onto[0].order > DEFAULT_ORDER.item, "a table moved onto a stage is put above it");
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

  console.log("stacking self-check passed");
}
