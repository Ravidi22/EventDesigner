// A STAGE STAYS IN ITS ROOM — the fill tool's area may not cross a wall.
//
// A side drawn through a wall is never meant: the stage stops at the wall (2026-10-31, the user:
// "limit the user to not get across a wall with the stage fill-out"). So the next corner of an area
// being drawn is clipped to the first wall its side would cross (clipToWalls — the side ends flush
// on the wall, which is where a stage against a wall belongs), and an outline edited by its grips or
// by a typed figure is refused when any side of it crosses one (crossesWalls — the grip holds where
// it was, the typed box is marked).
//
// Touching is not crossing, and touching is judged ACROSS the wall, never along the side (QA
// 2026-11-20, ST-1 — the user's "I type a stage length and it turns red"). A wall traced a hair off
// square drifts away from a stage drawn square to the room — אמרה's west wall 5 mm over 14 m, another
// of its walls 23 mm over 13.3 m — so a side laid along it runs a few millimetres into its line, and
// where that line passes between the side's two corners it used to "cross" it hundreds of millimetres
// along: drawn sides were cut short, and typed figures refused. Now:
//   • an outline crosses a wall when some part of the wall lies INSIDE it, farther than
//     WALL_TOUCH_MM from every side (crossesWalls) — a stage reaching a couple of centimetres into a
//     wall's line stands against the wall; a wall that ENDS on a side (a T, where a garden wall meets
//     the hall) touches it from outside and crosses it only when its body goes in; a wall standing
//     wholly inside the outline crosses it too;
//   • an edit is refused only for what it made WORSE (`before`): an outline already reaching into a
//     wall — pushed there by a resize, drawn before this rule — keeps its other sides editable and
//     may be pulled back out, but not pushed further in;
//   • a side being drawn stops flush on a wall it passes THROUGH (beyond the band on both sides of its
//     line), and — once the drawing says which side the stage is on — where a wall meeting it goes in
//     on that side; a side STARTING on a wall (within WALL_CLIP_TOL_MM along it) is not stopped by it.
//
// Pure, no DOM; self-checked: `npm run check:wall-clip`.
import type { Point } from "@/lib/studio/hall";
import type { VenueStructure } from "@/lib/venues/structure";
import { nodeMap, wallPoints } from "@/lib/venues/structure";
import { flattenEdge } from "./footprint";
import { isMain } from "../self-check";

/** A wall met within this of a side's START, along it, is the wall the side begins on — its corner
 *  snapped there and rounded to the millimetre — and does not stop it. */
export const WALL_CLIP_TOL_MM = 2;

/** How far past a wall's line a stage may reach and still stand AGAINST the wall rather than through
 *  it, measured across the wall: a wall traced a tenth of a degree off square drifts 23 mm along a
 *  13 m hall, and a stage drawn square to the room beside it reaches that far into its line. */
export const WALL_TOUCH_MM = 25;

/** Every wall of the venue as a polyline in the room: a straight wall its two ends, a bowed wall its
 *  curve cut into chords. A zone's "edge" line is a boundary on paper, not a wall (nearestWall skips
 *  it too). */
export function wallPolylines(structure: VenueStructure): Point[][] {
  const nodes = nodeMap(structure);
  const out: Point[][] = [];
  for (const wall of structure.walls) {
    if (wall.kind === "edge") continue;
    const pts = wallPoints(structure, wall, nodes);
    if (!pts) continue;
    out.push(flattenEdge(pts.a, pts.b, wall.curve ?? null));
  }
  return out;
}

/** Where p→q crosses a→b: the fraction along p→q, or null when the two do not meet. Parallel lines
 *  never cross (a side sliding along a wall is not through it); the wall's own ends count. */
export function segmentCrossing(p: Point, q: Point, a: Point, b: Point): number | null {
  const rx = q.x - p.x;
  const ry = q.y - p.y;
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den;
  const u = ((a.x - p.x) * ry - (a.y - p.y) * rx) / den;
  return t >= 0 && t <= 1 && u >= -1e-9 && u <= 1 + 1e-9 ? t : null;
}

