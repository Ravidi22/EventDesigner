// npm run check:proximity — the self-check of ./proximity.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/design-document/types";
import { type Footprint } from "./footprint";
import { axisGap, clearanceIssues, distributedCentres, footprintPolygons, placeAtGap, pointToPolys, polysBox, polysGap, spacedCentres, spreadAxis, type CentredBox } from "./proximity";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
const rect = (w: number, d: number): Footprint => ({ kind: "rect", widthMm: w, depthMm: d });

const A = footprintPolygons(rect(2000, 1000), { x: 0, y: 0 });
const B = footprintPolygons(rect(1000, 1000), { x: 3000, y: 0 });
const g = polysGap(A, B);
assert(near(g.distance, 1500), "two boxes side by side: the air between their edges");
assert(near(g.from.x, 1000) && near(g.to.x, 2500), "…measured from edge to edge");

const C = footprintPolygons({ kind: "circle", diameterMm: 1800 }, { x: 0, y: 3000 });
assert(near(polysGap(A, C).distance, 3000 - 500 - 900, 15), "a box and a round table, to the rim");
assert(polysGap(A, footprintPolygons(rect(500, 500), { x: 200, y: 0 })).distance === 0, "one inside another is zero");
assert(polysGap(A, footprintPolygons(rect(2000, 1000), { x: 1500, y: 0 })).distance === 0, "overlapping is zero");

const turned = footprintPolygons(rect(2000, 1000), { x: 0, y: 0 }, 90);
assert(near(polysBox(turned).maxX, 500) && near(polysBox(turned).maxY, 1000), "a turned footprint is turned");
const flipped = footprintPolygons({ kind: "custom", outline: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 500 }] }, { x: 0, y: 0 }, 0, true);
assert(flipped.some((poly) => poly.some((p) => near(p.x, 500) && near(p.y, 250))), "a mirrored footprint has its corner on the other side");

assert(near(pointToPolys({ x: 0, y: 2000 }, A).distance, 1500), "a point to a box");
assert(pointToPolys({ x: 10, y: 10 }, A).distance === 0, "a point inside is zero");

// Safety distance.
const issues = clearanceIssues([
  { key: "table", polys: A, clearanceMm: 1600 },
  { key: "bar", polys: B, clearanceMm: 0 },
  { key: "far", polys: footprintPolygons(rect(500, 500), { x: 20000, y: 0 }), clearanceMm: 5000 },
]);
assert(issues.length === 1 && issues[0].a === "table" && issues[0].b === "bar", "an item inside another's rule is in breach");
assert(issues[0].required === 1600 && near(issues[0].distance, 1500), "…reporting the rule and the distance kept");
assert(clearanceIssues([{ key: "a", polys: A, clearanceMm: 1400 }, { key: "b", polys: B, clearanceMm: 0 }]).length === 0, "a rule that is kept is not a breach");
assert(clearanceIssues([{ key: "a", polys: A, clearanceMm: 1600, groupId: "g" }, { key: "b", polys: B, clearanceMm: 0, groupId: "g" }]).length === 0, "members of one group are never too close");
const stage = footprintPolygons(rect(6000, 4000), { x: 0, y: 0 });
const chuppah = footprintPolygons(rect(2500, 2500), { x: 0, y: 0 });
assert(clearanceIssues([{ key: "s", polys: stage, clearanceMm: 1000, solid: "stage" }, { key: "c", polys: chuppah, clearanceMm: 0, solid: "chuppahs" }]).length === 0, "a thing standing ON another is not a breach");

// Spacing.
const boxes: CentredBox[] = [
  { x: 0, y: 0, widthMm: 2000, depthMm: 1000 },
  { x: 2600, y: 100, widthMm: 1000, depthMm: 1000 },
  { x: 5000, y: -50, widthMm: 1800, depthMm: 1800 },
];
assert(near(axisGap(boxes[0], boxes[1], "x"), 1100), "the air between two boxes along x");
assert(spreadAxis(boxes) === "x", "a row laid across the room is spread along x");
const spaced = spacedCentres(boxes, "x", 1500);
assert(spaced[0].x === 0, "the first does not move");
assert(near(axisGap(boxes[0], { ...boxes[1], ...spaced[1] }, "x"), 1500), "the second is set 1.5m past the first");
assert(near(axisGap({ ...boxes[1], ...spaced[1] }, { ...boxes[2], ...spaced[2] }, "x"), 1500), "…and the third 1.5m past the second");
assert(spaced[1].y === 100, "each keeps its place on the other axis");
const back = spacedCentres([boxes[2], boxes[1]], "x", 500);
assert(near(axisGap({ ...boxes[2], ...back[0] }, { ...boxes[1], ...back[1] }, "x"), 500) && back[1].x < back[0].x, "a row read right to left spaces leftwards");

const shapeAt = (p: Point) => footprintPolygons({ kind: "circle", diameterMm: 1000 }, p);
const moved = placeAtGap(A, { x: 0, y: 0 }, { x: 4000, y: 4000 }, shapeAt, 1200);
assert(near(polysGap(A, shapeAt(moved)).distance, 1200, 3), "straight across: the second is walked until the outlines are the gap apart");
const closer = placeAtGap(A, { x: 0, y: 0 }, { x: 9000, y: 0 }, shapeAt, 300);
assert(near(polysGap(A, shapeAt(closer)).distance, 300, 3) && near(closer.y, 0), "…both ways, along the line between their centres");

// Even distribution: equal air, ends fixed, sizes respected, input order preserved.
{
  const row: CentredBox[] = [
    { x: 0, y: 0, widthMm: 1200, depthMm: 1200 },
    { x: 9000, y: 0, widthMm: 1200, depthMm: 1200 },
    { x: 2000, y: 50, widthMm: 2400, depthMm: 1200 },
  ];
  const d = distributedCentres(row, "x");
  assert(d[0].x === 0 && d[1].x === 9000, "the two ends stay put");
  const moved = { ...row[2], ...d[2] };
  assert(near(axisGap(row[0], moved, "x"), axisGap(moved, row[1], "x")), "the air either side of the middle one is equal");
  assert(d[2].y === 50, "…and it keeps its place across the axis");
  const four = distributedCentres([...row, { x: 5000, y: 0, widthMm: 600, depthMm: 600 }], "x");
  const sorted = [row[0], { ...row[2], ...four[2] }, { x: four[3].x, y: 0, widthMm: 600, depthMm: 600 }, row[1]];
  const gaps = sorted.slice(1).map((b, i) => axisGap(sorted[i], b, "x"));
  assert(gaps.every((g) => near(g, gaps[0])), "four of different sizes get three equal gaps");
}

console.log("proximity self-check passed");
