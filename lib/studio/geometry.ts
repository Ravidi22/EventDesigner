import type { DesignDocumentContent, DesignTable } from "@/lib/design-document/types";
import type { EdgeCurve, Point } from "./hall";

// Shoelace formula — true area of an arbitrary (simple) polygon, in mm². Used for the hall
// outline once it's no longer just a rectangle.
// ponytail: computed on the straight-line vertices, ignoring any wall curvature — the badge is a
// rough sqm indicator, not a structural measurement, so the small bulge error doesn't matter.
export function polygonAreaMm2(outline: Point[]): number {
  let sum = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

// EdgeCurve stores control points as offsets from their own edge's endpoints (see hall.ts) so
// that moving a vertex carries its curves along. These resolve an edge's curve to absolute mm.
export function absoluteControlPoints(a: Point, b: Point, curve: EdgeCurve): { c1: Point; c2: Point } {
  return {
    c1: { x: a.x + curve.c1.x, y: a.y + curve.c1.y },
    c2: { x: b.x + curve.c2.x, y: b.y + curve.c2.y },
  };
}

// SVG path "d" for a closed outline: straight edges by default, cubic bezier where
// edgeCurves[i] is set. Edge i runs from outline[i] to outline[(i+1) % n].
export function outlinePathD(outline: Point[], edgeCurves?: (EdgeCurve | null)[]): string {
  if (outline.length < 2) return "";
  const n = outline.length;
  let d = `M ${outline[0].x} ${outline[0].y}`;
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const curve = edgeCurves?.[i];
    if (curve) {
      const { c1, c2 } = absoluteControlPoints(a, b, curve);
      d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
    } else {
      d += ` L ${b.x} ${b.y}`;
    }
  }
  return d + " Z";
}

// Open (non-closed) SVG path for a single edge — used to give each wall its own clickable/
// draggable element in the interactive editor, instead of one combined closed path.
export function edgePathD(a: Point, b: Point, curve?: EdgeCurve | null): string {
  if (!curve) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  const { c1, c2 } = absoluteControlPoints(a, b, curve);
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
}

// De Casteljau split of a cubic at parameter t → the two halves as their own control points.
type Cubic = [Point, Point, Point, Point];
const lerpPt = (p: Point, q: Point, t: number): Point => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
function splitCubic(c: Cubic, t: number): { left: Cubic; right: Cubic } {
  const [p0, p1, p2, p3] = c;
  const p01 = lerpPt(p0, p1, t);
  const p12 = lerpPt(p1, p2, t);
  const p23 = lerpPt(p2, p3, t);
  const p012 = lerpPt(p01, p12, t);
  const p123 = lerpPt(p12, p23, t);
  const p0123 = lerpPt(p012, p123, t);
  return { left: [p0, p01, p012, p0123], right: [p0123, p123, p23, p3] };
}

// SVG "d" for the slice of a wall between chord-fractions t0..t1 — a straight segment, or a real
// bezier sub-curve when the wall is bowed. Lets a door cut a hole out of a curved wall without
// straightening it: render the stub on either side of the door's t-range.
export function wallSegmentD(a: Point, b: Point, curve: EdgeCurve | null, t0: number, t1: number): string {
  if (!curve) {
    const p0 = lerpPt(a, b, t0);
    const p1 = lerpPt(a, b, t1);
    return `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`;
  }
  const { c1, c2 } = absoluteControlPoints(a, b, curve);
  const right = splitCubic([a, c1, c2, b], t0).right; // [t0, 1]
  const t1b = t0 >= 1 ? 0 : (t1 - t0) / (1 - t0); // remap t1 into the [t0,1] sub-curve
  const [q0, q1, q2, q3] = splitCubic(right, t1b).left; // [t0, t1]
  return `M ${q0.x} ${q0.y} C ${q1.x} ${q1.y} ${q2.x} ${q2.y} ${q3.x} ${q3.y}`;
}

// Point at t on a cubic bezier — used to place a wall's drag handle at its visual midpoint.
export function cubicPointAt(a: Point, c1: Point, c2: Point, b: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt ** 3 * a.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * b.x,
    y: mt ** 3 * a.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * b.y,
  };
}

export function edgeMidpoint(a: Point, b: Point, curve?: EdgeCurve | null): Point {
  if (!curve) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const { c1, c2 } = absoluteControlPoints(a, b, curve);
  return cubicPointAt(a, c1, c2, b, 0.5);
}

