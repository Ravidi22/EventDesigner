// npm run check:table-patterns — the self-check of ./table-patterns.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { patternTables, tableLine, toggleHandPick, withHandPicks, type PatternTable } from "./table-patterns";

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
assert(tableLine(grid, "12", "row").map((t) => t.id).join(",") === "10,11,12,13", "a table's row, in order across the room");
assert(tableLine(grid, "01", "column").map((t) => t.id).join(",") === "01,11,21", "…and its column, top to bottom");
assert(tableLine(grid, "nope", "row").length === 0, "no such table, no line");

// §6: hand picks over a pattern — a click adds a table the pattern left out, takes out one it took,
// and a second click undoes it; the source is never a target.
const base = new Set(["a", "b", "src"]);
let hp = toggleHandPick("c", false, new Set(), new Set());
hp = toggleHandPick("a", true, hp.added, hp.removed);
assert([...withHandPicks(base, hp.added, hp.removed, "src")].sort().join() === "b,c", "added c, took out a, never the source");
hp = toggleHandPick("a", true, hp.added, hp.removed);
hp = toggleHandPick("c", false, hp.added, hp.removed);
assert([...withHandPicks(base, hp.added, hp.removed, "src")].sort().join() === "a,b", "a second click undoes each");
console.log("table-patterns: all checks passed");
