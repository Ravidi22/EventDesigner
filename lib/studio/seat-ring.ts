// A TABLE TAKES UP ITS CHAIRS (QA MG-16).
//
// Two tables pushed together by the magnet used to stop with their TOPS flush — and their chairs
// standing through each other, which no room can hold: the guests on the facing sides would be
// sitting in each other's laps. The hold (lib/studio/collide.ts) reads a table as its SEAT RING
// instead: the room the table and its chairs take up together, so two tables stop where their
// chairs meet.
//
// The ring is the box round the table and every chair in the TABLE'S OWN FRAME — a rectangle that
// turns with the table, off-centre when only one side is seated — or, for a round table, the circle
// through the furthest chair corner. A convex shape on purpose: the hold's separating test reads
// rectangles and circles, and a chair ring is near enough to either.
//
// The ring is for the HOLD and the flush snap between tables only. What a gap between two tables
// IS — the spacing tool, the printed measurements, the clearance halos — stays table edge to table
// edge, without the chairs (CLAUDE.md, "Gaps between tables … WITHOUT the chairs").
//
// Pure; self-checked: `npx tsx lib/studio/seat-ring.ts`.
import type { Point } from "./hall";
import { CHAIR_D_MM, CHAIR_W_MM, type Seat } from "./seating";
import type { BoxShape } from "./snap";
import { isMain } from "../self-check";

/** A table's ring in its own frame: a box about (cx, cy) — or a circle about the table's centre. */
export interface SeatRing {
  round: boolean;
  cx: number;
  cy: number;
  widthMm: number;
  depthMm: number;
}

/** The corners of one chair, in the table's frame (Seat: its centre, facing the table). */
function chairCorners(s: Seat): Point[] {
  const t = (s.facingDeg * Math.PI) / 180;
  const u = { x: Math.cos(t), y: Math.sin(t) };
  const v = { x: -u.y, y: u.x };
  const d = CHAIR_D_MM / 2;
  const w = CHAIR_W_MM / 2;
  return [
    [d, w],
    [d, -w],
    [-d, w],
    [-d, -w],
  ].map(([i, k]) => ({ x: s.x + u.x * i + v.x * k, y: s.y + u.y * i + v.y * k }));
}

/** The ring of a table `widthMm` × `depthMm` (a circle of that width when `round`) with these
 *  chairs. No chairs = the table itself. */
export function seatRing(table: { widthMm: number; depthMm: number; round?: boolean }, seats: readonly Seat[]): SeatRing {
  const corners = seats.flatMap(chairCorners);
  if (table.round) {
    const r = Math.max(table.widthMm / 2, ...corners.map((q) => Math.hypot(q.x, q.y)));
    return { round: true, cx: 0, cy: 0, widthMm: 2 * r, depthMm: 2 * r };
  }
  let minX = -table.widthMm / 2;
  let maxX = table.widthMm / 2;
  let minY = -table.depthMm / 2;
  let maxY = table.depthMm / 2;
  for (const q of corners) {
    minX = Math.min(minX, q.x);
    maxX = Math.max(maxX, q.x);
    minY = Math.min(minY, q.y);
    maxY = Math.max(maxY, q.y);
  }
  return { round: false, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, widthMm: maxX - minX, depthMm: maxY - minY };
}

/** The ring in the room for a table standing at `at`, turned `rotationDeg`, flipped side to side when
 *  `mirrored` (MIRROR_TRANSFORM, applied before the turn): its centre, the axis-aligned room it takes
 *  up, and its true outline (SnapBox.shape) when that is not the box itself. */
export function ringInRoom(ring: SeatRing, at: Point, rotationDeg = 0, mirrored = false): { x: number; y: number; widthMm: number; depthMm: number; shape?: BoxShape } {
  const t = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const lx = mirrored ? -ring.cx : ring.cx;
  const x = at.x + lx * c - ring.cy * s;
  const y = at.y + lx * s + ring.cy * c;
  if (ring.round) return { x, y, widthMm: ring.widthMm, depthMm: ring.depthMm, shape: { round: true, rotation: 0, widthMm: ring.widthMm, depthMm: ring.depthMm } };
  const w = ring.widthMm * Math.abs(c) + ring.depthMm * Math.abs(s);
  const d = ring.widthMm * Math.abs(s) + ring.depthMm * Math.abs(c);
  return { x, y, widthMm: w, depthMm: d, ...(rotationDeg % 360 ? { shape: { rotation: rotationDeg, widthMm: ring.widthMm, depthMm: ring.depthMm } } : {}) };
}

// ponytail: self-check. Run: npx tsx lib/studio/seat-ring.ts
if (isMain(import.meta.url)) {
  const assert = (cond: boolean, m: string) => {
    if (!cond) throw new Error("FAIL: " + m);
  };
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  // A bare table is its own box.
  const bare = seatRing({ widthMm: 2400, depthMm: 1200 }, []);
  assert(bare.widthMm === 2400 && bare.depthMm === 1200 && bare.cx === 0 && bare.cy === 0, "a table with no chairs is its top");
  // A chair facing up (+y toward the table, i.e. facing −90°?) — one on the +y side, facing −y.
  const below: Seat = { x: 0, y: 600 + CHAIR_D_MM / 2, facingDeg: -90 };
  const one = seatRing({ widthMm: 2400, depthMm: 1200 }, [below]);
  assert(near(one.depthMm, 1200 + CHAIR_D_MM) && near(one.cy, CHAIR_D_MM / 2) && one.widthMm === 2400, "chairs on one side only: the ring grows on that side, off-centre");
  // A round table: the circle through the furthest chair corner.
  const r = 900;
  const ringed = seatRing({ widthMm: 1800, depthMm: 1800, round: true }, [{ x: r + 100, y: 0, facingDeg: 180 }]);
  assert(ringed.round && near(ringed.widthMm / 2, Math.hypot(r + 100 + CHAIR_D_MM / 2, CHAIR_W_MM / 2)), "a round table's ring is the circle through its furthest chair corner");
  // Into the room: the off-centre ring turns with the table, and a mirror flips it side to side.
  const side = seatRing({ widthMm: 2000, depthMm: 1000 }, [{ x: 1000 + CHAIR_D_MM / 2, y: 0, facingDeg: 180 }]);
  assert(side.cx > 0, "a chair at the +x end puts the ring's middle toward +x");
  const turned = ringInRoom(side, { x: 0, y: 0 }, 90);
  assert(near(turned.x, 0) && near(turned.y, side.cx) && near(turned.widthMm, side.depthMm) && near(turned.depthMm, side.widthMm), "turned a quarter, the ring's middle and box turn with it");
  const flipped = ringInRoom(side, { x: 0, y: 0 }, 0, true);
  assert(near(flipped.x, -side.cx), "mirrored, the seated end is on the other side");
  console.log("seat-ring self-check passed");
}
