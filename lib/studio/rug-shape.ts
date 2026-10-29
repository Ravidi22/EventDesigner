// A RUG WITH CURVED SIDES — the shape canvas's "pull the middle of a side and it bows", on the plan.
//
// A rug is a stretch item: its size is a width × depth stored per placement (Placement.sizeMm), its
// corners are the handles. A bow is one more number per side — Placement.bows — stored as a FRACTION
// of the side's length, positive = out, so stretching the rug scales its curves with it and nothing
// has to be re-derived. Everything else about the shape is derived here, as the same cubic edges the
// shape canvas and the venue walls use (EdgeCurve, lib/studio/geometry.ts bulgeToCurve): the
// outline, its flattened polygon (clearance, the tape, what stands on the rug), the handle at each
// side's middle, and the custom footprint the surface fill and the printed map draw.
//
// The rug is about its RECTANGLE's centre, always — `position` is that centre, so bowing one side
// never moves the other three. The custom footprint a bowed rug draws as is recentred on its bounds
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

/** A side may bow out by up to half its length — a half-round end — and in by as much. */
export const MAX_RUG_BOW = 0.5;
/** A bow under this is a slip of the hand, not a curve. */
const NOISE = 0.004;

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

export const bowsOf = (p: Pick<Placement, "bows">): RugBows | undefined => cleanBows(p.bows);

