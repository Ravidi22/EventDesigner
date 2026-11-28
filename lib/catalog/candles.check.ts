// npm run check:candles — the self-check of ./candles.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { MapAppearance } from "./types";
import { armLevels, candleLook, candlePatch, candleSpecOf } from "./candles";

// Self-check. Run: npm run check:candles
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
assert(candleSpecOf(undefined) === undefined && candleSpecOf({ candles: {} } as unknown as MapAppearance) === undefined, "no spec = undefined");
assert(candleLook(undefined) === null, "no spec = no look: every recipe keeps its own candles, to the digit");
const taper = candleLook({})!;
assert(taper.kind === "taper" && taper.dMm === 22 && taper.hMm === 250 && taper.guard === "none", "an empty spec is a taper ⌀2.2 × 25 cm with no guard");
assert(candleLook({}, true)!.guard === "cylinder" && candleLook({}, true)!.guardDMm === 90 && candleLook({}, true)!.guardHMm === 300, "…in the sleeves style its guard is a cylinder ⌀9 × 30");
const h = candleLook({ kind: "hadorit", guard: "tulip" })!;
assert(h.dMm === 60 && h.hMm === 90 && h.guardDMm === 120 && h.guardHMm === 250, "a הידורית ⌀6 × 9 in a tulip ⌀12 × 25");
assert(candleLook({ kind: "pillar", diameterMm: 80 })!.dMm === 80 && candleLook({ kind: "pillar" })!.hMm === 150, "a typed size wins; the kind's height otherwise");
assert(candlePatch(undefined, { kind: "pillar", diameterMm: 70 })?.diameterMm === undefined, "a size equal to the kind's is not stored");
assert(candlePatch({ guard: "tulip", guardHeightMm: 300 }, { guard: "none" })?.guardHeightMm === undefined, "no guard drops its sizes");
assert(candlePatch({ heights: "typed", stepHeightsMm: [1, 2] }, { heights: "equal" }) === undefined, "back to equal heights stores nothing");
assert(candlePatch({ drops: "some" }, { drops: "none" }) === undefined && candlePatch({ armShape: "s" }, { armShape: "straight" }) === undefined, "the defaults are not stored");
const step = armLevels(5, "stepped", 100, 400);
assert(step[0] === 100 && step[4] === 500 && step[2] === 300, "stepped: from the low one to the high one, evenly");
assert(armLevels(5, "centre", 100, 400)[2] === 500 && armLevels(5, "centre", 100, 400)[0] === 100, "centre highest");
assert(armLevels(5, "ends", 100, 400)[0] === 500 && armLevels(5, "ends", 100, 400)[2] === 100, "ends highest");
assert(armLevels(3, "typed", 100, 400, [200, 0, 600]).join() === "200,100,600", "typed: each its own, a blank one at the default");
assert(armLevels(4, undefined, 100, 400).every((z) => z === 100), "equal: all at the default");
console.log("candles self-check passed");
