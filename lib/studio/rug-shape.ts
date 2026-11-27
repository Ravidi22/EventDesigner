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
import { borderBands, type Border, type BorderBand } from "../catalog/border";

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
export const DIAG = Math.SQRT2 - 1;

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

/** A rug's CONTOUR (lib/catalog/border.ts) laid along the rug as it is drawn — bows and rounded
 *  corners followed, each band the region between two true insets of the outline (evenInset), so
 *  a band is as wide on a bowed side and round a corner as on a straight run — about the rectangle's
 *  centre, like rugOutline. `roundMm` is the corner the canvas draws a plain rug's rectangle with (its
 *  rx), so the band does not poke past it; a shaped rug brings its own corners. */
export function rugBorderBands(widthMm: number, depthMm: number, shape: RugShape | undefined, border: Border, roundMm = 0): BorderBand[] {
  // Kept for the last few rugs asked about: a bowed, rounded rug's true insets cost a few ms, and one
  // rug is drawn by the canvas, every printed sheet and the 3D room alike.
  const key = `${widthMm}|${depthMm}|${roundMm}|${JSON.stringify(shape ?? null)}|${JSON.stringify(border)}`;
  const hit = BAND_CACHE.get(key);
  if (hit) return hit;
  const s = shape ?? (roundMm > 0 ? { corners: [roundMm, roundMm, roundMm, roundMm] as RugCorners } : undefined);
  const { outline, edgeCurves } = rugOutline(widthMm, depthMm, s);
  const bands = borderBands({ outline, ...(edgeCurves.some(Boolean) ? { edgeCurves } : {}) }, border);
  if (BAND_CACHE.size >= 48) BAND_CACHE.delete(BAND_CACHE.keys().next().value!);
  BAND_CACHE.set(key, bands);
  return bands;
}
const BAND_CACHE = new Map<string, BorderBand[]>();
