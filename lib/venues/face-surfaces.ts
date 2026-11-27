// A closed shape laid in a material WITHOUT making it a zone (the user, 2026-10-17: "i want to be
// able to color / surface closed shape without make it a known zone").
//
// A ZONE names a region an event can book; a SURFACE is what the ground there is laid in. For a
// walled area the two were welded together: the only way to pave the inside of four boundary lines
// was to name it, and the zone list would fill with "שביל" and "ערוגה" nobody will ever book. Now a
// `surface` feature may FILL a closed shape of the wall graph (a face, ./faces.ts) — `fillsFace` —
// and every edit of the walls re-lays it on that shape (syncFaceSurfaces), exactly as a face zone
// follows its walls. The outline is still STORED on the feature, so every reader — the sketch, the
// printed map, clearance — draws it as any other surface and none of them needs the walls.
//
// Which face it is "still" in after an edit is read off its OWN outline as it stood, not a stored
// point: the face that holds most of it now. A stored point fails twice over — a wall dragged past
// it hands the floor to the room next door, and a small bed drawn round it shrinks a courtyard's
// paving down to the bed. A face holding none of it means the walls came open: the surface keeps the
// outline it had (a zone that came open is still drawn where it was) and is re-laid when they close.
//
// A surface that follows walls IS the walls' shape: it takes no drag, no resize and no turn (the hall
// editor passes over it as it does a locked feature). "ניתוק מהקירות" drops the flag and leaves a free
// surface of the same outline, which can then be moved, resized and reshaped point by point.
//
// The same module turns a freehand trace into a free surface, and any surface's outline into plan
// points and back — what the hall editor's outline handles edit.
//
// A closed shape may be a BUILDING the same way (the user, 2026-10-30: the service block between
// אמרה's two halls — "the white polygon between is office and kitchen — I don't want it as a zone,
// but as a building with a ceiling"): a `structure` feature that fills the face, `fillsFace` like a
// surface, so it follows the walls too and every reader — the sketch, the print, the 3D scene, which
// extrudes a structure to its height and so roofs it — sees an ordinary built block, none of them
// needing the walls. A zone would have put the kitchen on the list of rooms an event books, and
// would have had no mass: a zone is a floor and a ceiling, not a thing standing on the property.
import type { Point } from "../studio/hall";
import type { EdgeCurve } from "../studio/hall";
import { polygonAreaMm2 } from "../studio/geometry";
import { footprintPolygons } from "../studio/proximity";
import { customShapeBounds, footprintOutlines } from "../studio/footprint";
import { cleanShape, hasCorners, shapedOutline, type OutlineShape } from "../studio/shaped-outline";
import { detectFaces, pointInPolygon, type Face } from "./faces";
import { featureFootprint, newFeature, type StructureFeature, type SurfaceMaterial, type VenueStructure } from "./structure";
import { featureOutlineShape } from "./structure";

/** Whether this surface or building follows the walls round it (and so takes no drag, resize or turn). */
export function followsWalls(f: Pick<StructureFeature, "kind" | "fillsFace">): boolean {
  return (f.kind === "surface" || f.kind === "structure") && !!f.fillsFace;
}

/** A new building's height: a single storey, the ceiling the halls default to (./zone.ts). */
export const BUILDING_HEIGHT_MM = 4000;

/** How a building drawn over a face looks: a solid line and a pale solid fill, like a wall's — not
 *  the dashed outline a loose structure rests in, which read as a hole with a name in it. */
const BUILDING_STYLE = { fill: "#f3f1ec", stroke: "#6f6a5e", dash: "solid" as const };

/** A feature's outline as drawn, in plan millimetres — its footprint turned and placed, a bowed side
 *  cut into short chords. */
export function featureWorldOutline(f: StructureFeature): Point[] {
  return footprintPolygons(featureFootprint(f), { x: f.x, y: f.y }, f.rotationDeg ?? 0)[0] ?? [];
}

/** The fields that make a feature's outline exactly `boundary` (plan mm): a drawn shape, unturned,
 *  centred on its own box. EXACT on purpose — the box is taken from the rounded points and the centre
 *  may fall on a half millimetre — because featureFootprint stretches an outline to width × depth,
 *  and an outline a millimetre off its box would creep by that much on every frame of a corner drag
 *  that re-reads it. `edgeCurves: undefined` clears the curves of a shape it replaces. */
