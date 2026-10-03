// Where a label goes INSIDE a footprint — a table's number and capacity, a placement's name or icon.
//
// Every footprint is drawn centred on its bounding box, and for a rectangle, a round or an ellipse
// that centre is also the middle of the shape. For an arc it is not: a half ring's box centre lies
// in the air the ring curves round, and a quarter ring's sits on its inner edge — so a number drawn
// there straddled the table's edge, or floated beside it, on every curved head table. A ח, an L and
// a half round have the same problem in smaller degrees.
//
// So a label is placed in two steps. First, how DEEP can it sit: the point farthest from any edge
// (the pole of inaccessibility — Mapbox's polylabel is the usual implementation, and `deepest`
// below is the same quadtree search). Then, among every place that deep, the one NEAREST THE
// CENTROID. The second step is what makes it the middle rather than merely inside: a band is
// equally deep all along its mid-line, and the one point of that line a person would call "the
// middle of the band" is the apex, which is also its point nearest the centroid. On an L, whose
// centroid is in its notch, it is the elbow. On a rectangle or a round the answer IS the centre, so
// nothing that was already right moves.
//
// Pure, and in the footprint's OWN frame — the caller's <g> carries position, turn and flip — so the
// studio canvas, the printed map, the rail's drag image and the catalog preview all put the label in
// the same place, and a turned table carries its number round with it.
import type { Point } from "@/lib/design-document/types";
import { flattenEdge, footprintOutlines, shapeFootprint, type BuiltOutline, type Footprint } from "./footprint";
import { polygonAreaMm2, polygonCentroid } from "./geometry";
import { isMain } from "../self-check";

const ORIGIN: Point = { x: 0, y: 0 };

// A node asks for this on every render, and a hand-drawn head table has eighty sampled vertices —
// so the answer is kept per footprint. Footprints are plain data, which makes their JSON an honest
// key; the map is capped rather than evicted because a sketch has a few dozen distinct shapes, not
// thousands.
const cache = new Map<string, Point>();
const CACHE_MAX = 500;

export function labelAnchor(f: Footprint): Point {
  if (f.kind === "rect" || f.kind === "circle" || f.kind === "ellipse") return ORIGIN;
  const key = JSON.stringify(f);
  const hit = cache.get(key);
  if (hit) return hit;
  // A composite is labelled on its largest part — the counter, not the round end set against it.
  const ring = footprintOutlines(f)
    .map(flatRing)
    .filter((r) => r.length >= 3)
    .sort((a, b) => polygonAreaMm2(b) - polygonAreaMm2(a))[0];
  const at = ring ? pole(ring) : ORIGIN;
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, at);
  return at;
}

/** An outline with its bowed edges sampled into a plain polygon, each vertex once. */
function flatRing(o: BuiltOutline): Point[] {
  const pts: Point[] = [];
  o.outline.forEach((a, i) => {
    const seg = flattenEdge(a, o.outline[(i + 1) % o.outline.length], o.edgeCurves?.[i]);
    for (let k = 0; k < seg.length - 1; k++) pts.push(seg[k]); // the next edge starts with seg's end
  });
  return pts;
}

interface Box {
  minX: number;
  minY: number;
  w: number;
  h: number;
}

function pole(ring: Point[]): Point {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ring) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const box: Box = { minX, minY, w: maxX - minX, h: maxY - minY };
  if (!(Math.min(box.w, box.h) > 0)) return { x: minX + box.w / 2, y: minY + box.h / 2 };
  const span = Math.max(box.w, box.h);
  // How close to the true depth the first search gets. The second search then accepts anything
  // within that of it as "that deep", so the band it chooses from is at least this thick on either
  // side of the mid-line — thick enough for its own cells to land in, thin enough that the label
  // ends up a few millimetres off the mid-line at most.
  const slack = Math.max(0.5, span / 400);
  const deep = deepest(ring, box, slack);
  const c = polygonCentroid(ring);
  const minDepth = deep.d - slack;
  const near = nearestAsDeep(ring, box, c, minDepth, deep, Math.max(0.1, span / 4000));
  return polish(ring, c, minDepth, near, span);
}

