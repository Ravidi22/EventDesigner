// npm run check:label-anchor — the self-check of ./label-anchor.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/design-document/types";
import { footprintOutlines, shapeFootprint, type Footprint } from "./footprint";
import { flatRing, inradiusOf, labelAnchor, ORIGIN, signedDistance } from "./label-anchor";

// ponytail: self-check. Run: npm run check:label-anchor
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (p: Point, q: Point, tol: number) => Math.hypot(p.x - q.x, p.y - q.y) <= tol;
const ringOf = (f: Footprint) => flatRing(footprintOutlines(f)[0]);
const depth = (f: Footprint, p: Point) => signedDistance(p.x, p.y, ringOf(f));

// The primitives are labelled at their centre, exactly — nothing that was right moves.
assert(near(labelAnchor({ kind: "rect", widthMm: 1800, depthMm: 800 }), ORIGIN, 0), "a rectangle is labelled at its centre");
assert(near(labelAnchor({ kind: "circle", diameterMm: 1800 }), ORIGIN, 0), "a round is labelled at its centre");
assert(near(labelAnchor({ kind: "ellipse", widthMm: 1800, depthMm: 900 }), ORIGIN, 0), "an ellipse is labelled at its centre");

// A square drawn by hand, anywhere on the page: the answer is in the footprint's own frame.
const square: Footprint = { kind: "custom", outline: [{ x: 1000, y: 1000 }, { x: 2000, y: 1000 }, { x: 2000, y: 2000 }, { x: 1000, y: 2000 }] };
assert(near(labelAnchor(square), ORIGIN, 6), "a hand-drawn square is labelled at its centre, in its own frame");

// The arc of the report: a half ring 2.4m across with a 30cm band. Its box centre is in the air.
const half: Footprint = shapeFootprint("arc", { diameterMm: 2400, arc: { sweepDeg: 180, bandMm: 300 } });
assert(depth(half, ORIGIN) < 0, "sanity: a half ring's box centre is OUTSIDE the band — that was the bug");
const onHalf = labelAnchor(half);
assert(depth(half, onHalf) > 0, "a half ring is labelled inside its band");
assert(Math.abs(onHalf.x) <= 12, "…at the apex, on the arc's axis of symmetry, not wherever along the band the search looked first");
assert(Math.abs(depth(half, onHalf) - 150) <= 12, "…in the middle of the band, as far from the inner edge as the outer");

// A quarter ring's box centre is inside, but on the inner edge — the label straddled the line.
const quarter: Footprint = shapeFootprint("arc", { diameterMm: 2400, arc: { sweepDeg: 90, bandMm: 300 } });
assert(depth(quarter, ORIGIN) < 60, "sanity: a quarter ring's box centre is within 6cm of its inner edge");
const onQuarter = labelAnchor(quarter);
assert(Math.abs(depth(quarter, onQuarter) - 150) <= 12 && Math.abs(onQuarter.x) <= 12, "a quarter ring is labelled in the middle of the band, at the apex");

// An L: the box centre is in the notch. The label lands in a limb, by the elbow — inside, as deep
// as the limb allows, and the point of it nearest the L's middle.
const L: Footprint = { kind: "custom", outline: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 1000 }, { x: 1000, y: 1000 }, { x: 1000, y: 3000 }, { x: 0, y: 3000 }] };
assert(depth(L, ORIGIN) < 0, "sanity: an L's box centre is in its notch");
const onL = labelAnchor(L);
assert(depth(L, onL) >= 500 - 12, "an L is labelled as deep inside as its limbs allow");
assert(onL.x < 0 && onL.y < 0, "…by the elbow, the part of the L nearest its middle");

// A composite is labelled on its largest part.
const multi: Footprint = {
  kind: "multi",
  parts: [
    { outline: [{ x: -1500, y: -300 }, { x: 500, y: -300 }, { x: 500, y: 300 }, { x: -1500, y: 300 }] },
    { outline: [{ x: 500, y: -500 }, { x: 1500, y: -500 }, { x: 1500, y: 500 }, { x: 500, y: 500 }] },
  ],
};
assert(near(labelAnchor(multi), { x: -500, y: 0 }, 12), "a composite is labelled on its largest part, not on its box centre");

// Deterministic, and the same object the second time round.
assert(labelAnchor(half) === onHalf, "the answer is kept per footprint");

// The inradius — how deep a band may be cut before nothing is left inside (SH-12).
const within = (a: number, b: number) => Math.abs(a - b) <= Math.max(2, b * 0.01);
assert(within(inradiusOf(ringOf({ kind: "circle", diameterMm: 600 })), 300), "a ⌀60 circle holds a circle 30 cm in radius");
assert(within(inradiusOf(ringOf({ kind: "rect", widthMm: 1200, depthMm: 600 })), 300), "a 120×60 rectangle, half its depth");
assert(within(inradiusOf(ringOf(L)), (1000 * Math.SQRT2) / (1 + Math.SQRT2)), "an L, at its elbow — deeper than half its limbs");
assert(within(inradiusOf(ringOf(half)), 150), "a half ring 30 cm deep, half its band");

console.log("label-anchor self-check passed");