// Sane ceiling for how far a wall can bow, or a bezier handle can sit, relative to the wall's own
// length — without this a runaway drag (or a corrupted save) produces a curve stretching for
// kilometres, which is what "עיקום" showing a huge number was: nothing was ever clamping it.
export function maxBulgeDepthMm(wallLenMm: number): number {
  return Math.min(wallLenMm * 0.6, 5000);
}
function maxHandleOffsetMm(wallLenMm: number): number {
  return Math.min(wallLenMm * 3, 30000);
}
function clampMagnitude(p: Point, maxMm: number): Point {
  const dist = Math.hypot(p.x, p.y);
  if (dist <= maxMm || dist === 0) return p;
  const scale = maxMm / dist;
  return { x: p.x * scale, y: p.y * scale };
}

// Derives symmetric default bezier handles when a straight wall is first bowed by dragging its
// midpoint toward `to`, so the curve passes through the cursor at t=0.5 (a symmetric cubic's
// midpoint only picks up 3/4 of the handle offset — scaled by 4/3 here to compensate). Control
// points sit at the 1/3 and 2/3 marks along the wall. Returned as offsets-from-endpoint per the
// EdgeCurve convention. The bulge distance is clamped to maxBulgeDepthMm regardless of how far
// `to` actually is, so a wild drag (or programmatic call) can't produce a runaway curve.
export function bulgeToCurve(a: Point, b: Point, to: Point): EdgeCurve {
  const straightMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const rawDx = to.x - straightMid.x;
  const rawDy = to.y - straightMid.y;
  const rawDist = Math.hypot(rawDx, rawDy);
  const maxDist = maxBulgeDepthMm(wallLengthMm(a, b));
  const scale = rawDist > maxDist ? maxDist / (rawDist || 1) : 1;
  const dx = (rawDx * scale * 4) / 3;
  const dy = (rawDy * scale * 4) / 3;
  return {
    c1: { x: (b.x - a.x) / 3 + dx, y: (b.y - a.y) / 3 + dy },
    c2: { x: -(b.x - a.x) / 3 + dx, y: -(b.y - a.y) / 3 + dy },
  };
}

// Clamps an edge curve's control-point offsets to a sane multiple of the wall's own length — used
// both for direct c1/c2 handle drags and to sanitize any already-corrupted saved data on load.
export function clampEdgeCurve(a: Point, b: Point, curve: EdgeCurve): EdgeCurve {
  const max = maxHandleOffsetMm(wallLengthMm(a, b));
  return { c1: clampMagnitude(curve.c1, max), c2: clampMagnitude(curve.c2, max) };
}