/** One side with `fraction` of its length bowed in or out: the other three stay. */
export function withBow(bows: RugBows | undefined, side: number, fraction: number): RugBows | undefined {
  const next: RugBows = bows ? [...bows] : [0, 0, 0, 0];
  next[side] = fraction;
  return cleanBows(next);
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

export interface BowedRug {
  outline: Point[];
  edgeCurves: (EdgeCurve | null)[];
  /** As a footprint, for the seams that draw one (surface fill, picture). */
  footprint: Footprint;
  /** Where those seams will have shifted it to: the centre of what is drawn, relative to the rug's
   *  rectangle centre. Translate by this to put the drawing back. */
  centre: Point;
}

/** The rug's outline with its sides bowed, about the rectangle's centre. */
export function bowedRug(widthMm: number, depthMm: number, bows: RugBows): BowedRug {
  const sides = sidesOf(widthMm, depthMm);
  const outline = sides.map((s) => s.a);
  const edgeCurves = sides.map((s, i): EdgeCurve | null => {
    if (!bows[i]) return null;
    const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
    const sag = bows[i] * s.len;
    return bulgeToCurve(s.a, s.b, { x: mid.x + s.n.x * sag, y: mid.y + s.n.y * sag });
  });
  const b = customShapeBounds(outline, edgeCurves);
  return { outline, edgeCurves, footprint: { kind: "custom", outline, edgeCurves }, centre: { x: b.cx, y: b.cy } };
}

/** The rug as a polygon about its rectangle's centre — curves flattened. */
export function rugPolygon(widthMm: number, depthMm: number, bows: RugBows | undefined): Point[] {
  const sides = sidesOf(widthMm, depthMm);
  if (!bows) return sides.map((s) => s.a);
  const { outline, edgeCurves } = bowedRug(widthMm, depthMm, bows);
  return outline.flatMap((a, i) => flattenEdge(a, outline[(i + 1) % 4], edgeCurves[i]).slice(0, -1));
}

/** Where side `i`'s handle sits: the middle of the side as it is drawn. */
export function bowHandle(widthMm: number, depthMm: number, bows: RugBows | undefined, side: number): Point {
  const s = sidesOf(widthMm, depthMm)[side];
  if (!bows?.[side]) return { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
  const { edgeCurves } = bowedRug(widthMm, depthMm, bows);
  return edgeMidpoint(s.a, s.b, edgeCurves[side]);
}

/** The bow a handle dragged to `local` (in the rug's own frame) asks for — only how far it is
 *  pushed along the side's normal counts, so a sloppy drag cannot shear the rug. */
export function bowFromPoint(widthMm: number, depthMm: number, side: number, local: Point): number {
  const s = sidesOf(widthMm, depthMm)[side];
  const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
  const sag = (local.x - mid.x) * s.n.x + (local.y - mid.y) * s.n.y;
  return Math.max(-MAX_RUG_BOW, Math.min(MAX_RUG_BOW, sag / s.len));
}

/** The woven border's line: the rug's own outline pulled in by `insetMm` — the same bows on the
 *  smaller rectangle, so each curve keeps its character. Null when nothing is left to inset. */
export function rugInset(widthMm: number, depthMm: number, bows: RugBows, insetMm: number): BowedRug | null {
  const w = widthMm - insetMm * 2;
  const d = depthMm - insetMm * 2;
  return w > 1 && d > 1 ? bowedRug(w, d, bows) : null;
}

/** One strand of fringe: where it leaves the rug's edge, and the unit direction it hangs in. */
export interface FringeTick {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/** The fringe, `gapMm` apart along the rug's two SHORT ends — the ends it is woven from — leaving the
 *  edge as it is drawn: on a bowed end each strand starts on the curve and hangs along its normal.
 *  `max` caps a side (the 3D scene keeps its part count modest). */
export function rugFringe(widthMm: number, depthMm: number, bows: RugBows | undefined, gapMm: number, max = Infinity): FringeTick[] {
  const sides = sidesOf(widthMm, depthMm);
  const curves = bows ? bowedRug(widthMm, depthMm, bows).edgeCurves : [];
  const ends = widthMm >= depthMm ? [1, 3] : [0, 2];
  const out: FringeTick[] = [];
  for (const i of ends) {
    const { a, b, len } = sides[i];
    const n = Math.min(max, Math.floor(len / gapMm));
    const curve = curves[i];
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

  // The top side pulled out by 20% of its length = 400mm: the apex is at y = -500 - 400.
  const bows = withBow(undefined, 0, 0.2)!;
  assert(bows[0] === 0.2 && bows[1] === 0 && bows[2] === 0 && bows[3] === 0, "only the pulled side bows");
  const h = bowHandle(W, D, bows, 0);
  assert(near(h.x, 0) && near(h.y, -900), `the handle rides the apex (${h.x}, ${h.y})`);
  const poly = rugPolygon(W, D, bows);
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
  const rug = bowedRug(W, D, bows);
  assert(near(rug.centre.y, -200, 2) && near(rug.centre.x, 0, 0.5), `centre is half the bow (${rug.centre.y})`);
  // The border: the same bows on a smaller rectangle; nothing left of a rug thinner than its border.
  assert(rugInset(W, D, bows, 100)?.footprint.kind === "custom", "an inset is a rug of its own");
  assert(rugInset(W, 150, bows, 100) === null, "a rug thinner than its border has no inset");

  // The fringe hangs off the short ends, along the normal: a straight 2000×1000 rug has strands on
  // x = ±1000 pointing ±x; bow its right end out and they follow the curve, still pointing outward.
  const straight = rugFringe(W, D, undefined, 50);
  assert(straight.length === 40 && straight.every((t) => near(Math.abs(t.x), 1000, 1e-6) && near(Math.abs(t.nx), 1, 1e-9)), "straight fringe stands on the short ends");
  assert(straight.filter((t) => t.nx > 0).every((t) => t.x > 0), "…pointing away from the middle");
  const round = rugFringe(W, D, withBow(undefined, 1, 0.3), 50);
  const right = round.filter((t) => t.x > 0);
  assert(right.length === 20 && right.every((t) => t.nx > 0.2), "a bowed end's fringe hangs along the curve, outward");
  assert(Math.max(...right.map((t) => t.x)) > 1200, `…and sits on the bulge (${Math.max(...right.map((t) => t.x))})`);
  assert(rugFringe(W, D, undefined, 50, 5).length === 10, "the cap is per end");
  console.log("rug-shape: ok");
}
