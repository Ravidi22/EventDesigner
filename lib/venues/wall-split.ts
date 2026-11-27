// Splitting a wall in two, joining two walls back into one, merging two corners — and the LINEAGE
// that keeps every old wall id meaning what it meant (docs/superpowers/specs/2026-11-20-connected-
// drawings-design.md §5).
//
// A wall is hung on by id: every event's drapes and rails (`WallRail { wallId, from, to }`), a sail's
// tie (`{ kind: "wall", wallId, t }`), the venue's own curtains and LED strips. The sketches cannot
// be reached from /halls, and some belong to other studios — so a split never rewrites them. It
// writes `VenueStructure.wallLineage` instead: the old id, and the walls standing in its place with
// the share of the OLD wall's parameter each covers. `wallChain` resolves an id through it, and
// lib/studio/anchor.ts `wallTrack` turns the chain into one track — a drape on the old wall hangs
// where it hung, and bends with the wall when the new point is dragged out.
//
// `t` everywhere is the wall's own parameter: the chord fraction on a straight wall, the bezier's
// parameter on a bowed one — the same `t` a door's `distanceMm / chordMm` and a rail's `from`/`to`
// already are. This module computes its points from lib/studio/geometry.ts itself and never imports
// anchor.ts, which imports it.
import type { EdgeCurve, Point } from "@/lib/studio/hall";
import { absoluteControlPoints, cubicPointAt, splitCubic } from "@/lib/studio/geometry";
import { nodeMap, wallPoints, type StructureEntrance, type VenueStructure, type Wall } from "./structure";

/** How near either end a split is refused — a point at a corner is that corner. */
const END_MARGIN = 0.01;
/** How deep a lineage may nest before it is read as broken (a split of a split of a split…). */
const MAX_DEPTH = 16;

const sub = (p: Point, q: Point): Point => ({ x: p.x - q.x, y: p.y - q.y });
const lerp = (p: Point, q: Point, t: number): Point => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
const dist = (p: Point, q: Point) => Math.hypot(q.x - p.x, q.y - p.y);

/** One standing wall in a chain: the share `from`–`to` of the asked id's parameter it carries, and
 *  where that share lies on the standing wall by its own parameter (`u0`–`u1`; `u0 > u1` = reversed). */
export interface ChainLink {
  wall: Wall;
  from: number;
  to: number;
  u0: number;
  u1: number;
}

/** The walls standing where `id` stood, in order from its node a — `[{ wall, 0, 1, 0, 1 }]` for a wall
 *  that was never split. Null when the id names nothing, or when any piece of its chain is gone (the
 *  old wall is gone, as a deleted wall is). */
export function wallChain(s: VenueStructure, id: string, depth = 0): ChainLink[] | null {
  const wall = s.walls.find((w) => w.id === id);
  if (wall) return [{ wall, from: 0, to: 1, u0: 0, u1: 1 }];
  if (depth >= MAX_DEPTH) return null;
  const lineage = s.wallLineage?.find((l) => l.id === id);
  if (!lineage) return null;
  const out: ChainLink[] = [];
  for (const piece of lineage.chain) {
    const inner = wallChain(s, piece.wallId, depth + 1);
    if (!inner) return null;
    // The piece is the stretch u0–u1 of `piece.wallId`, carrying from–to of `id`. Each inner link
    // carries its own stretch of `piece.wallId`; the part of it inside u0–u1 is mapped across.
    const u0 = piece.u0 ?? 0;
    const u1 = piece.u1 ?? 1;
    const lo = Math.min(u0, u1);
    const hi = Math.max(u0, u1);
    const toOld = (x: number) => piece.from + ((x - u0) / (u1 - u0)) * (piece.to - piece.from);
    const parts: ChainLink[] = [];
    for (const q of inner) {
      const x0 = Math.max(lo, q.from);
      const x1 = Math.min(hi, q.to);
      if (x1 - x0 <= 1e-12) continue;
      const onWall = (x: number) => q.u0 + ((x - q.from) / (q.to - q.from)) * (q.u1 - q.u0);
      const [o0, o1] = [toOld(x0), toOld(x1)];
      parts.push(o0 <= o1
        ? { wall: q.wall, from: o0, to: o1, u0: onWall(x0), u1: onWall(x1) }
        : { wall: q.wall, from: o1, to: o0, u0: onWall(x1), u1: onWall(x0) });
    }
    if (!parts.length) return null;
    out.push(...parts.sort((m, n) => m.from - n.from));
  }
  return out.length ? out : null;
}

