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
