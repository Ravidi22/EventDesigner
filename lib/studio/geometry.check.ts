// npm run check:geometry — the self-check of ./geometry.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignTable } from "@/lib/design-document/types";
import type { Point } from "./hall";
import { absoluteControlPoints, bulgeDepthMm, bulgeToCurve, circleIntersections, clampEdgeCurve, constrainVertexToLocks, cubicPointAt, doorGeometry, edgeMidpoint, edgeParamAt, edgePathD, endpointFromLengthAngle, faceStrokeD, fromLocalFrame, maxBulgeDepthMm, nearestWallToPoint, outlineBounds, pointAtDistance, pointInTable, polygonAreaMm2, polygonCentroid, projectOntoWall, reshapeEdgeKeepingAngles, resizeFromEdge, rotatedExtent, sampleEdgePoints, setBulgeDepth, tableAreaMm2, toLocalFrame, wallAngleDeg, wallEndpoints, wallLengthMm, wallSegmentD } from "./geometry";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const round: DesignTable = { id: "r", type: "עגול", number: 1, position: { x: 100, y: 100 }, rotation: 0, diameterMm: 200 };
assert(pointInTable(round, 100, 100), "center inside");
assert(pointInTable(round, 199, 100), "edge inside");
assert(!pointInTable(round, 100, 250), "outside");
const rect: DesignTable = { id: "b", type: "מלבן", number: 2, position: { x: 0, y: 0 }, rotation: 0, widthMm: 200, depthMm: 100 };
assert(pointInTable(rect, 90, 40) && !pointInTable(rect, 90, 60), "rect bounds");
// Turned a quarter turn, the same table covers the transposed box — and stops covering what it
// used to. A hit test that ignored the angle would get both of these backwards.
const turnedTable: DesignTable = { ...rect, rotation: 90 };
assert(pointInTable(turnedTable, 40, 90) && !pointInTable(turnedTable, 60, 90), "a turned table is tested in its own frame");
assert(!pointInTable(turnedTable, 90, 40), "…and no longer covers what it covered before it was turned");
assert(pointInTable({ ...round, rotation: 37 }, 199, 100), "a round table is the same whichever way it faces");
assert(Math.round(tableAreaMm2(round)) === Math.round(Math.PI * 100 ** 2), "round area");
const outline: Point[] = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }];
assert(polygonAreaMm2(outline) === 20000, "rectangle polygon area");
const triangle: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
assert(polygonAreaMm2(triangle) === 5000, "triangle polygon area");
const rectCentroid = polygonCentroid(outline);
assert(rectCentroid.x === 100 && rectCentroid.y === 50, "rectangle centroid is its centre");
const triCentroid = polygonCentroid([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 0, y: 300 }]);
assert(Math.abs(triCentroid.x - 100) < 1e-9 && Math.abs(triCentroid.y - 100) < 1e-9, "triangle centroid is the average of its vertices");
const flat = polygonCentroid([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
assert(flat.x === 100 && flat.y === 0, "a zero-area outline falls back to the vertex average");

const a: Point = { x: 0, y: 0 };
const b: Point = { x: 1000, y: 0 };
assert(edgeMidpoint(a, b).x === 500 && edgeMidpoint(a, b).y === 0, "straight edge midpoint");
const straightD = edgePathD(a, b);
assert(straightD === "M 0 0 L 1000 0", "straight edge path");
const curve = bulgeToCurve(a, b, { x: 500, y: 200 });
const mid = edgeMidpoint(a, b, curve);
assert(Math.abs(mid.x - 500) < 1e-9 && Math.abs(mid.y - 200) < 1e-9, "bulge lands the curve midpoint on the drag target");
assert(edgePathD(a, b, curve).startsWith("M 0 0 C "), "curved edge path uses a bezier command");
// Sampling a bow: the points have to leave the chord, stay between the endpoints, and be none at
// all on a straight edge (a straight edge's polygon is its two corners, nothing in between).
const sampled = sampleEdgePoints(a, b, curve, 8);
assert(sampled.length === 7, "sampling an edge in 8 steps yields the 7 points strictly between its ends");
assert(sampled.every((p) => p.x > 0 && p.x < 1000), "sampled points stay between the edge's two vertices");
assert(Math.abs(sampled[3].y - 200) < 1e-9, "the middle sample sits on the bulge, not on the chord");
assert(sampleEdgePoints(a, b, null).length === 0, "a straight edge samples to nothing");
// Moving vertex b: since c2 is stored as an offset from b, absoluteControlPoints must move with it.
const movedB = { x: 1200, y: 0 };
const { c2 } = absoluteControlPoints(a, movedB, curve);
assert(Math.abs(c2.x - (movedB.x + curve.c2.x)) < 1e-9, "curve control point tracks its vertex when the vertex moves");

assert(wallLengthMm(a, b) === 1000, "wall length");
assert(wallAngleDeg(a, b) === 0, "wall angle along +X");
assert(Math.abs(wallAngleDeg(a, { x: 0, y: 1000 }) - 90) < 1e-9, "wall angle along +Y is 90°");
const rotated = endpointFromLengthAngle(a, 1000, 90);
assert(Math.abs(rotated.x) < 1e-9 && Math.abs(rotated.y - 1000) < 1e-9, "endpointFromLengthAngle at 90°");
assert(bulgeDepthMm(a, b, null) === 0, "bulge depth of a straight wall is 0");
assert(Math.abs(bulgeDepthMm(a, b, curve) - 200) < 1e-9, "bulge depth matches the earlier 200mm bulge");
const straightened = setBulgeDepth(a, b, curve, 0);
assert(straightened === null, "zero bulge depth straightens the wall");
const rebulged = setBulgeDepth(a, b, null, 150);
assert(rebulged !== null && Math.abs(bulgeDepthMm(a, b, rebulged) - 150) < 1e-9, "setBulgeDepth on a straight wall produces the requested depth");

// The bug report: dragging/typing a wild value must never produce a runaway curve again.
const wildCurve = bulgeToCurve(a, b, { x: 500, y: 78176988 });
assert(bulgeDepthMm(a, b, wildCurve) <= maxBulgeDepthMm(1000) + 1e-6, "bulgeToCurve clamps an absurd target to the max bulge depth");
const wildHandle = clampEdgeCurve(a, b, { c1: { x: 0, y: 78176988 }, c2: { x: 0, y: -78176988 } });
assert(Math.hypot(wildHandle.c1.x, wildHandle.c1.y) <= 3000 + 1e-6, "clampEdgeCurve bounds a corrupted handle offset");

assert(Math.abs(pointAtDistance(a, b, 300).x - 300) < 1e-9, "pointAtDistance walks along the chord");
assert(pointAtDistance(a, b, -50).x === 0 && pointAtDistance(a, b, 5000).x === 1000, "pointAtDistance clamps to the wall's ends");
assert(projectOntoWall(a, b, { x: 300, y: 999 }) === 300, "projectOntoWall drops the perpendicular offset");
const nearest = nearestWallToPoint([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }], { x: 300, y: 10 });
assert(nearest.edgeIdx === 0 && Math.abs(nearest.distanceMm - 300) < 1e-6, "nearestWallToPoint finds the closest edge and offset along it");
const wrapped = wallEndpoints([{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1000 }, { x: 0, y: 1000 }], 2);
assert(wrapped.a.x === 2000 && wrapped.a.y === 1000 && wrapped.b.x === 0 && wrapped.b.y === 1000, "wallEndpoints resolves an edge index to its two vertices");

// Bounds carry the shape's real position, not just its size — a zone drawn out on a venue plane
// must not be reported as if it sat at the origin.
const offsetBox = outlineBounds([{ x: 5000, y: 8000 }, { x: 9000, y: 8000 }, { x: 9000, y: 11000 }, { x: 5000, y: 11000 }]);
assert(offsetBox.minX === 5000 && offsetBox.minY === 8000, "outlineBounds reports the shape's origin, not (0,0)");
assert(offsetBox.widthMm === 4000 && offsetBox.heightMm === 3000, "outlineBounds measures the shape's own extent");
assert(outlineBounds([]).widthMm === 0, "outlineBounds tolerates an empty outline");
// A wall bowed outward must widen the box, or a viewport fitted to it would clip the bulge.
const bowedSquare = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }];
const curves = [null, bulgeToCurve({ x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 1300, y: 500 }), null, null];
assert(outlineBounds(bowedSquare, curves).maxX > 1000, "outlineBounds grows to contain a bowed wall");
assert(outlineBounds(bowedSquare, [null, null, null, null, null]).maxX === 1000, "outlineBounds ignores a stale curve past the last edge");