export function asOutline(
  boundary: readonly Point[],
  edgeCurves?: readonly (EdgeCurve | null)[],
  corners?: readonly (number | null)[],
): Pick<StructureFeature, "x" | "y" | "widthMm" | "depthMm" | "rotationDeg" | "shape" | "outline" | "edgeCurves"> & Pick<StructureFeature, "corners"> {
  const pts = boundary.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  // A bowed or rounded outline (2026-11-07) keeps its bows and radii on the same points — the curves
  // are offsets from their sides' ends and a radius is a length, so moving the lot to its box's
  // centre changes neither — and its box is the box of what is DRAWN, the box featureFootprint
  // measures it by (scaleOutline), so it is scaled by exactly 1 and every point lands where it was.
  const kept = cleanShape({ outline: pts, ...(edgeCurves ? { edgeCurves: [...edgeCurves] } : {}), ...(corners ? { corners: [...corners] } : {}) });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  if (kept.edgeCurves || hasCorners(kept.corners)) {
    const drawn = shapedOutline(pts, kept.edgeCurves, kept.corners);
    ({ minX, minY, maxX, maxY } = customShapeBounds(drawn.outline, drawn.edgeCurves));
  } else {
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
  }
  const x = (minX + maxX) / 2;
  const y = (minY + maxY) / 2;
  return {
    x,
    y,
    widthMm: Math.max(1, maxX - minX),
    depthMm: Math.max(1, maxY - minY),
    rotationDeg: 0,
    shape: "custom",
    outline: pts.map((p) => ({ x: p.x - x, y: p.y - y })),
    edgeCurves: kept.edgeCurves,
    corners: kept.corners,
  };
}

/** A feature's outline as its points, bows and radii in plan millimetres — what the hall editor's
 *  "עריכת הקווים" edits (components/venue-plan.tsx RegionOutlineEditor), handed back through
 *  asOutline. The drawn shape's points, not its flattened polygon (featureWorldOutline): a bowed side
 *  is one side with its bow, a rounded corner one point with its radius. Turned and placed exactly as
 *  the drawing is — scaled like featureFootprint, about the box of what is drawn. Any single-outline
 *  footprint will do: a rectangle is its four corners, an ellipse its four apexes and quarter arcs. */
