// How far apart two things on the plan really are — edge to edge, not centre to centre — and the
// three questions the studio asks with that number:
//
//   1. THE TAPE, between two items (PlanCanvas). "How much room is there between the stage and the
//      first table" is a distance between two OUTLINES. Measuring it centre to centre answers a
//      different question, and on a 6m stage the difference is three metres.
//
//   2. SAFETY DISTANCE (Product.clearanceMm). An item that needs clear floor around it — a table's
//      chairs and the aisle behind them, a drape kept back from candles — is in breach when anything
//      else's outline comes inside that distance of its own.
//
//   3. SPACING, typed. Select two things and say "1.5m between them": the second is moved, the first
//      is not. Along the room's axes that is the air between their boxes, which is what the snap and
//      the no-overlap rule already measure with (lib/studio/snap.ts, ./collide.ts); straight across
//      it is the real outline-to-outline distance, found by walking the one along the line between
//      their centres.
//
// Outlines are flattened to polygons first (a bowed edge sampled, a circle as a 32-gon): a tape that
// reads to the centimetre does not need the exact arc, and polygon distance is the one geometry
// routine that cannot go quietly wrong. Pure, no DOM, self-checked: `npm run check:proximity`.
import type { Point } from "@/lib/design-document/types";
import { footprintOutlines, flattenEdge, type Footprint } from "./footprint";

/** One closed outline in world millimetres — the last point joins back to the first. */
export type Poly = Point[];

const CURVE_STEPS = 8;

/** A footprint as world polygons: flattened, flipped (Placement.mirrored), turned and moved, in
 *  exactly the order the canvas draws it — translate · rotate · flip. */
export function footprintPolygons(f: Footprint, at: Point, rotationDeg = 0, mirrored = false, scale = 1): Poly[] {
  const t = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const place = (p: Point): Point => {
    const x = (mirrored ? -p.x : p.x) * scale;
    const y = p.y * scale;
    return { x: at.x + x * cos - y * sin, y: at.y + x * sin + y * cos };
  };
  return footprintOutlines(f).map(({ outline, edgeCurves }) => {
    const pts: Point[] = [];
    outline.forEach((a, i) => {
      const edge = flattenEdge(a, outline[(i + 1) % outline.length], edgeCurves?.[i], CURVE_STEPS);
      pts.push(...edge.slice(0, -1)); // the far end is the next edge's start
    });
    return pts.map(place);
  });
}

/** A straight band — a drape along its wall — as the rectangle it occupies. */
export function bandPolygon(a: Point, b: Point, widthMm: number): Poly {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = (-(b.y - a.y) / len) * (widthMm / 2);
  const ny = ((b.x - a.x) / len) * (widthMm / 2);
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function polysBox(polys: readonly Poly[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polys)
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  return { minX, minY, maxX, maxY };
}

/** The closest point on segment ab to p. */
function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return a;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);

function segmentsCross(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denom;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + t * r.x, y: a.y + t * r.y } : null;
}