// A straight wall sliced between two chord-fractions is just the corresponding chord sub-segment.
assert(wallSegmentD(a, b, null, 0.25, 0.75) === "M 250 0 L 750 0", "wallSegmentD slices a straight wall along its chord");
// A full-range slice of a bowed wall is a bezier that still runs vertex→vertex (De Casteljau
// preserves the endpoints exactly), so the door-hole stubs stay welded to the corners.
const bowed = bulgeToCurve(a, b, { x: 500, y: 200 });
const full = wallSegmentD(a, b, bowed, 0, 1);
assert(full.startsWith("M 0 0 C ") && full.endsWith(" 1000 0"), "full-range slice of a bowed wall keeps its two vertices");

const door = doorGeometry(a, b, 500, 900, true, { x: 500, y: 500 });
assert(Math.abs(wallLengthMm(door.gapStart, door.gapEnd) - 900) < 1e-6, "door gap spans the door width");
assert(door.leaves.length === 1, "doorGeometry defaults to a single leaf");
assert(Math.abs(wallLengthMm(door.gapStart, door.leaves[0].tip) - 900) < 1e-6, "single-door leaf length equals the door width");
assert(door.leaves[0].tip.y > 0, "swingInward toward a centroid below the wall opens the leaf downward");

const doubleDoor = doorGeometry(a, b, 500, 900, true, { x: 500, y: 500 }, true);
assert(doubleDoor.leaves.length === 2, "doubleDoor produces two leaves");
assert(Math.abs(wallLengthMm(doubleDoor.leaves[0].hinge, doubleDoor.leaves[0].tip) - 450) < 1e-6, "each double-door leaf is half the opening width");
assert(Math.abs(wallLengthMm(doubleDoor.leaves[1].hinge, doubleDoor.leaves[1].tip) - 450) < 1e-6, "the second leaf matches the first in length");
const doorMid = pointAtDistance(a, b, 500);
assert(Math.abs(doubleDoor.leaves[0].arcTo.x - doorMid.x) < 1e-6 && Math.abs(doubleDoor.leaves[1].arcTo.x - doorMid.x) < 1e-6, "both double-door leaves swing to meet at the opening's midpoint");

