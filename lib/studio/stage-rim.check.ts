// npm run check:stage-rim — the self-check of ./stage-rim.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/design-document/types";
import { clipToBox, clipY, congruent, coreOutline, describePiece, normal, pieceName, polyArea, rimSegments, runRegion, sampleOutline, tidy } from "./stage-rim";

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
