import type { DesignDocumentContent, DesignTable } from "@/lib/design-document/types";
import type { EdgeCurve, Point } from "./hall";

// Shoelace formula — true area of an arbitrary (simple) polygon, in mm². Used for the hall
// outline once it's no longer just a rectangle.
// ponytail: computed on the straight-line vertices, ignoring any wall curvature — the badge is a
// rough sqm indicator, not a structural measurement, so the small bulge error doesn't matter.
export function polygonAreaMm2(outline: Point[]): number {
  let sum = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

// Area-weighted centroid — where the sqm badge sits, so it lands inside an L-shaped hall instead
// of in the notch a bbox centre would pick. A half-drawn outline has no area yet, so fall back to
// the plain vertex average there.
export function polygonCentroid(outline: Point[]): Point {
  const n = outline.length;
  if (n === 0) return { x: 0, y: 0 };
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const p = outline[i];
    const q = outline[(i + 1) % n];
    const cross = p.x * q.y - q.x * p.y;
    a2 += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a2) < 1e-9) {
    return { x: outline.reduce((s, p) => s + p.x, 0) / n, y: outline.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: cx / (3 * a2), y: cy / (3 * a2) };
}

// EdgeCurve stores control points as offsets from their own edge's endpoints (see hall.ts) so
// that moving a vertex carries its curves along. These resolve an edge's curve to absolute mm.
export function absoluteControlPoints(a: Point, b: Point, curve: EdgeCurve): { c1: Point; c2: Point } {
  return {
    c1: { x: a.x + curve.c1.x, y: a.y + curve.c1.y },
    c2: { x: b.x + curve.c2.x, y: b.y + curve.c2.y },
  };
}

// SVG path "d" for a closed outline: straight edges by default, cubic bezier where
// edgeCurves[i] is set. Edge i runs from outline[i] to outline[(i+1) % n]. `open`: the last edge,
// back to the first point, is left out and the path is not closed — a shape drawn as lines only.
export function outlinePathD(outline: Point[], edgeCurves?: (EdgeCurve | null)[], open?: boolean): string {
  if (outline.length < 2) return "";
  const n = outline.length;
  let d = `M ${outline[0].x} ${outline[0].y}`;
  for (let i = 0; i < (open ? n - 1 : n); i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const curve = edgeCurves?.[i];
    if (curve) {
      const { c1, c2 } = absoluteControlPoints(a, b, curve);
      d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
    } else {
      d += ` L ${b.x} ${b.y}`;
    }
  }
  return open ? d : d + " Z";
}

// The LINE of a closed outline, without its seams: a straight edge walked once each way (a closed
// band's keyhole — lib/studio/footprint.ts buildHollow and the oval ring — whose two caps lie on top
// of each other) is where the outline meets itself, not a side of the shape, and stroked it drew a
// line across a band whose entrance is 0. Null when the outline has no seam, so a caller strokes the
// ordinary closed path. Fill with outlinePathD, stroke this.
export function outlineStrokeD(outline: Point[], edgeCurves?: (EdgeCurve | null)[]): string | null {
  const n = outline.length;
  if (n < 3) return null;
  const near = (a: Point, b: Point) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
  const seam = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (edgeCurves?.[i]) continue;
    const a = outline[i];
    const b = outline[(i + 1) % n];
    if (near(a, b)) continue;
    for (let j = 0; j < n; j++) {
      if (j === i || edgeCurves?.[j]) continue;
      if (near(outline[j], b) && near(outline[(j + 1) % n], a)) {
        seam.add(i);
        break;
      }
    }
  }
  if (seam.size === 0) return null;
  // Start just after a seam, so each loop it separates is one unbroken run.
  const first = [...seam][0];
  let d = "";
  let pen: Point | null = null;
  let runStart: Point | null = null;
  for (let k = 1; k <= n; k++) {
    const i = (first + k) % n;
    if (seam.has(i)) {
      if (pen && runStart && near(pen, runStart)) d += " Z";
      pen = null;
      continue;
    }
    const a = outline[i];
    const b = outline[(i + 1) % n];
    if (!pen || !near(pen, a)) {
      d += `${d ? " " : ""}M ${a.x} ${a.y}`;
      runStart = a;
    }
    const curve = edgeCurves?.[i];
    if (curve) {
      const { c1, c2 } = absoluteControlPoints(a, b, curve);
      d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
    } else d += ` L ${b.x} ${b.y}`;
    pen = b;
  }
  if (pen && runStart && near(pen, runStart)) d += " Z";
  return d;
}