/** The last few millimetres. `nearestAsDeep` is exact to its precision in DISTANCE, and at the apex
 *  of a band the distance to the centroid is flat along the band — a quarter of a millimetre of
 *  distance is twenty millimetres of arc — so the point it returns can sit that far round from the
 *  apex. Worse, the band's mid-line is not the smooth curve it looks: the bowed edges are sampled
 *  into chords, so the line ripples by a millimetre or so, and the point of it nearest the
 *  centroid is wherever a ripple happens to dip. Chasing the nearest point any harder would chase
 *  the ripple.
 *
 *  So instead of the nearest point, the MIDDLE of the stretch that is nearly nearest: settle onto
 *  the mid-line, walk along it both ways until the distance to the centroid has grown by `tol` (or
 *  the line stops being that deep), and take the midpoint of the two ends, settled back onto the
 *  line. On a symmetric shape the two walks mirror each other, ripples and all, so the midpoint is
 *  on the axis of symmetry exactly — the apex of an arc, the axis of a half round. "Across" the
 *  band is the direction of the nearest edge, which on the mid-line is the same line whichever of
 *  the two edges is nearer; "along" is perpendicular to it, kept pointing the way the walk is going
 *  (the nearer edge, and with it the sign of that direction, changes from step to step). */
function polish(ring: Point[], c: Point, minDepth: number, from: Point, span: number): Point {
  const dist = (p: Point) => Math.hypot(p.x - c.x, p.y - c.y);
  const across = (p: Point): Point => {
    const e = nearestEdgePoint(p.x, p.y, ring);
    const l = Math.hypot(e.x - p.x, e.y - p.y) || 1;
    return { x: (e.x - p.x) / l, y: (e.y - p.y) / l };
  };
  const step = Math.max(1, span / 200);
  const tol = Math.max(2, span / 500);
  const settle = (p: Point, r: number) => ridge(ring, p, across(p), r);

  let start = settle(from, step * 4);
  if (signedDistance(start.x, start.y, ring) < minDepth) start = from;
  const d0 = dist(start);
  const n0 = across(start);
  const ok = (p: Point) => signedDistance(p.x, p.y, ring) >= minDepth && dist(p) <= d0 + tol;

  /** As far along the mid-line as `ok` holds, `sign` way from the start, to a tenth of a millimetre:
   *  whole steps while they land inside the stretch, then ever shorter ones to close in on its end. */
  const end = (sign: 1 | -1): Point => {
    let at = start;
    let heading = { x: -n0.y * sign, y: n0.x * sign };
    for (let len = step, i = 0; len >= 0.1 && i < 400; i++) {
      const n = across(at);
      const along = -n.y * heading.x + n.x * heading.y >= 0 ? { x: -n.y, y: n.x } : { x: n.y, y: -n.x };
      const next = ridge(ring, { x: at.x + along.x * len, y: at.y + along.y * len }, n, len);
      if (ok(next)) {
        at = next;
        heading = along;
      } else {
        len /= 2;
      }
    }
    return at;
  };

  const a = end(1);
  const b = end(-1);
  const mid = settle({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, step * 4);
  return signedDistance(mid.x, mid.y, ring) >= minDepth ? mid : start;
}

/** The deepest point on the line through `p` along `n`, within ±r — the band's mid-line, where the
 *  depth across a band peaks. Depth is concave across a band, so bisecting on its slope finds the
 *  peak. */
function ridge(ring: Point[], p: Point, n: Point, r: number): Point {
  let lo = -r;
  let hi = r;
  for (let k = 0; k < 24; k++) {
    const m = (lo + hi) / 2;
    const rise = signedDistance(p.x + n.x * (m + 1e-3), p.y + n.y * (m + 1e-3), ring) - signedDistance(p.x + n.x * (m - 1e-3), p.y + n.y * (m - 1e-3), ring);
    if (rise > 0) lo = m;
    else hi = m;
  }
  const u = (lo + hi) / 2;
  return { x: p.x + n.x * u, y: p.y + n.y * u };
}

/** The point of the ring nearest (x, y). */
function nearestEdgePoint(x: number, y: number, ring: Point[]): Point {
  let best: Point = ring[0];
  let bestSq = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    let qx = a.x;
    let qy = a.y;
    const dx = b.x - qx;
    const dy = b.y - qy;
    if (dx !== 0 || dy !== 0) {
      const t = ((x - qx) * dx + (y - qy) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        qx = b.x;
        qy = b.y;
      } else if (t > 0) {
        qx += dx * t;
        qy += dy * t;
      }
    }
    const sq = (x - qx) ** 2 + (y - qy) ** 2;
    if (sq < bestSq) {
      bestSq = sq;
      best = { x: qx, y: qy };
    }
  }
  return best;
}

