// npm run check:stage-draw — the self-check of ./stage-draw.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/design-document/types";
import { areaOf, bowFront, cleanOutline, constrainNext, cornerAngle, deg, ellipseArea, firstSideAngles, halfRoundArea, laterSideAngles, lockAngle, moveVertex, pushSide, rad, removeVertex, roundCorners, selfIntersects, setCornerAngle, setSideLength, shapeRect, splitSide, squareUp, stickBoxes, typedSideLength, unionOutline, unionShapes, wallFrameDeg } from "./stage-draw";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const o = { x: 0, y: 0 };
const p1 = constrainNext(o, { x: 3040, y: 130 }, 0);
assert(p1.x === 3000 && p1.y === 0, "a side drawn nearly flat is flat, and a whole number of 10cm");
const p2 = constrainNext(o, { x: 1480, y: 1530 }, 0);
assert(Math.abs(p2.x - p2.y) <= 1, "…one drawn near 45° is 45°");
const p3 = constrainNext(o, { x: 3040, y: 130 }, 0, { free: true });
assert(p3.x === 3040 && p3.y === 130, "Alt draws it as pointed");
const p4 = constrainNext(o, { x: 100, y: 5 }, 0, { typedMm: 4250 });
assert(p4.x === 4250 && p4.y === 0, "a typed length is laid along the direction pointed");
const turned = constrainNext(o, { x: 0, y: 2000 }, 30);
const a = (Math.atan2(turned.y, turned.x) * 180) / Math.PI;
assert(Math.abs(a - 120) < 0.1 || Math.abs(a - 75) < 0.1, "…held to 45° steps from the first side, not the page");

// The FIRST side, clicked beside a wall. A wall a few degrees off square is read as square: the
// room's grid alone, so the stage is not tilted 3° with it.
assert(firstSideAngles(null).length === 1 && firstSideAngles(3).length === 1 && firstSideAngles(93).length === 1 && firstSideAngles(-4).length === 1, "no wall, or a wall within 6° of square, offers only the room's 45° grid");
assert(wallFrameDeg(3) === null && wallFrameDeg(120) === 30 && wallFrameDeg(-30) === 60, "a wall's frame is its line folded into a quarter turn, none when it is square");
const beside30 = firstSideAngles(30);
assert(beside30.length === 2 && beside30[1].refDeg === 30 && beside30[1].stepDeg === 90, "a 30° wall adds its own line and its square, nothing else");
const headed = (d: number) => {
  const p = constrainNext(o, { x: 4000 * Math.cos(rad(d)), y: 4000 * Math.sin(rad(d)) }, beside30);
  return ((deg(Math.atan2(p.y, p.x)) % 360) + 360) % 360;
};
assert(Math.abs(headed(28) - 30) < 0.1, "pointed nearly along the wall, the side runs along the wall");
assert(Math.abs(headed(1) - 0) < 0.1 && Math.abs(headed(40) - 45) < 0.1, "…pointed along the room's axes or its diagonal, it takes the room's");
assert(Math.abs(headed(70) - 90) < 0.1, "…and 45° off the wall is nobody's: 70° goes to the room's vertical, not the wall's 75°");
assert(Math.abs(headed(118) - 120) < 0.1, "…pointed square to the wall, it is square to the wall");
const beside3 = constrainNext(o, { x: 4000 * Math.cos(rad(2)), y: 4000 * Math.sin(rad(2)) }, firstSideAngles(3));
assert(beside3.y === 0 && beside3.x === 4000, "beside a wall 3° off square, a side drawn nearly flat is flat");
assert(lockAngle(22.5, [{ refDeg: 0, stepDeg: 45 }, { refDeg: 22.5, stepDeg: 90 }]) === 22.5 && lockAngle(22.5, [{ refDeg: 0, stepDeg: 45 }]) === 45, "a direction a wall offers exactly is taken; the room's own grid rounds up on its tie");
// The LATER sides, the first side laid along a 60° wall: straight down the room is 90°, square to
// the wall is 150°, and the wall's own diagonals are nobody's.
const after60 = laterSideAngles(60);
const then = (d: number) => {
  const p = constrainNext(o, { x: 4000 * Math.cos(rad(d)), y: 4000 * Math.sin(rad(d)) }, after60);
  return ((deg(Math.atan2(p.y, p.x)) % 360) + 360) % 360;
};
assert(Math.abs(then(88) - 90) < 0.1 && Math.abs(then(100) - 90) < 0.1, "after a side along a 60° wall, a side pointed nearly straight down IS straight down");
assert(Math.abs(then(147) - 150) < 0.1, "…pointed square to the wall, it is square to the wall");
assert(Math.abs(then(70) - 60) < 0.1 && Math.abs(then(178) - 180) < 0.1, "…along the wall, or the room's horizontal, as pointed");
const after0 = laterSideAngles(0);
assert(Math.abs(((deg(Math.atan2(constrainNext(o, { x: 1480, y: 1530 }, after0).y, constrainNext(o, { x: 1480, y: 1530 }, after0).x)) % 360) + 360) % 360 - 45) < 0.1, "after a side on the room's grid, the room's 45° grid is all there is — as before");

