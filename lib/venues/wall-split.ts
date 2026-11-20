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
import { isMain } from "../self-check";

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

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (p: Point, q: Point, tol = 0.5) => Math.hypot(p.x - q.x, p.y - q.y) <= tol;
  const BOW: EdgeCurve = { c1: { x: 3000, y: -2000 }, c2: { x: -3000, y: -2000 } };
  const s: VenueStructure = {
    nodes: [
      { id: "A", x: 0, y: 0 },
      { id: "B", x: 10000, y: 0 },
      { id: "C", x: 0, y: 5000 },
      { id: "D", x: 10000, y: 5000 },
    ],
    walls: [
      { id: "w", a: "A", b: "B", kind: "wall", heightMm: 2800 },
      { id: "wb", a: "C", b: "D", kind: "wall", curve: BOW },
    ],
    entrances: [{ id: "d", wallId: "w", distanceMm: 2000, widthMm: 1000, swingInward: true, doubleDoor: false }],
    features: [],
  };
  const ok = (r: ReturnType<typeof splitWall>) => {
    if ("error" in r) throw new Error("FAIL: unexpected refusal — " + r.error);
    return r;
  };

  // A straight wall split at 0.6.
  const r = ok(splitWall(s, "w", 0.6));
  const node = r.structure.nodes.find((n) => n.id === r.nodeId)!;
  assert(near(node, { x: 6000, y: 0 }), "the new corner stands on the wall at t");
  const chain = wallChain(r.structure, "w")!;
  assert(chain.length === 2, "the old id resolves to two pieces");
  const [left, right] = chain;
  assert(left.from === 0 && left.to === 0.6 && right.from === 0.6 && right.to === 1, "covering 0–0.6 and 0.6–1");
  assert(left.wall.heightMm === 2800 && right.wall.heightMm === 2800 && right.wall.kind === "wall", "both halves inherit height and kind");
  assert(r.structure.walls.length === 3 && !r.structure.walls.some((w) => w.id === "w"), "the old wall is gone from walls");
  const door = r.structure.entrances[0];
  assert(door.wallId === left.wall.id && Math.abs(door.distanceMm - 2000) < 1, "the door goes to the half its middle stands on, same world position");
  assert(hasWall(s, "w") && hasWall(r.structure, "w") && hasWall(r.structure, left.wall.id), "the old id is still a wall to everyone who asks");

  // Refusals.
  const inDoor = splitWall(s, "w", 0.2);
  assert("error" in inDoor && inDoor.error === "הנקודה בתוך פתח הדלת", "a point inside an opening is refused");
  assert("error" in splitWall(s, "w", 0.005) && "error" in splitWall(s, "w", 0.995), "a point at a corner is refused");
  assert("error" in splitWall(s, "nope", 0.5), "an unknown wall is refused");

  // A bowed wall: the two halves draw the curve that was there.
  const rb = ok(splitWall(s, "wb", 0.4));
  const [bl, br] = wallChain(rb.structure, "wb")!;
  const nodes = nodeMap(rb.structure);
  const cub = (w: Wall) => {
    const { a, b } = wallPoints(rb.structure, w, nodes)!;
    const { c1, c2 } = absoluteControlPoints(a, b, w.curve!);
    return (u: number) => cubicPointAt(a, c1, c2, b, u);
  };
  const before = (u: number) => cubicPointAt({ x: 0, y: 5000 }, { x: 3000, y: 3000 }, { x: 7000, y: 3000 }, { x: 10000, y: 5000 }, u);
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    const after = u <= 0.4 ? cub(bl.wall)(u / 0.4) : cub(br.wall)((u - 0.4) / 0.6);
    assert(near(after, before(u)), `the halves draw the old bow (u ${u})`);
  }

  // Nested: the right half split again at its middle.
  const r2 = ok(splitWall(r.structure, right.wall.id, 0.5));
  const nested = wallChain(r2.structure, "w")!;
  assert(
    nested.length === 3 && nested[1].from === 0.6 && Math.abs(nested[1].to - 0.8) < 1e-9 && Math.abs(nested[2].from - 0.8) < 1e-9 && nested[2].to === 1,
    "a split half splits again: 0–0.6, 0.6–0.8, 0.8–1",
  );

  // Dangling: one piece gone → the old id is gone, as a deleted wall is today.
  const gone: VenueStructure = { ...r.structure, walls: r.structure.walls.filter((w) => w.id !== left.wall.id) };
  assert(wallChain(gone, "w") === null && !hasWall(gone, "w"), "a chain with a piece gone resolves to nothing");

  // A split wall's typed height: the lowest typed among the walls in its place (a curtain is never
  // taller than the wall it hangs on).
  assert(typedHeightAlong(r.structure, "w") === 2800, "a split wall keeps its typed height");
  const lowered: VenueStructure = { ...r.structure, walls: r.structure.walls.map((w) => (w.id === right.wall.id ? { ...w, heightMm: 2000 } : w)) };
  assert(typedHeightAlong(lowered, "w") === 2000, "…the lower half wins");
  assert(typedHeightAlong(s, "wb") === undefined && typedHeightAlong(s, "gone") === undefined, "no typed height, or no wall: undefined");

  // ── Joining back ─────────────────────────────────────────────────────────────────────────────
  const j = joinWalls(r.structure, r.nodeId);
  if ("error" in j) throw new Error("FAIL: " + j.error);
  assert(j.wallId === "w" && j.structure.walls.some((w) => w.id === "w" && w.a === "A" && w.b === "B" && w.heightMm === 2800), "joining a lineage's whole chain gives the ORIGINAL wall back");
  assert(!j.structure.wallLineage?.some((l) => l.id === "w") && !j.straightened, "and drops the lineage entry, nothing straightened");
  assert(j.structure.entrances[0].wallId === "w" && Math.abs(j.structure.entrances[0].distanceMm - 2000) < 1, "the door is back on the original, same place");
  assert(!j.structure.nodes.some((n) => n.id === r.nodeId) && j.structure.walls.length === 2, "the corner and the halves are gone");

  const jb = joinWalls(rb.structure, rb.nodeId);
  if ("error" in jb) throw new Error("FAIL: " + jb.error);
  const wbBack = jb.structure.walls.find((w) => w.id === "wb")!;
  assert(!jb.straightened && !!wbBack.curve && near(wbBack.curve.c1, BOW.c1, 1) && near(wbBack.curve.c2, BOW.c2, 1), "a bowed wall joins back with its bow");
  const moved: VenueStructure = { ...rb.structure, nodes: rb.structure.nodes.map((n) => (n.id === rb.nodeId ? { ...n, y: n.y - 500 } : n)) };
  const jm = joinWalls(moved, rb.nodeId);
  if ("error" in jm) throw new Error("FAIL: " + jm.error);
  assert(jm.straightened && !jm.structure.walls.find((w) => w.id === "wb")!.curve, "moved off its bow, it joins as a straight wall and says so");

  // Two walls that were never one: a NEW wall, and each old id names its share of it.
  const pq: VenueStructure = {
    nodes: [{ id: "A", x: 0, y: 0 }, { id: "M", x: 4000, y: 0 }, { id: "B", x: 10000, y: 0 }],
    walls: [{ id: "p", a: "A", b: "M", kind: "wall" }, { id: "q", a: "B", b: "M", kind: "wall" }],
    entrances: [{ id: "d2", wallId: "q", distanceMm: 1000, widthMm: 800, swingInward: false, doubleDoor: false }],
    features: [],
  };
  const jpq = joinWalls(pq, "M");
  if ("error" in jpq) throw new Error("FAIL: " + jpq.error);
  assert(jpq.wallId !== "p" && jpq.wallId !== "q" && jpq.structure.walls.length === 1, "an unrelated pair joins into a new wall");
  const [pp] = wallChain(jpq.structure, "p")!;
  const [qq] = wallChain(jpq.structure, "q")!;
  assert(pp.wall.id === jpq.wallId && pp.from === 0 && pp.to === 1 && Math.abs(pp.u0 - 0) < 1e-9 && Math.abs(pp.u1 - 0.4) < 1e-9, "p is the first 0.4 of the new wall");
  assert(Math.abs(qq.u0 - 1) < 1e-9 && Math.abs(qq.u1 - 0.4) < 1e-9, "q (drawn B→M) is the new wall from its end back to 0.4");
  assert(Math.abs(jpq.structure.entrances[0].distanceMm - 9000) < 1, "q's door keeps its place on the joined wall");

  // Refusals: two kinds, three walls, a loop of two.
  const mixed: VenueStructure = { ...pq, walls: [pq.walls[0], { ...pq.walls[1], kind: "edge" }] };
  assert(joinRefusal(mixed, "M") === "קיר וגבול שטח לא מתחברים" && !joinable(mixed, "M") && "error" in joinWalls(mixed, "M"), "a wall and an edge do not join");
  assert(joinRefusal(pq, "M") === null && joinable(pq, "M"), "two walls of one kind join");
  const three: VenueStructure = { ...pq, nodes: [...pq.nodes, { id: "T", x: 4000, y: 3000 }], walls: [...pq.walls, { id: "t", a: "M", b: "T", kind: "wall" }] };
  assert(!joinable(three, "M") && joinRefusal(three, "M") === null, "three walls at a corner do not join (and are not refused — Delete keeps today's rule)");

  // Nested: split w, split its right half, join the inner corner → the right half comes back.
  const jn = joinWalls(r2.structure, r2.nodeId);
  if ("error" in jn) throw new Error("FAIL: " + jn.error);
  assert(jn.wallId === right.wall.id && wallChain(jn.structure, "w")!.length === 2, "joining a half's own split gives the half back; the original still resolves");

  // ── Merging two corners ──────────────────────────────────────────────────────────────────────
  const xy: VenueStructure = {
    nodes: [{ id: "X", x: 0, y: 0 }, { id: "Y", x: 5000, y: 0 }, { id: "Z", x: 5000, y: 5000 }],
    walls: [{ id: "x1", a: "X", b: "Z", kind: "wall" }, { id: "x2", a: "X", b: "Y", kind: "wall" }, { id: "x3", a: "Y", b: "Z", kind: "wall" }],
    entrances: [],
    features: [],
  };
  const m = mergeNodes(xy, "X", "Y");
  assert(!m.nodes.some((n) => n.id === "X"), "the dragged corner is gone");
  assert(!m.walls.some((w) => w.id === "x2"), "the wall between the two corners collapses and goes");
  assert(m.walls.length === 1 && (m.walls[0].a === "Y" || m.walls[0].b === "Y"), "a wall doubled by the merge is kept once, on the kept corner");
  assert(m.walls[0].id === "x3" && wallChain(m, "x1")?.[0].wall.id === "x3", "…the wall that stood there stays, and the doubled one's id names it");

  // ── Review fixes (2026-11-20) ────────────────────────────────────────────────────────────────
  // A drape hung on a HALF after the split keeps hanging when the halves are joined back.
  const leftShare = wallChain(j.structure, left.wall.id);
  const rightShare = wallChain(j.structure, right.wall.id);
  assert(
    !!leftShare && leftShare.length === 1 && leftShare[0].wall.id === "w" && leftShare[0].u0 === 0 && Math.abs(leftShare[0].u1 - 0.6) < 1e-9,
    "after a join back, the left half's id names 0–0.6 of the restored wall",
  );
  assert(!!rightShare && Math.abs(rightShare[0].u0 - 0.6) < 1e-9 && rightShare[0].u1 === 1, "…and the right half's 0.6–1");
  const [innerL, innerR] = wallChain(r2.structure, right.wall.id)!;
  const innerBack = wallChain(jn.structure, innerL.wall.id);
  assert(!!innerBack && innerBack[0].wall.id === right.wall.id && innerBack[0].u1 === 0.5 && !!wallChain(jn.structure, innerR.wall.id), "a nested join back keeps the inner halves' ids too");

  // Taking a triangle's corner away would lay a second wall on the one already there: not a join.
  const tri: VenueStructure = {
    nodes: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 4000, y: 0 }, { id: "M", x: 2000, y: 2000 }],
    walls: [{ id: "ab", a: "A", b: "B", kind: "wall" }, { id: "am", a: "A", b: "M", kind: "wall" }, { id: "mb", a: "M", b: "B", kind: "wall" }],
    entrances: [],
    features: [],
  };
  assert(!joinable(tri, "M") && "error" in joinWalls(tri, "M"), "a triangle's corner does not join onto its own third wall");

  // A merge doubles a wall only among the walls it rewired: the one already standing stays, the
  // doubled one's openings move onto it and its id names it (direction honoured).
  const fold: VenueStructure = {
    nodes: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 10000, y: 0 }, { id: "N", x: 5000, y: 0 }],
    walls: [{ id: "ab", a: "A", b: "B", kind: "wall" }, { id: "nb", a: "N", b: "B", kind: "wall" }],
    entrances: [],
    features: [],
  };
  const foldCut = ok(splitWall(fold, "ab", 0.5));
  const folded = mergeNodes(foldCut.structure, foldCut.nodeId, "N");
  assert(folded.walls.some((w) => w.id === "nb") && hasWall(folded, "ab") && wallChain(folded, "ab")![1].wall.id === "nb", "a wall folded onto another keeps both ids alive");
  const dup: VenueStructure = {
    nodes: [{ id: "A", x: 0, y: 0 }, { id: "B", x: 5000, y: 0 }, { id: "B2", x: 5000, y: 10 }],
    walls: [{ id: "ab", a: "A", b: "B", kind: "wall" }, { id: "b2a", a: "B2", b: "A", kind: "wall" }],
    entrances: [{ id: "d9", wallId: "b2a", distanceMm: 1000, widthMm: 800, swingInward: true, doubleDoor: false }],
    features: [],
  };
  const merged = mergeNodes(dup, "B2", "B");
  const movedDoor = merged.entrances.find((e) => e.id === "d9");
  assert(merged.walls.length === 1 && merged.walls[0].id === "ab" && !!movedDoor && movedDoor.wallId === "ab" && Math.abs(movedDoor.distanceMm - 4000) < 2, "the doubled wall's door moves onto the wall kept, at its place");
  const rev = wallChain(merged, "b2a");
  assert(!!rev && rev[0].wall.id === "ab" && rev[0].u0 === 1 && rev[0].u1 === 0, "a doubled wall drawn the other way names the kept one backwards");
  const pair: VenueStructure = {
    nodes: [...dup.nodes, { id: "X", x: 9000, y: 9000 }, { id: "Y", x: 9500, y: 9000 }],
    walls: [{ id: "p1", a: "A", b: "B", kind: "wall" }, { id: "p2", a: "A", b: "B", kind: "wall", curve: { c1: { x: 0, y: 900 }, c2: { x: 0, y: 900 } } }, { id: "xy", a: "X", b: "Y", kind: "wall" }],
    entrances: [],
    features: [],
  };
  const elsewhere = mergeNodes(pair, "X", "Y");
  assert(elsewhere.walls.some((w) => w.id === "p1") && elsewhere.walls.some((w) => w.id === "p2"), "a merge elsewhere never touches two walls that already shared their corners");

  // Review focus 5 on a BOWED wall: the opening is measured on the chord, and a point inside it is refused.
  const bowDoor: VenueStructure = { ...s, entrances: [{ id: "bd", wallId: "wb", distanceMm: 4000, widthMm: 1000, swingInward: true, doubleDoor: false }] };
  const bowRefused = splitWall(bowDoor, "wb", 0.4);
  assert("error" in bowRefused && bowRefused.error === "הנקודה בתוך פתח הדלת", "a point inside a door on a bowed wall is refused");

  console.log("wall-split: ok");
}
