// The rim of a stage — what rectangular decks cannot build.
//
// A stage is decks laid in rows (./stage-fill.ts). Where its outline runs along the rows' own axes
// the decks meet it; where it CURVES or runs at an angle — a half-round apron, a rounded corner, a
// bowed front, a corner cut at 45° — no rectangle meets it, and what is left between the decks and
// the line is the RIM. The crew does not cut a deck to it: they bring a piece made for it — a
// quarter-round, a half-round, a triangle, a deck with a curved side — and when the studio has no
// such piece, the right answer is to say which one is missing, not to leave a hole or stair-step
// strips along the curve.
//
// This file is the geometry of that, pure and self-checked (`npm run check:stage-rim`):
//
//   1. RUNS. The outline, in the fill's frame (x along the front, y back), is split into edges that
//      run along an axis and RUNS that do not — a curve (its corners `smooth`) or an angled side —
//      each run cut where it turns back on itself in x or y, so every run is monotone: from A to B
//      it only ever moves one way along each axis.
//   2. CORNERS. A monotone run and the two legs of the right angle between A and B bound a region on
//      either side: one inside the stage (the INNER corner — for a quarter of a disc it is the
//      disc's centre, for a 45° cut the square corner the cut took off) and one outside it (the
//      OUTER corner). Replacing every run by the legs through one corner or the other gives a
//      rectilinear CORE the decks can be laid in, and leaves the rim as regions of known shape.
//   3. SHAPES. A piece is recognised as a quarter-round, a half-round, a triangle, a deck with a
//      curved side, or one with an angled side; two pieces are the SAME piece when one is the other
//      turned or flipped (congruent); and a missing piece is described the way a catalog row draws
//      it — its corners, its curved sides as béziers — so "הוספה לקטלוג" can make it.
//
// Which corner each run takes, and how the rim is cut into pieces, is decided by trying the options
// and keeping the build with the fewest holes and the fewest DIFFERENT new pieces — in stage-fill.
import type { Point } from "@/lib/design-document/types";
import type { EdgeCurve } from "./hall";
import { isMain } from "../self-check";

// ── Polygons ──────────────────────────────────────────────────────────────────────────────────

/** Even-odd point in polygon. The fill's grid classification (stage-fill insideCells) spells this
 *  same predicate row by row; keep the two in step. */
