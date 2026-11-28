// npm run check:footprint — the self-check of ./footprint.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { HollowSpec, MapShape, Pin, Product, ShapePart } from "@/lib/catalog/types";
import { MAP_SHAPES, RING_GAP, canHollow } from "@/lib/catalog/types";
import type { Point } from "@/lib/design-document/types";
import type { EdgeCurve } from "@/lib/studio/hall";
import { arcSpecOf, buildArcOutline, buildShapeOutline, catalogBox, clampSize, composeShapes, customShapeBounds, edgePiece, evenInset, flattenEdge, footprintBounds, footprintOutlines, hollowOuter, hollowSideNames, MIN_FOOTPRINT_MM, pieceOf, piecesRing, resizeAxes, resolveContent, resolveFootprint, ringSpecOf, sampledBounds, scaleFootprint, shapeFootprint, shapePieces, sizedFootprint, sizedShapes, uShapeBandOf, type BuiltOutline, type Footprint, type ShapeDims } from "./footprint";

// ponytail: self-check. Run: npm run check:footprint
const assert = (c: boolean, m: string) => { if (!c) throw new Error("FAIL: " + m); };
const base: Product = {
  id: "x", name: "בדיקה", category: "chairs", layer: "floor",
  dimensions: { heightMm: 900 }, categoryFields: {}, styleTags: [], variants: [],
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

assert(eq(resolveFootprint({ ...base, dimensions: { diameterMm: 1800, heightMm: 750 } }), { kind: "circle", diameterMm: 1800 }), "diameter derives circle");
assert(eq(resolveFootprint({ ...base, dimensions: { widthMm: 420, depthMm: 450, heightMm: 920 } }), { kind: "rect", widthMm: 420, depthMm: 450 }), "w/d derives rect");
assert(eq(resolveFootprint(base), { kind: "rect", widthMm: 600, depthMm: 600 }), "missing dims → floor default");
assert(eq(resolveFootprint({ ...base, dimensions: { widthMm: 800, depthMm: 400, heightMm: 100 }, appearance: { shape: "ellipse", content: "none" } }), { kind: "ellipse", widthMm: 800, depthMm: 400 }), "explicit ellipse");
assert(eq(resolveFootprint({ ...base, dimensions: { widthMm: 120, depthMm: 120, heightMm: 350 }, appearance: { shape: "circle", content: "none" } }), { kind: "circle", diameterMm: 120 }), "circle falls back to width when no diameter");
assert(eq(resolveFootprint({ ...base, dimensions: { diameterMm: 1800, heightMm: 750 }, appearance: { shape: "ellipse", content: "none" } }), { kind: "ellipse", widthMm: 1800, depthMm: 1800 }), "a round-dims product drawn as ellipse falls back to its real diameter, not the generic floor default");
assert(eq(resolveFootprint({ ...base, dimensions: { diameterMm: 1800, heightMm: 750 }, appearance: { shape: "square", content: "none" } }), { kind: "rect", widthMm: 1800, depthMm: 1800 }), "square resolves to an equal-sided rect, sized from whichever dimension is set");
const outline = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }];
assert(eq(resolveFootprint({ ...base, appearance: { shape: "custom", outline, content: "none" } }), { kind: "custom", outline }), "valid custom");
assert(eq(resolveFootprint({ ...base, dimensions: { widthMm: 200, depthMm: 200, heightMm: 1 }, appearance: { shape: "custom", outline: [{ x: 0, y: 0 }], content: "none" } }), { kind: "rect", widthMm: 200, depthMm: 200 }), "malformed custom → rect fallback");

assert(resolveContent(base).mode === "name", "content defaults to name");
assert(resolveContent({ ...base, appearance: { shape: "rect", content: "icon" } }).mode === "name", "icon without icon → name");
assert(eq(resolveContent({ ...base, appearance: { shape: "rect", content: "icon", icon: "wine" } }), { mode: "icon", icon: "wine", name: "בדיקה" }), "icon with icon");

assert(eq(footprintBounds({ kind: "circle", diameterMm: 800 }), { w: 800, h: 800 }), "circle bounds");
assert(eq(footprintBounds({ kind: "custom", outline }), { w: 100, h: 100 }), "custom bounds");

// ── The derived shapes ───────────────────────────────────────────────────────────────────────
// Rule 1 (the bounding box IS width × depth) and rule 2 (every extreme is a vertex, which is what
// makes rule 1 measurable at all), for every shape in the vocabulary — at a size whose width and
// depth differ, so a shape that quietly squared itself cannot pass.
const derived: MapShape[] = ["stadium", "half-circle", "quarter-circle", "crescent", "oval-ring", "horseshoe", "triangle", "trapezoid", "hexagon", "octagon", "u-shape", "rounded-u", "line"];
for (const shape of derived) {
  const built = buildShapeOutline(shape, 1200, 600);
  if (!built) throw new Error(`FAIL: ${shape} is not built — it would fall back to a rectangle`);
  assert(built.outline.length >= 3, `${shape}: is a closed shape`);
  assert(
    built.edgeCurves === undefined || built.edgeCurves.length === built.outline.length,
    `${shape}: one curve slot per edge, or no curves at all`,
  );
  const b = customShapeBounds(built.outline);
  assert(b.w === 1200 && b.h === 600, `${shape}: measures exactly what the drawer asked for`);
  assert(Math.abs(b.cx) < 1e-9 && Math.abs(b.cy) < 1e-9, `${shape}: is centred on its own origin`);

  const item: Product = {
    ...base,
    dimensions: { widthMm: 1200, depthMm: 600, heightMm: 750 },
    appearance: { shape, content: "none" },
  };
  const f = resolveFootprint(item);
  assert(f.kind === "custom", `${shape}: resolves to an outline the whole app already draws`);
  // The round ones are sized by their circle (usesDiameter): a width of 1200 is a half circle
  // 1200 across — 1200×600, as before — and a quarter of radius 1200.
  const want = shape === "quarter-circle" ? { w: 1200, h: 1200 } : { w: 1200, h: 600 };
  assert(eq(footprintBounds(f), want), `${shape}: keeps its size through the resolver`);
}

// A derived shape with no measurements is floored like a rectangle — never drawn at zero.
assert(
  eq(footprintBounds(resolveFootprint({ ...base, appearance: { shape: "hexagon", content: "none" } })), { w: MIN_FOOTPRINT_MM, h: MIN_FOOTPRINT_MM }),
  "a derived shape with no dimensions gets the same floor a rectangle does",
);

// The base library's חצי עיגול 120×60 (lib/catalog/standard/items.ts) is a half-circle of exactly
// these two numbers: the built arc is the one that file used to spell out by hand, to the
// millimetre. This is the assertion that keeps the two from drifting apart.
const half = buildShapeOutline("half-circle", 1200, 600);
const arc = half?.edgeCurves?.[1];
assert(!!arc && Math.abs(arc.c1.y + 331) < 1 && Math.abs(arc.c2.x - 331) < 1, "the built חצי עיגול is the table the base library drew by hand");

// The ח is the one derived shape with a HOLE in it — an outline that measured 1200×600 and still
// filled the whole box would be a rectangle wearing the name. Shoelace area, against the counter
// the shape claims to be: w·d minus the opening, which is (w − 2t) × (d − t) at t = min(w,d)/3.
const u = buildShapeOutline("u-shape", 1200, 600)!;
const area = (pts: Point[]) =>
  Math.abs(pts.reduce((sum, p, i) => {
    const q = pts[(i + 1) % pts.length];
    return sum + (p.x * q.y - q.x * p.y);
  }, 0)) / 2;
