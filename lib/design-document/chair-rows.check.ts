// npm run check:chair-rows — the self-check of ./chair-rows.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "./types";
import { chairRowsCount, chairRowsLayout, chairRowsMove, cleanRows, FALLBACK_CHAIR, MAX_PER_ROW, MAX_ROWS, type ChairRowsLayout } from "./chair-rows";

// ponytail: self-check. Run: npm run check:chair-rows
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const chair = { widthMm: 450, depthMm: 500 };

// The user's picture: five rows of five.
const five = chairRowsLayout({ rows: 5, perRow: 5 }, chair);
assert(five.chairs.length === 25 && chairRowsCount({ rows: 5, perRow: 5 }) === 25, "five rows of five is 25 chairs");
assert(five.widthMm === 5 * 450 + 4 * 50 && five.depthMm === 5 * 500 + 4 * 450, `the block is 2.45 × 4.30 m (${five.widthMm} × ${five.depthMm})`);
assert(five.chairs[0].y > five.chairs[24].y && Math.abs(five.chairs[0].y - (five.depthMm / 2 - 250)) < 1e-9, "row 1 is the front, at the +y edge");
assert(Math.abs(five.chairs[0].x + five.widthMm / 2 - 225) < 1e-9 && Math.abs(five.chairs[4].x - (five.widthMm / 2 - 225)) < 1e-9, "a row runs edge to edge of the block");
const xs = five.chairs.map((p) => p.x);
assert(Math.abs(Math.min(...xs) + Math.max(...xs)) < 1e-9, "…centred on the block's middle line");

// A centre aisle: a row of 9 is 5 | 4, the aisle between them, the block wider by aisle − gap.
const aisled = chairRowsLayout({ rows: 2, perRow: 9, aisleMm: 1200 }, chair);
assert(aisled.firstSide === 5 && aisled.widthMm === 9 * 450 + 8 * 50 + 1150, "an aisle splits a row of 9 into 5 and 4 and widens the block by itself less one gap");
const left = aisled.chairs[4];
const right = aisled.chairs[5];
assert(Math.abs(right.x - left.x - 450 - 1200) < 1e-9, "…and the clear space across it is the aisle's width");
assert(!!aisled.aisle && Math.abs(aisled.aisle!.x - (left.x + right.x) / 2) < 1e-9, "the aisle's middle is halfway between the chairs either side of it");
assert(!chairRowsLayout({ rows: 3, perRow: 1, aisleMm: 1200 }, chair).aisle, "a single column has no aisle to split");

// The gaps are the designer's: legroom and a hand's width.
const roomy = chairRowsLayout({ rows: 2, perRow: 2, gapMm: 0, rowGapMm: 900 }, chair);
assert(roomy.widthMm === 900 && roomy.depthMm === 1900, "chairs touching, 90cm of legroom");

// What is stored is clean: whole numbers in range, defaults left out.
assert(JSON.stringify(cleanRows({ rows: 5.4, perRow: 0, gapMm: 50, rowGapMm: 450, aisleMm: 0 })) === JSON.stringify({ rows: 5, perRow: 1 }), "defaults are not stored, nonsense is clamped");
assert(cleanRows({ rows: 999, perRow: 999 }).rows === MAX_ROWS && chairRowsCount({ rows: 999, perRow: 999 }) === MAX_ROWS * MAX_PER_ROW, "a typo cannot order ten thousand chairs");
assert(chairRowsLayout({ rows: 1, perRow: 1 }, { widthMm: 0, depthMm: 0 }).widthMm === FALLBACK_CHAIR.widthMm, "a chair with no size is laid at a dining chair's");

// More rows grow the block backward: the front row stays put, square or turned.
const before = chairRowsLayout({ rows: 5, perRow: 5 }, chair);
const after = chairRowsLayout({ rows: 8, perRow: 5 }, chair);
const frontY = (pos: Point, l: ChairRowsLayout) => pos.y + l.depthMm / 2;
const moved = chairRowsMove({ x: 0, y: 0 }, 0, before, after);
assert(Math.abs(frontY(moved, after) - frontY({ x: 0, y: 0 }, before)) <= 1 && moved.x === 0, "three more rows: the front edge has not moved, the block grew back");
const turned = chairRowsMove({ x: 1000, y: 1000 }, 90, before, after);
// Turned 90°, the block's +y points along the room's −x: its front edge is at x − depth/2.
assert(Math.abs(turned.x - after.depthMm / 2 - (1000 - before.depthMm / 2)) <= 1 && turned.y === 1000, "…and turned a quarter, the same edge holds");

console.log("chair rows: ok");
