// A RUG WITH CURVED SIDES AND ROUNDED CORNERS — the shape canvas's "pull the middle of a side and it
// bows", and the stage's "פינות", on the plan.
//
// A rug is a stretch item: its size is a width × depth stored per placement (Placement.sizeMm), its
// corners are the handles. A bow is one more number per side — Placement.bows — stored as a FRACTION
// of the side's length, positive = out, so stretching the rug scales its curves with it and nothing
// has to be re-derived. A rounded corner is one more number per corner — Placement.corners — a
// RADIUS in mm, as the stage's rounded corners are (a radius is a measurement; "R30" stays R30 when
// the rug is stretched; 2026-10-31, the user: "round edges to a rug — an inner point that can be
// dragged in each corner, and edited in the inspector like the stage"). Everything else about the
// shape is derived here, as the same cubic edges the shape canvas and the venue walls use (EdgeCurve,
// lib/studio/geometry.ts bulgeToCurve): the outline, its flattened polygon (clearance, the tape, what
// stands on the rug), the handle at each side's middle and inside each corner, and the custom
// footprint the surface fill and the printed map draw.
//
// The rug is about its RECTANGLE's centre, always — `position` is that centre, so bowing one side
// never moves the other three. The custom footprint a bent rug draws as is recentred on its bounds
// by every drawing seam (FootprintShape, ItemSurface), so `centre` here is the shift they subtract:
// wrap the drawing in translate(centre) and it lands back where the rectangle was.
//
// Pure; self-checked: npm run check:rug-shape.
import type { Placement } from "@/lib/design-document/types";
import type { EdgeCurve, Point } from "./hall";
import { customShapeBounds, flattenEdge, type Footprint } from "./footprint";
import { bulgeToCurve, edgeMidpoint } from "./geometry";
import { isMain } from "../self-check";

/** Top, right, bottom, left — each side's bow as a fraction of its length; + is outward. */
export type RugBows = [number, number, number, number];
/** Top-left, top-right, bottom-right, bottom-left — each corner's radius, mm. Corner i is where
 *  side i−1 meets side i (the rectangle's corner i, sidesOf). */
export type RugCorners = [number, number, number, number];
/** What a rug's rectangle is bent into: its sides' bows, its corners' radii — either, both. The
 *  plain rectangle nobody bent is `undefined`, never an empty shape. */
export interface RugShape {
  bows?: RugBows;
  corners?: RugCorners;
}

/** A side may bow out by up to half its length — a half-round end — and in by as much. */
export const MAX_RUG_BOW = 0.5;
/** A bow under this is a slip of the hand, not a curve. */
const NOISE = 0.004;
/** A radius under this is a slip of the hand, not a rounded corner. */
const CORNER_NOISE_MM = 5;
/** The cubic that draws a quarter circle: its handles this fraction of the radius long. */
const KAPPA = 0.5522847498;
const DIAG = Math.SQRT2 - 1;

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** The bows a placement really has: clamped, rounded, and `undefined` when every side is straight —
 *  so a rug nobody curved is the plain rectangle it always was, and a stale value cannot haunt one. */
export function cleanBows(raw: readonly number[] | undefined): RugBows | undefined {
  if (!raw) return undefined;
  const out = [0, 1, 2, 3].map((i) => {
    const v = Number(raw[i]);
    return Number.isFinite(v) && Math.abs(v) >= NOISE ? round4(Math.max(-MAX_RUG_BOW, Math.min(MAX_RUG_BOW, v))) : 0;
  }) as RugBows;
  return out.some(Boolean) ? out : undefined;
}

/** The corners a placement really rounds: whole millimetres, nothing under the noise, and
 *  `undefined` when every corner is square. Held to the rug's size only when drawn (fitCorners) —
 *  a radius typed for a big rug stays typed when the rug is made small and big again. */
export function cleanCorners(raw: readonly number[] | undefined): RugCorners | undefined {
  if (!raw) return undefined;
  const out = [0, 1, 2, 3].map((i) => {
    const v = Number(raw[i]);
    return Number.isFinite(v) && v >= CORNER_NOISE_MM ? Math.round(v) : 0;
  }) as RugCorners;
  return out.some(Boolean) ? out : undefined;
}