const t = 200; // min(1200, 600) / 3
assert(u.outline.length === 8, "the ח has eight corners — three sides and an open fourth");
assert(!u.edgeCurves, "…and not one of them is curved");
assert(
  Math.abs(area(u.outline) - (1200 * 600 - (1200 - 2 * t) * (600 - t))) < 1e-6,
  `the ח is a ${t}mm counter around an open middle, not a filled box (${area(u.outline)})`,
);
// Deeper than it is wide: the band comes off the short side, so the opening survives.
const tall = buildShapeOutline("u-shape", 900, 3000)!;
assert(area(tall.outline) < 900 * 3000, "a ח deeper than it is wide is still open, not a solid slab");
// A measured counter: ורדה's 9.0 × 1.2m ח bar drew a 40cm counter (a third of 1.2m); at 60cm it is
// 60cm whatever the box, and a stretched bar keeps it rather than thickening with the arms.
const counter = (w: number, d: number) => {
  const o = buildShapeOutline("u-shape", w, d, undefined, { bandMm: 600 })!.outline;
  return o[2].x - o[3].x; // the outside of the right leg to its inside, along the open edge
};
assert(Math.abs(counter(9000, 1200) - 600) < 1e-6 && Math.abs(counter(9000, 2400) - 600) < 1e-6, "a measured ח counter stays its depth when the bar is stretched");
assert(uShapeBandOf(1200, 600) === 200 && uShapeBandOf(1200, 600, {}) === 200, "…and with no number it is still a third of the shorter side");
assert(uShapeBandOf(1000, 3000, { bandMm: 900 }) === 475 && uShapeBandOf(3000, 500, { bandMm: 900 }) === 475, "a counter never closes the ח's opening");
{
  const u60 = buildShapeOutline("u-shape", 3600, 1800, undefined, { bandMm: 600 })!;
  const b60 = customShapeBounds(u60.outline);
  assert(b60.w === 3600 && b60.h === 1800, "a measured ח still measures its two numbers");
}

assert(buildShapeOutline("rect", 100, 100) === null, "a primitive is not built");
assert(buildShapeOutline("custom", 100, 100) === null, "a drawn outline is not built");

// ── Round means round ──────────────────────────────────────────────────────────────────────
// Two numbers that are not 2:1 used to make a half ELLIPSE. The circle wins now: a stated diameter
// is the whole story, and a width/depth pair from an older row is read as the circle's width.
const halfOf = (dims: Product["dimensions"]) =>
  footprintBounds(resolveFootprint({ ...base, dimensions: dims, appearance: { shape: "half-circle", content: "none" } }));
assert(eq(halfOf({ diameterMm: 1800, heightMm: 750 }), { w: 1800, h: 900 }), "a half circle is half its circle");
assert(eq(halfOf({ widthMm: 1800, depthMm: 1400, heightMm: 750 }), { w: 1800, h: 900 }), "…whatever depth an old row typed");
const quarter = footprintBounds(resolveFootprint({ ...base, dimensions: { diameterMm: 2000, heightMm: 750 }, appearance: { shape: "quarter-circle", content: "none" } }));
assert(eq(quarter, { w: 1000, h: 1000 }), "a quarter circle is one radius square");

// ── The arc ────────────────────────────────────────────────────────────────────────────────
// A half ring 4m across with a 75cm band: 4m wide, 2m tall, and a hole in it — the band's area,
// not the half-disc's. Sized by its circle, so the box follows from the diameter and the sweep.
const ring = buildArcOutline(4000, { sweepDeg: 180, bandMm: 750 });
const rb = customShapeBounds(ring.outline);
assert(Math.abs(rb.w - 4000) < 1e-6 && Math.abs(rb.h - 2000) < 1e-6, `a half ring is as wide as its circle and half as tall (${rb.w}×${rb.h})`);
assert(Math.abs(rb.cx) < 1e-9 && Math.abs(rb.cy) < 1e-9, "…and centred on its own origin");
assert(ring.edgeCurves?.length === ring.outline.length, "one curve slot per edge");
const third = customShapeBounds(buildArcOutline(4000, { sweepDeg: 120, bandMm: 750 }).outline);
assert(third.w < 4000 && Math.abs(third.w - 4000 * Math.sin(Math.PI / 3)) < 1, "a third of a ring is narrower than its circle, by the chord");
const big = customShapeBounds(buildArcOutline(4000, { sweepDeg: 270, bandMm: 750 }).outline);
// Centred on the top, 270° runs from -225° to 45°: it touches the top, left and right of its
// circle, and its two ends stop 45° short of the bottom.
assert(
  Math.abs(big.w - 4000) < 1e-6 && Math.abs(big.h - 2000 * (1 + Math.SQRT1_2)) < 1e-6,
  `three quarters of a ring reaches three sides of its circle (${big.w}×${big.h})`,
);
const sweepClamp = arcSpecOf(2000, { sweepDeg: 400, bandMm: 5000 });
assert(sweepClamp.sweepDeg === 330 && sweepClamp.bandMm === 1000, "an arc cannot close into a ring, nor its band outgrow the radius");
const slice = buildArcOutline(2000, { sweepDeg: 90, bandMm: 1000 });
// -135°…-45° crosses the -90° cut: three points on the arc, then the centre — no inner arc.
assert(slice.outline.length === 4, "a band the full radius is a slice: the arc, and the centre it closes on");
const arcItem: Product = { ...base, dimensions: { diameterMm: 4000, heightMm: 750 }, appearance: { shape: "arc", content: "none", arc: { sweepDeg: 180, bandMm: 750 } } };
assert(eq(footprintBounds(resolveFootprint(arcItem)), { w: 4000, h: 2000 }), "the resolver draws an arc from its diameter");
const near = (a: { w: number; h: number }, b: { w: number; h: number }) => Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1;
const halfSlice = shapeFootprint("circle", { diameterMm: 2000, arc: { sweepDeg: 180, bandMm: 0 } });
assert(halfSlice.kind === "custom" && halfSlice.outline.length === 3 && near(footprintBounds(halfSlice), { w: 2000, h: 1000 }), "half of a circle is a half circle: the arc and ONE chord");
assert(shapeFootprint("circle", { diameterMm: 2000, arc: { sweepDeg: 360, bandMm: 0 } }).kind === "circle", "all of a circle is the circle");
const thirdRing = shapeFootprint("circle", { diameterMm: 4000, arc: { sweepDeg: 120, bandMm: 0 }, hollow: { bandMm: 750, openSides: [2, 3] } });
const thirdArc = shapeFootprint("arc", { diameterMm: 4000, arc: { sweepDeg: 120, bandMm: 750 } });
assert(thirdRing.kind === "custom" && near(footprintBounds(thirdRing), footprintBounds(thirdArc)), "a third of a circle, hollow with its radii open, is the third of a ring the arc drew");

// ── The capsule, and the hollow oval ───────────────────────────────────────────────────────
const flat = (o: BuiltOutline): Point[] =>
  o.outline.flatMap((a, i) => flattenEdge(a, o.outline[(i + 1) % o.outline.length], o.edgeCurves?.[i]).slice(0, -1));
const inside = (p: Point, poly: Point[]): boolean => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
};
// A 1200×600 capsule is a 600×600 square of runs with a whole ⌀600 circle of ends; a tall one is
// the same shape stood up, and one as wide as it is deep has no runs at all.
const capsule = buildShapeOutline("stadium", 1200, 600)!;
assert(capsule.outline.length === 6, "a capsule is six vertices — two runs and four quarter arcs");
assert(
  Math.abs(area(flat(capsule)) - (600 * 600 + Math.PI * 300 * 300)) < 0.005 * 1200 * 600,
  `…with the area of a square and a circle (${area(flat(capsule))})`,
);
const tallCapsule = customShapeBounds(buildShapeOutline("stadium", 600, 1200)!.outline);
assert(tallCapsule.w === 600 && tallCapsule.h === 1200, "a tall capsule stands up to its own two numbers");
assert(buildShapeOutline("stadium", 800, 800)!.outline.length === 4, "a capsule as wide as it is deep is a circle: four quarters, no runs");