/** A front shape's FACE on the plan (backdrops S2, lib/studio/footprint.ts BuiltOutline.face): the
 *  named edges of an outline as one open path, consecutive edges one run — drawn over the outline so
 *  which way a backdrop faces reads off the drawing. Null when none are named. */
export function faceStrokeD(outline: Point[], edgeCurves: (EdgeCurve | null)[] | undefined, face: readonly number[] | undefined): string | null {
  const n = outline.length;
  if (!face?.length || n < 2) return null;
  const on = new Set(face.filter((i) => i >= 0 && i < n));
  if (!on.size) return null;
  // Start where a run begins (an edge on the face whose predecessor is not), so a run that wraps
  // past the last edge is still one.
  const start = [...on].find((i) => !on.has((i - 1 + n) % n)) ?? [...on][0];
  let d = "";
  let pen = -1;
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (!on.has(i)) continue;
    const a = outline[i];
    const b = outline[(i + 1) % n];
    if (pen !== i) d += `${d ? " " : ""}M ${a.x} ${a.y}`;
    const curve = edgeCurves?.[i];
    if (curve) {
      const { c1, c2 } = absoluteControlPoints(a, b, curve);
      d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
    } else d += ` L ${b.x} ${b.y}`;
    pen = (i + 1) % n;
  }
  return d || null;
}

// Open (non-closed) SVG path for a single edge — used to give each wall its own clickable/
// draggable element in the interactive editor, instead of one combined closed path.
export function edgePathD(a: Point, b: Point, curve?: EdgeCurve | null): string {
  if (!curve) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  const { c1, c2 } = absoluteControlPoints(a, b, curve);
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
}

// De Casteljau split of a cubic at parameter t → the two halves as their own control points.
export type Cubic = [Point, Point, Point, Point];
const lerpPt = (p: Point, q: Point, t: number): Point => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
export function splitCubic(c: Cubic, t: number): { left: Cubic; right: Cubic } {
  const [p0, p1, p2, p3] = c;
  const p01 = lerpPt(p0, p1, t);
  const p12 = lerpPt(p1, p2, t);
  const p23 = lerpPt(p2, p3, t);
  const p012 = lerpPt(p01, p12, t);
  const p123 = lerpPt(p12, p23, t);
  const p0123 = lerpPt(p012, p123, t);
  return { left: [p0, p01, p012, p0123], right: [p0123, p123, p23, p3] };
}

// SVG "d" for the slice of a wall between chord-fractions t0..t1 — a straight segment, or a real
// bezier sub-curve when the wall is bowed. Lets a door cut a hole out of a curved wall without
// straightening it: render the stub on either side of the door's t-range.
export function wallSegmentD(a: Point, b: Point, curve: EdgeCurve | null, t0: number, t1: number): string {
  if (!curve) {
    const p0 = lerpPt(a, b, t0);
    const p1 = lerpPt(a, b, t1);
    return `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`;
  }
  const { c1, c2 } = absoluteControlPoints(a, b, curve);
  const right = splitCubic([a, c1, c2, b], t0).right; // [t0, 1]
  const t1b = t0 >= 1 ? 0 : (t1 - t0) / (1 - t0); // remap t1 into the [t0,1] sub-curve
  const [q0, q1, q2, q3] = splitCubic(right, t1b).left; // [t0, t1]
  return `M ${q0.x} ${q0.y} C ${q1.x} ${q1.y} ${q2.x} ${q2.y} ${q3.x} ${q3.y}`;
}

// Point at t on a cubic bezier — used to place a wall's drag handle at its visual midpoint.
export function cubicPointAt(a: Point, c1: Point, c2: Point, b: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt ** 3 * a.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * b.x,
    y: mt ** 3 * a.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * b.y,
  };
}

