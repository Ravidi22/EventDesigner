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
import { absoluteControlPoints, cubicPointAt, pointAtDistance, projectOntoWall, wallLengthMm } from "./geometry";
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

/** A wall as something hung ALONG — a drape, the venue's curtain — straight or bowed.
 *
 *  A fraction `t` along a wall is the doors' own parameter (lib/studio/geometry.ts doorGeometry): the
 *  chord fraction on a straight wall, the bezier's own parameter on a bowed one. A drape's span and a
 *  door's opening are therefore read the same way, so a curtain that parts for a door on a curved
 *  wall parts exactly where the gap is drawn. Lengths are measured ALONG the wall — the bow's arc,
 *  which is what the cloth covers and what the quote bills — never across its chord. */
export interface WallTrack {
  a: Point;
  b: Point;
  curved: boolean;
  /** The straight distance a → b — what a door's `distanceMm` divides by to become a fraction. */
  chordMm: number;
  /** Along the wall itself: the arc on a bowed wall, the chord on a straight one. */
  lengthMm: number;
  /** The point at fraction t, and the wall's left-hand unit normal there ((−dy, dx) of a → b). */
  at(t: number): { p: Point; n: Point };
  /** The fraction of the point on the wall nearest `p`. */
  nearestT(p: Point): number;
  /** How far along the wall, from node a, fraction t is. */
  mmAt(t: number): number;
  /** The fraction a length along the wall from node a lands at. */
  tAt(mm: number): number;
  /** Points along the wall from t0 to t1, `offsetMm` off it along the normal (+ = the normal's
   *  side). Two points on a straight wall; enough on a bowed one to follow the bow. */
  path(t0: number, t1: number, offsetMm?: number): Point[];
}

/** Samples taken along a bowed wall — for its length and a nearest-point search. */
const TRACK_SAMPLES = 64;

/** One wall as a WallTrack, or null if the id dangles. */
export function wallTrack(structure: VenueStructure, wallId: string): WallTrack | null {
  const wall = structure.walls.find((w) => w.id === wallId);
  if (!wall) return null;
  const pts = wallPoints(structure, wall, nodeMap(structure));
  if (!pts) return null;
  const { a, b } = pts;
  const chordMm = wallLengthMm(a, b);
  const chordN = chordMm > 0 ? { x: -(b.y - a.y) / chordMm, y: (b.x - a.x) / chordMm } : { x: 0, y: 1 };
  if (!wall.curve) {
    const at = (t: number) => ({ p: pointAtDistance(a, b, clamp01(t) * chordMm), n: chordN });
    return {
      a,
      b,
      curved: false,
      chordMm,
      lengthMm: chordMm,
      at,
      nearestT: (p) => (chordMm === 0 ? 0 : clamp01(projectOntoWall(a, b, p) / chordMm)),
      mmAt: (t) => clamp01(t) * chordMm,
      tAt: (mm) => (chordMm === 0 ? 0 : clamp01(mm / chordMm)),
      path: (t0, t1, off = 0) =>
        [t0, t1].map((t) => {
          const q = at(t).p;
          return { x: q.x + chordN.x * off, y: q.y + chordN.y * off };
        }),
    };
  }
  const { c1, c2 } = absoluteControlPoints(a, b, wall.curve);
  const point = (t: number) => cubicPointAt(a, c1, c2, b, clamp01(t));
  const at = (t: number) => {
    const u = clamp01(t);
    const m = 1 - u;
    // The cubic's derivative: its tangent at u, turned a quarter to the left for the normal.
    const dx = 3 * m * m * (c1.x - a.x) + 6 * m * u * (c2.x - c1.x) + 3 * u * u * (b.x - c2.x);
    const dy = 3 * m * m * (c1.y - a.y) + 6 * m * u * (c2.y - c1.y) + 3 * u * u * (b.y - c2.y);
    const len = Math.hypot(dx, dy);
    return { p: point(u), n: len > 1e-9 ? { x: -dy / len, y: dx / len } : chordN };
  };
  // The arc's length at every sample, for lengths along the wall and back.
  const cum: number[] = [0];
  let prev = a;
  for (let i = 1; i <= TRACK_SAMPLES; i++) {
    const q = point(i / TRACK_SAMPLES);
    cum.push(cum[i - 1] + Math.hypot(q.x - prev.x, q.y - prev.y));
    prev = q;
  }
  const lengthMm = cum[TRACK_SAMPLES];
  const mmAt = (t: number) => {
    const f = clamp01(t) * TRACK_SAMPLES;
    const i = Math.min(TRACK_SAMPLES - 1, Math.floor(f));
    return cum[i] + (cum[i + 1] - cum[i]) * (f - i);
  };
  const tAt = (mm: number) => {
    if (mm <= 0) return 0;
    if (mm >= lengthMm) return 1;
    let i = 0;
    while (i < TRACK_SAMPLES - 1 && cum[i + 1] < mm) i++;
    const seg = cum[i + 1] - cum[i];
    return (i + (seg > 0 ? (mm - cum[i]) / seg : 0)) / TRACK_SAMPLES;
  };
  const nearestT = (p: Point) => {
    const best = (lo: number, hi: number) => {
      let bt = lo;
      let bd = Infinity;
      for (let i = 0; i <= TRACK_SAMPLES; i++) {
        const t = lo + ((hi - lo) * i) / TRACK_SAMPLES;
        const q = point(t);
        const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
        if (d < bd) {
          bd = d;
          bt = t;
        }
      }
      return bt;
    };
    const coarse = best(0, 1);
    return best(clamp01(coarse - 1 / TRACK_SAMPLES), clamp01(coarse + 1 / TRACK_SAMPLES));
  };
  const path = (t0: number, t1: number, off = 0) => {
    const steps = Math.max(4, Math.ceil(Math.abs(t1 - t0) * TRACK_SAMPLES));
    const out: Point[] = [];
    for (let i = 0; i <= steps; i++) {
      const { p, n } = at(t0 + ((t1 - t0) * i) / steps);
      out.push({ x: p.x + n.x * off, y: p.y + n.y * off });
    }
    return out;
  };
  return { a, b, curved: true, chordMm, lengthMm, at, nearestT, mmAt, tAt, path };
}

