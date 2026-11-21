// A קאנט — a band of fabric hung round a table's edge over its cloth (bug round 2026-11-21 §7.1;
// Ravid: "a product like a cloth, just an outline with height and colour"). Category `table-edges`:
// an item ON a table (like a runner, never the table's cloth — it is worn WITH the cloth), along the
// sides it runs on (`Placement.edgeSides`; absent = every side, DECIDE 14), `dropMm` deep
// (`MapAppearance.kant`, default 15 cm). ONE geometry for the plan, the room and the quote: the
// table's sides in its own frame.
import type { Point } from "../design-document/types";
import { isMain } from "../self-check";

export const KANT_CATEGORY = "table-edges";
export const KANT_DROP_MM = 150;
/** The plan's band: drawn over the cloth's whole 9 cm fall past the top, so it reads at a room's
 *  zoom (a 4 cm band was a hairline under the table's own edge). */
export const KANT_PLAN_BAND_MM = 90;
/** In the room it hangs this far outside the top's edge, over the cloth. */
export const KANT_OUT_MM = 12;
/** …and this thick. */
export const KANT_THICK_MM = 6;

export interface KantSpec {
  dropMm?: number;
}

export function kantDropOf(appearance: { kant?: Record<string, unknown> } | undefined): number {
  const d = Number(appearance?.kant?.dropMm);
  return d > 0 ? d : KANT_DROP_MM;
}

/** What a table is, for its sides: a round one (⌀), a box (W × D), or the outline it is drawn with. */
export interface KantTable {
  diameterMm?: number;
  widthMm?: number;
  depthMm?: number;
  outline?: Point[];
}

/** The table's outline in its own frame, and whether it is ONE side all round (a round table). */
export function tableSides(t: KantTable): { points: Point[]; round: boolean } {
  if (t.outline && t.outline.length >= 3) return { points: t.outline, round: false };
  if (t.diameterMm && t.diameterMm > 0) {
    const r = t.diameterMm / 2;
    const n = 48;
    return { points: Array.from({ length: n }, (_, i) => ({ x: r * Math.cos((i / n) * 2 * Math.PI), y: r * Math.sin((i / n) * 2 * Math.PI) })), round: true };
  }
  const w = (t.widthMm ?? 0) / 2;
  const d = (t.depthMm ?? 0) / 2;
  return {
    points: [
      { x: -w, y: -d },
      { x: w, y: -d },
      { x: w, y: d },
      { x: -w, y: d },
    ],
    round: false,
  };
}

/** A table's footprint as the sides a קאנט reads: a circle by its ⌀, a box by W × D, any other drawn
 *  outline by its points. `footprint` is lib/studio/footprint.ts's, typed loosely so this pure module
 *  needs none of it. */
export function kantTableOf(f: { kind: string; diameterMm?: number; widthMm?: number; depthMm?: number }, outline?: Point[]): KantTable {
  if (f.kind === "circle" && f.diameterMm) return { diameterMm: f.diameterMm };
  if (f.kind === "rect") return { widthMm: f.widthMm, depthMm: f.depthMm };
  return outline && outline.length >= 3 ? { outline } : { widthMm: f.widthMm, depthMm: f.depthMm };
}

/** How many sides a table has for a קאנט to choose from (a round one: one). */
export function sideCount(t: KantTable): number {
  const s = tableSides(t);
  return s.round ? 1 : s.points.length;
}

/** The sides chosen (absent = all), as segments of the outline — a round table's one side is every
 *  segment of its circle. */
export function kantSegments(t: KantTable, edgeSides?: readonly number[]): [Point, Point][] {
  const { points, round } = tableSides(t);
  const all = points.map((p, i) => [p, points[(i + 1) % points.length]] as [Point, Point]);
  if (round || !edgeSides) return round && edgeSides && !edgeSides.includes(0) ? [] : all;
  return all.filter((_, i) => edgeSides.includes(i));
}

/** The metres a קאנט runs — what a row priced by the metre bills. */
export function kantRunMm(t: KantTable, edgeSides?: readonly number[]): number {
  return kantSegments(t, edgeSides).reduce((n, [a, b]) => n + Math.hypot(b.x - a.x, b.y - a.y), 0);
}

/** A strip `from`…`to` mm out from each chosen segment (outward = away from the outline's middle),
 *  one quad per segment, in the table's frame. */
export function kantStrips(t: KantTable, edgeSides: readonly number[] | undefined, from: number, to: number): Point[][] {
  const { points } = tableSides(t);
  const c = points.reduce((m, p) => ({ x: m.x + p.x / points.length, y: m.y + p.y / points.length }), { x: 0, y: 0 });
  return kantSegments(t, edgeSides).map(([a, b]) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if ((mid.x - c.x) * n.x + (mid.y - c.y) * n.y < 0) n = { x: -n.x, y: -n.y };
    const at = (p: Point, k: number) => ({ x: p.x + n.x * k, y: p.y + n.y * k });
    return [at(a, from), at(b, from), at(b, to), at(a, to)];
  });
}

// Self-check. Run: npm run check:kant
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const rect = { widthMm: 2400, depthMm: 1200 };
  assert(sideCount(rect) === 4 && sideCount({ diameterMm: 1800 }) === 1, "a box table has four sides, a round one one");
  assert(Math.round(kantRunMm(rect)) === 7200, "absent = every side: 7.2 m round a 2.4 × 1.2 table");
  assert(Math.round(kantRunMm(rect, [0])) === 2400, "a head table's front only: its 2.4 m");
  assert(Math.abs(kantRunMm({ diameterMm: 1800 }) - Math.PI * 1800) < 30, "round a ⌀180 table: its circumference");
  assert(kantRunMm({ diameterMm: 1800 }, []) === 0, "a round table with its one side unticked: none");
  const strips = kantStrips(rect, [0], 50, 90);
  assert(strips.length === 1 && strips[0].every((p) => p.y <= -600 - 50 + 1e-6), "the band stands OUTSIDE the side it runs on");
  assert(kantDropOf(undefined) === 150 && kantDropOf({ kant: { dropMm: 200 } }) === 200, "a 15 cm drop unless the row says");
  console.log("kant self-check passed");
}
