// npm run check:feature-zones — the self-check of ./feature-zones.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "../studio/hall";
import { type StructureFeature } from "./structure";
import { featureEdgeShapes } from "./stage-edges";
import { featuresBoundary, presentFeatureIds } from "./feature-zones";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const rect = (id: string, x: number, y: number, w: number, d: number, extra: Partial<StructureFeature> = {}): StructureFeature => ({
  id, kind: "structure", label: "", x, y, widthMm: w, depthMm: d, heightMm: 1000, shape: "rect", rotationDeg: 0, ...extra,
});
const box = (pts: Point[]) => pts.reduce(
  (b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }),
  { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
);
const area = (pts: Point[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
};

// Two 2×1 m pieces, 4 m apart centre to centre: with no margin the zone is the box round both.
const two = [rect("a", 0, 0, 2000, 1000), rect("b", 4000, 0, 2000, 1000)];
const bare = featuresBoundary(two, ["a", "b"], 0);
const bb = box(bare);
assert(bb.minX === -1000 && bb.maxX === 5000 && bb.minY === -500 && bb.maxY === 500, "no margin: the hull of the two is the box round both");
assert(Math.abs(area(bare) - 6000 * 1000) < 1, "…and nothing more than it");

// A metre round them: a metre further each way, the corners rounded (the box + its sides × 1m + a 1m disc).
const grown = featuresBoundary(two, ["a", "b"], 1000);
const gb = box(grown);
assert(Math.abs(gb.minX + 2000) <= 1 && Math.abs(gb.maxX - 6000) <= 1 && Math.abs(gb.minY + 1500) <= 1 && Math.abs(gb.maxY - 1500) <= 1, "a 1 m margin reaches a metre past every side");
const expected = 6000 * 1000 + 2 * (6000 + 1000) * 1000 + Math.PI * 1000 * 1000;
assert(Math.abs(area(grown) - expected) / expected < 0.01, `…with round corners, not square ones (${Math.round(area(grown))} ≈ ${Math.round(expected)})`);
assert(grown.every((p) => Number.isInteger(p.x) && Number.isInteger(p.y)), "the region is in whole millimetres");

// A round stage ⌀2 m alone, half a metre round it: a circle of 1.5 m.
const disc = featuresBoundary([rect("c", 10000, 10000, 2000, 2000, { shape: "circle" })], ["c"], 500);
assert(disc.length > 16 && disc.every((p) => Math.abs(Math.hypot(p.x - 10000, p.y - 10000) - 1500) < 20), "a disc grown by a margin is a wider disc");

// A turned piece is taken as it stands, not as its unturned box.
const turned = featuresBoundary([rect("t", 0, 0, 4000, 200, { rotationDeg: 90 })], ["t"], 0);
const tb = box(turned);
assert(Math.abs(tb.maxY - tb.minY - 4000) <= 1 && Math.abs(tb.maxX - tb.minX - 200) <= 1, "a turned feature covers its turned footprint");

// Ids that are gone are passed over; none left is detached.
assert(featuresBoundary(two, ["a", "gone"], 0).length >= 3 && box(featuresBoundary(two, ["a", "gone"], 0)).maxX === 1000, "a deleted member leaves the zone round the rest");
assert(featuresBoundary(two, ["gone"], 1000).length === 0, "no member left: no region");
assert(featuresBoundary(two, [], 1000).length === 0, "…and none asked for: none either");
assert(presentFeatureIds(two, ["b", "gone", "a"]).join() === "b,a", "the members still on the plan, in the zone's order");

// A stage's flight is part of what it covers: a flight on its front (+y) pushes the zone out there.
const stage = rect("s", 0, 0, 4000, 2000, {
  kind: "stage",
  heightMm: 600,
  edgeItems: [{ id: "f1", kind: "stairs", edge: 0, t: 0.5, widthMm: 1500 }],
});
const plain = box(featuresBoundary([{ ...stage, edgeItems: undefined }], ["s"], 0));
const stepped = box(featuresBoundary([stage], ["s"], 0));
const grew = stepped.minX < plain.minX || stepped.maxX > plain.maxX || stepped.minY < plain.minY || stepped.maxY > plain.maxY;
assert(featureEdgeShapes(stage).length === 1 && grew, "a flight on a stage's edge is inside the zone round the stage");

console.log("feature zones: ok");
