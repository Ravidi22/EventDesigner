// A BLOCK of tables — several the designer pushed together and grouped — read as the ONE larger
// table it is, for the chairs that go round it.
//
// The chairs used to go round the block's world-axis BOUNDING BOX: a rectangle, unturned, whatever
// the members were. That is right for two straight rectangles at 0° and wrong for everything else —
// a block turned 30° was seated on a box that did not touch it, two rounds pushed together were
// seated as one rectangle, a mirrored ח lost its open side, and a head table's blocked back got
// chairs because the box knew nothing of the members' blocked sides.
//
// So a block has a FRAME — its first member's facing, which is what refitBlock already treats as the
// block's own axes — and a FOOTPRINT: every member's shape, placed where it stands in that frame
// (through its own turn and mirror), as one `multi` footprint. That is the thing seatsAround already
// knows how to seat: each part's sides in turn, the seams between two members `covered` (a probe
// out from a side lands inside another member — lib/studio/seating.ts seatSides), the members' own
// blocked sides carried across by index. The ring is drawn in the block's frame, so turning the
// block turns its chairs with it, and the printed map and the table detail draw the same ring.
//
// Pure, no DOM, self-checked: `npm run check:block`.
import type { Point } from "./types";
import { flattenEdge, footprintOutlines, type BuiltOutline, type Footprint } from "../studio/footprint";
import { CHAIR_D_MM, CHAIR_OFFSET_MM, seatSides, seatsAround, type Seat } from "../studio/seating";
import { isMain } from "../self-check";

export interface BlockMember {
  id: string;
  /** Its own footprint, in its own frame (tableFootprint). */
  footprint: Footprint;
  position: Point;
  rotation?: number;
  mirrored?: boolean;
  /** The sides of ITS footprint nobody sits at — indices into seatSides(footprint), the same numbers
   *  DesignTable.blockedSides and MapAppearance.blockedSides store. */
  blockedSides?: readonly number[];
}

export interface BlockFrame {
  /** The block's middle in the room: the centre of the box round every member, in the block's frame. */
  centre: Point;
  /** The block's facing, degrees — its first member's. */
  rotation: number;
  /** Its box in its own frame (width along its facing). */
  widthMm: number;
  depthMm: number;
  /** Every member's shape where it stands, in the block's frame: centred on `centre`, before the
   *  turn. One footprint, so it is seated like any other shape. */
  footprint: Footprint;
  /** The sides of `footprint` the members blocked — indices into seatSides(footprint). */
  blocked: number[];
}

const RAD = Math.PI / 180;