/** The openings standing along `wallId` — on the wall itself, or on the walls of its chain — each with
 *  its middle (`t`) and its stretch widened by `padMm` either side (`lo`–`hi`) in `wallId`'s OWN
 *  parameter. What a curtain on an old wall parts for, though its door now stands on a half. */
export function openingsAlong(s: VenueStructure, wallId: string, padMm = 0): { opening: StructureEntrance; t: number; lo: number; hi: number }[] {
  const chain = wallChain(s, wallId);
  if (!chain) return [];
  const nodes = nodeMap(s);
  const out: { opening: StructureEntrance; t: number; lo: number; hi: number }[] = [];
  for (const link of chain) {
    const pts = wallPoints(s, link.wall, nodes);
    if (!pts) continue;
    const chord = dist(pts.a, pts.b);
    if (chord === 0) continue;
    const lo = Math.min(link.u0, link.u1);
    const hi = Math.max(link.u0, link.u1);
    const toOld = (u: number) => link.from + ((u - link.u0) / (link.u1 - link.u0)) * (link.to - link.from);
    for (const e of s.entrances) {
      if (e.wallId !== link.wall.id) continue;
      const mid = e.distanceMm / chord;
      if (mid < lo || mid > hi) continue;
      const [a, b] = [toOld((e.distanceMm - e.widthMm / 2 - padMm) / chord), toOld((e.distanceMm + e.widthMm / 2 + padMm) / chord)];
      out.push({ opening: e, t: toOld(mid), lo: Math.min(a, b), hi: Math.max(a, b) });
    }
  }
  return out.sort((p, q) => p.t - q.t);
}

/** A wall's own typed height (Wall.heightMm), read through a split: the lowest typed among the walls
 *  standing in its place. Undefined when none is typed, or the id names nothing. */
export function typedHeightAlong(s: VenueStructure, wallId: string): number | undefined {
  const typed = (wallChain(s, wallId) ?? []).map((l) => l.wall.heightMm).filter((h): h is number => h !== undefined && h > 0);
  return typed.length ? Math.min(...typed) : undefined;
}

/** Where on wall `w` its own parameter `u` stands — the bezier's point on a bowed wall. */
function pointOnWall(s: VenueStructure, w: Wall, u: number): Point | null {
  const pts = wallPoints(s, w, nodeMap(s));
  if (!pts) return null;
  if (!w.curve) return lerp(pts.a, pts.b, u);
  const { c1, c2 } = absoluteControlPoints(pts.a, pts.b, w.curve);
  return cubicPointAt(pts.a, c1, c2, pts.b, u);
}

/** The walls meeting at `nodeId`. */
const wallsAt = (s: VenueStructure, nodeId: string) => s.walls.filter((w) => w.a === nodeId || w.b === nodeId);
const farEnd = (w: Wall, nodeId: string) => (w.a === nodeId ? w.b : w.a);

/** Exactly two walls of one kind meet at `nodeId`, and they lead to two different corners — so taking
 *  the point away leaves one wall. */
export function joinable(s: VenueStructure, nodeId: string): boolean {
  const at = wallsAt(s, nodeId);
  if (at.length !== 2 || at[0].kind !== at[1].kind) return false;
  const [p, q] = [farEnd(at[0], nodeId), farEnd(at[1], nodeId)];
  // A triangle's corner: the joined wall would lie on the third wall already there.
  return p !== q && !s.walls.some((w) => (w.a === p && w.b === q) || (w.a === q && w.b === p));
}

/** Why two walls meeting at `nodeId` cannot be joined, when they are two and of different kinds. Null
 *  otherwise — a corner of three walls is not refused, it is simply not a join (Delete keeps its old
 *  rule there). */
export function joinRefusal(s: VenueStructure, nodeId: string): string | null {
  const at = wallsAt(s, nodeId);
  return at.length === 2 && at[0].kind !== at[1].kind ? "קיר וגבול שטח לא מתחברים" : null;
}