export function edgeMidpoint(a: Point, b: Point, curve?: EdgeCurve | null): Point {
  if (!curve) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const { c1, c2 } = absoluteControlPoints(a, b, curve);
  return cubicPointAt(a, c1, c2, b, 0.5);
}

// The points *along* a bowed edge, so anything that works in straight lines (a room's polygon, its
// area, a click's hit test) can follow the bow instead of cutting the chord. Endpoints are excluded
// deliberately: the caller already holds them, and a boundary walk is vertex → interior → vertex.
// A straight edge yields nothing at all, which is exactly right — its two endpoints are the edge.
export function sampleEdgePoints(a: Point, b: Point, curve: EdgeCurve | null | undefined, steps = 12): Point[] {
  if (!curve || steps < 2) return [];
  const { c1, c2 } = absoluteControlPoints(a, b, curve);
  const points: Point[] = [];
  for (let i = 1; i < steps; i++) points.push(cubicPointAt(a, c1, c2, b, i / steps));
  return points;
}

// Sane ceiling for how far a wall can bow, or a bezier handle can sit, relative to the wall's own
// length — without this a runaway drag (or a corrupted save) produces a curve stretching for
// kilometres, which is what "עיקום" showing a huge number was: nothing was ever clamping it.
export function maxBulgeDepthMm(wallLenMm: number): number {
  return Math.min(wallLenMm * 0.6, 5000);
}
function maxHandleOffsetMm(wallLenMm: number): number {
  return Math.min(wallLenMm * 3, 30000);
}
function clampMagnitude(p: Point, maxMm: number): Point {
  const dist = Math.hypot(p.x, p.y);
  if (dist <= maxMm || dist === 0) return p;
  const scale = maxMm / dist;
  return { x: p.x * scale, y: p.y * scale };
}

// Derives symmetric default bezier handles when a straight wall is first bowed by dragging its
// midpoint toward `to`, so the curve passes through the cursor at t=0.5 (a symmetric cubic's
// midpoint only picks up 3/4 of the handle offset — scaled by 4/3 here to compensate). Control
// points sit at the 1/3 and 2/3 marks along the wall. Returned as offsets-from-endpoint per the
// EdgeCurve convention. The bulge distance is clamped to maxBulgeDepthMm regardless of how far
// `to` actually is, so a wild drag (or programmatic call) can't produce a runaway curve.
export function bulgeToCurve(a: Point, b: Point, to: Point): EdgeCurve {
  const straightMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const rawDx = to.x - straightMid.x;
  const rawDy = to.y - straightMid.y;
  const rawDist = Math.hypot(rawDx, rawDy);
  const maxDist = maxBulgeDepthMm(wallLengthMm(a, b));
  const scale = rawDist > maxDist ? maxDist / (rawDist || 1) : 1;
  const dx = (rawDx * scale * 4) / 3;
  const dy = (rawDy * scale * 4) / 3;
  return {
    c1: { x: (b.x - a.x) / 3 + dx, y: (b.y - a.y) / 3 + dy },
    c2: { x: -(b.x - a.x) / 3 + dx, y: -(b.y - a.y) / 3 + dy },
  };
}

// Clamps an edge curve's control-point offsets to a sane multiple of the wall's own length — used
// both for direct c1/c2 handle drags and to sanitize any already-corrupted saved data on load.
export function clampEdgeCurve(a: Point, b: Point, curve: EdgeCurve): EdgeCurve {
  const max = maxHandleOffsetMm(wallLengthMm(a, b));
  return { c1: clampMagnitude(curve.c1, max), c2: clampMagnitude(curve.c2, max) };
}