// The oval ring is the modular curved bar it was added for: 7.34×3.60 in 60cm-deep modules, with
// a 184.5cm staff opening at the right end of its bottom run and a counter in the middle.
const ovalBar: Product = {
  ...base,
  category: "bars",
  dimensions: { widthMm: 7340, depthMm: 3600, heightMm: 1100 },
  appearance: { shape: "oval-ring", content: "none", ring: { bandMm: 600, gapMm: 1845, gapAt: "right" } },
};
const ovalF = resolveFootprint(ovalBar);
assert(ovalF.kind === "custom", "an oval ring is one outline, like the arc");
assert(eq(footprintBounds(ovalF), { w: 7340, h: 3600 }), "…measuring exactly its two numbers, opening and all");
const ovalPoly = flat(footprintOutlines(ovalF)[0]);
assert(!inside({ x: 0, y: 0 }, ovalPoly), "the middle of the ring is floor the staff stand on, not bar");
assert(inside({ x: 0, y: -1500 }, ovalPoly), "the top run is bar");
assert(inside({ x: -1500, y: 1500 }, ovalPoly), "the bottom run is bar left of the opening…");
assert(!inside({ x: 1000, y: 1500 }, ovalPoly), "…and the opening itself is floor");
assert(inside({ x: 3370, y: 0 }, ovalPoly) && !inside({ x: 2500, y: 0 }, ovalPoly), "the right end is a 60cm band round an open middle");
const ovalArea = 3740 * 3600 + Math.PI * 1800 ** 2 - (3740 * 2400 + Math.PI * 1200 ** 2) - 1845 * 600;
assert(Math.abs(area(ovalPoly) - ovalArea) < 0.002 * ovalArea, `a ring is a band less its opening, not a slab (${area(ovalPoly)} vs ${ovalArea})`);
const clamped = ringSpecOf(7340, 3600, { bandMm: 5000, gapMm: 100, gapAt: "left" });
assert(clamped.bandMm === 1800 && clamped.gapMm === RING_GAP.min, "the band stops at the end radius, and an opening that is not nothing is wide enough to walk through");
// Closed: the same band all the way round, the hole still a hole, the box still the box.
const closedRing = buildShapeOutline("oval-ring", 7340, 3600, undefined, { bandMm: 600, gapMm: 0, gapAt: "right" })!;
const closedB = customShapeBounds(closedRing.outline);
assert(closedB.w === 7340 && closedB.h === 3600, "a closed ring measures its two numbers");
const closedPoly = flat(closedRing);
assert(
  !inside({ x: 0, y: 0 }, closedPoly) && inside({ x: 0, y: 1500 }, closedPoly) && inside({ x: 1000, y: 1500 }, closedPoly),
  "…its middle is still floor and its bottom run is bar all the way along",
);
const bandArea = 3740 * 3600 + Math.PI * 1800 ** 2 - (3740 * 2400 + Math.PI * 1200 ** 2);
assert(Math.abs(area(closedPoly) - bandArea) < 0.002 * bandArea, `…and it is the whole band (${area(closedPoly)} vs ${bandArea})`);
assert(ringSpecOf(7340, 3600, { bandMm: 600, gapMm: 99999 }).gapMm === 3740, "…and never longer than the run it is cut from");
const openRun = customShapeBounds(buildShapeOutline("oval-ring", 2400, 1800, undefined, { bandMm: 400, gapMm: 9999 })!.outline);
assert(openRun.w === 2400 && openRun.h === 1800, "with the whole bottom run open the box still measures what it says");
const tallRing = flat(buildShapeOutline("oval-ring", 3600, 7340, undefined, { bandMm: 600, gapMm: 1845, gapAt: "right" })!);
assert(inside({ x: -1500, y: 0 }, tallRing) && !inside({ x: 1500, y: 1000 }, tallRing), "a tall oval ring is the wide one stood up, open on its right-hand run");
// Stretched on the plan it gains straight run; the band stays the depth of its modules.
const ovalWide = sizedFootprint({ ...ovalBar, resize: { stepMm: 100, width: { minMm: 4000, maxMm: 12000 } } }, { widthMm: 9000, depthMm: 3600 });
assert(eq(footprintBounds(ovalWide), { w: 9000, h: 3600 }), "a stretched oval ring is re-derived at its new box");
const widePoly = flat(footprintOutlines(ovalWide)[0]);
assert(inside({ x: 0, y: -1500 }, widePoly) && !inside({ x: 0, y: -1100 }, widePoly), "…with the band still 60cm, not stretched with it");
// The counter in the middle is a capsule part, inside the box the ring already claims.
const withCounter: Product = {
  ...ovalBar,
  appearance: { ...ovalBar.appearance!, parts: [{ id: "c", shape: "stadium", widthMm: 2800, depthMm: 600, x: 0, y: 0, rotation: 0 }] },
};
const wc = resolveFootprint(withCounter);
const wcb = footprintBounds(wc);
assert(wc.kind === "multi" && wc.parts.length === 2 && Math.abs(wcb.w - 7340) < 2 && Math.abs(wcb.h - 3600) < 2, `a counter inside the ring adds nothing to the box (${wcb.w}×${wcb.h})`);

// ── The horseshoe: half the oval, against a wall ───────────────────────────────────────────
// The פרסה bar is the right half of the oval bar: 3.67×3.60, its top leg to the wall and its
// bottom leg stopping 80cm short of it for the staff.
const parsa = buildShapeOutline("horseshoe", 3670, 3600, undefined, { bandMm: 600, gapMm: 800 })!;
const parsaB = customShapeBounds(parsa.outline);
assert(parsaB.w === 3670 && parsaB.h === 3600 && Math.abs(parsaB.cx) < 1e-9 && Math.abs(parsaB.cy) < 1e-9, "a horseshoe measures its two numbers and is centred on them");
const parsaPoly = flat(parsa);
assert(inside({ x: -1500, y: -1500 }, parsaPoly), "the top leg reaches the wall");
assert(!inside({ x: -1500, y: 1500 }, parsaPoly) && inside({ x: -500, y: 1500 }, parsaPoly), "the bottom leg stops 80cm short of it — the entrance");
assert(
  !inside({ x: 0, y: 0 }, parsaPoly) && !inside({ x: -1700, y: 0 }, parsaPoly) && inside({ x: 1500, y: 0 }, parsaPoly),
  "between the legs it is open to the wall, and the end is a band",
);
const parsaArea = 1870 * 600 + (1870 - 800) * 600 + (Math.PI / 2) * (1800 ** 2 - 1200 ** 2);
assert(Math.abs(area(parsaPoly) - parsaArea) < 0.002 * parsaArea, `two legs and half a ring (${area(parsaPoly)} vs ${parsaArea})`);
// Half an oval ring IS a horseshoe: a point in the oval's right half is bar or floor in both.
const wholeOval = flat(buildShapeOutline("oval-ring", 7340, 3600, undefined, { bandMm: 600, gapMm: 0, gapAt: "left" })!);
const halfOval = flat(buildShapeOutline("horseshoe", 3670, 3600, undefined, { bandMm: 600, gapMm: 0 })!);
for (const p of [{ x: 500, y: -1500 }, { x: 1000, y: 0 }, { x: 2500, y: 0 }, { x: 3400, y: 0 }, { x: 2000, y: 1500 }, { x: 3300, y: 1400 }, { x: 2900, y: -1000 }]) {
  assert(inside(p, wholeOval) === inside({ x: p.x - 1835, y: p.y }, halfOval), `a horseshoe is the right half of the oval ring (${p.x}, ${p.y})`);
}
// Too narrow for a semicircle: a D with a straight side, still exactly its own two numbers.
const narrowD = buildShapeOutline("horseshoe", 1000, 3000, undefined, { bandMm: 300, gapMm: 0 })!;
const narrowB = customShapeBounds(narrowD.outline);
const narrowPoly = flat(narrowD);
assert(
  narrowB.w === 1000 && narrowB.h === 3000 && inside({ x: 350, y: 0 }, narrowPoly) && !inside({ x: 0, y: 0 }, narrowPoly),
  "a horseshoe narrower than its end's radius grows a straight side rather than a wider box",
);
assert(ringSpecOf(3670, 3600, { bandMm: 600, gapMm: 300 }, "horseshoe").gapMm === 300, "a horseshoe's bottom leg may stop any distance short of the wall");
assert(ringSpecOf(3670, 3600, { bandMm: 600, gapMm: 99999 }, "horseshoe").gapMm === 1870, "…but not further than the leg is long");