// A door on a bowed wall sits ON the bow, not on the straight chord it bows away from — the bug
// this curve parameter exists to fix (the symbol used to land beside the opening, not in it).
const bowedDoor = doorGeometry(a, b, 500, 900, true, { x: 500, y: 500 }, false, bowed);
const chordCenter = pointAtDistance(a, b, 500);
assert(Math.abs(bowedDoor.center.y - chordCenter.y) > 10, "a bowed wall's door centre follows the curve away from the straight chord");
assert(Math.abs(wallLengthMm(bowedDoor.gapStart, bowedDoor.gapEnd) - 900) < 5, "the door gap still spans ~the door width when sampled off a curve");

// Locked walls: a vertex with one locked neighbour is pinned to that wall's original length.
const lockSquare: Point[] = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }];
const oneLock = [true, false, false, false]; // wall 0 (vertex0→vertex1) is locked at length 1000
const pinnedByPrev = constrainVertexToLocks(lockSquare, 1, { x: 1400, y: 300 }, oneLock);
assert(Math.abs(wallLengthMm(lockSquare[0], pinnedByPrev) - 1000) < 1e-6, "dragging the far end of a locked wall keeps its length");
const untouched = constrainVertexToLocks(lockSquare, 2, { x: 1900, y: 900 }, oneLock);
assert(untouched.x === 1900 && untouched.y === 900, "a vertex with no locked neighbour drags freely");
const twoLocks = [true, true, false, false]; // both walls into/out of vertex1 are locked
const pinnedByBoth = constrainVertexToLocks(lockSquare, 1, { x: 1400, y: 300 }, twoLocks);
assert(Math.abs(wallLengthMm(lockSquare[0], pinnedByBoth) - 1000) < 1e-6 && Math.abs(wallLengthMm(pinnedByBoth, lockSquare[2]) - 1000) < 1e-6, "a vertex pinned between two locked walls keeps both their lengths");
assert(circleIntersections({ x: 0, y: 0 }, 10, { x: 1000, y: 0 }, 10).length === 0, "circleIntersections reports no solution when the circles can't reach each other");

