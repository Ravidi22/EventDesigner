// npm run check:face-surfaces — the self-check of ./face-surfaces.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "../studio/hall";
import { detectFaces, pointInPolygon } from "./faces";
import { newFeature, type StructureFeature, type VenueStructure } from "./structure";
import { addSurfaceUnder, asOutline, BUILDING_HEIGHT_MM, buildingFilling, buildingInFace, canEditOutline, featureEditOutline, featureWorldOutline, followsWalls, surfaceFilling, surfaceFromBoundary, surfaceInFace, syncFaceSurfaces } from "./face-surfaces";

// ponytail: self-check. Run: npm run check:face-surfaces
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

// A BOWED AND ROUNDED outline round trip (2026-11-07): what the outline editor reads off a feature
// is the points it wrote, the bows and radii on the same sides and corners, and writing it back
// changes nothing — on every frame of a drag that re-reads it, the shape must not creep.
{
  const pts: Point[] = [{ x: 10000, y: 5000 }, { x: 22000, y: 5000 }, { x: 22000, y: 11000 }, { x: 10000, y: 11000 }];
  const top = { c1: { x: 4000, y: -1600 }, c2: { x: -4000, y: -1600 } };
  let f: StructureFeature = { ...newFeature("pool", { x: 0, y: 0 }), id: "p", ...asOutline(pts, [top, null, null, null], [900, null, 1500, 600]) };
  const read = featureEditOutline(f);
  assert(read.outline.every((p, i) => Math.abs(p.x - pts[i].x) < 1e-6 && Math.abs(p.y - pts[i].y) < 1e-6), "the editor reads back the very points written");
  assert(!!read.edgeCurves?.[0] && !read.edgeCurves?.[1] && read.corners?.[0] === 900 && read.corners?.[1] === null && read.corners?.[2] === 1500, "…with the bow on its side and each radius on its corner");
  const first = JSON.stringify(asOutline(read.outline, read.edgeCurves, read.corners));
  for (let k = 0; k < 10; k++) {
    const r = featureEditOutline(f);
    f = { ...f, ...asOutline(r.outline, r.edgeCurves, r.corners) };
  }
  assert(JSON.stringify(asOutline(featureEditOutline(f).outline, featureEditOutline(f).edgeCurves, featureEditOutline(f).corners)) === first, "ten re-reads and re-writes later, not a millimetre has crept");
  const drawn = featureWorldOutline(f);
  assert(Math.min(...drawn.map((p) => p.y)) < 5000 - 1100, "the bowed top is drawn out beyond the points, where it was bowed");
  assert(!drawn.some((p) => Math.hypot(p.x - 22000, p.y - 11000) < 50), "…and the rounded corner is cut off, where it was rounded");
  // A plain rectangle pool turned 30°: its four corners, where the drawing has them.
  const turned: StructureFeature = { ...newFeature("pool", { x: 1000, y: 2000 }), id: "t", shape: "rect", widthMm: 4000, depthMm: 2000, rotationDeg: 30 };
  const tr = featureEditOutline(turned);
  const world = featureWorldOutline(turned);
  assert(tr.outline.length === 4 && tr.outline.every((p) => world.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6)), "a turned rectangle reads as its four drawn corners");
  assert(canEditOutline(turned) && !canEditOutline({ ...turned, locked: true }) && !canEditOutline({ ...turned, kind: "column" }), "a pool's lines are editable; a pinned one's and a column's are not");
  assert(canEditOutline({ ...turned, kind: "pergola" }), "…and a pergola's: its posts stand on whatever corners it is drawn with");
}

console.log("face surfaces: ok");
