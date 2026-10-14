// WHERE THINGS STAND ON A TABLE. A table carries several design items — a centrepiece, a pair of
// candlesticks, a runner of flowers — and they used to be drawn as a column of chips stacked through
// the middle of it, 84cm apart whatever the table, off the end of a round of 1.5m, with their stored
// `position` ignored. This file is the arrangement instead.
//
// TWO STATES, and the table says which (DesignTable.arranged):
//
//   auto     — nobody has arranged this table. Its items are laid out by `autoLayout` every time it
//              is drawn: the biggest in the middle, the rest round it on a round table or in a run
//              along a long one. Every table drawn before this existed is in this state, and so is
//              every table dressed by "apply to all" — the layout adapts to each one's own shape.
//   arranged — the designer placed them (by hand in the table's focus mode, or with one of the
//              arrange actions below), and each item's `position` is where it stands.
//
// Positions are in the TABLE'S OWN FRAME — millimetres from its centre, before its turn and its
// mirror — so turning a table turns its dressing with it, and the same arrangement copied onto a
// table across the room lands the same way round on that table.
//
// Pure: no catalog lookups. The caller measures the table and the items (components/footprint-shape
// has `dressingSpots`, which does it from the catalog) and hands the boxes in.
import type { DesignTable, Point } from "./types";
import { isMain } from "../self-check";

/** A table's own extent in its frame. `round` = a circle or an ellipse, laid out radially. */
export interface TableBox {
  widthMm: number;
  depthMm: number;
  round: boolean;
}

/** One item on it: its id and its footprint's box (already scaled). */
export interface ChipBox {
  id: string;
  widthMm: number;
  depthMm: number;
}

/** How much of a table's top is kept clear round the edge: a candlestick is not set on the rim. */
const MARGIN = 0.08;

/** The arrange actions the focus mode offers. */
export type ArrangeKind = "center" | "row" | "column" | "ring";

export const ARRANGE_LABEL: Record<ArrangeKind | "auto", string> = {
  center: "למרכז",
  row: "בשורה לאורך",
  column: "בטור לרוחב",
  ring: "במעגל",
  auto: "סידור אוטומטי",
};

const area = (c: ChipBox) => c.widthMm * c.depthMm;
const longAxisX = (t: TableBox) => t.widthMm >= t.depthMm;

/** The order a set is laid in from the middle outward: the biggest at the centre, the next to one
 *  side of it, the next to the other, and so on — so a centrepiece and two candlesticks come out
 *  candle · centrepiece · candle, never centrepiece · candle · candle. Ties keep document order. */
function middleOut<T>(items: T[]): T[] {
  const out: T[] = [];
  items.forEach((it, i) => (i % 2 === 0 ? out.push(it) : out.unshift(it)));
  return out;
}

/** Evenly along one axis, each item centred in its own share of the usable length. */
function spread(ordered: ChipBox[], length: number, horizontal: boolean): Map<string, Point> {
  const usable = length * (1 - MARGIN * 2);
  const out = new Map<string, Point>();
  ordered.forEach((c, i) => {
    const at = ordered.length === 1 ? 0 : -usable / 2 + ((i + 0.5) * usable) / ordered.length;
    out.set(c.id, horizontal ? { x: Math.round(at), y: 0 } : { x: 0, y: Math.round(at) });
  });
  return out;
}

/** On a ring about the centre, the first at the top. */
function onRing(items: ChipBox[], table: TableBox, radiusFrac = 0.55): Map<string, Point> {
  const rx = (table.widthMm / 2) * radiusFrac;
  const ry = (table.depthMm / 2) * radiusFrac;
  const out = new Map<string, Point>();
  items.forEach((c, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / items.length;
    out.set(c.id, { x: Math.round(rx * Math.cos(a)), y: Math.round(ry * Math.sin(a)) });
  });
  return out;
}

/** Where items stand on a table nobody has arranged. */
export function autoLayout(table: TableBox, chips: ChipBox[]): Map<string, Point> {
  if (chips.length === 0) return new Map();
  if (chips.length === 1) return new Map([[chips[0].id, { x: 0, y: 0 }]]);
  const bySize = [...chips].sort((a, b) => area(b) - area(a));
  const long = Math.max(table.widthMm, table.depthMm) / Math.max(1, Math.min(table.widthMm, table.depthMm));
  // A long table (a banquet run, a 240×100): a run along it.
  if (long >= 1.3) return spread(middleOut(bySize), Math.max(table.widthMm, table.depthMm), longAxisX(table));
  // A round or square one: two face each other across it; three or more ring the biggest.
  if (chips.length === 2) return spread(middleOut(bySize), table.widthMm * 0.8, true);
  const [first, ...rest] = bySize;
  const ring = onRing(rest, table);
  ring.set(first.id, { x: 0, y: 0 });
  return ring;
}