export function featureEditOutline(f: StructureFeature): OutlineShape {
  const own = featureOutlineShape(f) ?? footprintOutlines(featureFootprint(f))[0];
  if (!own) return { outline: [] };
  const t = ((f.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const turn = (v: Point): Point => ({ x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos });
  const outline = own.outline.map((v) => {
    const q = turn(v);
    return { x: f.x + q.x, y: f.y + q.y };
  });
  const edgeCurves = own.edgeCurves?.map((c) => (c ? { c1: turn(c.c1), c2: turn(c.c2) } : null));
  const corners = "corners" in own ? own.corners : undefined;
  return cleanShape({ outline, ...(edgeCurves ? { edgeCurves } : {}), ...(corners ? { corners: [...corners] } : {}) });
}

/** Whether "עריכת הקווים" is offered on this feature: a pool, a surface, a building or an "אחר" —
 *  or any other feature drawn by hand — that is one outline, free of the walls and not pinned. A
 *  curtain, a chair block, stairs and a column are shapes derived from what they are, not drawn. */
export function canEditOutline(f: StructureFeature): boolean {
  if (f.locked || followsWalls(f)) return false;
  // A pergola too (lib/venues/pergola.ts): its posts stand on whatever corners its outline has,
  // bowed and rounded ones included, so its outline is the venue's to draw.
  const drawn = f.kind === "pool" || f.kind === "surface" || f.kind === "structure" || f.kind === "other" || f.kind === "pergola" || (f.shape === "custom" && (f.kind === "bar" || f.kind === "stage"));
  return drawn && footprintOutlines(featureFootprint(f)).length === 1;
}

/** A new free surface whose outline is `boundary` — a freehand trace closed. */
export function surfaceFromBoundary(boundary: readonly Point[], material: SurfaceMaterial): Omit<StructureFeature, "id"> {
  const { edgeCurves: _none, ...shape } = asOutline(boundary);
  return { ...newFeature("surface", { x: shape.x, y: shape.y }, material), ...shape };
}

/** A new surface filling `face` wall to wall, and following its walls from now on. */
export function surfaceInFace(face: Face, material: SurfaceMaterial): Omit<StructureFeature, "id"> {
  return { ...surfaceFromBoundary(face.boundary, material), fillsFace: true };
}

/** A new building of exactly `boundary` — a freehand trace closed as a built block. */
export function buildingFromBoundary(boundary: readonly Point[], heightMm = BUILDING_HEIGHT_MM): Omit<StructureFeature, "id"> {
  const { edgeCurves: _none, ...shape } = asOutline(boundary);
  return { ...newFeature("structure", { x: shape.x, y: shape.y }), ...shape, heightMm: Math.max(100, Math.round(heightMm)), style: { ...BUILDING_STYLE }, locked: true };
}

/** A new building filling `face` wall to wall — a roofed block `heightMm` high — and following its
 *  walls from now on. Locked, like the lawn: a press meant for the thing beside it must not pick up
 *  the whole kitchen block. */
export function buildingInFace(face: Face, heightMm = BUILDING_HEIGHT_MM): Omit<StructureFeature, "id"> {
  return { ...buildingFromBoundary(face.boundary, heightMm), fillsFace: true };
}

type Box = { minX: number; minY: number; maxX: number; maxY: number };
function boxOf(pts: readonly Point[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** How much two outlines are the same place: their overlap over their union, by a grid of points over
 *  the box round both (exact enough to choose between rooms, and cheap enough for every frame of a
 *  wall drag). 0 = apart. */
function sameness(a: readonly Point[], ab: Box, b: readonly Point[], bb: Box, n = 20): number {
  if (ab.maxX < bb.minX || bb.maxX < ab.minX || ab.maxY < bb.minY || bb.maxY < ab.minY) return 0;
  const minX = Math.min(ab.minX, bb.minX), maxX = Math.max(ab.maxX, bb.maxX);
  const minY = Math.min(ab.minY, bb.minY), maxY = Math.max(ab.maxY, bb.maxY);
  let both = 0;
  let either = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const p = { x: minX + ((i + 0.5) / n) * (maxX - minX), y: minY + ((j + 0.5) / n) * (maxY - minY) };
      const inA = pointInPolygon(p, a as Point[]);
      const inB = pointInPolygon(p, b as Point[]);
      if (inA && inB) both++;
      if (inA || inB) either++;
    }
  return either ? both / either : 0;
}

/** Below this the surface is not "in" that shape any more — the walls came open, or the shape it was
 *  in merged into one many times its size (a bed whose edge was deleted, now part of the courtyard),
 *  and spreading the bed's soil over the courtyard would be the wrong answer to either. A typed wall
 *  that halves a room still scores ½; one that shrinks it to a fifth, ⅕. */
const MIN_SAMENESS = 0.18;

/** The closed shape a face-filling surface is in now: the face most the same place as its outline as
 *  it stood — or null when none is enough of it. */
export function faceOfSurface(f: StructureFeature, faces: readonly Face[]): Face | null {
  const outline = featureWorldOutline(f);
  if (outline.length < 3) return null;
  const ob = boxOf(outline);
  let best: Face | null = null;
  let bestScore = MIN_SAMENESS;
  for (const face of faces) {
    const score = sameness(outline, ob, face.boundary, boxOf(face.boundary));
    if (score >= bestScore) {
      best = face;
      bestScore = score;
    }
  }
  return best;
}

function sameShape(f: StructureFeature, g: ReturnType<typeof asOutline>): boolean {
  if (f.x !== g.x || f.y !== g.y || f.widthMm !== g.widthMm || f.depthMm !== g.depthMm || (f.rotationDeg ?? 0) !== 0 || f.shape !== "custom" || f.edgeCurves) return false;
  const a = f.outline ?? [];
  const b = g.outline ?? [];
  return a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);
}

/** Every face-filling surface re-laid on the closed shape it is in — run after any edit of the walls
 *  or corners. Returns `s` itself when nothing changed, so an edit that touched none of them costs
 *  nothing downstream. */
export function syncFaceSurfaces(s: VenueStructure, faces?: Face[]): VenueStructure {
  if (!s.features.some(followsWalls)) return s;
  const all = faces ?? detectFaces(s);
  let changed = false;
  const features = s.features.map((f) => {
    if (!followsWalls(f)) return f;
    const face = faceOfSurface(f, all);
    if (!face) return f;
    const next = asOutline(face.boundary);
    if (sameShape(f, next)) return f;
    changed = true;
    const { edgeCurves: _none, ...rest } = { ...f, ...next };
    return rest;
  });
  return changed ? { ...s, features } : s;
}

/** The face-filling SURFACE already laid in `face`, if there is one — a second click with a ground
 *  tool changes its material rather than stacking a copy on it. A building in the face is not one:
 *  a ground tool has no material to give it. */
export function surfaceFilling(s: VenueStructure, face: Face, faces: readonly Face[]): StructureFeature | undefined {
  return s.features.find((f) => f.kind === "surface" && followsWalls(f) && faceOfSurface(f, faces) === face);
}

/** The building already standing in `face`, if there is one. */
export function buildingFilling(s: VenueStructure, face: Face, faces: readonly Face[]): StructureFeature | undefined {
  return s.features.find((f) => f.kind === "structure" && followsWalls(f) && faceOfSurface(f, faces) === face);
}

/** Adds a surface UNDER every surface it already contains — a courtyard paved after the beds were
 *  laid in it must not bury them. (Surfaces are drawn beneath everything else, in their own order
 *  among themselves: components/venue-plan.tsx groundFirst.) */
export function addSurfaceUnder(s: VenueStructure, f: Omit<StructureFeature, "id">): { structure: VenueStructure; featureId: string } {
  const feature: StructureFeature = { ...f, id: crypto.randomUUID() };
  const mine = featureWorldOutline(feature);
  const area = polygonAreaMm2(mine);
  const at = s.features.findIndex((g) => g.kind === "surface" && g.widthMm * g.depthMm < area * 1.5 && pointInPolygon({ x: g.x, y: g.y }, mine) && polygonAreaMm2(featureWorldOutline(g)) < area);
  const features = at < 0 ? [...s.features, feature] : [...s.features.slice(0, at), feature, ...s.features.slice(at)];
  return { structure: { ...s, features }, featureId: feature.id };
}
