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
import type { DesignDocumentContent, Placement } from "./types";

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
