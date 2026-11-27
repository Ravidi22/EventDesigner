// The venue as a room: the floors, the ground under them, the walls with their doors cut out and
// their leaves standing open, the ceilings over the roofed zones, and the property's own fixed
// features — its pools recessed into the floors they lie in, its planting by species, its chairs
// in rows. Spec §3.1 (and §3.4 for the chair rows).
//
// Everything is read off what the plan already resolved — `eventPlan(...).all` for the zones and
// their boundaries, `wallPoints`/`doorOffsets`/`featureFootprint` for the structure — and nothing
// here stores a height or a thickness of its own: walls have neither in the venue (DECIDE 6), so
// a wall is WALL_THICK_MM thick and as tall as the tallest ROOFED zone it borders, a garden wall
// where it borders none, and an `edge` kind is a kerb. A door is an opening the wall is split
// round: two stretches at full height, a lintel over the gap from DOOR_HEIGHT_MM up, a trim on
// each jamb, and a leaf (two for a double door) hinged at the jamb and standing open at 90° on the
// side it swings to. Plan mm, +y down the plan, z up from the floor at 0 (./types.ts).
//
// Which zones a wall borders is decided GEOMETRICALLY, not by walking the face graph: a few points
// along the wall are pushed one wall-thickness to either side, and a zone whose boundary polygon
// holds any of them borders the wall. The faces are already folded into the boundaries (a face
// zone's boundary IS its face, `resolveZones`), so this reads the same answer the graph would give
// for a face zone and ALSO the right answer for a region zone drawn freehand over open ground and
// a zone made of features — neither of which the face graph knows about. Three probes, not one,
// because a long wall may border a hall along part of its length and two side rooms along the
// rest; the tallest wins. A door's INWARD side is read the same way, at the door: the side whose
// probe lands in a roofed zone, else in any zone, else +normal.
//
// A pool (and a `water` surface) is a WELL: its water plane recessed WATER_DEPTH_MM, dark walls and
// floor under it, a coping kerb round its rim — and its footprint CUT OUT of every floor it lies in
// (the zone's floor plane, any surface feature's plane, the ground under them all), by the one
// rule "the well's centre is inside that floor". Nothing is cut out of a floor the pool merely
// touches: a hole crossing the outer edge is not a hole. A pool standing ON a platform (most of it on
// a stage's deck — the קוליסאום's basins, 2026-10-24: "the pool should be on top of the stage") is
// a RAISED BASIN on that top instead: a stone wall BASIN_RIM_MM high round the water, nothing cut.
//
// Everything built — a column, the beam it carries, a kiosk, a bar — stands on the floor under it
// (./elevation.ts floorUnder), its height above that floor; a beam on the floor its columns stand on.
// A tree or a palm stands where its TRUNK is, not where its crown reaches: a palm beside a stage,
// its crown half over the deck, was lifted onto it and hung its trunk in the air.
//
// Every plant is INSTANCED per (species, size, colour): a landscaped courtyard is a hundred-odd
// plants of a handful of kinds, so the same tree twenty times is one body with twenty transforms.
// The shapes lift the plan's own drawings (components/plant-glyph.tsx, item-symbol.tsx TREE_CLUMPS)
// into height: a tree's nine lobes become spheres stacked up its crown, a palm's fronds thin tilted
// boxes radiating from the top of its trunk, a hedge a clipped box, a bed a soil slab with a grid of
// heads kept inside its outline.
import type { Point } from "@/lib/studio/hall";
import { type Bounds } from "@/lib/studio/geometry";
import { flattenEdge, footprintOutlines, type BuiltOutline } from "@/lib/studio/footprint";
import { pointInPolygon } from "@/lib/venues/faces";
import { footprintPolygons } from "@/lib/studio/proximity";
import { seatingChair, seatingLayout, seatingOf } from "@/lib/venues/seating";
import { PLANT_DEFAULTS, doorOffsets, featureFootprint, isDoor, isWindow, nodeMap, plantSpecies, surfaceMaterial as featureSurface, wallPoints, windowHeights, type PlantSpecies, type StructureEntrance, type StructureFeature, type VenueStructure, type Wall } from "@/lib/venues/structure";
import type { ResolvedZone } from "@/lib/venues/zone";
import { featureWorldOutline, followsWalls } from "@/lib/venues/face-surfaces";
import { insideOutlines, rimOf } from "@/lib/venues/rim";
import { SceneCollector } from "./collect";
import { applyTransform, headingDeg, roomTransform, turn } from "./frame";
import { chairRequest } from "./items";
import { ENVELOPE, foliageMaterial, glassMaterial, hexOf, surfaceMaterial, waterMaterial } from "./materials";
import { floorKindBody } from "./floor-kinds";
import type { ItemContext } from "./item-context";
import { DEFAULT_TONE } from "@/components/item-symbol";
import { offsetOutline } from "./tables";
import { hedgeParts, palmParts, plantTurn, potParts, shrubParts, treeParts } from "./plants";
import { readStructures, shaftTopOf, type BeamReading, type ColumnReading } from "./structures";
import { pergolaOf } from "@/lib/venues/pergola";
import { DOOR_HEIGHT_MM, DOOR_LEAF_MM, GARDEN_WALL_MM, GROUND_MARGIN_MM, KERB_MM, KERB_THICK_MM, WALL_THICK_MM, WATER_DEPTH_MM, type MaterialRef, type Part, type SceneInput, type Transform, transform, vec3 } from "./types";

/** A curved wall is cut into chords about this long (spec §3.1: 250 mm). */
const WALL_CHORD_MM = 250;
/** Where along a wall it is asked which zones it borders (fractions of its length). */
const BORDER_PROBES = [0.25, 0.5, 0.75];
/** A pool's floor, this far under its water surface — dark, so the water reads as deep. */
const WELL_BELOW_MM = 600;
/** The coping round a pool's rim: a kerb this wide standing on the floor outside the water. */
export const COPING_MM = 150;
export const COPING_HIGH_MM = 100;
/** A raised basin (a pool on a platform): its stone wall, how high over the platform and how thick,
 *  and how far under the wall's top the water stands. */
export const BASIN_RIM_MM = 450;
export const BASIN_WALL_MM = 220;
export const BASIN_WATER_MM = 90;

/** How high a pool's wall stands over what it stands on (2026-11-20, the user: "height on a pool
 *  doesn't really work in the 3D"): the pool's own height when it has one (the /halls bar's "גובה")
 *  — a raised pond, a basin on a terrace; else BASIN_RIM_MM on a platform, else 0 = SUNK, its water
 *  WATER_DEPTH_MM under the floor. A water SURFACE is always sunk. */
export function poolWallMm(f: Pick<StructureFeature, "kind" | "heightMm">, floorZ: number): number {
  if (f.kind !== "pool") return 0;
  if (f.heightMm > 0) return f.heightMm;
  return floorZ > 0 ? BASIN_RIM_MM : 0;
}

/** A raised basin's water: BASIN_WATER_MM under its wall's top, or half way up a very low wall. */
export const basinWaterZ = (wallMm: number): number => Math.max(wallMm - BASIN_WATER_MM, wallMm / 2);
/** A tree's trunk, for what it stands on: a square this wide round its middle. */
const TRUNK_PROBE_MM = 400;
/** A door's frame: a trim this wide on each jamb, standing this far proud of both wall faces. */
export const FRAME_TRIM_MM = 40;
export const FRAME_PROUD_MM = 10;
/** An opening narrower than this (a door clipped off the end of its wall) gets no leaf. */
const MIN_LEAF_MM = 100;
/** A window's pane: this thick, down the middle of the wall. */
export const GLASS_MM = 12;
const GLASS_MATERIAL: MaterialRef = glassMaterial();
/** A palm's fronds: how many, how much they droop from the crown, how thick a leaf plane is. */
/** A flower bed: its soil slab, the heads' size and spacing, and how many heads one bed may carry
 *  (a long bed thins its grid rather than leaving its far end bare). */