// ── The rounded ח: the other half of the oval, against a wall ──────────────────────────────
// The oval bar's top half: 7.34×1.80, the straight run and a quarter arc down each side.
const topHalf = buildShapeOutline("rounded-u", 7340, 1800, undefined, { bandMm: 600 })!;
const topB = customShapeBounds(topHalf.outline);
assert(topB.w === 7340 && topB.h === 1800 && Math.abs(topB.cx) < 1e-9 && Math.abs(topB.cy) < 1e-9, "a rounded ח measures its two numbers and is centred on them");
const topPoly = flat(topHalf);
assert(inside({ x: 0, y: -600 }, topPoly) && !inside({ x: 0, y: 300 }, topPoly), "the run along the top is bar and the middle is open to the wall");
assert(inside({ x: 3370, y: 600 }, topPoly) && !inside({ x: 2500, y: 600 }, topPoly), "each side is a quarter of the band, down to the wall");
const topArea = 3740 * 600 + (Math.PI / 2) * (1800 ** 2 - 1200 ** 2);
assert(Math.abs(area(topPoly) - topArea) < 0.002 * topArea, `a run and two quarter rings (${area(topPoly)} vs ${topArea})`);
// Half an oval ring the other way IS a rounded ח: a point in the oval's top half is bar or floor in both.
for (const p of [{ x: 0, y: -1500 }, { x: 1000, y: -500 }, { x: 3400, y: -300 }, { x: -3000, y: -800 }, { x: -2500, y: -200 }, { x: 3600, y: -100 }]) {
  assert(inside(p, wholeOval) === inside({ x: p.x, y: p.y + 900 }, topPoly), `a rounded ח is the top half of the oval ring (${p.x}, ${p.y})`);
}
// Too narrow for the shoulders to reach the open edge: straight sides, still its own two numbers.
const tallU = buildShapeOutline("rounded-u", 1000, 3000, undefined, { bandMm: 200 })!;
const tallUB = customShapeBounds(tallU.outline);
const tallUPoly = flat(tallU);
assert(tallUB.w === 1000 && tallUB.h === 3000 && inside({ x: 400, y: 0 }, tallUPoly) && !inside({ x: 0, y: 0 }, tallUPoly), "a tall rounded ח grows straight sides rather than a wider box");
assert(ringSpecOf(7340, 1800, { bandMm: 600, gapMm: 800 }, "rounded-u").gapMm === 0, "a rounded ח has no opening — its sides are the arcs");