// Numeric wall editing: length/angle move a wall's end vertex directly, so typing a value and
// dragging its handle both write through the same moveVertex plumbing.
export function wallLengthMm(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// Degrees, standard math convention (0° = +X, counter-clockwise positive), normalized to [0,360).
export function wallAngleDeg(a: Point, b: Point): number {
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

export function endpointFromLengthAngle(a: Point, lengthMm: number, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: a.x + lengthMm * Math.cos(rad), y: a.y + lengthMm * Math.sin(rad) };
}

function unitVector(from: Point, to: Point): Point | null {
  const len = wallLengthMm(from, to);
  if (len < 1e-6) return null;
  return { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  widthMm: number;
  heightMm: number;
}

// Axis-aligned bounds of an outline, in whatever space that outline is stored in. Callers use this
// to fit a viewport, so unlike polygonAreaMm2 it does NOT ignore wall curvature: a cubic bezier is
// contained in the convex hull of its four control points, so folding the absolute control points
// into the min/max yields a box that is slightly loose but can never clip a bulge off the edge of
// the view. A few mm of slack is invisible; a clipped wall is not.
export function outlineBounds(outline: Point[], edgeCurves?: (EdgeCurve | null)[]): Bounds {
  if (outline.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, widthMm: 0, heightMm: 0 };
  const n = outline.length;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of outline) {
    xs.push(p.x);
    ys.push(p.y);
  }
  // A stale edgeCurves array can outlive the outline it was built for — ignore any entry past the
  // last edge rather than indexing off the end of the outline.
  edgeCurves?.forEach((curve, i) => {
    if (!curve || i >= n) return;
    const { c1, c2 } = absoluteControlPoints(outline[i], outline[(i + 1) % n], curve);
    xs.push(c1.x, c2.x);
    ys.push(c1.y, c2.y);
  });
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, widthMm: maxX - minX, heightMm: maxY - minY };
}

// Bounding-box diagonal — the shape's own sense of "far", used to reject a solve that would fling
// a corner off the map rather than nudge it.
function outlineSpanMm(outline: Point[]): number {
  const { widthMm, heightMm } = outlineBounds(outline);
  return Math.hypot(widthMm, heightMm) || 1;
}

// Setting a wall's length (or angle) by moving only its end vertex keeps that one wall honest and
// silently destroys both neighbours' angles: lengthen one side of a square and the next wall goes
// diagonal, so two "corrections" leave a quadrilateral where a rectangle used to be. Instead, move
// the end vertex b as asked, then slide the *following* vertex c along wall i+1's original
// direction until it meets wall i+2's line. Every wall keeps its angle and wall i+2 absorbs the
// length change — on a rectangle that keeps it a rectangle and grows the opposite wall to match.
//
// Pure vector maths, so it holds at any rotation; nothing here assumes an axis-aligned shape.
// Returns null when the solve is degenerate and the caller should fall back to moving b alone:
// fewer than 4 vertices (no spare wall to absorb the change), a zero-length neighbour, walls i+1
// and i+2 parallel (their lines never meet), or an intersection absurdly far from where c sits now
// (a glancing pair does meet, just off in the distance).
export function reshapeEdgeKeepingAngles(
  outline: Point[],
  edgeIdx: number,
  newB: Point,
): { bIdx: number; b: Point; cIdx: number; c: Point } | null {
  const n = outline.length;
  if (n < 4) return null;
  const bIdx = (edgeIdx + 1) % n;
  const cIdx = (edgeIdx + 2) % n;
  const c = outline[cIdx];
  const u = unitVector(outline[bIdx], c); // wall i+1's original direction
  const v = unitVector(c, outline[(edgeIdx + 3) % n]); // wall i+2's original direction
  if (!u || !v) return null;
  const denom = u.x * v.y - u.y * v.x; // u × v — zero when the two walls are parallel
  if (Math.abs(denom) < 1e-9) return null;
  // Solve newB + t·u = c + s·v for t by crossing both sides with v.
  const t = ((c.x - newB.x) * v.y - (c.y - newB.y) * v.x) / denom;
  if (!Number.isFinite(t)) return null;
  const cNew = { x: newB.x + u.x * t, y: newB.y + u.y * t };
  if (wallLengthMm(c, cNew) > outlineSpanMm(outline) * 4) return null;
  return { bIdx, b: newB, cIdx, c: cNew };
}

