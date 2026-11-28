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