/** The point at `nodeId` taken away: its two walls become one. When they are exactly one split's two
 *  halves, the ORIGINAL wall comes back under its own id (its bow too, when the halves still draw
 *  it) and the lineage entry goes. Otherwise a new wall, and each old id keeps naming its stretch of
 *  it through a lineage entry. Openings keep their places. `straightened`: the join could not keep
 *  what the two walls drew (a bow, or a bend at the corner). */
export function joinWalls(s: VenueStructure, nodeId: string): { structure: VenueStructure; wallId: string; straightened: boolean } | { error: string } {
  if (!joinable(s, nodeId)) return { error: joinRefusal(s, nodeId) ?? "אפשר לחבר רק נקודה ששני קירות נפגשים בה" };
  const nodes = nodeMap(s);
  const pair = wallsAt(s, nodeId);
  // The first wall runs INTO the corner when either does, so the join keeps its direction.
  const [w1, w2] = pair[0].b === nodeId ? pair : pair[1].b === nodeId ? [pair[1], pair[0]] : pair;
  const aId = farEnd(w1, nodeId);
  const bId = farEnd(w2, nodeId);
  const a = nodes.get(aId)!;
  const b = nodes.get(bId)!;
  const n = nodes.get(nodeId)!;
  const chord = dist(a, b);

  // One split's two halves, untouched in direction → the original id.
  const whole = s.wallLineage?.find(
    (l) => l.chain.length === 2 && l.chain[0].wallId === w1.id && l.chain[1].wallId === w2.id && w1.b === nodeId && w2.a === nodeId &&
      l.chain.every((p) => (p.u0 ?? 0) === 0 && (p.u1 ?? 1) === 1),
  );

  // What the joined wall draws: the old bow when the halves still draw it, else straight.
  let curve: EdgeCurve | undefined;
  let straightened = !!w1.curve || !!w2.curve || distToLine(n, a, b) > 1;
  if (whole?.curve) {
    const t = whole.chain[0].to;
    const { c1, c2 } = absoluteControlPoints(a, b, whole.curve);
    const { left, right } = splitCubic([a, c1, c2, b], t);
    const same = (c: EdgeCurve | null | undefined, want: EdgeCurve) => !!c && Math.hypot(c.c1.x - want.c1.x, c.c1.y - want.c1.y) <= 1 && Math.hypot(c.c2.x - want.c2.x, c.c2.y - want.c2.y) <= 1;
    const p = left[3];
    if (dist(p, n) <= 1 && same(w1.curve, { c1: sub(left[1], a), c2: sub(left[2], p) }) && same(w2.curve, { c1: sub(right[1], p), c2: sub(right[2], b) })) {
      curve = whole.curve;
      straightened = false;
    }
  }

  const id = whole ? whole.id : crypto.randomUUID();
  const sameHeight = w1.heightMm === w2.heightMm ? w1.heightMm : undefined;
  const joined: Wall = { id, a: aId, b: bId, kind: w1.kind, ...(sameHeight !== undefined ? { heightMm: sameHeight } : {}), ...(curve ? { curve } : {}) };

  // Openings: by the old parameter when the bow came back, else projected onto the straight chord.
  const tSplit = whole?.chain[0].to;
  const entrances = s.entrances.map((e) => {
    if (e.wallId !== w1.id && e.wallId !== w2.id) return e;
    const w = e.wallId === w1.id ? w1 : w2;
    const pts = wallPoints(s, w, nodes)!;
    const u = e.distanceMm / dist(pts.a, pts.b);
    if (curve && tSplit !== undefined) {
      const t = w === w1 ? u * tSplit : tSplit + u * (1 - tSplit);
      return { ...e, wallId: id, distanceMm: t * chord };
    }
    const m = pointOnWall(s, w, u)!;
    const along = ((m.x - a.x) * (b.x - a.x) + (m.y - a.y) * (b.y - a.y)) / chord;
    return { ...e, wallId: id, distanceMm: Math.max(0, Math.min(chord, along)) };
  });

  // Where the corner fell on the joined wall, for the old ids' shares — the split's own parameter when
  // its bow came back (exact by de Casteljau), else the corner projected onto the straight chord.
  const tm = curve && tSplit !== undefined ? tSplit : Math.max(0, Math.min(1, ((n.x - a.x) * (b.x - a.x) + (n.y - a.y) * (b.y - a.y)) / (chord * chord)));
  const share = (w: Wall, onFirst: boolean) => {
    // `w` runs from its own a to its own b; on the joined wall that is a stretch [0, tm] or [tm, 1],
    // in whichever direction w was drawn.
    const [near, far] = onFirst ? [0, tm] : [tm, 1];
    const forward = onFirst ? w.a === aId : w.a === nodeId;
    return { id: w.id, chain: [{ wallId: id, from: 0, to: 1, u0: forward ? near : far, u1: forward ? far : near }] };
  };
  // Both old ids keep naming their stretch of the joined wall — the halves' too after a join back:
  // a drape hung on a half since the split must not vanish when the halves become one again.
  const lineage = (s.wallLineage ?? []).filter((l) => l !== whole);
  lineage.push(share(w1, true), share(w2, false));

  const index = Math.min(s.walls.indexOf(w1), s.walls.indexOf(w2));
  const walls = s.walls.filter((w) => w !== w1 && w !== w2);
  walls.splice(index, 0, joined);
  return {
    wallId: id,
    straightened,
    structure: {
      ...s,
      nodes: s.nodes.filter((x) => x.id !== nodeId),
      walls,
      entrances,
      ...(lineage.length ? { wallLineage: lineage } : { wallLineage: undefined }),
    },
  };
}

