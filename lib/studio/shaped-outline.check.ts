// npm run check:shaped-outline — the self-check of ./shaped-outline.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "./hall";
import { add, bezAt, bowShapeSide, carryShape, cleanShape, commonRadius, cornerAtPoint, cornerGrip, cubicOf, dist, dot, fitCornerRadii, FLATTEN_TOL_MM, flattenOutline, insertShapePoint, mul, nearestOnSide, outlineAreaMm2, removeShapePoint, roundShapeCorner, segDir, segOf, shapedOutline, sideBowMm, signedArea, smoothShape, sub, type OutlineShape } from "./shaped-outline";

// ponytail: self-check. Run: npm run check:shaped-outline
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
