// A BLOCK OF CHAIRS IN ROWS — the seats facing a חופה, a stage or a speaker (the user, 2026-10-17:
// "add chairs like this for the canopy — rows of chairs, the rows and how many in a row editable").
//
// One placement of a real chair row (category `chairs`) carrying `Placement.rows`. Nothing about the
// block is stored but what the designer chose — how many rows, how many chairs in each, the gaps, a
// centre aisle. Where each chair stands and how much floor the block takes are DERIVED here, by the
// one function the canvas, the printed map and the footprint all call, so resizing a block is
// typing a number and there is no list of chair positions to fall out of step with it.
//
// It is COUNTED as the chairs it is: `quantity` = rows × chairs per row, written by the same action
// that writes `rows` (setChairRows) — so the quote, the packing list, orders and every other reader
// of a placement's quantity count 25 chairs without knowing what a block is.
//
// The block's own frame is centred on its box, before its turn. Its FRONT is +y: the chairs face
// down the plan as a single chair is drawn (backrest toward −y), and row 1 is the front row. Turn the
// block to face the chuppah. More rows grow it BACKWARD and the front row stays where it stood
// (chairRowsMove) — the aisle a couple walks down does not wander off the chuppah while the
// designer adds seats.
import type { ChairRows, Point } from "./types";
import { isMain } from "../self-check";

export type { ChairRows };

/** Ceremony chairs stand almost touching: a hand's width between them. */
export const CHAIR_GAP_MM = 50;
/** Legroom: 45cm clear from a backrest to the seat behind it, the usual for a seated ceremony. */
export const ROW_GAP_MM = 450;
/** What an aisle is when one is switched on — wide enough to walk a couple down side by side. */
export const AISLE_MM = 1200;
export const MAX_ROWS = 60;
export const MAX_PER_ROW = 60;
/** What a new block is — the user's picture: five rows of five. */
export const NEW_BLOCK: ChairRows = { rows: 5, perRow: 5 };
/** A chair with no size in its catalog row is laid at a dining chair's. */
export const FALLBACK_CHAIR = { widthMm: 450, depthMm: 500 };

const int = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min)));

/** The spec with every number made whole and in range, and the defaults left out — what is stored. */
export function cleanRows(spec: ChairRows): ChairRows {
  const out: ChairRows = { rows: int(spec.rows, 1, MAX_ROWS), perRow: int(spec.perRow, 1, MAX_PER_ROW) };
  if (spec.gapMm !== undefined && Math.round(spec.gapMm) !== CHAIR_GAP_MM) out.gapMm = int(spec.gapMm, 0, 3000);
  if (spec.rowGapMm !== undefined && Math.round(spec.rowGapMm) !== ROW_GAP_MM) out.rowGapMm = int(spec.rowGapMm, 0, 3000);
  if (spec.aisleMm && spec.aisleMm > 0) out.aisleMm = int(spec.aisleMm, 100, 6000);
  return out;
}

/** How many chairs the block is — what `quantity` holds. */
export function chairRowsCount(spec: Pick<ChairRows, "rows" | "perRow">): number {
  return int(spec.rows, 1, MAX_ROWS) * int(spec.perRow, 1, MAX_PER_ROW);
}

export interface ChairRowsLayout {
  widthMm: number;
  depthMm: number;
  /** Every chair's centre in the block's frame, front row first, then along each row in +x. */
  chairs: Point[];
  rows: number;
  perRow: number;
  /** How many of each row stand on the −x side of the aisle (all of them, with no aisle). */
  firstSide: number;
  /** The aisle's middle and width in the block's frame, when there is one. */
  aisle?: { x: number; widthMm: number };
  /** The gaps actually used, defaults filled in. */
  gapMm: number;
  rowGapMm: number;
}

/** Where every chair of a block stands, and the box round them all. `chair` is one chair's footprint
 *  box (its catalog size). */
export function chairRowsLayout(spec: ChairRows, chair: { widthMm: number; depthMm: number }): ChairRowsLayout {
  const s = cleanRows(spec);
  const cw = Math.max(200, chair.widthMm || FALLBACK_CHAIR.widthMm);
  const cd = Math.max(200, chair.depthMm || FALLBACK_CHAIR.depthMm);
  const gap = s.gapMm ?? CHAIR_GAP_MM;
  const rowGap = s.rowGapMm ?? ROW_GAP_MM;
  const aisle = s.aisleMm && s.perRow > 1 ? s.aisleMm : 0;
  // The −x side takes the odd chair: a row of 9 is 5 | 4.
  const firstSide = aisle ? Math.ceil(s.perRow / 2) : s.perRow;
  const widthMm = s.perRow * cw + (s.perRow - 1) * gap + (aisle ? aisle - gap : 0);
  const depthMm = s.rows * cd + (s.rows - 1) * rowGap;
  const chairs: Point[] = [];
  for (let r = 0; r < s.rows; r++) {
    // Row 1 is the FRONT, the +y edge.
    const y = depthMm / 2 - cd / 2 - r * (cd + rowGap);
    for (let i = 0; i < s.perRow; i++) {
      const x = -widthMm / 2 + cw / 2 + i * (cw + gap) + (aisle && i >= firstSide ? aisle - gap : 0);
      chairs.push({ x, y });
    }
  }
  const aisleX = -widthMm / 2 + firstSide * (cw + gap) - gap + aisle / 2;
  return {
    widthMm,
    depthMm,
    chairs,
    rows: s.rows,
    perRow: s.perRow,
    firstSide,
    ...(aisle ? { aisle: { x: aisleX, widthMm: aisle } } : {}),
    gapMm: gap,
    rowGapMm: rowGap,
  };
}