// ── Hollow: any solid shape as a band ──────────────────────────────────────────────────────
// The band is cut INSIDE the outline, so the box is still the shape's two numbers and the area is
// the outline's less what is left inside. Shoelace on the flattened outline — a keyhole's reversed
// inner loop subtracts itself, and its two caps cancel.
{
  const fine = (o: BuiltOutline): Point[] =>
    o.outline.flatMap((a, i) => flattenEdge(a, o.outline[(i + 1) % o.outline.length], o.edgeCurves?.[i], 64).slice(0, -1));
  const areaOf = (f: Footprint) => footprintOutlines(f).reduce((s, o) => s + area(fine(o)), 0);
  const near = (a: number, b: number, share: number) => Math.abs(a - b) <= share * Math.abs(b);
  const hollow = (shape: MapShape, dims: ShapeDims, h: HollowSpec) => shapeFootprint(shape, { ...dims, hollow: h });

  // A rectangle as a ring, closed: one keyhole, its box the rectangle's, the band all the way round.
  const ring = hollow("rect", { widthMm: 1200, depthMm: 600 }, { bandMm: 100 });
  assert(ring.kind === "custom", "a closed hollow rectangle is one outline, a keyhole");
  assert(eq(footprintBounds(ring), { w: 1200, h: 600 }), "…measuring exactly its two numbers");
  const ringPoly = flat(footprintOutlines(ring)[0]);
  assert(!inside({ x: 0, y: 0 }, ringPoly) && inside({ x: 0, y: -250 }, ringPoly) && inside({ x: 550, y: 0 }, ringPoly), "its middle is floor and its sides are band");
  assert(Math.abs(areaOf(ring) - (1200 * 600 - 1000 * 400)) < 1e-6, `…and its area is the rectangle less the middle (${areaOf(ring)})`);
  // An entrance cut through a closed ring takes exactly its width × the band out of it.
  const door = hollow("rect", { widthMm: 1200, depthMm: 600 }, { bandMm: 100, gapMm: 300 });
  assert(Math.abs(areaOf(door) - (areaOf(ring) - 300 * 100)) < 1e-6, `an entrance takes gap × band out of the ring (${areaOf(door)})`);
  assert(!inside({ x: 0, y: 250 }, flat(footprintOutlines(door)[0])) && inside({ x: 300, y: 250 }, flat(footprintOutlines(door)[0])), "…in the middle of the bottom side unless told otherwise");
  // A band as deep as the shape leaves nothing inside: the solid shape, not an inside-out one.
  const solid = hollow("rect", { widthMm: 1200, depthMm: 600 }, { bandMm: 400 });
  assert(Math.abs(areaOf(solid) - 1200 * 600) < 1e-6 && footprintOutlines(solid)[0].outline.length === 4, "a band deeper than the shape is the solid shape");
  assert(eq(hollow("crescent", { widthMm: 1200, depthMm: 600 }, { bandMm: 100 }), shapeFootprint("crescent", { widthMm: 1200, depthMm: 600 })), "a shape that is a band already ignores a hollow spec");
  // Rule 1 holds hollow, for every shape that may be: the band only ever takes floor out of the middle.
  for (const shape of MAP_SHAPES.filter(canHollow)) {
    const dims: ShapeDims = { widthMm: 1200, depthMm: 600, diameterMm: 1200, outline: [{ x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 900, y: 600 }, { x: 0, y: 600 }] };
    const whole = shapeFootprint(shape, dims);
    const cut = hollow(shape, dims, { bandMm: 100 });
    const wb = footprintBounds(whole);
    const cb = footprintBounds(cut);
    assert(Math.abs(wb.w - cb.w) < 1e-6 && Math.abs(wb.h - cb.h) < 1e-6, `${shape}: hollow, it still measures what it does solid (${cb.w}×${cb.h})`);
    assert(areaOf(cut) < areaOf(whole) - 1, `${shape}: …and is a band, not the whole of it`);
  }

  // The legacy shapes are hollow solids now. A rectangle open along its bottom IS the ח…
  const openBottom = hollow("rect", { widthMm: 1200, depthMm: 600 }, { bandMm: 200, openSides: [2] });
  assert(Math.abs(areaOf(openBottom) - area(buildShapeOutline("u-shape", 1200, 600, undefined, { bandMm: 200 })!.outline)) < 1e-6, `a rectangle open along its bottom is the ח (${areaOf(openBottom)})`);
  assert(eq(footprintBounds(openBottom), { w: 1200, h: 600 }), "…and measures what the ח measured");
  // …a capsule hollowed all the way round is the closed oval ring…
  const capsuleRing = hollow("stadium", { widthMm: 7340, depthMm: 3600 }, { bandMm: 600 });
  assert(near(areaOf(capsuleRing), bandArea, 0.002), `a hollow capsule is the closed oval ring (${areaOf(capsuleRing)} vs ${bandArea})`);
  // …a half circle open along its chord is the half ring…
  const halfRing = hollow("half-circle", { diameterMm: 4000 }, { bandMm: 750, openSides: [0] });
  assert(near(areaOf(halfRing), area(flat(buildArcOutline(4000, { sweepDeg: 180, bandMm: 750 }))), 0.01), `a half circle open along its chord is the half ring (${areaOf(halfRing)})`);
  assert(eq(footprintBounds(halfRing), { w: 4000, h: 2000 }), "…as wide as its circle and half as tall");
  // …and a quarter circle open along both radii is a quarter of a ring.
  const quarterRing = hollow("quarter-circle", { diameterMm: 4000 }, { bandMm: 500, openSides: [0, 2] });
  assert(near(areaOf(quarterRing), (Math.PI / 4) * (2000 ** 2 - 1500 ** 2), 0.01), `a quarter circle open along both radii is a quarter ring (${areaOf(quarterRing)})`);
  // A circle hollowed is a ring, its inner edge concentric — still four quarter arcs, not a polyline.
  const circleRing = hollow("circle", { diameterMm: 2000 }, { bandMm: 300 });
  assert(near(areaOf(circleRing), Math.PI * (1000 ** 2 - 700 ** 2), 0.01), `a hollow circle is a ring (${areaOf(circleRing)})`);
  const circleInner = footprintOutlines(circleRing)[0].outline.filter((p) => Math.abs(Math.hypot(p.x, p.y) - 700) < 0.5);
  assert(circleInner.length >= 4 && (footprintOutlines(circleRing)[0].edgeCurves?.filter(Boolean).length ?? 0) >= 8, "…its inner edge four arcs on the 70cm radius, curves and all");

  // A triangle's band is the same width all round, so what is left inside is the triangle shrunk
  // about its incentre: its area is the outer's × ((r − b)/r)², r the inradius.
  const tri = hollow("triangle", { widthMm: 1200, depthMm: 900 }, { bandMm: 100 });
  const triOuter = area(buildShapeOutline("triangle", 1200, 900)!.outline);
  const inradius = (2 * triOuter) / (1200 + 2 * Math.hypot(600, 900));
  const triInner = triOuter - areaOf(tri);
  assert(near(triInner / triOuter, ((inradius - 100) / inradius) ** 2, 0.01), `a hollow triangle's middle is the triangle shrunk about its incentre (${triInner / triOuter})`);

  // A hand-drawn L: the band follows the reflex corner inside it as well as the four outside.
  const L: Point[] = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 800 }, { x: 800, y: 800 }, { x: 800, y: 2000 }, { x: 0, y: 2000 }];
  const hollowL = hollow("custom", { outline: L }, { bandMm: 200 });
  assert(Math.abs(areaOf(hollowL) - (2000 * 800 + 800 * 1200 - (1600 * 400 + 400 * 1200))) < 1e-6, `a hollow L is a 20cm band round an L of floor (${areaOf(hollowL)})`);
  assert(eq(footprintBounds(hollowL), { w: 2000, h: 2000 }), "…and keeps the box it was drawn in");

  // Opening two opposite sides parts the band in two: a multi of two bars, each w × band.
  const bars = hollow("rect", { widthMm: 1200, depthMm: 600 }, { bandMm: 100, openSides: [1, 3] });
  assert(bars.kind === "multi" && bars.parts.length === 2, "a rectangle open at both ends is two bars");
  for (const p of footprintOutlines(bars)) {
    const b = customShapeBounds(p.outline);
    assert(Math.abs(b.w - 1200) < 1e-6 && Math.abs(b.h - 100) < 1e-6 && p.of === 0, `…each the width by the band, and both the one shape (${b.w}×${b.h})`);
  }
  assert(eq(footprintBounds(bars), { w: 1200, h: 600 }), "…still standing in the rectangle's box");
  assert(eq(hollowSideNames(hollowOuter("rect", { widthMm: 1200, depthMm: 600 })), ["למעלה", "ימין", "למטה", "שמאל"]), "a rectangle's sides are named by where they face");
  assert(eq(hollowSideNames(hollowOuter("circle", { diameterMm: 1000 })), ["שמאל-למטה", "ימין-למטה", "ימין-למעלה", "שמאל-למעלה"]), "…a circle's four quarters by their diagonals");

  // From a catalog row, through every reader: the resolver, a stretch on the plan, a composite.
  const hollowBar: Product = { ...base, category: "bars", dimensions: { widthMm: 2400, depthMm: 1200, heightMm: 1100 }, appearance: { shape: "rect", content: "none", hollow: { bandMm: 600, openSides: [2] } } };
  assert(Math.abs(areaOf(resolveFootprint(hollowBar)) - (2400 * 1200 - 1200 * 600)) < 1e-6, "the resolver draws a row's hollow spec");
  const stretchedBar = sizedFootprint({ ...hollowBar, resize: { stepMm: 100, width: { minMm: 1200, maxMm: 6000 } } }, { widthMm: 4800, depthMm: 1200 });
  assert(Math.abs(areaOf(stretchedBar) - (4800 * 1200 - 3600 * 600)) < 1e-6, "a hollow row stretched on the plan keeps its band 60cm, not stretched with it");
  const drawnRing: Product = { ...base, appearance: { shape: "custom", content: "none", outline: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1000 }, { x: 0, y: 1000 }], hollow: { bandMm: 200 } } };
  const drawnStretched = sizedFootprint({ ...drawnRing, resize: { stepMm: 100, width: { minMm: 1000, maxMm: 6000 } } }, { widthMm: 4000, depthMm: 1000 });
  assert(Math.abs(areaOf(drawnStretched) - (4000 * 1000 - 3600 * 600)) < 1e-3, `a hand-drawn ring stretched keeps its band too (${areaOf(drawnStretched)})`);
  const barWithBack = resolveFootprint({ ...hollowBar, appearance: { ...hollowBar.appearance!, hollow: { bandMm: 300, openSides: [1, 3] }, parts: [{ id: "b", shape: "rect", widthMm: 2400, depthMm: 300, x: 0, y: 0, rotation: 0 }] } });
  assert(barWithBack.kind === "multi" && eq(barWithBack.parts.map((p, i) => pieceOf(p, i)), [0, 0, 1]), "in a composite, a hollow base's pieces and the part's each say which shape they are");
  assert(eq(footprintBounds(barWithBack), { w: 2400, h: 1200 }), "…and the part stands where it was put, in the base's box");
}

