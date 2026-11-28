// npm run check:climb-item — the self-check of ./climb-item.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Product } from "@/lib/catalog/types";
import { climbAccessibleEdit, climbHeightEdit, climbKindOf, climbReverseEdit, climbRise, climbRisersEdit } from "./climb-item";

// ponytail: self-check. Run: npm run check:climb-item
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
const row = (category: string, widthMm: number, depthMm: number, heightMm: number): Product => ({
  id: category,
  name: category,
  category,
  layer: "floor",
  dimensions: { widthMm, depthMm, heightMm },
  categoryFields: {},
  styleTags: [],
  variants: [],
});
const ramp = row("stage-ramps", 1200, 7200, 600);
const stairs = row("stage-stairs", 1000, 840, 600);
const at = { position: { x: 0, y: 0 }, rotation: 0, scale: 1 };

assert(climbKindOf(ramp) === "ramp" && climbKindOf(stairs) === "stairs" && !climbKindOf(row("bars", 1, 1, 1)), "the two stage-part rows climb; a bar does not");
assert(climbRise(ramp)?.heightMm === 600 && climbRise(ramp, { heightMm: 290 })?.heightMm === 290, "the row's height, unless the plan says otherwise");
assert(climbRise(row("bars", 1, 1, 1)) === undefined, "nothing to draw for what does not climb");

// A 60cm ramp at 7.2m is 1:12; lowered to 29cm it stays 1:12 and its head stays at the door.
const lower = climbHeightEdit(at, ramp, { widthMm: 1200, depthMm: 7200 }, 290)!;
assert(lower.climb.heightMm === 290 && lower.sizeMm.depthMm === 3480 && lower.sizeMm.widthMm === 1200, "a 1:12 ramp lowered to 29cm is 3.48m");
const headBefore = -7200 / 2;
const headAfter = lower.position.y - lower.sizeMm.depthMm / 2;
assert(near(headAfter, headBefore), "…and its head (the −y end) has not moved");
// Turned a quarter, the head is at +x; the centre moves along x instead.
const turned = climbHeightEdit({ ...at, rotation: 90 }, ramp, { widthMm: 1200, depthMm: 7200 }, 290)!;
assert(near(turned.position.x, (7200 - 3480) / 2) && near(turned.position.y, 0), "turned, the head stays put along the turned axis");
// Reversed, the head is the +y end.
const back = climbHeightEdit({ ...at, climb: { reversed: true } }, ramp, { widthMm: 1200, depthMm: 7200 }, 290)!;
assert(near(back.position.y + back.sizeMm.depthMm / 2, 7200 / 2) && back.climb.reversed === true, "reversed, the +y end is the head that stays");

// Stairs keep their tread: 60cm (4 risers, 3 treads of 28cm) down to 45cm is 3 risers on 2 treads.
const steps = climbHeightEdit(at, stairs, { widthMm: 1000, depthMm: 840 }, 450)!;
assert(steps.sizeMm.depthMm === 560, "45cm stairs run 56cm at the row's 28cm tread");
const typed = climbRisersEdit(at, stairs, { widthMm: 1000, depthMm: 840 }, 6)!;
assert(typed.climb.risers === 6 && typed.sizeMm.depthMm === 5 * 280, "six typed steps: five treads at the same tread");
const derived = climbRisersEdit({ ...at, climb: { risers: 6 } }, stairs, { widthMm: 1000, depthMm: 1400 }, 4)!;
assert(derived.climb.risers === undefined, "typing the count the height gives anyway goes back to deriving it");

// A ramp shortened past 1:12 is laid back by one edit.
const fixed = climbAccessibleEdit(at, ramp, { widthMm: 1200, depthMm: 3600 })!;
assert(fixed.sizeMm.depthMm === 7200, "60cm at 1:12 is 7.2m again");

const flipped = climbReverseEdit(at, ramp, { widthMm: 1200, depthMm: 7200 })!;
assert(flipped.climb.reversed === true && flipped.position === at.position && flipped.sizeMm.depthMm === 7200, "reversing keeps the run and the place");
assert(climbReverseEdit({ ...at, climb: { reversed: true } }, ramp, { widthMm: 1200, depthMm: 7200 })!.climb.reversed === undefined, "…and back again leaves no flag behind");

console.log("climb-item self-check passed");
