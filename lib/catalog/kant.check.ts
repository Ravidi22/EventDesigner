// npm run check:kant — the self-check of ./kant.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { kantDropOf, kantRunMm, kantStrips, sideCount } from "./kant";

// Self-check. Run: npm run check:kant
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