const skew = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6030, y: 4000 },
  { x: 10, y: 3980 },
];
const sq = squareUp(skew);
assert(sq[1].y === sq[0].y && sq[2].x === sq[1].x && sq[3].y === sq[2].y && sq[0].x === sq[3].x, "a nearly-square outline is made square");
const diamond = [
  { x: 0, y: 0 },
  { x: 2000, y: 2000 },
  { x: 0, y: 4000 },
  { x: -2000, y: 2000 },
];
assert(squareUp(diamond)[1].x === 2000, "…a meant 45° is left alone");

const bow = [
  { x: 0, y: 0 },
  { x: 2000, y: 2000 },
  { x: 2000, y: 0 },
  { x: 0, y: 2000 },
];
assert(selfIntersects(bow) && !selfIntersects(skew), "a bow-tie crosses itself; a rectangle does not");

// Two 4×2 stages 700mm apart and 150mm out of line are pushed together and lined up.
const moved = stickBoxes([
  { id: "a", centre: { x: 0, y: 0 }, rotation: 0, widthMm: 6000, depthMm: 4000 },
  { id: "b", centre: { x: 5700, y: 150 }, rotation: 0, widthMm: 4000, depthMm: 2000 },
]);
const b = moved.get("b")!;
assert(b.x === 5000 && (b.y === -1000 || b.y === 1000 || b.y === 0), "a stage beside another is pushed flush and lined up");
const below = stickBoxes([
  { id: "a", centre: { x: 0, y: 0 }, rotation: 0, widthMm: 6000, depthMm: 4000 },
  { id: "c", centre: { x: 100, y: 3800 }, rotation: 0, widthMm: 6000, depthMm: 2000 },
]).get("c")!;
assert(below.x === 0 && below.y === 3000, "…and one in front is pushed back against it and centred");
const angled = stickBoxes([
  { id: "a", centre: { x: 0, y: 0 }, rotation: 0, widthMm: 6000, depthMm: 4000 },
  { id: "d", centre: { x: 9000, y: 0 }, rotation: 30, widthMm: 2000, depthMm: 1000 },
]);
assert(!angled.has("d"), "a stage at 30° to the others is left where it is");

