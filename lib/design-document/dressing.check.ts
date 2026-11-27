// npm run check:dressing — the self-check of ./dressing.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "./types";
import { arrange, autoLayout, clampToTable, dressingLayout, fromTableFrame, toTableFrame, type ChipBox, type TableBox } from "./dressing";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const close = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
const long: TableBox = { widthMm: 2400, depthMm: 1000, round: false };
const round: TableBox = { widthMm: 1800, depthMm: 1800, round: true };
const centre: ChipBox = { id: "c", widthMm: 400, depthMm: 400 };
const candle = (id: string): ChipBox => ({ id, widthMm: 250, depthMm: 250 });

// One item: dead centre, whatever the table.
assert(close(autoLayout(round, [centre]).get("c")!, { x: 0, y: 0 }), "a lone item is centred");

// A long table: candle · centrepiece · candle, symmetric along the long side.
const run = autoLayout(long, [candle("a"), centre, candle("b")]);
assert(close(run.get("c")!, { x: 0, y: 0 }), "the biggest goes in the middle of a run");
assert(Math.abs(run.get("a")!.x + run.get("b")!.x) < 1 && run.get("a")!.y === 0, "the run is symmetric along the long side");

// A round table: the biggest in the middle, the rest ringed round it, all on the table.
const ring = autoLayout(round, [candle("a"), candle("b"), candle("d"), centre]);
assert(close(ring.get("c")!, { x: 0, y: 0 }), "the biggest centres a round table");
for (const id of ["a", "b", "d"]) assert(Math.hypot(ring.get(id)!.x, ring.get(id)!.y) < 900, `${id} stands on the table`);

// Arranging a subset leaves the rest alone.
const moved = arrange("center", long, [candle("a"), centre, candle("b")], run, ["a"]);
assert(close(moved.get("a")!, { x: 0, y: 0 }) && close(moved.get("b")!, run.get("b")!), "center moves only the subset");

// A row keeps the order the items already stood in.
const shuffled = new Map<string, Point>([["a", { x: 500, y: 100 }], ["b", { x: -300, y: -50 }], ["c", { x: 0, y: 0 }]]);
const row = arrange("row", long, [candle("a"), candle("b"), centre], shuffled);
assert(row.get("b")!.x < row.get("c")!.x && row.get("c")!.x < row.get("a")!.x && row.get("a")!.y === 0, "a row keeps their order along the axis");

// Clamped inside: a rectangle by its box, a round by its circle.
assert(close(clampToTable(long, candle("a"), { x: 5000, y: -5000 }), { x: 1200 - 125 - 40, y: -(500 - 125 - 40) }), "clamped into a rectangle");
const r = clampToTable(round, candle("a"), { x: 5000, y: 0 });
assert(r.y === 0 && r.x < 900 && r.x > 600, "clamped into a round");

// The frame round-trips through a turn and a mirror.
const t = { position: { x: 1000, y: 2000 }, rotation: 30, mirrored: true };
const p = { x: 300, y: -120 };
assert(close(toTableFrame(t, fromTableFrame(t, p)), p), "table frame round-trips");
assert(close(fromTableFrame({ position: { x: 0, y: 0 }, rotation: 90 }, { x: 100, y: 0 }), { x: 0, y: 100 }), "a quarter turn carries the dressing round");

// A crescent (an arc band, as a spine): the run goes ROUND the band, in the order the items stood
// along it, and never cuts across the air inside the arc.
const bend: Point[] = [];
for (let k = 0; k <= 12; k++) bend.push({ x: Math.round(1700 * Math.cos(Math.PI + (k * Math.PI) / 12)), y: Math.round(1700 * Math.sin(Math.PI + (k * Math.PI) / 12)) + 800 });
const crescent: TableBox = { widthMm: 4000, depthMm: 2000, round: false, spine: bend };
const onArc = autoLayout(crescent, [candle("a"), centre, candle("b")]);
for (const id of ["a", "b", "c"]) assert(Math.abs(Math.hypot(onArc.get(id)!.x, onArc.get(id)!.y - 800) - 1700) < 20, `${id} is laid on the band of the crescent`);
assert(Math.abs(onArc.get("c")!.x) < 2 && onArc.get("c")!.y < -800, "the centrepiece is at the crescent's apex");
const rowArc = arrange("row", crescent, [candle("a"), candle("b")], new Map([["a", { x: 1200, y: 0 }], ["b", { x: -1200, y: 0 }]]));
assert(rowArc.get("b")!.x < 0 && rowArc.get("a")!.x > 0, "a row round the crescent keeps the order the items stood in along it");

// An arranged table is drawn as it was arranged.
const kept = dressingLayout(true, long, [{ ...candle("a"), position: { x: 700, y: 0 } }]);
assert(close(kept.get("a")!, { x: 700, y: 0 }), "an arranged table keeps its positions");

console.log("dressing: all checks passed");