function distToLine(p: Point, a: Point, b: Point): number {
  const len = dist(a, b);
  if (len === 0) return dist(p, a);
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
}

/** Corner `fromId` dropped on corner `intoId`: one corner with every wall of both. A wall that ran
 *  between them collapses and goes, with its openings (as a deleted wall does). A wall the merge lays
 *  on one already standing between the same corners is not kept twice: the standing one stays, the
 *  doubled one's openings move onto it at their places, and its id names it through a lineage entry
 *  (backwards when it was drawn the other way) — so nothing an event hung on it goes. Only the walls
 *  the merge REWIRED are compared; two walls that already shared their corners are left alone. */
export function mergeNodes(s: VenueStructure, fromId: string, intoId: string): VenueStructure {
  if (fromId === intoId) return s;
  const key = (p: string, q: string) => [p, q].sort().join("|");
  const rewired = (w: Wall) => w.a === fromId || w.b === fromId;
  const byPair = new Map<string, Wall>();
  for (const w of s.walls) if (!rewired(w) && !byPair.has(key(w.a, w.b))) byPair.set(key(w.a, w.b), w);
  const walls: Wall[] = [];
  const lineage = [...(s.wallLineage ?? [])];
  const doubled = new Map<string, Wall>(); // a doubled wall's id → the wall standing in its place
  const collapsed = new Set<string>();
  for (const w of s.walls) {
    if (!rewired(w)) {
      walls.push(w);
      continue;
    }
    const next = { ...w, a: w.a === fromId ? intoId : w.a, b: w.b === fromId ? intoId : w.b };
    if (next.a === next.b) {
      collapsed.add(w.id);
      continue;
    }
    const standing = byPair.get(key(next.a, next.b));
    if (standing) {
      const reversed = standing.a !== next.a;
      lineage.push({ id: w.id, chain: [{ wallId: standing.id, from: 0, to: 1, u0: reversed ? 1 : 0, u1: reversed ? 0 : 1 }] });
      doubled.set(w.id, standing);
      continue;
    }
    byPair.set(key(next.a, next.b), next);
    walls.push(next);
  }
  const nodes = s.nodes.filter((n) => n.id !== fromId);
  const after: VenueStructure = { ...s, nodes, walls };
  const afterNodes = nodeMap(after);
  const entrances = s.entrances.flatMap((e) => {
    if (collapsed.has(e.wallId)) return [];
    const to = doubled.get(e.wallId);
    if (!to) return [e];
    // The door's middle where it stood, projected onto the wall kept.
    const from = s.walls.find((w) => w.id === e.wallId)!;
    const fp = wallPoints(s, from, nodeMap(s));
    const tp = wallPoints(after, to, afterNodes);
    if (!fp || !tp) return [];
    const mid = pointOnWall(s, from, e.distanceMm / (dist(fp.a, fp.b) || 1))!;
    const len = dist(tp.a, tp.b) || 1;
    const along = ((mid.x - tp.a.x) * (tp.b.x - tp.a.x) + (mid.y - tp.a.y) * (tp.b.y - tp.a.y)) / len;
    return [{ ...e, wallId: to.id, distanceMm: Math.max(0, Math.min(len, along)) }];
  });
  return { ...after, entrances, ...(lineage.length ? { wallLineage: lineage } : {}) };
}

