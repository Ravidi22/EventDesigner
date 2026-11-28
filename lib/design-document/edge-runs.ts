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
  /** A banquette run's sofa sides — every member's own cushions and backrest lines, in room
   *  coordinates (QA BQ-7: they vanished where the run was drawn as one). */
  cushions: Point[][];
  backs: [Point, Point][];
  members: { stageId: string; itemId: string }[];
}

/** Two items join when their lines are within this of parallel… */
export const JOIN_ANGLE_DEG = 2;
/** …their lines this close, and their ends this close (or overlapping by no more than this). */
export const JOIN_GAP_MM = 30;
/** …and they are this close in depth. */
const JOIN_DEPTH_MM = 5;

export const rad = (deg: number) => (deg * Math.PI) / 180;

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
      cushions: group.flatMap((l) => l.m.shape.cushions),
      backs: group.flatMap((l) => l.m.shape.backs),
      members: group.map((l) => ({ stageId: l.m.stageId, itemId: l.m.itemId })),
    });
  }
  return out;
}

/** The items a set of runs draws, by stage — what each stage must then leave out of its own drawing.
 *  Keyed by STAGE as well as item: a copied stage keeps its items' ids, so a skip by item id alone
 *  drew the copy's banquette invisibly whenever the original's was in a run (QA EI-14). */
export function joinedItemsByStage(runs: readonly JoinedRun[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const r of runs)
    for (const m of r.members) {
      const set = out.get(m.stageId) ?? new Set<string>();
      set.add(m.itemId);
      out.set(m.stageId, set);
    }
  return out;
}