// Perpendicular distance from a wall's curve to its straight midpoint — the numeric counterpart
// to dragging the bulge handle by hand.
export function bulgeDepthMm(a: Point, b: Point, curve: EdgeCurve | null): number {
  if (!curve) return 0;
  const mid = edgeMidpoint(a, b, curve);
  const straightMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return Math.hypot(mid.x - straightMid.x, mid.y - straightMid.y);
}

// Sets a wall's bulge by depth alone, keeping its current bow direction (or defaulting to
// perpendicular-outward for a wall that's still straight). depthMm <= 0 straightens the wall.
export function setBulgeDepth(a: Point, b: Point, curve: EdgeCurve | null, depthMm: number): EdgeCurve | null {
  if (depthMm <= 0) return null;
  const straightMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  let dirX: number;
  let dirY: number;
  if (curve) {
    const mid = edgeMidpoint(a, b, curve);
    const dx = mid.x - straightMid.x;
    const dy = mid.y - straightMid.y;
    const len = Math.hypot(dx, dy) || 1;
    dirX = dx / len;
    dirY = dy / len;
  } else {
    const wx = b.x - a.x;
    const wy = b.y - a.y;
    const wlen = Math.hypot(wx, wy) || 1;
    dirX = -wy / wlen;
    dirY = wx / wlen;
  }
  return bulgeToCurve(a, b, { x: straightMid.x + dirX * depthMm, y: straightMid.y + dirY * depthMm });
}

// --- Wall-attached entrances (doors) ---
// A door's position is stored as a distance along the wall's straight chord (a→b), not an
// absolute point — so it survives the wall being dragged, lengthened, or curved. ponytail: doors
// are placed along the chord even on a curved wall (no bezier arc-length math) — a fine
// approximation for how far a door realistically sits from a gentle bow.

