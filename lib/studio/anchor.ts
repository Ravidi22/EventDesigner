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
import type { VenueStructure, Wall } from "@/lib/venues/structure";
import { isDoor, nodeMap, wallPoints } from "@/lib/venues/structure";
import { absoluteControlPoints, cubicPointAt, pointAtDistance, projectOntoWall, wallLengthMm } from "./geometry";
import type { WallSpan } from "@/lib/design-document/types";
import type { DoorOpening } from "@/lib/design-document/stage";
import { wallChain } from "@/lib/venues/wall-split";

export interface WallSegment {
  a: Point;
  b: Point;
  lengthMm: number;
}

/** One wall's endpoints, or null if the id dangles — a wall deleted at the venue leaves every
 *  drape that hung on it pointing at nothing, and every caller has to survive that. */
export function wallSegment(structure: VenueStructure, wallId: string): WallSegment | null {
  const wall = structure.walls.find((w) => w.id === wallId);
  if (!wall) {
    // A split wall's old id: the ends of the walls standing in its place.
    const tr = wallTrack(structure, wallId);
    return tr ? { a: tr.a, b: tr.b, lengthMm: wallLengthMm(tr.a, tr.b) } : null;
  }
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

/** One wall as a WallTrack, or null if the id dangles. An id that was SPLIT (or joined into another)
 *  is read through its lineage (lib/venues/wall-split.ts): one track along the walls standing in its
 *  place, in its own parameter — so whatever hangs on the old id hangs where it hung. */
export function wallTrack(structure: VenueStructure, wallId: string): WallTrack | null {
  const wall = structure.walls.find((w) => w.id === wallId);
  if (wall) return singleTrack(structure, wall);
  const chain = wallChain(structure, wallId);
  if (!chain) return null;
  const links: { track: WallTrack; from: number; to: number; u0: number; u1: number }[] = [];
  for (const l of chain) {
    const track = singleTrack(structure, l.wall);
    if (!track) return null;
    links.push({ track, from: l.from, to: l.to, u0: l.u0, u1: l.u1 });
  }
  return chainTrack(links);
}

/** Several walls' stretches read as ONE track in an old wall's parameter: link i carries `from`–`to`
 *  of it, as the stretch `u0`–`u1` of its own wall (reversed when u0 > u1, its normal turned with it
 *  so "left of the old wall" stays left). */
function chainTrack(links: { track: WallTrack; from: number; to: number; u0: number; u1: number }[]): WallTrack {
  const linkAt = (t: number) => links.find((l) => t <= l.to) ?? links[links.length - 1];
  const uOf = (l: (typeof links)[number], t: number) => l.u0 + ((t - l.from) / (l.to - l.from || 1)) * (l.u1 - l.u0);
  const tOf = (l: (typeof links)[number], u: number) => l.from + ((u - l.u0) / (l.u1 - l.u0 || 1)) * (l.to - l.from);
  const sign = (l: (typeof links)[number]) => (l.u1 >= l.u0 ? 1 : -1);
  const lens = links.map((l) => Math.abs(l.track.mmAt(l.u1) - l.track.mmAt(l.u0)));
  const before = lens.map((_, i) => lens.slice(0, i).reduce((s, x) => s + x, 0));
  const lengthMm = lens.reduce((s, x) => s + x, 0);
  const at = (t: number) => {
    const l = linkAt(clamp01(t));
    const { p, n } = l.track.at(uOf(l, clamp01(t)));
    return { p, n: { x: n.x * sign(l), y: n.y * sign(l) } };
  };
  const a = at(0).p;
  const b = at(1).p;
  const mmAt = (t: number) => {
    const i = links.indexOf(linkAt(clamp01(t)));
    const l = links[i];
    return before[i] + Math.abs(l.track.mmAt(uOf(l, clamp01(t))) - l.track.mmAt(l.u0));
  };
  const tAt = (mm: number) => {
    if (mm <= 0) return 0;
    if (mm >= lengthMm) return 1;
    const i = Math.max(0, before.findIndex((s, k) => mm <= s + lens[k]));
    const l = links[i];
    const start = l.track.mmAt(l.u0);
    const u = l.track.tAt(start + sign(l) * (mm - before[i]));
    return tOf(l, u);
  };
  const nearestT = (p: Point) => {
    let best = 0;
    let bd = Infinity;
    for (const l of links) {
      const lo = Math.min(l.u0, l.u1);
      const hi = Math.max(l.u0, l.u1);
      const u = Math.min(hi, Math.max(lo, l.track.nearestT(p)));
      const q = l.track.at(u).p;
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      if (d < bd) {
        bd = d;
        best = tOf(l, u);
      }
    }
    return clamp01(best);
  };
  const path = (t0: number, t1: number, off = 0): Point[] => {
    if (t1 < t0) return path(t1, t0, off).reverse();
    const out: Point[] = [];
    for (const l of links) {
      const s0 = Math.max(t0, l.from);
      const s1 = Math.min(t1, l.to);
      if (s1 < s0 || (s1 === s0 && out.length)) continue;
      for (const q of l.track.path(uOf(l, s0), uOf(l, s1), off * sign(l))) {
        const last = out[out.length - 1];
        if (!last || Math.hypot(last.x - q.x, last.y - q.y) > 0.01) out.push(q);
      }
    }
    return out;
  };
  return {
    a,
    b,
    curved: links.length > 1 || links[0].track.curved,
    chordMm: wallLengthMm(a, b),
    lengthMm,
    at,
    nearestT,
    mmAt,
    tAt,
    path,
  };
}

/** One standing wall as a WallTrack. */
function singleTrack(structure: VenueStructure, wall: Wall): WallTrack | null {
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

/** Every DOOR's opening in the room — its two jambs, on the wall's line (on a bowed wall, on the bow,
 *  at the door's own parameter as doorGeometry cuts it). Windows are not openings anyone walks
 *  through. What a stage reads to set a flight into itself at a door (lib/design-document/stage.ts
 *  baseAtDoor). */
export function doorOpenings(structure: VenueStructure): DoorOpening[] {
  const nodes = nodeMap(structure);
  const out: DoorOpening[] = [];
  for (const e of structure.entrances) {
    if (!isDoor(e)) continue;
    const wall = structure.walls.find((w) => w.id === e.wallId);
    const pts = wall ? wallPoints(structure, wall, nodes) : null;
    if (!wall || !pts) continue;
    const len = wallLengthMm(pts.a, pts.b) || 1;
    const curve = wall.curve;
    const at = curve
      ? (d: number) => {
          const { c1, c2 } = absoluteControlPoints(pts.a, pts.b, curve);
          return cubicPointAt(pts.a, c1, c2, pts.b, clamp01(d / len));
        }
      : (d: number) => pointAtDistance(pts.a, pts.b, d);
    out.push({ a: at(e.distanceMm - e.widthMm / 2), b: at(e.distanceMm + e.widthMm / 2) });
  }
  return out;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
