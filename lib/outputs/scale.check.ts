// npm run check:scale — the self-check of ./scale.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { fitScale, scaleBarSteps } from "./scale";

// ponytail: self-check. Run: npm run check:scale
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