export function inside(p: Point, poly: readonly Point[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

export function distToBoundary(p: Point, poly: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

export function signedArea(poly: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export const polyArea = (poly: readonly Point[]) => (poly.length < 3 ? 0 : Math.abs(signedArea(poly)));

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function boxOf(poly: readonly Point[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

/** `poly` cut by one half-plane, Sutherland–Hodgman: `keep(p)` ≥ 0 is kept. The polygon need not be
 *  convex; where the half-plane cuts it in two, the result is one outline with a zero-width bridge
 *  along the cut, which has the right area and the right inside. */
function clipHalf(poly: readonly Point[], side: (p: Point) => number): Point[] {
  const out: Point[] = [];
  for (let k = 0; k < poly.length; k++) {
    const cur = poly[k];
    const prev = poly[(k - 1 + poly.length) % poly.length];
    const sc = side(cur);
    const sp = side(prev);
    const cross = (): Point => {
      const t = sp / (sp - sc);
      return { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t };
    };
    if (sc >= 0) {
      if (sp < 0) out.push(cross());
      out.push(cur);
    } else if (sp >= 0) out.push(cross());
  }
  return out;
}

/** `poly` clipped to an axis-aligned box. */
export function clipToBox(poly: readonly Point[], b: Box): Point[] {
  let out: Point[] = [...poly];
  out = clipHalf(out, (p) => p.x - b.x0);
  if (out.length) out = clipHalf(out, (p) => b.x1 - p.x);
  if (out.length) out = clipHalf(out, (p) => p.y - b.y0);
  if (out.length) out = clipHalf(out, (p) => b.y1 - p.y);
  return tidy(out);
}

/** The part of `poly` with y ≥ c (`behind`) or y ≤ c. */
export function clipY(poly: readonly Point[], c: number, behind: boolean): Point[] {
  return tidy(clipHalf(poly, (p) => (behind ? p.y - c : c - p.y)));
}

/** An outline without repeated points, without points on a straight line between their neighbours,
 *  and without SPIKES (a point the line goes out to and straight back from) — what replacing runs
 *  by their corners, or clipping, leaves behind. */
export function tidy(poly: readonly Point[], eps = 0.5): Point[] {
  let pts = [...poly];
  for (let pass = 0; pass < 8; pass++) {
    const n0 = pts.length;
    pts = pts.filter((p, i) => {
      const q = pts[(i + 1) % pts.length];
      return Math.abs(p.x - q.x) > eps || Math.abs(p.y - q.y) > eps;
    });
    if (pts.length < 3) return pts;
    const keep: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = keep.length ? keep[keep.length - 1] : pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      const scale = Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - b.x, c.y - b.y);
      if (Math.abs(cross) <= eps * scale) continue; // on the line through its neighbours — straight on, or a spike
      keep.push(b);
    }
    pts = keep;
    if (pts.length === n0 || pts.length < 3) break;
  }
  return pts;
}

// ── Runs: the parts of the outline the decks' rows do not run along ──────────────────────────

/** An edge within this of an axis (0.25°, or 1.5mm end to end) runs along it. */
const isAxis = (dx: number, dy: number) => {
  const tol = Math.max(1.5, 0.0045 * Math.hypot(dx, dy));
  return Math.abs(dx) <= tol || Math.abs(dy) <= tol;
};

/** One monotone stretch of the outline that runs along neither axis, A = pts[0] to B = pts[last],
 *  with the corners of the right angle under it. */
export interface RimRun {
  pts: Point[];
  /** The right-angle corner on the stage's side of the run (a quarter's centre, the square corner
   *  a 45° cut took off) — and whether its two legs really stand on the stage. */
  inner: Point;
  innerOk: boolean;
  /** …and the one on the other side, outside — whether its legs stay off the stage. */
  outer: Point;
  outerOk: boolean;
}

export type RimSegment = { kind: "edge"; a: Point } | { kind: "run"; run: RimRun };

const sgn = (v: number, tol: number) => (v > tol ? 1 : v < -tol ? -1 : 0);

/** The outline as edges along the axes and monotone runs, in order. `smooth` marks the corners a
 *  curve runs THROUGH (StageBuild.smooth): those join their two edges into one run even where a
 *  chord of the curve happens to lie along an axis (the apex chord of a half-round). Without it, two
 *  angled edges meeting at less than 30° are taken for one curve. */
export function rimSegments(poly: readonly Point[], smooth?: ReadonlySet<number>): RimSegment[] {
  const n = poly.length;
  if (n < 3) return [];
  const edge = (i: number) => {
    const a = poly[((i % n) + n) % n];
    const b = poly[(((i + 1) % n) + n) % n];
    return { a, b, dx: b.x - a.x, dy: b.y - a.y, axis: isAxis(b.x - a.x, b.y - a.y) };
  };
  const turn = (v: number) => {
    const e1 = edge(v - 1);
    const e2 = edge(v);
    const u = Math.atan2(e1.dy, e1.dx);
    const w = Math.atan2(e2.dy, e2.dx);
    const d = Math.abs(w - u) % (2 * Math.PI);
    return Math.min(d, 2 * Math.PI - d);
  };
  // Vertex v joins edge v−1 to edge v into one run.
  const joined = (v: number) => (smooth?.size ? smooth.has(((v % n) + n) % n) : !edge(v - 1).axis && !edge(v).axis && turn(v) < Math.PI / 6);
  const allJoined = Array.from({ length: n }, (_, v) => joined(v)).every(Boolean);
  // Chains of joined edges. An outline that is all curve (a disc, an oval) is one chain, opened at
  // its leftmost point — an extreme, where a run has to end anyway: the middle of the chord there
  // when the chord stands upright, else the curve's own extreme on the circle through the corner
  // and its neighbours. Opening it at the nearest corner instead makes two quarters of a disc a
  // chord longer than the other two.
  const chains: Point[][] = [];
  if (allJoined) {
    let v = 0;
    for (let k = 1; k < n; k++) if (poly[k].x < poly[v].x - 1e-6) v = k;
    const prev = poly[(v - 1 + n) % n];
    const at = poly[v];
    const next = poly[(v + 1) % n];
    const upright = (p: Point, q: Point) => Math.abs(q.x - p.x) <= Math.max(0.5, 0.002 * Math.abs(q.y - p.y));
    const round: Point[] = Array.from({ length: n }, (_, k) => poly[(v + k) % n]); // at, next, …, prev
    let open: Point;
    if (upright(at, next)) {
      // Opened in the middle of the chord at → next: round from next, back to at.
      open = { x: (at.x + next.x) / 2, y: (at.y + next.y) / 2 };
      round.push(round.shift()!); // next, …, prev, at
    } else if (upright(prev, at)) {
      // Opened in the middle of prev → at: round from at, back to prev, as `round` already runs.
      open = { x: (prev.x + at.x) / 2, y: (prev.y + at.y) / 2 };
    } else {
      const c = circleOf(prev, at, next);
      open = c && c.r < 1e6 && Math.hypot(c.o.x - c.r - at.x, c.o.y - at.y) <= Math.hypot(next.x - at.x, next.y - at.y) ? { x: c.o.x - c.r, y: c.o.y } : at;
      round.shift(); // next, …, prev — `open` stands in for `at`
    }
    chains.push([open, ...round, open]);
  } else {
    let start = 0;
    while (joined(start)) start++;
    let cur: Point[] = [poly[start]];
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      cur.push(poly[(i + 1) % n]);
      const next = (i + 1) % n;
      if (k === n - 1 || !joined(next)) {
        chains.push(cur);
        cur = [poly[next]];
      }
    }
  }
  const out: RimSegment[] = [];
  const sigma = signedArea(poly) >= 0 ? 1 : -1;
  for (const chain of chains) {
    const straight = chain.slice(1).every((b, k) => isAxis(b.x - chain[k].x, b.y - chain[k].y));
    if (straight) {
      for (let k = 0; k < chain.length - 1; k++) out.push({ kind: "edge", a: chain[k] });
      continue;
    }
    for (const pts of monotone(chain)) {
      const A = pts[0];
      const B = pts[pts.length - 1];
      if (isAxis(B.x - A.x, B.y - A.y)) {
        // A monotone stretch whose ends share an x or a y is straight along that axis after all.
        out.push({ kind: "edge", a: A });
        continue;
      }
      for (const run of corners(pts, poly, sigma)) out.push({ kind: "run", run });
    }
  }
  return out;
}

/** A chain cut where it turns back on itself in x or in y. A chord lying along the axis between a
 *  rise and a fall (the flat top of a half-round drawn with an even number of chords) is cut at its
 *  middle, so the two halves of a symmetric curve come out the same. */
function monotone(chain: Point[]): Point[][] {
  const pts: Point[] = [chain[0]];
  const cuts = new Set<number>();
  const n = chain.length - 1;
  const tolOf = (k: number) => Math.max(0.5, 0.002 * Math.hypot(chain[k + 1].x - chain[k].x, chain[k + 1].y - chain[k].y));
  const sx = (k: number) => sgn(chain[k + 1].x - chain[k].x, tolOf(k));
  const sy = (k: number) => sgn(chain[k + 1].y - chain[k].y, tolOf(k));
  // The sign each edge's neighbours on either side settle to, skipping flat ones.
  const before = (k: number, s: (k: number) => number) => {
    for (let j = k - 1; j >= 0; j--) if (s(j)) return s(j);
    return 0;
  };
  const after = (k: number, s: (k: number) => number) => {
    for (let j = k + 1; j < n; j++) if (s(j)) return s(j);
    return 0;
  };
  for (let k = 0; k < n; k++) {
    const a = chain[k];
    const b = chain[k + 1];
    const flatFlip = (s: (k: number) => number) => s(k) === 0 && before(k, s) * after(k, s) < 0;
    if (flatFlip(sx) || flatFlip(sy)) {
      pts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      cuts.add(pts.length - 1);
    }
    pts.push(b);
    // A turn at b: the edge into it and the next settle to opposite signs. The cut goes at the
    // curve's true extreme — on the circle through b and its neighbours — rather than at whichever
    // chord corner happens to be nearest, so the quarters of a disc drawn at any angle are quarters.
    if (k + 1 < n) {
      const flips = (s: (k: number) => number) => s(k) !== 0 && s(k + 1) !== 0 && s(k) * s(k + 1) < 0;
      const fx = flips(sx);
      const fy = flips(sy);
      if (fx || fy) {
        const c = fx !== fy ? circleOf(a, b, chain[k + 2]) : null;
        if (c && c.r < 1e6) {
          const ext = fx ? { x: c.o.x + sx(k) * c.r, y: c.o.y } : { x: c.o.x, y: c.o.y + sy(k) * c.r };
          const reach = Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(chain[k + 2].x - b.x, chain[k + 2].y - b.y));
          if (Math.hypot(ext.x - b.x, ext.y - b.y) <= reach) pts[pts.length - 1] = ext;
        }
        cuts.add(pts.length - 1);
      }
    }
  }
  const out: Point[][] = [];
  let cur: Point[] = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    cur.push(pts[k]);
    if (cuts.has(k) && k < pts.length - 1) {
      out.push(cur);
      cur = [pts[k]];
    }
  }
  out.push(cur);
  return out.filter((r) => r.length >= 2);
}

/** The run's two right-angle corners, and whether each one's legs stay where they should: the
 *  inner's on the stage, the outer's off it. A run whose inner legs would leave the stage (an S, or a
 *  curve that sweeps past a neighbouring part of the outline) is halved until they do not. */
function corners(pts: Point[], poly: readonly Point[], sigma: number, depth = 0): RimRun[] {
  const A = pts[0];
  const B = pts[pts.length - 1];
  const K1 = { x: A.x, y: B.y };
  const K2 = { x: B.x, y: A.y };
  const side = (K: Point) => sigma * ((B.x - A.x) * (K.y - A.y) - (B.y - A.y) * (K.x - A.x));
  const [inner, outer] = side(K1) > 0 ? [K1, K2] : [K2, K1];
  const legs = (K: Point) =>
    [0.15, 0.3, 0.5, 0.7, 0.85].flatMap((t) => [
      { x: A.x + (K.x - A.x) * t, y: A.y + (K.y - A.y) * t },
      { x: K.x + (B.x - K.x) * t, y: K.y + (B.y - K.y) * t },
    ]);
  const on = (p: Point) => distToBoundary(p, poly) <= 2;
  const innerOk = legs(inner).every((p) => inside(p, poly) || on(p));
  const outerOk = legs(outer).every((p) => !inside(p, poly) || on(p));
  if (!innerOk && pts.length > 2 && depth < 8) {
    const mid = Math.floor(pts.length / 2);
    return [...corners(pts.slice(0, mid + 1), poly, sigma, depth + 1), ...corners(pts.slice(mid), poly, sigma, depth + 1)];
  }
  return [{ pts, inner, innerOk, outer, outerOk }];
}

/** The rim region a run bounds with one of its corners: the run from A to B, then the corner. */
export const runRegion = (run: RimRun, outer = false): Point[] => tidy([...run.pts, outer ? run.outer : run.inner]);

/** The outline with every run replaced by the legs through its chosen corner — rectilinear, laid
 *  with decks like any other. Runs are numbered in the order rimSegments gives them. */
export function coreOutline(segments: readonly RimSegment[], outer: (run: number) => boolean): Point[] {
  const pts: Point[] = [];
  let r = 0;
  for (const s of segments) {
    if (s.kind === "edge") pts.push(s.a);
    else {
      pts.push(s.run.pts[0], outer(r) ? s.run.outer : s.run.inner);
      r++;
    }
  }
  return tidy(pts);
}

// ── Shapes: the same piece, turned or flipped ─────────────────────────────────────────────────

/** A piece about its own box centre. */
export interface Normal {
  pts: Point[];
  w: number;
  h: number;
  centre: Point;
  area: number;
}

export function normal(poly: readonly Point[]): Normal {
  const b = boxOf(poly);
  const centre = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  return { pts: poly.map((p) => ({ x: p.x - centre.x, y: p.y - centre.y })), w: b.x1 - b.x0, h: b.y1 - b.y0, centre, area: polyArea(poly) };
}

/** A piece's turn and flip: flipped across its width first (x → −x), then turned `rot` quarter
 *  turns — the order a stage piece is placed in (StagePiece: mirrored, then rotation). */
export interface Turn {
  rot: 0 | 1 | 2 | 3;
  mirror: boolean;
}

export const TURNS: Turn[] = [false, true].flatMap((mirror) => ([0, 1, 2, 3] as const).map((rot) => ({ rot, mirror })));

export function turned(pts: readonly Point[], t: Turn): Point[] {
  const th = (t.rot * Math.PI) / 2;
  const c = Math.round(Math.cos(th));
  const s = Math.round(Math.sin(th));
  return pts.map((p) => {
    const x = t.mirror ? -p.x : p.x;
    return { x: x * c - p.y * s, y: x * s + p.y * c };
  });
}

/** Two pieces this close everywhere, and of about one area, are one piece. */
export const SHAPE_TOL_MM = 60;

/** The turn that lays `b` over `a`, when they are one shape; null when they are not. */
export function congruent(a: Normal, b: Normal, tol = SHAPE_TOL_MM): Turn | null {
  if (Math.abs(a.area - b.area) > 0.08 * Math.max(a.area, b.area) + tol * 10) return null;
  for (const t of TURNS) {
    const [w, h] = t.rot % 2 ? [b.h, b.w] : [b.w, b.h];
    if (Math.abs(w - a.w) > tol || Math.abs(h - a.h) > tol) continue;
    const bt = turned(b.pts, t);
    if (a.pts.every((p) => distToBoundary(p, bt) <= tol) && bt.every((p) => distToBoundary(p, a.pts) <= tol)) return t;
  }
  return null;
}

// ── What a piece is, and how a catalog row draws it ───────────────────────────────────────────

export type PieceKind = "quarter" | "half" | "round" | "triangle" | "curve" | "angled" | "rect";

export interface PieceInfo {
  kind: PieceKind;
  /** Its box, the longer side across. */
  widthMm: number;
  depthMm: number;
  /** A quarter's or a half-round's radius. */
  radiusMm?: number;
  /** The outline a catalog row draws (MapAppearance.outline): about its box centre, longer side
   *  across, a curved side as one or more bézier edges (edgeCurves, relative to each end). */
  outline: Point[];
  edgeCurves?: (EdgeCurve | null)[];
}

/** An edge at least this long is a straight SIDE of the piece; the chords a stage's curves are cut
 *  into are about 25cm (lib/design-document/stage.ts ROUND_SIDE_MM). */
const LONG_EDGE_MM = 450;
const CORNER_TURN = (25 * Math.PI) / 180;

/** Whether the edge a→b of a piece lies along a CURVE of the stage it was cut from. */
export type OnCurve = (a: Point, b: Point) => boolean;

/** An OnCurve for pieces cut from an outline whose curves are these runs of points: an edge lies
 *  on a curve when its middle is on one of a curved run's chords. */
export function curveTest(curves: readonly (readonly Point[])[]): OnCurve {
  const chords = curves.filter((c) => c.length > 2).flatMap((c) => c.slice(1).map((b, k) => [c[k], b] as const));
  return (a, b) => {
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return chords.some(([p, q]) => distToBoundary(m, [p, q]) <= 1.5);
  };
}

/** The piece's sides: straight ones, and curved ones as the points along them. With `curvedEdge`
 *  known (the stage's own curves, OnCurve), a run of curved edges is one curved side and every
 *  other edge a straight one; without it, a run of short edges turning gently is taken for a curve. */
function sidesOf(pts: readonly Point[], curvedEdge?: readonly boolean[]): { pts: Point[]; curved: boolean }[] {
  const n = pts.length;
  const len = (i: number) => Math.hypot(pts[(i + 1) % n].x - pts[i].x, pts[(i + 1) % n].y - pts[i].y);
  const corner = (v: number) => {
    const a = pts[(v - 1 + n) % n];
    const b = pts[v];
    const c = pts[(v + 1) % n];
    const u = Math.atan2(b.y - a.y, b.x - a.x);
    const w = Math.atan2(c.y - b.y, c.x - b.x);
    const d = Math.abs(w - u) % (2 * Math.PI);
    const t = Math.min(d, 2 * Math.PI - d);
    if (curvedEdge) {
      const inC = curvedEdge[(v - 1 + n) % n];
      const outC = curvedEdge[v];
      return !inC || !outC || t >= CORNER_TURN;
    }
    const longIn = len((v - 1 + n) % n) >= LONG_EDGE_MM;
    const longOut = len(v) >= LONG_EDGE_MM;
    return t >= CORNER_TURN || longIn || longOut;
  };
  const cs = Array.from({ length: n }, (_, v) => corner(v));
  if (!cs.some(Boolean)) return [{ pts: [...pts, pts[0]], curved: true }];
  const first = cs.indexOf(true);
  const sides: { pts: Point[]; curved: boolean }[] = [];
  let cur: Point[] = [pts[first]];
  for (let k = 1; k <= n; k++) {
    const v = (first + k) % n;
    cur.push(pts[v]);
    if (cs[v]) {
      // One edge is straight unless the stage says it is a stretch of curve.
      sides.push({ pts: cur, curved: cur.length > 2 || !!curvedEdge?.[(v - 1 + n) % n] });
      cur = [pts[v]];
    }
  }
  return sides;
}

/** The circle through three points, or null when they are in a line. */
function circleOf(a: Point, b: Point, c: Point): { o: Point; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-6) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const o = { x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d, y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d };
  return { o, r: Math.hypot(a.x - o.x, a.y - o.y) };
}