export function pointAtDistance(a: Point, b: Point, distanceMm: number): Point {
  const len = wallLengthMm(a, b) || 1;
  const t = Math.max(0, Math.min(len, distanceMm)) / len;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// The two vertices a door's wallIndex refers to, with the index wrapped into range. For callers
// that already hold a resolved outline (everything going through shellOutline does).
export function wallEndpoints(outline: Point[], wallIndex: number): { a: Point; b: Point } {
  const n = outline.length;
  return { a: outline[((wallIndex % n) + n) % n], b: outline[(((wallIndex + 1) % n) + n) % n] };
}


// Clamped distance along a→b closest to p — used both to snap a dropped entrance onto a wall and
// to slide an existing one as it's dragged.
export function projectOntoWall(a: Point, b: Point, p: Point): number {
  const len = wallLengthMm(a, b) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  return Math.max(0, Math.min(len, (p.x - a.x) * ux + (p.y - a.y) * uy));
}

/** The side's own parameter (0 at a, 1 at b) of its point nearest `p` — the chord fraction on a
 *  straight side, the bezier's parameter on a bowed one. Where a double-click on a side adds a point. */
export function edgeParamAt(a: Point, b: Point, curve: EdgeCurve | null, p: Point): number {
  const len = wallLengthMm(a, b);
  if (!curve) return len > 0 ? projectOntoWall(a, b, p) / len : 0;
  const { c1, c2 } = absoluteControlPoints(a, b, curve);
  const d2 = (u: number) => {
    const q = cubicPointAt(a, c1, c2, b, u);
    return (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
  };
  const N = 64;
  let best = 0;
  for (let i = 1; i <= N; i++) if (d2(i / N) < d2(best)) best = i / N;
  // Refine between the neighbouring samples.
  let lo = Math.max(0, best - 1 / N);
  let hi = Math.min(1, best + 1 / N);
  for (let k = 0; k < 30; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (d2(m1) < d2(m2)) hi = m2;
    else lo = m1;
  }
  return (lo + hi) / 2;
}

export function nearestWallToPoint(outline: Point[], p: Point): { edgeIdx: number; distanceMm: number } {
  let best = { edgeIdx: 0, distanceMm: 0, distSq: Infinity };
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const distanceMm = projectOntoWall(a, b, p);
    const proj = pointAtDistance(a, b, distanceMm);
    const distSq = (p.x - proj.x) ** 2 + (p.y - proj.y) ** 2;
    if (distSq < best.distSq) best = { edgeIdx: i, distanceMm, distSq };
  }
  return { edgeIdx: best.edgeIdx, distanceMm: best.distanceMm };
}

export interface DoorLeaf {
  hinge: Point; // jamb the leaf swings from
  tip: Point; // open end of the leaf
  arcTo: Point; // where the swing arc meets the wall (or, for a double door, the other leaf)
  lenMm: number; // leaf length — also the swing arc's radius
  sweepFlag: 0 | 1;
}

export interface DoorGeometry {
  gapStart: Point;
  gapEnd: Point;
  center: Point;
  leaves: DoorLeaf[]; // 1 for a single door, 2 for a double door (most event-hall entrances)
}

function doorLeaf(hinge: Point, arcTo: Point, leafLenMm: number, swx: number, swy: number, ux: number, uy: number): DoorLeaf {
  return {
    hinge,
    tip: { x: hinge.x + swx * leafLenMm, y: hinge.y + swy * leafLenMm },
    arcTo,
    lenMm: leafLenMm,
    sweepFlag: swx * uy - swy * ux > 0 ? 1 : 0,
  };
}

// Classic architectural door symbol: a gap cut in the wall, one or two leaves swung open 90°, and
// a quarter-circle arc tracing each swing. `interiorHint` (e.g. the outline's centroid) resolves
// which side of the wall is "inward" so swingInward is meaningful regardless of wall winding
// direction. A double door splits the opening into two equal leaves hinged at each jamb, both
// swinging the same way and meeting in the middle — the common case for an event-hall entrance.
//
// `curve` is optional and only changes WHERE the gap/jambs/leaves land, not the math above: on a
// bowed wall, a jamb placed by lerping the straight a→b chord sits off the wall's own drawn path by
// however far it bows there — the symbol floats beside the opening instead of in it. Sampling the
// same cubic wallSegmentD already cuts the gap from (via distanceMm/len as the curve parameter,
// not an arc-length one — consistent with how the gap itself is cut) keeps the door where the wall
// actually is. The swing direction then follows the LOCAL tangent between the two jambs rather than
// the wall's end-to-end chord — the difference that matters right at the door, not the average over
// a wall that might bow well past it.
export function doorGeometry(
  a: Point,
  b: Point,
  distanceMm: number,
  widthMm: number,
  swingInward: boolean,
  interiorHint: Point,
  doubleDoor = false,
  curve?: EdgeCurve | null,
): DoorGeometry {
  const len = wallLengthMm(a, b) || 1;
  const at = curve
    ? (d: number) => {
        const { c1, c2 } = absoluteControlPoints(a, b, curve);
        return cubicPointAt(a, c1, c2, b, Math.max(0, Math.min(1, d / len)));
      }
    : (d: number) => pointAtDistance(a, b, d);
  const half = widthMm / 2;
  const gapStart = at(distanceMm - half);
  const gapEnd = at(distanceMm + half);
  const center = at(distanceMm);
  const localLen = wallLengthMm(gapStart, gapEnd) || 1;
  const ux = (gapEnd.x - gapStart.x) / localLen;
  const uy = (gapEnd.y - gapStart.y) / localLen;
  const nx = -uy;
  const ny = ux;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const normalPointsInward = (interiorHint.x - midX) * nx + (interiorHint.y - midY) * ny > 0;
  const sign = normalPointsInward === swingInward ? 1 : -1;
  const swx = nx * sign;
  const swy = ny * sign;
  if (!doubleDoor) {
    return { gapStart, gapEnd, center, leaves: [doorLeaf(gapStart, gapEnd, widthMm, swx, swy, ux, uy)] };
  }
  return {
    gapStart,
    gapEnd,
    center,
    leaves: [doorLeaf(gapStart, center, half, swx, swy, ux, uy), doorLeaf(gapEnd, center, half, swx, swy, -ux, -uy)],
  };
}

// --- Locked-length walls ---
// A locked wall behaves like a rigid rod: dragging (or numerically reshaping) either endpoint may
// still move it, but the two endpoints must stay exactly wallLengthMm(a,b) apart — the length a
// designer dialled in on purpose must never drift as a side effect of editing a neighbouring wall.
// `lockedEdges[i]` locks the wall from outline[i] to outline[(i+1)%n].

// The point on a circle nearest `target` — where a single locked wall pins its free endpoint.
function nearestPointOnCircle(center: Point, radius: number, target: Point): Point {
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-9) return { x: center.x + radius, y: center.y }; // target sits exactly on the centre — any direction is as good as another
  return { x: center.x + (dx / dist) * radius, y: center.y + (dy / dist) * radius };
}

