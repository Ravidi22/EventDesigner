// npm run check:region — the self-check of ./region-edit.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/studio/hall";
import { insertRegionPoint, moveRegionPoint, removeRegionPoint, tidyRegion } from "./region-edit";

// ponytail: self-check. Run: npm run check:region
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const same = (a: Point[], b: Point[]) => JSON.stringify(a) === JSON.stringify(b);
const square: Point[] = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }];

assert(moveRegionPoint(square, 1, { x: 1200.4, y: 10 })[1].x === 1200, "a moved corner lands on whole millimetres");
const ins = insertRegionPoint(square, 3);
assert(ins.boundary.length === 5 && ins.index === 4 && same([ins.boundary[4]], [{ x: 0, y: 500 }]), "inserting on the closing edge lands mid-edge, at the end");
assert(removeRegionPoint(square, 0).length === 3, "a corner can be removed");
assert(removeRegionPoint(removeRegionPoint(square, 0), 0).length === 3, "…but never below three");

// A wobbly hand trace of a 10×6m room with a chamfered corner.
const traced: Point[] = [
  { x: 0, y: 30 },
  { x: 5000, y: -20 }, // a stray click along the top wall
  { x: 8000, y: 10 },
  { x: 10000, y: 2000 }, // the chamfer: a real diagonal, kept
  { x: 10040, y: 6000 },
  { x: -30, y: 5970 },
];
const tidy = tidyRegion(traced);
assert(tidy.length === 5, `the stray point along a straight wall goes (got ${tidy.length})`);
assert(tidy[0].y === tidy[1].y, "the top edge is exactly horizontal");
assert(tidy[4].x === tidy[0].x, "the left edge is exactly vertical");
assert(tidy[2].x !== tidy[1].x && tidy[2].y !== tidy[1].y, "the chamfer stays a diagonal");
assert(same(tidyRegion(square), square), "a tidy outline is left as it is");

console.log("region edit: ok");