/** A curved side as bézier edges, each spanning at most ~45° of its arc: the points between are
 *  corners of the outline, the béziers the circle through each stretch's ends and middle. */
function bezierSide(pts: Point[]): { pts: Point[]; curves: (EdgeCurve | null)[] } {
  const whole = circleOf(pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]);
  const sweep = whole ? 2 * Math.asin(Math.min(1, Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y) / (2 * whole.r))) : 0;
  // A long side of many chords gets a bézier per few of them too — an oval's curvature changes along
  // it, and one circle through three of its points is not the curve.
  const chunks = Math.max(1, Math.min(pts.length - 1, Math.max(Math.ceil(sweep / (Math.PI / 4) - 1e-6), Math.ceil((pts.length - 1) / 6))));
  const out: Point[] = [];
  const curves: (EdgeCurve | null)[] = [];
  for (let k = 0; k < chunks; k++) {
    const i0 = Math.round((k * (pts.length - 1)) / chunks);
    const i1 = Math.round(((k + 1) * (pts.length - 1)) / chunks);
    const a = pts[i0];
    const b = pts[i1];
    const m = pts[Math.round((i0 + i1) / 2)];
    out.push(a);
    const c = i1 - i0 >= 2 ? circleOf(a, m, b) : null;
    if (!c || c.r > 1e6) {
      curves.push(null);
      continue;
    }
    // The tangent at each end, along the way the side runs.
    const tan = (p: Point, toward: Point) => {
      let t = { x: -(p.y - c.o.y) / c.r, y: (p.x - c.o.x) / c.r };
      if (t.x * (toward.x - p.x) + t.y * (toward.y - p.y) < 0) t = { x: -t.x, y: -t.y };
      return t;
    };
    const ta = tan(a, pts[i0 + 1]);
    const tb = tan(b, pts[i1 - 1]); // pointing back along the side
    const phi = 2 * Math.asin(Math.min(1, Math.hypot(b.x - a.x, b.y - a.y) / (2 * c.r)));
    const k4 = (4 / 3) * Math.tan(phi / 4) * c.r;
    curves.push({ c1: { x: ta.x * k4, y: ta.y * k4 }, c2: { x: tb.x * k4, y: tb.y * k4 } });
  }
  return { pts: out, curves };
}

