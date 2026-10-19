// HUNG OVER A TABLE — what a ceiling item linked to a table (Placement.over) does when the table
// moves, and how it is copied over another table.
//
// A chandelier over table 7 is part of table 7's design the way its centrepiece is, and the designer
// expects it to behave like one: drag the table and the chandelier comes along; turn the table and
// the pair of pendants over its ends turn with it; "the same over every table" hangs each copy where
// this one hangs — over the middle, or a third of the way along. But the item's `position` stays a
// point in the room, not an offset in the table's frame as a centrepiece's is, because the hang
// point is what the rigger marks on the floor and what every printed sheet, every tie and every
// zone sheet reads off the placement as it is. So the link carries the item, rather than the frame
// owning its position: the reducer re-places linked items whenever a table's frame changes
// (lib/design-document/actions.ts settleHung), through `carryHung` here.
//
// Pure, self-checked: npm run check:hang-over.
import type { Placement, Point } from "@/lib/design-document/types";
import { fromTableFrame, toTableFrame } from "@/lib/design-document/dressing";
import { isMain } from "../self-check";

/** A table's frame as a thing to hang over: where it stands and which way it faces (a block's is
 *  its first member's, lib/design-document/block.ts), and its extent in that frame. */
export interface OverFrame {
  position: Point;
  rotation?: number;
  mirrored?: boolean;
  widthMm: number;
  depthMm: number;
}

type Frame = Pick<OverFrame, "position" | "rotation" | "mirrored">;

/** Two hang heights alternated along a run of pendants (mm): the first, third, fifth… at `a`, the
 *  rest at `b` — a run that rises and falls rather than a straight line of them. */
export interface HeightWave {
  a: number;
  b: number;
}

/** The frame as dressing.ts's table-frame functions take it: a facing of 0 spelled out. */
const asTable = (f: Frame) => ({ position: f.position, rotation: f.rotation ?? 0, mirrored: f.mirrored });

const sameFrame = (a: Frame, b: Frame) =>
  a.position.x === b.position.x && a.position.y === b.position.y && (a.rotation ?? 0) === (b.rotation ?? 0) && !!a.mirrored === !!b.mirrored;

/** The item's own turn, read in the table's frame: its facing less the table's, flipped with the
 *  table's mirror (a mirror reverses the sense of every angle). */
function localRotation(rotation: number, frame: Frame): number {
  const rel = rotation - (frame.rotation ?? 0);
  return frame.mirrored ? -rel : rel;
}
function worldRotation(local: number, frame: Frame): number {
  const rel = frame.mirrored ? -local : local;
  return norm360(rel + (frame.rotation ?? 0));
}
const norm360 = (deg: number) => {
  const r = Math.round((((deg % 360) + 360) % 360) * 100) / 100;
  return r >= 360 ? r - 360 : r;
};

/** The same item, where the table it hangs over now stands: its place and facing carried by the
 *  offset it had in the table's old frame into the new one. The item itself when nothing moved. */
export function carryHung<P extends Pick<Placement, "position" | "rotation" | "mirrored">>(p: P, from: Frame, to: Frame): P {
  if (sameFrame(from, to)) return p;
  const local = toTableFrame(asTable(from), p.position);
  const at = fromTableFrame(asTable(to), local);
  const rotation = worldRotation(localRotation(p.rotation, from), to);
  const flipped = !!from.mirrored !== !!to.mirrored;
  const next: P = { ...p, position: { x: Math.round(at.x), y: Math.round(at.y) }, rotation };
  if (flipped) {
    // A table flipped flips what hangs over it, so a pendant bar set at an angle over it stays a
    // mirror image of itself — absent is the unflipped spelling every document uses.
    if (p.mirrored) delete (next as { mirrored?: boolean }).mirrored;
    else (next as { mirrored?: boolean }).mirrored = true;
  }
  return next;
}

/** Where to hang a copy of `p` over another table so it sits at the SAME RELATIVE SPOT: its offset
 *  from the source table's middle, as fractions of that table's half-extents, laid over the target's.
 *  Over the middle stays over the middle; a pendant over the end of a 2.4m table goes over the end
 *  of a 4.8m one; a pair over a round lands as a pair over the next round. Same facing relative to
 *  the table. */