export const bowsOf = (p: Pick<Placement, "bows">): RugBows | undefined => cleanBows(p.bows);
export const cornersOf = (p: Pick<Placement, "corners">): RugCorners | undefined => cleanCorners(p.corners);

/** The rug's shape — or `undefined` for the plain rectangle nobody bent. */
export function rugShapeOf(p: Pick<Placement, "bows" | "corners">): RugShape | undefined {
  const bows = cleanBows(p.bows);
  const corners = cleanCorners(p.corners);
  return bows || corners ? { ...(bows ? { bows } : {}), ...(corners ? { corners } : {}) } : undefined;
}

/** One side with `fraction` of its length bowed in or out: the other three stay. */
export function withBow(bows: RugBows | undefined, side: number, fraction: number): RugBows | undefined {
  const next: RugBows = bows ? [...bows] : [0, 0, 0, 0];
  next[side] = fraction;
  return cleanBows(next);
}

/** Corner `i` rounded at `mm` (the others stay) — or every corner, when `i` is "all". */
export function withCorner(corners: RugCorners | undefined, i: number | "all", mm: number): RugCorners | undefined {
  if (i === "all") return cleanCorners([mm, mm, mm, mm]);
  const next: RugCorners = corners ? [...corners] : [0, 0, 0, 0];
  next[i] = mm;
  return cleanCorners(next);
}

interface Side {
  a: Point;
  b: Point;
  /** Unit normal pointing out of the rectangle. */
  n: Point;
  len: number;
}

/** The four sides, clockwise on screen from the top — edge i runs from corner i to corner i+1, the
 *  same indexing as EdgeCurve. */
