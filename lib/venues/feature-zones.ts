// A zone may be defined by WHAT STANDS IN IT, not only by walls or a trace (the user, 2026-10-17:
// "when multi select, define them as a zone without building around some shape — the canopies at
// אמרה"). Each חופה there is a stage, a runway over a pool and its steps, standing on open ground:
// there is no wall round it to click inside, and tracing a line round it by hand both took a dozen
// clicks and left a copy of the shape that stayed behind the day the stage was moved.
//
// So a third source, `features`: the zone is the ids of the venue features it is made of and a
// margin round them, and its region is re-derived from where those features stand on every read —
// exactly as a face zone stores the point clicked rather than the polygon. Move the stage, stretch
// the runway, add a flight of stairs to it, and the zone follows; delete every one of them and the
// zone is `detached`, like a face zone whose walls came open.
//
// The region is the CONVEX HULL of everything the features cover — their footprints and the flights
// and ramps hung off a stage's edges — grown by the margin with round corners (the Minkowski sum
// with a disc: a margin is "this far from any of them", and a square corner would claim ground a
// metre and a half from the nearest one). Convex because a zone is an area people stand in: the
// water either side of a runway is part of the חופה, and the notch between two features is not a
// place the area stops.
//
// The margin is what puts the things set out ROUND the features inside the zone — the flowers along
// the runway, the arch at the stage's edge, the ceremony chairs — which is what a zone is for in the
// sketch: its sheet, its section of the quote, what counts as "in the חופה".
import type { Point } from "../studio/hall";
import { footprintPolygons } from "../studio/proximity";
import { featureFootprint, type StructureFeature } from "./structure";
import { featureEdgeShapes } from "./stage-edges";

/** The margin a new features zone is given: room for what is set out round the features (a flower
 *  arrangement at the runway's edge, the first row of chairs) without reaching into the next area. */
export const ZONE_MARGIN_MM = 1000;
export const MAX_ZONE_MARGIN_MM = 20_000;

/** Points round a corner of the grown hull: 32 to the circle, a step of 11.25°. On a 1m margin the
 *  chord sits 5mm inside the true arc. */
const ARC_STEPS = 32;

/** Everything a feature covers on the plan, as points: its footprint (every part of it, turned and
 *  placed, curves cut into chords) and the footprint of every flight and ramp on its edges. */
export function featureCoverPoints(f: StructureFeature): Point[] {
  const pts = footprintPolygons(featureFootprint(f), { x: f.x, y: f.y }, f.rotationDeg ?? 0).flat();
  if (f.edgeItems?.length || f.stairs) for (const { shape } of featureEdgeShapes(f)) pts.push(...shape.polygon);
  return pts;
}

/** Andrew's monotone chain. Collinear points are dropped; fewer than three points come back as they are. */
export function convexHull(points: readonly Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** The region of a features zone: the hull of what `ids` cover, grown by `marginMm` with round
 *  corners, in whole millimetres. Ids the structure no longer has are passed over; when none is left,
 *  `[]` — the zone is detached. */
export function featuresBoundary(features: readonly StructureFeature[], ids: readonly string[], marginMm: number): Point[] {
  const wanted = new Set(ids);
  const pts = features.filter((f) => wanted.has(f.id)).flatMap(featureCoverPoints);
  if (pts.length === 0) return [];
  let hull = convexHull(pts);
  const r = Math.max(0, Math.min(MAX_ZONE_MARGIN_MM, marginMm));
  if (r > 0) {
    const ring: Point[] = [];
    for (const p of hull) {
      for (let i = 0; i < ARC_STEPS; i++) {
        const t = (i / ARC_STEPS) * Math.PI * 2;
        ring.push({ x: p.x + r * Math.cos(t), y: p.y + r * Math.sin(t) });
      }
    }
    hull = convexHull(ring);
  }
  const out: Point[] = [];
  for (const p of hull) {
    const q = { x: Math.round(p.x), y: Math.round(p.y) };
    const last = out[out.length - 1];
    if (!last || last.x !== q.x || last.y !== q.y) out.push(q);
  }
  if (out.length > 1 && out[0].x === out[out.length - 1].x && out[0].y === out[out.length - 1].y) out.pop();
  return out.length >= 3 ? out : [];
}

/** How many of a zone's features are still on the plan — the zone dialog's "4 אלמנטים". */
export function presentFeatureIds(features: readonly StructureFeature[], ids: readonly string[]): string[] {
  const have = new Set(features.map((f) => f.id));
  return ids.filter((id) => have.has(id));
}