/** A room point over one frame, carried to the SAME RELATIVE SPOT over another — its offset from the
 *  first's middle as fractions of its half-extents, laid over the second's. What hungCopy hangs a
 *  copy by, and what a table's dressing is carried across tables and blocks by
 *  (app/(app)/studio/dressing-units.ts). */
export function relativeSpot(from: OverFrame, to: OverFrame, room: Point): Point {
  const local = toTableFrame(asTable(from), room);
  const fx = from.widthMm > 0 ? local.x / (from.widthMm / 2) : 0;
  const fy = from.depthMm > 0 ? local.y / (from.depthMm / 2) : 0;
  return fromTableFrame(asTable(to), { x: (fx * to.widthMm) / 2, y: (fy * to.depthMm) / 2 });
}

export function hungCopy<P extends Pick<Placement, "position" | "rotation" | "mirrored">>(p: P, from: OverFrame, to: OverFrame): P {
  const at = relativeSpot(from, to, p.position);
  const rotation = worldRotation(localRotation(p.rotation, from), to);
  const flipped = !!from.mirrored !== !!to.mirrored;
  const next: P = { ...p, position: { x: Math.round(at.x), y: Math.round(at.y) }, rotation };
  if (flipped) {
    if (p.mirrored) delete (next as { mirrored?: boolean }).mirrored;
    else (next as { mirrored?: boolean }).mirrored = true;
  }
  return next;
}

// ponytail: self-check. Run: npm run check:hang-over
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (a: Point, b: Point, tol = 1) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;
  const item: { position: Point; rotation: number; mirrored?: boolean } = { position: { x: 1600, y: 2000 }, rotation: 0 };
  const t0 = { position: { x: 1000, y: 2000 }, rotation: 0 };

  // The table slides 3m right: the pendant 60cm off its middle slides with it.
  const slid = carryHung(item, t0, { position: { x: 4000, y: 2000 }, rotation: 0 });
  assert(near(slid.position, { x: 4600, y: 2000 }), "a moved table carries what hangs over it");
  assert(carryHung(item, t0, t0) === item, "a table that did not move carries nothing");

  // The table turns a quarter: what was 60cm to its right is now 60cm below it, turned too.
  const turned = carryHung(item, t0, { position: { x: 1000, y: 2000 }, rotation: 90 });
  assert(near(turned.position, { x: 1000, y: 2600 }), "a turned table turns what hangs over it round with it");
  assert(turned.rotation === 90, "…and turns the item itself");

  // Mirrored: the pendant goes to the other side, and is flipped itself.
  const flipped = carryHung(item, t0, { position: { x: 1000, y: 2000 }, rotation: 0, mirrored: true });
  assert(near(flipped.position, { x: 400, y: 2000 }) && flipped.mirrored === true, "a flipped table flips what hangs over it");
  const back = carryHung(flipped, { position: { x: 1000, y: 2000 }, rotation: 0, mirrored: true }, t0);
  assert(near(back.position, item.position) && back.mirrored === undefined, "…and flipping back leaves no trace");

  // Copied over another table: the same relative spot. Over the end of a 2.4m table → over the end
  // of a 4.8m one; over the middle stays over the middle, whatever the sizes.
  const from = { position: { x: 1000, y: 2000 }, rotation: 0, widthMm: 2400, depthMm: 1000 };
  const to = { position: { x: 9000, y: 5000 }, rotation: 0, widthMm: 4800, depthMm: 1200 };
  const end = hungCopy({ position: { x: 1000 + 960, y: 2000 }, rotation: 0 }, from, to);
  assert(near(end.position, { x: 9000 + 1920, y: 5000 }), "a pendant over the end of a short table hangs over the end of a long one");
  const mid = hungCopy({ position: { x: 1000, y: 2000 }, rotation: 0 }, from, to);
  assert(near(mid.position, { x: 9000, y: 5000 }), "over the middle stays over the middle");
  const toTurned = { ...to, rotation: 90 };
  const endTurned = hungCopy({ position: { x: 1000 + 960, y: 2000 }, rotation: 0 }, from, toTurned);
  assert(near(endTurned.position, { x: 9000, y: 5000 + 1920 }) && endTurned.rotation === 90, "…and follows the target's facing");

  console.log("hang-over: all checks passed");
}