/** The point along from→to before the first wall the side would go through — `to` itself when it
 *  goes through none. Each wall is read in the side's own frame, over the stretch of it beside the
 *  side (s along the side, h across it):
 *   • a wall reaching more than WALL_TOUCH_MM past the side's line on BOTH sides is one the side
 *     passes through: it stops where the wall crosses its line — flush on the wall;
 *   • a wall that only meets the side (a T, or one drifting off it) stops it only when `inside` says
 *     which side of from→to the stage is on (+1 where cross(to − from, x − from) > 0, −1 the other)
 *     and the wall goes in there deeper than the band — where it gets that deep. Without `inside`
 *     (the first side of a drawing) it does not stop it: the closed outline is judged at the end;
 *   • a wall running along the side within the band never stops it, however long the side.
 *  A wall met within WALL_CLIP_TOL_MM of the side's start is the one it begins on. */
export function clipToWalls(from: Point, to: Point, walls: readonly (readonly Point[])[], inside?: 1 | -1): Point {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (len <= WALL_CLIP_TOL_MM) return to;
  const ux = (to.x - from.x) / len;
  const uy = (to.y - from.y) / len;
  const along = (p: Point) => (p.x - from.x) * ux + (p.y - from.y) * uy;
  const across = (p: Point) => ux * (p.y - from.y) - uy * (p.x - from.x);
  const band = WALL_TOUCH_MM;
  let best = Infinity;
  for (const w of walls) {
    for (let i = 0; i + 1 < w.length; i++) {
      const sa = along(w[i]);
      const sb = along(w[i + 1]);
      const ha = across(w[i]);
      const hb = across(w[i + 1]);
      // The stretch of the wall beside the side: 0 ≤ s ≤ len.
      let v0 = 0;
      let v1 = 1;
      const ds = sb - sa;
      if (Math.abs(ds) < 1e-9) {
        if (sa < 0 || sa > len) continue;
      } else {
        const t0 = (0 - sa) / ds;
        const t1 = (len - sa) / ds;
        v0 = Math.max(0, Math.min(t0, t1));
        v1 = Math.min(1, Math.max(t0, t1));
        if (v0 > v1) continue;
      }
      const s0 = sa + v0 * ds;
      const s1 = sa + v1 * ds;
      const h0 = ha + v0 * (hb - ha);
      const h1 = ha + v1 * (hb - ha);
      const lo = Math.min(h0, h1);
      const hi = Math.max(h0, h1);
      // Nowhere near the side's line: a wall the stage may or may not reach, judged when it closes.
      if (lo > band || hi < -band) continue;
      let stop: number | null = null;
      if (lo < -band && hi > band) {
        // Through it: stop where the wall crosses the side's line.
        stop = s0 + (h0 / (h0 - h1)) * (s1 - s0);
      } else if (inside) {
        const d0 = inside * h0;
        const d1 = inside * h1;
        // Into the stage's side of the line, deeper than the band: stop where it gets that deep.
        if (Math.max(d0, d1) > band) stop = s0 + ((band - d0) / (d1 - d0)) * (s1 - s0);
      }
      if (stop !== null && stop > WALL_CLIP_TOL_MM && stop < best) best = stop;
    }
  }
  if (best === Infinity || best >= len) return to;
  const t = best / len;
  return { x: Math.round(from.x + (to.x - from.x) * t), y: Math.round(from.y + (to.y - from.y) * t) };
}

/** Does the closed outline cross a wall — does some part of a wall lie inside it, farther than
 *  WALL_TOUCH_MM from every side? A stage against a wall, a wall drifting a few millimetres along a
 *  side, a wall ending on a side from outside: none of them. With `before` (the outline as it stood
 *  before an edit, in the same frame) only what the edit made WORSE counts — a wall the outline
 *  already reached into may stay as deep, or less, so one old touch never refuses every later edit,
 *  and a stage pushed into a wall can be pulled back out a step at a time. */