function sidesOf(w: number, d: number): Side[] {
  const hw = w / 2;
  const hd = d / 2;
  const c: Point[] = [{ x: -hw, y: -hd }, { x: hw, y: -hd }, { x: hw, y: hd }, { x: -hw, y: hd }];
  return c.map((a, i) => {
    const b = c[(i + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return { a, b, len, n: { x: (b.y - a.y) / len, y: -(b.x - a.x) / len } };
  });
}

/** The unit diagonal INTO the rug from corner i. */
const INWARD: Point[] = [
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
];

/** The corners' radii as DRAWN on a rug this size: each held to half the shorter side, and the two
 *  on one side to that side's length between them (two R60s on a 1m end make a half-round end). */
export function fitCorners(widthMm: number, depthMm: number, corners: RugCorners | undefined): RugCorners {
  const cap = Math.min(widthMm, depthMm) / 2;
  const r = (corners ?? [0, 0, 0, 0]).map((v) => Math.max(0, Math.min(cap, v))) as RugCorners;
  const len = [widthMm, depthMm, widthMm, depthMm];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const s = r[i] + r[j];
    if (s > len[i]) {
      r[i] *= len[i] / s;
      r[j] *= len[i] / s;
    }
  }
  return r;
}

export interface BowedRug {
  outline: Point[];
  edgeCurves: (EdgeCurve | null)[];
  /** As a footprint, for the seams that draw one (surface fill, picture). */
  footprint: Footprint;
  /** Where those seams will have shifted it to: the centre of what is drawn, relative to the rug's
   *  rectangle centre. Translate by this to put the drawing back. */
  centre: Point;
  /** Each side's run between its corners' arcs — straight or bowed — what the fringe hangs off and
   *  the bow handle rides. Side i's. */
  runs: { a: Point; b: Point; curve: EdgeCurve | null }[];
}

/** The rug's outline with its sides bowed and its corners rounded, about the rectangle's centre.
 *  A rounded corner is one cubic edge (a quarter circle to a hair) between the two points where the
 *  arc leaves the sides; a bowed side bulges between those points by the same sag it would on the
 *  whole side. */
export function rugOutline(widthMm: number, depthMm: number, shape: RugShape | undefined): BowedRug {
  const sides = sidesOf(widthMm, depthMm);
  const r = fitCorners(widthMm, depthMm, shape?.corners);
  const bows = shape?.bows;
  const unit = (from: Point, to: Point) => {
    const L = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: (to.x - from.x) / L, y: (to.y - from.y) / L };
  };
  // Each corner as drawn: the point the arc arrives at (A, on the side before), the point it leaves
  // from (B, on the side after), and the arc between — or the corner itself, thrice.
  const corners = sides.map((s, i) => {
    const c = s.a;
    if (r[i] < 0.5) return { A: c, B: c, arc: null as EdgeCurve | null };
    const uIn = unit(c, sides[(i + 3) % 4].a);
    const uOut = unit(c, s.b);
    const A = { x: c.x + uIn.x * r[i], y: c.y + uIn.y * r[i] };
    const B = { x: c.x + uOut.x * r[i], y: c.y + uOut.y * r[i] };
    // The cubic's handles reach from A and from B toward the corner.
    const k = KAPPA * r[i];
    return { A, B, arc: { c1: { x: -uIn.x * k, y: -uIn.y * k }, c2: { x: -uOut.x * k, y: -uOut.y * k } } };
  });
  const outline: Point[] = [];
  const edgeCurves: (EdgeCurve | null)[] = [];
  const runs: BowedRug["runs"] = [];
  for (let i = 0; i < 4; i++) {
    const p = corners[i];
    const q = corners[(i + 1) % 4];
    if (p.arc) {
      outline.push(p.A);
      edgeCurves.push(p.arc);
    }
    outline.push(p.B);
    const S = p.B;
    const E = q.A;
    let curve: EdgeCurve | null = null;
    if (bows?.[i]) {
      const s = sides[i];
      const mid = { x: (S.x + E.x) / 2, y: (S.y + E.y) / 2 };
      const sag = bows[i] * s.len;
      curve = bulgeToCurve(S, E, { x: mid.x + s.n.x * sag, y: mid.y + s.n.y * sag });
    }
    edgeCurves.push(curve);
    runs.push({ a: S, b: E, curve });
  }
  // Two radii that meet (a half-round end) leave a run of nothing between them: that edge goes, with
  // the point it starts at — the point it ends at stands in the same place, and the arc arriving at
  // the one now arrives at the other.
  for (let k = outline.length - 1; k >= 0; k--) {
    const a = outline[k];
    const b = outline[(k + 1) % outline.length];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.5 && outline.length > 3) {
      outline.splice(k, 1);
      edgeCurves.splice(k, 1);
    }
  }
  const b = customShapeBounds(outline, edgeCurves);
  return { outline, edgeCurves, footprint: { kind: "custom", outline, edgeCurves }, centre: { x: b.cx, y: b.cy }, runs };
}

/** The rug as a polygon about its rectangle's centre — curves flattened. */
export function rugPolygon(widthMm: number, depthMm: number, shape: RugShape | undefined): Point[] {
  const sides = sidesOf(widthMm, depthMm);
  if (!shape) return sides.map((s) => s.a);
  const { outline, edgeCurves } = rugOutline(widthMm, depthMm, shape);
  return outline.flatMap((a, i) => flattenEdge(a, outline[(i + 1) % outline.length], edgeCurves[i]).slice(0, -1));
}