// ── Several shapes, one item ───────────────────────────────────────────────────────────────
// A 2m counter with a 1m round butted against its right end: 2m + half the round's 1m past the
// counter's end, so 3m by 1m, centred on the lot rather than on the counter.
const combo: Product = {
  ...base,
  dimensions: { widthMm: 2000, depthMm: 600, heightMm: 750 },
  appearance: { shape: "rect", content: "none", parts: [{ id: "p", shape: "circle", diameterMm: 1000, x: 1000, y: 0, rotation: 0 }] },
};
const cf = resolveFootprint(combo);
assert(cf.kind === "multi" && cf.parts.length === 2, "an item with a part is drawn as both shapes");
const cb = footprintBounds(cf);
assert(Math.abs(cb.w - 2500) < 1 && Math.abs(cb.h - 1000) < 1, `…and measures the two of them together (${cb.w}×${cb.h})`);
// A part turned a quarter swaps its width and depth on the plan.
const turned = resolveFootprint({
  ...combo,
  appearance: { shape: "rect", content: "none", parts: [{ id: "p", shape: "rect", widthMm: 1000, depthMm: 200, x: 0, y: 0, rotation: 90 }] },
});
assert(Math.abs(footprintBounds(turned).h - 1000) < 1e-6, "a part turned 90° stands across the base, not along it");
assert(eq(resolveFootprint({ ...combo, appearance: { shape: "rect", content: "none", parts: [] } }), { kind: "rect", widthMm: 2000, depthMm: 600 }), "no parts, no composite");
// A hand-drawn part: its outline wherever it was drawn, recentred on its box, which sits at x/y.
const drawn = resolveFootprint({
  ...combo,
  appearance: {
    shape: "rect",
    content: "none",
    parts: [{ id: "d", shape: "custom", outline: [{ x: 5000, y: 5000 }, { x: 5400, y: 5000 }, { x: 5000, y: 5300 }], x: 1200, y: 0, rotation: 0 }],
  },
});
const db = footprintBounds(drawn);
assert(drawn.kind === "multi" && drawn.parts.length === 2 && Math.abs(db.w - 2400) < 1 && Math.abs(db.h - 600) < 1, `a hand-drawn part joins the item where it was put (${db.w}×${db.h})`);

// ── A hand-drawn side bowed out ───────────────────────────────────────────────────────────────
// A 1200×600 rectangle whose top side bows up to y = −500: the apex is inside the curve, not at a
// corner, so the corners alone say 600 deep and centred on y = 0 — and the drawer's fields, the
// saved dimensions and the centring on the plan all used to believe them. The box is what is drawn.
{
  const rect: Point[] = [{ x: -600, y: -300 }, { x: 600, y: -300 }, { x: 600, y: 300 }, { x: -600, y: 300 }];
  // A symmetric cubic from (−600,−300) to (600,−300) with both arms straight up by `a` reaches
  // y = −300 − 0.75a at its middle; a = 800/3 puts the apex at −500.
  const a = 800 / 3;
  const bowed: (EdgeCurve | null)[] = [{ c1: { x: 0, y: -a }, c2: { x: 0, y: -a } }, null, null, null];
  const corners = customShapeBounds(rect);
  const bb = customShapeBounds(rect, bowed);
  assert(corners.h === 600 && Math.abs(bb.h - 800) < 0.5 && Math.abs(bb.cy + 100) < 0.5, `a bowed side is measured at its apex (${bb.h} deep, centred on ${bb.cy})`);
  assert(bb.w === 1200 && Math.abs(bb.cx) < 1e-9, "…and the straight sides still measure what they are");
  const bowedF: Footprint = { kind: "custom", outline: rect, edgeCurves: bowed };
  const fb = footprintBounds(bowedF);
  assert(Math.abs(fb.w - 1200) < 0.5 && Math.abs(fb.h - 800) < 0.5, `a bowed custom footprint's box is width × depth of what is drawn (${fb.w}×${fb.h})`);
  const cb = sampledBounds([footprintOutlines(bowedF)[0]]);
  assert(Math.abs(cb.cx) < 1e-9 && Math.abs(cb.cy) < 1e-9, "…and it is centred on the box of what is drawn, bow included");
  const bowedItem: Product = { ...base, appearance: { shape: "custom", content: "none", outline: rect, edgeCurves: bowed } };
  assert(Math.abs(footprintBounds(resolveFootprint(bowedItem)).h - 800) < 0.5, "the resolver measures the bow too");
  const stretched = footprintBounds(
    sizedFootprint({ ...bowedItem, resize: { stepMm: 100, width: { minMm: 600, maxMm: 2400 }, depth: { minMm: 400, maxMm: 1600 } } }, { widthMm: 2400, depthMm: 1600 }),
  );
  assert(Math.abs(stretched.w - 2400) < 1 && Math.abs(stretched.h - 1600) < 1, `a bowed outline stretched on the plan lands on the box asked for (${stretched.w}×${stretched.h})`);
  // The built shapes keep their promise: sampling their arcs finds nothing past a vertex.
  const halfRound = buildShapeOutline("half-circle", 1200, 600)!;
  const hb = customShapeBounds(halfRound.outline, halfRound.edgeCurves);
  assert(hb.w === 1200 && hb.h === 600, "a built shape measures the same with its curves sampled");
}

// ── sized on the plan ─────────────────────────────────────────────────────────────────────────
{
  const deck: Product = {
    ...base,
    category: "stages",
    dimensions: { widthMm: 2000, depthMm: 1000, heightMm: 600 },
    appearance: { shape: "rect", content: "none" },
    resize: { stepMm: 1000, width: { minMm: 1000, maxMm: 8000 }, depth: { minMm: 1000, maxMm: 4000 } },
  };
  assert(eq(catalogBox(deck), { widthMm: 2000, depthMm: 1000 }), "the catalog box is the drawn size");
  assert(eq(clampSize(deck, { widthMm: 4400, depthMm: 2600 }), { widthMm: 4000, depthMm: 3000 }), "a size snaps to the module");
  assert(eq(clampSize(deck, { widthMm: 12000, depthMm: 100 }), { widthMm: 8000, depthMm: 1000 }), "…and stays inside the range");
  assert(eq(sizedFootprint(deck, { widthMm: 6000, depthMm: 4000 }), { kind: "rect", widthMm: 6000, depthMm: 4000 }), "a stretched rect draws at its new size");
  assert(eq(sizedFootprint({ ...deck, resize: undefined }, { widthMm: 6000, depthMm: 4000 }), { kind: "rect", widthMm: 2000, depthMm: 1000 }), "a product that does not stretch ignores a stored size");

  const bar: Product = { ...deck, category: "bars", resize: { stepMm: 500, width: { minMm: 1500, maxMm: 5000 } } };
  assert(eq(clampSize(bar, { widthMm: 3200, depthMm: 9000 }), { widthMm: 3000, depthMm: 1000 }), "a fixed side stays the catalog's");

  const u: Product = { ...deck, dimensions: { widthMm: 3600, depthMm: 1800, heightMm: 1100 }, appearance: { shape: "u-shape", content: "none" } };
  const uWide = footprintBounds(sizedFootprint(u, { widthMm: 4800, depthMm: 1800 }));
  assert(Math.round(uWide.w) === 4800 && Math.round(uWide.h) === 1800, "a derived shape is re-derived at the new box");

  const round: Product = {
    ...base,
    category: "tables",
    dimensions: { diameterMm: 1800, heightMm: 750 },
    appearance: { shape: "circle", content: "none" },
    resize: { stepMm: 100, width: { minMm: 1200, maxMm: 2400 }, depth: { minMm: 1, maxMm: 9999 } },
  };
  assert(eq(resizeAxes(round), { width: true, depth: false, uniform: true }), "a round shape has one measurement");
  assert(eq(clampSize(round, { widthMm: 2440, depthMm: 500 }), { widthMm: 2400, depthMm: 2400 }), "…and its depth follows it");
  assert(eq(sizedFootprint(round, { widthMm: 2400, depthMm: 2400 }), { kind: "circle", diameterMm: 2400 }), "…so it stays a circle");

  const half: Product = { ...round, dimensions: { diameterMm: 1200, heightMm: 750 }, appearance: { shape: "half-circle", content: "none" } };
  assert(eq(clampSize(half, { widthMm: 1800, depthMm: 0 }), { widthMm: 1800, depthMm: 900 }), "a half circle keeps its 2:1 box");

  const sofa: Product = {
    ...base,
    category: "sofas",
    appearance: { shape: "custom", content: "none", outline: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 900 }, { x: 0, y: 900 }] },
    resize: { stepMm: 100, width: { minMm: 1000, maxMm: 4000 } },
  };
  const sofaWide = footprintBounds(sizedFootprint(sofa, { widthMm: 3000, depthMm: 900 }));
  assert(Math.round(sofaWide.w) === 3000 && Math.round(sofaWide.h) === 900, "a hand-drawn outline is scaled to the new box");
  assert(eq(scaleFootprint({ kind: "circle", diameterMm: 100 }, 2, 1), { kind: "ellipse", widthMm: 200, depthMm: 100 }), "a circle pulled one way is an ellipse");
}