export function crossesWalls(outline: readonly Point[], walls: readonly (readonly Point[])[], before?: readonly Point[]): boolean {
  if (outline.length < 3) return false;
  const box = boxOf(outline);
  for (const w of walls) {
    for (let i = 0; i + 1 < w.length; i++) {
      const a = w[i];
      const b = w[i + 1];
      // A wall clear of the outline's box cannot reach into it.
      if (Math.max(a.x, b.x) < box.minX || Math.min(a.x, b.x) > box.maxX || Math.max(a.y, b.y) < box.minY || Math.min(a.y, b.y) > box.maxY) continue;
      if (!reachesIn(outline, a, b, WALL_TOUCH_MM)) continue;
      if (!before || before.length < 3) return true;
      if (reachesIn(outline, a, b, Math.max(WALL_TOUCH_MM, depthIn(before, a, b) + 1))) return true;
    }
  }
  return false;
}

/** The wall segment `p` stands on — within `tolMm` of it — or null. A point on two (a corner of the
 *  room) takes the one running most nearly along `along`, when given: the side of the stage that
 *  should stay against its wall. */
export function wallAt(p: Point, walls: readonly (readonly Point[])[], along?: Point, tolMm = WALL_TOUCH_MM): [Point, Point] | null {
  let best: [Point, Point] | null = null;
  let bestScore = Infinity;
  const al = along ? Math.hypot(along.x, along.y) : 0;
  for (const w of walls) {
    for (let i = 0; i + 1 < w.length; i++) {
      const a = w[i];
      const b = w[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      if (l2 < 1) continue;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
      const d = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
      if (d > tolMm) continue;
      // Along `along`: 0 when the wall runs that way, 1 when square to it. Then nearest.
      const off = al ? 1 - Math.abs((dx * along!.x + dy * along!.y) / (Math.sqrt(l2) * al)) : 0;
      const score = off * 1e6 + d;
      if (score < bestScore) {
        bestScore = score;
        best = [a, b];
      }
    }
  }
  return best;
}

const boxOf = (poly: readonly Point[]) => ({
  minX: Math.min(...poly.map((p) => p.x)),
  maxX: Math.max(...poly.map((p) => p.x)),
  minY: Math.min(...poly.map((p) => p.y)),
  maxY: Math.max(...poly.map((p) => p.y)),
});

/** Ray casting — sound here, as it is only asked of points farther than a band from every side. */
function inPolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The stretch of the wall a→b (as fractions of it) lying within `r` of the side p→q — the wall cut
 *  by the side's capsule, which being convex cuts it in one stretch — or null. */
function nearStretch(a: Point, b: Point, p: Point, q: Point, r: number): [number, number] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  let lo = Infinity;
  let hi = -Infinity;
  const take = (u0: number, u1: number) => {
    if (u1 < u0) return;
    lo = Math.min(lo, u0);
    hi = Math.max(hi, u1);
  };
  // The discs round the side's two corners.
  for (const c of [p, q]) {
    const fx = a.x - c.x;
    const fy = a.y - c.y;
    if (d2 < 1e-12) {
      if (fx * fx + fy * fy <= r * r) take(0, 1);
      continue;
    }
    const half = (fx * dx + fy * dy) / d2;
    const disc = half * half - (fx * fx + fy * fy - r * r) / d2;
    if (disc < 0) continue;
    const root = Math.sqrt(disc);
    take(-half - root, -half + root);
  }
  // The band along the side between them.
  const L = Math.hypot(q.x - p.x, q.y - p.y);
  if (L > 1e-9) {
    const ex = (q.x - p.x) / L;
    const ey = (q.y - p.y) / L;
    let u0 = -Infinity;
    let u1 = Infinity;
    // c + u·k held between lo2 and hi2.
    const hold = (c: number, k: number, lo2: number, hi2: number) => {
      if (Math.abs(k) < 1e-12) {
        if (c < lo2 || c > hi2) [u0, u1] = [Infinity, -Infinity];
        return;
      }
      const t0 = (lo2 - c) / k;
      const t1 = (hi2 - c) / k;
      u0 = Math.max(u0, Math.min(t0, t1));
      u1 = Math.min(u1, Math.max(t0, t1));
    };
    hold((a.x - p.x) * ex + (a.y - p.y) * ey, dx * ex + dy * ey, 0, L);
    hold(ex * (a.y - p.y) - ey * (a.x - p.x), ex * dy - ey * dx, -r, r);
    take(u0, u1);
  }
  lo = Math.max(lo, 0);
  hi = Math.min(hi, 1);
  return lo <= hi ? [lo, hi] : null;
}