/** The block's frame and footprint. Null for no members. */
export function blockFrame(members: readonly BlockMember[]): BlockFrame | null {
  if (members.length === 0) return null;
  const rotation = members[0].rotation ?? 0;
  const cos = Math.cos(rotation * RAD);
  const sin = Math.sin(rotation * RAD);
  // Room → the block's axes (not yet centred), and back.
  const toFrame = (p: Point): Point => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos });
  const toRoom = (p: Point): Point => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });

  const parts: BuiltOutline[] = [];
  const blocked: number[] = [];
  let sideBase = 0;
  for (const m of members) {
    const turn = ((m.rotation ?? 0) - rotation) * RAD;
    const mc = Math.cos(turn);
    const ms = Math.sin(turn);
    const at = toFrame(m.position);
    const sx = m.mirrored ? -1 : 1;
    // A member's point in the block's frame: its mirror (across its own width, before its turn — the
    // order MIRROR_TRANSFORM is applied in), its turn relative to the block, then where it stands.
    const vec = (p: Point): Point => ({ x: p.x * sx * mc - p.y * ms, y: p.x * sx * ms + p.y * mc });
    const pt = (p: Point): Point => {
      const v = vec(p);
      return { x: at.x + v.x, y: at.y + v.y };
    };
    for (const o of footprintOutlines(m.footprint)) {
      parts.push({
        outline: o.outline.map(pt),
        // Control arms are offsets from their own endpoints: mirrored and turned, never moved.
        ...(o.edgeCurves ? { edgeCurves: o.edgeCurves.map((c) => (c ? { c1: vec(c.c1), c2: vec(c.c2) } : null)) } : {}),
      });
    }
    // Its blocked sides, as sides of the whole: seatSides lists each part's sides in turn, and a
    // member's own footprint has the same sides in the same order (footprintOutlines → outlineSides
    // walks a rectangle's four edges from its first corner, a round as one loop).
    const n = seatSides(m.footprint).length;
    for (const b of m.blockedSides ?? []) if (Number.isInteger(b) && b >= 0 && b < n) blocked.push(sideBase + b);
    sideBase += n;
  }

  // The box round everything, bowed edges sampled: a round member turned off the block's axes has
  // its extremes between its four corners.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of parts) {
    const n = o.outline.length;
    o.outline.forEach((a, i) => {
      for (const q of flattenEdge(a, o.outline[(i + 1) % n], o.edgeCurves?.[i] ?? null, 12)) {
        if (q.x < minX) minX = q.x;
        if (q.x > maxX) maxX = q.x;
        if (q.y < minY) minY = q.y;
        if (q.y > maxY) maxY = q.y;
      }
    });
  }
  const c = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const centred = parts.map((o) => ({ ...o, outline: o.outline.map((p) => ({ x: p.x - c.x, y: p.y - c.y })) }));
  return {
    centre: toRoom(c),
    rotation,
    widthMm: maxX - minX,
    depthMm: maxY - minY,
    footprint: { kind: "multi", parts: centred },
    blocked,
  };
}

/** The chairs round a block, in its frame — drawn under `translate(centre) rotate(rotation)`. */
export function blockSeats(block: BlockFrame, count: number, offsetMm = CHAIR_OFFSET_MM): Seat[] {
  return seatsAround(block.footprint, count, offsetMm, block.blocked);
}