const L = unionOutline([
  [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 2000 },
    { x: 0, y: 2000 },
  ],
  [
    { x: 0, y: 2000 },
    { x: 2000, y: 2000 },
    { x: 2000, y: 4000 },
    { x: 0, y: 4000 },
  ],
]);
assert(!!L && L.length === 6, "two touching rectangles become one L of six corners");
assert(
  unionOutline([
    [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ],
    [
      { x: 3000, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 1000 },
      { x: 3000, y: 1000 },
    ],
  ]) === null,
  "two stages apart are not one",
);
// Editing: a 6×4 split along its back and half of it pushed out is an L; its corner dragged keeps
// it square; cleaned, a rectangle with a corner in the middle of a side is four corners again.
const box = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 4000 },
  { x: 0, y: 4000 },
];
const split = splitSide(box, 0, 2);
assert(split.outline.length === 6 && split.front === 0, "a split side is two corners on its middle, and the front stays put");
const quarter = splitSide(box, 0, 0, 0.25);
assert(quarter.outline[1].x === box[0].x + (box[1].x - box[0].x) / 4 && quarter.outline[1].y === box[0].y && quarter.outline[2].x === quarter.outline[1].x, "a side double-clicked a quarter along splits there (connected drawings §5.1)");
const ell = pushSide(split.outline, 2, 2000);
assert(ell[2].y === 6000 && ell[3].y === 6000 && ell[4].y === 4000 && !selfIntersects(ell), "…so half of it pushes out into an L");
const sheet = (mm: number) => Math.round(mm / 1220) * 1220;
const pushed = pushSide(box, 1, 900, sheet);
assert(pushed[1].x === 7320 && pushed[2].x === 7320, "a side pushed out lands where the next side is a length the decks build");
const dragged = moveVertex(ell, 3, { x: 2600, y: 6400 }, 0);
assert(dragged[3].x === 2600 && dragged[3].y === 6400 && dragged[2].y === 6000 && dragged[4].x === 3000, "a dragged corner moves alone — its neighbours stay where they were");
const squared = moveVertex(ell, 3, { x: 2600, y: 6400 }, 0, undefined, true);
assert(squared[3].x === 2600 && squared[3].y === 6400 && squared[2].y === 6400 && squared[4].x === 2600, "…and with Shift keeps both its square sides square");
const lumpy = cleanOutline(splitSide(box, 2, 0).outline, 4);
assert(lumpy.outline.length === 4 && lumpy.front === 2, "an unpushed split cleans away, and the front is still the same side");
const fewer = removeVertex(ell, 0, 3);
assert(fewer.outline.length === 5 && fewer.front === 0, "a corner taken away joins its two sides");

// ANY SHAPE: the general union, curves kept.
{
  const rect = (x: number, y: number, w: number, h: number) => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
  const overlap = unionShapes([{ outline: rect(0, 0, 4000, 4000) }, { outline: rect(2000, 2000, 4000, 4000) }]);
  assert(!!overlap && overlap.outline.length === 8 && near(Math.abs(areaOf(overlap.outline)), 28e6, 1), "two overlapping squares are one outline of eight corners");
  // A half-round apron flush against the front of a 6×4: its chord on the stage's edge, its arc out.
  const arc = (cx: number, cy: number, r: number, from: number, to: number, n: number) =>
    Array.from({ length: n + 1 }, (_, k) => {
      const th = from + ((to - from) * k) / n;
      return { x: Math.round(cx + r * Math.cos(th)), y: Math.round(cy + r * Math.sin(th)) };
    });
  const half = arc(3000, 4000, 1200, 0, Math.PI, 16); // (4200,4000) round through (3000,5200) to (1800,4000)
  const apron = unionShapes([
    { outline: rect(0, 0, 6000, 4000) },
    { outline: half, smooth: half.map((_, k) => k).filter((k) => k > 0 && k < 16) },
  ]);
  assert(!!apron, "a half-round flush against a rectangle is one stage");
  assert(apron!.smooth.length === 15, "…its curve still a curve: every corner along the arc smooth");
  assert(apron!.outline.length === 4 + 17, "…the rectangle's corners, and the arc's two ends where it meets the front");
  const ends = apron!.outline.filter((q, i) => !apron!.smooth.includes(i) && q.y === 4000 && q.x > 0 && q.x < 6000);
  assert(ends.length === 2, "…which are real corners, not smooth ones");
  // A disc overlapping the edge: what is inside the rectangle is gone, the crossings are corners.
  const discPts = arc(3000, 4000, 1000, 0, 2 * Math.PI, 32).slice(0, 32);
  const disc = unionShapes([{ outline: rect(0, 0, 6000, 4000) }, { outline: discPts, smooth: discPts.map((_, k) => k) }]);
  assert(!!disc && disc.outline.every((q) => q.y <= 4000 + 1001), "a disc over the front edge merges");
  assert(disc!.outline.filter((q, i) => !disc!.smooth.includes(i)).length === 6, "…four rectangle corners and the two crossings");
  // Apart, meeting at a corner, or round a hole: not one stage.
  assert(unionShapes([{ outline: rect(0, 0, 2000, 2000) }, { outline: rect(5000, 0, 2000, 2000) }]) === null, "two stages apart are not one");
  assert(unionShapes([{ outline: rect(0, 0, 2000, 2000) }, { outline: rect(2000, 2000, 2000, 2000) }]) === null, "…nor two that meet only at a corner");
  const frame = [rect(0, 0, 6000, 1000), rect(0, 5000, 6000, 1000), rect(0, 0, 1000, 6000), rect(5000, 0, 1000, 6000)].map((outline) => ({ outline }));
  assert(unionShapes(frame) === null, "…nor four round a hole");
  // Flush within a couple of millimetres, as stages pushed together are.
  const flush = unionShapes([{ outline: rect(0, 0, 3000, 2000) }, { outline: rect(3001, 0, 3000, 2000) }]);
  assert(!!flush && flush.outline.length === 4, "stages flush to a millimetre are one rectangle");
}

