// Stairs that run on across a seam.
//
// Two stages pushed flush and GROUPED (not merged) are still two stages, each with its own edge
// items — and where both carry a flight along the same line, the plan used to draw two flights with
// a riser-line between them where the stages meet. A crew reads that as two flights. They are one:
// the same treads, continued. So items of the SAME KIND on DIFFERENT stages that stand end to end
// along one line — collinear to within a couple of degrees, their ends within a few centimetres,
// the same depth, the same side of the line — are drawn as ONE run: one polygon, each tread one line
// across the lot, nothing between them.
//
// A DRAWING, and only that. The items stay what they are: the quote and the packing list count each
// stage's own, the grips address each one (app/(app)/studio/canvas-stage.tsx EdgeItemHandles), and a
// merge (lib/design-document/stage.ts tidyEdgeItems) is still what makes them one item. Shapes come
// in ROOM coordinates (stage.ts edgeItemInRoom), so items of two differently turned stages compare.
// Straight items only: a run round a curve is one stage's own, and a ramp carries an arrow.
//
// Pure, no DOM, self-checked: `npm run check:edge-runs`.
import type { Point, StageEdgeKind } from "./types";
import type { EdgeItemShape } from "./stage";
import { walkingLine, walkingPadMm, type ClimbArrow } from "../venues/climb";
import { isMain } from "../self-check";

/** One edge item as the room sees it. */
export interface EdgeRunMember {
  stageId: string;
  itemId: string;
  /** In room coordinates (lib/design-document/stage.ts edgeItemInRoom). */
  shape: EdgeItemShape;
}

/** Several items drawn as one run. */
export interface JoinedRun {
  kind: StageEdgeKind;
  inner: boolean;
  /** In room coordinates: the one rectangle the items make between them. */
  polygon: Point[];
  /** A flight's treads, each one line across the whole run. */
  treads: [Point, Point][];
  /** A flight's walking line, ONE for the run, up its middle — the dot at the foot on the floor,
   *  the arrowhead where it reaches the deck (stage.ts EdgeItemShape.climb). */
  arrow?: ClimbArrow;
  /** Down its middle, end to end. */
  midline: Point[];
  members: { stageId: string; itemId: string }[];
}

/** Two items join when their lines are within this of parallel… */
export const JOIN_ANGLE_DEG = 2;
/** …their lines this close, and their ends this close (or overlapping by no more than this). */
export const JOIN_GAP_MM = 30;
/** …and they are this close in depth. */
const JOIN_DEPTH_MM = 5;

const rad = (deg: number) => (deg * Math.PI) / 180;

interface Line {
  m: EdgeRunMember;
  /** The item's edge line: its start, the unit direction along it, its length. */
  p0: Point;
  u: Point;
  L: number;
  /** From the edge to the item's far side. */
  v: Point;
}