/** What a piece of the rim is, and the outline its catalog row would draw. `onCurve` says which of
 *  its edges lie along the stage's curves (curveTest); without it they are guessed. */
export function describePiece(poly: readonly Point[], onCurve?: OnCurve): PieceInfo {
  let pts = tidy(poly, 0.5);
  const curvedEdge = onCurve ? pts.map((a, i) => onCurve(a, pts[(i + 1) % pts.length])) : undefined;
  let b = boxOf(pts);
  // Longer side across, as a catalog row is entered.
  if (b.y1 - b.y0 > b.x1 - b.x0 + 0.5) pts = pts.map((p) => ({ x: -p.y, y: p.x }));
  b = boxOf(pts);
  const c = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  pts = pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
  const widthMm = Math.round(b.x1 - b.x0);
  const depthMm = Math.round(b.y1 - b.y0);
  const sides = sidesOf(pts, curvedEdge);
  const straight = sides.filter((s) => !s.curved);
  const curved = sides.filter((s) => s.curved);
  const L = (s: { pts: Point[] }) => Math.hypot(s.pts[s.pts.length - 1].x - s.pts[0].x, s.pts[s.pts.length - 1].y - s.pts[0].y);
  const allAt = (s: { pts: Point[] }, o: Point, r: number, tol: number) => s.pts.every((p) => Math.abs(Math.hypot(p.x - o.x, p.y - o.y) - r) <= tol);

  if (isRectangle(pts)) return { kind: "rect", widthMm, depthMm, outline: corners4(widthMm, depthMm) };
  // A curve all the way round: a disc or an oval, one piece. A disc's size is its radius — its
  // corners are ON the circle, its box a chord's sagitta short of it.
  if (sides.length === 1 && curved.length === 1) {
    const r = pts.map((p) => Math.hypot(p.x, p.y));
    const rMax = Math.max(...r);
    if (rMax - Math.min(...r) <= 0.03 * rMax) {
      const D = Math.round(2 * rMax);
      return { kind: "round", widthMm: D, depthMm: D, radiusMm: Math.round(rMax), outline: [] };
    }
    return { kind: "round", widthMm, depthMm, outline: [] };
  }
  if (!curved.length) {
    const outline = sides.map((s) => s.pts[0]).map(round);
    return { kind: sides.length === 3 ? "triangle" : "angled", widthMm, depthMm, outline };
  }
  // A quarter: two straight sides of one length meeting square at the centre the arc is struck from.
  if (sides.length === 3 && straight.length === 2 && curved.length === 1) {
    const [s1, s2] = straight;
    const shared = [s1.pts[0], s1.pts[s1.pts.length - 1]].find((p) => [s2.pts[0], s2.pts[s2.pts.length - 1]].some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1));
    const r = (L(s1) + L(s2)) / 2;
    if (shared && Math.abs(L(s1) - L(s2)) <= 0.05 * r && allAt(curved[0], shared, r, 0.04 * r + 10)) {
      const R = Math.round(r);
      return { kind: "quarter", widthMm: R, depthMm: R, radiusMm: R, outline: [] };
    }
  }
  // A half-round: one straight side, the diameter, and the arc about its middle.
  if (sides.length === 2 && straight.length === 1) {
    const d = straight[0];
    const o = { x: (d.pts[0].x + d.pts[d.pts.length - 1].x) / 2, y: (d.pts[0].y + d.pts[d.pts.length - 1].y) / 2 };
    const r = L(d) / 2;
    if (allAt(curved[0], o, r, 0.04 * r + 10)) {
      const R = Math.round(r);
      return { kind: "half", widthMm: 2 * R, depthMm: R, radiusMm: R, outline: [] };
    }
  }
  const outline: Point[] = [];
  const edgeCurves: (EdgeCurve | null)[] = [];
  for (const s of sides) {
    if (!s.curved) {
      outline.push(round(s.pts[0]));
      edgeCurves.push(null);
      continue;
    }
    const z = bezierSide(s.pts);
    outline.push(...z.pts.map(round));
    edgeCurves.push(...z.curves.map((cv) => (cv ? { c1: round(cv.c1), c2: round(cv.c2) } : null)));
  }
  return { kind: "curve", widthMm, depthMm, outline, edgeCurves };
}