export const BED_SOIL_MM = 80;
const HEAD_R_MM = 40;
const HEAD_STEP_MM = 120;
export const MAX_HEADS = 400;
/** A bed's foliage: leafy blobs along it, up to this share of the bed's height, in this green. */
const BED_LEAF_SHARE = 0.7;
const BED_LEAF = "#6f9a5c";
const MAX_BED_BLOBS = 40;
/** A building's roof (a face-filling `structure`, lib/venues/face-surfaces.ts): a slab this thick
 *  whose top lies ROOF_UNDER_MM under the tops of the walls round it — the WALLS are the building's
 *  sides (wallHeightMm raises them to its height), so the roof never doubles them. */
export const ROOF_SLAB_MM = 250;
export const ROOF_UNDER_MM = 2;
/** The venue's own chairs, when the feature says no colour: a pale ivory, like the base chair. */
const VENUE_CHAIR_TONE = "#f7f6fc";

const WELL_MATERIAL: MaterialRef = { colour: "#3b4d5a", kind: "matte" };
/** Paving's own tone (SURFACE_BASE.paving): the stone a pool is edged in. */
export const COPING_MATERIAL: MaterialRef = { colour: "#d9d3c7", kind: "matte" };
/** A raised basin's wall: a pale stone, lighter than the paving's coping. */
export const BASIN_MATERIAL: MaterialRef = { colour: "#efebe4", kind: "matte" };
const WALL_MATERIAL: MaterialRef = { colour: ENVELOPE.wall, kind: "matte" };
const KERB_MATERIAL: MaterialRef = { colour: ENVELOPE.kerb, kind: "matte" };
const CEILING_MATERIAL: MaterialRef = { colour: ENVELOPE.ceiling, kind: "matte" };
const LEAF_MATERIAL: MaterialRef = { colour: ENVELOPE.doorLeaf, kind: "matte" };
const FRAME_MATERIAL: MaterialRef = { colour: ENVELOPE.doorFrame, kind: "matte" };
const SOIL_MATERIAL: MaterialRef = surfaceMaterial("soil");
const FEATURE_FILL = "#e4e0d8";
/** Each species' foliage when the feature carries no fill of its own; a bed's is its heads'. */
export const PLANT_FILL: Record<PlantSpecies, string> = {
  tree: "#8fae84",
  palm: "#6f9a5a",
  shrub: "#7da36b",
  pot: "#7da36b",
  hedge: "#5f8a4e",
  flowers: "#e3688c",
};

/** Bodies whose parts are already in room mm stand at the room's origin, unturned. */
const here = (): Transform => transform(vec3(0, 0, 0));

const rad = (deg: number) => (deg * Math.PI) / 180;

// --- frames ---------------------------------------------------------------------------------------

const featureFrame = (f: StructureFeature): Transform => roomTransform({ position: { x: f.x, y: f.y }, rotation: f.rotationDeg ?? 0 });

/** The transform that undoes `t` (a feature's frame: a turn and a move, never a mirror or a scale),
 *  so a room point can be carried INTO a feature's own frame. */
function inverted(t: Transform): Transform {
  const back = turn({ x: -t.at.x, y: -t.at.y }, -t.rotationDeg);
  return transform(vec3(back.x, back.y, -t.at.z), -t.rotationDeg);
}

/** An outline carried through a frame: its points moved and turned, each edge's control offsets
 *  turned with them (they are offsets from the edge's own ends — lib/studio/geometry
 *  absoluteControlPoints — so a move leaves them alone and a turn turns them). */
function carryOutline(o: BuiltOutline, frame: Transform): BuiltOutline {
  const outline = o.outline.map((p) => {
    const q = applyTransform(frame, vec3(p.x, p.y, 0));
    return { x: q.x, y: q.y };
  });
  const edgeCurves = o.edgeCurves?.map((c) => (c ? { c1: turn(c.c1, frame.rotationDeg), c2: turn(c.c2, frame.rotationDeg) } : c));
  return edgeCurves ? { outline, edgeCurves } : { outline };
}

const localPoint = (back: Transform, p: Point): Point => {
  const q = applyTransform(back, vec3(p.x, p.y, 0));
  return { x: q.x, y: q.y };
};

// --- walls ----------------------------------------------------------------------------------------

/** A wall as a polyline from node a to node b: the chord of a straight wall, ~250 mm chords of a
 *  bowed one (`flattenEdge`, with enough steps for the bow's real length). */
export function wallPolyline(a: Point, b: Point, curve: Wall["curve"]): Point[] {
  if (!curve) return [a, b];
  const rough = flattenEdge(a, b, curve, 16);
  const steps = Math.min(64, Math.max(4, Math.ceil(polylineLength(rough) / WALL_CHORD_MM)));
  return flattenEdge(a, b, curve, steps);
}

function polylineLength(poly: readonly Point[]): number {
  let len = 0;
  for (let i = 1; i < poly.length; i++) len += Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
  return len;
}

/** The point a fraction `t` along a polyline, the unit direction `u` of the stretch it is on
 *  (toward node b) and that stretch's unit normal `n` (`u` turned a quarter clockwise on the plan). */
function alongPolyline(poly: readonly Point[], t: number): { p: Point; u: Point; n: Point } {
  const total = polylineLength(poly);
  let target = total * t;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1];
    const b = poly[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    if (target <= len || i === poly.length - 1) {
      const k = Math.max(0, Math.min(1, target / len));
      const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, u, n: { x: -u.y, y: u.x } };
    }
    target -= len;
  }
  return { p: poly[0], u: { x: 1, y: 0 }, n: { x: 0, y: 1 } };
}

/** A BUILDING on the plan: a face-filling `structure` (lib/venues/face-surfaces.ts) as the region
 *  it covers, in room mm, and its height. Its sides are the wall graph's walls round it, raised to
 *  its height (wallHeightMm); ./featureBodies gives it a roof and nothing else — extruding it as a
 *  solid as well drew every one of its walls twice, a wall standing in a slab (the user, 2026-10-30:
 *  "the office and kitchen area seem to be double wall"). */
export interface Building {
  id: string;
  boundary: Point[];
  heightMm: number;
}

export function buildingsOf(structure: Pick<VenueStructure, "features">): Building[] {
  return structure.features
    .filter((f) => f.kind === "structure" && followsWalls(f) && f.heightMm > 0)
    .map((f) => ({ id: f.id, boundary: featureWorldOutline(f), heightMm: f.heightMm }))
    .filter((b) => b.boundary.length >= 3);
}

/** Probe points one wall-thickness off a wall (as a polyline), on either side, at a quarter, half
 *  and three quarters along — what decides which regions it borders. */
function wallProbes(poly: readonly Point[]): Point[] {
  if (poly.length < 2 || polylineLength(poly) < 1e-6) return [];
  const probes: Point[] = [];
  for (const t of BORDER_PROBES) {
    const { p, n } = alongPolyline(poly, t);
    probes.push({ x: p.x + n.x * WALL_THICK_MM, y: p.y + n.y * WALL_THICK_MM });
    probes.push({ x: p.x - n.x * WALL_THICK_MM, y: p.y - n.y * WALL_THICK_MM });
  }
  return probes;
}

/** The zones a wall (as a polyline) borders: those whose boundary holds one of its probes. */
export function borderingZones(poly: readonly Point[], zones: readonly ResolvedZone[]): ResolvedZone[] {
  const probes = wallProbes(poly);
  return zones.filter((z) => z.boundary.length >= 3 && probes.some((p) => pointInPolygon(p, z.boundary)));
}

/** The buildings a wall borders, by the same probes. */
export function borderingBuildings(poly: readonly Point[], buildings: readonly Building[]): Building[] {
  const probes = wallProbes(poly);
  return buildings.filter((b) => probes.some((p) => pointInPolygon(p, b.boundary)));
}

/** How high a wall stands: its own typed height first (Wall.heightMm — a half wall, a parapet, a
 *  fence on an edge; it wins over the room either way, and a wall lower than its zone's ceiling just
 *  stops under the roof), else derived: an `edge` kind is a kerb; a `wall` is as tall as the tallest
 *  ROOFED zone (ceilingHeightMm > 0) or BUILDING it borders, and a garden wall when it borders
 *  none — both faces open sky, or outside every zone. */
