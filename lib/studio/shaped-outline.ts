// CURVES AND CORNERS ON ANY HAND-DRAWN OUTLINE (2026-11-07, the user: "curve edges any shape — like
// pool, and more"; spec docs/superpowers/specs/2026-11-07-venue-heights-rails-and-covers-design.md §4).
//
// An outline a designer draws by hand — a pool, a free surface, a building, a traced zone — is its
// POINTS, a bow per side and a radius per corner, and nothing else is stored:
//
//   - a side's bow is the wall's own (EdgeCurve, lib/studio/hall.ts — a cubic whose control points
//     are offsets from the side's ends), one depth along the side's normal, dragged on the diamond
//     at its middle or typed in cm — what the walls and the catalog's shape editor already do;
//   - a corner's radius is a measurement in mm, like the rug's and the stage's (a radius stays R30
//     when the shape is stretched), aligned by index to the outline's points.
//
// Everything else is derived here. `shapedOutline` turns the radii into geometry — each rounded
// corner replaced by the two points where its arc leaves the sides and ONE cubic edge between them —
// so every reader that already honours `edgeCurves` (the canvas, the printed map, sampledBounds, the
// 3D extrude) draws a rounded corner without knowing what one is. `flattenOutline` is the POLYGON
// every geometric reader walks (areas, point-in-polygon, hulls, clearance, a zone's boundary).
//
// Two rules, both load-bearing:
//
//   1. A BOWED SIDE KEEPS ITS BOW between its tangent points. The run left between two rounded
//      corners is the side's own cubic cut at the two points (de Casteljau), never a new bow laid
//      over a shorter chord — so the curve a designer bowed is the curve drawn, only shortened.
//   2. A RADIUS IS HELD TO WHAT THE SIDES CAN TAKE: the arc's tangent distance (R / tan(θ/2), the
//      radius itself at a right angle) to half the shorter of the corner's two sides — the rug's
//      fitCorners rule generalised to any angle (lib/studio/rug-shape.ts, which is left alone: it is
//      a rectangle's special case and works). Two radii meeting on a side leave no run between them
//      (a half-round end) and the zero-length edge is dropped.
//
// A corner at either end of a SEAM — a straight edge walked once each way, the keyhole of a closed
// band (lib/studio/footprint.ts buildHollow) — is never rounded: rounding it would part the two
// copies of the seam and open the keyhole. A spike (the sides almost doubling back) and a straight
// run (the sides almost in line) take no arc either.
//
// The editing helpers at the bottom act on an `OutlineShape` (points + bows + radii, in whatever
// frame the caller holds them) and keep the three aligned through an insert or a removal — what
// /halls' RegionOutlineEditor drives (components/venue-plan.tsx).
//
// Pure; self-checked: npm run check:shaped-outline.
import type { EdgeCurve, Point } from "./hall";
import { bulgeToCurve, maxBulgeDepthMm } from "./geometry";
import { isMain } from "../self-check";

/** Radius per vertex, mm, aligned to the outline; null (or under the noise) = a square corner. */
export type CornerRadii = (number | null)[];

/** A hand-drawn outline with its bows and radii — the three things stored. */
export interface OutlineShape {
  outline: Point[];
  edgeCurves?: (EdgeCurve | null)[];
  corners?: CornerRadii;
}

/** A radius under this is a slip of the hand, not a rounded corner (the rug's own noise). */
export const CORNER_NOISE_MM = 5;
/** Under this many degrees between the two sides a corner is a spike — no circle fits it. */
const SPIKE_DEG = 2;
/** Within this many degrees of a straight line there is no corner to round. */
const STRAIGHT_DEG = 1;
/** The default chord tolerance a flattened outline is held to: 5mm off the true curve. */
export const FLATTEN_TOL_MM = 5;

// ── vectors and cubics ─────────────────────────────────────────────────────────────────────────

type Cubic = [Point, Point, Point, Point];
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
const len = (a: Point): number => Math.hypot(a.x, a.y);
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const unit = (a: Point): Point => {
  const l = len(a);
  return l > 1e-12 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};

/** One side as drawn: a straight segment, or a cubic through absolute control points. */
interface Seg {
  a: Point;
  b: Point;
  c?: [Point, Point];
}

function segOf(a: Point, b: Point, curve: EdgeCurve | null | undefined): Seg {
  return curve ? { a, b, c: [add(a, curve.c1), add(b, curve.c2)] } : { a, b };
}
const cubicOf = (s: Seg): Cubic | null => (s.c ? [s.a, s.c[0], s.c[1], s.b] : null);

function bezAt(c: Cubic, t: number): Point {
  const u = 1 - t;
  const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
  return { x: w0 * c[0].x + w1 * c[1].x + w2 * c[2].x + w3 * c[3].x, y: w0 * c[0].y + w1 * c[1].y + w2 * c[2].y + w3 * c[3].y };
}
function bezDeriv(c: Cubic, t: number): Point {
  const u = 1 - t;
  return add(add(mul(sub(c[1], c[0]), 3 * u * u), mul(sub(c[2], c[1]), 6 * u * t)), mul(sub(c[3], c[2]), 3 * t * t));
}
/** De Casteljau: the cubic cut at `t` into its two halves. */
function bezSplit(c: Cubic, t: number): [Cubic, Cubic] {
  const p01 = lerp(c[0], c[1], t), p12 = lerp(c[1], c[2], t), p23 = lerp(c[2], c[3], t);
  const p012 = lerp(p01, p12, t), p123 = lerp(p12, p23, t);
  const m = lerp(p012, p123, t);
  return [[c[0], p01, p012, m], [m, p123, p23, c[3]]];
}
/** The stretch of a cubic between parameters t0 ≤ t1, as one cubic. */
function bezWindow(c: Cubic, t0: number, t1: number): Cubic {
  const right = t0 > 0 ? bezSplit(c, t0)[1] : c;
  const t = t0 >= 1 ? 0 : (t1 - t0) / (1 - t0);
  return t >= 1 ? right : bezSplit(right, Math.max(0, t))[0];
}