const localPt = toLocalFrame({ x: 100, y: 0 }, { x: 0, y: 0 }, 90);
assert(Math.abs(localPt.x) < 1e-9 && Math.abs(localPt.y + 100) < 1e-9, "toLocalFrame undoes a 90° rotation");
const roundTrip = fromLocalFrame(localPt, { x: 0, y: 0 }, 90);
assert(Math.abs(roundTrip.x - 100) < 1e-9 && Math.abs(roundTrip.y) < 1e-9, "fromLocalFrame is the inverse of toLocalFrame");

// Edge-anchored resize: whatever the handle does, the opposite edge must not budge.
const box = { x: 0, y: 0, widthMm: 1000, depthMm: 600, rotationDeg: 0 };
const wider = resizeFromEdge(box, "width", 1, { x: 800, y: 0 }, 200);
assert(wider.sizeMm === 1300 && wider.center.x === 150, "dragging the +width edge out grows by the reach and shifts the centre half of it");
assert(wider.center.x - wider.sizeMm / 2 === -500, "…and the far edge stays exactly where it was");
const fromTheOtherSide = resizeFromEdge(box, "width", -1, { x: -800, y: 0 }, 200);
assert(fromTheOtherSide.sizeMm === 1300 && fromTheOtherSide.center.x + fromTheOtherSide.sizeMm / 2 === 500, "the opposing width handle anchors the +x edge instead");
const deeper = resizeFromEdge(box, "depth", 1, { x: 0, y: 500 }, 200);
assert(deeper.sizeMm === 800 && deeper.center.y - deeper.sizeMm / 2 === -300, "the depth handle anchors the opposite edge on the other axis");
// Rotated 90°, the fixture's own +width edge points along world +y — the maths has to follow it.
const turned = resizeFromEdge({ ...box, rotationDeg: 90 }, "width", 1, { x: 0, y: 800 }, 200);
assert(turned.sizeMm === 1300 && turned.center.x === 0 && turned.center.y === 150, "a rotated fixture resizes along its own axis, not the world's");
const clamped = resizeFromEdge(box, "width", 1, { x: -400, y: 0 }, 200);
assert(clamped.sizeMm === 200 && clamped.center.x - clamped.sizeMm / 2 === -500, "the anchored edge holds even when the size bottoms out at the minimum");
// The reported bug: lengthening one side of a square used to shear the next wall diagonal, and
// "fixing" the opposite wall sheared another — two edits and the rectangle was gone.
const sq: Point[] = [{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 10000 }, { x: 0, y: 10000 }];
const grown = reshapeEdgeKeepingAngles(sq, 0, { x: 12000, y: 0 });
assert(grown !== null, "a square's wall can be reshaped without falling back");
assert(grown!.bIdx === 1 && grown!.b.x === 12000 && grown!.b.y === 0, "the wall's own end vertex lands where asked");
assert(grown!.cIdx === 2 && Math.abs(grown!.c.x - 12000) < 1e-6 && Math.abs(grown!.c.y - 10000) < 1e-6, "the next corner follows, so the square stays a rectangle at 12x10");
// Now the opposite wall of that 12x10, which is what used to destroy the shape on the second edit.
const rect12: Point[] = [{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 10000 }, { x: 0, y: 10000 }];
const shrunk = reshapeEdgeKeepingAngles(rect12, 2, { x: 4000, y: 10000 });
assert(shrunk !== null && Math.abs(shrunk.c.x - 4000) < 1e-6 && Math.abs(shrunk.c.y) < 1e-6, "editing the opposite wall stays rectangular too");

