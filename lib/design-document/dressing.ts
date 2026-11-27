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
import { alongSpine, spineParam } from "../studio/spine";

/** A table's own extent in its frame. `round` = a circle or an ellipse, laid out radially. `spine`
 *  is the line things are laid ALONG (lib/studio/spine.ts): the long axis of a rectangle, the
 *  middle of an arc's band, a horseshoe's ח — absent = the box's long axis, which is what every
 *  table had before shapes had spines. */
export interface TableBox {
  widthMm: number;
  depthMm: number;
  round: boolean;
  spine?: Point[];
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

/** A straight line through the centre, `length` long, along x or y. */
const axisLine = (length: number, horizontal: boolean): Point[] =>
  horizontal ? [{ x: -length / 2, y: 0 }, { x: length / 2, y: 0 }] : [{ x: 0, y: -length / 2 }, { x: 0, y: length / 2 }];

/** The line a table's items run along: its spine, else its long axis. */
export const spineOf = (t: TableBox): Point[] => t.spine ?? axisLine(Math.max(t.widthMm, t.depthMm), longAxisX(t));

/** Evenly along a line, each item centred in its own share of the usable length. */
function spreadAlong(ordered: ChipBox[], line: Point[]): Map<string, Point> {
  const pts = alongSpine(line, ordered.length, MARGIN);
  return new Map(ordered.map((c, i) => [c.id, pts[i]]));
}

/** Evenly along one axis — the same, on a straight line. */
function spread(ordered: ChipBox[], length: number, horizontal: boolean): Map<string, Point> {
  return spreadAlong(ordered, axisLine(length, horizontal));
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
  // One item: the middle of the TABLE, which on a shaped one (a crescent, a ח of grouped tables) is
  // the middle of its spine — its box centre is the air the band curves round.
  if (chips.length === 1) return new Map([[chips[0].id, table.spine ? alongSpine(table.spine, 1)[0] : { x: 0, y: 0 }]]);
  const bySize = [...chips].sort((a, b) => area(b) - area(a));
  const long = Math.max(table.widthMm, table.depthMm) / Math.max(1, Math.min(table.widthMm, table.depthMm));
  // A long table (a banquet run, a 240×100, a crescent): a run along it — along its SPINE, so on an
  // arc head table the run follows the band rather than cutting across the air it curves round.
  if (long >= 1.3) return spreadAlong(middleOut(bySize), spineOf(table));
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
    // The middle of the TABLE — of its spine on a shaped one (a crescent, a ח of grouped tables),
    // whose box centre is the air the band curves round.
    const mid = table.spine ? alongSpine(table.spine, 1)[0] : { x: 0, y: 0 };
    for (const c of moving) out.set(c.id, mid);
    return out;
  }
  if (kind === "ring") {
    for (const [id, p] of onRing(moving, table, moving.length <= 2 ? 0.5 : 0.6)) out.set(id, p);
    return out;
  }
  // A row along the table — its spine, so a row on a crescent follows the crescent — a column
  // across it: in the order they already stand along that line, so the action tidies what the
  // designer laid out rather than reshuffling it.
  if (kind === "row") {
    const line = spineOf(table);
    const along = (c: ChipBox) => spineParam(line, current.get(c.id) ?? { x: 0, y: 0 });
    const ordered = [...moving].sort((a, b) => along(a) - along(b));
    for (const [id, p] of spreadAlong(ordered, line)) out.set(id, p);
    return out;
  }
  const horizontal = !longAxisX(table);
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