/** Four corners, each square, filling its box — a deck's shape, whatever it is turned to. */
export function isRectangle(poly: readonly Point[]): boolean {
  const pts = tidy(poly, 1);
  if (pts.length !== 4) return false;
  const b = boxOf(pts);
  return polyArea(pts) >= 0.995 * (b.x1 - b.x0) * (b.y1 - b.y0);
}

const round = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });
const corners4 = (w: number, d: number): Point[] => [
  { x: -w / 2, y: -d / 2 },
  { x: w / 2, y: -d / 2 },
  { x: w / 2, y: d / 2 },
  { x: -w / 2, y: d / 2 },
];

const cm = (mm: number) => Math.round(mm / 10);

/** What a piece is called in the catalog and on screen. */
export function pieceName(info: Pick<PieceInfo, "kind" | "widthMm" | "depthMm" | "radiusMm">): string {
  const size = `${cm(info.widthMm)}×${cm(info.depthMm)}`;
  switch (info.kind) {
    case "quarter":
      return `רבע עיגול R${cm(info.radiusMm ?? info.widthMm)}`;
    case "half":
      return `חצי עיגול R${cm(info.radiusMm ?? info.depthMm)}`;
    case "round":
      return Math.abs(info.widthMm - info.depthMm) <= 20 ? `עיגול ⌀${cm(info.widthMm)}` : `אליפסה ${size}`;
    case "triangle":
      return `משולש ${size}`;
    case "curve":
      return `פלטה מעוגלת ${size}`;
    case "angled":
      return `פלטה משופעת ${size}`;
    default:
      return `פלטה ${size}`;
  }
}