export function wallHeightMm(wall: Pick<Wall, "kind" | "heightMm">, poly: readonly Point[], zones: readonly ResolvedZone[], buildings: readonly Building[] = []): number {
  if (wall.heightMm !== undefined && wall.heightMm > 0) return wall.heightMm;
  if (wall.kind === "edge") return KERB_MM;
  let tallest = 0;
  for (const z of borderingZones(poly, zones)) tallest = Math.max(tallest, z.zone.ceilingHeightMm || 0);
  for (const b of borderingBuildings(poly, buildings)) tallest = Math.max(tallest, b.heightMm);
  return tallest > 0 ? tallest : GARDEN_WALL_MM;
}

/** An `edge` with a typed height is a fence or a low garden wall this thick (spec 2026-11-07 §2:
 *  half a wall — a kerb's 100 reads as a curb, not a fence). */
export const FENCE_THICK_MM = WALL_THICK_MM / 2;

/** Whether a wall carries a typed height of its own (Wall.heightMm). */
const fenceHeight = (wall: Pick<Wall, "heightMm">): boolean => wall.heightMm !== undefined && wall.heightMm > 0;

/** Which side of a wall, at `p`, is INSIDE: +1 for the `n` side, −1 for the other. The side whose
 *  probe (one wall-thickness off the wall) lands in a roofed zone or a building wins; failing that,
 *  in any zone; a tie (both roofed, neither in a zone) is +n. The same probe rule as `borderingZones`. */
export function inwardSide(p: Point, n: Point, zones: readonly ResolvedZone[], buildings: readonly Building[] = []): 1 | -1 {
  const score = (sign: number): number => {
    const q = { x: p.x + sign * n.x * WALL_THICK_MM, y: p.y + sign * n.y * WALL_THICK_MM };
    let best = 0;
    for (const z of zones) {
      if (z.boundary.length < 3 || !pointInPolygon(q, z.boundary)) continue;
      best = Math.max(best, (z.zone.ceilingHeightMm || 0) > 0 ? 2 : 1);
    }
    for (const b of buildings) if (pointInPolygon(q, b.boundary)) best = Math.max(best, 2);
    return best;
  };
  return score(1) >= score(-1) ? 1 : -1;
}

/** An opening in a wall, measured along the wall from node a (the convention `distanceMm` keeps). */
export interface WallOpening {
  id: string;
  startMm: number;
  endMm: number;
  /** A WINDOW's glass (StructureEntrance.kind): the wall stays under the sill and over the head,
   *  and a pane of glass stands between them. Absent = a door, open from the floor to DOOR_HEIGHT_MM. */
  glass?: { sillMm: number; headMm: number };
}

/** The boxes one STRAIGHT stretch of wall becomes once its openings are cut: the solid stretches
 *  between them (the jambs, full height) and, over each opening, a lintel from DOOR_HEIGHT_MM to
 *  the top — none when the wall is no taller than the door (a kerb with a gap is just a gap). A
 *  window keeps the wall under its sill too (a solid, part of the wall), its lintel starts at its
 *  head, and a GLASS_MM pane fills the glass between. Openings are in mm along a→b; anything
 *  outside the stretch is clipped off, so a door on a bowed wall can be handed to each of its
 *  chords in turn. Every box is centred on the wall's line, `thickMm` thick, turned to the
 *  stretch's heading. */
export function doorPieces(
  a: Point,
  b: Point,
  heightMm: number,
  thickMm: number,
  openings: readonly WallOpening[],
): { solids: Part[]; lintels: { id: string; part: Part }[]; panes: { id: string; part: Part }[] } {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const solids: Part[] = [];
  const lintels: { id: string; part: Part }[] = [];
  const panes: { id: string; part: Part }[] = [];
  if (len < 1 || heightMm <= 0) return { solids, lintels, panes };
  const rot = headingDeg(a, b);
  const box = (s: number, e: number, z: number, h: number): Extract<Part, { shape: "box" }> => {
    const m = (s + e) / 2 / len;
    return { shape: "box", w: e - s, d: thickMm, h, at: vec3(a.x + (b.x - a.x) * m, a.y + (b.y - a.y) * m, z), rotDeg: rot };
  };
  const cut = openings
    .map((o) => ({ id: o.id, glass: o.glass, s: Math.max(0, Math.min(len, o.startMm)), e: Math.max(0, Math.min(len, o.endMm)) }))
    .filter((o) => o.e - o.s >= 1)
    .sort((p, q) => p.s - q.s);
  let cursor = 0;
  for (const o of cut) {
    if (o.s - cursor >= 1) solids.push(box(cursor, o.s, 0, heightMm));
    const s = Math.max(cursor, o.s);
    if (o.e - s >= 1) {
      const sill = o.glass ? Math.max(0, Math.min(o.glass.sillMm, heightMm)) : 0;
      const head = o.glass ? Math.max(sill, Math.min(o.glass.headMm, heightMm)) : DOOR_HEIGHT_MM;
      if (sill >= 1) solids.push(box(s, o.e, 0, sill));
      if (heightMm > head) lintels.push({ id: o.id, part: box(s, o.e, head, heightMm - head) });
      if (o.glass && head - sill >= 1) panes.push({ id: o.id, part: { ...box(s, o.e, sill, head - sill), d: GLASS_MM } });
    }
    cursor = Math.max(cursor, o.e);
  }
  if (len - cursor >= 1) solids.push(box(cursor, len, 0, heightMm));
  return { solids, lintels, panes };
}

/** The entrances on a wall as openings along its CHORD from node a (`doorOffsets` reads the corner
 *  each is measured from); a window carries its glass, read against the wall's height. */
function wallOpenings(entrances: readonly StructureEntrance[], chordMm: number, wallHeightMm: number): WallOpening[] {
  return entrances.map((e) => {
    const o = doorOffsets(e, chordMm);
    const centre = e.measureFrom === "b" ? chordMm - o.toCentreMm : o.toCentreMm;
    return { id: e.id, startMm: centre - e.widthMm / 2, endMm: centre + e.widthMm / 2, ...(isWindow(e) ? { glass: windowHeights(e, wallHeightMm) } : {}) };
  });
}

/** A window's frame on a `wall` kind wall: a trim on each jamb from the sill to the head, and a
 *  rail along the sill and along the head — FRAME_TRIM_MM wide, FRAME_PROUD_MM proud of both faces,
 *  as a door's trims are. The glass itself is a pane cut with the wall (doorPieces). */
function windowBodies(e: StructureEntrance, o: WallOpening, poly: readonly Point[], along: number, out: SceneCollector): void {
  if (!o.glass) return;
  const s = Math.max(0, Math.min(along, o.startMm));
  const t = Math.max(0, Math.min(along, o.endMm));
  const width = t - s;
  const { sillMm, headMm } = o.glass;
  const h = headMm - sillMm;
  if (width < MIN_LEAF_MM || h < MIN_LEAF_MM) return;
  const tag = { type: "window" as const, id: e.id };
  const heading = (u: Point) => headingDeg({ x: 0, y: 0 }, u);
  const jambA = alongPolyline(poly, s / along);
  const jambB = alongPolyline(poly, t / along);
  const mid = alongPolyline(poly, (s + t) / 2 / along);
  const depth = WALL_THICK_MM + 2 * FRAME_PROUD_MM;
  const trim = (j: ReturnType<typeof alongPolyline>): Part => ({ shape: "box", w: FRAME_TRIM_MM, d: depth, h, at: vec3(j.p.x, j.p.y, sillMm), rotDeg: heading(j.u) });
  const rail = (z: number): Part => ({ shape: "box", w: width, d: depth, h: FRAME_TRIM_MM, at: vec3(mid.p.x, mid.p.y, z), rotDeg: heading(mid.u) });
  out.body(`window-frame:${e.id}`, tag, FRAME_MATERIAL, [trim(jambA), trim(jambB), rail(sillMm), rail(Math.max(sillMm, headMm - FRAME_TRIM_MM))], [here()]);
}

