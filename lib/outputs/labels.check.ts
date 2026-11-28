// npm run check:labels — the self-check of ./labels.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { placeLabels, type Box } from "./labels";

// ponytail: self-check. Run: npm run check:labels
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const line = { a: { x: 0, y: 0 }, b: { x: 10000, y: 0 }, w: 1000, h: 400, gap: 100, side: -1 as const };
const [free] = placeLabels([line], []);
assert(free.x === 5000 && free.y < 0, "a clear line puts its figure at the middle, on its side");
const door: Box = { minX: 4000, minY: -2000, maxX: 6000, maxY: 2000 };
const [moved] = placeLabels([line], [door]);
assert(moved.x + 500 <= 4000 || moved.x - 500 >= 6000, "a figure slides off a door");
const [one, two] = placeLabels([line, line], []);
assert(Math.abs(one.x - two.x) >= 1000 || Math.abs(one.y - two.y) >= 400, "two figures never land on each other");
const short = { ...line, b: { x: 600, y: 0 } };
const [past] = placeLabels([short], [{ minX: -50, minY: -2000, maxX: 650, maxY: 2000 }]);
assert(past.x + 500 <= -50 || past.x - 500 >= 650, "a figure too big for its line goes past the end");
const [onLine] = placeLabels([{ ...line, inline: true }], []);
assert(onLine.y === 0, "an inline figure sits on its own line when it can");
// An L-shaped stage: its top-left run's figure belongs ABOVE that run, in the notch the bounding
// box would have called occupied — and never on the stage.
const ell = [{ x: 0, y: 2000 }, { x: 4000, y: 2000 }, { x: 4000, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 8000 }, { x: 0, y: 8000 }];
const [topRun] = placeLabels([{ a: { x: 0, y: 1700 }, b: { x: 4000, y: 1700 }, w: 1000, h: 400, gap: 100, side: -1 }], [], [], [ell]);
assert(topRun.y < 1700 && topRun.x > 0 && topRun.x < 4000, "a figure sits outside the stage, alongside its own run");
const [pushed] = placeLabels([{ a: { x: 0, y: 1700 }, b: { x: 4000, y: 1700 }, w: 1000, h: 400, gap: 100, side: 1 }], [], [], [ell]);
assert(pushed.y < 1700, "a figure whose preferred side is the stage goes to the other side");
console.log("labels self-check passed");