interface Cell {
  x: number;
  y: number;
  h: number; // half the cell's side
  d: number; // depth at the centre: distance from the nearest edge, negative outside
}

/** The cells of the square grid that tiles the box, `size` across — the start of both searches. */
function seed(box: Box, cell: (x: number, y: number, h: number) => Cell): Cell[] {
  const size = Math.min(box.w, box.h);
  const cells: Cell[] = [];
  for (let x = box.minX; x < box.minX + box.w; x += size) {
    for (let y = box.minY; y < box.minY + box.h; y += size) cells.push(cell(x + size / 2, y + size / 2, size / 2));
  }
  return cells;
}

/** The point farthest from any edge, to within `precision` of the true depth. A cell is opened only
 *  while a point in it could still be deeper than the best so far — inside a cell, depth grows by at
 *  most h√2 — so most of the box is never looked at. */
function deepest(ring: Point[], box: Box, precision: number): Cell {
  const cell = (x: number, y: number, h: number): Cell => ({ x, y, h, d: signedDistance(x, y, ring) });
  const bound = (q: Cell) => q.d + q.h * Math.SQRT2;
  const queue = new Heap<Cell>((a, b) => bound(a) > bound(b));
  for (const q of seed(box, cell)) queue.push(q);
  const c = polygonCentroid(ring);
  let best = cell(c.x, c.y, 0);
  const mid = cell(box.minX + box.w / 2, box.minY + box.h / 2, 0);
  if (mid.d > best.d) best = mid;
  for (let q = queue.pop(); q; q = queue.pop()) {
    if (q.d > best.d) best = q;
    if (bound(q) - best.d <= precision) continue;
    const h = q.h / 2;
    queue.push(cell(q.x - h, q.y - h, h), cell(q.x + h, q.y - h, h), cell(q.x - h, q.y + h, h), cell(q.x + h, q.y + h, h));
  }
  return best;
}

/** Of the points at least `minDepth` inside, the one nearest `c`, to within `precision` of its
 *  distance. Cells come off the queue nearest-first, so the search ends the moment the nearest
 *  cell left cannot beat what is found; a cell no point of which can be deep enough is dropped. */
function nearestAsDeep(ring: Point[], box: Box, c: Point, minDepth: number, from: Point, precision: number): Point {
  const cell = (x: number, y: number, h: number): Cell => ({ x, y, h, d: signedDistance(x, y, ring) });
  const dist = (p: Point) => Math.hypot(p.x - c.x, p.y - c.y);
  const lower = (q: Cell) => dist(q) - q.h * Math.SQRT2;
  const queue = new Heap<Cell>((a, b) => lower(a) < lower(b));
  for (const q of seed(box, cell)) queue.push(q);
  let best = { x: from.x, y: from.y, dist: dist(from) };
  for (let q = queue.pop(); q; q = queue.pop()) {
    if (lower(q) >= best.dist - precision) break;
    if (q.d >= minDepth && dist(q) < best.dist) best = { x: q.x, y: q.y, dist: dist(q) };
    if (q.h < precision || q.d + q.h * Math.SQRT2 < minDepth) continue;
    const h = q.h / 2;
    queue.push(cell(q.x - h, q.y - h, h), cell(q.x + h, q.y - h, h), cell(q.x - h, q.y + h, h), cell(q.x + h, q.y + h, h));
  }
  return { x: best.x, y: best.y };
}

/** Distance from the nearest edge — positive inside the ring, negative outside. */
function signedDistance(x: number, y: number, ring: Point[]): number {
  let inside = false;
  let minSq = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    minSq = Math.min(minSq, segmentDistanceSq(x, y, a, b));
  }
  return (inside ? 1 : -1) * Math.sqrt(minSq);
}