// A category may stretch its rows by default (CategoryDef.defaultResize): a banquette that says
// nothing of its own is laid to length — along its length only — and one that does is its own.
{
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const bench: Product = {
    id: "bench",
    name: "בנקט",
    category: "stage-benches",
    layer: "floor",
    dimensions: { widthMm: 1000, depthMm: 450, heightMm: 750 },
    categoryFields: {},
    styleTags: [],
    variants: [],
    appearance: { shape: "rect", content: "none" },
  };
  assert(eq(resizeAxes(bench), { width: true, depth: true, uniform: false }), "a banquette row with no resize of its own stretches along its length by default, and its depth is set too");
  assert(eq(clampSize(bench, { widthMm: 6040, depthMm: 930 }), { widthMm: 6000, depthMm: 950 }), "…the length in 10cm steps, the depth in its own 5cm (ResizeRange.stepMm)");
  assert(eq(clampSize(bench, { widthMm: 6000, depthMm: 450 }), { widthMm: 6000, depthMm: 450 }), "…so a 45 stays 45 when only the length is pulled");
  assert(eq(clampSize(bench, { widthMm: 100, depthMm: 450 }), { widthMm: 600, depthMm: 450 }), "…never shorter than one seat");
  assert(eq(sizedFootprint(bench, { widthMm: 6000, depthMm: 450 }), { kind: "rect", widthMm: 6000, depthMm: 450 }), "…and draws at the stretched length");
  const ownBench: Product = { ...bench, resize: { stepMm: 500, width: { minMm: 1000, maxMm: 3000 } } };
  assert(eq(clampSize(ownBench, { widthMm: 6000, depthMm: 450 }), { widthMm: 3000, depthMm: 450 }), "a row's own resize wins over its category's default");
  assert(resizeAxes({ ...bench, category: "arches" }) === null, "a category with no default leaves a plain row a thing of one size");
}

// evenInset (2026-11-07, a rug's and a cloth's contour): a circle pulled in stays a circle, a
// rounded corner shallower than the inset comes out as the sharp corner, nothing left is null.
{
  const ring = evenInset(footprintOutlines({ kind: "circle", diameterMm: 1000 })[0], 100)!;
  const rp = piecesRing(ring.outline.map((a, i) => edgePiece(i, a, ring.outline[(i + 1) % ring.outline.length], ring.edgeCurves?.[i])));
  assert(rp.every((p) => Math.abs(Math.hypot(p.x, p.y) - 400) < 1), "a ⌀1000 circle 100 in is a ⌀800 circle");
  const K100 = 0.5522847498 * 100;
  // A 1000×600 rectangle, its top-left corner rounded R100 (an arc from (-500,-200) to (-400,-300)).
  const rounded: BuiltOutline = {
    outline: [{ x: -500, y: -200 }, { x: -400, y: -300 }, { x: 500, y: -300 }, { x: 500, y: 300 }, { x: -500, y: 300 }],
    edgeCurves: [{ c1: { x: 0, y: -K100 }, c2: { x: -K100, y: 0 } }, null, null, null, null],
  };
  const sharp = evenInset(rounded, 150)!;
  const sb = sampledBounds([sharp]);
  assert(Math.abs(sb.minX + 350) < 0.5 && Math.abs(sb.minY + 150) < 0.5 && sharp.outline.some((p) => Math.abs(p.x + 350) < 0.5 && Math.abs(p.y + 150) < 0.5), "an R100 corner 150 in is the sharp corner");
  const soft = evenInset(rounded, 50)!;
  assert(!!soft.edgeCurves?.some(Boolean) && sampledBounds([soft]).minX > -450.5, "…50 in it is the concentric R50");
  assert(evenInset(rounded, 300) === null && evenInset(rounded, 0) === rounded, "nothing left 300 in a 600 deep shape; 0 in is the shape");
}