// ROUND AREAS, as the area tool draws them.
{
  const disc = ellipseArea({ x: 5000, y: 5000 }, 4000, 4000);
  assert(disc.smooth.length === disc.outline.length && disc.outline.length >= 24, "a disc is a fine polygon, every corner smooth");
  assert(Math.abs(Math.abs(areaOf(disc.outline)) - Math.PI * 4e6) < 0.01 * Math.PI * 4e6, "…of the disc's area");
  const tilted = ellipseArea({ x: 0, y: 0 }, 6000, 2000, 90);
  const txs = tilted.outline.map((q) => q.x);
  assert(Math.max(...txs) - Math.min(...txs) < 2100, "an oval turned a quarter stands on its end");
  const half = halfRoundArea({ x: 0, y: 0 }, { x: 4000, y: 0 }, 1);
  assert(half.outline[0].x === 0 && half.outline[half.outline.length - 1].x === 4000, "a half-round starts and ends on its chord");
  assert(half.smooth.length === half.outline.length - 2, "…its two chord ends real corners, the arc smooth");
  assert(half.outline.every((q) => q.y >= -1) && half.outline.some((q) => Math.abs(q.y - 2000) <= 1), "…bulging to the side asked, its apex a corner, two metres out");
  assert(halfRoundArea({ x: 0, y: 0 }, { x: 4000, y: 0 }, -1).outline.every((q) => q.y <= 1), "…or to the other side");
  assert(Math.abs(Math.abs(areaOf(half.outline)) - (Math.PI * 4e6) / 2) < 0.01 * Math.PI * 4e6, "…half a disc of area");
}

