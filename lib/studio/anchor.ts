// Where an anchored item actually sits, resolved against the venue's wall graph.
//
// A drape stores a wall id and two fractions along it (Placement.span), never coordinates: the wall
// belongs to the property and can be redrawn at /halls, and a curtain that stayed at its old
// millimetres while its wall moved would be hanging in mid-air. Everything here turns that stored
// span back into points at draw time, and turns a pointer back into a span while dragging.
//
// Pure geometry over `{nodes, walls}` — no React, no storage — so it runs under node like the rest
// of lib/studio.
import type { Point } from "@/lib/studio/hall";
import type { VenueStructure } from "@/lib/venues/structure";
import { nodeMap, wallPoints } from "@/lib/venues/structure";
import { pointAtDistance, projectOntoWall, wallLengthMm } from "./geometry";
import type { WallSpan } from "@/lib/design-document/types";
import { isMain } from "../self-check";

export interface WallSegment {
  a: Point;
  b: Point;
  lengthMm: number;
}

/** One wall's endpoints, or null if the id dangles — a wall deleted at the venue leaves every
 *  drape that hung on it pointing at nothing, and every caller has to survive that. */
export function wallSegment(structure: VenueStructure, wallId: string): WallSegment | null {
  const wall = structure.walls.find((w) => w.id === wallId);
  if (!wall) return null;
  const pts = wallPoints(structure, wall, nodeMap(structure));
  if (!pts) return null;
  return { a: pts.a, b: pts.b, lengthMm: wallLengthMm(pts.a, pts.b) };
}

export interface ResolvedSpan {
  from: Point;
  to: Point;
  lengthMm: number; // the run covered, not the wall's full length
  wall: WallSegment;
}

/** A stored span as two points on the plan. Fractions are clamped and ordered here rather than at
 *  every call site, so a span saved backwards (dragging one end past the other) still draws. */
export function resolveSpan(structure: VenueStructure, span: WallSpan): ResolvedSpan | null {
  const wall = wallSegment(structure, span.wallId);
  if (!wall) return null;
  const lo = clamp01(Math.min(span.from, span.to));
  const hi = clamp01(Math.max(span.from, span.to));
  return {
    from: pointAtDistance(wall.a, wall.b, lo * wall.lengthMm),
    to: pointAtDistance(wall.a, wall.b, hi * wall.lengthMm),
    lengthMm: (hi - lo) * wall.lengthMm,
    wall,
  };
}

/** Where along a wall a point falls, as a 0..1 fraction — dragging one end of a drape. */
export function pointToT(wall: WallSegment, p: Point): number {
  if (wall.lengthMm === 0) return 0;
  return clamp01(projectOntoWall(wall.a, wall.b, p) / wall.lengthMm);
}

export interface NearestWall {
  wallId: string;
  distanceMm: number; // how far the point was from the wall itself
  t: number; // where along it the point landed, 0..1
}

/** The wall closest to a dropped item. Only real walls are offered: an "edge" is a terrace lip or a
 *  property line — a boundary you can see, not something a drape can hang from. */
export function nearestWall(structure: VenueStructure, p: Point): NearestWall | null {
  const nodes = nodeMap(structure);
  let best: NearestWall | null = null;
  let bestDistSq = Infinity;
  for (const wall of structure.walls) {
    if (wall.kind === "edge") continue;
    const pts = wallPoints(structure, wall, nodes);
    if (!pts) continue;
    const len = wallLengthMm(pts.a, pts.b);
    if (len === 0) continue;
    const along = projectOntoWall(pts.a, pts.b, p);
    const foot = pointAtDistance(pts.a, pts.b, along);
    const distSq = (p.x - foot.x) ** 2 + (p.y - foot.y) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = { wallId: wall.id, distanceMm: Math.sqrt(distSq), t: along / len };
    }
  }
  return best;
}

/** The span a freshly dropped drape gets: the whole wall. Shortening it is a drag away. */
export const WHOLE_WALL = { from: 0, to: 1 } as const;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ponytail: self-check. Run: node --experimental-strip-types lib/studio/anchor.ts
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (a: number, b: number, tol = 0.001) => Math.abs(a - b) < tol;

  // A 10m wall along x, and a 6m wall along y meeting it at the origin.
  const structure: VenueStructure = {
    nodes: [
      { id: "n0", x: 0, y: 0 },
      { id: "n1", x: 10000, y: 0 },
      { id: "n2", x: 0, y: 6000 },
    ],
    walls: [
      { id: "w-long", a: "n0", b: "n1", kind: "wall" },
      { id: "w-side", a: "n0", b: "n2", kind: "wall" },
      { id: "w-lip", a: "n1", b: "n2", kind: "edge" },
    ],
    entrances: [],
    features: [],
  };

  const seg = wallSegment(structure, "w-long")!;
  assert(near(seg.lengthMm, 10000), "wall length");
  assert(wallSegment(structure, "gone") === null, "a deleted wall resolves to nothing");

  const whole = resolveSpan(structure, { wallId: "w-long", ...WHOLE_WALL })!;
  assert(near(whole.lengthMm, 10000) && near(whole.from.x, 0) && near(whole.to.x, 10000), "the whole wall");

  const part = resolveSpan(structure, { wallId: "w-long", from: 0.2, to: 0.5 })!;
  assert(near(part.lengthMm, 3000) && near(part.from.x, 2000) && near(part.to.x, 5000), "a 3m run starting 2m along");

  const backwards = resolveSpan(structure, { wallId: "w-long", from: 0.9, to: 0.4 })!;
  assert(near(backwards.lengthMm, 5000) && near(backwards.from.x, 4000), "a span dragged past itself still draws");

  const over = resolveSpan(structure, { wallId: "w-long", from: -1, to: 4 })!;
  assert(near(over.lengthMm, 10000), "out-of-range fractions clamp to the wall");

  assert(near(pointToT(seg, { x: 2500, y: 900 }), 0.25), "a point projects onto the wall it is beside");
  assert(pointToT(seg, { x: -5000, y: 0 }) === 0, "…and clamps at the ends");

  const dropped = nearestWall(structure, { x: 3000, y: 400 })!;
  assert(dropped.wallId === "w-long" && near(dropped.t, 0.3), "a drop near the long wall picks it");
  assert(nearestWall(structure, { x: 200, y: 4000 })!.wallId === "w-side", "…and a drop by the side wall picks that one");
  assert(nearestWall(structure, { x: 9000, y: 5500 })!.wallId !== "w-lip", "an edge is a boundary, not something to hang a drape on");
  assert(nearestWall({ nodes: [], walls: [], entrances: [], features: [] }, { x: 0, y: 0 }) === null, "no walls, no anchor");

  console.log("anchor self-check passed");
}