function segPoint(s: Seg, t: number): Point {
  const c = cubicOf(s);
  return c ? bezAt(c, t) : lerp(s.a, s.b, t);
}

/** The FORWARD direction of a side at `t` — a cubic whose handle sits on its end point (zero
 *  derivative there) answers with the direction toward the next control point that is not. */
function segDir(s: Seg, t: number): Point {
  const c = cubicOf(s);
  if (!c) return unit(sub(s.b, s.a));
  const d = bezDeriv(c, t);
  if (len(d) > 1e-6) return unit(d);
  if (t <= 0.5) return unit(len(sub(c[2], c[0])) > 1e-6 ? sub(c[2], c[0]) : sub(c[3], c[0]));
  return unit(len(sub(c[3], c[1])) > 1e-6 ? sub(c[3], c[1]) : sub(c[3], c[0]));
}

const SAMPLES = 64;
/** Arc length at SAMPLES + 1 evenly spaced parameters. */
function lengthTable(s: Seg): number[] {
  const out = [0];
  let prev = s.a;
  for (let k = 1; k <= SAMPLES; k++) {
    const q = segPoint(s, k / SAMPLES);
    out.push(out[k - 1] + dist(prev, q));
    prev = q;
  }
  return out;
}
function segLength(s: Seg): number {
  return s.c ? lengthTable(s)[SAMPLES] : dist(s.a, s.b);
}
/** The parameter at arc length `l` from the side's start. */
function paramAt(s: Seg, table: number[] | null, l: number): number {
  if (!s.c || !table) {
    const L = dist(s.a, s.b);
    return L > 0 ? Math.max(0, Math.min(1, l / L)) : 0;
  }
  const total = table[SAMPLES];
  if (l <= 0 || !(total > 0)) return 0;
  if (l >= total) return 1;
  let k = 0;
  while (k < SAMPLES - 1 && table[k + 1] < l) k++;
  const span = table[k + 1] - table[k];
  return (k + (span > 0 ? (l - table[k]) / span : 0)) / SAMPLES;
}
/** A side between its parameters t0 ≤ t1, its curve as offsets from its new ends (EdgeCurve). */
function cutSeg(s: Seg, t0: number, t1: number): { a: Point; b: Point; curve: EdgeCurve | null } {
  const c = cubicOf(s);
  if (!c) return { a: segPoint(s, t0), b: segPoint(s, t1), curve: null };
  const w = bezWindow(c, t0, t1);
  return { a: w[0], b: w[3], curve: { c1: sub(w[1], w[0]), c2: sub(w[2], w[3]) } };
}

/** Straight edges walked once each way — where a closed band's keyhole meets itself (the rule
 *  outlineStrokeD in ./geometry draws by). */
function seamEdges(outline: readonly Point[], edgeCurves?: readonly (EdgeCurve | null)[]): Set<number> {
  const n = outline.length;
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
  return seam;
}

/** Whether any corner asks to be rounded. */
export function hasCorners(corners: readonly (number | null)[] | undefined): boolean {
  return !!corners?.some((r) => (r ?? 0) >= CORNER_NOISE_MM);
}

/** One corner as the sides meet there: the two unit directions leaving the vertex along its sides
 *  (back along the side arriving, on along the side leaving), the angle θ between them, and the
 *  bisector of that angle — where a fillet's circle has its centre, INSIDE a convex corner and out
 *  in the notch of a concave one. */
interface CornerFrame {
  v: Point;
  uIn: Point;
  uOut: Point;
  theta: number;
  bisector: Point;
  /** Arc lengths of the side arriving and the side leaving. */
  lenIn: number;
  lenOut: number;
  /** False for a spike, a straight run, a seam's end or a side of no length: nothing to round. */
  roundable: boolean;
}

function cornerFrames(outline: readonly Point[], edgeCurves?: readonly (EdgeCurve | null)[]): CornerFrame[] {
  const n = outline.length;
  const segs = outline.map((a, i) => segOf(a, outline[(i + 1) % n], edgeCurves?.[i]));
  const lens = segs.map(segLength);
  const seam = seamEdges(outline, edgeCurves);
  // A straight-through vertex has no angle to bisect: the polygon's inside is the side to point to.
  const area = signedArea(outline);
  return outline.map((v, k) => {
    const prev = (k - 1 + n) % n;
    const uIn = mul(segDir(segs[prev], 1), -1);
    const uOut = segDir(segs[k], 0);
    const cos = Math.max(-1, Math.min(1, dot(uIn, uOut)));
    const theta = Math.acos(cos);
    let bisector = unit(add(uIn, uOut));
    if (len(bisector) < 0.5) {
      const left = { x: -uOut.y, y: uOut.x };
      bisector = area >= 0 ? left : mul(left, -1);
    }
    const deg = (theta * 180) / Math.PI;
    const roundable =
      n >= 3 && lens[prev] >= 1 && lens[k] >= 1 && !seam.has(prev) && !seam.has(k) && deg >= SPIKE_DEG && deg <= 180 - STRAIGHT_DEG;
    return { v, uIn, uOut, theta, bisector, lenIn: lens[prev], lenOut: lens[k], roundable };
  });
}