function segmentDistanceSq(px: number, py: number, a: Point, b: Point): number {
  let x = a.x;
  let y = a.y;
  let dx = b.x - x;
  let dy = b.y - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b.x;
      y = b.y;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

/** A binary heap: `before(a, b)` says a comes off before b. Both searches push a few thousand cells
 *  and pop them in order, which a sorted array or a scan-for-the-best would make quadratic. */
class Heap<T> {
  private readonly a: T[] = [];
  constructor(private readonly before: (a: T, b: T) => boolean) {}
  push(...items: T[]): void {
    for (const v of items) {
      const a = this.a;
      a.push(v);
      for (let i = a.length - 1; i > 0; ) {
        const p = (i - 1) >> 1;
        if (!this.before(a[i], a[p])) break;
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      }
    }
  }
  pop(): T | undefined {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop() as T;
    if (a.length > 0) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.before(a[l], a[m])) m = l;
        if (r < a.length && this.before(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

// ponytail: self-check. Run: npm run check:label-anchor
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (p: Point, q: Point, tol: number) => Math.hypot(p.x - q.x, p.y - q.y) <= tol;
  const ringOf = (f: Footprint) => flatRing(footprintOutlines(f)[0]);
  const depth = (f: Footprint, p: Point) => signedDistance(p.x, p.y, ringOf(f));

  // The primitives are labelled at their centre, exactly — nothing that was right moves.
  assert(near(labelAnchor({ kind: "rect", widthMm: 1800, depthMm: 800 }), ORIGIN, 0), "a rectangle is labelled at its centre");
  assert(near(labelAnchor({ kind: "circle", diameterMm: 1800 }), ORIGIN, 0), "a round is labelled at its centre");
  assert(near(labelAnchor({ kind: "ellipse", widthMm: 1800, depthMm: 900 }), ORIGIN, 0), "an ellipse is labelled at its centre");

  // A square drawn by hand, anywhere on the page: the answer is in the footprint's own frame.
  const square: Footprint = { kind: "custom", outline: [{ x: 1000, y: 1000 }, { x: 2000, y: 1000 }, { x: 2000, y: 2000 }, { x: 1000, y: 2000 }] };
  assert(near(labelAnchor(square), ORIGIN, 6), "a hand-drawn square is labelled at its centre, in its own frame");

  // The arc of the report: a half ring 2.4m across with a 30cm band. Its box centre is in the air.
  const half: Footprint = shapeFootprint("arc", { diameterMm: 2400, arc: { sweepDeg: 180, bandMm: 300 } });
  assert(depth(half, ORIGIN) < 0, "sanity: a half ring's box centre is OUTSIDE the band — that was the bug");
  const onHalf = labelAnchor(half);
  assert(depth(half, onHalf) > 0, "a half ring is labelled inside its band");
  assert(Math.abs(onHalf.x) <= 12, "…at the apex, on the arc's axis of symmetry, not wherever along the band the search looked first");
  assert(Math.abs(depth(half, onHalf) - 150) <= 12, "…in the middle of the band, as far from the inner edge as the outer");

  // A quarter ring's box centre is inside, but on the inner edge — the label straddled the line.
  const quarter: Footprint = shapeFootprint("arc", { diameterMm: 2400, arc: { sweepDeg: 90, bandMm: 300 } });
  assert(depth(quarter, ORIGIN) < 60, "sanity: a quarter ring's box centre is within 6cm of its inner edge");
  const onQuarter = labelAnchor(quarter);
  assert(Math.abs(depth(quarter, onQuarter) - 150) <= 12 && Math.abs(onQuarter.x) <= 12, "a quarter ring is labelled in the middle of the band, at the apex");

  // An L: the box centre is in the notch. The label lands in a limb, by the elbow — inside, as deep
  // as the limb allows, and the point of it nearest the L's middle.
  const L: Footprint = { kind: "custom", outline: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 1000 }, { x: 1000, y: 1000 }, { x: 1000, y: 3000 }, { x: 0, y: 3000 }] };
  assert(depth(L, ORIGIN) < 0, "sanity: an L's box centre is in its notch");
  const onL = labelAnchor(L);
  assert(depth(L, onL) >= 500 - 12, "an L is labelled as deep inside as its limbs allow");
  assert(onL.x < 0 && onL.y < 0, "…by the elbow, the part of the L nearest its middle");

  // A composite is labelled on its largest part.
  const multi: Footprint = {
    kind: "multi",
    parts: [
      { outline: [{ x: -1500, y: -300 }, { x: 500, y: -300 }, { x: 500, y: 300 }, { x: -1500, y: 300 }] },
      { outline: [{ x: 500, y: -500 }, { x: 1500, y: -500 }, { x: 1500, y: 500 }, { x: 500, y: 500 }] },
    ],
  };
  assert(near(labelAnchor(multi), { x: -500, y: 0 }, 12), "a composite is labelled on its largest part, not on its box centre");

  // Deterministic, and the same object the second time round.
  assert(labelAnchor(half) === onHalf, "the answer is kept per footprint");

  console.log("label-anchor self-check passed");
}
