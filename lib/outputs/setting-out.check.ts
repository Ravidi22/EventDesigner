// npm run check:setting-out — the self-check of ./setting-out.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { cluster, settingOut } from "./setting-out";

// ponytail: self-check. Run: npm run check:setting-out
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const room = [{ x: 0, y: 0 }, { x: 20000, y: 0 }, { x: 20000, y: 12000 }, { x: 0, y: 12000 }];
// 3 columns × 2 rows of rounds, slightly off-grid the way hand-placed tables are.
const grid = [
  { x: 3000, y: 3000 }, { x: 8020, y: 2980 }, { x: 13000, y: 3010 },
  { x: 2990, y: 7000 }, { x: 8000, y: 7020 }, { x: 13010, y: 6990 },
];
const [cx, cy] = settingOut(grid, room);
assert(cx.axis === "x" && cx.stops.length === 5, "three columns chain wall → 3 centres → wall");
assert(Math.abs(cx.stops[1] - 2995) < 1 && cx.stops[4] === 20000, "a column is its tables' mean, the chain ends on the far wall");
assert(cy.stops.length === 4, "two rows chain wall → 2 centres → wall");
assert(cx.lineAt === -900 && cy.lineAt === -900, "both chains sit off the room, top and left");
assert(cx.feet[0].y === 3000, "a column's extension line ends at the table nearest the chain");
assert(cluster([0, 100, 5000, 5300], 450).length === 2, "values within tolerance are one row");

// A scatter: every table its own row and column — no chain.
const scatter = [{ x: 1000, y: 9000 }, { x: 4000, y: 2000 }, { x: 7500, y: 5500 }, { x: 12000, y: 800 }, { x: 16000, y: 10500 }];
assert(settingOut(scatter, room).length === 0, "a scatter gets no chain");
// One row of three is a clean layout even though every table is its own column.
assert(settingOut([{ x: 4000, y: 6000 }, { x: 9000, y: 6000 }, { x: 14000, y: 6000 }], room).length === 2, "a single row is chained");
assert(settingOut([], room).length === 0, "no tables, no chain");
console.log("setting-out self-check passed");