/** A door's frame and its leaf (two for a double door), on a `wall` kind wall `wallH` high. The
 *  frame is a trim on each jamb, FRAME_PROUD_MM proud of both faces. The leaf is hinged at a jamb,
 *  DOOR_LEAF_MM thick, the opening wide (half each for a pair), the door's height (the wall's when
 *  it is lower — a gate in a garden wall), and stands OPEN at 90°: perpendicular to the wall, from
 *  the wall's face on the swing side out into the room, its thickness just inside the opening so it
 *  clears the jamb. The swing side is the inward one (`inwardSide` at the door) when `swingInward`,
 *  the other otherwise. `o` is in mm along the wall's POLYLINE (`along` long), like a lintel's. */
function doorBodies(e: StructureEntrance, o: WallOpening, poly: readonly Point[], along: number, wallH: number, zones: readonly ResolvedZone[], out: SceneCollector, buildings: readonly Building[] = []): void {
  const s = Math.max(0, Math.min(along, o.startMm));
  const t = Math.max(0, Math.min(along, o.endMm));
  const width = t - s;
  const h = Math.min(DOOR_HEIGHT_MM, wallH);
  if (width < MIN_LEAF_MM || h < MIN_LEAF_MM) return;
  const tag = { type: "door" as const, id: e.id };
  const jambA = alongPolyline(poly, s / along);
  const jambB = alongPolyline(poly, t / along);
  const heading = (u: Point) => headingDeg({ x: 0, y: 0 }, u);

  const trim = (j: ReturnType<typeof alongPolyline>): Part => ({ shape: "box", w: FRAME_TRIM_MM, d: WALL_THICK_MM + 2 * FRAME_PROUD_MM, h, at: vec3(j.p.x, j.p.y, 0), rotDeg: heading(j.u) });
  out.body(`door-frame:${e.id}`, tag, FRAME_MATERIAL, [trim(jambA), trim(jambB)], [here()]);

  const mid = alongPolyline(poly, (s + t) / 2 / along);
  const side = inwardSide(mid.p, mid.n, zones, buildings) * (e.swingInward ? 1 : -1);
  const leafW = e.doubleDoor ? width / 2 : width;
  // `into` is which way along the wall the opening lies from this jamb (+u from the start jamb).
  const leaf = (j: ReturnType<typeof alongPolyline>, into: 1 | -1): Part => {
    const hinge = {
      x: j.p.x + side * j.n.x * (WALL_THICK_MM / 2) + into * j.u.x * (DOOR_LEAF_MM / 2),
      y: j.p.y + side * j.n.y * (WALL_THICK_MM / 2) + into * j.u.y * (DOOR_LEAF_MM / 2),
    };
    const at = vec3(hinge.x + side * j.n.x * (leafW / 2), hinge.y + side * j.n.y * (leafW / 2), 0);
    return { shape: "box", w: leafW, d: DOOR_LEAF_MM, h, at, rotDeg: heading(j.u) + 90 };
  };
  const leaves = e.doubleDoor ? [leaf(jambA, 1), leaf(jambB, -1)] : [leaf(jambA, 1)];
  out.body(`door-leaf:${e.id}`, tag, LEAF_MATERIAL, leaves, [here()]);
}

/** One wall's boxes: its stretches (and its doors' lintels) along the polyline, openings cut by
 *  distance along it — a door on a bowed wall sits where its chord distance falls along the bow,
 *  scaled by the bow's extra length, which is as exact as a door hung on a chord can be. Then each
 *  door's frame and leaves (a kerb with a gap is just a gap: no leaf on an `edge`). */
function wallBodies(structure: VenueStructure, wall: Wall, entrances: readonly StructureEntrance[], zones: readonly ResolvedZone[], out: SceneCollector, buildings: readonly Building[] = []): void {
  const pts = wallPoints(structure, wall);
  if (!pts) return;
  const poly = wallPolyline(pts.a, pts.b, wall.curve);
  const chord = Math.hypot(pts.b.x - pts.a.x, pts.b.y - pts.a.y);
  const along = polylineLength(poly);
  if (chord < 1 || along < 1) return;
  const h = wallHeightMm(wall, poly, zones, buildings);
  // An edge given a height of its own is a FENCE — a thin wall, in the wall's tone — not a kerb
  // stretched tall (spec 2026-11-07 §2); left untyped it is the kerb it always was.
  const fence = wall.kind === "edge" && fenceHeight(wall);
  const thick = fence ? FENCE_THICK_MM : wall.kind === "edge" ? KERB_THICK_MM : WALL_THICK_MM;
  const openings = wallOpenings(entrances, chord, h).map((o) => ({ ...o, startMm: (o.startMm * along) / chord, endMm: (o.endMm * along) / chord }));
  const windows = new Set(entrances.filter(isWindow).map((e) => e.id));
  const solids: Part[] = [];
  const lintels = new Map<string, Part[]>();
  const panes = new Map<string, Part[]>();
  const collect = (into: Map<string, Part[]>, id: string, part: Part) => {
    const have = into.get(id);
    if (have) have.push(part);
    else into.set(id, [part]);
  };
  let from = 0;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1];
    const b = poly[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const local = openings.map((o) => ({ ...o, startMm: o.startMm - from, endMm: o.endMm - from }));
    const pieces = doorPieces(a, b, h, thick, local);
    solids.push(...pieces.solids);
    for (const l of pieces.lintels) collect(lintels, l.id, l.part);
    for (const g of pieces.panes) collect(panes, g.id, g.part);
    from += len;
  }
  out.body(`wall:${wall.id}`, { type: "wall", id: wall.id }, wall.kind === "edge" && !fence ? KERB_MATERIAL : WALL_MATERIAL, solids, [here()]);
  for (const [id, parts] of lintels) out.body(`door:${id}`, { type: windows.has(id) ? "window" : "door", id }, WALL_MATERIAL, parts, [here()]);
  // The glass: a pane per chord, casting no shadow — a glazed front lights the hall behind it.
  for (const [id, parts] of panes) out.body(`window:${id}`, { type: "window", id }, GLASS_MATERIAL, parts, [here()], { castShadow: false });
  if (wall.kind !== "wall") return;
  for (const e of entrances) {
    const o = openings.find((x) => x.id === e.id);
    if (!o) continue;
    if (isDoor(e)) doorBodies(e, o, poly, along, h, zones, out, buildings);
    else windowBodies(e, o, poly, along, out);
  }
}

// --- wells ----------------------------------------------------------------------------------------

/** An outline as one closed polyline (its curves cut into chords), for a ribbon round it or a
 *  point-in-polygon test against it. */
export function closedPolyline(o: BuiltOutline): Point[] {
  const path: Point[] = [];
  const n = o.outline.length;
  for (let i = 0; i < n; i++) {
    const seg = flattenEdge(o.outline[i], o.outline[(i + 1) % n], o.edgeCurves?.[i]);
    path.push(...seg.slice(0, -1));
  }
  if (path.length) path.push(path[0]);
  return path;
}

/** A pool or a water surface: what gets cut out of the floors it lies in. `room` is its footprint
 *  carried into room mm (curves kept), `centre` what decides which floors. */
interface Well {
  id: string;
  centre: Point;
  room: BuiltOutline[];
}

const isWell = (f: StructureFeature): boolean => f.kind === "pool" || (f.kind === "surface" && featureSurface(f) === "water");

function waterWells(structure: VenueStructure, floorOf: FloorOf): Well[] {
  const wells: Well[] = [];
  for (const f of structure.features) {
    // A basin raised on a platform cuts nothing: the floor under the platform is out of sight. Nor
    // does a pool whose wall stands over the floor (its height, 2026-11-20): its water is above it.
    if (!isWell(f) || floorOfFeature(f, floorOf) > 0 || poolWallMm(f, 0) > 0) continue;
    const frame = featureFrame(f);
    // The WATER's edge (lib/venues/rim.ts insideOutlines): a pool's rim is floor, so the floor is cut
    // only where the water is — its whole footprint when it has no rim, nothing when it is all rim.
    const water = insideOutlines(f);
    if (!water.length) continue;
    wells.push({ id: f.id, centre: { x: f.x, y: f.y }, room: water.map((o) => carryOutline(o, frame)) });
  }
  return wells;
}