// Pins and repeats (the element model, Stage 3): a pergola's posts stay at its corners, its beams
// along its sides and its slats at their spacing whatever size it is laid at; a pinned shelf keeps
// its distance from the edge it is pinned to; a shape with neither is scaled whole as ever.
{
  const near = (a: number, b: number, m: string, tol = 0.6) => assert(Math.abs(a - b) < tol, `${m} (${a} vs ${b})`);
  const roof: ShapeDims = { widthMm: 4000, depthMm: 4000 };
  const post: ShapePart = { id: "post", shape: "rect", widthMm: 120, depthMm: 120, x: 0, y: 0, rotation: 0, repeat: { along: "corners" } };
  const beam: ShapePart = { id: "beam", shape: "rect", widthMm: 1000, depthMm: 150, x: 0, y: 0, rotation: 0, repeat: { along: "edges" } };
  const slat: ShapePart = { id: "slat", shape: "rect", widthMm: 50, depthMm: 1000, x: 0, y: 0, rotation: 0, repeat: { along: "row", spacingMm: 300, axis: "x", marginMm: 150 } };
  const pergola = composeShapes("rect", roof, [post, beam, slat]);
  assert(pergola.kind === "multi", "a pergola is a multi");
  const of = (k: number) => (pergola.kind === "multi" ? pergola.parts.filter((p, i) => pieceOf(p, i) === k) : []);
  assert(of(1).length === 4, `four posts (${of(1).length})`);
  const postCentres = of(1).map((p) => sampledBounds([p]));
  assert(postCentres.every((c) => Math.abs(Math.abs(c.cx) - 1940) < 0.6 && Math.abs(Math.abs(c.cy) - 1940) < 0.6 && Math.abs(c.w - 120) < 0.6), "…inside the four corners, 12 cm square");
  assert(of(2).length === 4, `four beams (${of(2).length})`);
  const beamBoxes = of(2).map((p) => sampledBounds([p]));
  assert(beamBoxes.filter((b) => Math.abs(b.w - 4000) < 0.6 && Math.abs(b.h - 150) < 0.6 && Math.abs(Math.abs(b.cy) - 1925) < 0.6).length === 2, "…two beams run the full 4 m along the top and bottom sides, inside the line");
  assert(beamBoxes.filter((b) => Math.abs(b.h - 4000) < 0.6 && Math.abs(b.w - 150) < 0.6 && Math.abs(Math.abs(b.cx) - 1925) < 0.6).length === 2, "…two down the left and right");
  // (4000 − 2·150 − 50) / 300 → 12 gaps, 13 slats, struck from the middle, each spanning 4 m less the margins.
  assert(of(3).length === 13, `thirteen slats at 30 cm (${of(3).length})`);
  const slatBoxes = of(3).map((p) => sampledBounds([p])).sort((a, b) => a.cx - b.cx);
  near(slatBoxes[6].cx, 0, "the middle slat is on the centre line");
  near(slatBoxes[7].cx - slatBoxes[6].cx, 300, "…30 cm to the next");
  assert(slatBoxes.every((b) => Math.abs(b.w - 50) < 0.6 && Math.abs(b.h - 3700) < 0.6), "…each 5 cm thick, spanning the roof less the margins");
  near(footprintBounds(pergola).w, 4000, "the lot is the roof");
  near(footprintBounds(pergola).h, 4000, "…both ways");

  // Laid 6 × 4: the posts are still at the corners and still 12 cm; the beams along the long sides
  // are 6 m; the slats are more, not wider apart.
  const wide = sizedShapes("rect", roof, [post, beam, slat], { widthMm: 6000, depthMm: 4000 });
  const ofW = (k: number) => (wide.kind === "multi" ? wide.parts.filter((p, i) => pieceOf(p, i) === k) : []);
  near(footprintBounds(wide).w, 6000, "the stretched lot is 6 × 4");
  near(footprintBounds(wide).h, 4000, "…deep");
  assert(ofW(1).length === 4 && ofW(1).map((p) => sampledBounds([p])).every((c) => Math.abs(Math.abs(c.cx) - 2940) < 0.6 && Math.abs(Math.abs(c.cy) - 1940) < 0.6 && Math.abs(c.w - 120) < 0.6), "the posts stand in the new corners, still 12 cm");
  assert(ofW(2).map((p) => sampledBounds([p])).filter((b) => Math.abs(b.w - 6000) < 0.6).length === 2, "the long beams are 6 m");
  assert(ofW(3).length === 19, `nineteen slats at the same 30 cm (${ofW(3).length})`);
  const wideSlats = ofW(3).map((p) => sampledBounds([p])).sort((a, b) => a.cx - b.cx);
  near(wideSlats[1].cx - wideSlats[0].cx, 300, "…30 cm apart");

  // A hexagonal roof: six posts, six beams, slats cut to the outline where they stand.
  const hex = composeShapes("hexagon", { widthMm: 4000, depthMm: 3464 }, [post, beam, slat]);
  const ofH = (k: number) => (hex.kind === "multi" ? hex.parts.filter((p, i) => pieceOf(p, i) === k) : []);
  assert(ofH(1).length === 6 && ofH(2).length === 6, `six posts and six beams round a hexagon (${ofH(1).length}, ${ofH(2).length})`);
  const hexSlats = ofH(3).map((p) => sampledBounds([p]));
  assert(hexSlats.length > 2 && hexSlats.some((b) => b.h < 3000) && hexSlats.every((b) => b.h <= 3464 + 0.6), "…the slats near the ends are shorter than the one through the middle");

  // A grid: balusters of their own size on 50 cm centres, inside a round plinth only.
  const bal: ShapePart = { id: "b", shape: "circle", diameterMm: 80, x: 0, y: 0, rotation: 0, repeat: { along: "grid", spacingMm: 500 } };
  const disc = composeShapes("circle", { diameterMm: 2000 }, [bal]);
  const ofD = disc.kind === "multi" ? disc.parts.filter((p, i) => pieceOf(p, i) === 1) : [];
  assert(ofD.length > 4 && ofD.length < 16 && ofD.every((p) => Math.hypot(sampledBounds([p]).cx, sampledBounds([p]).cy) < 1000), `a grid keeps the copies whose centres lie inside the disc (${ofD.length})`);

  // Pins: a shelf pinned to the END (+x) of a 3 m counter keeps its 10 cm inset when the counter is
  // laid 4 m; one pinned to START keeps its inset from the other end; CENTER keeps its offset;
  // STRETCH keeps both insets; the default scales as it always did.
  const counter: ShapeDims = { widthMm: 3000, depthMm: 600 };
  const shelf = (pin?: Pin): ShapePart => ({ id: "s", shape: "rect", widthMm: 800, depthMm: 200, x: 1000, y: -500, rotation: 0, ...(pin ? { pin } : {}) });
  const box = (fp: Footprint) => (fp.kind === "multi" ? sampledBounds(fp.parts.filter((p, i) => pieceOf(p, i) === 1)) : sampledBounds([]));
  const lotOf = (fp: Footprint) => sampledBounds(footprintOutlines(fp));
  const end = sizedShapes("rect", counter, [shelf({ x: "end" })], { widthMm: 4000, depthMm: 800 });
  near(lotOf(end).maxX - box(end).maxX, 100, "pinned to the end: the inset from the counter's end is kept");
  near(box(end).w, 800, "…and its width");
  const start = sizedShapes("rect", counter, [shelf({ x: "start" })], { widthMm: 4000, depthMm: 800 });
  near(box(start).minX - lotOf(start).minX, 2100, "pinned to the start: the distance from the other end is kept");
  const centre = sizedShapes("rect", counter, [shelf({ x: "center" })], { widthMm: 4000, depthMm: 800 });
  near(box(centre).cx - lotOf(centre).cx, 1000, "pinned to the centre: the offset from the middle is kept");
  const stretch = sizedShapes("rect", counter, [shelf({ x: "stretch" })], { widthMm: 4000, depthMm: 800 });
  near(box(stretch).w, 1800, "stretched: both insets kept, so the shelf grows by the metre the counter grew");
  near(lotOf(stretch).maxX - box(stretch).maxX, 100, "…its end inset still 10 cm");
  const scaled = sizedShapes("rect", counter, [shelf()], { widthMm: 4000, depthMm: 800 });
  const plainLot = composeShapes("rect", counter, [shelf()]);
  const plb = footprintBounds(plainLot);
  assert(eq(scaled, scaleFootprint(plainLot, 4000 / plb.w, 800 / plb.h)), "no pin, no repeat: scaled whole, exactly as before");
  // The y pin on the same shelf, behind the counter: the composite's box is the lot (counter +
  // shelf), so the y scale is read off the lot — the shelf pinned to the start (−y) keeps its
  // distance from the lot's top edge... as measured against the BASE's box, which is the rule.
  const yStart = sizedShapes("rect", counter, [shelf({ x: "end", y: "start" })], { widthMm: 4000, depthMm: 1600 });
  const baseY = yStart.kind === "multi" ? sampledBounds(yStart.parts.filter((p, i) => pieceOf(p, i) === 0)) : sampledBounds([]);
  near(baseY.minY - box(yStart).minY, 300, "pinned to the start in y: the shelf keeps its 30 cm beyond the counter's top edge");
}

// SH-12 (QA 2026-11-20): a band as deep as the shape's inradius or deeper is the solid shape. A ⌀60
// circle with a 53 cm band drew a self-crossing "diamond" hole (its quarter arcs offset past their
// own centre run backwards) while the panel said "חלול · 53"; so did a half-circle, a capsule and
// an ellipse well past theirs. A band short of the inradius is still a band — a long oval's tips
// pinch where they are sharpest, and it stays hollow.
{
  const solidOf = (shape: MapShape, d: ShapeDims) => shapePieces(shape, d).length === 1 && shapePieces(shape, d)[0].outline.length === shapePieces(shape, { ...d, hollow: undefined })[0].outline.length;
  assert(solidOf("circle", { diameterMm: 600, hollow: { bandMm: 530 } }), "a ⌀60 circle with a 53 cm band is solid, never a diamond hole");
  assert(!solidOf("circle", { diameterMm: 600, hollow: { bandMm: 200 } }), "…a 20 cm band leaves its ring");
  for (const [shape, d, inradius] of [
    ["circle", { diameterMm: 3000 }, 1500],
    ["half-circle", { diameterMm: 1200 }, 300],
    ["stadium", { widthMm: 1200, depthMm: 600 }, 300],
    ["ellipse", { widthMm: 1200, depthMm: 600 }, 300],
  ] as [MapShape, ShapeDims, number][]) {
    for (const k of [1, 1.2, 1.5, 2, 3]) assert(solidOf(shape, { ...d, hollow: { bandMm: Math.round(inradius * k) } }), `${shape} ${JSON.stringify(d)}: a band ${k}× its inradius is solid`);
  }
  assert(!solidOf("ellipse", { widthMm: 4000, depthMm: 1000, hollow: { bandMm: 333 } }), "a 4 m × 1 m oval keeps its default band (a third of its depth)");
}

console.log("footprint self-check passed");
