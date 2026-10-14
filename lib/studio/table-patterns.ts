// WHICH TABLES. "Put this on every table" is the common case, but a room is rarely dressed in one
// design: the tall centrepieces go on every other table so the room has rhythm, two designs alternate
// in a zig-zag so no two neighbours match, the rows nearest the dance floor get the candelabra. This
// answers "which tables is that" for each of those, from where the tables stand on the plan.
//
// Every pattern is read RELATIVE TO THE SOURCE TABLE — the one being copied from. A zig-zag has two
// halves, and "the half this table is in" is the one the designer means; `invert` is the other half,
// which is how two designs are laid in alternation (dress A, apply its half; dress B, apply the other).
//
// Rows and columns are found, not assumed: the tables are clustered by where they stand (rows by y,
// columns by x), with a tolerance of half a table, so a hall laid out by hand rather than by a grid
// still reads as the rows the designer sees. Pure, and self-checked.
import type { Point } from "@/lib/design-document/types";
import { isMain } from "@/lib/self-check";

export type TablePattern = "all" | "type" | "checker" | "alternate" | "rows" | "columns" | "selected";

export const PATTERN_LABEL: Record<TablePattern, string> = {
  all: "כל השולחנות",
  type: "אותו סוג",
  checker: "זיגזג",
  alternate: "לסירוגין",
  rows: "שורות לסירוגין",
  columns: "טורים לסירוגין",
  selected: "השולחנות שנבחרו",
};

export const PATTERN_HINT: Record<TablePattern, string> = {
  all: "כל שולחן בתוכנית.",
  type: "כל השולחנות מאותו סוג כמו השולחן הזה.",
  checker: "כמו לוח שחמט — אף שני שכנים לא זהים. לחצי השני: עיצוב אחר באותו דפוס.",
  alternate: "כל שולחן שני לפי המספור.",
  rows: "שורה כן, שורה לא.",
  columns: "טור כן, טור לא.",
  selected: "רק השולחנות שמסומנים עכשיו על התוכנית.",
};

/** Whether a pattern has two halves worth choosing between. */
export const PATTERN_HALVES: Record<TablePattern, boolean> = {
  all: false,
  type: false,
  checker: true,
  alternate: true,
  rows: true,
  columns: true,
  selected: false,
};

export interface PatternTable {
  id: string;
  position: Point;
  number: number;
  type: string;
  /** Its larger side, mm — what "the same row" is measured against. */
  sizeMm: number;
}

/** Cluster coordinates into bands: sorted, and a new band starts where the gap from the band's mean
 *  is more than half a table. Returns band index per table id. */
function bands(tables: PatternTable[], coord: (t: PatternTable) => number): Map<string, number> {
  const sorted = [...tables].sort((a, b) => coord(a) - coord(b));
  const sizes = tables.map((t) => t.sizeMm).sort((a, b) => a - b);
  const tol = Math.max(300, (sizes[Math.floor(sizes.length / 2)] ?? 1000) * 0.5);
  const out = new Map<string, number>();
  let band = -1;
  let sum = 0;
  let n = 0;
  for (const t of sorted) {
    if (n === 0 || coord(t) - sum / n > tol) {
      band++;
      sum = 0;
      n = 0;
    }
    sum += coord(t);
    n++;
    out.set(t.id, band);
  }
  return out;
}

/** The ids of the tables a pattern picks out, relative to `sourceId`. */
export function patternTables(
  tables: PatternTable[],
  pattern: TablePattern,
  opts: { sourceId?: string; selectedIds?: string[]; invert?: boolean } = {},
): string[] {
  const source = tables.find((t) => t.id === opts.sourceId);
  if (pattern === "all") return tables.map((t) => t.id);
  if (pattern === "selected") return tables.filter((t) => opts.selectedIds?.includes(t.id)).map((t) => t.id);
  if (pattern === "type") return source ? tables.filter((t) => t.type === source.type).map((t) => t.id) : tables.map((t) => t.id);

  let parity: Map<string, number>;
  if (pattern === "alternate") {
    const ordered = [...tables].sort((a, b) => a.number - b.number || a.position.y - b.position.y || a.position.x - b.position.x);
    parity = new Map(ordered.map((t, i) => [t.id, i % 2]));
  } else {
    const rows = bands(tables, (t) => t.position.y);
    const cols = bands(tables, (t) => t.position.x);
    parity = new Map(
      tables.map((t) => {
        const r = rows.get(t.id) ?? 0;
        const c = cols.get(t.id) ?? 0;
        return [t.id, (pattern === "rows" ? r : pattern === "columns" ? c : r + c) % 2];
      }),
    );
  }
  const want = ((source ? parity.get(source.id) ?? 0 : 0) + (opts.invert ? 1 : 0)) % 2;
  return tables.filter((t) => parity.get(t.id) === want).map((t) => t.id);
}

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  // A 4 × 3 grid of rounds, 3m apart, a little hand-placed jitter, numbered row by row.
  const grid: PatternTable[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++)
      grid.push({ id: `${r}${c}`, position: { x: c * 3000 + ((r + c) % 2) * 120, y: r * 3000 - (c % 2) * 90 }, number: r * 4 + c + 1, type: c === 3 ? "מלבן" : "עגול", sizeMm: 1800 });
  const set = (ids: string[]) => ids.sort().join(",");

  assert(patternTables(grid, "all").length === 12, "all is every table");
  assert(patternTables(grid, "type", { sourceId: "00" }).length === 9, "type follows the source's type");

  const checker = patternTables(grid, "checker", { sourceId: "00" });
  assert(set(checker) === set(["00", "02", "11", "13", "20", "22"]), "a zig-zag takes the source's squares");
  const other = patternTables(grid, "checker", { sourceId: "00", invert: true });
  assert(other.length === 6 && other.every((id) => !checker.includes(id)), "…and invert is exactly the other half");
  assert(set(patternTables(grid, "checker", { sourceId: "01" })) === set(other), "the half is the source's own");

  assert(set(patternTables(grid, "rows", { sourceId: "10" })) === set(["10", "11", "12", "13"]), "rows: the source's row and every other");
  assert(set(patternTables(grid, "columns", { sourceId: "00" })) === set(["00", "10", "20", "02", "12", "22"]), "columns alternate across the room");
  assert(set(patternTables(grid, "alternate", { sourceId: "00" })) === set(["00", "02", "10", "12", "20", "22"]), "alternate goes by number");
  assert(set(patternTables(grid, "selected", { selectedIds: ["00", "13", "nope"] })) === set(["00", "13"]), "selected is the selection, of tables only");
  assert(patternTables([], "checker", { sourceId: "x" }).length === 0, "an empty room picks nothing");

  console.log("table-patterns: all checks passed");
}