/** The holes a floor polygon (room mm) takes: every well whose centre it holds, as outlines in the
 *  frame `into` — the room's for a zone floor, a surface feature's own for its plane. */
function holesIn(polygon: readonly Point[], wells: readonly Well[], into: Transform, except?: string): BuiltOutline[] | undefined {
  const back = inverted(into);
  const holes: BuiltOutline[] = [];
  for (const w of wells) {
    if (w.id === except || polygon.length < 3 || !pointInPolygon(w.centre, polygon as Point[])) continue;
    for (const o of w.room) holes.push(carryOutline(o, back));
  }
  return holes.length ? holes : undefined;
}

/** A water surface recessed WATER_DEPTH_MM inside a well: dark matte walls (a ribbon round the
 *  outline) and floor, the water plane at the top of the recess, and a coping kerb — COPING_MM
 *  wide, COPING_HIGH_MM high — standing on the floor round the rim (the rim itself is its hole, so
 *  it covers the seam between the floor's cut edge and the well's wall). */
function waterWell(f: StructureFeature, outlines: readonly BuiltOutline[], out: SceneCollector, floorZ = 0, coping = true, wallMm = 0): void {
  if (!outlines.length) return; // all rim, no water (lib/venues/rim.ts)
  const bottom = -(WATER_DEPTH_MM + WELL_BELOW_MM);
  const tint = hexOf(f.style?.fill);
  const water: MaterialRef = tint ? { ...surfaceMaterial("water", tint), opacity: 0.8 } : waterMaterial();
  const parts: Part[] = [];
  if (wallMm > 0) {
    // A RAISED basin — on a platform, or a pool given a height of its own: a dark floor a hair over
    // what it stands on, the water a little under the top of its wall, and the wall round the water
    // BASIN_WALL_MM thick and `wallMm` high in stone — unless the pool has a rim, which IS its wall
    // (rimBody raises the band to the same height).
    for (const o of outlines) {
      parts.push({ shape: "plane", outline: o, at: vec3(0, 0, 2) });
      parts.push({ shape: "plane", outline: o, at: vec3(0, 0, basinWaterZ(wallMm)), material: water });
      if (coping) parts.push({ shape: "extrude", outline: { outline: offsetOutline(o, BASIN_WALL_MM) }, holes: [o], h: wallMm, at: vec3(0, 0, 0), material: BASIN_MATERIAL });
    }
    out.body(`feature:${f.id}`, { type: "feature", id: f.id, label: f.label }, WELL_MATERIAL, parts, [{ ...featureFrame(f), at: vec3(f.x, f.y, floorZ) }], { castShadow: false });
    return;
  }
  for (const o of outlines) {
    parts.push({ shape: "ribbon", path: closedPolyline(o), h: WATER_DEPTH_MM + WELL_BELOW_MM, at: vec3(0, 0, bottom) });
    parts.push({ shape: "plane", outline: o, at: vec3(0, 0, bottom) });
    parts.push({ shape: "plane", outline: o, at: vec3(0, 0, -WATER_DEPTH_MM), material: water });
    // A pool with a rim of its own is edged by it (rimBody): no second kerb outside the band.
    if (coping) parts.push({ shape: "extrude", outline: { outline: offsetOutline(o, COPING_MM) }, holes: [o], h: COPING_HIGH_MM, at: vec3(0, 0, 0), material: COPING_MATERIAL });
  }
  out.body(`feature:${f.id}`, { type: "feature", id: f.id, label: f.label }, WELL_MATERIAL, parts, [featureFrame(f)], { castShadow: false });
}

/** The band round a pool's water or round a surface (StructureFeature.rim, lib/venues/rim.ts): a
 *  slab in its own material between the feature's outline and what lies inside it — `raisedMm` high
 *  off the floor it stands on (a lawn's kerb at 100), or FLUSH: a plane at `flushZ`, over whatever
 *  ground lies under it. The water's well is cut to the inside (waterWells), so the band is floor. */
function rimBody(f: StructureFeature, out: SceneCollector, floorZ: number, flushZ: number, wallMm = 0): void {
  const r = rimOf(f);
  if (!r) return;
  const material = surfaceMaterial(r.rim.material, hexOf(r.rim.style?.fill));
  // A raised pool's rim is its wall: the band stands as high as the wall.
  const raised = Math.max(0, r.rim.raisedMm ?? 0, wallMm);
  const parts: Part[] = r.outer.map((outline) => {
    const poly = closedPolyline(outline);
    const holes = r.inner.filter((o) => o.outline.length > 0 && pointInPolygon(o.outline[0], poly));
    const cut = holes.length ? { holes } : {};
    return raised > 0 ? { shape: "extrude", outline, ...cut, h: raised, at: vec3(0, 0, 0) } : { shape: "plane", outline, ...cut, at: vec3(0, 0, flushZ) };
  });
  out.body(`rim:${f.id}`, { type: "feature", id: f.id, label: f.label }, material, parts, [{ ...featureFrame(f), at: vec3(f.x, f.y, floorZ) }], { castShadow: raised > 0 });
}

// --- features -------------------------------------------------------------------------------------

/** A ground material laid over the feature's footprint, a hair above the zone floor; the k-th
 *  surface a millimetre above the one before, so what the plan paints later lies on top. A well
 *  whose centre lies on this surface is cut out of it (in the surface's own frame). */
function surfacePlane(f: StructureFeature, outlines: readonly BuiltOutline[], ordinal: number, wells: readonly Well[], out: SceneCollector): void {
  const material = surfaceMaterial(featureSurface(f), hexOf(f.style?.fill));
  const frame = featureFrame(f);
  const back = inverted(frame);
  const parts: Part[] = outlines.map((outline) => {
    const poly = closedPolyline(outline);
    const local = wells.map((w) => ({ ...w, centre: localPoint(back, w.centre) }));
    const holes = holesIn(poly, local, frame, f.id);
    return { shape: "plane", outline, ...(holes ? { holes } : {}), at: vec3(0, 0, 1 + ordinal) };
  });
  out.body(`feature:${f.id}`, { type: "feature", id: f.id, label: f.label }, material, parts, [frame], { castShadow: false });
}

/** A building's ROOF: a face-filling structure is drawn as its roof slab alone (ROOF_SLAB_MM thick,
 *  its top ROOF_UNDER_MM under the tops of the walls round it) — its sides are the walls of the wall
 *  graph, which wallHeightMm has raised to its height. */
function roofBody(f: StructureFeature, outlines: readonly BuiltOutline[], out: SceneCollector): void {
  const material: MaterialRef = { colour: hexOf(f.style?.fill) ?? FEATURE_FILL, kind: "matte" };
  const top = f.heightMm - ROOF_UNDER_MM;
  const h = Math.min(ROOF_SLAB_MM, Math.max(10, top));
  const parts: Part[] = outlines.map((outline) => ({ shape: "extrude", outline, h, at: vec3(0, 0, top - h) }));
  out.body(`feature:${f.id}`, { type: "feature", id: f.id, label: f.label }, material, parts, [featureFrame(f)]);
}

/** A built thing (a wall, a kiosk, a permanent bar): its footprint extruded to its height — or,
 *  when it is part of a beam the venue's columns carry (./structures.ts), only the beam's band. */
function extrudedFeature(f: StructureFeature, outlines: readonly BuiltOutline[], out: SceneCollector, span?: { fromMm: number; toMm: number }, floorZ = 0): void {
  const material: MaterialRef = { colour: hexOf(f.style?.fill) ?? FEATURE_FILL, kind: "matte" };
  const from = span?.fromMm ?? 0;
  const h = Math.max(10, (span?.toMm ?? f.heightMm ?? 0) - from);
  const parts: Part[] = outlines.map((outline) => ({ shape: "extrude", outline, h, at: vec3(0, 0, from) }));
  out.body(`feature:${f.id}`, { type: "feature", id: f.id, label: f.label }, material, parts, [{ ...featureFrame(f), at: vec3(f.x, f.y, floorZ) }]);
}