// ROUNDED CORNERS AND A BOWED FRONT.
{
  const box6: Point[] = [
    { x: -3000, y: -2000 },
    { x: 3000, y: -2000 },
    { x: 3000, y: 2000 },
    { x: -3000, y: 2000 },
  ];
  const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
  const turnAt = (o: readonly Point[], i: number) => {
    const n = o.length;
    const a = o[(i - 1 + n) % n];
    const c = o[i];
    const b = o[(i + 1) % n];
    const u = Math.atan2(c.y - a.y, c.x - a.x);
    const v = Math.atan2(b.y - c.y, b.x - c.x);
    const d = Math.abs(v - u) % (2 * Math.PI);
    return Math.min(d, 2 * Math.PI - d);
  };
  // Every corner rounded at 1.2m: four arcs (1885mm each — eight chords, seven smooth corners)
  // between real tangent corners, so the rim is eight sides and the front is still a side of its own.
  const all = roundCorners(box6, 1200, "all", 0);
  assert(all.outline.length === 36 && all.smooth.length === 28, "a 6×4 rounded at 1.2m is four arcs of seven smooth corners, each between two real tangent corners");
  assert(all.outline[all.front].x === -1800 && all.outline[all.front].y === -2000 && all.outline[(all.front + 1) % 36].x === 1800, "…and its front is the straight run between the two front tangent points");
  assert(all.outline.every((q) => Math.abs(q.x) <= 3000 && Math.abs(q.y) <= 2000), "…inside the rectangle it was");
  assert(all.smooth.every((i) => turnAt(all.outline, i) < rad(15)), "…every smooth corner turning only a chord's worth");
  const tangent = all.outline.findIndex((q, i) => !all.smooth.includes(i) && q.x === -1800 && q.y === -2000);
  assert(tangent >= 0 && turnAt(all.outline, tangent) < rad(8), "…and a tangent point is a real corner that barely turns");
  assert(Math.abs(areaOf(all.outline)) < 24e6 && Math.abs(areaOf(all.outline)) > 24e6 - 4 * (1 - Math.PI / 4) * 1200 * 1200 - 60_000, "…losing only the four corners' worth of floor");
  // A radius the corner has no room for gives way to half the shorter side.
  const clamped = roundCorners(box6, 5000, "all", 0);
  assert(clamped.outline.every((q) => Math.abs(q.y) <= 2000) && clamped.outline.some((q) => q.x === -1000 && q.y === -2000), "a 5m radius on a 4m-deep stage is clamped to 2m — tangent points at the middle of the short sides");
  // Front corners only, back corners only.
  const fr = roundCorners(box6, 600, "front", 0);
  assert(fr.smooth.length === 6 && fr.outline.some((q) => q.x === 3000 && q.y === 2000) && fr.outline.some((q) => q.x === -3000 && q.y === 2000), "front corners only: the back corners are left square");
  const bk = roundCorners(box6, 600, "back", 0);
  assert(bk.outline[bk.front].x === -3000 && bk.outline[bk.front].y === -2000 && bk.outline[(bk.front + 1) % bk.outline.length].x === 3000, "back corners only: the front is the whole front edge still");
  assert(roundCorners(box6, 0, "all", 0).outline.length === 4, "no radius, no change");
  // A bowed front: an arc through the two front corners, 30cm proud at the middle.
  const bowed = bowFront(box6, 0, 300);
  assert(bowed.front === 0 && bowed.outline[0].x === -3000 && bowed.outline[0].y === -2000, "a bow keeps the front's start as a real corner and the first chord as the front");
  assert(near(Math.min(...bowed.outline.map((q) => q.y)), -2300, 2), "…standing 30cm proud of the line at its middle");
  assert(bowed.smooth.length === bowed.outline.length - 4 && bowed.smooth.every((i) => i >= 1 && i <= bowed.smooth.length), "…its chords' corners smooth, the four rectangle corners real");
  assert(Math.abs(areaOf(bowed.outline)) > 24e6 + 1.1e6 && Math.abs(areaOf(bowed.outline)) < 24e6 + 1.3e6, "…adding about two thirds of 6m × 0.3m of floor");
  assert(bowFront([...box6].reverse(), 2, 300).outline.some((q) => q.y < -2250), "…bulging outward whichever way round the corners run");
  // The composition the fill tool uses: a rounded rectangle with a bow, as ONE line.
  const both = shapeRect(6000, 4000, { roundedMm: 600, roundedAt: "all", bowMm: 300 });
  assert(both.front === 0 && both.offset.x === 0 && both.offset.y === -150, "a bowed rounded rectangle has its front as edge 0 and stands 15cm forward of the plain one");
  const bys = both.outline.map((q) => q.y);
  assert(near(Math.min(...bys), -2150, 2) && near(Math.max(...bys), 2150, 2), "…centred on its own box, which the bow made 4.3m deep");
  const kinks = both.outline.map((_, i) => i).filter((i) => !both.smooth.includes(i)).map((i) => turnAt(both.outline, i));
  assert(kinks.length === 8 && kinks.every((k) => k < rad(15)), "…every real corner a tangent point turning no more than a chord does: the front fillets are struck against the bow's circle, not its chord");
  const plainR = shapeRect(6000, 4000, { roundedMm: 1200 });
  assert(plainR.outline.length === 36 && plainR.offset.y === 0 && plainR.front === 0, "rounding alone is roundCorners, front first");
  const plainB = shapeRect(6000, 4000, { bowMm: 300 });
  assert(plainB.smooth.length === bowed.smooth.length && plainB.offset.y === -150, "a bow alone is bowFront, recentred");
  assert(shapeRect(6000, 4000, {}).outline.length === 4 && shapeRect(6000, 4000, { roundedMm: 0, bowMm: 0 }).outline.length === 4, "nothing asked, the plain rectangle");
  const backOnly = shapeRect(6000, 4000, { roundedMm: 600, roundedAt: "back", bowMm: 300 });
  assert(backOnly.outline[0].x === -3000 && backOnly.outline.filter((q, i) => !backOnly.smooth.includes(i)).length === 6, "a bow with the back corners rounded: the bow's two ends, and two tangent points per back corner");
}
// A typed side length: the far end moves along the side, the side beyond carried square with it.
{
  const r4 = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 3000 }, { x: 0, y: 3000 }];
  const wide = setSideLength(r4, 0, 7320);
  assert(wide[1].x === 7320 && wide[2].x === 7320 && wide[2].y === 3000 && wide[0].x === 0 && wide[3].x === 0, "a 6m front typed as 7.32 is a 7.32×3 rectangle, its first corner where it was");
  const back = setSideLength(r4, 0, 4880, "end");
  assert(back[1].x === 6000 && back[0].x === 1120 && back[3].x === 1120 && back[2].x === 6000, "…and kept at its far end, it is the first corner and the side behind it that move");
  const deep = setSideLength(r4, 1, 3660);
  assert(deep[2].y === 3660 && deep[3].y === 3660 && deep[1].y === 0, "a depth typed moves the back");
  const tri = setSideLength([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 0, y: 3000 }], 0, 5000);
  assert(tri[1].x === 5000 && tri[2].y === 3000, "a triangle's side moves its far corner alone");
}
// A typed corner angle: one side turns about the corner, its length kept; the front stays put.
{
  const r4 = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 3000 }, { x: 0, y: 3000 }];
  const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;
  assert(r4.every((_, k) => near(cornerAngle(r4, k), 90)) && [...r4].reverse().every((_, k) => near(cornerAngle([...r4].reverse(), k), 90)), "a rectangle's corners are 90° whichever way round it runs");
  const chev = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 2000 }, { x: 2000, y: 1000 }, { x: 0, y: 2000 }];
  assert(cornerAngle(chev, 3) > 180, "a notch reads as more than 180°");
  assert(near(cornerAngle(chev, 3), 180 + 2 * deg(Math.atan2(1000, 2000))), "…exactly: the notch of a chevron is 180° plus twice the slope");
  const trap = setCornerAngle(r4, 1, 60);
  assert(trap[0].x === 0 && trap[1].x === 6000 && trap[1].y === 0 && trap[3].x === 0, "the front-right corner typed 60°: the front and the left side stay where they are");
  assert(trap[2].x === 4500 && near(trap[2].y, 2598, 1) && near(cornerAngle(trap, 1), 60, 0.05), "…the right side turned about the corner, 3m long still, leaning in to make 60°");
  assert(near(Math.hypot(trap[2].x - trap[1].x, trap[2].y - trap[1].y), 3000, 1), "…its length kept");
  const both = setCornerAngle(trap, 0, 60, "prev");
  assert(both[0].x === 0 && both[1].x === 6000 && near(both[3].x, 1500, 1) && near(both[3].y, 2598, 1) && near(cornerAngle(both, 0), 60, 0.05), "the front-left corner typed 60° with the front kept: the LEFT side turns, its own far corner moving");
  assert(near(both[2].y, both[3].y, 1), "…a symmetric trapezoid, its back level");
  const back = setCornerAngle(setCornerAngle(r4, 1, 60), 1, 90);
  assert(back.every((v, k) => near(v.x, r4[k].x, 1) && near(v.y, r4[k].y, 1)), "typed back to 90°, it is the rectangle again");
  const mirrored = setCornerAngle([...r4].reverse(), 3, 60);
  assert(near(cornerAngle(mirrored, 3), 60, 0.05), "an outline running the other way round takes the same inside angle");
  assert(setCornerAngle(r4, 1, 0).every((v, k) => v.x === r4[k].x) && setCornerAngle(r4, 1, 360).every((v, k) => v.x === r4[k].x), "0° and 360° are no angle: refused");
  // QA 2026-11-20 ST-7: the back against a wall (y = 3000). The side that turns keeps its far corner
  // ON the wall — sliding along it, the side taking the length that needs — instead of lifting it
  // 61 mm off and tilting the back.
  const wall: [Point, Point] = [{ x: -10000, y: 3000 }, { x: 20000, y: 3000 }];
  const slid = setCornerAngle(r4, 1, 100, "next", wall);
  assert(slid[2].y === 3000 && slid[3].x === 0 && slid[3].y === 3000, "a typed 100° slides the back corner along the wall it stands on");
  assert(near(cornerAngle(slid, 1), 100, 0.05) && near(Math.hypot(slid[2].x - slid[1].x, slid[2].y - slid[1].y), 3000 / Math.cos(rad(10)), 1), "…the angle made, the side as long as reaching the wall takes");
  const slidPrev = setCornerAngle(r4, 0, 100, "prev", wall);
  assert(slidPrev[3].y === 3000 && slidPrev[1].x === 6000 && near(cornerAngle(slidPrev, 0), 100, 0.05), "…and the same turning the side arriving at the corner");
  const lifted = setCornerAngle(r4, 1, 100);
  assert(near(lifted[2].y, 3000 * Math.cos(rad(10)), 1), "with no wall, the side keeps its length (the old rule)");
  const parallel = setCornerAngle(r4, 1, 90.0001, "next", [{ x: 6000, y: -10000 }, { x: 6000, y: 20000 }]);
  assert(near(Math.hypot(parallel[2].x - parallel[1].x, parallel[2].y - parallel[1].y), 3000, 1), "a wall the turned side runs along is no wall to slide on: its length is kept");
}
// QA 2026-11-20 ST-4: a side's length as typed — centimetres, as the box says, but a number that
// cannot be centimetres of a stage side is metres, as the side's own figure on the plan is.
{
  const mm = (t: string) => typedSideLength(t)?.mm ?? null;
  assert(mm("600") === 6000 && typedSideLength("600")!.metres === false, "600 is centimetres");
  assert(mm("6") === 6000 && typedSideLength("6")!.metres, "6 is six metres — no side is 6cm");
  assert(mm("5.5") === 5500 && mm("5,5") === 5500, "5.5 (or 5,5) is five and a half metres");
  assert(mm("12.20") === 12200 && mm("6.00") === 6000, "a decimal under a hundred is metres");
  assert(mm("60") === 600 && mm("488") === 4880 && mm("600.5") === 6005, "a whole number from 10, or a decimal from 100, is centimetres");
  assert(mm("") === null && mm("0") === null && mm(".") === null && mm("abc") === null && mm("-5") === null, "nothing, nought or no number is no length");
}
console.log("stage-draw self-check passed");