/** Where a block's centre goes when it changes from `before` to `after`, so that its FRONT row stays
 *  where it stood and its middle line (the aisle) stays on the same line: the extra depth goes out
 *  the back. `rotation` is the block's turn, degrees. */
export function chairRowsMove(position: Point, rotation: number, before: { depthMm: number }, after: { depthMm: number }): Point {
  const shift = (before.depthMm - after.depthMm) / 2; // along the block's own +y
  const t = (rotation * Math.PI) / 180;
  return { x: Math.round(position.x - shift * Math.sin(t)), y: Math.round(position.y + shift * Math.cos(t)) };
}

// ponytail: self-check. Run: npm run check:chair-rows
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const chair = { widthMm: 450, depthMm: 500 };

  // The user's picture: five rows of five.
  const five = chairRowsLayout({ rows: 5, perRow: 5 }, chair);
  assert(five.chairs.length === 25 && chairRowsCount({ rows: 5, perRow: 5 }) === 25, "five rows of five is 25 chairs");
  assert(five.widthMm === 5 * 450 + 4 * 50 && five.depthMm === 5 * 500 + 4 * 450, `the block is 2.45 × 4.30 m (${five.widthMm} × ${five.depthMm})`);
  assert(five.chairs[0].y > five.chairs[24].y && Math.abs(five.chairs[0].y - (five.depthMm / 2 - 250)) < 1e-9, "row 1 is the front, at the +y edge");
  assert(Math.abs(five.chairs[0].x + five.widthMm / 2 - 225) < 1e-9 && Math.abs(five.chairs[4].x - (five.widthMm / 2 - 225)) < 1e-9, "a row runs edge to edge of the block");
  const xs = five.chairs.map((p) => p.x);
  assert(Math.abs(Math.min(...xs) + Math.max(...xs)) < 1e-9, "…centred on the block's middle line");

  // A centre aisle: a row of 9 is 5 | 4, the aisle between them, the block wider by aisle − gap.
  const aisled = chairRowsLayout({ rows: 2, perRow: 9, aisleMm: 1200 }, chair);
  assert(aisled.firstSide === 5 && aisled.widthMm === 9 * 450 + 8 * 50 + 1150, "an aisle splits a row of 9 into 5 and 4 and widens the block by itself less one gap");
  const left = aisled.chairs[4];
  const right = aisled.chairs[5];
  assert(Math.abs(right.x - left.x - 450 - 1200) < 1e-9, "…and the clear space across it is the aisle's width");
  assert(!!aisled.aisle && Math.abs(aisled.aisle!.x - (left.x + right.x) / 2) < 1e-9, "the aisle's middle is halfway between the chairs either side of it");
  assert(!chairRowsLayout({ rows: 3, perRow: 1, aisleMm: 1200 }, chair).aisle, "a single column has no aisle to split");

  // The gaps are the designer's: legroom and a hand's width.
  const roomy = chairRowsLayout({ rows: 2, perRow: 2, gapMm: 0, rowGapMm: 900 }, chair);
  assert(roomy.widthMm === 900 && roomy.depthMm === 1900, "chairs touching, 90cm of legroom");

  // What is stored is clean: whole numbers in range, defaults left out.
  assert(JSON.stringify(cleanRows({ rows: 5.4, perRow: 0, gapMm: 50, rowGapMm: 450, aisleMm: 0 })) === JSON.stringify({ rows: 5, perRow: 1 }), "defaults are not stored, nonsense is clamped");
  assert(cleanRows({ rows: 999, perRow: 999 }).rows === MAX_ROWS && chairRowsCount({ rows: 999, perRow: 999 }) === MAX_ROWS * MAX_PER_ROW, "a typo cannot order ten thousand chairs");
  assert(chairRowsLayout({ rows: 1, perRow: 1 }, { widthMm: 0, depthMm: 0 }).widthMm === FALLBACK_CHAIR.widthMm, "a chair with no size is laid at a dining chair's");

  // More rows grow the block backward: the front row stays put, square or turned.
  const before = chairRowsLayout({ rows: 5, perRow: 5 }, chair);
  const after = chairRowsLayout({ rows: 8, perRow: 5 }, chair);
  const frontY = (pos: Point, l: ChairRowsLayout) => pos.y + l.depthMm / 2;
  const moved = chairRowsMove({ x: 0, y: 0 }, 0, before, after);
  assert(Math.abs(frontY(moved, after) - frontY({ x: 0, y: 0 }, before)) <= 1 && moved.x === 0, "three more rows: the front edge has not moved, the block grew back");
  const turned = chairRowsMove({ x: 1000, y: 1000 }, 90, before, after);
  // Turned 90°, the block's +y points along the room's −x: its front edge is at x − depth/2.
  assert(Math.abs(turned.x - after.depthMm / 2 - (1000 - before.depthMm / 2)) <= 1 && turned.y === 1000, "…and turned a quarter, the same edge holds");

  console.log("chair rows: ok");
}