/** The band between two offsets off a wall, t0..t1, as one closed outline — a curtain's cloth on
 *  the plan. A band along a bowed wall is a curved strip, not a rectangle across the bow. */
export function spanBand(track: WallTrack, t0: number, t1: number, nearMm: number, farMm: number): Point[] {
  return [...track.path(t0, t1, nearMm), ...track.path(t0, t1, farMm).reverse()];
}

export interface ResolvedSpan {
  from: Point;
  to: Point;
  lengthMm: number; // the run covered, along the wall (the arc on a bowed one), not the wall's full length
  wall: WallSegment;
  /** The run as points along the wall itself — two on a straight wall, the bow followed on a
   *  curved one. Draw a drape along THIS, never the chord from `from` to `to`. */
  path: Point[];
  /** The span's own fractions, ordered and clamped, and the wall to read more off them. */
  t0: number;
  t1: number;
  track: WallTrack;
}

/** A stored span as points on the plan. Fractions are clamped and ordered here rather than at
 *  every call site, so a span saved backwards (dragging one end past the other) still draws. */
export function resolveSpan(structure: VenueStructure, span: WallSpan): ResolvedSpan | null {
  const wall = wallSegment(structure, span.wallId);
  const track = wall ? wallTrack(structure, span.wallId) : null;
  if (!wall || !track) return null;
  const lo = clamp01(Math.min(span.from, span.to));
  const hi = clamp01(Math.max(span.from, span.to));
  return {
    from: track.at(lo).p,
    to: track.at(hi).p,
    lengthMm: track.mmAt(hi) - track.mmAt(lo),
    wall,
    path: track.path(lo, hi),
    t0: lo,
    t1: hi,
    track,
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

  // A bowed wall: a span follows the bow, is measured along it, and a point beside the bow finds
  // the bow — not the chord it bows away from.
  const bowed: VenueStructure = {
    ...structure,
    walls: [...structure.walls, { id: "w-bow", a: "n0", b: "n1", kind: "wall", curve: { c1: { x: 2500, y: 3000 }, c2: { x: -2500, y: 3000 } } }],
  };
  const track = wallTrack(bowed, "w-bow")!;
  const apex = track.at(0.5);
  assert(track.curved && near(apex.p.x, 5000, 1) && apex.p.y > 2000, "the middle of a bowed wall is out on the bow");
  assert(near(apex.n.x, 0) && near(apex.n.y, 1), "…and its normal there is the chord's (the bow is symmetric)");
  assert(track.lengthMm > track.chordMm + 500, `a bowed wall is longer along than across (${Math.round(track.lengthMm)} vs ${track.chordMm})`);
  assert(near(track.nearestT({ x: 5000, y: apex.p.y + 300 }), 0.5, 0.02), "a point beside the bow finds the bow");
  assert(near(track.tAt(track.mmAt(0.3)), 0.3, 0.01), "lengths along the wall and fractions go both ways");
  const bowSpan = resolveSpan(bowed, { wallId: "w-bow", from: 0, to: 1 })!;
  assert(bowSpan.path.length > 8 && near(bowSpan.lengthMm, track.lengthMm), "a span on a bowed wall follows it, and measures along it");
  const strip = spanBand(track, 0.25, 0.75, 0, 220);
  assert(strip.length === track.path(0.25, 0.75).length * 2, "a band along a bow is a curved strip");
  const straightTrack = wallTrack(structure, "w-long")!;
  assert(!straightTrack.curved && straightTrack.path(0, 1).length === 2 && near(straightTrack.nearestT({ x: 2500, y: 900 }), 0.25), "a straight wall is its chord, as before");

  console.log("anchor self-check passed");
}