/** The arc's TANGENT distance each corner is drawn at — R / tan(θ/2), held to half the shorter of
 *  its two sides — and the radius that is (the stored one, or less where it was held). */
export function fitCornerRadii(
  outline: readonly Point[],
  edgeCurves: readonly (EdgeCurve | null)[] | undefined,
  corners: readonly (number | null)[] | undefined,
): { tangentMm: number[]; radiusMm: number[] } {
  const frames = cornerFrames(outline, edgeCurves);
  const tangentMm: number[] = [];
  const radiusMm: number[] = [];
  frames.forEach((f, k) => {
    const R = corners?.[k] ?? 0;
    if (!f.roundable || !(R >= CORNER_NOISE_MM)) {
      tangentMm.push(0);
      radiusMm.push(0);
      return;
    }
    const tan = Math.tan(f.theta / 2);
    const d = Math.min(R / tan, f.lenIn / 2, f.lenOut / 2);
    tangentMm.push(d);
    radiusMm.push(d * tan);
  });
  return { tangentMm, radiusMm };
}

/** The handle length of a cubic standing in for a circular arc of `sweep` radians across `chord` mm
 *  — (4/3)·tan(sweep/4)·R, which is κ·R (0.5523) at a right angle; a third of the chord as the arc
 *  goes straight. */
function arcHandle(sweep: number, chord: number): number {
  if (sweep < 1e-4) return chord / 3;
  const R = chord / (2 * Math.sin(sweep / 2));
  return (4 / 3) * Math.tan(sweep / 4) * R;
}

/** The outline with its rounded corners made geometry: each one replaced by the two points where
 *  its arc leaves the sides and one cubic edge between them, the sides' bows kept between those
 *  points (cut by de Casteljau). No radius asks for anything: the outline and curves handed in,
 *  untouched — so a shape nobody rounded is exactly what it always was. */
export function shapedOutline(
  outline: Point[],
  edgeCurves?: (EdgeCurve | null)[],
  corners?: readonly (number | null)[],
): { outline: Point[]; edgeCurves?: (EdgeCurve | null)[] } {
  const n = outline.length;
  if (n < 3 || !hasCorners(corners)) return edgeCurves ? { outline, edgeCurves } : { outline };
  const { tangentMm: d } = fitCornerRadii(outline, edgeCurves, corners);
  if (!d.some((x) => x > 0.5)) return edgeCurves ? { outline, edgeCurves } : { outline };
  const segs = outline.map((a, i) => segOf(a, outline[(i + 1) % n], edgeCurves?.[i]));
  // Each side's run between the two corners' arcs.
  const runs = segs.map((s, i) => {
    const table = s.c ? lengthTable(s) : null;
    const L = table ? table[SAMPLES] : dist(s.a, s.b);
    const t0 = d[i] > 0.5 ? paramAt(s, table, d[i]) : 0;
    const t1 = d[(i + 1) % n] > 0.5 ? paramAt(s, table, L - d[(i + 1) % n]) : 1;
    return { ...cutSeg(s, t0, Math.max(t0, t1)), dirA: segDir(s, t0), dirB: segDir(s, Math.max(t0, t1)) };
  });
  const out: Point[] = [];
  const curves: (EdgeCurve | null)[] = [];
  for (let k = 0; k < n; k++) {
    const run = runs[k];
    if (d[k] > 0.5) {
      const before = runs[(k - 1 + n) % n];
      const A = before.b;
      const B = run.a;
      // The tangents where the arc meets the sides: forward along the side arriving, forward along
      // the side leaving — so the arc joins both smoothly whatever their bows.
      const tA = before.dirB;
      const tB = run.dirA;
      const sweep = Math.acos(Math.max(-1, Math.min(1, dot(tA, tB))));
      const h = arcHandle(sweep, dist(A, B));
      out.push(A);
      curves.push({ c1: mul(tA, h), c2: mul(tB, -h) });
    }
    out.push(run.a);
    curves.push(run.curve);
  }
  // Two arcs that meet (a half-round end) leave a run of nothing between them: that edge goes with
  // the point it starts at. The point it ends at stands in the same place, so the arc arriving at the
  // one arrives at the other — its c2 is an offset from its end, and the end did not move.
  for (let k = out.length - 1; k >= 0 && out.length > 3; k--) {
    if (dist(out[k], out[(k + 1) % out.length]) < 0.5) {
      out.splice(k, 1);
      curves.splice(k, 1);
    }
  }
  return { outline: out, edgeCurves: curves };
}

/** How many straight pieces a cubic needs to stay within `tol` of itself: the chord of a parameter
 *  step h strays at most (h²/8)·max|B''|, and |B''| ≤ 6·max of the control polygon's second
 *  differences. */
function stepsFor(c: Cubic, tol: number): number {
  const d1 = len(add(sub(c[0], mul(c[1], 2)), c[2]));
  const d2 = len(add(sub(c[1], mul(c[2], 2)), c[3]));
  const M = Math.max(d1, d2);
  return Math.max(2, Math.min(256, Math.ceil(Math.sqrt((3 * M) / (4 * Math.max(0.01, tol))))));
}

/** The POLYGON an outline is, curves cut into chords no further than `tolMm` from the true line —
 *  what every reader that walks straight sides walks (areas, hulls, point-in-polygon, clearance, a
 *  zone's boundary). No closing point repeated. Rounded corners are applied first when given. */