/** The venue's own fountain (FeatureKind "fountain"): the catalog's fountain body (./floor-kinds.ts
 *  — the basin in the pool's water, the bowl on its stem, the jet) from the feature's size, height
 *  and tint. Set in a POOL, it stands on the water — its basin rising out of it — rather than on
 *  the floor the pool is cut from, which would hang it WATER_DEPTH_MM in the air over the well. */
function fountainBody(f: StructureFeature, wells: readonly Well[], out: SceneCollector, floorZ: number, raisedWater: number | null = null): void {
  const ctx: ItemContext = {
    product: undefined,
    resolved: undefined,
    footprint: featureFootprint(f),
    widthMm: f.widthMm,
    depthMm: f.depthMm,
    heightMm: Math.max(f.heightMm, 600),
    tone: hexOf(f.style?.fill) ?? DEFAULT_TONE.fountain.toLowerCase(),
    count: 1,
    author: false,
  };
  const inPool = floorZ === 0 && wells.some((w) => w.id !== f.id && w.room.some((o) => pointInPolygon({ x: f.x, y: f.y }, closedPolyline(o))));
  const z = raisedWater ?? (inPool ? -WATER_DEPTH_MM : floorZ);
  out.item(`feature:${f.id}`, { type: "feature", id: f.id, label: f.label }, floorKindBody("fountain", ctx), roomTransform({ position: { x: f.x, y: f.y }, rotation: f.rotationDeg ?? 0 }, z));
}

/** The water a fountain stands in when it is set in a RAISED pool (poolWallMm): that pool's water
 *  level over the room's floor, else null. */
function raisedWaterAt(structure: VenueStructure, f: StructureFeature, floorOf: FloorOf): number | null {
  for (const pool of structure.features) {
    if (pool.id === f.id || pool.kind !== "pool") continue;
    const floor = floorOfFeature(pool, floorOf);
    const wall = poolWallMm(pool, floor);
    if (wall <= 0) continue;
    const frame = featureFrame(pool);
    if (insideOutlines(pool).some((o) => pointInPolygon({ x: f.x, y: f.y }, closedPolyline(carryOutline(o, frame))))) return floor + basinWaterZ(wall);
  }
  return null;
}

/** The venue's own pergola (FeatureKind "pergola", lib/venues/pergola.ts): the catalog's pergola
 *  body (./floor-kinds.ts pergolaBody — one function for both) from the feature's footprint as drawn,
 *  its height, its spec and its tint, standing on the floor under it (a pergola built on a terrace
 *  stands on the terrace). */
function pergolaFeatureBody(f: StructureFeature, out: SceneCollector, floorZ: number): void {
  const ctx: ItemContext = {
    product: undefined,
    resolved: undefined,
    footprint: featureFootprint(f),
    widthMm: f.widthMm,
    depthMm: f.depthMm,
    heightMm: f.heightMm > 0 ? f.heightMm : 2600,
    tone: hexOf(f.style?.fill) ?? DEFAULT_TONE.pergola.toLowerCase(),
    count: 1,
    author: false,
    pergola: pergolaOf(f),
  };
  out.item(`feature:${f.id}`, { type: "feature", id: f.id, label: f.label }, floorKindBody("pergola", ctx), roomTransform({ position: { x: f.x, y: f.y }, rotation: f.rotationDeg ?? 0 }, floorZ));
}

/** A column (./structures.ts — the venue's own, or read off nested footprints): the PLINTH (its
 *  biggest footprint) a short block, the BASE mouldings (those between) a drum with a roll round
 *  its foot, the SHAFT (the smallest) rising with a slight entasis to the beam it carries or its
 *  own top, and the capital mirroring the base under an abacus of the plinth's shape. A lone column
 *  gets a base and a capital of its own, a fifth wider. One body, built at the column's centre on
 *  the floor it stands on (`floorZ`), `top` above that floor. */
function columnBody(column: ColumnReading, top: number, floorZ: number, out: SceneCollector): void {
  const members = column.members;
  if (!members.length) return;
  const H = column.heightMm;
  const c = column.centre;
  const tone = (f: StructureFeature) => ({ colour: hexOf(f.style?.fill) ?? FEATURE_FILL, kind: "matte" as const });
  const plinthH = Math.max(250, Math.min(600, 0.06 * H));
  const ringH = Math.max(120, Math.min(300, 0.03 * H));
  const shaft = members[members.length - 1];
  const plinth = members.length > 1 ? members[0] : null;
  const bases = members.slice(1, -1);
  const round = (f: StructureFeature) => featureFootprint(f).kind === "circle";
  const radius = (f: StructureFeature) => Math.min(f.widthMm, f.depthMm) / 2;
  const local = (f: StructureFeature) => vec3(f.x - c.x, f.y - c.y, 0);
  const parts: Part[] = [];
  /** A footprint as a slab from z, `h` high: a cylinder when round, else its outline. */
  const slab = (f: StructureFeature, z: number, h: number, material: MaterialRef, flare = 1): Part[] => {
    const at = local(f);
    if (round(f)) return [{ shape: "cylinder", rTop: radius(f) * flare, rBottom: radius(f) * (2 - flare), h, at: vec3(at.x, at.y, z), segments: 32, material }];
    return footprintOutlines(featureFootprint(f)).map((outline) => ({ shape: "extrude", outline, h, at: vec3(at.x, at.y, z), rotDeg: f.rotationDeg ?? 0, material }));
  };
  /** A base or capital ring: a drum tapering by `flare` with a roll round its wider end. */
  const ring = (f: StructureFeature, z: number, up: boolean, material: MaterialRef): Part[] => {
    const out = slab(f, z, ringH, material, up ? 0.92 : 1.08);
    if (round(f)) {
      const tube = ringH * 0.32;
      const at = local(f);
      out.push({ shape: "torus", r: radius(f) - tube, tube, at: vec3(at.x, at.y, up ? z : z + ringH - 2 * tube), segments: 40, material });
    }
    return out;
  };
  let z = 0;
  if (plinth) {
    parts.push(...slab(plinth, 0, plinthH, tone(plinth)));
    z = plinthH;
  }
  const lone = !plinth;
  const ringsOf: StructureFeature[] = lone ? [{ ...shaft, widthMm: shaft.widthMm * 1.22, depthMm: shaft.depthMm * 1.22 }] : bases;
  for (const b of ringsOf) {
    parts.push(...ring(b, z, true, tone(b)));
    z += ringH;
  }
  const abacusH = plinth ? 0.5 * plinthH : 0;
  const capitalFrom = top - abacusH - ringsOf.length * ringH;
  const shaftH = Math.max(100, capitalFrom - z);
  if (round(shaft)) {
    const r = radius(shaft);
    parts.push({ shape: "lathe", profile: [{ r: 0, z: 0 }, { r, z: 0 }, { r: 0.995 * r, z: 0.33 * shaftH }, { r: 0.95 * r, z: 0.7 * shaftH }, { r: 0.88 * r, z: shaftH }, { r: 0, z: shaftH }], at: vec3(local(shaft).x, local(shaft).y, z), segments: 32, material: tone(shaft) });
  } else {
    parts.push(...slab(shaft, z, shaftH, tone(shaft)));
  }
  z += shaftH;
  for (const b of [...ringsOf].reverse()) {
    parts.push(...ring(b, z, false, tone(b)));
    z += ringH;
  }
  if (plinth) parts.push(...slab(plinth, z, top - z, tone(plinth)));
  out.body(`feature:${column.ids[0]}`, { type: "feature", id: column.ids[0], label: shaft.label }, tone(shaft), parts, [transform(vec3(c.x, c.y, floorZ), 0)]);
}

// --- plants ---------------------------------------------------------------------------------------