// Numeric wall editing: length/angle move a wall's end vertex directly, so typing a value and
// dragging its handle both write through the same moveVertex plumbing.
export function wallLengthMm(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// Degrees, standard math convention (0° = +X, counter-clockwise positive), normalized to [0,360).
export function wallAngleDeg(a: Point, b: Point): number {
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

export function endpointFromLengthAngle(a: Point, lengthMm: number, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: a.x + lengthMm * Math.cos(rad), y: a.y + lengthMm * Math.sin(rad) };
}

// Perpendicular distance from a wall's curve to its straight midpoint — the numeric counterpart
// to dragging the bulge handle by hand.
export function bulgeDepthMm(a: Point, b: Point, curve: EdgeCurve | null): number {
  if (!curve) return 0;
  const mid = edgeMidpoint(a, b, curve);
  const straightMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return Math.hypot(mid.x - straightMid.x, mid.y - straightMid.y);
}

// Sets a wall's bulge by depth alone, keeping its current bow direction (or defaulting to
// perpendicular-outward for a wall that's still straight). depthMm <= 0 straightens the wall.
export function setBulgeDepth(a: Point, b: Point, curve: EdgeCurve | null, depthMm: number): EdgeCurve | null {
  if (depthMm <= 0) return null;
  const straightMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  let dirX: number;
  let dirY: number;
  if (curve) {
    const mid = edgeMidpoint(a, b, curve);
    const dx = mid.x - straightMid.x;
    const dy = mid.y - straightMid.y;
    const len = Math.hypot(dx, dy) || 1;
    dirX = dx / len;
    dirY = dy / len;
  } else {
    const wx = b.x - a.x;
    const wy = b.y - a.y;
    const wlen = Math.hypot(wx, wy) || 1;
    dirX = -wy / wlen;
    dirY = wx / wlen;
  }
  return bulgeToCurve(a, b, { x: straightMid.x + dirX * depthMm, y: straightMid.y + dirY * depthMm });
}

// --- Wall-attached entrances (doors) ---
// A door's position is stored as a distance along the wall's straight chord (a→b), not an
// absolute point — so it survives the wall being dragged, lengthened, or curved. ponytail: doors
// are placed along the chord even on a curved wall (no bezier arc-length math) — a fine
// approximation for how far a door realistically sits from a gentle bow.

export function pointAtDistance(a: Point, b: Point, distanceMm: number): Point {
  const len = wallLengthMm(a, b) || 1;
  const t = Math.max(0, Math.min(len, distanceMm)) / len;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// Resolves which two vertices a door's wallIndex refers to, falling back to the width×height
// rectangle for halls saved before outline existed — the same fallback PlanPreview uses.
export function resolveWallEndpoints(outline: Point[] | undefined, widthMm: number, heightMm: number, wallIndex: number): { a: Point; b: Point } {
  const ol =
    outline && outline.length >= 3
      ? outline
      : [
          { x: 0, y: 0 },
          { x: widthMm, y: 0 },
          { x: widthMm, y: heightMm },
          { x: 0, y: heightMm },
        ];
  const n = ol.length;
  return { a: ol[((wallIndex % n) + n) % n], b: ol[(((wallIndex + 1) % n) + n) % n] };
}

// Clamped distance along a→b closest to p — used both to snap a dropped entrance onto a wall and
// to slide an existing one as it's dragged.
export function projectOntoWall(a: Point, b: Point, p: Point): number {
  const len = wallLengthMm(a, b) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  return Math.max(0, Math.min(len, (p.x - a.x) * ux + (p.y - a.y) * uy));
}

export function nearestWallToPoint(outline: Point[], p: Point): { edgeIdx: number; distanceMm: number } {
  let best = { edgeIdx: 0, distanceMm: 0, distSq: Infinity };
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const distanceMm = projectOntoWall(a, b, p);
    const proj = pointAtDistance(a, b, distanceMm);
    const distSq = (p.x - proj.x) ** 2 + (p.y - proj.y) ** 2;
    if (distSq < best.distSq) best = { edgeIdx: i, distanceMm, distSq };
  }
  return { edgeIdx: best.edgeIdx, distanceMm: best.distanceMm };
}

export interface DoorLeaf {
  hinge: Point; // jamb the leaf swings from
  tip: Point; // open end of the leaf
  arcTo: Point; // where the swing arc meets the wall (or, for a double door, the other leaf)
  lenMm: number; // leaf length — also the swing arc's radius
  sweepFlag: 0 | 1;
}

export interface DoorGeometry {
  gapStart: Point;
  gapEnd: Point;
  leaves: DoorLeaf[]; // 1 for a single door, 2 for a double door (most event-hall entrances)
}

function doorLeaf(hinge: Point, arcTo: Point, leafLenMm: number, swx: number, swy: number, ux: number, uy: number): DoorLeaf {
  return {
    hinge,
    tip: { x: hinge.x + swx * leafLenMm, y: hinge.y + swy * leafLenMm },
    arcTo,
    lenMm: leafLenMm,
    sweepFlag: swx * uy - swy * ux > 0 ? 1 : 0,
  };
}

// Classic architectural door symbol: a gap cut in the wall, one or two leaves swung open 90°, and
// a quarter-circle arc tracing each swing. `interiorHint` (e.g. the outline's centroid) resolves
// which side of the wall is "inward" so swingInward is meaningful regardless of wall winding
// direction. A double door splits the opening into two equal leaves hinged at each jamb, both
// swinging the same way and meeting in the middle — the common case for an event-hall entrance.
export function doorGeometry(a: Point, b: Point, distanceMm: number, widthMm: number, swingInward: boolean, interiorHint: Point, doubleDoor = false): DoorGeometry {
  const len = wallLengthMm(a, b) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const nx = -uy;
  const ny = ux;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const normalPointsInward = (interiorHint.x - midX) * nx + (interiorHint.y - midY) * ny > 0;
  const sign = normalPointsInward === swingInward ? 1 : -1;
  const swx = nx * sign;
  const swy = ny * sign;
  const half = widthMm / 2;
  const gapStart = pointAtDistance(a, b, distanceMm - half);
  const gapEnd = pointAtDistance(a, b, distanceMm + half);
  if (!doubleDoor) {
    return { gapStart, gapEnd, leaves: [doorLeaf(gapStart, gapEnd, widthMm, swx, swy, ux, uy)] };
  }
  const mid = pointAtDistance(a, b, distanceMm);
  return {
    gapStart,
    gapEnd,
    leaves: [doorLeaf(gapStart, mid, half, swx, swy, ux, uy), doorLeaf(gapEnd, mid, half, swx, swy, -ux, -uy)],
  };
}

// --- Rotation (stage/bar resize+rotate handles) ---
export function toLocalFrame(p: Point, center: Point, rotationDeg: number): Point {
  const rad = (-rotationDeg * Math.PI) / 180;
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { x: dx * Math.cos(rad) - dy * Math.sin(rad), y: dx * Math.sin(rad) + dy * Math.cos(rad) };
}
export function fromLocalFrame(p: Point, center: Point, rotationDeg: number): Point {
  const rad = (rotationDeg * Math.PI) / 180;
  return {
    x: center.x + p.x * Math.cos(rad) - p.y * Math.sin(rad),
    y: center.y + p.x * Math.sin(rad) + p.y * Math.cos(rad),
  };
}

export function tableAreaMm2(t: DesignTable): number {
  if (t.diameterMm) return Math.PI * (t.diameterMm / 2) ** 2;
  if (t.widthMm && t.depthMm) return t.widthMm * t.depthMm;
  return 0;
}

// Axis-aligned bounds of a table in document units (rotation ignored for hit-testing).
export function tableBounds(t: DesignTable): { halfW: number; halfH: number } {
  if (t.diameterMm) return { halfW: t.diameterMm / 2, halfH: t.diameterMm / 2 };
  return { halfW: (t.widthMm ?? 0) / 2, halfH: (t.depthMm ?? 0) / 2 };
}

export function pointInTable(t: DesignTable, x: number, y: number): boolean {
  const dx = x - t.position.x;
  const dy = y - t.position.y;
  if (t.diameterMm) return dx * dx + dy * dy <= (t.diameterMm / 2) ** 2;
  const { halfW, halfH } = tableBounds(t);
  return Math.abs(dx) <= halfW && Math.abs(dy) <= halfH;
}

export function tableAt(doc: DesignDocumentContent, x: number, y: number): DesignTable | undefined {
  // Topmost first so later-drawn tables win.
  for (let i = doc.tables.length - 1; i >= 0; i--) if (pointInTable(doc.tables[i], x, y)) return doc.tables[i];
  return undefined;
}

if ((import.meta as { main?: boolean }).main) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const round: DesignTable = { id: "r", type: "עגול", number: 1, position: { x: 100, y: 100 }, rotation: 0, diameterMm: 200 };
  assert(pointInTable(round, 100, 100), "center inside");
  assert(pointInTable(round, 199, 100), "edge inside");
  assert(!pointInTable(round, 100, 250), "outside");
  const rect: DesignTable = { id: "b", type: "מלבן", number: 2, position: { x: 0, y: 0 }, rotation: 0, widthMm: 200, depthMm: 100 };
  assert(pointInTable(rect, 90, 40) && !pointInTable(rect, 90, 60), "rect bounds");
  assert(Math.round(tableAreaMm2(round)) === Math.round(Math.PI * 100 ** 2), "round area");
  const outline: Point[] = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }];
  assert(polygonAreaMm2(outline) === 20000, "rectangle polygon area");
  const triangle: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
  assert(polygonAreaMm2(triangle) === 5000, "triangle polygon area");

  const a: Point = { x: 0, y: 0 };
  const b: Point = { x: 1000, y: 0 };
  assert(edgeMidpoint(a, b).x === 500 && edgeMidpoint(a, b).y === 0, "straight edge midpoint");
  const straightD = edgePathD(a, b);
  assert(straightD === "M 0 0 L 1000 0", "straight edge path");
  const curve = bulgeToCurve(a, b, { x: 500, y: 200 });
  const mid = edgeMidpoint(a, b, curve);
  assert(Math.abs(mid.x - 500) < 1e-9 && Math.abs(mid.y - 200) < 1e-9, "bulge lands the curve midpoint on the drag target");
  assert(edgePathD(a, b, curve).startsWith("M 0 0 C "), "curved edge path uses a bezier command");
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
  const fallback = resolveWallEndpoints(undefined, 2000, 1000, 2);
  assert(fallback.a.x === 2000 && fallback.a.y === 1000 && fallback.b.x === 0 && fallback.b.y === 1000, "resolveWallEndpoints falls back to the width×height rectangle");

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

  const localPt = toLocalFrame({ x: 100, y: 0 }, { x: 0, y: 0 }, 90);
  assert(Math.abs(localPt.x) < 1e-9 && Math.abs(localPt.y + 100) < 1e-9, "toLocalFrame undoes a 90° rotation");
  const roundTrip = fromLocalFrame(localPt, { x: 0, y: 0 }, 90);
  assert(Math.abs(roundTrip.x - 100) < 1e-9 && Math.abs(roundTrip.y) < 1e-9, "fromLocalFrame is the inverse of toLocalFrame");
  console.log("geometry self-check passed");
}