/** The runs two or more items make between them — every item that joins nothing is left out. */
export function joinEdgeRuns(items: readonly EdgeRunMember[]): JoinedRun[] {
  const lines: Line[] = items.flatMap((m) => {
    const s = m.shape;
    if (s.polygon.length !== 4 || s.kind === "ramp") return [];
    const [p0, p1, , p3] = s.polygon;
    const L = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (L < 1) return [];
    return [{ m, p0, u: { x: (p1.x - p0.x) / L, y: (p1.y - p0.y) / L }, L, v: { x: p3.x - p0.x, y: p3.y - p0.y } }];
  });
  const parent = lines.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const sinTol = Math.sin(rad(JOIN_ANGLE_DEG));
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const A = lines[i];
      const B = lines[j];
      if (A.m.stageId === B.m.stageId) continue;
      if (A.m.shape.kind !== B.m.shape.kind || A.m.shape.inner !== B.m.shape.inner) continue;
      if (Math.abs(A.m.shape.depthMm - B.m.shape.depthMm) > JOIN_DEPTH_MM) continue;
      // Parallel (either way round)…
      if (Math.abs(A.u.x * B.u.y - A.u.y * B.u.x) > sinTol) continue;
      // …standing out to the same side of the line…
      if (A.v.x * B.v.x + A.v.y * B.v.y <= 0) continue;
      // …on the same line…
      const off = Math.abs((B.p0.x - A.p0.x) * A.u.y - (B.p0.y - A.p0.y) * A.u.x);
      if (off > JOIN_GAP_MM) continue;
      // …and end to end along it.
      const along = (q: Point) => (q.x - A.p0.x) * A.u.x + (q.y - A.p0.y) * A.u.y;
      const e0 = along(B.p0);
      const e1 = along({ x: B.p0.x + B.u.x * B.L, y: B.p0.y + B.u.y * B.L });
      const gap = Math.max(0 - Math.max(e0, e1), Math.min(e0, e1) - A.L);
      if (gap > JOIN_GAP_MM || gap < -JOIN_GAP_MM) continue;
      parent[find(j)] = find(i);
    }
  const groups = new Map<number, Line[]>();
  lines.forEach((l, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), l]);
  });
  const out: JoinedRun[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ref = group[0];
    const along = (q: Point) => (q.x - ref.p0.x) * ref.u.x + (q.y - ref.p0.y) * ref.u.y;
    const ends = group.flatMap((l) => [along(l.p0), along({ x: l.p0.x + l.u.x * l.L, y: l.p0.y + l.u.y * l.L })]);
    const lo = Math.min(...ends);
    const hi = Math.max(...ends);
    const at = (s: number, k = 0): Point => ({ x: ref.p0.x + ref.u.x * s + ref.v.x * k, y: ref.p0.y + ref.u.y * s + ref.v.y * k });
    const depth = Math.hypot(ref.v.x, ref.v.y) || 1;
    // Each tread, by how far across the item it lies, drawn once across the whole run.
    const offsets = [...new Set(ref.m.shape.treads.map(([a]) => Math.round(((a.x - ref.p0.x) * ref.v.x + (a.y - ref.p0.y) * ref.v.y) / depth)))].sort((a, b) => a - b);
    // One walking line up the middle of the whole run: `v` points from the edge to the far side, so
    // an outer flight is climbed from the far side (the floor) to the edge, a recessed one from the
    // edge (the floor) to the far side (the deck).
    const pad = walkingPadMm(depth) / depth;
    const mid = (lo + hi) / 2;
    const [foot, top] = ref.m.shape.inner ? [at(mid, pad), at(mid, 1 - pad)] : [at(mid, 1 - pad), at(mid, pad)];
    out.push({
      kind: ref.m.shape.kind,
      inner: ref.m.shape.inner,
      polygon: [at(lo), at(hi), at(hi, 1), at(lo, 1)],
      treads: offsets.map((o) => [at(lo, o / depth), at(hi, o / depth)] as [Point, Point]),
      ...(ref.m.shape.kind === "stairs" ? { arrow: walkingLine(foot, top, hi - lo) } : {}),
      midline: [at(lo, 0.5), at(hi, 0.5)],
      members: group.map((l) => ({ stageId: l.m.stageId, itemId: l.m.itemId })),
    });
  }
  return out;
}