/** A paler tint of a hex colour (`t` of the way to white); any other colour comes back as it is. */
export function tinted(colour: string, t: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(colour.trim());
  if (!m) return colour;
  const c = parseInt(m[1], 16);
  const ch = (shift: number) => Math.round(((c >> shift) & 255) + (255 - ((c >> shift) & 255)) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

/** A stable 0..1 off three integers — the bed's own scatter, the same on every build. */
const scatter = (i: number, j: number, k: number): number => (((i * 1103515245 + j * 12345 + k * 97 + 7) >>> 0) % 1000) / 1000;

/** A planted bed (the user, 2026-10-30: the bed "looks very poor in 3D" — it was a soil slab with
 *  one size of pink sphere on an exact grid): a soil slab BED_SOIL_MM high over its footprint;
 *  over it the FOLIAGE — leafy blobs run along the bed's length, the bed's depth across, rising to
 *  BED_LEAF_SHARE of its height in a bed green, only where the outline holds them; and the heads
 *  scattered over the foliage: spheres of a few sizes about HEAD_R_MM, in the bed's colour and a
 *  paler tint of it, each jittered off a HEAD_STEP_MM grid by a stable hash and kept INSIDE the
 *  outline (a round bed has none in its corners), standing a little into the foliage. At most
 *  MAX_HEADS a bed: a long bed widens its grid rather than running out of heads halfway. */
function bedParts(outlines: readonly BuiltOutline[], w: number, d: number, h: number, colour: string): Part[] {
  const parts: Part[] = outlines.map((outline) => ({ shape: "extrude", outline, h: BED_SOIL_MM, at: vec3(0, 0, 0), material: SOIL_MATERIAL }));
  const polys = outlines.map(closedPolyline);
  const inside = (x: number, y: number) => polys.some((poly) => pointInPolygon({ x, y }, poly));
  // The foliage: blobs along the long axis as a hedge's, lower and leafier.
  const leafTop = BED_SOIL_MM + Math.max(60, (h - BED_SOIL_MM) * BED_LEAF_SHARE);
  const alongX = w >= d;
  const L = Math.max(w, d);
  const D = Math.min(w, d);
  const r = (D / 2) * 0.95;
  const leafH = leafTop - BED_SOIL_MM;
  const squash = Math.max(0.2, Math.min(1.2, leafH / (2 * r)));
  const n = Math.max(1, Math.min(MAX_BED_BLOBS, Math.ceil((L - D) / (0.6 * D)) + 1));
  const foliage = foliageMaterial(BED_LEAF);
  for (let i = 0; i < n; i++) {
    const s = n === 1 ? 0 : -(L - D) / 2 + ((L - D) * i) / (n - 1);
    const x = alongX ? s : 0;
    const y = alongX ? 0 : s;
    if (!inside(x, y)) continue;
    parts.push({ shape: "blob", r, at: vec3(x, y, BED_SOIL_MM + leafH / 2), seed: 70 + i, squash, lumps: 4, rough: 0.22, detail: 2, material: foliage });
  }
  // The heads: a jittered grid, two tones, three sizes.
  const tones: MaterialRef[] = [{ colour, kind: "matte" }, { colour: tinted(colour, 0.38), kind: "matte" }, { colour, kind: "matte" }];
  const step = Math.max(HEAD_STEP_MM, Math.sqrt((w * d) / (MAX_HEADS * 0.95)));
  const cols = Math.max(1, Math.floor(w / step));
  const rows = Math.max(1, Math.floor(d / step));
  let heads = 0;
  for (let j = 0; j < rows && heads < MAX_HEADS; j++) {
    for (let i = 0; i < cols && heads < MAX_HEADS; i++) {
      const x = -w / 2 + (w - (cols - 1) * step) / 2 + i * step + (scatter(i, j, 1) - 0.5) * 0.7 * step;
      const y = -d / 2 + (d - (rows - 1) * step) / 2 + j * step + (scatter(i, j, 2) - 0.5) * 0.7 * step;
      const rh = HEAD_R_MM * (0.6 + 0.6 * scatter(i, j, 3));
      if (!inside(x, y)) continue;
      parts.push({ shape: "sphere", r: rh, at: vec3(x, y, leafTop + rh * (0.1 + 0.6 * scatter(i, j, 4))), segments: 6, material: tones[Math.floor(scatter(i, j, 5) * tones.length) % tones.length] });
      heads++;
    }
  }
  return parts;
}

/** A plant's parts by its species (./plants.ts; a bed is laid here). `colour` is its foliage's. */
function plantParts(species: PlantSpecies, f: StructureFeature, w: number, d: number, h: number, colour: string): Part[] {
  const rx = w / 2;
  const ry = d / 2;
  switch (species) {
    case "tree":
      return treeParts(rx, ry, h, colour);
    case "palm":
      return palmParts(rx, ry, h, colour);
    case "pot":
      return potParts(rx, ry, h, colour);
    case "hedge":
      return hedgeParts(w, d, h);
    case "flowers":
      return bedParts(footprintOutlines(featureFootprint(f)), w, d, h, colour);
    default:
      return shrubParts(rx, ry, 0, h, colour);
  }
}

/** A plant by its species, shared by every plant of the same species, size and colour (a shared
 *  body has one material, so the key carries the colour). A bed's heads follow its outline, so its
 *  key carries the shape too — and a hand-drawn bed is its own. A plant with no height stands at
 *  its species' default. */
/** What a venue feature stands on (./elevation.ts floorUnder: a stage over a planter carries it),
 *  0 when the envelope is built on its own. */
export type FloorOf = (outlines: readonly Point[][], selfId?: string) => number;
const ON_FLOOR: FloorOf = () => 0;
const floorOfFeature = (f: StructureFeature, floorOf: FloorOf): number =>
  floorOf(footprintPolygons(featureFootprint(f), { x: f.x, y: f.y }, f.rotationDeg ?? 0), `feature:${f.id}`);

/** What a plant stands on: a tree or a palm where its trunk is (a small square round its middle —
 *  its footprint is its CROWN, which may reach over a stage it does not stand on); anything else on
 *  its footprint, which is where it meets the ground. */
function plantFloor(f: StructureFeature, species: PlantSpecies, floorOf: FloorOf): number {
  if (species !== "tree" && species !== "palm") return floorOfFeature(f, floorOf);
  const r = Math.min(TRUNK_PROBE_MM, f.widthMm, f.depthMm) / 2;
  return floorOf([[{ x: f.x - r, y: f.y - r }, { x: f.x + r, y: f.y - r }, { x: f.x + r, y: f.y + r }, { x: f.x - r, y: f.y + r }]], `feature:${f.id}`);
}

export function plantInstance(f: StructureFeature, out: SceneCollector, floorOf: FloorOf = ON_FLOOR): void {
  const species = plantSpecies(f);
  const w = Math.max(1, Math.round(f.widthMm));
  const d = Math.max(1, Math.round(f.depthMm));
  const h = Math.max(1, Math.round(f.heightMm > 0 ? f.heightMm : PLANT_DEFAULTS[species].heightMm));
  const colour = hexOf(f.style?.fill) ?? PLANT_FILL[species];
  const shape = species === "flowers" ? `:${f.shape === "custom" ? `custom-${f.id}` : f.shape}` : "";
  out.instance({
    key: `plant:${species}:${w}x${d}x${h}${shape}:${colour}`,
    parts: plantParts(species, f, w, d, h, colour),
    material: foliageMaterial(colour),
    tag: { type: "feature", id: f.id, label: f.label },
    // A round crown turns by its id (./plants.ts plantTurn), so a row of trees is not of clones.
    at: roomTransform({ position: { x: f.x, y: f.y }, rotation: species === "flowers" ? (f.rotationDeg ?? 0) : plantTurn(f.id, w, d, f.rotationDeg ?? 0) }, plantFloor(f, species, floorOf)),
  });
}

/** The venue's own chairs in rows (spec §3.4): one chair of the block's style and size at every
 *  place `chairRowsLayout` gives, facing the block's +y (row 1 is the front), instanced with every
 *  other chair of that style, size and colour in the room. */
function seatingBodies(f: StructureFeature, out: SceneCollector, floorOf: FloorOf = ON_FLOOR): void {
  const spec = seatingOf(f);
  const chair = seatingChair(spec);
  const layout = seatingLayout(f);
  const style = spec.chairStyle ?? "dining";
  const tone = hexOf(f.style?.fill) ?? VENUE_CHAIR_TONE;
  const h = f.heightMm > 0 ? f.heightMm : 900;
  const frame = { ...featureFrame(f), at: vec3(f.x, f.y, floorOfFeature(f, floorOf)) };
  const tag = { type: "chair" as const, id: f.id };
  for (const c of layout.chairs) out.instance(chairRequest(style, chair.widthMm, chair.depthMm, h, tone, transform(vec3(c.x, c.y, 0), 0), tag), frame);
}

/** The venue's own fixed things, as this event has them (moved and removed applied upstream). */
function featureBodies(structure: VenueStructure, wells: readonly Well[], out: SceneCollector, floorOf: FloorOf): void {
  let surfaces = 0;
  // Columns and what they carry, read off the drawing once (./structures.ts).
  const reading = readStructures(structure.features);
  // The floor each column stands on (its plinth's footprint), and a beam on its columns' highest.
  const columnFloor = new Map<ColumnReading, number>();
  const floorOfColumn = (c: ColumnReading): number => {
    let z = columnFloor.get(c);
    if (z === undefined) columnFloor.set(c, (z = floorOfFeature(c.members[0], floorOf)));
    return z;
  };
  const beamFloor = (b: BeamReading): number => Math.max(0, ...b.columns.map(floorOfColumn));
  // A pool's flush rim lies over every ground plane (the k-th surface at 1 + k): one above the lot.
  const overGround = 2 + structure.features.filter((f) => f.kind === "surface").length;
  for (const f of structure.features) {
    switch (f.kind) {
      case "surface": {
        // Inside its rim, if it has one (lib/venues/rim.ts) — else its whole footprint, as before.
        const outlines = insideOutlines(f);
        const rimmed = !!rimOf(f);
        if (featureSurface(f) === "water") waterWell(f, outlines, out, 0, !rimmed);
        else if (outlines.length) surfacePlane(f, outlines, surfaces, wells, out);
        if (rimmed) rimBody(f, out, 0, 1 + surfaces);
        surfaces++;
        break;
      }
      case "pool": {
        const z = floorOfFeature(f, floorOf);
        const rimmed = !!rimOf(f);
        const wall = poolWallMm(f, z);
        waterWell(f, insideOutlines(f), out, z, !rimmed, wall);
        if (rimmed) rimBody(f, out, z, z > 0 ? 2 : overGround, wall);
        break;
      }
      case "column":
      case "structure":
      case "other": {
        if (followsWalls(f)) {
          roofBody(f, footprintOutlines(featureFootprint(f)), out);
          break;
        }
        const role = reading.role.get(f.id);
        if (role?.kind === "column") {
          // A column is one body, built where its first (biggest) footprint is met — up to the
          // beam it carries (on the floor that beam is on), else its own height above its floor.
          if (role.index === 0) {
            const c = role.column;
            const z = floorOfColumn(c);
            const top = c.beam ? beamFloor(c.beam) + shaftTopOf(c) - z : shaftTopOf(c);
            columnBody(c, top, z, out);
          }
        } else if (role?.kind === "beam") {
          const drop = role.beam.dropOf[f.id] ?? 0;
          extrudedFeature(f, footprintOutlines(featureFootprint(f)), out, { fromMm: role.beam.fromMm - drop, toMm: role.beam.toMm - drop }, beamFloor(role.beam));
        } else {
          extrudedFeature(f, footprintOutlines(featureFootprint(f)), out, undefined, floorOfFeature(f, floorOf));
        }
        break;
      }
      case "bar":
        extrudedFeature(f, footprintOutlines(featureFootprint(f)), out, undefined, floorOfFeature(f, floorOf));
        break;
      case "fountain":
        fountainBody(f, wells, out, floorOfFeature(f, floorOf), raisedWaterAt(structure, f, floorOf));
        break;
      case "pergola":
        pergolaFeatureBody(f, out, floorOfFeature(f, floorOf));
        break;
      case "plant":
        plantInstance(f, out, floorOf);
        break;
      case "seating":
        seatingBodies(f, out, floorOf);
        break;
      case "curtain": // built with the sketch's drapes (./build.ts venueCurtain)
      case "stage": // TODO(B1): featureStage → the stage builder (decks, flights, ramps, skirt)
      case "stairs": // TODO(B2): lib/venues/climb.ts flights as tread boxes
      case "ramp": // TODO(B2): a wedge over its run
        break;
    }
  }
}

// --- the envelope ---------------------------------------------------------------------------------

function grown(b: Bounds, byMm: number): BuiltOutline {
  const x0 = b.minX - byMm;
  const x1 = b.maxX + byMm;
  const y0 = b.minY - byMm;
  const y1 = b.maxY + byMm;
  return { outline: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] };
}

/** Floors, ground, walls with doors, ceilings and the fixed features — into `out`. Returns the
 *  tallest ceiling on the plan (what a chandelier's chain reaches for), or null under open sky. */
export function envelopeNodes(input: SceneInput, out: SceneCollector, floorOf: FloorOf = ON_FLOOR): { roofedMm: number | null } {
  const { plan, structure } = input;
  const zones = plan.all;
  const wells = waterWells(structure, floorOf);

  // Floors: every zone on the property, so the hall next door is still there through its door —
  // each with the wells that lie in it cut out.
  for (const rz of zones) {
    if (rz.boundary.length < 3) continue;
    const z = rz.zone;
    const material = surfaceMaterial(z.surface ?? "plain", hexOf(z.style?.fill));
    const holes = holesIn(rz.boundary, wells, here());
    out.body(`floor:${z.id}`, { type: "floor", id: z.id, label: z.name }, material, [{ shape: "plane", outline: { outline: rz.boundary }, ...(holes ? { holes } : {}), at: vec3(0, 0, 0) }], [here()], { castShadow: false });
  }

  // Ground: a neutral plane well past the plan, a hair under the floors — and under every well,
  // so it too is cut round each one.
  const ground = grown(plan.bounds, GROUND_MARGIN_MM);
  const groundHoles = holesIn(ground.outline, wells, here());
  out.body("ground", { type: "ground" }, surfaceMaterial("paving", ENVELOPE.ground), [{ shape: "plane", outline: ground, ...(groundHoles ? { holes: groundHoles } : {}), at: vec3(0, 0, -1) }], [here()], { castShadow: false });

  // The buildings on the plan: their walls are raised to their height, their roofs drawn below.
  const buildings = buildingsOf(structure);

  // Walls, each with the doors hung on it.
  const byWall = new Map<string, StructureEntrance[]>();
  for (const e of structure.entrances) {
    const have = byWall.get(e.wallId);
    if (have) have.push(e);
    else byWall.set(e.wallId, [e]);
  }
  const nodes = nodeMap(structure);
  for (const wall of structure.walls) {
    if (!nodes.has(wall.a) || !nodes.has(wall.b)) continue;
    wallBodies(structure, wall, byWall.get(wall.id) ?? [], zones, out, buildings);
  }

  // Ceilings over the roofed zones; the sky shows over the rest.
  let roofedMm: number | null = null;
  for (const rz of zones) {
    const h = rz.zone.ceilingHeightMm || 0;
    if (h <= 0 || rz.boundary.length < 3) continue;
    out.body(`ceiling:${rz.zone.id}`, { type: "ceiling", id: rz.zone.id, label: rz.zone.name }, CEILING_MATERIAL, [{ shape: "plane", outline: { outline: rz.boundary }, at: vec3(0, 0, h), side: "down" }], [here()]);
    roofedMm = roofedMm === null ? h : Math.max(roofedMm, h);
  }

  featureBodies(structure, wells, out, floorOf);
  return { roofedMm };
}
