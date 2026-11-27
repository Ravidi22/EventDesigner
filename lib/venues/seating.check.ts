// npm run check:seating — the self-check of ./seating.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Product } from "../catalog/types";
import { type StructureFeature } from "./structure";
import { CHAIR_MAX_MM, CHAIR_MIN_MM, cleanSeating, newSeatingFeature, seatingCount, seatingLayout, seatingPatch } from "./seating";

// ponytail: self-check. Run: npm run check:seating
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const feature = (f: Omit<StructureFeature, "id">): StructureFeature => ({ ...f, id: "s" });

// A plain block: five rows of five dining chairs, its box the layout's.
const plain = feature(newSeatingFeature({ x: 1000, y: 2000 }));
assert(seatingCount(plain) === 25, "a new block is five rows of five");
const l = seatingLayout(plain);
assert(plain.widthMm === l.widthMm && plain.depthMm === l.depthMm && plain.shape === "rect", "its footprint is the block's box");
assert(plain.seating !== undefined && plain.seating.chairWidthMm === undefined && plain.seating.chairStyle === undefined, "a dining chair is the default and is not stored");

// From the studio's chair: its size and style come across.
const napoleon = {
  id: "c",
  name: "כיסא נפוליאון",
  category: "chairs",
  layer: "floor",
  dimensions: { widthMm: 400, depthMm: 400, heightMm: 920 },
  categoryFields: {},
  styleTags: [],
  variants: [],
  appearance: { symbolStyle: "chiavari" },
} as unknown as Product;
const fromChair = feature(newSeatingFeature({ x: 0, y: 0 }, napoleon));
assert(fromChair.seating?.chairStyle === "chiavari" && fromChair.seating.chairWidthMm === 400 && fromChair.seating.chairDepthMm === 400, "a block of the studio's chair copies its style and size");
assert(fromChair.widthMm === 5 * 400 + 4 * 50 && fromChair.heightMm === 920, "…and its box and height follow the chair");

// Two more rows: the block grows BACKWARD — the front edge (+y, unturned) holds still.
const front = (f: Pick<StructureFeature, "y" | "depthMm">) => f.y + f.depthMm / 2;
const grown = { ...plain, ...seatingPatch(plain, { rows: 7 }) };
assert(seatingCount(grown) === 35 && grown.depthMm > plain.depthMm, "seven rows of five is 35, and deeper");
assert(Math.abs(front(grown) - front(plain)) <= 1 && grown.x === plain.x, "the front row stays where it stood");

// Turned to face the other way (180°): its front is now −y on the plan, and still holds still.
const turned = { ...plain, rotationDeg: 180 };
const turnedGrown = { ...turned, ...seatingPatch(turned, { rows: 7 }) };
assert(Math.abs((turnedGrown.y - turnedGrown.depthMm / 2) - (turned.y - turned.depthMm / 2)) <= 1, "a turned block keeps its front row too");

// A wider chair: the same rows, a wider block; out-of-range sizes are held to a chair's.
const wider = { ...plain, ...seatingPatch(plain, { chairWidthMm: 550 }) };
assert(wider.widthMm === 5 * 550 + 4 * 50 && seatingCount(wider) === 25, "a wider chair widens the block, not the count");
assert(cleanSeating({ rows: 2, perRow: 2, chairWidthMm: 20, chairDepthMm: 9000 }).chairWidthMm === CHAIR_MIN_MM, "a chair is at least 30cm");
assert(cleanSeating({ rows: 2, perRow: 2, chairDepthMm: 9000 }).chairDepthMm === CHAIR_MAX_MM, "…and at most 1.2m");
assert(cleanSeating({ rows: 2, perRow: 2, chairStyle: "nonsense" as never }).chairStyle === undefined, "an unknown style reads as the default");

// A row that lost its spec still draws five rows of five.
assert(seatingCount({ seating: undefined }) === 25, "no spec is five rows of five");

console.log("seating: ok");
