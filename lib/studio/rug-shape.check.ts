// npm run check:rug-shape — the self-check of ./rug-shape.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { EdgeCurve, Point } from "./hall";
import { flattenEdge } from "./footprint";
import { type Border } from "../catalog/border";
import { bowFromPoint, bowHandle, cleanBows, cornerFromPoint, cornerHandle, DIAG, fitCorners, MAX_RUG_BOW, rugBorderBands, rugFringe, rugInset, rugOutline, rugPolygon, rugShapeOf, withBow, withCorner, type RugShape } from "./rug-shape";

// ponytail: self-check. Run: npm run check:rug-shape
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

// A CONTOUR on a bowed-and-rounded rug (2026-11-07): every band inside the rug, the edge band's
// inside 12cm in all the way round — on the bows and round the arcs too — and the second band
// nested inside it, past the gap.
{
  const shape: RugShape = { bows: [0.15, -0.2, 0.1, -0.3], corners: [300, 0, 500, 100] };
  const W2 = 3000, D2 = 2000;
  const border: Border = { widthMm: 120, colour: "#c9a24a", inner: { widthMm: 40, gapMm: 60, colour: "#ffffff" } };
  const rugPoly = rugPolygon(W2, D2, shape);
  const inside = (p: Point, poly: Point[]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  const segDist = (p: Point, a: Point, b: Point) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  const edgeDist = (p: Point) => Math.min(...rugPoly.map((a, i) => segDist(p, a, rugPoly[(i + 1) % rugPoly.length])));
  const flat = (o: { outline: Point[]; edgeCurves?: (EdgeCurve | null)[] }) =>
    o.outline.flatMap((a, i) => flattenEdge(a, o.outline[(i + 1) % o.outline.length], o.edgeCurves?.[i]).slice(0, -1));
  const bands = rugBorderBands(W2, D2, shape, border);
  assert(bands.length === 2 && bands[0].which === "outer" && bands[1].which === "inner", "two bands, the edge's and the inner one");
  assert(bands[0].outer.outline.length === rugOutline(W2, D2, shape).outline.length, "the edge band starts at the rug's own outline");
  const edgeIn = flat(bands[0].inner!);
  const ds = edgeIn.map(edgeDist);
  assert(edgeIn.every((p) => inside(p, rugPoly)), "the edge band's inside is inside the rug");
  assert(Math.min(...ds) > 120 - 4 && Math.max(...ds) < 120 + 6, `…12cm in all the way round, bows and arcs too (${Math.min(...ds).toFixed(1)}–${Math.max(...ds).toFixed(1)})`);
  const second = [...flat(bands[1].outer), ...flat(bands[1].inner!)];
  assert(second.every((p) => inside(p, rugPoly) && edgeDist(p) > 180 - 6), "the second band is inside the rug, past the first and the gap");
  // A plain rug the canvas draws with rounded corners: the band follows them.
  const plain = rugBorderBands(2000, 1000, undefined, { widthMm: 100, colour: "#000" }, 30);
  assert(plain[0].outer.edgeCurves?.filter(Boolean).length === 4, "a plain rug's band follows the canvas's rounded corners");
}
console.log("rug-shape: ok");
