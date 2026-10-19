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
import { flatRing, labelAnchor, signedDistance } from "../studio/label-anchor";
import { footprintSpine } from "../studio/spine";
import { unionShapes } from "../studio/stage-draw";
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

// ── The block as ONE shape ─────────────────────────────────────────────────────────────────────
//
// `footprint` is the members side by side — right for the chairs, whose seams it must know. For the
// NUMBER and for a run of items it is wrong: the label point and the spine read a composite's
// LARGEST PART (label-anchor.ts, spine.ts — the counter, not the round end set against it), so a
// head table of two had its number on one half and "פיזור" laid the candles along one half. Read as
// the one outline its members make together, the block is labelled and spread like a table.

type OneShape = { footprint: Footprint; at: Point };
const outlineCache = new Map<string, OneShape | null>();

/** The members as one shape, and where its box centre is in the block's frame (a footprint is drawn
 *  about its own box centre; the union's is the block's to within the curves' sampling). */
function oneShape(block: BlockFrame): OneShape | null {
  const f = block.footprint;
  if (f.kind !== "multi") return { footprint: f, at: { x: 0, y: 0 } };
  const key = JSON.stringify(f);
  if (outlineCache.has(key)) return outlineCache.get(key)!;
  const rings = f.parts.map(flatRing).filter((r) => r.length >= 3);
  const u = rings.length === 1 ? { outline: rings[0] } : unionShapes(rings.map((outline) => ({ outline })), 6);
  let out: OneShape | null = null;
  if (u && u.outline.length >= 3) {
    const xs = u.outline.map((p) => p.x);
    const ys = u.outline.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX;
    const h = Math.max(...ys) - minY;
    const at = { x: minX + w / 2, y: minY + h / 2 };
    // Four square corners filling the box: the plain rectangle it is (exact label, exact spine).
    const square =
      u.outline.length === 4 &&
      u.outline.every((p, i) => {
        const q = u.outline[(i + 1) % 4];
        return Math.abs(p.x - q.x) < 2 || Math.abs(p.y - q.y) < 2;
      });
    out = { footprint: square ? { kind: "rect", widthMm: w, depthMm: h } : { kind: "custom", outline: u.outline }, at };
  }
  if (outlineCache.size > 300) outlineCache.clear();
  outlineCache.set(key, out);
  return out;
}

/** The members' outlines as ONE, in the block's frame (curves sampled), drawn about its own box
 *  centre: a rectangle when they make a rectangle, else a hand-drawn outline. Null when they do not
 *  make one piece without a hole — pushed apart, touching at a point (two rounds), or round a void
 *  (a hollow square). */
export function blockOutline(block: BlockFrame): Footprint | null {
  return oneShape(block)?.footprint ?? null;
}

/** Where the block's ONE number goes, in its frame: the visual centre of the outline its members
 *  make together (labelAnchor) — mid-run on top of a ח of three, the middle of a straight head
 *  table. Members that make no single outline: the label point of the member nearest the block's
 *  middle, unless the middle is on a table already. */
export function blockLabelPoint(block: BlockFrame): Point {
  const one = oneShape(block);
  if (one) {
    const a = labelAnchor(one.footprint);
    return { x: one.at.x + a.x, y: one.at.y + a.y };
  }
  const parts = block.footprint.kind === "multi" ? block.footprint.parts : [];
  const rings = parts.map(flatRing).filter((r) => r.length >= 3);
  const origin = { x: 0, y: 0 };
  // Well inside a member (not on the point where two rounds kiss): the middle is on a table.
  if (rings.length === 0 || rings.some((r) => signedDistance(0, 0, r) >= 150)) return origin;
  let best = origin;
  let bestD = Infinity;
  for (const r of rings) {
    // Each member's own label point, in the block's frame.
    const xs = r.map((p) => p.x);
    const ys = r.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const own = labelAnchor({ kind: "custom", outline: r });
    const p = { x: cx + own.x, y: cy + own.y };
    const d = Math.hypot(p.x, p.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** The block's spine in its frame — the line a run of items is laid along: the ridge of its one
 *  outline (a head table end to end, round a ח of three), else its box's long axis. */
export function blockSpine(block: BlockFrame): Point[] {
  const one = oneShape(block);
  if (one) return footprintSpine(one.footprint).map((p) => ({ x: one.at.x + p.x, y: one.at.y + p.y }));
  return footprintSpine({ kind: "rect", widthMm: block.widthMm, depthMm: block.depthMm });
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

  // ONE shape: the number and the spine read the block, never its largest member.
  const pairOne = blockOutline(pair);
  assert(pairOne?.kind === "rect" && near(pairOne.widthMm, 4800) && near(pairOne.depthMm, 1200), "two 240×120 end to end are one 480×120 rectangle");
  const pairLabel = blockLabelPoint(pair);
  assert(near(pairLabel.x, 0) && near(pairLabel.y, 0), "…numbered at its middle, on the seam");
  const pairSpine = blockSpine(pair);
  assert(near(pairSpine[0].x, -2400) && near(pairSpine[pairSpine.length - 1].x, 2400), "…and spread along its whole length, not one half");
  // A ח of three: the number goes mid-run on the top table, not in the air between the legs.
  const het = blockFrame([
    { id: "top", footprint: rect(3000, 900), position: { x: 0, y: -600 } },
    { id: "l", footprint: rect(900, 1200), position: { x: -1050, y: 450 } },
    { id: "r", footprint: rect(900, 1200), position: { x: 1050, y: 450 } },
  ])!;
  assert(blockOutline(het)?.kind === "custom", "a ח of three is one outline");
  const hetLabel = blockLabelPoint(het);
  const hetTop = { x: 0 - het.centre.x, y: -600 - het.centre.y };
  assert(Math.abs(hetLabel.x - hetTop.x) < 300 && Math.abs(hetLabel.y - hetTop.y) < 400, "…numbered on its top run, not between its legs");
  // Rounds that only touch make no one outline: the number stands on a table, never on the kiss.
  assert(blockOutline(rounds) === null, "two rounds touching at a point are not one outline");
  const roundLabel = blockLabelPoint(rounds);
  assert(near(Math.abs(roundLabel.x), 900, 30) && near(roundLabel.y, 0, 30), "…numbered at the middle of one of them");
  console.log("block self-check passed");
}
