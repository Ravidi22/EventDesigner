// npm run check:pool — the self-check of ./pool.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { customShapeBounds } from "../studio/footprint";
import { asOutline, featureEditOutline, featureWorldOutline } from "./face-surfaces";
import { featureFootprint, newFeature, type StructureFeature } from "./structure";
import { newPoolFeature } from "./pool";

function footprintBoxOf(f: Omit<StructureFeature, "id">) {
  const fp = featureFootprint(f);
  return fp.kind === "custom" ? customShapeBounds(fp.outline, fp.edgeCurves) : { w: f.widthMm, h: f.depthMm };
}

// ponytail: self-check. Run: npm run check:pool
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const at = { x: 5000, y: 3000 };

// The plain two are the feature's own shapes; the ellipse is exactly the pool there always was.
const rect = newPoolFeature("rect", at);
assert(rect.kind === "pool" && rect.shape === "rect" && rect.widthMm === 10000 && rect.depthMm === 5000 && !rect.outline, "a rectangular pool is a rect feature");
const oval = newPoolFeature("ellipse", at);
const plain = newFeature("pool", at);
assert(oval.shape === plain.shape && oval.widthMm === plain.widthMm && oval.depthMm === plain.depthMm, "the ellipse is the plain pool, unchanged");

// The kidney: one custom outline, every corner rounded, the waist bowed IN, drawn to its box.
const kidney = newPoolFeature("kidney", at);
assert(kidney.shape === "custom" && kidney.outline?.length === 4, "a kidney is four points of a hand-drawn outline");
assert((kidney.corners ?? []).every((r) => (r ?? 0) > 0) && !!kidney.edgeCurves?.[0], "…all four rounded, the waist side bowed");
const kfp = featureFootprint(kidney);
assert(kfp.kind === "custom", "…drawn as a custom footprint");
const kb = kfp.kind === "custom" ? customShapeBounds(kfp.outline, kfp.edgeCurves) : null;
assert(!!kb && near(kb.w, 10000, 100) && near(kb.h, 5000, 50), `…filling its 10 × 5 box (${kb?.w.toFixed(0)} × ${kb?.h.toFixed(0)})`);
assert(near(kidney.widthMm, kb!.w, 1) && near(kidney.depthMm, kb!.h, 1), "…which is the box the feature says it has");
// Two UNEQUAL lobes: the left end stands taller than the right one, and the waist dips in between.
const pts = kfp.kind === "custom" ? kfp.outline.flatMap((a, i) => {
  const b = kfp.outline[(i + 1) % kfp.outline.length];
  const c = kfp.edgeCurves?.[i];
  if (!c) return [a];
  return Array.from({ length: 16 }, (_, k) => {
    const t = k / 16, u = 1 - t;
    const c1 = { x: a.x + c.c1.x, y: a.y + c.c1.y };
    const c2 = { x: b.x + c.c2.x, y: b.y + c.c2.y };
    return { x: u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x, y: u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y };
  });
}) : [];
const span = (x0: number, x1: number) => {
  const ys = pts.filter((p) => p.x >= x0 && p.x <= x1).map((p) => p.y);
  return { top: Math.min(...ys), bottom: Math.max(...ys) };
};
const left = span(-3500, -2500);
const right = span(2500, 3500);
const waist = span(-500, 500);
assert(left.bottom - left.top > (right.bottom - right.top) * 1.15, `the left lobe is the bigger one (${(left.bottom - left.top).toFixed(0)} vs ${(right.bottom - right.top).toFixed(0)})`);
assert(waist.top > left.top + 600 && waist.top > right.top, `…and the waist is drawn in between them (${waist.top.toFixed(0)})`);

// The ר: six points, a bar and a leg, every corner rounded a little, filling its box.
const L = newPoolFeature("L", at);
assert(L.shape === "custom" && L.outline?.length === 6 && (L.corners ?? []).every((r) => (r ?? 0) > 0), "a ר is six points, every corner rounded");
const lfp = featureFootprint(L);
const lb = lfp.kind === "custom" ? customShapeBounds(lfp.outline, lfp.edgeCurves) : null;
assert(!!lb && near(lb.w, 10000, 10) && near(lb.h, 7000, 10), `…filling its 10 × 7 box (${lb?.w.toFixed(0)} × ${lb?.h.toFixed(0)})`);
assert(near(L.x, at.x, 1) && near(L.y, at.y, 1), "…standing where it was put");

// Any size asked for is the size drawn.
const big = newPoolFeature("kidney", at, { widthMm: 16000, depthMm: 6000 });
const bb = footprintBoxOf(big);
assert(near(bb.w, 16000, 160) && near(bb.h, 6000, 60), `a kidney asked 16 × 6 is drawn 16 × 6 (${bb.w.toFixed(0)} × ${bb.h.toFixed(0)})`);
// A kidney TURNED 30° and handed to the outline editor: read and written straight back (the first
// edit bakes the turn into the points), it is drawn where it was — bows, arcs and all.
const turned = { ...kidney, id: "k", rotationDeg: 30 } as StructureFeature;
const before = featureWorldOutline(turned);
const read = featureEditOutline(turned);
const baked = { ...turned, ...asOutline(read.outline, read.edgeCurves, read.corners) } as StructureFeature;
assert(baked.rotationDeg === 0 && baked.corners?.length === 4 && !!baked.edgeCurves?.[0], "an edit bakes the turn, keeping the bows and radii");
const after = featureWorldOutline(baked);
const drift = after.length === before.length ? Math.max(...before.map((p, i) => Math.hypot(p.x - after[i].x, p.y - after[i].y))) : Infinity;
assert(drift < 2, `…and draws it where it stood, point for point (${drift.toFixed(2)}mm — the points' rounding to whole mm)`);
console.log("pool presets: ok");
