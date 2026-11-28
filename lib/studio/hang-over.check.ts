// npm run check:hang-over — the self-check of ./hang-over.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/design-document/types";
import { carryHung, hungCopy } from "./hang-over";

// ponytail: self-check. Run: npm run check:hang-over
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (a: Point, b: Point, tol = 1) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;
const item: { position: Point; rotation: number; mirrored?: boolean } = { position: { x: 1600, y: 2000 }, rotation: 0 };
const t0 = { position: { x: 1000, y: 2000 }, rotation: 0 };

// The table slides 3m right: the pendant 60cm off its middle slides with it.
const slid = carryHung(item, t0, { position: { x: 4000, y: 2000 }, rotation: 0 });
assert(near(slid.position, { x: 4600, y: 2000 }), "a moved table carries what hangs over it");
assert(carryHung(item, t0, t0) === item, "a table that did not move carries nothing");

// The table turns a quarter: what was 60cm to its right is now 60cm below it, turned too.
const turned = carryHung(item, t0, { position: { x: 1000, y: 2000 }, rotation: 90 });
assert(near(turned.position, { x: 1000, y: 2600 }), "a turned table turns what hangs over it round with it");
assert(turned.rotation === 90, "…and turns the item itself");

// Mirrored: the pendant goes to the other side, and is flipped itself.
const flipped = carryHung(item, t0, { position: { x: 1000, y: 2000 }, rotation: 0, mirrored: true });
assert(near(flipped.position, { x: 400, y: 2000 }) && flipped.mirrored === true, "a flipped table flips what hangs over it");
const back = carryHung(flipped, { position: { x: 1000, y: 2000 }, rotation: 0, mirrored: true }, t0);
assert(near(back.position, item.position) && back.mirrored === undefined, "…and flipping back leaves no trace");

// Copied over another table: the same relative spot. Over the end of a 2.4m table → over the end
// of a 4.8m one; over the middle stays over the middle, whatever the sizes.
const from = { position: { x: 1000, y: 2000 }, rotation: 0, widthMm: 2400, depthMm: 1000 };
const to = { position: { x: 9000, y: 5000 }, rotation: 0, widthMm: 4800, depthMm: 1200 };
const end = hungCopy({ position: { x: 1000 + 960, y: 2000 }, rotation: 0 }, from, to);
assert(near(end.position, { x: 9000 + 1920, y: 5000 }), "a pendant over the end of a short table hangs over the end of a long one");
const mid = hungCopy({ position: { x: 1000, y: 2000 }, rotation: 0 }, from, to);
assert(near(mid.position, { x: 9000, y: 5000 }), "over the middle stays over the middle");
const toTurned = { ...to, rotation: 90 };
const endTurned = hungCopy({ position: { x: 1000 + 960, y: 2000 }, rotation: 0 }, from, toTurned);
assert(near(endTurned.position, { x: 9000, y: 5000 + 1920 }) && endTurned.rotation === 90, "…and follows the target's facing");

console.log("hang-over: all checks passed");
