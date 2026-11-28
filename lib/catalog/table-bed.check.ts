// npm run check:table-bed — the self-check of ./table-bed.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { bedFootprint, bedLengthMm, bedOf } from "./table-bed";

// Self-check. Run: npm run check:table-bed
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const long = bedFootprint({ widthMm: 2400, depthMm: 1200, round: false }, {});
assert(long.kind === "rect" && long.widthMm === 1800 && long.depthMm === 400, "a 2.4 × 1.2 table: a bed 1.8 m long, 40 cm wide down its middle");
assert(bedLengthMm(long) === 1800, "…billed by its 1.8 m");
const narrow = bedFootprint({ widthMm: 1800, depthMm: 800, round: false }, {});
assert(narrow.kind === "rect" && narrow.depthMm === 200, "a narrow table: never under 20 cm");
const typed = bedFootprint({ widthMm: 2400, depthMm: 1200, round: false }, { widthMm: 600 });
assert(typed.kind === "rect" && typed.depthMm === 600, "a typed width wins");
const turned = bedFootprint({ widthMm: 1200, depthMm: 2400, round: false }, {});
assert(turned.kind === "rect" && turned.depthMm === 1800 && turned.widthMm === 400, "along the table's long side whichever way it is drawn");
const disc = bedFootprint({ widthMm: 1800, depthMm: 1800, round: true }, {});
assert(disc.kind === "circle" && disc.diameterMm === 1000, "a ⌀180 round: a ⌀100 disc, 40 cm inside the rim");
assert(bedOf(undefined) === null && bedOf({ arrangement: { bed: true } }) !== null && bedOf({ arrangement: { bed: { widthMm: 500 } } })?.widthMm === 500, "the row says it is a bed");
console.log("table-bed self-check passed");