// Nothing above may be secretly assuming axis alignment: same shape turned 45 degrees.
const turnedRect: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 200 }, { x: -100, y: 100 }];
const turnedGrown = reshapeEdgeKeepingAngles(turnedRect, 0, { x: 150, y: 150 });
assert(turnedGrown !== null && Math.abs(turnedGrown.c.x - 50) < 1e-6 && Math.abs(turnedGrown.c.y - 250) < 1e-6, "a rotated rectangle reshapes along its own axes");
const after = turnedRect.map((p, i) => (i === turnedGrown!.bIdx ? turnedGrown!.b : i === turnedGrown!.cIdx ? turnedGrown!.c : p));
assert(Math.abs(wallLengthMm(after[0], after[1]) - wallLengthMm(after[2], after[3])) < 1e-6, "the opposite wall grew to match, so it is still a rectangle");
assert(Math.abs(((wallAngleDeg(after[1], after[2]) - wallAngleDeg(turnedRect[1], turnedRect[2])) % 360)) < 1e-6, "the neighbouring wall kept its original angle");

// Degenerate solves fall back to the old move-one-vertex behaviour rather than inventing a corner.
assert(reshapeEdgeKeepingAngles([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }], 0, { x: 1200, y: 0 }) === null, "a triangle has no spare wall to absorb the change");
const collinear: Point[] = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 1000, y: 2000 }];
assert(reshapeEdgeKeepingAngles(collinear, 0, { x: 1200, y: 0 }) === null, "parallel neighbouring walls never meet, so there is nothing to solve");

// A turned rectangle needs a different box: square on it is the box itself, a right angle swaps
// the two, and 45° is the enclosing square.
{
  const same = rotatedExtent(4000, 2000, 0);
  assert(same.widthMm === 4000 && same.depthMm === 2000, "unturned, a deck's box is its own size");
  const quarter = rotatedExtent(4000, 2000, 90);
  assert(Math.round(quarter.widthMm) === 2000 && Math.round(quarter.depthMm) === 4000, "turned square-on, the two swap");
  assert(Math.round(rotatedExtent(4000, 2000, 180).widthMm) === 4000, "half a turn is the box it started with");
  const diag = rotatedExtent(4000, 2000, 45);
  assert(Math.round(diag.widthMm) === Math.round(diag.depthMm), "at 45° the box is square");
  assert(diag.widthMm > 4000, "…and larger than the deck, which is the generous way to be wrong");
}

// A front shape's FACE marked on the plan (backdrops S2): only the named edges, joined where they
// meet, and nothing when none are named.
const band = [{ x: -1500, y: -10 }, { x: 1500, y: -10 }, { x: 1500, y: 10 }, { x: -1500, y: 10 }];
assert(faceStrokeD(band, undefined, [2]) === "M 1500 10 L -1500 10", `the band's face is its +y side (${faceStrokeD(band, undefined, [2])})`);
assert(faceStrokeD(band, undefined, []) === null && faceStrokeD(band, undefined, undefined) === null, "…none named, nothing drawn");
assert(faceStrokeD(band, undefined, [1, 2]) === "M 1500 -10 L 1500 10 L -1500 10", "consecutive face edges are one run");

// Where along a side a click fell — the parameter a double-click adds a point at (connected drawings §5.1).
assert(Math.abs(edgeParamAt({ x: 0, y: 0 }, { x: 1000, y: 0 }, null, { x: 250, y: 30 }) - 0.25) < 1e-9, "a straight side: the projection");
{
  const a = { x: 0, y: 0 };
  const b = { x: 1000, y: 0 };
  const curve = { c1: { x: 300, y: -400 }, c2: { x: -300, y: -400 } };
  const { c1, c2 } = absoluteControlPoints(a, b, curve);
  const on = cubicPointAt(a, c1, c2, b, 0.3);
  assert(Math.abs(edgeParamAt(a, b, curve, on) - 0.3) < 1e-3, "a bowed side: the bezier parameter of the nearest point");
}

console.log("geometry self-check passed");