/** The items a set of runs draws — what each stage must then leave out of its own drawing. */
export function joinedItemIds(runs: readonly JoinedRun[]): Set<string> {
  return new Set(runs.flatMap((r) => r.members.map((m) => m.itemId)));
}

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  /** A straight flight along the line from `a`, `w` long in direction `deg`, `depth` deep to its
   *  left-hand side (the way the stage frame's items come out), with treads every 280mm. */
  const flight = (stageId: string, itemId: string, a: Point, w: number, deg: number, depth = 840, kind: StageEdgeKind = "stairs", inner = false): EdgeRunMember => {
    const t = rad(deg);
    const u = { x: Math.cos(t), y: Math.sin(t) };
    const n = { x: -u.y, y: u.x };
    const at = (x: number, y: number): Point => ({ x: a.x + u.x * x + n.x * y, y: a.y + u.y * x + n.y * y });
    const treads: [Point, Point][] = [];
    if (kind === "stairs") for (let k = 280; k < depth - 1; k += 280) treads.push([at(0, k), at(w, k)]);
    return {
      stageId,
      itemId,
      shape: {
        kind,
        inner,
        polygon: [at(0, 0), at(w, 0), at(w, depth), at(0, depth)],
        treads,
        base: at(w / 2, 0),
        foot: at(w / 2, depth),
        farLine: [at(0, depth), at(w, depth)],
        midline: [at(0, depth / 2), at(w, depth / 2)],
        angleDeg: deg,
        widthMm: w,
        depthMm: depth,
        risers: 4,
        riserMm: 150,
        riseMm: 600,
        heightMm: 0,
        seats: 0,
        chairs: [],
        sofaSeats: 0,
        sofaHeightMm: 0,
        cushions: [],
        backs: [],
      },
    };
  };
  const near = (p: Point, q: Point, tol = 1) => Math.hypot(p.x - q.x, p.y - q.y) <= tol;

  // Two stages side by side along y = 0, each with a flight along its front: one run.
  const left = flight("A", "a1", { x: 0, y: 0 }, 2440, 0);
  const right = flight("B", "b1", { x: 2440, y: 0 }, 2440, 0);
  const one = joinEdgeRuns([left, right]);
  assert(one.length === 1 && one[0].members.length === 2, "two flights end to end on two flush stages are one run");
  assert(near(one[0].polygon[0], { x: 0, y: 0 }) && near(one[0].polygon[1], { x: 4880, y: 0 }) && near(one[0].polygon[2], { x: 4880, y: 840 }), "…a rectangle from the first's start to the second's end, as deep as they are");
  assert(one[0].treads.length === 2 && one[0].treads.every(([a, b]) => near(a, { x: 0, y: a.y }) && near(b, { x: 4880, y: b.y })) && one[0].treads.map(([a]) => Math.round(a.y)).join() === "280,560", "…each tread one line across both, at the same depths");
  assert(joinedItemIds(one).has("a1") && joinedItemIds(one).has("b1"), "…and both items are the run's");
  assert(one[0].midline.length === 2 && near(one[0].midline[0], { x: 0, y: 420 }), "…its middle line end to end");
  assert(one[0].arrow !== undefined && near(one[0].arrow.from, { x: 2440, y: 840 - 100.8 }) && near(one[0].arrow.head[0], { x: 2440, y: 100.8 }), "…and ONE walking line up the middle of the run, from the floor to the edge");
  const sunkRun = joinEdgeRuns([flight("A", "s1", { x: 0, y: 0 }, 2440, 0, 840, "stairs", true), flight("B", "s2", { x: 2440, y: 0 }, 2440, 0, 840, "stairs", true)]);
  assert(sunkRun.length === 1 && sunkRun[0].arrow !== undefined && near(sunkRun[0].arrow.from, { x: 2440, y: 100.8 }) && near(sunkRun[0].arrow.head[0], { x: 2440, y: 840 - 100.8 }), "a recessed run is climbed from the edge in");
  // A gap, a lean, a different depth, the other side, the same stage: not joined.
  assert(joinEdgeRuns([left, flight("B", "b2", { x: 2440 + 100, y: 0 }, 2440, 0)]).length === 0, "ten centimetres apart they are two flights");
  assert(joinEdgeRuns([left, flight("B", "b3", { x: 2440, y: 0 }, 2440, 5)]).length === 0, "…and so are two 5° out of line");
  assert(joinEdgeRuns([left, flight("B", "b4", { x: 2440, y: 0 }, 2440, 0, 560)]).length === 0, "…and two of different depths");
  assert(joinEdgeRuns([left, flight("B", "b5", { x: 2440, y: 0 }, 2440, 0, 840, "bench")]).length === 0, "…and a flight and a banquette");
  assert(joinEdgeRuns([left, flight("A", "a2", { x: 2440, y: 0 }, 2440, 0)]).length === 0, "two items of ONE stage are its own affair (tidyEdgeItems joins them)");
  // The second stage turned the other way: its flight runs the opposite direction along the same
  // line, still out to the same side — one run. Standing out to the other side (facing each other
  // across the line) — not.
  const turned = flight("B", "b6", { x: 4880, y: 0 }, 2440, 180, 840);
  // (turned, its depth points to −y: put it on the far side of the line so its depth points the same way)
  const sameSide: EdgeRunMember = { ...turned, shape: { ...turned.shape, polygon: turned.shape.polygon.map((q) => ({ x: q.x, y: -q.y })), treads: turned.shape.treads.map(([a, b]) => [{ x: a.x, y: -a.y }, { x: b.x, y: -b.y }] as [Point, Point]) } };
  assert(joinEdgeRuns([left, sameSide]).length === 1, "a flight on a stage turned round, running the other way along the same line, joins");
  assert(joinEdgeRuns([left, turned]).length === 0, "…but not one standing out to the other side of it");
  // A millimetre or two off, as flush stages come to be: joined. Three in a row: one run of three.
  assert(joinEdgeRuns([left, flight("B", "b7", { x: 2442, y: 1 }, 2440, 0.5)]).length === 1, "flush to a millimetre or two is flush");
  const three = joinEdgeRuns([left, right, flight("C", "c1", { x: 4880, y: 0 }, 2440, 0)]);
  assert(three.length === 1 && three[0].members.length === 3 && near(three[0].polygon[1], { x: 7320, y: 0 }), "three in a row are one run of three");
  // Barriers join too — a thin strip, no treads; a ramp never.
  const rails = joinEdgeRuns([flight("A", "r1", { x: 0, y: 0 }, 2000, 0, 60, "barrier"), flight("B", "r2", { x: 2000, y: 0 }, 2000, 0, 60, "barrier")]);
  assert(rails.length === 1 && rails[0].treads.length === 0 && rails[0].kind === "barrier" && !rails[0].arrow, "two barriers end to end are one rail, with no walking line");
  assert(joinEdgeRuns([flight("A", "p1", { x: 0, y: 0 }, 1200, 0, 7200, "ramp"), flight("B", "p2", { x: 1200, y: 0 }, 1200, 0, 7200, "ramp")]).length === 0, "ramps are never joined");
  // Items standing through each other (a stage dragged over another) are not one run either.
  assert(joinEdgeRuns([left, flight("B", "b8", { x: 1000, y: 0 }, 2440, 0)]).length === 0, "two flights overlapping along the line are not a run");
  console.log("edge-runs self-check passed");
}