export function flattenOutline(
  outline: readonly Point[],
  edgeCurves?: readonly (EdgeCurve | null)[],
  tolMm = FLATTEN_TOL_MM,
  corners?: readonly (number | null)[],
): Point[] {
  if (hasCorners(corners)) {
    const s = shapedOutline([...outline], edgeCurves ? [...edgeCurves] : undefined, corners);
    return flattenOutline(s.outline, s.edgeCurves, tolMm);
  }
  const n = outline.length;
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    pts.push(a);
    const curve = edgeCurves?.[i];
    if (!curve) continue;
    const c = cubicOf(segOf(a, outline[(i + 1) % n], curve))!;
    const steps = stepsFor(c, tolMm);
    for (let k = 1; k < steps; k++) pts.push(bezAt(c, k / steps));
  }
  return pts;
}

/** Shoelace over the points alone — the sign says which way round the outline goes. */
function signedArea(outline: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** The TRUE area inside an outline whose sides may be cubics (Green's theorem, each side's
 *  ∫ x dy − y dx by three-point Gauss — exact, the integrand being a quintic). Rounded corners are
 *  applied first when given. */
export function outlineAreaMm2(outline: readonly Point[], edgeCurves?: readonly (EdgeCurve | null)[], corners?: readonly (number | null)[]): number {
  if (hasCorners(corners)) {
    const s = shapedOutline([...outline], edgeCurves ? [...edgeCurves] : undefined, corners);
    return outlineAreaMm2(s.outline, s.edgeCurves);
  }
  const n = outline.length;
  const G = [
    { t: 0.5 - Math.sqrt(15) / 10, w: 5 / 18 },
    { t: 0.5, w: 8 / 18 },
    { t: 0.5 + Math.sqrt(15) / 10, w: 5 / 18 },
  ];
  let twice = 0;
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const curve = edgeCurves?.[i];
    if (!curve) {
      twice += a.x * b.y - b.x * a.y;
      continue;
    }
    const c = cubicOf(segOf(a, b, curve))!;
    for (const { t, w } of G) {
      const p = bezAt(c, t);
      const q = bezDeriv(c, t);
      twice += w * (p.x * q.y - p.y * q.x);
    }
  }
  return Math.abs(twice) / 2;
}

// ── editing ────────────────────────────────────────────────────────────────────────────────────
//
// What /halls' RegionOutlineEditor does to an outline: move a point, add one on a side, take one
// away, bow a side, round a corner — the bows and the radii kept on the sides and corners they
// belong to through every one of them.

/** `edgeCurves` and `corners` padded (or cut) to the outline's length. */
function aligned<T>(arr: readonly (T | null)[] | undefined, n: number): (T | null)[] {
  return Array.from({ length: n }, (_, i) => arr?.[i] ?? null);
}

/** The shape as it should be STORED: arrays only when something in them is set, radii whole mm
 *  and none under the noise — so a shape nobody bowed or rounded carries neither field. */
export function cleanShape(s: OutlineShape): OutlineShape {
  const n = s.outline.length;
  const curves = aligned(s.edgeCurves, n);
  const radii = aligned(s.corners, n).map((r) => (r !== null && Number.isFinite(r) && r >= CORNER_NOISE_MM ? Math.round(r) : null));
  return {
    outline: s.outline,
    ...(curves.some(Boolean) ? { edgeCurves: curves } : {}),
    ...(radii.some((r) => r !== null) ? { corners: radii } : {}),
  };
}

/** Point `i` moved to `to` (whole mm). Its sides' bows ride with it — their control points are
 *  offsets from the ends. */
export function moveShapePoint(s: OutlineShape, i: number, to: Point): OutlineShape {
  return { ...s, outline: s.outline.map((p, k) => (k === i ? { x: Math.round(to.x), y: Math.round(to.y) } : p)) };
}

/** A new point on side `edge` at parameter `t` (the middle by default) — ON the side as it is
 *  drawn, a bowed one cut in two by de Casteljau so both halves keep the curve. A square corner.
 *  Returned with the new point's index, which a drag then moves. */
export function insertShapePoint(s: OutlineShape, edge: number, t = 0.5): { shape: OutlineShape; index: number } {
  const n = s.outline.length;
  const curves = aligned(s.edgeCurves, n);
  const radii = aligned(s.corners, n);
  const a = s.outline[edge];
  const b = s.outline[(edge + 1) % n];
  const seg = segOf(a, b, curves[edge]);
  const tt = Math.max(0.01, Math.min(0.99, t));
  const p = segPoint(seg, tt);
  const at = { x: Math.round(p.x), y: Math.round(p.y) };
  let left: EdgeCurve | null = null;
  let right: EdgeCurve | null = null;
  const c = cubicOf(seg);
  if (c) {
    const [l, r] = bezSplit(c, tt);
    left = { c1: sub(l[1], l[0]), c2: sub(l[2], at) };
    right = { c1: sub(r[1], at), c2: sub(r[2], r[3]) };
  }
  const outline = [...s.outline.slice(0, edge + 1), at, ...s.outline.slice(edge + 1)];
  const edgeCurves = [...curves.slice(0, edge), left, right, ...curves.slice(edge + 1)];
  const corners = [...radii.slice(0, edge + 1), null, ...radii.slice(edge + 1)];
  return { shape: cleanShape({ outline, edgeCurves, corners }), index: edge + 1 };
}