/** Even-odd point-in-polygon, over every outline of a shape. */
export function insidePolys(p: Point, polys: readonly Poly[]): boolean {
  for (const poly of polys) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

export interface Gap {
  /** Clear distance, edge to edge. 0 when the two touch or overlap. */
  distance: number;
  /** The two points it is measured between — where the tape's ends go. */
  from: Point;
  to: Point;
}

/** The nearest a point comes to a shape — 0 from inside it. */
export function pointToPolys(p: Point, polys: readonly Poly[]): Gap {
  if (insidePolys(p, polys)) return { distance: 0, from: p, to: p };
  let best: Gap = { distance: Infinity, from: p, to: p };
  for (const poly of polys)
    for (let i = 0; i < poly.length; i++) {
      const q = closestOnSegment(p, poly[i], poly[(i + 1) % poly.length]);
      const d = dist(p, q);
      if (d < best.distance) best = { distance: d, from: p, to: q };
    }
  return best;
}

/** The clear distance between two shapes. Zero, with both ends on one shared point, when their
 *  outlines cross or one sits inside the other. */
export function polysGap(A: readonly Poly[], B: readonly Poly[]): Gap {
  for (const pa of A)
    for (let i = 0; i < pa.length; i++)
      for (const pb of B)
        for (let j = 0; j < pb.length; j++) {
          const x = segmentsCross(pa[i], pa[(i + 1) % pa.length], pb[j], pb[(j + 1) % pb.length]);
          if (x) return { distance: 0, from: x, to: x };
        }
  const a0 = A[0]?.[0];
  const b0 = B[0]?.[0];
  if (a0 && insidePolys(a0, B)) return { distance: 0, from: a0, to: a0 };
  if (b0 && insidePolys(b0, A)) return { distance: 0, from: b0, to: b0 };

  // Disjoint: the closest pair always has a vertex at one end, so vertex-to-edge both ways is exact.
  let best: Gap = { distance: Infinity, from: a0 ?? { x: 0, y: 0 }, to: b0 ?? { x: 0, y: 0 } };
  const sweep = (P: readonly Poly[], Q: readonly Poly[], flip: boolean) => {
    for (const pp of P)
      for (const v of pp)
        for (const qq of Q)
          for (let j = 0; j < qq.length; j++) {
            const q = closestOnSegment(v, qq[j], qq[(j + 1) % qq.length]);
            const d = dist(v, q);
            if (d < best.distance) best = flip ? { distance: d, from: q, to: v } : { distance: d, from: v, to: q };
          }
  };
  sweep(A, B, false);
  sweep(B, A, true);
  return best;
}

// ── Safety distance ──────────────────────────────────────────────────────────────────────────────

export interface ClearanceSubject {
  key: string;
  polys: Poly[];
  /** 0 = no rule of its own (it can still be too close to one that has one). */
  clearanceMm: number;
  /** Pushed together and called one thing (DesignGroup) — its own members are never "too close". */
  groupId?: string;
  /** The no-overlap kind (lib/studio/collide.ts). Two DIFFERENT kinds overlapping is an arrangement
   *  — a חופה standing on a stage — not a breach; the same kind overlapping is already refused by
   *  the drag itself. */
  solid?: string;
}

export interface ClearanceIssue {
  a: string;
  b: string;
  distance: number;
  /** The larger of the two rules — whose distance was not kept. */
  required: number;
  from: Point;
  to: Point;
}

/** Every pair of things closer than either of them asked to be kept. A pair is in breach when the
 *  clear distance between their outlines is under the LARGER of their two rules: a table asking for
 *  1.2m of aisle is in breach with a column 80cm away, whether or not the column asked for anything.
 *  Boxes are compared first, grown by the rule, so a room of forty tables costs forty-squared box
 *  tests and a handful of real polygon ones. */
export function clearanceIssues(subjects: readonly ClearanceSubject[]): ClearanceIssue[] {
  const boxes = subjects.map((s) => polysBox(s.polys));
  const out: ClearanceIssue[] = [];
  for (let i = 0; i < subjects.length; i++) {
    for (let j = i + 1; j < subjects.length; j++) {
      const a = subjects[i];
      const b = subjects[j];
      const required = Math.max(a.clearanceMm, b.clearanceMm);
      if (required <= 0) continue;
      if (a.groupId && a.groupId === b.groupId) continue;
      const ba = boxes[i];
      const bb = boxes[j];
      if (ba.minX - required > bb.maxX || bb.minX - required > ba.maxX || ba.minY - required > bb.maxY || bb.minY - required > ba.maxY) continue;
      const g = polysGap(a.polys, b.polys);
      if (g.distance >= required - 0.5) continue;
      if (g.distance === 0 && a.solid !== b.solid) continue; // stacked on purpose
      out.push({ a: a.key, b: b.key, distance: g.distance, required, from: g.from, to: g.to });
    }
  }
  return out;
}

// ── Spacing, typed ───────────────────────────────────────────────────────────────────────────────

/** An item's turned, axis-aligned box — the SnapBox shape the studio already measures with. */
export interface CentredBox {
  x: number;
  y: number;
  widthMm: number;
  depthMm: number;
}

/** The air between two boxes along one axis, `b` measured on the far side of `a`. Negative when
 *  they overlap on that axis. */
export function axisGap(a: CentredBox, b: CentredBox, axis: "x" | "y"): number {
  const half = (c: CentredBox) => (axis === "x" ? c.widthMm : c.depthMm) / 2;
  const at = (c: CentredBox) => (axis === "x" ? c.x : c.y);
  return at(b) >= at(a) ? at(b) - half(b) - (at(a) + half(a)) : at(a) - half(a) - (at(b) + half(b));
}

/** The axis a set of boxes is laid out along — the one their centres are spread over more. */
export function spreadAxis(boxes: readonly CentredBox[]): "x" | "y" {
  const xs = boxes.map((b) => b.x);
  const ys = boxes.map((b) => b.y);
  return Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? "x" : "y";
}

/** New centres for a row of boxes with exactly `gapMm` of air between each neighbour along `axis`.
 *  The FIRST in `order` does not move — it is the one the designer is measuring from — and each
 *  after it is set down `gapMm` past the far edge of the one before, keeping its own place on the
 *  other axis. `order` is the row's order along the axis; the caller decides it (by position, or by
 *  which was picked first). */
export function spacedCentres(order: readonly CentredBox[], axis: "x" | "y", gapMm: number): Point[] {
  if (order.length === 0) return [];
  const dir = order.length > 1 && (axis === "x" ? order[1].x < order[0].x : order[1].y < order[0].y) ? -1 : 1;
  const out: Point[] = [{ x: order[0].x, y: order[0].y }];
  let edge = axis === "x" ? order[0].x + (dir * order[0].widthMm) / 2 : order[0].y + (dir * order[0].depthMm) / 2;
  for (let i = 1; i < order.length; i++) {
    const b = order[i];
    const half = (axis === "x" ? b.widthMm : b.depthMm) / 2;
    const centre = edge + dir * (gapMm + half);
    out.push(axis === "x" ? { x: Math.round(centre), y: b.y } : { x: b.x, y: Math.round(centre) });
    edge = centre + dir * half;
  }
  return out;
}

/** EVEN DISTRIBUTION — equal AIR between neighbours, not equal steps between centres.
 *
 *  The difference is the whole point. Three tables of 1.2m, 2.4m and 1.2m spaced by their centres
 *  end up with 60cm on one side of the big one and 1.8m on the other, which is exactly what "פיזור
 *  אחיד" is pressed to fix. So: the two END boxes (first and last along the axis) stay where they
 *  are, the free length between them is what remains after every box's own size, and it is shared
 *  out equally between the gaps. Returns the new centre of each box, in the order given; the caller
 *  sorts nothing — this does, by position along the axis, and maps back. */
export function distributedCentres(boxes: readonly CentredBox[], axis: "x" | "y"): Point[] {
  const out: Point[] = boxes.map((b) => ({ x: b.x, y: b.y }));
  if (boxes.length < 3) return out;
  const size = (b: CentredBox) => (axis === "x" ? b.widthMm : b.depthMm);
  const at = (b: CentredBox) => (axis === "x" ? b.x : b.y);
  const order = boxes.map((b, i) => i).sort((i, j) => at(boxes[i]) - at(boxes[j]));
  const first = boxes[order[0]];
  const last = boxes[order[order.length - 1]];
  const span = at(last) + size(last) / 2 - (at(first) - size(first) / 2);
  const gap = (span - order.reduce((s, i) => s + size(boxes[i]), 0)) / (order.length - 1);
  let edge = at(first) + size(first) / 2;
  for (let k = 1; k < order.length - 1; k++) {
    const b = boxes[order[k]];
    const centre = edge + gap + size(b) / 2;
    out[order[k]] = axis === "x" ? { x: Math.round(centre), y: b.y } : { x: b.x, y: Math.round(centre) };
    edge = centre + size(b) / 2;
  }
  return out;
}

/** Where `B` has to stand, moved only along the line from A's centre through its own, for the clear
 *  distance between the two OUTLINES to be `gapMm`. Found by bisection on the distance along that
 *  line, which only grows as B walks away for the convex shapes a plan is made of; for a hollow one
 *  (a ח, an arc) it still lands on a position with the asked gap, just not necessarily the nearest.
 *  `shapeAt(p)` returns B's polygons with its centre at p. */
export function placeAtGap(A: readonly Poly[], aCentre: Point, bCentre: Point, shapeAt: (p: Point) => Poly[], gapMm: number): Point {
  let ux = bCentre.x - aCentre.x;
  let uy = bCentre.y - aCentre.y;
  const len = Math.hypot(ux, uy);
  if (len < 1e-6) {
    ux = 1;
    uy = 0;
  } else {
    ux /= len;
    uy /= len;
  }
  const at = (t: number): Point => ({ x: bCentre.x + ux * t, y: bCentre.y + uy * t });
  const gapAt = (t: number) => polysGap(A, shapeAt(at(t))).distance;
  const now = gapAt(0);
  let lo: number;
  let hi: number;
  if (now < gapMm) {
    lo = 0;
    hi = Math.max(1, gapMm - now);
    for (let k = 0; k < 40 && gapAt(hi) < gapMm; k++) hi *= 2;
  } else {
    lo = -len;
    hi = 0;
  }
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (gapAt(mid) < gapMm) lo = mid;
    else hi = mid;
  }
  const p = at(hi);
  return { x: Math.round(p.x), y: Math.round(p.y) };
}
