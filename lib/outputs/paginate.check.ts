// npm run check:paginate — the self-check of ./paginate.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { paginate } from "./paginate";

// ponytail: self-check. Run: npm run check:paginate
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const flat = (cap: number) => () => cap;
assert(JSON.stringify(paginate([40, 40, 40], [false, false, false], flat(100))) === "[[0,1],[2]]", "breaks when full");
assert(JSON.stringify(paginate([60, 30, 30], [false, true, false], flat(100))) === "[[0],[1,2]]", "a heading moves with its first line");
assert(JSON.stringify(paginate([30, 30, 50], [true, true, false], flat(100))) === "[[0],[1,2]]", "…but never empties the page it leaves");
assert(JSON.stringify(paginate([150, 10], [false, false], flat(100))) === "[[0],[1]]", "an oversize block stands alone");
assert(JSON.stringify(paginate([50, 50, 50], [false, false, false], (p) => (p === 0 ? 50 : 100))) === "[[0],[1,2]]", "per-page capacity");
assert(JSON.stringify(paginate([], [], flat(100))) === "[[]]", "nothing → one empty page");
console.log("paginate self-check passed");
