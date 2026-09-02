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
import { nodeMap, wallPoints, rigLengthMm } from "@/lib/venues/structure";
import { pointAtDistance, projectOntoWall, wallLengthMm } from "./geometry";
import type { WallSpan, RigHang } from "@/lib/design-document/types";
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

/** How near a rod a ceiling item has to be dropped before it hangs on it rather than floating.
 *  400mm — the same order as the room's other snaps, and about the radius of the chandelier that is
 *  usually being placed. */
export const RIG_SNAP_MM = 400;

/** One rod's endpoints, or null if the id dangles. Same contract, and same shape, as wallSegment. */
export function rigSegment(structure: VenueStructure, rigId: string): WallSegment | null {
  const rig = structure.rigs?.find((r) => r.id === rigId);
  if (!rig) return null;
  return { a: rig.a, b: rig.b, lengthMm: rigLengthMm(rig) };
}

/** Where a hung item actually is. A zero-length rod (a single eyebolt) resolves to its own point at
 *  any t rather than dividing by its length. */
export function resolveHang(structure: VenueStructure, hang: RigHang): Point | null {
  const seg = rigSegment(structure, hang.rigId);
  if (!seg) return null;
  if (seg.lengthMm === 0) return { ...seg.a };
  return pointAtDistance(seg.a, seg.b, clamp01(hang.t) * seg.lengthMm);
}

export interface NearestRig {
  rigId: string;
  distanceMm: number;
  t: number;
}

/** The rod closest to a dropped item, and where along it the drop landed. Null when the venue has
 *  no rods at all, which is most venues until somebody measures them. */
export function nearestRig(structure: VenueStructure, p: Point): NearestRig | null {
  let best: NearestRig | null = null;
  let bestDistSq = Infinity;
  for (const rig of structure.rigs ?? []) {
    const len = rigLengthMm(rig);
    // A hanging point has no direction to project onto: it is simply near or it is not.
    const foot = len === 0 ? rig.a : pointAtDistance(rig.a, rig.b, projectOntoWall(rig.a, rig.b, p));
    const distSq = (p.x - foot.x) ** 2 + (p.y - foot.y) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = {
        rigId: rig.id,
        distanceMm: Math.sqrt(distSq),
        t: len === 0 ? 0 : clamp01(projectOntoWall(rig.a, rig.b, p) / len),
      };
    }
  }
  return best;
}

/** The hang a ceiling item AT THIS POINT gets: the rod it is near enough to, or null for "nowhere
 *  near one". Dropping a chandelier and dragging one are the same question, so both ask it here —
 *  the rule used to be written out twice (studio-screen's dropProduct, canvas-stage's end-of-drag
 *  sweep) and two copies of a snap radius is one copy too many. */
export function hangNear(structure: VenueStructure, p: Point): RigHang | null {
  const near = nearestRig(structure, p);
  return near && near.distanceMm <= RIG_SNAP_MM ? { rigId: near.rigId, t: near.t } : null;
}

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

  // --- ceiling rods ---------------------------------------------------------
  {
    // An 8m rod running along x at y=3000, and a single eyebolt off to the side.
    const rigged: VenueStructure = {
      ...structure,
      rigs: [
        { id: "r-long", label: "מוט מרכזי", a: { x: 1000, y: 3000 }, b: { x: 9000, y: 3000 }, heightMm: 4200 },
        { id: "r-point", label: "נקודה", a: { x: 3000, y: 5000 }, b: { x: 3000, y: 5000 }, heightMm: 4000 },
      ],
    };

    assert(rigSegment(rigged, "gone") === null, "a deleted rod resolves to nothing");
    assert(near(rigSegment(rigged, "r-long")!.lengthMm, 8000), "rod length");

    const mid = resolveHang(rigged, { rigId: "r-long", t: 0.5 })!;
    assert(near(mid.x, 5000) && near(mid.y, 3000), "half way along the rod");

    const start = resolveHang(rigged, { rigId: "r-long", t: 0 })!;
    assert(near(start.x, 1000), "t=0 is the rod's own start");
    assert(near(resolveHang(rigged, { rigId: "r-long", t: 3 })!.x, 9000), "an out-of-range t clamps to the rod");
    assert(resolveHang(rigged, { rigId: "gone", t: 0.5 }) === null, "a dangling rigId resolves to nothing");

    // A zero-length rod must not divide by zero — it resolves to its own point, whatever t says.
    const pt = resolveHang(rigged, { rigId: "r-point", t: 0.7 })!;
    assert(near(pt.x, 3000) && near(pt.y, 5000), "a hanging point resolves to itself at any t");

    const dropped = nearestRig(rigged, { x: 5000, y: 3200 })!;
    assert(dropped.rigId === "r-long" && near(dropped.t, 0.5) && near(dropped.distanceMm, 200), "a drop near the rod picks it, with where along it");
    assert(nearestRig(rigged, { x: 3100, y: 5000 })!.rigId === "r-point", "…and a drop by the eyebolt picks that");
    assert(nearestRig(rigged, { x: 3000, y: 5000 })!.t === 0, "a hanging point is always at t=0");
    assert(nearestRig(structure, { x: 0, y: 0 }) === null, "a venue with no rods offers nothing to hang from");

    // The one rule a drop and a drag must agree on.
    assert(hangNear(rigged, { x: 5000, y: 3200 })!.rigId === "r-long", "an item within the snap radius hangs on the rod");
    assert(near(hangNear(rigged, { x: 5000, y: 3200 })!.t, 0.5), "…at the point along it that it landed");
    assert(hangNear(rigged, { x: 5000, y: 3000 + RIG_SNAP_MM + 1 }) === null, "one millimetre past the radius it hangs from nothing");
    assert(hangNear(structure, { x: 0, y: 0 }) === null, "a venue with no rods hangs nothing");
  }

  console.log("anchor self-check passed");
}