/** An arrange action applied to `subset` (ids), leaving every other item where it is. `current` is
 *  where they all stand now; the answer is where they all stand after. */
export function arrange(kind: ArrangeKind | "auto", table: TableBox, chips: ChipBox[], current: Map<string, Point>, subset?: string[]): Map<string, Point> {
  const moving = subset?.length ? chips.filter((c) => subset.includes(c.id)) : chips;
  const out = new Map(current);
  if (kind === "auto") {
    for (const [id, p] of autoLayout(table, chips)) out.set(id, p);
    return out;
  }
  if (kind === "center") {
    for (const c of moving) out.set(c.id, { x: 0, y: 0 });
    return out;
  }
  if (kind === "ring") {
    for (const [id, p] of onRing(moving, table, moving.length <= 2 ? 0.5 : 0.6)) out.set(id, p);
    return out;
  }
  // A row along the long side, a column across: in the order they already stand along that axis, so
  // the action tidies what the designer laid out rather than reshuffling it.
  const horizontal = kind === "row" ? longAxisX(table) : !longAxisX(table);
  const along = (c: ChipBox) => {
    const p = current.get(c.id) ?? { x: 0, y: 0 };
    return horizontal ? p.x : p.y;
  };
  const ordered = [...moving].sort((a, b) => along(a) - along(b));
  for (const [id, p] of spread(ordered, horizontal ? table.widthMm : table.depthMm, horizontal)) out.set(id, p);
  return out;
}

/** Keep an item on the table top: its centre inside the table, inset by the item's own half-size and
 *  the rim margin. On a round table, inside the ellipse. */
export function clampToTable(table: TableBox, chip: { widthMm: number; depthMm: number }, p: Point): Point {
  const rim = Math.min(table.widthMm, table.depthMm) * MARGIN * 0.5;
  const hx = Math.max(0, table.widthMm / 2 - chip.widthMm / 2 - rim);
  const hy = Math.max(0, table.depthMm / 2 - chip.depthMm / 2 - rim);
  if (!table.round) return { x: Math.round(Math.max(-hx, Math.min(hx, p.x))), y: Math.round(Math.max(-hy, Math.min(hy, p.y))) };
  if (hx === 0 || hy === 0) return { x: 0, y: 0 };
  const k = Math.hypot(p.x / hx, p.y / hy);
  return k <= 1 ? { x: Math.round(p.x), y: Math.round(p.y) } : { x: Math.round(p.x / k), y: Math.round(p.y / k) };
}

/** A point in the room → the same point in a table's own frame (before its turn and mirror). */
export function toTableFrame(table: Pick<DesignTable, "position" | "rotation" | "mirrored">, p: Point): Point {
  const rad = (-(table.rotation ?? 0) * Math.PI) / 180;
  const dx = p.x - table.position.x;
  const dy = p.y - table.position.y;
  const x = dx * Math.cos(rad) - dy * Math.sin(rad);
  const y = dx * Math.sin(rad) + dy * Math.cos(rad);
  return { x: table.mirrored ? -x : x, y };
}

/** …and back: a point in a table's frame → the room. The table's own transform (TableNode's
 *  translate · rotate · mirror), so an item drawn here sits exactly where the table's <g> would put it. */
export function fromTableFrame(table: Pick<DesignTable, "position" | "rotation" | "mirrored">, p: Point): Point {
  const x = table.mirrored ? -p.x : p.x;
  const rad = ((table.rotation ?? 0) * Math.PI) / 180;
  return {
    x: table.position.x + x * Math.cos(rad) - p.y * Math.sin(rad),
    y: table.position.y + x * Math.sin(rad) + p.y * Math.cos(rad),
  };
}

/** Where each item on a table stands, in the table's frame: the stored positions on an arranged
 *  table, the auto layout otherwise. */
export function dressingLayout(arranged: boolean | undefined, table: TableBox, chips: (ChipBox & { position: Point })[]): Map<string, Point> {
  if (arranged) return new Map(chips.map((c) => [c.id, c.position]));
  return autoLayout(table, chips);
}

if (isMain(import.meta.url)) {
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

  // An arranged table is drawn as it was arranged.
  const kept = dressingLayout(true, long, [{ ...candle("a"), position: { x: 700, y: 0 } }]);
  assert(close(kept.get("a")!, { x: 700, y: 0 }), "an arranged table keeps its positions");

  console.log("dressing: all checks passed");
}