/** Does the wall a→b reach more than `r` inside the outline? Exact: the stretches of the wall within
 *  r of a side are cut away, and each stretch left over is wholly inside the outline or wholly
 *  outside it — its middle says which. */
function reachesIn(outline: readonly Point[], a: Point, b: Point, r: number): boolean {
  const n = outline.length;
  const near: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const s = nearStretch(a, b, outline[k], outline[(k + 1) % n], r);
    if (s) near.push(s);
  }
  near.sort((x, y) => x[0] - y[0]);
  const inside = (u0: number, u1: number) => {
    if (u1 - u0 < 1e-9) return false;
    const m = (u0 + u1) / 2;
    return inPolygon({ x: a.x + (b.x - a.x) * m, y: a.y + (b.y - a.y) * m }, outline);
  };
  let at = 0;
  for (const [u0, u1] of near) {
    if (u0 > at && inside(at, u0)) return true;
    at = Math.max(at, u1);
    if (at >= 1) return false;
  }
  return inside(at, 1);
}

/** How deep the wall a→b reaches into the outline (0 when it never gets in), to a tenth of a
 *  millimetre — read only for a wall the edit took through the band, so seldom. */
function depthIn(outline: readonly Point[], a: Point, b: Point): number {
  if (!reachesIn(outline, a, b, 0.5)) return 0;
  const box = boxOf(outline);
  let lo = 0.5;
  let hi = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  while (hi - lo > 0.1) {
    const mid = (lo + hi) / 2;
    if (reachesIn(outline, a, b, mid)) lo = mid;
    else hi = mid;
  }
  return hi;
}

