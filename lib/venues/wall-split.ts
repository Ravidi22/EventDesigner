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

/** The walls standing where `id` stood, in order from its node a, each with the share of `id`'s
 *  parameter it covers — `[{ wall, 0, 1 }]` for a wall that was never split. Null when the id names
 *  nothing, or when any piece of its chain is gone (the old wall is gone, as a deleted wall is). */
export function wallChain(s: VenueStructure, id: string, depth = 0): { wall: Wall; from: number; to: number }[] | null {
  const wall = s.walls.find((w) => w.id === id);
  if (wall) return [{ wall, from: 0, to: 1 }];
  if (depth >= MAX_DEPTH) return null;
  const lineage = s.wallLineage?.find((l) => l.id === id);
  if (!lineage) return null;
  const out: { wall: Wall; from: number; to: number }[] = [];
  for (const piece of lineage.chain) {
    const inner = wallChain(s, piece.wallId, depth + 1);
    if (!inner) return null;
    const span = piece.to - piece.from;
    for (const q of inner) out.push({ wall: q.wall, from: piece.from + q.from * span, to: piece.from + q.to * span });
  }
  return out.length ? out : null;
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

  console.log("wall-split: ok");
}
