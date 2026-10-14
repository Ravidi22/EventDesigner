// SETTING-OUT DIMENSIONS — where the crew puts the first table.
//
// The overall width and depth (dimensions.ts) say how big the room is; they do not say where
// anything goes in it. A crew handed a plan with only those measures the first row off the wall by
// eye, and the error accumulates down the room until the last row does not fit. What they actually
// need is a CHAIN along one wall: wall → first column of tables → next column → … → far wall, and
// the same down the other wall for the rows, measured to the table CENTRES — the point a crew marks
// on the floor and stands a table on.
//
// Derived, never drawn: the columns are the tables' own x positions clustered, the rows their y
// positions. A designer who drags a table re-derives the chain, and there is no dimension object to
// forget to update. When the tables are not laid in rows (a scatter of rounds in a garden), a chain
// would be a dimension per table and help nobody, so none is drawn — see `regular`.
import type { Point } from "@/lib/studio/hall";
import { isMain } from "../self-check";

export interface Chain {
  /** "x": a horizontal chain (columns), drawn above the room. "y": a vertical chain (rows), drawn
   *  down its left side. */
  axis: "x" | "y";
  /** The line's own coordinate on the other axis (y for an "x" chain), in world mm. */
  lineAt: number;
  /** Positions along the chain, sorted: the wall, each column/row centre, the far wall. */
  stops: number[];
  /** For each interior stop, the table centre nearest the chain — where its extension line ends. */
  feet: Point[];
}

/** Values within `tol` of a cluster's running mean join it. Returns the means, sorted. */
export function cluster(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: { sum: number; n: number }[] = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(v - last.sum / last.n) <= tol) {
      last.sum += v;
      last.n += 1;
    } else out.push({ sum: v, n: 1 });
  }
  return out.map((c) => c.sum / c.n);
}

/**
 * The chains for one room.
 *
 * `centres` are the numbered units' centres (a block of tables is one centre). `boundary` is the
 * zone's outline; the chains run along its bounding box, top and left, opposite the overall
 * dimensions (which take the bottom and right), so the two never share a side.
 */
export function settingOut(centres: Point[], boundary: Point[], { toleranceMm = 450, offsetMm = 900 } = {}): Chain[] {
  if (centres.length === 0 || boundary.length < 3) return [];
  const xs = boundary.map((p) => p.x);
  const ys = boundary.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const cols = cluster(centres.map((c) => c.x), toleranceMm).filter((x) => x > minX && x < maxX);
  const rows = cluster(centres.map((c) => c.y), toleranceMm).filter((y) => y > minY && y < maxY);
  // A grid of R rows and C columns holds at most R×C tables; a scatter of N has about N of each, so
  // R×C ≈ N². Allowing 1.6× slack keeps a grid with a few odd tables (a head table, a bar-side
  // round) and refuses a scatter.
  const regular = cols.length * rows.length <= Math.max(4, centres.length * 1.6);
  if (!regular) return [];
  const nearest = (axis: "x" | "y", at: number): Point => {
    const along = centres.filter((c) => Math.abs((axis === "x" ? c.x : c.y) - at) <= toleranceMm);
    return along.reduce((best, c) => ((axis === "x" ? c.y < best.y : c.x < best.x) ? c : best), along[0]);
  };
  return [
    { axis: "x", lineAt: minY - offsetMm, stops: [minX, ...cols, maxX], feet: cols.map((x) => ({ ...nearest("x", x), x })) },
    { axis: "y", lineAt: minX - offsetMm, stops: [minY, ...rows, maxY], feet: rows.map((y) => ({ ...nearest("y", y), y })) },
  ];
}

// ponytail: self-check. Run: npm run check:setting-out
if (isMain(import.meta.url)) {
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
}