// ponytail: self-check. Run: npm run check:wall-clip
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  // A 10m × 6m room: four walls round the origin's corner.
  const room: Point[][] = [
    [{ x: 0, y: 0 }, { x: 10000, y: 0 }],
    [{ x: 10000, y: 0 }, { x: 10000, y: 6000 }],
    [{ x: 10000, y: 6000 }, { x: 0, y: 6000 }],
    [{ x: 0, y: 6000 }, { x: 0, y: 0 }],
  ];
  const clipped = clipToWalls({ x: 1000, y: 1000 }, { x: 12000, y: 1000 }, room);
  assert(clipped.x === 10000 && clipped.y === 1000, `a side drawn through the wall stops on it (${clipped.x})`);
  const inside = clipToWalls({ x: 1000, y: 1000 }, { x: 8000, y: 4000 }, room);
  assert(inside.x === 8000 && inside.y === 4000, "a side inside the room is left alone");
  const along = clipToWalls({ x: 0, y: 0 }, { x: 5000, y: 0 }, room);
  assert(along.x === 5000, "a side running along a wall is not stopped by it");
  const off = clipToWalls({ x: 10000, y: 2000 }, { x: 4000, y: 2000 }, room);
  assert(off.x === 4000, "a side leaving a wall it starts on is not stopped by that wall");
  const flush = clipToWalls({ x: 2000, y: 1000 }, { x: 10000.4, y: 1000 }, room);
  assert(flush.x === 10000, "a hair past the wall is on the wall");
  const nearStart = clipToWalls({ x: 10000.4, y: 2000 }, { x: 4000, y: 2000 }, room);
  assert(nearStart.x === 4000, "…and a corner rounded a hair past the wall still draws its next side into the room");

  assert(!crossesWalls([{ x: 1000, y: 1000 }, { x: 5000, y: 1000 }, { x: 5000, y: 3000 }, { x: 1000, y: 3000 }], room), "a stage inside the room crosses nothing");
  assert(crossesWalls([{ x: 6000, y: 1000 }, { x: 12000, y: 1000 }, { x: 12000, y: 3000 }, { x: 6000, y: 3000 }], room), "a stage through the wall crosses it");
  assert(!crossesWalls([{ x: 6000, y: 1000 }, { x: 10000, y: 1000 }, { x: 10000, y: 3000 }, { x: 6000, y: 3000 }], room), "a stage flush against the wall does not");
  assert(!crossesWalls([{ x: 6000, y: 1000 }, { x: 10000.5, y: 1000 }, { x: 10000.5, y: 3000 }, { x: 6000, y: 3000 }], room), "…nor one half a millimetre into it");
  assert(crossesWalls([{ x: 6000, y: -1000 }, { x: 8000, y: -1000 }, { x: 8000, y: 3000 }, { x: 6000, y: 3000 }], room), "a stage whose sides pass through the wall crosses it, wherever its corners are");
  assert(segmentCrossing({ x: 0, y: 1 }, { x: 10, y: 1 }, { x: 0, y: 0 }, { x: 10, y: 0 }) === null, "parallel lines never cross");

  // ── QA 2026-11-20 ST-1: touching is judged ACROSS the wall, not along the side ──────────────────
  // אמרה's west wall drifts 5 mm over 14 m (its 13.3 m wall 23 mm): a stage drawn square to the room
  // with its corner snapped onto it runs a few millimetres into its line. That is a stage against
  // the wall — it was read as crossing it, and every typed figure after it went red.
  const drift: Point[][] = [[{ x: 0, y: 0 }, { x: 5, y: 14000 }]];
  const onDrift = [{ x: 1, y: 2000 }, { x: 4001, y: 2000 }, { x: 4001, y: 8000 }, { x: 1, y: 8000 }];
  assert(!crossesWalls(onDrift, drift), "a stage whose side lies on a wall drifting 5 mm over 14 m does not cross it");
  assert(!crossesWalls([{ x: 1, y: 300 }, { x: 4001, y: 300 }, { x: 4001, y: 14000 }, { x: 1, y: 14000 }], drift), "…all along it");
  const drift23: Point[][] = [[{ x: 0, y: 0 }, { x: 23, y: 13300 }]];
  assert(!crossesWalls([{ x: 0, y: 300 }, { x: 3000, y: 300 }, { x: 3000, y: 13000 }, { x: 0, y: 13000 }], drift23), "…nor one along a wall a tenth of a degree off square (23 mm over 13.3 m)");
  const alongDrift = clipToWalls({ x: 1, y: 2000 }, { x: 1, y: 12000 }, drift);
  assert(alongDrift.x === 1 && alongDrift.y === 12000, `a side drawn along a drifting wall is not cut short (${alongDrift.y})`);
  const alongDrift23 = clipToWalls({ x: 0, y: 300 }, { x: 0, y: 13000 }, drift23, -1);
  assert(alongDrift23.y === 13000, `…nor along the 23 mm one, the stage beside it (${alongDrift23.y})`);
  const angled: Point[][] = [[{ x: 0, y: 0 }, { x: 6000, y: 7151 }]]; // 50°, as in hall 2
  for (const k of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const t0 = 0.05 + k * 0.07;
    const p = { x: Math.round(6000 * t0), y: Math.round(7151 * t0) };
    const q = { x: Math.round(p.x + 3000 * Math.cos((50 * Math.PI) / 180)), y: Math.round(p.y + 3000 * Math.sin((50 * Math.PI) / 180)) };
    const c = clipToWalls(p, q, angled);
    assert(c.x === q.x && c.y === q.y, `a side drawn along a 50° wall from a corner rounded onto it is not cut short (start ${k})`);
  }
  assert(crossesWalls([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 6000 }, { x: 0, y: 6000 }], [[{ x: 0, y: 0 }, { x: 105, y: 6000 }]]), "a wall a whole degree off square, 10 cm into the stage, still crosses it");

  // A wall that ENDS on a side — a T, as where a garden wall meets the hall — touches the stage when
  // it comes from outside, and crosses it only when its body goes in.
  const tee: Point[][] = [...room, [{ x: -5000, y: 2000 }, { x: 0, y: 2000 }]];
  const byWest = [{ x: 0, y: 1000 }, { x: 4000, y: 1000 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }];
  assert(!crossesWalls(byWest, tee), "a stage whose side a wall ends on from outside does not cross it");
  assert(crossesWalls(byWest, [...room, [{ x: 2000, y: 1000 }, { x: 2000, y: 2000 }]]), "…one whose wall comes in from that side does");
  assert(crossesWalls(byWest, [...room, [{ x: 1500, y: 1500 }, { x: 2500, y: 2500 }]]), "…and so does one with a wall standing wholly inside it");
  assert(crossesWalls(byWest, [...room, [{ x: 0, y: 1000 }, { x: 4000, y: 3000 }]]), "…and one a wall runs corner to corner across");
  const pastTee = clipToWalls({ x: 0, y: 500 }, { x: 0, y: 5000 }, tee);
  assert(pastTee.y === 5000, `a side drawn along the hall past a wall meeting it from outside is not stopped there (${pastTee.y})`);
  const pastTeeIn = clipToWalls({ x: 0, y: 500 }, { x: 0, y: 5000 }, tee, -1);
  assert(pastTeeIn.y === 5000, `…nor when the stage is known to be on the room side (${pastTeeIn.y})`);
  const partition: Point[][] = [...room, [{ x: 0, y: 3000 }, { x: 4000, y: 3000 }]];
  const atPartition = clipToWalls({ x: 0, y: 500 }, { x: 0, y: 5000 }, partition, -1);
  assert(clipToWalls({ x: 0, y: 500 }, { x: 0, y: 5000 }, partition).y === 5000, "…which, before the drawing says where the stage is, is left to the closed outline");
  assert(atPartition.y === 3000, `a partition meeting the hall wall on the stage's side stops the side at it (${atPartition.y})`);

  // ONLY WHAT AN EDIT MADE WORSE: an outline already 21 cm into a wall (a resize pushed it there) is
  // not refused for typing its other sides — only for going deeper.
  const into = [{ x: -210, y: 1000 }, { x: 4000, y: 1000 }, { x: 4000, y: 3000 }, { x: -210, y: 3000 }];
  assert(crossesWalls(into, room), "a stage 21 cm into the wall crosses it");
  assert(!crossesWalls([{ x: -210, y: 1000 }, { x: 4000, y: 1000 }, { x: 4000, y: 3600 }, { x: -210, y: 3600 }], room, into), "…and may still have its other sides typed");
  assert(crossesWalls([{ x: -400, y: 1000 }, { x: 4000, y: 1000 }, { x: 4000, y: 3000 }, { x: -400, y: 3000 }], room, into), "…but not be pushed further in");
  assert(!crossesWalls([{ x: -100, y: 1000 }, { x: 4000, y: 1000 }, { x: 4000, y: 3000 }, { x: -100, y: 3000 }], room, into), "…and may be pulled back out a step at a time");
  assert(crossesWalls([{ x: 6000, y: 1000 }, { x: 12000, y: 1000 }, { x: 12000, y: 3000 }, { x: 6000, y: 3000 }], room, [{ x: 6000, y: 1000 }, { x: 9000, y: 1000 }, { x: 9000, y: 3000 }, { x: 6000, y: 3000 }]), "an edit that takes a stage through a wall it stood clear of is refused");

  // The wall a corner stands on (ST-7: a typed angle slides it along that wall).
  const onNorth = wallAt({ x: 4000, y: 3 }, room);
  assert(!!onNorth && onNorth[0].y === 0 && onNorth[1].y === 0, "a corner 3 mm off the north wall stands on it");
  assert(wallAt({ x: 4000, y: 300 }, room) === null, "…one 30 cm off stands on none");
  const inCorner = wallAt({ x: 2, y: 1 }, room, { x: 0, y: 1 });
  assert(!!inCorner && inCorner[0].x === 0 && inCorner[1].x === 0, "a corner in the room's corner takes the wall running the way asked (the west wall, down)");
  console.log("wall-clip self-check passed");
}