/** Point `i` taken away — unless that leaves fewer than three. The two sides that met there become
 *  one. Straight if both were; otherwise bowed through the point of the old two that stood furthest
 *  off the new side — so a point added on a bowed side and taken off again gives the bow back, and a
 *  point taken off a curve leaves a curve, not a chord. */
export function removeShapePoint(s: OutlineShape, i: number): OutlineShape {
  const n = s.outline.length;
  if (n <= 3) return s;
  const curves = aligned(s.edgeCurves, n);
  const radii = aligned(s.corners, n);
  const prev = (i - 1 + n) % n;
  const outline = s.outline.filter((_, k) => k !== i);
  const edgeCurves = curves.filter((_, k) => k !== i);
  const corners = radii.filter((_, k) => k !== i);
  const merged = i === 0 ? edgeCurves.length - 1 : prev;
  edgeCurves[merged] = null;
  const next = cleanShape({ outline, edgeCurves, corners });
  if (!curves[prev] && !curves[i]) return next;
  const A = s.outline[prev];
  const nrm = outwardNormal(outline, merged);
  let bow = 0;
  for (const k of [prev, i]) {
    const seg = segOf(s.outline[k], s.outline[(k + 1) % n], curves[k]);
    for (let j = 0; j <= 32; j++) {
      const off = dot(sub(segPoint(seg, j / 32), A), nrm);
      if (Math.abs(off) > Math.abs(bow)) bow = off;
    }
  }
  return Math.abs(bow) >= 1 ? bowShapeSide(next, merged, bow) : next;
}

/** Unit normal of side `i`, pointing OUT of the outline (by the way round its points go). */
function outwardNormal(outline: readonly Point[], i: number): Point {
  const a = outline[i];
  const b = outline[(i + 1) % outline.length];
  const u = unit(sub(b, a));
  const right = { x: u.y, y: -u.x };
  return signedArea(outline) >= 0 ? right : mul(right, -1);
}

/** Side `i`'s bow as drawn, mm along its outward normal: + out of the shape, − into it, 0 straight. */
export function sideBowMm(s: OutlineShape, i: number): number {
  const n = s.outline.length;
  const curve = s.edgeCurves?.[i];
  if (!curve || n < 3) return 0;
  const a = s.outline[i];
  const b = s.outline[(i + 1) % n];
  const mid = segPoint(segOf(a, b, curve), 0.5);
  return dot(sub(mid, lerp(a, b, 0.5)), outwardNormal(s.outline, i));
}

/** The most a side may bow either way — the wall's own ceiling (./geometry maxBulgeDepthMm). */
export function maxSideBowMm(s: OutlineShape, i: number): number {
  const a = s.outline[i];
  const b = s.outline[(i + 1) % s.outline.length];
  return maxBulgeDepthMm(dist(a, b));
}

/** Side `i` bowed `depthMm` along its outward normal (− = in), symmetric through its middle — the
 *  wall's bow (bulgeToCurve). Under a millimetre straightens it. */
export function bowShapeSide(s: OutlineShape, i: number, depthMm: number): OutlineShape {
  const n = s.outline.length;
  const curves = aligned(s.edgeCurves, n);
  const a = s.outline[i];
  const b = s.outline[(i + 1) % n];
  const max = maxBulgeDepthMm(dist(a, b));
  const depth = Math.max(-max, Math.min(max, depthMm));
  curves[i] = Math.abs(depth) < 1 ? null : bulgeToCurve(a, b, add(lerp(a, b, 0.5), mul(outwardNormal(s.outline, i), depth)));
  return cleanShape({ ...s, edgeCurves: curves });
}

/** How far out of the shape a pointer at `p` is from side `i`'s chord middle — what dragging the
 *  bow diamond asks for (only the push along the normal counts, so a sloppy drag cannot shear). */
export function bowAtPoint(s: OutlineShape, i: number, p: Point): number {
  const a = s.outline[i];
  const b = s.outline[(i + 1) % s.outline.length];
  return dot(sub(p, lerp(a, b, 0.5)), outwardNormal(s.outline, i));
}

/** Corner `i` rounded at `mm` (0 squares it), or every corner when `i` is "all". */
export function roundShapeCorner(s: OutlineShape, i: number | "all", mm: number): OutlineShape {
  const n = s.outline.length;
  const radii = aligned(s.corners, n).map((r, k) => (i === "all" || k === i ? mm : r));
  return cleanShape({ ...s, corners: radii });
}

/** "החלקה": every corner's radius a third of its shorter side — a kidney out of four points, in one
 *  click. Corners that take no arc (a spike, a straight run) stay square. */
export function smoothShape(s: OutlineShape): OutlineShape {
  const frames = cornerFrames(s.outline, s.edgeCurves);
  return cleanShape({ ...s, corners: frames.map((f) => (f.roundable ? Math.round(Math.min(f.lenIn, f.lenOut) / 3) : null)) });
}

/** The radius every rounded corner shares, or null when they differ (or none is rounded) — what
 *  "כל הפינות" shows. */
export function commonRadius(s: OutlineShape): number | null {
  const set = new Set(aligned(s.corners, s.outline.length).map((r) => r ?? 0));
  return set.size === 1 ? [...set][0] : null;
}

/** Where corner `i`'s radius grip stands: the middle of its arc, on the bisector of the corner,
 *  `insetMm` further along it (the canvas's standoff, clear of the point's own handle) — or null
 *  for a corner that takes no arc. `dir` is that bisector, into a convex corner, out into the notch
 *  of a concave one (where a fillet's circle has its centre). */