// Standard two-circle intersection: 0 points when they don't reach each other or one sits wholly
// inside the other, 1 when they're exactly tangent, 2 otherwise.
export function circleIntersections(c0: Point, r0: number, c1: Point, r1: number): Point[] {
  const dx = c1.x - c0.x;
  const dy = c1.y - c0.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9 || d > r0 + r1 || d < Math.abs(r0 - r1)) return [];
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h2 = r0 * r0 - a * a;
  const h = h2 > 0 ? Math.sqrt(h2) : 0;
  const mx = c0.x + (a * dx) / d;
  const my = c0.y + (a * dy) / d;
  const rx = -dy * (h / d);
  const ry = dx * (h / d);
  if (h < 1e-9) return [{ x: mx, y: my }];
  return [{ x: mx + rx, y: my + ry }, { x: mx - rx, y: my - ry }];
}

// Clamps a proposed new position for outline vertex `idx` so every locked wall touching it keeps
// its original length. An unlocked neighbour imposes no constraint at all. A vertex pinned between
// two locked walls has to land on one of their (up to two) intersection points — whichever sits
// closer to what was actually asked for — or, if the two locked lengths can no longer meet at all,
// stays exactly where it already was rather than jumping somewhere the drag never suggested.
export function constrainVertexToLocks(outline: Point[], idx: number, proposed: Point, lockedEdges: boolean[]): Point {
  const n = outline.length;
  const prevIdx = (idx - 1 + n) % n;
  const prevLocked = !!lockedEdges[prevIdx];
  const nextLocked = !!lockedEdges[idx];
  if (!prevLocked && !nextLocked) return proposed;
  const prev = outline[prevIdx];
  const next = outline[(idx + 1) % n];
  if (prevLocked && nextLocked) {
    const options = circleIntersections(prev, wallLengthMm(prev, outline[idx]), next, wallLengthMm(outline[idx], next));
    if (options.length === 0) return outline[idx];
    let best = options[0];
    let bestD = Infinity;
    for (const o of options) {
      const d = wallLengthMm(o, proposed);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }
  if (prevLocked) return nearestPointOnCircle(prev, wallLengthMm(prev, outline[idx]), proposed);
  return nearestPointOnCircle(next, wallLengthMm(outline[idx], next), proposed);
}

// --- Rotation (stage/bar resize+rotate handles) ---
export function toLocalFrame(p: Point, center: Point, rotationDeg: number): Point {
  const rad = (-rotationDeg * Math.PI) / 180;
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { x: dx * Math.cos(rad) - dy * Math.sin(rad), y: dx * Math.sin(rad) + dy * Math.cos(rad) };
}
export function fromLocalFrame(p: Point, center: Point, rotationDeg: number): Point {
  const rad = (rotationDeg * Math.PI) / 180;
  return {
    x: center.x + p.x * Math.cos(rad) - p.y * Math.sin(rad),
    y: center.y + p.x * Math.sin(rad) + p.y * Math.cos(rad),
  };
}

/** The axis-aligned box a w×d rectangle needs once it has been TURNED — what a snap, a marquee and
 *  the no-overlap rule (lib/studio/collide.ts) all measure a placed item by.
 *
 *  A 4×2 deck turned 90° occupies 2×4 of floor, and boxing it as 4×2 anyway is not a rounding error:
 *  it is the plan claiming two metres of room that the deck is not in, and two more that it is.
 *  At a right angle this is exact, which covers nearly every stage anyone lays. At 45° it is the
 *  enclosing box and therefore generous — the deck is somewhere inside it. Right for a marquee and
 *  for the room's own snap lines; wrong for whether two things TOUCH — by this box two 30° decks
 *  stopped 232mm apart — so the studio carries the true shape beside it (SnapBox.shape), and the
 *  no-overlap rule (lib/studio/collide.ts) and the snap between two things at one angle
 *  (lib/studio/snap.ts snapTurned) read that instead. */
export function rotatedExtent(widthMm: number, depthMm: number, rotationDeg: number): { widthMm: number; depthMm: number } {
  if (!rotationDeg) return { widthMm, depthMm };
  const rad = (rotationDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return { widthMm: widthMm * c + depthMm * s, depthMm: widthMm * s + depthMm * c };
}

// Dragging a fixture's edge handle anchors the *opposite* edge (Figma/SketchUp/any floor planner):
// only the grabbed edge follows the pointer. A fixture is stored as centre+size, so holding the far
// edge still means moving the centre by half the size delta — along the fixture's own axis, not the
// world's, hence the round-trip through toLocalFrame/fromLocalFrame at its current rotation.
// `axis` picks width (local x) or depth (local y); `sign` says which of the two opposing edges was
// grabbed (+1 = the one on the +axis side). The anchor holds even when the size hits minMm.
export function resizeFromEdge(
  fixture: { x: number; y: number; widthMm: number; depthMm: number; rotationDeg?: number },
  axis: "width" | "depth",
  sign: 1 | -1,
  pointer: Point,
  minMm: number,
): { sizeMm: number; center: Point } {
  const center = { x: fixture.x, y: fixture.y };
  const rot = fixture.rotationDeg ?? 0;
  const local = toLocalFrame(pointer, center, rot);
  const size = axis === "width" ? fixture.widthMm : fixture.depthMm;
  const reach = axis === "width" ? local.x : local.y; // pointer distance from the centre, signed, in the fixture's frame
  const sizeMm = Math.max(minMm, Math.round(size / 2 + sign * reach));
  const shift = (sign * (sizeMm - size)) / 2;
  const moved = fromLocalFrame(axis === "width" ? { x: shift, y: 0 } : { x: 0, y: shift }, center, rot);
  return { sizeMm, center: { x: Math.round(moved.x), y: Math.round(moved.y) } };
}

export function tableAreaMm2(t: DesignTable): number {
  if (t.diameterMm) return Math.PI * (t.diameterMm / 2) ** 2;
  if (t.widthMm && t.depthMm) return t.widthMm * t.depthMm;
  return 0;
}

// Axis-aligned bounds of a table in document units (rotation ignored for hit-testing).
export function tableBounds(t: DesignTable): { halfW: number; halfH: number } {
  if (t.diameterMm) return { halfW: t.diameterMm / 2, halfH: t.diameterMm / 2 };
  return { halfW: (t.widthMm ?? 0) / 2, halfH: (t.depthMm ?? 0) / 2 };
}

export function pointInTable(t: DesignTable, x: number, y: number): boolean {
  const dx = x - t.position.x;
  const dy = y - t.position.y;
  // A round table has no orientation, so its own frame is the world's and the cheap test is exact.
  if (t.diameterMm) return dx * dx + dy * dy <= (t.diameterMm / 2) ** 2;
  const { halfW, halfH } = tableBounds(t);
  // A RECTANGULAR one is tested in its OWN frame. This used to compare against the world axes,
  // which was exactly right for as long as nothing in the app could turn a table — DesignTable
  // carried a `rotation` that no control ever set. Now that a table can be set across the room, an
  // axis-aligned test on a turned one both misses the corners it does cover and claims corners it
  // does not: the cloth dropped on the end of a 3m banqueting table at 45° would land on the floor.
  const local = t.rotation ? toLocalFrame({ x, y }, t.position, t.rotation) : { x: dx, y: dy };
  return Math.abs(local.x) <= halfW && Math.abs(local.y) <= halfH;
}

export function tableAt(doc: DesignDocumentContent, x: number, y: number): DesignTable | undefined {
  // Topmost first so later-drawn tables win.
  for (let i = doc.tables.length - 1; i >= 0; i--) if (pointInTable(doc.tables[i], x, y)) return doc.tables[i];
  return undefined;
}
