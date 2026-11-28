// What scale a drawing is at — the difference between a plan and a picture of a plan.
//
// The placement map used to be an SVG at `width: 100%` over a viewBox fitted to the plan's bounds,
// which means it drew at whatever ratio the paper happened to give it: 1:87 on A4 portrait, 1:62 on
// A3 landscape, and nothing on the sheet said so. You cannot put a ruler on that. Every other
// drawing a crew is handed on site is at a STATED scale, and this makes these the same.
//
// It works because the sheet is already laid out in real millimetres (see outputs-screen.tsx, which
// sets the page's width in mm and mm is a real CSS unit): if the drawing is given a width of
// worldMm / denominator millimetres, then one millimetre on paper IS `denominator` millimetres in
// the room, exactly, on screen and out of the printer.

/** The scales a plan is drawn at. Standard architectural steps — a crew reading 1:75 knows what it
 *  is looking at, where 1:87 would just be the number that happened to fit. */
// 1:10 to 1:40 are for the table details (a single table, its chairs and their callouts, drawn to be
// set from) — 1:30 and 1:40 because a 180 round with its callouts lands just past 1:25.
export const SCALES = [10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 500, 1000] as const;

export interface Extent {
  widthMm: number;
  heightMm: number;
}

export interface FittedScale {
  /** 100 means 1:100. */
  denominator: number;
  /** How big the drawing is ON PAPER at that scale. */
  paperMm: Extent;
}

/**
 * The largest drawing that still fits: the SMALLEST denominator whose world extent lands inside the
 * frame. Small denominators are big drawings, so walking SCALES in order and taking the first that
 * fits gives the most readable plan the page can hold.
 *
 * Falls back to the coarsest scale when even that overflows — a hall bigger than 1km on a page. The
 * drawing overflows rather than being silently re-fitted to a scale the title block would then be
 * lying about; a plan that says 1:1000 and is 1:1400 is worse than one that runs off the edge.
 */
export function fitScale(world: Extent, frame: Extent): FittedScale {
  const usable = { widthMm: Math.max(0, frame.widthMm), heightMm: Math.max(0, frame.heightMm) };
  for (const d of SCALES) {
    const paperMm = { widthMm: world.widthMm / d, heightMm: world.heightMm / d };
    if (paperMm.widthMm <= usable.widthMm && paperMm.heightMm <= usable.heightMm) return { denominator: d, paperMm };
  }
  const d = SCALES[SCALES.length - 1];
  return { denominator: d, paperMm: { widthMm: world.widthMm / d, heightMm: world.heightMm / d } };
}

/**
 * A graphic scale bar: how many metres it should span, and in how many divisions.
 *
 * Drawn as well as stated, because the two fail differently. "1:100" is wrong the moment somebody
 * photocopies the sheet at 71% or prints A3 artwork onto A4 — which happens on every job — and the
 * bar is still right, because it shrank with the drawing.
 *
 * Picks the largest 1/2/5-times-a-power-of-ten run of metres that fits the width it is given.
 */
export function scaleBarSteps(denominator: number, maxPaperMm: number): { metres: number; steps: number } {
  const maxMetres = (maxPaperMm * denominator) / 1000;
  const nice = [1, 2, 5];
  let best = { metres: 1, steps: 2 };
  for (let pow = 0; pow <= 3; pow++) {
    for (const n of nice) {
      const m = n * 10 ** pow;
      if (m <= maxMetres) best = { metres: m, steps: n === 2 ? 2 : n === 5 ? 5 : 4 };
    }
  }
  return best;
}
