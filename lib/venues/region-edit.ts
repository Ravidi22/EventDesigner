// Editing the outline of a freehand zone — the `region` source in ./zone.ts.
//
// A face zone has nothing to edit here: its outline IS the walls around it, and reshaping it is
// dragging those walls. A region zone was drawn over open ground with no walls to derive from, so
// its outline is stored, and until now it was fixed the moment the last point went down — a lawn
// traced one corner short had to be deleted and drawn again. These are the edits a traced outline
// needs: move a corner, add one mid-edge, take one away, and tidy a hand-drawn shape.
//
// Pure, like the rest of lib/venues: the screen owns the gesture and the undo history.
import type { Point } from "@/lib/studio/hall";
import { isMain } from "../self-check";

/** A region needs three corners to enclose anything. */
export const MIN_REGION_POINTS = 3;

export function moveRegionPoint(boundary: Point[], index: number, to: Point): Point[] {
  return boundary.map((p, i) => (i === index ? { x: Math.round(to.x), y: Math.round(to.y) } : p));
}

/** A new corner in the middle of edge `index` (from point `index` to the next), returned with its
 *  own index so the drag that created it can carry on moving it. */
export function insertRegionPoint(boundary: Point[], index: number): { boundary: Point[]; index: number } {
  const a = boundary[index];
  const b = boundary[(index + 1) % boundary.length];
  const mid = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
  const next = [...boundary.slice(0, index + 1), mid, ...boundary.slice(index + 1)];
  return { boundary: next, index: index + 1 };
}

/** Takes a corner away — unless that would leave fewer than three, which is not a region. */
export function removeRegionPoint(boundary: Point[], index: number): Point[] {
  if (boundary.length <= MIN_REGION_POINTS) return boundary;
  return boundary.filter((_, i) => i !== index);
}

/**
 * Tidies a hand-traced outline, the way a draughtsman would redraw it clean:
 *
 * 1. An edge within `toleranceDeg` of horizontal or vertical is made exactly so, by moving both of
 *    its ends to their shared average. A corner between a straightened horizontal and vertical
 *    edge takes one coordinate from each, so the corner becomes square without either edge moving
 *    further than it had to. Diagonals are left alone — the chamfered corner of a building is a
 *    diagonal on purpose.
 * 2. A corner that no longer turns (it lies on a straight line between its neighbours) or that sits
 *    on top of the one before it is dropped: a trace made of many clicks along one wall becomes the
 *    one straight edge it was.
 */
export function tidyRegion(boundary: Point[], toleranceDeg = 8): Point[] {
  // Straightening and dropping feed each other: dropping a stray point joins two near-level edges
  // into one that still needs levelling. A few rounds settle any real trace.
  let pts = boundary;
  for (let round = 0; round < 6; round++) {
    const next = tidyOnce(pts, toleranceDeg);
    if (JSON.stringify(next) === JSON.stringify(pts)) break;
    pts = next;
  }
  return pts;
}

function tidyOnce(boundary: Point[], toleranceDeg: number): Point[] {
  const n = boundary.length;
  if (n < MIN_REGION_POINTS) return boundary;
  const tol = (toleranceDeg * Math.PI) / 180;
  const xs = boundary.map((p) => [p.x]);
  const ys = boundary.map((p) => [p.y]);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = boundary[i];
    const b = boundary[j];
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const offHorizontal = Math.abs(Math.sin(angle));
    const offVertical = Math.abs(Math.cos(angle));
    if (offHorizontal < Math.sin(tol)) {
      const y = (a.y + b.y) / 2;
      ys[i].push(y);
      ys[j].push(y);
    } else if (offVertical < Math.sin(tol)) {
      const x = (a.x + b.x) / 2;
      xs[i].push(x);
      xs[j].push(x);
    }
  }
  // A point's own coordinate counts only when no straightened edge claimed it.
  const pick = (vals: number[]) => Math.round(vals.length > 1 ? vals.slice(1).reduce((s, v) => s + v, 0) / (vals.length - 1) : vals[0]);
  let pts = boundary.map((_, i) => ({ x: pick(xs[i]), y: pick(ys[i]) }));

  // Drop coincident and straight-through corners until none are left (dropping one can make its
  // neighbour straight-through in turn).
  for (let changed = true; changed && pts.length > MIN_REGION_POINTS; ) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length > MIN_REGION_POINTS; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const p = pts[i];
      const next = pts[(i + 1) % pts.length];
      const coincident = Math.hypot(p.x - prev.x, p.y - prev.y) < 50;
      const ax = p.x - prev.x;
      const ay = p.y - prev.y;
      const bx = next.x - p.x;
      const by = next.y - p.y;
      const turn = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
      if (coincident || turn < (2 * Math.PI) / 180) {
        pts = pts.filter((_, k) => k !== i);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

// ponytail: self-check. Run: npm run check:region
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const same = (a: Point[], b: Point[]) => JSON.stringify(a) === JSON.stringify(b);
  const square: Point[] = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }];

  assert(moveRegionPoint(square, 1, { x: 1200.4, y: 10 })[1].x === 1200, "a moved corner lands on whole millimetres");
  const ins = insertRegionPoint(square, 3);
  assert(ins.boundary.length === 5 && ins.index === 4 && same([ins.boundary[4]], [{ x: 0, y: 500 }]), "inserting on the closing edge lands mid-edge, at the end");
  assert(removeRegionPoint(square, 0).length === 3, "a corner can be removed");
  assert(removeRegionPoint(removeRegionPoint(square, 0), 0).length === 3, "…but never below three");

  // A wobbly hand trace of a 10×6m room with a chamfered corner.
  const traced: Point[] = [
    { x: 0, y: 30 },
    { x: 5000, y: -20 }, // a stray click along the top wall
    { x: 8000, y: 10 },
    { x: 10000, y: 2000 }, // the chamfer: a real diagonal, kept
    { x: 10040, y: 6000 },
    { x: -30, y: 5970 },
  ];
  const tidy = tidyRegion(traced);
  assert(tidy.length === 5, `the stray point along a straight wall goes (got ${tidy.length})`);
  assert(tidy[0].y === tidy[1].y, "the top edge is exactly horizontal");
  assert(tidy[4].x === tidy[0].x, "the left edge is exactly vertical");
  assert(tidy[2].x !== tidy[1].x && tidy[2].y !== tidy[1].y, "the chamfer stays a diagonal");
  assert(same(tidyRegion(square), square), "a tidy outline is left as it is");

  console.log("region edit: ok");
}