/** A wall, or an old wall whose chain still stands — what "is this wall still there" means now. */
export function hasWall(s: VenueStructure, id: string): boolean {
  return wallChain(s, id) !== null;
}

/** An opening's stretch of its wall, as fractions of the wall's parameter. */
function openingSpan(e: StructureEntrance, chordMm: number): { lo: number; hi: number; mid: number } {
  return { lo: (e.distanceMm - e.widthMm / 2) / chordMm, hi: (e.distanceMm + e.widthMm / 2) / chordMm, mid: e.distanceMm / chordMm };
}

/** Wall `wallId` split at its parameter `t` into two walls meeting at a new corner. The halves keep
 *  its kind and height; a bowed wall is cut by de Casteljau, so the halves draw exactly the curve
 *  that was there. Every opening goes to the half its middle stands on, at the same place. The old
 *  id lives on in `wallLineage`. A point inside an opening, or at a corner, is refused. */
export function splitWall(s: VenueStructure, wallId: string, t: number): { structure: VenueStructure; nodeId: string } | { error: string } {
  const index = s.walls.findIndex((w) => w.id === wallId);
  const wall = s.walls[index];
  const pts = wall ? wallPoints(s, wall, nodeMap(s)) : null;
  if (!wall || !pts) return { error: "הקיר לא נמצא" };
  if (!(t > END_MARGIN && t < 1 - END_MARGIN)) return { error: "הנקודה קרובה מדי לפינה" };
  const { a, b } = pts;
  const chord = dist(a, b);
  const openings = s.entrances.filter((e) => e.wallId === wallId);
  if (openings.some((e) => {
    const { lo, hi } = openingSpan(e, chord);
    return t > lo && t < hi;
  })) return { error: "הנקודה בתוך פתח הדלת" };

  let p: Point;
  let leftCurve: EdgeCurve | undefined;
  let rightCurve: EdgeCurve | undefined;
  if (wall.curve) {
    const { c1, c2 } = absoluteControlPoints(a, b, wall.curve);
    const { left, right } = splitCubic([a, c1, c2, b], t);
    p = left[3];
    leftCurve = { c1: sub(left[1], a), c2: sub(left[2], p) };
    rightCurve = { c1: sub(right[1], p), c2: sub(right[2], b) };
  } else {
    p = lerp(a, b, t);
  }

  const node = { id: crypto.randomUUID(), x: p.x, y: p.y };
  const half = (from: string, to: string, curve?: EdgeCurve): Wall => ({
    id: crypto.randomUUID(),
    a: from,
    b: to,
    kind: wall.kind,
    ...(wall.heightMm !== undefined ? { heightMm: wall.heightMm } : {}),
    ...(curve ? { curve } : {}),
  });
  const L = half(wall.a, node.id, leftCurve);
  const R = half(node.id, wall.b, rightCurve);
  const leftChord = dist(a, p);
  const rightChord = dist(p, b);

  const entrances = s.entrances.map((e) => {
    if (e.wallId !== wallId) return e;
    const { mid } = openingSpan(e, chord);
    return mid < t
      ? { ...e, wallId: L.id, distanceMm: (mid / t) * leftChord }
      : { ...e, wallId: R.id, distanceMm: ((mid - t) / (1 - t)) * rightChord };
  });

  return {
    nodeId: node.id,
    structure: {
      ...s,
      nodes: [...s.nodes, node],
      walls: [...s.walls.slice(0, index), L, R, ...s.walls.slice(index + 1)],
      entrances,
      wallLineage: [
        ...(s.wallLineage ?? []),
        { id: wallId, chain: [{ wallId: L.id, from: 0, to: t }, { wallId: R.id, from: t, to: 1 }], curve: wall.curve ?? null },
      ],
    },
  };
}