/** Where side `i`'s bow handle sits: the middle of the side's run as it is drawn. */
export function bowHandle(widthMm: number, depthMm: number, shape: RugShape | undefined, side: number): Point {
  if (!shape) {
    const s = sidesOf(widthMm, depthMm)[side];
    return { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
  }
  const run = rugOutline(widthMm, depthMm, shape).runs[side];
  return edgeMidpoint(run.a, run.b, run.curve);
}

/** The bow a handle dragged to `local` (in the rug's own frame) asks for — only how far it is
 *  pushed along the side's normal counts, so a sloppy drag cannot shear the rug. */
export function bowFromPoint(widthMm: number, depthMm: number, side: number, local: Point): number {
  const s = sidesOf(widthMm, depthMm)[side];
  const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
  const sag = (local.x - mid.x) * s.n.x + (local.y - mid.y) * s.n.y;
  return Math.max(-MAX_RUG_BOW, Math.min(MAX_RUG_BOW, sag / s.len));
}

/** Where corner `i`'s radius handle sits, in the rug's frame: the middle of its arc — on the
 *  corner's inward diagonal, (√2−1)·r in from the corner — the corner itself when it is square. The
 *  canvas stands its grip a few screen pixels further in along the same diagonal (`inwardOf`). */
export function cornerHandle(widthMm: number, depthMm: number, corners: RugCorners | undefined, i: number): Point {
  const c = sidesOf(widthMm, depthMm)[i].a;
  const r = fitCorners(widthMm, depthMm, corners)[i];
  const g = INWARD[i];
  return { x: c.x + g.x * r * DIAG, y: c.y + g.y * r * DIAG };
}

/** The unit diagonal into the rug from corner `i`. */
export const inwardOf = (i: number): Point => INWARD[i];

/** The radius a corner handle dragged to `local` (in the rug's frame) asks for — how far in along
 *  the corner's diagonal it is, less `insetMm` (the canvas's own standoff), read back through the
 *  arc's geometry; held between square and half the shorter side. */
export function cornerFromPoint(widthMm: number, depthMm: number, i: number, local: Point, insetMm = 0): number {
  const c = sidesOf(widthMm, depthMm)[i].a;
  const g = INWARD[i];
  const along = (local.x - c.x) * g.x + (local.y - c.y) * g.y - insetMm;
  const r = along / DIAG;
  return Math.round(Math.max(0, Math.min(Math.min(widthMm, depthMm) / 2, r)));
}

/** The woven border's line: the rug's own outline pulled in by `insetMm` — the same bows on the
 *  smaller rectangle, each corner's arc concentric with the edge's (its radius less the inset), so
 *  every curve keeps its character. Null when nothing is left to inset. */
export function rugInset(widthMm: number, depthMm: number, shape: RugShape, insetMm: number): BowedRug | null {
  const w = widthMm - insetMm * 2;
  const d = depthMm - insetMm * 2;
  if (w <= 1 || d <= 1) return null;
  const corners = shape.corners ? (fitCorners(widthMm, depthMm, shape.corners).map((r) => Math.max(0, r - insetMm)) as RugCorners) : undefined;
  return rugOutline(w, d, { ...(shape.bows ? { bows: shape.bows } : {}), ...(corners?.some(Boolean) ? { corners } : {}) });
}

/** One strand of fringe: where it leaves the rug's edge, and the unit direction it hangs in. */
export interface FringeTick {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/** The fringe, `gapMm` apart along the rug's two SHORT ends — the ends it is woven from — leaving the
 *  edge as it is drawn: along each end's run between its corners (a rounded corner hangs none), on
 *  a bowed end each strand starts on the curve and hangs along its normal. `max` caps a side (the 3D
 *  scene keeps its part count modest). */
export function rugFringe(widthMm: number, depthMm: number, shape: RugShape | undefined, gapMm: number, max = Infinity): FringeTick[] {
  const sides = sidesOf(widthMm, depthMm);
  const runs = shape ? rugOutline(widthMm, depthMm, shape).runs : sides.map((s) => ({ a: s.a, b: s.b, curve: null }));
  const ends = widthMm >= depthMm ? [1, 3] : [0, 2];
  const out: FringeTick[] = [];
  for (const i of ends) {
    const { a, b, curve } = runs[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.min(max, Math.floor(len / gapMm));
    const c1 = curve ? { x: a.x + curve.c1.x, y: a.y + curve.c1.y } : a;
    const c2 = curve ? { x: b.x + curve.c2.x, y: b.y + curve.c2.y } : b;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const u = 1 - t;
      const x = u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x;
      const y = u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y;
      const dx = 3 * u * u * (c1.x - a.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (b.x - c2.x);
      const dy = 3 * u * u * (c1.y - a.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (b.y - c2.y);
      const l = Math.hypot(dx, dy) || 1;
      out.push({ x, y, nx: dy / l, ny: -dx / l });
    }
  }
  return out;
}

// ponytail: self-check. Run: npm run check:rug-shape
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error("FAIL: " + m); };
  const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

  assert(cleanBows(undefined) === undefined, "no bows is no bows");
  assert(cleanBows([0, 0.001, 0, 0]) === undefined, "a slip of the hand is straight");
  assert(cleanBows([0, 0, 0, 0.9])?.[3] === MAX_RUG_BOW, "a bow is held to half the side");

  const W = 2000, D = 1000;
  const flat = rugPolygon(W, D, undefined);
  assert(flat.length === 4 && flat[0].x === -1000 && flat[0].y === -500, "a straight rug is its four corners");
  assert(rugShapeOf({}) === undefined && rugShapeOf({ bows: [0, 0, 0, 0], corners: [1, 2, 3, 4] }) === undefined, "a rug nobody bent has no shape");

  // The top side pulled out by 20% of its length = 400mm: the apex is at y = -500 - 400.
  const bows = withBow(undefined, 0, 0.2)!;
  assert(bows[0] === 0.2 && bows[1] === 0 && bows[2] === 0 && bows[3] === 0, "only the pulled side bows");
  const h = bowHandle(W, D, { bows }, 0);
  assert(near(h.x, 0) && near(h.y, -900), `the handle rides the apex (${h.x}, ${h.y})`);
  const poly = rugPolygon(W, D, { bows });
  assert(poly.length > 4, "a bowed side is flattened into points");
  assert(near(Math.min(...poly.map((p) => p.y)), -900, 2), "the polygon reaches the apex");
  assert(near(Math.max(...poly.map((p) => p.y)), 500, 0.01), "the other sides stay where they were");

  // Round trip: a pointer at the handle asks for the bow the handle shows; a push inwards is negative.
  assert(near(bowFromPoint(W, D, 0, h), 0.2, 0.002), "dragging to the handle gives the same bow");
  assert(bowFromPoint(W, D, 0, { x: 700, y: -300 }) < 0, "pushed inside the rug it bows in");
  assert(near(bowFromPoint(W, D, 1, { x: 1000 + 250, y: 123 }), 250 / D, 1e-9), "sideways travel is ignored");
  assert(near(bowFromPoint(W, D, 2, { x: 0, y: 500 + 100 }), 0.05, 1e-9), "the bottom's outward is +y");
  assert(near(bowFromPoint(W, D, 3, { x: -1000 - 100, y: 0 }), 0.1, 1e-9), "the left's outward is -x");

  // Straightening it again restores the rectangle.
  assert(withBow(bows, 0, 0) === undefined, "taking the only bow out leaves no bows");

  // The shift the drawing seams apply is the bounds' centre: here half the bow, upwards.
  const rug = rugOutline(W, D, { bows });
  assert(near(rug.centre.y, -200, 2) && near(rug.centre.x, 0, 0.5), `centre is half the bow (${rug.centre.y})`);
  // The border: the same bows on a smaller rectangle; nothing left of a rug thinner than its border.
  assert(rugInset(W, D, { bows }, 100)?.footprint.kind === "custom", "an inset is a rug of its own");
  assert(rugInset(W, 150, { bows }, 100) === null, "a rug thinner than its border has no inset");

  // The fringe hangs off the short ends, along the normal: a straight 2000×1000 rug has strands on
  // x = ±1000 pointing ±x; bow its right end out and they follow the curve, still pointing outward.
  const straight = rugFringe(W, D, undefined, 50);
  assert(straight.length === 40 && straight.every((t) => near(Math.abs(t.x), 1000, 1e-6) && near(Math.abs(t.nx), 1, 1e-9)), "straight fringe stands on the short ends");
  assert(straight.filter((t) => t.nx > 0).every((t) => t.x > 0), "…pointing away from the middle");
  const round = rugFringe(W, D, { bows: withBow(undefined, 1, 0.3) }, 50);
  const right = round.filter((t) => t.x > 0);
  assert(right.length === 20 && right.every((t) => t.nx > 0.2), "a bowed end's fringe hangs along the curve, outward");
  assert(Math.max(...right.map((t) => t.x)) > 1200, `…and sits on the bulge (${Math.max(...right.map((t) => t.x))})`);
  assert(rugFringe(W, D, undefined, 50, 5).length === 10, "the cap is per end");

  // ROUNDED CORNERS. R200 on every corner of the 2000×1000: the box is unchanged, the corner point
  // itself is cut off, and the arc passes (√2−1)·200 ≈ 83mm in from it on the diagonal.
  const corners = withCorner(undefined, "all", 200)!;
  assert(corners.every((r) => r === 200) && withCorner(undefined, 2, 3) === undefined, "every corner at 200; a slip of the hand rounds nothing");
  const rounded = rugOutline(W, D, { corners });
  assert(rounded.outline.length === 8 && rounded.edgeCurves.filter(Boolean).length === 4, "four arcs between four straight runs");
  const rp = rugPolygon(W, D, { corners });
  assert(near(Math.min(...rp.map((p) => p.x)), -1000, 0.01) && near(Math.min(...rp.map((p) => p.y)), -500, 0.01), "the rounded rug still fills its box");
  assert(!rp.some((p) => near(p.x, -1000, 1) && near(p.y, -500, 1)), "…but the corner itself is cut off");
  const apex = cornerHandle(W, D, corners, 0);
  assert(near(apex.x, -1000 + 200 * DIAG * Math.SQRT1_2, 0.01) && near(apex.y, -500 + 200 * DIAG * Math.SQRT1_2, 0.01), `the handle rides the arc's middle (${apex.x}, ${apex.y})`);
  assert(rp.some((p) => near(p.x, apex.x, 3) && near(p.y, apex.y, 3)), "…which the flattened arc passes through");
  assert(near(rounded.centre.x, 0, 0.5) && near(rounded.centre.y, 0, 0.5), "rounding the corners moves nothing");
  assert(cornerFromPoint(W, D, 0, apex) === 200, "dragging to the handle gives the same radius");
  assert(cornerFromPoint(W, D, 0, { x: -1000 + 30, y: -500 + 30 }, 20) < 200 && cornerFromPoint(W, D, 0, { x: 0, y: 0 }) === 500, "…nearer the corner a smaller one, far in the most the rug takes");
  const square = cornerHandle(W, D, undefined, 3);
  assert(square.x === -1000 && square.y === 500, "a square corner's handle is the corner");
  // Two radii that would overlap on a side are held to it: R600 twice on a 1m end makes a half-round.
  const fitted = fitCorners(W, D, [600, 0, 0, 600]);
  assert(near(fitted[0], 500) && near(fitted[3], 500), `two R600 on a 1m end are two R500 (${fitted[0]}, ${fitted[3]})`);
  const halfRound = rugOutline(W, D, { corners: [500, 0, 0, 500] });
  assert(halfRound.outline.length === 5 && halfRound.edgeCurves.filter(Boolean).length === 2, "…a half-round end is two arcs meeting, no run between them");
  // The border's corners are concentric: R200 less a 100 inset is R100.
  const insetR = rugInset(W, D, { corners }, 100)!;
  assert(insetR.outline.length === 8 && insetR.edgeCurves.filter(Boolean).length === 4, "an inset border keeps its arcs");
  assert(rugInset(W, D, { corners }, 250)!.edgeCurves.every((c) => c === null), "…and loses them when the inset passes the radius");
  // Fringe leaves the straight run only: a 1m end with two R200s has 600mm of strands.
  const fr = rugFringe(W, D, { corners }, 50).filter((t) => t.x > 0);
  assert(fr.length === 12 && fr.every((t) => near(t.x, 1000, 1e-6) && Math.abs(t.y) < 300), "rounded corners hang no fringe");
  // Bows and corners together: the bowed run bulges between the arcs.
  const both = rugOutline(W, D, { bows, corners });
  assert(both.outline.length === 8 && both.edgeCurves.every(Boolean) === false && both.runs[0].curve !== null, "a bowed side keeps its bow between rounded corners");
  console.log("rug-shape: ok");
}
