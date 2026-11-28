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

// A BLOCK of grouped tables is ONE table here (app/(app)/studio/dressing-units.ts hands the patterns
// one PatternTable per lone table or block) — a zig-zag lights a head table whole or not at all.
// "block" is the one pattern that looks INSIDE a block: the other tables of the source's own block,
// offered only when the source is one of them.
export type TablePattern = "all" | "type" | "checker" | "alternate" | "rows" | "columns" | "selected" | "block";

export const PATTERN_LABEL: Record<TablePattern, string> = {
  all: "כל השולחנות",
  type: "אותו סוג",
  checker: "זיגזג",
  alternate: "לסירוגין",
  rows: "שורות לסירוגין",
  columns: "טורים לסירוגין",
  selected: "השולחנות שנבחרו",
  block: "שאר הבלוק",
};

export const PATTERN_HINT: Record<TablePattern, string> = {
  all: "כל שולחן בתוכנית — שולחנות מקובצים נספרים כשולחן אחד.",
  type: "כל השולחנות מאותו סוג כמו השולחן הזה.",
  checker: "כמו לוח שחמט — אף שני שכנים לא זהים. לחצי השני: עיצוב אחר באותו דפוס.",
  alternate: "כל שולחן שני לפי המספור.",
  rows: "שורה כן, שורה לא.",
  columns: "טור כן, טור לא.",
  selected: "רק השולחנות שמסומנים עכשיו על התוכנית.",
  block: "השולחנות האחרים בקבוצה של השולחן הזה — כל אחד מקבל את מה שעל השולחן הזה, באותו מקום.",
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
  block: false,
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

/** The tables standing in the same ROW (or column) as `sourceId`, in order along it — the line a
 *  run of pendants is strung along (the studio's "פיזור לאורך השורה"). The rows are the same
 *  clusters the row/column patterns read, so what the picker lights as a row is a row here too. */
export function tableLine(tables: PatternTable[], sourceId: string, axis: "row" | "column"): PatternTable[] {
  const band = bands(tables, (t) => (axis === "row" ? t.position.y : t.position.x));
  const mine = band.get(sourceId);
  if (mine === undefined) return [];
  return tables.filter((t) => band.get(t.id) === mine).sort((a, b) => (axis === "row" ? a.position.x - b.position.x : a.position.y - b.position.y));
}

/** The ids of the tables a pattern picks out, relative to `sourceId`. */
export function patternTables(
  tables: PatternTable[],
  pattern: TablePattern,
  opts: { sourceId?: string; selectedIds?: string[]; invert?: boolean } = {},
): string[] {
  const source = tables.find((t) => t.id === opts.sourceId);
  // Inside a block is the caller's to answer (it knows the block); nothing here is a block.
  if (pattern === "block") return [];
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

/** A pattern's tables with the designer's own picks over it (bug round 2026-11-21 §6, QA PT-1): what
 *  was ADDED by hand joins, what was REMOVED by hand leaves; the source is never a target either way. */
export function withHandPicks(picked: ReadonlySet<string>, added: ReadonlySet<string>, removed: ReadonlySet<string>, sourceId: string): Set<string> {
  const out = new Set(picked);
  for (const k of added) out.add(k);
  for (const k of removed) out.delete(k);
  out.delete(sourceId);
  return out;
}

/** One click on a table in the picker's map: a table the pattern took is taken out (or put back), any
 *  other is added (or taken off again). Returns the two sets after it. */
export function toggleHandPick(key: string, inPattern: boolean, added: ReadonlySet<string>, removed: ReadonlySet<string>): { added: Set<string>; removed: Set<string> } {
  const a = new Set(added);
  const r = new Set(removed);
  if (inPattern) {
    if (r.has(key)) r.delete(key);
    else r.add(key);
  } else if (a.has(key)) a.delete(key);
  else a.add(key);
  return { added: a, removed: r };
}
