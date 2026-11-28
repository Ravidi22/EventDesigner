// npm run check:dimensions — the self-check of ./dimensions.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/studio/hall";
import { overallDimensions } from "./dimensions";

// ponytail: self-check. Run: npm run check:dimensions
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const square: Point[] = [
  { x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 8000 }, { x: 0, y: 8000 },
];
const d = overallDimensions(square);
assert(d.length === 2, "a room is figured on two sides");
assert(d[0].label === "12.00" && d[1].label === "8.00", "a 12x8m hall is figured 12.00 and 8.00");
assert(d[0].from.y === 8000 && d[0].to.y === 8000, "the width runs along one edge, not through the room");
assert(overallDimensions([{ x: 0, y: 0 }, { x: 1, y: 1 }]).length === 0, "two points are not a room");
assert(overallDimensions([]).length === 0, "nothing is not a room either");

// An L-shape is figured on its bounding box, which is what "overall" means.
const ell: Point[] = [
  { x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 4000 }, { x: 4000, y: 4000 },
  { x: 4000, y: 9000 }, { x: 0, y: 9000 },
];
const e = overallDimensions(ell);
assert(e[0].label === "10.00" && e[1].label === "9.00", "an L-shaped hall is figured on its overall extent");
console.log("dimensions self-check passed");
