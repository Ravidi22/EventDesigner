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
import { isMain } from "../self-check";

/** The scales a plan is drawn at. Standard architectural steps — a crew reading 1:75 knows what it
 *  is looking at, where 1:87 would just be the number that happened to fit. */
export const SCALES = [20, 25, 50, 75, 100, 150, 200, 250, 500, 1000] as const;

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

// ponytail: self-check. Run: npm run check:scale
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) < tol;

  // A plausible A4 drawing frame — what is left of the page once margins and a title block have
  // taken their share. Not the real sheet's numbers (sheet-frame.tsx computes those from its own
  // constants); this is a fixture, and every assertion below is arithmetic against THESE two.
  const a4 = { widthMm: 178, heightMm: 249 };

  // A 15 x 10 metre hall.
  const hall = { widthMm: 15000, heightMm: 10000 };
  const fit = fitScale(hall, a4);
  assert(fit.denominator === 100, "a 15x10m hall fits A4 at 1:100");
  assert(near(fit.paperMm.widthMm, 150) && near(fit.paperMm.heightMm, 100), "…and is 150x100mm on the page");

  // A small room gets a bigger drawing, not the same one scaled up.
  assert(fitScale({ widthMm: 3000, heightMm: 2000 }, a4).denominator === 20, "a 3x2m room is drawn at 1:20");

  // The constraint can be either axis.
  assert(fitScale({ widthMm: 4000, heightMm: 24000 }, a4).denominator === 100, "a long thin hall is limited by its depth");

  // Bigger than the coarsest scale: stated honestly rather than silently re-fitted.
  const huge = fitScale({ widthMm: 5_000_000, heightMm: 5_000_000 }, a4);
  assert(huge.denominator === 1000, "beyond every scale it falls back to the coarsest");
  assert(huge.paperMm.widthMm > a4.widthMm, "…and overflows rather than lying about its scale");

  // A zero frame must not loop forever or return NaN.
  assert(fitScale(hall, { widthMm: 0, heightMm: 0 }).denominator === 1000, "no room at all still returns a scale");

  // The bar: at 1:100, 60mm of paper is 6m of room, so a 5m bar fits and a 10m one does not.
  const bar = scaleBarSteps(100, 60);
  assert(bar.metres === 5 && bar.steps === 5, "a 5m bar in 5 divisions fits 60mm at 1:100");
  assert(scaleBarSteps(100, 120).metres === 10, "twice the room takes a 10m bar");
  assert(scaleBarSteps(20, 60).metres === 1, "at 1:20 the same 60mm is only 1.2m, so the bar is 1m");

  console.log("scale self-check passed");
}
