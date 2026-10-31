// A STAGE STAYS IN ITS ROOM — the fill tool's area may not cross a wall.
//
// A side drawn through a wall is never meant: the stage stops at the wall (2026-10-31, the user:
// "limit the user to not get across a wall with the stage fill-out"). So the next corner of an area
// being drawn is clipped to the first wall its side would cross (clipToWalls — the side ends flush
// on the wall, which is where a stage against a wall belongs), and an outline edited by its grips or
// by a typed figure is refused when any side of it crosses one (crossesWalls — the grip holds where
// it was, the typed box is marked).
//
// Touching is not crossing: a side that STARTS on a wall (its corner snapped there) or ENDS on one
// (clipped there a moment ago, rounded to the millimetre) is allowed, so the test leaves a hair at
// both ends (WALL_CLIP_TOL_MM) and a side running along a wall — parallel — never crosses it.
//
// Pure, no DOM; self-checked: `npm run check:wall-clip`.
import type { Point } from "@/lib/studio/hall";
import type { VenueStructure } from "@/lib/venues/structure";
import { nodeMap, wallPoints } from "@/lib/venues/structure";
import { flattenEdge } from "./footprint";
import { isMain } from "../self-check";

/** A crossing within this of a side's end is the side touching the wall, not crossing it. */
export const WALL_CLIP_TOL_MM = 2;

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

/** The point along from→to before the first wall the side would cross — `to` itself when it crosses
 *  none. A side that starts on a wall is not stopped by that wall. */
export function clipToWalls(from: Point, to: Point, walls: readonly (readonly Point[])[]): Point {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (len <= WALL_CLIP_TOL_MM) return to;
  let best = Infinity;
  for (const w of walls) {
    for (let i = 0; i + 1 < w.length; i++) {
      const t = segmentCrossing(from, to, w[i], w[i + 1]);
      if (t !== null && t * len > WALL_CLIP_TOL_MM && t < best) best = t;
    }
  }
  if (best === Infinity) return to;
  return { x: Math.round(from.x + (to.x - from.x) * best), y: Math.round(from.y + (to.y - from.y) * best) };
}

/** Does any side of the closed outline cross a wall — not merely touch one at an end? */
export function crossesWalls(outline: readonly Point[], walls: readonly (readonly Point[])[]): boolean {
  const n = outline.length;
  for (let k = 0; k < n; k++) {
    const p = outline[k];
    const q = outline[(k + 1) % n];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len <= WALL_CLIP_TOL_MM * 2) continue;
    for (const w of walls) {
      for (let i = 0; i + 1 < w.length; i++) {
        const t = segmentCrossing(p, q, w[i], w[i + 1]);
        if (t !== null && t * len > WALL_CLIP_TOL_MM && (1 - t) * len > WALL_CLIP_TOL_MM) return true;
      }
    }
  }
  return false;
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
  console.log("wall-clip self-check passed");
}
