// npm run check:align — the self-check of ./align.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { type CentredBox } from "./proximity";
import { alignedCentres, alignGuide, alignUnits } from "./align";

// ponytail: self-check. Run: npm run check:align
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const box = (x: number, y: number, w = 1000, d = 1000): CentredBox => ({ x, y, widthMm: w, depthMm: d });
// A 2m key at (0,0) — edges at x ±1000, y ±500 — and two others of different sizes.
const set = [box(0, 0, 2000, 1000), box(3000, 4000, 1000, 600), box(-5000, -2500, 600, 1800)];

const left = alignedCentres(set, 0, "left");
assert(left[0].x === 0 && left[0].y === 0, "the key never moves");
assert(left[1].x - 500 === -1000 && left[2].x - 300 === -1000, "every left edge lands on the key's left edge");
assert(left[1].y === 4000 && left[2].y === -2500, "…and nothing moves on the other axis");

const right = alignedCentres(set, 0, "right");
assert(right[1].x + 500 === 1000 && right[2].x + 300 === 1000, "right edges on the key's right edge");

const hc = alignedCentres(set, 0, "hcenter");
assert(hc[1].x === 0 && hc[2].x === 0 && hc[1].y === 4000, "horizontal centres on the key's centre line");

const top = alignedCentres(set, 0, "top");
assert(top[1].y - 300 === -500 && top[2].y - 900 === -500, "top edges on the key's top edge");
assert(top[1].x === 3000 && top[2].x === -5000, "…x untouched");

const bottom = alignedCentres(set, 0, "bottom");
assert(bottom[1].y + 300 === 500 && bottom[2].y + 900 === 500, "bottom edges on the key's bottom edge");

const mid = alignedCentres(set, 0, "vmiddle");
assert(mid[1].y === 0 && mid[2].y === 0, "vertical middles on the key's middle");

// A different key: the LAST one. It stays, and the others go to IT.
const byLast = alignedCentres(set, 2, "left");
assert(byLast[2].x === -5000 && byLast[2].y === -2500, "whichever unit is the key stays put");
assert(byLast[0].x - 1000 === -5300, "…and the first now lines up with it, not the other way round");

// Distribution: equal air, the ends stay, the axis is the one named.
const row = [box(0, 0, 1000), box(1200, 50, 1000), box(6000, 0, 1000)];
const spread = alignedCentres(row, 0, "distribute-x");
assert(spread[0].x === 0 && spread[2].x === 6000, "the two end units stay where they are");
assert(spread[1].x === 3000 && spread[1].y === 50, "the middle one gets equal air on both sides, keeping its y");
const col = alignedCentres(row, 0, "distribute-y");
assert(col[1].x === 1200, "distributing on y never moves anything on x");

// Units: a group is one box, in first-seen order.
const units = alignUnits([
  { key: "t:a", box: box(0, 0), groupId: "g" },
  { key: "t:b", box: box(1000, 0) },
  { key: "t:c", box: box(2000, 0), groupId: "g" },
]);
assert(units.length === 2 && units[0].key === "group:g", "a group is one unit, named where it first appears");
assert(units[0].box.widthMm === 3000 && units[0].box.x === 1000, "…boxed round all its members");

// Rotation is the caller's: a 2000×1000 table turned 90° arrives as a 1000×2000 box, and aligns by it.
const turned = alignedCentres([box(0, 0, 2000, 1000), box(5000, 0, 1000, 2000)], 0, "top");
assert(turned[1].y === 500, "a turned item aligns by the box it actually occupies");

// The guide: the key's own line, across the selection, and nothing for a distribution.
const gl = alignGuide(set, 0, "left")!;
assert(gl.axis === "x" && gl.at === -1000, "a left guide is the vertical line on the key's left edge");
assert(gl.from === -3400 - 400 && gl.to === 4300 + 400, "…spanning the selection's y extent plus the margin");
const gb = alignGuide(set, 0, "bottom")!;
assert(gb.axis === "y" && gb.at === 500 && gb.from === -5300 - 400 && gb.to === 3500 + 400, "a bottom guide is the horizontal line on the key's bottom edge, across x");
assert(alignGuide(set, 2, "hcenter")?.at === -5000, "the guide follows whichever unit is the key");
assert(alignGuide(set, 0, "distribute-x") === null, "a distribution has no one line to show");

console.log("align self-check passed");