export function cornerGrip(s: OutlineShape, i: number, insetMm = 0): { at: Point; dir: Point } | null {
  const f = cornerFrames(s.outline, s.edgeCurves)[i];
  if (!f?.roundable) return null;
  const r = fitCornerRadii(s.outline, s.edgeCurves, s.corners).radiusMm[i];
  const k = 1 / Math.sin(f.theta / 2) - 1;
  return { at: add(f.v, mul(f.bisector, r * k + insetMm)), dir: f.bisector };
}

/** The radius a corner grip dragged to `p` asks for — how far along the corner's bisector it is,
 *  less the standoff, read back through the arc's geometry; held between square and the most the
 *  two sides take, in whole mm. */
export function cornerAtPoint(s: OutlineShape, i: number, p: Point, insetMm = 0): number {
  const f = cornerFrames(s.outline, s.edgeCurves)[i];
  if (!f?.roundable) return 0;
  const k = 1 / Math.sin(f.theta / 2) - 1;
  if (k < 1e-6) return 0;
  const along = dot(sub(p, f.v), f.bisector) - insetMm;
  const max = (Math.min(f.lenIn, f.lenOut) / 2) * Math.tan(f.theta / 2);
  return Math.round(Math.max(0, Math.min(max, along / k)));
}

/** The point on side `i` nearest `p`, as the side's parameter — where a press on a side adds its
 *  new point. */
export function nearestOnSide(s: OutlineShape, i: number, p: Point): number {
  const a = s.outline[i];
  const b = s.outline[(i + 1) % s.outline.length];
  const seg = segOf(a, b, s.edgeCurves?.[i]);
  if (!seg.c) {
    const d = sub(b, a);
    const L2 = dot(d, d);
    return L2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / L2)) : 0.5;
  }
  let best = 0.5;
  let bestD = Infinity;
  for (let k = 0; k <= SAMPLES; k++) {
    const d = dist(segPoint(seg, k / SAMPLES), p);
    if (d < bestD) [best, bestD] = [k / SAMPLES, d];
  }
  let lo = Math.max(0, best - 1 / SAMPLES);
  let hi = Math.min(1, best + 1 / SAMPLES);
  for (let k = 0; k < 30; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (dist(segPoint(seg, m1), p) < dist(segPoint(seg, m2), p)) hi = m2;
    else lo = m1;
  }
  return (lo + hi) / 2;
}

/** A shape whose points were rewritten by something that knows nothing of bows and radii (the
 *  zone's "tidy", lib/venues/region-edit.ts): each new point takes the radius of the old point
 *  nearest it, and a side keeps its bow only while it still runs between the same two old points —
 *  a side two old ones were merged into comes out straight. */
export function carryShape(before: OutlineShape, after: Point[]): OutlineShape {
  const n = before.outline.length;
  if (!before.edgeCurves?.some(Boolean) && !hasCorners(before.corners)) return { outline: after };
  if (after.length === n && after.every((p, i) => dist(p, before.outline[i]) < 1e-9)) return { ...before, outline: after };
  const from = after.map((p) => {
    let best = 0;
    let bestD = Infinity;
    before.outline.forEach((q, k) => {
      const d = dist(p, q);
      if (d < bestD) [best, bestD] = [k, d];
    });
    return best;
  });
  const m = after.length;
  return cleanShape({
    outline: after,
    edgeCurves: after.map((_, j) => (from[(j + 1) % m] === (from[j] + 1) % n ? before.edgeCurves?.[from[j]] ?? null : null)),
    corners: after.map((_, j) => before.corners?.[from[j]] ?? null),
  });
}