/** A catalog outline back as points — its béziers sampled — the way a stage piece is read. */
export function sampleOutline(outline: readonly Point[], edgeCurves?: readonly (EdgeCurve | null)[], steps = 12): Point[] {
  const out: Point[] = [];
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length];
    const cv = edgeCurves?.[i];
    out.push(a);
    if (!cv) return;
    const c1 = { x: a.x + cv.c1.x, y: a.y + cv.c1.y };
    const c2 = { x: b.x + cv.c2.x, y: b.y + cv.c2.y };
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      out.push({
        x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
        y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
      });
    }
  });
  return out;
}

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol;
  const arc = (cx: number, cy: number, r: number, from: number, to: number, n: number): Point[] =>
    Array.from({ length: n + 1 }, (_, k) => {
      const t = ((from + ((to - from) * k) / n) * Math.PI) / 180;
      return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
    });

  // Clipping.
  const sq = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }];
  assert(near(polyArea(clipToBox(sq, { x0: 500, y0: -10, x1: 2000, y1: 2000 })), 500_000), "a square clipped to its right half");
  assert(near(polyArea(clipY(sq, 250, true)), 750_000) && near(polyArea(clipY(sq, 250, false)), 250_000), "…and cut across");
  assert(tidy([{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 500 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }]).length === 4, "tidy drops points on a line and spikes");

  // A 12×5 body with an R1.8 half-round out of the middle of its front (the front along y = 0, the
  // body behind it at +y): two runs, each a quarter whose inner corner is the half-round's centre.
  const apron: Point[] = [{ x: 0, y: 0 }, ...arc(6000, 0, 1800, 180, 360, 16), { x: 12000, y: 0 }, { x: 12000, y: 5000 }, { x: 0, y: 5000 }];
  const apronSmooth = new Set(Array.from({ length: 15 }, (_, k) => k + 2));
  const segs = rimSegments(apron, apronSmooth);
  const runs = segs.flatMap((s) => (s.kind === "run" ? [s.run] : []));
  assert(runs.length === 2, "a half-round apron is two quarter runs");
  assert(runs.every((r) => near(r.inner.x, 6000) && near(r.inner.y, 0) && r.innerOk && r.outerOk), "…each turning about the half-round's centre");
  assert(near(polyArea(coreOutline(segs, () => false)), 12000 * 5000), "…and its core is the body alone");
  assert(runs.every((r) => near(polyArea(runRegion(r)), (Math.PI * 1800 * 1800) / 4, 30000)), "…and each rim region a quarter of the disc");
  // Without the smooth corners the same outline reads the same way (an odd chord count has no flat top).
  assert(rimSegments(apron).filter((s) => s.kind === "run").length === 2, "…smooth corners or not");
  // An even chord count puts a flat chord at the top: it is cut at its middle, not given to one half.
  const flatTop: Point[] = [{ x: 0, y: 0 }, ...arc(6000, 0, 1800, 180, 360, 15).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })), { x: 12000, y: 0 }, { x: 12000, y: 5000 }, { x: 0, y: 5000 }];
  const ft = rimSegments(flatTop, new Set(Array.from({ length: 14 }, (_, k) => k + 2))).flatMap((s) => (s.kind === "run" ? [s.run] : []));
  assert(ft.length === 2 && ft.every((r) => near(r.inner.x, 6000, 3)), "a flat chord at the apex is shared between the two halves");

  // A disc: four quarters about its centre, and no core at all.
  const disc = arc(0, 0, 2000, 0, 360, 32).slice(0, 32);
  const dsegs = rimSegments(disc, new Set(disc.map((_, i) => i)));
  const druns = dsegs.flatMap((s) => (s.kind === "run" ? [s.run] : []));
  assert(druns.length === 4 && druns.every((r) => near(r.inner.x, 0, 3) && near(r.inner.y, 0, 3)), "a disc is four quarters about its centre");
  assert(polyArea(coreOutline(dsegs, () => false)) < 1, "…with nothing between them for a deck");

  // A rectangle has no rim; a corner cut at 45° has one run, a triangle.
  assert(!rimSegments(sq).some((s) => s.kind === "run"), "a rectangle has no rim");
  const cut: Point[] = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 2000 }, { x: 5000, y: 3000 }, { x: 0, y: 3000 }];
  const cr = rimSegments(cut).flatMap((s) => (s.kind === "run" ? [s.run] : []));
  assert(cr.length === 1 && near(cr[0].inner.x, 5000) && near(cr[0].inner.y, 2000), "a 45° corner is one run, its inner corner on the stage");
  assert(near(cr[0].outer.x, 6000) && near(cr[0].outer.y, 3000), "…its outer one the square corner the cut took off");
  assert(describePiece(runRegion(cr[0])).kind === "triangle", "…and its rim is a triangle");

  // Shapes: a quarter is a quarter however it is turned; a half-round is not a quarter.
  const q = runRegion(runs[0]);
  const qi = describePiece(q);
  assert(qi.kind === "quarter" && near(qi.radiusMm!, 1800, 10), "the apron's rim is a quarter-round R180");
  assert(!!congruent(normal(q), normal(runRegion(runs[1]))), "…the same piece on both sides, one flipped");
  const half = [...arc(0, 0, 1000, 180, 360, 12)];
  const hi = describePiece(half);
  assert(hi.kind === "half" && near(hi.radiusMm!, 1000, 10), "a half-round is a half-round R100");
  assert(!congruent(normal(q), normal(half)), "…and not a quarter");
  assert(describePiece([{ x: 0, y: 0 }, { x: 1220, y: 0 }, { x: 0, y: 1220 }]).kind === "triangle", "a right triangle");
  assert(describePiece(sq).kind === "rect", "a square is a rectangle");

  // A sheet with one corner rounded R50: a curved deck, whose catalog outline reads back as itself.
  const rounded: Point[] = [{ x: 500, y: 0 }, { x: 2440, y: 0 }, { x: 2440, y: 1220 }, { x: 0, y: 1220 }, ...arc(500, 500, 500, 180, 270, 4).slice(0, 4)];
  const ri = describePiece(rounded);
  assert(ri.kind === "curve" && ri.widthMm === 2440 && ri.depthMm === 1220, "a sheet with a rounded corner is a curved deck 244×122");
  const back = sampleOutline(ri.outline, ri.edgeCurves);
  assert(!!congruent(normal(rounded), normal(back)), "…whose catalog drawing is the same piece");
  // A long bowed strip: its curve kept to within a centimetre or two when drawn back.
  const bow: Point[] = [{ x: 0, y: 0 }, { x: 2440, y: 0 }, ...Array.from({ length: 9 }, (_, k) => ({ x: 2440 - (2440 * k) / 8, y: -400 + 400 * ((2440 - (2440 * k) / 8) / 2440) ** 2 })).slice(0, 9)];
  const bi = describePiece(bow);
  const bowBack = sampleOutline(bi.outline, bi.edgeCurves);
  assert(bi.kind === "curve" && !!congruent(normal(bow), normal(bowBack), 25), "a bowed strip's drawing follows its curve");
  assert(pieceName(qi) === "רבע עיגול R180" && pieceName(hi) === "חצי עיגול R100" && pieceName(ri) === "פלטה מעוגלת 244×122", "pieces are named as the catalog names them");

  console.log("stage-rim self-check passed");
}
