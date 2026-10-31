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
import { polygonAreaMm2 } from "../studio/geometry";
import { footprintPolygons } from "../studio/proximity";
import { detectFaces, pointInPolygon, type Face } from "./faces";
import { featureFootprint, newFeature, type StructureFeature, type SurfaceMaterial, type VenueStructure } from "./structure";
import { isMain } from "../self-check";

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
export function asOutline(boundary: readonly Point[]): Pick<StructureFeature, "x" | "y" | "widthMm" | "depthMm" | "rotationDeg" | "shape" | "outline" | "edgeCurves"> {
  const pts = boundary.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
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
    edgeCurves: undefined,
  };
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

// ponytail: self-check. Run: npm run check:face-surfaces
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const build = (pts: Record<string, [number, number]>, edges: [string, string][]): VenueStructure => ({
    nodes: Object.entries(pts).map(([id, [x, y]]) => ({ id, x, y })),
    walls: edges.map(([a, b], i) => ({ id: `w${i}`, a, b, kind: "edge" as const })),
    entrances: [],
    features: [],
  });
  const move = (s: VenueStructure, id: string, x: number, y: number): VenueStructure => ({ ...s, nodes: s.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) });
  const box = (f: StructureFeature) => featureWorldOutline(f).reduce(
    (b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );

  // Two closed shapes side by side, sharing a wall: a 4×3 m path and a 6×3 m bed.
  let s = build(
    { A: [0, 0], B: [4000, 0], C: [10000, 0], D: [10000, 3000], E: [4000, 3000], F: [0, 3000] },
    [["A", "B"], ["B", "C"], ["C", "D"], ["D", "E"], ["E", "F"], ["F", "A"], ["B", "E"]],
  );
  let faces = detectFaces(s);
  const path = faces.find((f) => pointInPolygon({ x: 2000, y: 1500 }, f.boundary))!;
  const laid = surfaceInFace(path, "gravel");
  assert(laid.kind === "surface" && laid.surface === "gravel" && laid.fillsFace === true, "a filled shape is a gravel surface that follows its walls");
  assert(laid.widthMm === 4000 && laid.depthMm === 3000 && laid.x === 2000 && laid.y === 1500 && laid.shape === "custom", "…laid wall to wall: 4×3 m, centred in the shape");
  s = { ...s, features: [{ ...laid, id: "p" }] };
  assert(syncFaceSurfaces(s) === s, "nothing moved — the same structure back, not a copy");

  // The shared wall is dragged 1 m into the bed: the path grows with it, the bed is not taken.
  const wider = syncFaceSurfaces(move(move(s, "B", 5000, 0), "E", 5000, 3000));
  const p = wider.features[0];
  assert(box(p).maxX === 5000 && box(p).minX === 0 && p.widthMm === 5000, `the path follows its wall out to 5 m (${box(p).minX}…${box(p).maxX})`);
  // …and dragged PAST where its middle was: a stored point would now be in the bed.
  const narrow = syncFaceSurfaces(move(move(s, "B", 1500, 0), "E", 1500, 3000));
  assert(box(narrow.features[0]).maxX === 1500 && box(narrow.features[0]).minX === 0, "a wall dragged past the path's middle still leaves it the path, not the bed next door");

  // A small bed drawn INSIDE the path (its own loop, not joined to the walls) does not shrink it.
  const bed = build({ a: [1500, 1000], b: [2500, 1000], c: [2500, 2000], d: [1500, 2000] }, [["a", "b"], ["b", "c"], ["c", "d"], ["d", "a"]]);
  const withBed: VenueStructure = { ...s, nodes: [...s.nodes, ...bed.nodes], walls: [...s.walls, ...bed.walls.map((w) => ({ ...w, id: `b${w.id}` }))] };
  const still = syncFaceSurfaces(withBed);
  assert(box(still.features[0]).maxX === 4000 && still.features[0].widthMm === 4000, "a bed drawn in the middle of the path leaves the path's surface the path");

  // The walls come open: the surface stays where it was, and is re-laid when they close again.
  const open = move({ ...s, walls: s.walls.filter((w) => w.id !== "w5") }, "B", 4500, 0);
  const opened = syncFaceSurfaces(open);
  assert(opened.features[0] === open.features[0], "walls that no longer close leave the surface as it was");
  const closed = syncFaceSurfaces({ ...opened, walls: s.walls });
  assert(closed.features[0].widthMm === 4500 && box(closed.features[0]).maxX === 4500, "…and closing them again lays it on the shape as it is now");

  // A freehand trace → a free surface of exactly that outline, and back again without creeping.
  faces = detectFaces(s);
  const trace = [{ x: 0, y: 0 }, { x: 3001, y: 0 }, { x: 3001, y: 1999 }, { x: 0, y: 1999 }];
  const free: StructureFeature = { ...surfaceFromBoundary(trace, "grass"), id: "g" };
  assert(!followsWalls(free), "a traced surface is free — it follows no walls");
  let w = featureWorldOutline(free);
  assert(w.every((q, i) => Math.abs(q.x - trace[i].x) < 1e-9 && Math.abs(q.y - trace[i].y) < 1e-9), "an odd-sized trace comes back exactly as traced (the centre on a half millimetre)");
  let g = free;
  for (let k = 0; k < 200; k++) {
    g = { ...g, ...asOutline(featureWorldOutline(g).map((q, i) => (i === 2 ? { x: 3001 + k, y: 1999 } : q))) };
  }
  w = featureWorldOutline(g);
  assert(w[0].x === 0 && w[0].y === 0 && w[1].x === 3001 && w[3].y === 1999, "two hundred frames of one corner's drag leave every other corner exactly where it was");

  // A ground tool clicked twice in one shape finds the first surface, and a courtyard paved after a
  // bed in it goes UNDER the bed.
  assert(surfaceFilling(s, faces.find((f) => pointInPolygon({ x: 2000, y: 1500 }, f.boundary))!, faces)?.id === "p", "the path already has its surface");
  const court = build({ A: [0, 0], B: [20000, 0], C: [20000, 20000], D: [0, 20000] }, [["A", "B"], ["B", "C"], ["C", "D"], ["D", "A"]]);
  const bedFirst = { ...court, features: [{ ...surfaceFromBoundary([{ x: 1000, y: 1000 }, { x: 3000, y: 1000 }, { x: 3000, y: 3000 }, { x: 1000, y: 3000 }], "soil"), id: "bed" }] };
  const paved = addSurfaceUnder(bedFirst, surfaceInFace(detectFaces(court)[0], "paving"));
  assert(paved.structure.features[0].id === paved.featureId && paved.structure.features[1].id === "bed", "the courtyard's paving is laid under the bed already in it");
  const beside = addSurfaceUnder(bedFirst, surfaceFromBoundary([{ x: 30000, y: 0 }, { x: 31000, y: 0 }, { x: 31000, y: 1000 }], "sand"));
  assert(beside.structure.features[1].id === beside.featureId, "…and one laid elsewhere goes on top as before");

  // A closed shape made a BUILDING: a structure of the shape's outline, roofed at its height, that
  // follows the walls as a face surface does — and is not what a ground tool finds in the face.
  {
    const faces2 = detectFaces(s);
    const room = faces2.find((f) => pointInPolygon({ x: 2000, y: 1500 }, f.boundary))!;
    const built = buildingInFace(room, 3500);
    assert(built.kind === "structure" && built.fillsFace === true && built.heightMm === 3500 && built.locked === true, "a building fills the shape as a locked structure of its height");
    assert(built.widthMm === 4000 && built.depthMm === 3000 && built.x === 2000 && built.shape === "custom" && built.style?.dash === "solid", "…laid wall to wall on the shape, drawn in a solid line");
    assert(followsWalls(built), "…and it follows the walls");
    const sb: VenueStructure = { ...s, features: [{ ...built, id: "b" }] };
    const moved = syncFaceSurfaces(move(move(sb, "B", 5000, 0), "E", 5000, 3000));
    assert(box(moved.features[0]).maxX === 5000 && moved.features[0].widthMm === 5000 && moved.features[0].heightMm === 3500, "the building follows its wall out to 5 m and keeps its height");
    assert(surfaceFilling(sb, room, faces2) === undefined && buildingFilling(sb, room, faces2)?.id === "b", "a ground tool finds no surface in the built shape; the building is found as a building");
    assert(buildingInFace(room).heightMm === BUILDING_HEIGHT_MM, "a building with no height typed is one storey");
  }

  console.log("face surfaces: ok");
}