// ponytail: self-check. Run: npm run check:shaped-outline
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
  const rect = (w: number, d: number): Point[] => [
    { x: -w / 2, y: -d / 2 },
    { x: w / 2, y: -d / 2 },
    { x: w / 2, y: d / 2 },
    { x: -w / 2, y: d / 2 },
  ];
  const box = (pts: Point[]) => ({
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxY: Math.max(...pts.map((p) => p.y)),
  });

  // IDENTITY. No radius and no bow: the very arrays handed in, and a polygon of the points.
  const R4 = rect(12000, 6000);
  const plain = shapedOutline(R4, undefined, undefined);
  assert(plain.outline === R4 && plain.edgeCurves === undefined, "no corners + no curves is the outline itself");
  assert(shapedOutline(R4, undefined, [null, 2, 0, null]).outline === R4, "radii under the noise round nothing");
  assert(flattenOutline(R4).length === 4 && flattenOutline(R4).every((p, i) => p === R4[i]), "…and flattens to its four points");
  assert(near(outlineAreaMm2(R4), 72e6, 1e-3), "the true area of a plain rectangle is w × d");

  // A RIGHT ANGLE ROUNDED: R1000 on every corner of the 12 × 6 — eight points, four arcs, the box
  // unchanged, the arc's middle (√2−1)·R in from the corner on its diagonal, and the area the
  // rectangle's less (4 − π)·R².
  const rr = shapedOutline(R4, undefined, [1000, 1000, 1000, 1000]);
  assert(rr.outline.length === 8 && rr.edgeCurves!.filter(Boolean).length === 4, "four arcs between four straight runs");
  const flat = flattenOutline(rr.outline, rr.edgeCurves);
  const b = box(flat);
  assert(near(b.minX, -6000, 0.01) && near(b.maxX, 6000, 0.01) && near(b.minY, -3000, 0.01) && near(b.maxY, 3000, 0.01), "the rounded rectangle still fills its box");
  const trueRR = 72e6 - (4 - Math.PI) * 1e6;
  assert(near(outlineAreaMm2(R4, undefined, [1000, 1000, 1000, 1000]), trueRR, trueRR * 2e-4), "κ draws a quarter circle to a hair (area within 0.02%)");
  const g = cornerGrip({ outline: R4, corners: [1000, 1000, 1000, 1000] }, 0)!;
  assert(near(g.at.x, -6000 + 1000 * (Math.SQRT2 - 1) * Math.SQRT1_2, 0.01) && near(g.at.y, -3000 + 1000 * (Math.SQRT2 - 1) * Math.SQRT1_2, 0.01), `the grip rides the arc's middle (${g.at.x}, ${g.at.y})`);
  const offLine = (pts: Point[], q: Point) =>
    Math.min(
      ...pts.map((p, k) => {
        const r = pts[(k + 1) % pts.length];
        const d = sub(r, p);
        const t = Math.max(0, Math.min(1, dot(sub(q, p), d) / (dot(d, d) || 1)));
        return dist(add(p, mul(d, t)), q);
      }),
    );
  assert(offLine(flat, g.at) <= FLATTEN_TOL_MM + 0.5, `…which the flattened arc passes within its tolerance (${offLine(flat, g.at).toFixed(2)}mm off)`);
  const fine = flattenOutline(rr.outline, rr.edgeCurves, 0.5);
  assert(offLine(fine, g.at) < 1, `…and closer when asked to be (${offLine(fine, g.at).toFixed(2)}mm off at 0.5mm)`);
  assert(cornerAtPoint({ outline: R4, corners: [1000, 1000, 1000, 1000] }, 0, cornerGrip({ outline: R4, corners: [1000, 1000, 1000, 1000] }, 0, 140)!.at, 140) === 1000, "dragging the grip to where it stands gives the same radius");

  // CLAMPED: R5000 on a 6m side is held to half of it (3000) — two such corners make a half-round end
  // and the run between them goes.
  const fit = fitCornerRadii(R4, undefined, [5000, 0, 0, 5000]);
  assert(near(fit.radiusMm[0], 3000) && near(fit.radiusMm[3], 3000) && fit.radiusMm[1] === 0, `held to half the shorter side (${fit.radiusMm[0]})`);
  const half = shapedOutline(R4, undefined, [5000, 0, 0, 5000]);
  assert(half.outline.length === 5 && half.edgeCurves!.filter(Boolean).length === 2, `a half-round end: two arcs meeting, no run between (${half.outline.length})`);
  assert(cornerAtPoint({ outline: R4 }, 0, { x: 0, y: 0 }) === 3000, "a grip pulled far in asks no more than the sides take");
  // An acute corner: its tangent distance, not its radius, is what the sides must hold.
  const tri: Point[] = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 0, y: 1000 }];
  const triFit = fitCornerRadii(tri, undefined, [null, 800, null]);
  assert(triFit.tangentMm[1] <= Math.hypot(4000, 1000) / 2 + 1e-6 && triFit.radiusMm[1] < 800, `an acute corner's radius is held by its tangent distance (${triFit.radiusMm[1].toFixed(0)})`);

  // BOWED AND ROUNDED: the top of the 12 × 6 bowed out 1.2m, the bottom in 0.6m, every corner R900.
  // The run between two arcs is the side's own curve, shortened — every point of it on the bow.
  let shape: OutlineShape = { outline: R4 };
  shape = bowShapeSide(shape, 0, 1200);
  shape = bowShapeSide(shape, 2, -600);
  assert(near(sideBowMm(shape, 0), 1200, 0.5) && near(sideBowMm(shape, 2), -600, 0.5), "a side's bow reads back as typed, + out and − in");
  const topY = (p: Point) => p.y;
  assert(Math.min(...flattenOutline(shape.outline, shape.edgeCurves).map(topY)) < -4100, "+ is OUT of the shape (the top bows up)");
  shape = roundShapeCorner(shape, "all", 900);
  const bowed = shapedOutline(shape.outline, shape.edgeCurves, shape.corners);
  const topRun = bowed.edgeCurves!.findIndex((c, k) => c && bowed.outline[k].y < -3000 && bowed.outline[(k + 1) % bowed.outline.length].y < -3000 && Math.abs(bowed.outline[k].x - bowed.outline[(k + 1) % bowed.outline.length].x) > 6000);
  assert(topRun >= 0, "the bowed top survives as one run between its arcs");
  const original = cubicOf(segOf(shape.outline[0], shape.outline[1], shape.edgeCurves![0]))!;
  const run = cubicOf(segOf(bowed.outline[topRun], bowed.outline[(topRun + 1) % bowed.outline.length], bowed.edgeCurves![topRun]))!;
  const onOriginal = (p: Point) => {
    let best = Infinity;
    for (let k = 0; k <= 2000; k++) best = Math.min(best, dist(bezAt(original, k / 2000), p));
    return best;
  };
  assert([0.1, 0.3, 0.5, 0.7, 0.9].every((t) => onOriginal(bezAt(run, t)) < 2), "…cut out of the very curve that was bowed (de Casteljau, not a new bow)");
  const trueArea = outlineAreaMm2(bowed.outline, bowed.edgeCurves);
  const flatArea = Math.abs(signedArea(flattenOutline(bowed.outline, bowed.edgeCurves)));
  assert(Math.abs(flatArea - trueArea) / trueArea < 0.005, `a bowed-and-rounded 12×6 flattens within 0.5% of its true area (${(((flatArea - trueArea) / trueArea) * 100).toFixed(3)}%)`);
  // Smooth joins: at every arc's ends the direction matches the side it meets.
  for (let k = 0; k < bowed.outline.length; k++) {
    const m = bowed.outline.length;
    const here = segOf(bowed.outline[k], bowed.outline[(k + 1) % m], bowed.edgeCurves![k]);
    const next = segOf(bowed.outline[(k + 1) % m], bowed.outline[(k + 2) % m], bowed.edgeCurves![(k + 1) % m]);
    assert(dot(segDir(here, 1), segDir(next, 0)) > 0.999, `a rounded corner meets its sides smoothly (join ${k})`);
  }

  // THE KEYHOLE: a closed band is one outline whose seam is walked once each way; rounding every
  // corner leaves the four corners at the seam's ends square, so the two copies still coincide.
  const outer = rect(4000, 4000);
  const inner = rect(2000, 2000);
  const keyhole: Point[] = [outer[0], outer[1], outer[2], outer[3], outer[0], inner[0], inner[3], inner[2], inner[1], inner[0]];
  // (outer ring, down the seam, round the inner ring the other way, back up the seam)
  const kh = shapedOutline(keyhole, undefined, keyhole.map(() => 300));
  const seamPts = [outer[0], inner[0]];
  assert(seamPts.every((p) => kh.outline.filter((q) => dist(p, q) < 0.5).length === 2), "the keyhole's seam ends stay square — both copies of the seam still meet");
  assert(kh.edgeCurves!.filter(Boolean).length === 6, `…and the other six corners are rounded (${kh.edgeCurves!.filter(Boolean).length})`);

  // CONCAVE: the inner corner of an L is filled, its grip out in the notch.
  const L: Point[] = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 2000 }, { x: 2000, y: 2000 }, { x: 2000, y: 6000 }, { x: 0, y: 6000 }];
  const Lr = { outline: L, corners: [null, null, null, 500, null, null] };
  assert(outlineAreaMm2(L, undefined, Lr.corners) > outlineAreaMm2(L), "rounding a concave corner fills it");
  const lg = cornerGrip(Lr, 3)!;
  assert(lg.at.x > 2000 && lg.at.y > 2000, `…and its grip stands in the notch (${lg.at.x.toFixed(0)}, ${lg.at.y.toFixed(0)})`);

  // EDITING keeps bows and radii on their own sides and corners.
  const ed: OutlineShape = roundShapeCorner(bowShapeSide({ outline: R4 }, 1, 500), 2, 400);
  const ins = insertShapePoint(ed, 1, 0.5);
  assert(ins.index === 2 && ins.shape.outline.length === 5, "a point added on side 1 is point 2");
  assert(near(ins.shape.outline[2].x, 6500, 1) && near(ins.shape.outline[2].y, 0, 1), `…ON the bowed side, at its apex (${ins.shape.outline[2].x}, ${ins.shape.outline[2].y})`);
  assert(!!ins.shape.edgeCurves?.[1] && !!ins.shape.edgeCurves?.[2] && !ins.shape.edgeCurves?.[0] && !ins.shape.edgeCurves?.[3], "…both halves keep the bow, the other sides stay straight");
  assert(ins.shape.corners?.[3] === 400 && ins.shape.corners?.[2] === null, "…and the rounded corner moved up one index with its point");
  const halves = flattenOutline(ins.shape.outline, ins.shape.edgeCurves);
  const whole = flattenOutline(ed.outline, ed.edgeCurves);
  assert(near(Math.abs(signedArea(halves)), Math.abs(signedArea(whole)), Math.abs(signedArea(whole)) * 1e-3), "…and the shape drawn is the same shape");
  const back = removeShapePoint(ins.shape, 2);
  assert(back.outline.length === 4 && near(sideBowMm(back, 1), 500, 15) && back.corners?.[2] === 400, `taking it away again leaves side 1 bowed, corner 2 rounded (${sideBowMm(back, 1).toFixed(1)})`);
  assert(removeShapePoint({ outline: tri }, 0).outline.length === 3, "three points is the least a shape has");
  const sm = smoothShape({ outline: R4 });
  assert(sm.corners!.every((r) => r === 2000), "החלקה: every corner a third of its shorter side");
  assert(commonRadius(sm) === 2000 && commonRadius(roundShapeCorner(sm, 1, 300)) === null, "…which 'every corner' reads back, until one differs");
  assert(cleanShape(roundShapeCorner({ outline: R4 }, "all", 0)).corners === undefined, "squaring every corner stores no radii at all");
  assert(cleanShape(bowShapeSide({ outline: R4 }, 0, 0.4)).edgeCurves === undefined, "…and a bow under a millimetre stores no curve");
  const tidied = carryShape(ed, ed.outline.map((p) => ({ ...p })));
  assert(tidied.corners?.[2] === 400 && !!tidied.edgeCurves?.[1], "a tidy that moves nothing keeps every bow and radius");
  const merged = carryShape(ed, [R4[0], R4[1], R4[2]]);
  assert(merged.corners?.[2] === 400 && !!merged.edgeCurves?.[1] && !merged.edgeCurves?.[2], "…one that drops a point keeps what still stands where it was");
  const along = nearestOnSide(ed, 1, { x: 7000, y: 0 });
  assert(near(along, 0.5, 0.02), `a press beside a bowed side's apex finds its middle (${along.toFixed(3)})`);
  console.log("shaped-outline: ok");
}