// ponytail: self-check. Run: npm run check:block
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
  const rect = (widthMm: number, depthMm: number): Footprint => ({ kind: "rect", widthMm, depthMm });
  const round = (diameterMm: number): Footprint => ({ kind: "circle", diameterMm });
  const turn = (p: Point, deg: number): Point => ({ x: p.x * Math.cos(deg * RAD) - p.y * Math.sin(deg * RAD), y: p.x * Math.sin(deg * RAD) + p.y * Math.cos(deg * RAD) });
  const inRoom = (b: BlockFrame, s: Seat): Point => {
    const q = turn({ x: s.x, y: s.y }, b.rotation);
    return { x: b.centre.x + q.x, y: b.centre.y + q.y };
  };

  // Two 240×120 end to end: one 480×120 block, seated on the outside only.
  const pair = blockFrame([
    { id: "a", footprint: rect(2400, 1200), position: { x: -1200, y: 0 } },
    { id: "b", footprint: rect(2400, 1200), position: { x: 1200, y: 0 } },
  ])!;
  assert(near(pair.widthMm, 4800) && near(pair.depthMm, 1200) && near(pair.centre.x, 0) && near(pair.centre.y, 0), "two 240×120 end to end box as 480×120 about their middle");
  const seats = blockSeats(pair, 20);
  assert(seats.length === 20, "the block seats what its members seat");
  assert(seats.every((s) => Math.abs(s.x) > 2400 - 1 || Math.abs(s.y) > 600 - 1), "…and no chair sits in the seam between them");
  assert(seats.filter((s) => s.y < -600).length === seats.filter((s) => s.y > 600).length, "…the long sides seated alike");
  assert(seats.some((s) => s.x < -2400) && seats.some((s) => s.x > 2400), "…and the two outer ends seated too");

  // The same block turned 30°: the chairs turn with it.
  const turned = blockFrame([
    { id: "a", footprint: rect(2400, 1200), position: turn({ x: -1200, y: 0 }, 30), rotation: 30 },
    { id: "b", footprint: rect(2400, 1200), position: turn({ x: 1200, y: 0 }, 30), rotation: 30 },
  ])!;
  assert(turned.rotation === 30 && near(turned.widthMm, 4800) && near(turned.depthMm, 1200), "a turned block is boxed in its own frame, not the room's");
  const turnedSeats = blockSeats(turned, 20);
  assert(turnedSeats.length === 20, "…seats the same twenty");
  assert(
    turnedSeats.every((s) => {
      const r = inRoom(turned, s);
      const local = turn(r, -30);
      return near(Math.abs(local.y), 600 + CHAIR_OFFSET_MM, 2) || near(Math.abs(local.x), 2400 + CHAIR_OFFSET_MM, 2);
    }),
    "…each chair pushed in against the turned block's own edge",
  );

  // A head table's blocked back: the members' blocked sides carry across. Side 0 of a rectangle is
  // its top (−y); block it on both and the chairs go to the front and the ends.
  const head = blockFrame([
    { id: "a", footprint: rect(2400, 1200), position: { x: -1200, y: 0 }, blockedSides: [0] },
    { id: "b", footprint: rect(2400, 1200), position: { x: 1200, y: 0 }, blockedSides: [0] },
  ])!;
  assert(head.blocked.length === 2 && head.blocked.includes(0) && head.blocked.includes(4), "each member's blocked side is a side of the whole");
  const headSeats = blockSeats(head, 10);
  assert(headSeats.length === 10 && headSeats.every((s) => s.y > -600), "a head table block has no chair behind it");

  // Two rounds pushed together are seated round two circles, not round a rectangle.
  const rounds = blockFrame([
    { id: "a", footprint: round(1800), position: { x: -900, y: 0 } },
    { id: "b", footprint: round(1800), position: { x: 900, y: 0 } },
  ])!;
  const roundSeats = blockSeats(rounds, 20);
  assert(roundSeats.length === 20, "two rounds seat twenty");
  assert(
    roundSeats.every((s) => near(Math.hypot(s.x + 900, s.y), 900 + CHAIR_OFFSET_MM, 25) || near(Math.hypot(s.x - 900, s.y), 900 + CHAIR_OFFSET_MM, 25)),
    "…every chair on one rim or the other",
  );
  assert(
    roundSeats.every((s) => (s.x < 0 ? Math.hypot(s.x - 900, s.y) : Math.hypot(s.x + 900, s.y)) >= 900 + CHAIR_D_MM / 2 - 20),
    "…and none in the pinch, standing in the other table",
  );

  // A mirrored member is placed as its mirror image: a ח open on the right, flipped, is open on the left.
  const u: Footprint = { kind: "custom", outline: [{ x: -600, y: -300 }, { x: 600, y: -300 }, { x: 600, y: 300 }, { x: 300, y: 300 }, { x: 300, y: -100 }, { x: -300, y: -100 }, { x: -300, y: 300 }, { x: -600, y: 300 }] };
  const flipped = blockFrame([{ id: "u", footprint: u, position: { x: 0, y: 0 }, mirrored: true }, { id: "r", footprint: rect(600, 200), position: { x: 0, y: -400 } }])!;
  const mirroredPart = (flipped.footprint as { parts: BuiltOutline[] }).parts[0].outline;
  const original = footprintOutlines(u)[0].outline;
  assert(mirroredPart.every((p, i) => near(p.x, -original[i].x - (flipped.centre.x), 1)), "a mirrored member's points are mirrored across its own width");

  // A single member is itself: same box, same chairs as seating it alone.
  const lone = blockFrame([{ id: "a", footprint: rect(1800, 900), position: { x: 500, y: 700 }, rotation: 90 }])!;
  assert(near(lone.centre.x, 500) && near(lone.centre.y, 700) && lone.rotation === 90 && near(lone.widthMm, 1800) && near(lone.depthMm, 900), "one member is its own block");
  assert(blockSeats(lone, 8).length === 8, "…and seats as itself");

  assert(blockFrame([]) === null, "no members, no block");
  console.log("block self-check passed");
}
