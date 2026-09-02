// The venue's ONE structure: a single drawing of the whole property, shared by every zone on it.
//
// This is a wall *graph*, not a pile of closed shapes, and that is the whole point. A wall between
// אולם גדול and its חופה exists exactly once, owned by neither: drag its node and both sides
// reshape together. Modelling each zone as its own outline — the obvious first design — quietly
// duplicates every shared wall, so the two copies drift apart the first time one is edited and a
// gap opens between rooms that are physically joined.
//
// It also buys the thing that makes the zone tool work: because walls are connected, the enclosed
// regions they form can be *computed* (see ./faces.ts), so naming a hall is a click inside it
// rather than a re-trace of walls that are already on screen.
import type { EdgeCurve, Point } from "@/lib/studio/hall";
import type { ElementStyle } from "@/lib/element-style";
import type { MapShape, Product } from "@/lib/catalog/types";
import { footprintBounds, resolveFootprint, shapeFootprint, type Footprint } from "@/lib/studio/footprint";
import {
  absoluteControlPoints,
  bulgeDepthMm,
  bulgeToCurve,
  clampEdgeCurve,
  cubicPointAt,
  endpointFromLengthAngle,
  setBulgeDepth,
  wallAngleDeg,
  wallLengthMm,
} from "@/lib/studio/geometry";
import { defaultStairs, normalizeStairs, type FeatureStairs } from "./stairs";
import { isMain } from "../self-check";

export interface StructureNode {
  id: string;
  x: number;
  y: number;
}

// A built wall encloses a room and can carry doors. An edge is a boundary you can see but not walk
// into — the lip of a paved terrace, the rim of the קוליסאום — which still closes a region for
// face detection without pretending to be a wall you could hang a door on.
export type WallKind = "wall" | "edge";

export interface Wall {
  id: string;
  a: string; // StructureNode id
  b: string; // StructureNode id
  kind: WallKind;
  curve?: EdgeCurve | null; // bow, stored as offsets from a→b (same convention as lib/studio/hall)
}

// Doors hang off a wall id rather than a positional index. The old Hall stored `wallIndex` into an
// outline array, which silently pointed at a different wall the moment a vertex was inserted; an id
// survives any amount of editing elsewhere in the graph.
export interface StructureEntrance {
  id: string;
  wallId: string;
  distanceMm: number; // along the wall's straight chord from node a
  widthMm: number;
  swingInward: boolean;
  doubleDoor: boolean;
}

// Fixed things a designer has to plan around and cannot move: the pool, a built stage, a permanent
// bar. Real geometry, unlike the trees and parked cars in a traced floor plan, which stay pixels in
// the underlay because nobody ever needs to place a table relative to a tree.
export type FeatureKind = "pool" | "stage" | "bar" | "structure" | "other";

export interface StructureFeature {
  id: string;
  kind: FeatureKind;
  label: string;
  x: number;
  y: number;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  /** How it is drawn — the catalog's own shape vocabulary (MapShape), not the three primitives this
   *  used to be. A fixed feature is PLACED FROM THE CATALOG now (see newFeatureFromProduct), and a
   *  bar built in the shape of a ח has to be a ח on the hall plan as well: the same row that draws
   *  it correctly in the studio drew a solid 3.6×1.8m slab here, claiming six square metres of floor
   *  the staff are actually standing in. Widening the union is backwards-compatible — every feature
   *  already saved is one of the three, and still resolves to exactly what it always drew. */
  shape: MapShape;
  /** A hand-drawn outline, iff `shape === "custom"` — the one shape that is not derived from the two
   *  measurements. Stored so a designer's own oddly-shaped bar survives being placed here, and
   *  SCALED to width × depth when drawn (see featureFootprint), because on a feature those two
   *  numbers are what the resize handles drag. */
  outline?: Point[];
  edgeCurves?: (EdgeCurve | null)[];
  rotationDeg: number;
  /** Per-element look (fill/stroke/dash). Absent = the renderer's own default, so features saved
   *  before styling existed draw exactly as they always did. See lib/element-style.ts. */
  style?: ElementStyle;
  /** Steps up onto a raised feature — the stage, in practice. Part of the feature rather than a
   *  feature of its own: the flight turns and travels with the deck, and its risers are derived
   *  from that deck's height. See ./stairs.ts. */
  stairs?: FeatureStairs;
}

export const FEATURE_KIND_LABEL: Record<FeatureKind, string> = {
  pool: "בריכה",
  stage: "במה",
  bar: "בר",
  structure: "מבנה",
  other: "אחר",
};

/** A rod or truss built into the hall's ceiling — the thing a chandelier or a ceiling installation
 *  is physically hung from. The PROPERTY's, like a wall: measured once at /halls, and every event
 *  held in the room plans around the same rods.
 *
 *  Two absolute points rather than a node graph like the walls. Rods cross the room and share
 *  nothing with the walls, so there is no shared endpoint to keep in step and a graph would buy
 *  nothing but a second editor. `a === b` is a single eyebolt, drawn as a cross rather than a line —
 *  one geometry for both, so nothing downstream has to branch on which kind of fixing it is.
 *
 *  `loadKg` is RECORDED AND PRINTED, never validated against: summing what hangs off a rod needs a
 *  weight per product, and the catalog has none. */
export interface CeilingRig {
  id: string;
  label: string;
  a: Point;
  b: Point;
  heightMm: number; // above the floor
  loadKg?: number;
}

export interface VenueStructure {
  nodes: StructureNode[];
  walls: Wall[];
  entrances: StructureEntrance[];
  features: StructureFeature[];
  /** Absent on every venue drawn before rods existed — every reader defaults it. */
  rigs?: CeilingRig[];
}

export function emptyStructure(): VenueStructure {
  return { nodes: [], walls: [], entrances: [], features: [] };
}

// --- lookups ---------------------------------------------------------------

export function nodeMap(s: VenueStructure): Map<string, StructureNode> {
  return new Map(s.nodes.map((n) => [n.id, n]));
}

/** A wall's two endpoints, or null when it references a node that no longer exists. */
export function wallPoints(s: VenueStructure, wall: Wall, nodes = nodeMap(s)): { a: Point; b: Point } | null {
  const a = nodes.get(wall.a);
  const b = nodes.get(wall.b);
  return a && b ? { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } } : null;
}

// --- editing ---------------------------------------------------------------
// Every mutation returns a new structure; the editor holds one in state and the storage seam
// persists it. Nothing here touches localStorage.

/** Reuses an existing node within `snapMm` instead of stacking a second one on the same spot — how
 *  walls come to share endpoints, which is what makes them a connected graph rather than a heap
 *  of disjoint segments that merely look joined. */
export function addNode(s: VenueStructure, p: Point, snapMm = 250): { structure: VenueStructure; nodeId: string } {
  const hit = s.nodes.find((n) => Math.hypot(n.x - p.x, n.y - p.y) <= snapMm);
  if (hit) return { structure: s, nodeId: hit.id };
  const node: StructureNode = { id: crypto.randomUUID(), x: p.x, y: p.y };
  return { structure: { ...s, nodes: [...s.nodes, node] }, nodeId: node.id };
}

export function addWall(s: VenueStructure, aId: string, bId: string, kind: WallKind = "wall"): VenueStructure {
  if (aId === bId) return s;
  const exists = s.walls.some((w) => (w.a === aId && w.b === bId) || (w.a === bId && w.b === aId));
  if (exists) return s;
  return { ...s, walls: [...s.walls, { id: crypto.randomUUID(), a: aId, b: bId, kind }] };
}

/** Moves one node — and with it every wall attached to it. The shared-wall payoff in one function. */
export function moveNode(s: VenueStructure, nodeId: string, p: Point): VenueStructure {
  return { ...s, nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, x: p.x, y: p.y } : n)) };
}

/** Removes a wall, plus any door on it and any node left with nothing attached. */
export function removeWall(s: VenueStructure, wallId: string): VenueStructure {
  const walls = s.walls.filter((w) => w.id !== wallId);
  const used = new Set(walls.flatMap((w) => [w.a, w.b]));
  return {
    ...s,
    walls,
    nodes: s.nodes.filter((n) => used.has(n.id)),
    entrances: s.entrances.filter((e) => e.wallId !== wallId),
  };
}

export function removeNode(s: VenueStructure, nodeId: string): VenueStructure {
  const doomed = s.walls.filter((w) => w.a === nodeId || w.b === nodeId).map((w) => w.id);
  return {
    ...s,
    nodes: s.nodes.filter((n) => n.id !== nodeId),
    walls: s.walls.filter((w) => !doomed.includes(w.id)),
    entrances: s.entrances.filter((e) => !doomed.includes(e.wallId)),
  };
}

export function updateWall(s: VenueStructure, wallId: string, patch: Partial<Omit<Wall, "id">>): VenueStructure {
  return { ...s, walls: s.walls.map((w) => (w.id === wallId ? { ...w, ...patch } : w)) };
}

/** Re-aims a wall by moving its far node, keeping node `a` put.
 *
 *  In a graph this is deliberately not a local edit: node `b` may be the corner where three other
 *  walls meet, and they all follow it. That is the correct reading of "make this wall 12m" on a
 *  shared structure — the junction moves, the rooms either side reshape, and no gap opens. Typing a
 *  length that would tear the plan apart is not a thing this model can express, which is the point.
 */
function reaimWall(s: VenueStructure, wallId: string, lengthMm: number, angleDeg: number): VenueStructure {
  const wall = s.walls.find((w) => w.id === wallId);
  const pts = wall ? wallPoints(s, wall) : null;
  if (!wall || !pts || !(lengthMm > 0)) return s;
  const p = endpointFromLengthAngle(pts.a, lengthMm, angleDeg);
  return moveNode(s, wall.b, { x: Math.round(p.x), y: Math.round(p.y) });
}

export function setWallLength(s: VenueStructure, wallId: string, lengthMm: number): VenueStructure {
  const wall = s.walls.find((w) => w.id === wallId);
  const pts = wall ? wallPoints(s, wall) : null;
  return pts ? reaimWall(s, wallId, lengthMm, wallAngleDeg(pts.a, pts.b)) : s;
}

export function setWallAngle(s: VenueStructure, wallId: string, angleDeg: number): VenueStructure {
  const wall = s.walls.find((w) => w.id === wallId);
  const pts = wall ? wallPoints(s, wall) : null;
  return pts ? reaimWall(s, wallId, wallLengthMm(pts.a, pts.b), angleDeg) : s;
}

// --- curved walls ----------------------------------------------------------
// A wall bows as a cubic bezier whose control points are stored as offsets from its own two nodes
// (the EdgeCurve convention from lib/studio/hall), so a bow survives its corners being dragged: move
// a node and the curve travels with it instead of staying anchored to where that corner used to be.
// A straight wall stores no curve at all — `undefined` and "not bowed" are the same state, which is
// what keeps every plan drawn before this feature existing exactly as straight as it was.

/** How far a wall bows away from the straight line between its corners. 0 for a straight wall. */
export function wallBulgeMm(s: VenueStructure, wallId: string): number {
  const wall = s.walls.find((w) => w.id === wallId);
  const pts = wall ? wallPoints(s, wall) : null;
  return wall && pts ? bulgeDepthMm(pts.a, pts.b, wall.curve ?? null) : 0;
}

/** Bows a wall so its middle passes through `p` — the drag of the bow handle. Dragging back onto
 *  the chord straightens the wall outright rather than leaving a curve too shallow to see but still
 *  stored: the threshold scales with the wall, since a 5cm bow reads as straight on a 12m wall and
 *  as a deliberate curve on a 40cm one. */
export function bulgeWall(s: VenueStructure, wallId: string, p: Point): VenueStructure {
  const wall = s.walls.find((w) => w.id === wallId);
  const pts = wall ? wallPoints(s, wall) : null;
  if (!wall || !pts) return s;
  const curve = clampEdgeCurve(pts.a, pts.b, bulgeToCurve(pts.a, pts.b, p));
  const straightEnough = Math.max(20, wallLengthMm(pts.a, pts.b) * 0.01);
  return updateWall(s, wallId, { curve: bulgeDepthMm(pts.a, pts.b, curve) < straightEnough ? null : curve });
}

/** Sets a wall's bow by depth alone, keeping whichever side it already bows toward — the numeric
 *  counterpart to dragging the handle. 0 straightens it. */
export function setWallBulge(s: VenueStructure, wallId: string, depthMm: number): VenueStructure {
  const wall = s.walls.find((w) => w.id === wallId);
  const pts = wall ? wallPoints(s, wall) : null;
  if (!wall || !pts) return s;
  const curve = setBulgeDepth(pts.a, pts.b, wall.curve ?? null, depthMm);
  return updateWall(s, wallId, { curve: curve && clampEdgeCurve(pts.a, pts.b, curve) });
}

/** Moves one of a bowed wall's two bezier control points to `p` — the fine control, for a wall that
 *  should lean into its curve rather than bow symmetrically. A straight wall has no handles to move,
 *  so this is a no-op there rather than a way to invent a curve out of one dragged point. */
export function moveWallControlPoint(s: VenueStructure, wallId: string, which: "c1" | "c2", p: Point): VenueStructure {
  const wall = s.walls.find((w) => w.id === wallId);
  const pts = wall ? wallPoints(s, wall) : null;
  if (!wall?.curve || !pts) return s;
  const anchor = which === "c1" ? pts.a : pts.b; // each control point is stored relative to its own end
  const offset = { x: p.x - anchor.x, y: p.y - anchor.y };
  return updateWall(s, wallId, {
    curve: clampEdgeCurve(pts.a, pts.b, { ...wall.curve, [which]: offset }),
  });
}

/** The wall nearest a point, with how far along its chord the point projects — where a dropped door
 *  lands. Returns null on a structure with no walls (there is nothing to hang a door on). */
export function nearestWall(s: VenueStructure, p: Point): { wallId: string; distanceMm: number } | null {
  const nodes = nodeMap(s);
  let best: { wallId: string; distanceMm: number; distSq: number } | null = null;
  for (const wall of s.walls) {
    const pts = wallPoints(s, wall, nodes);
    if (!pts) continue;
    const dx = pts.b.x - pts.a.x;
    const dy = pts.b.y - pts.a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    const len = Math.sqrt(lenSq);
    let t: number;
    let proj: Point;
    if (wall.curve) {
      // Straight-chord projection finds the nearest point on the line the wall bows AWAY from, not
      // on the wall itself — a door hung from that hit lands wherever doorGeometry's own curve
      // sampling actually puts it, which is somewhere the designer never clicked. Coarse-sample the
      // bow, then refine one step around the best sample — plenty for a hit test, not worth a real
      // numerical solve.
      const { c1, c2 } = absoluteControlPoints(pts.a, pts.b, wall.curve);
      const sample = (lo: number, hi: number, steps: number) => {
        let bt = lo;
        let bd = Infinity;
        for (let i = 0; i <= steps; i++) {
          const ct = lo + ((hi - lo) * i) / steps;
          const q = cubicPointAt(pts.a, c1, c2, pts.b, ct);
          const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
          if (d < bd) { bd = d; bt = ct; }
        }
        return bt;
      };
      const coarse = sample(0, 1, 24);
      t = sample(Math.max(0, coarse - 1 / 24), Math.min(1, coarse + 1 / 24), 24);
      proj = cubicPointAt(pts.a, c1, c2, pts.b, t);
    } else {
      t = Math.max(0, Math.min(1, ((p.x - pts.a.x) * dx + (p.y - pts.a.y) * dy) / lenSq));
      proj = { x: pts.a.x + dx * t, y: pts.a.y + dy * t };
    }
    const distSq = (p.x - proj.x) ** 2 + (p.y - proj.y) ** 2;
    if (!best || distSq < best.distSq) best = { wallId: wall.id, distanceMm: t * len, distSq };
  }
  return best ? { wallId: best.wallId, distanceMm: Math.round(best.distanceMm) } : null;
}

// --- doors -----------------------------------------------------------------

export function addEntrance(s: VenueStructure, e: Omit<StructureEntrance, "id">): { structure: VenueStructure; entranceId: string } {
  const entrance: StructureEntrance = { ...e, id: crypto.randomUUID() };
  return { structure: { ...s, entrances: [...s.entrances, entrance] }, entranceId: entrance.id };
}

export function updateEntrance(s: VenueStructure, id: string, patch: Partial<Omit<StructureEntrance, "id">>): VenueStructure {
  return { ...s, entrances: s.entrances.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}

export function removeEntrance(s: VenueStructure, id: string): VenueStructure {
  return { ...s, entrances: s.entrances.filter((e) => e.id !== id) };
}

// --- fixed features --------------------------------------------------------

export function addFeature(s: VenueStructure, f: Omit<StructureFeature, "id">): { structure: VenueStructure; featureId: string } {
  const feature: StructureFeature = { ...f, id: crypto.randomUUID() };
  return { structure: { ...s, features: [...s.features, feature] }, featureId: feature.id };
}

export function updateFeature(s: VenueStructure, id: string, patch: Partial<Omit<StructureFeature, "id">>): VenueStructure {
  return {
    ...s,
    features: s.features.map((f) => {
      if (f.id !== id) return f;
      const next = { ...f, ...patch };
      // Any edit to the deck is also an edit to what its stairs are allowed to be: narrow a stage
      // and a flight wider than its new edge has to come in with it, or it hangs in mid-air off a
      // stage that no longer reaches it. Re-checked here, once, rather than at each of the callers
      // that can resize a feature.
      return next.stairs ? { ...next, stairs: normalizeStairs(next, next.stairs) } : next;
    }),
  };
}

// --- stairs ----------------------------------------------------------------

/** Gives a feature its first flight of stairs, sized to the deck it climbs (see ./stairs.ts). */
export function addStairs(s: VenueStructure, featureId: string): VenueStructure {
  const feature = s.features.find((f) => f.id === featureId);
  if (!feature || feature.stairs) return s;
  return updateFeature(s, featureId, { stairs: defaultStairs(feature) });
}

export function removeStairs(s: VenueStructure, featureId: string): VenueStructure {
  return updateFeature(s, featureId, { stairs: undefined });
}

/** Patches a flight — count, tread, width, which edge it hangs off — keeping it on its deck. */
export function updateStairs(s: VenueStructure, featureId: string, patch: Partial<FeatureStairs>): VenueStructure {
  const feature = s.features.find((f) => f.id === featureId);
  if (!feature?.stairs) return s;
  return updateFeature(s, featureId, { stairs: normalizeStairs(feature, { ...feature.stairs, ...patch }) });
}

export function removeFeature(s: VenueStructure, id: string): VenueStructure {
  return { ...s, features: s.features.filter((f) => f.id !== id) };
}

// --- ceiling rods -------------------------------------------------------

export function rigLengthMm(rig: CeilingRig): number {
  return Math.hypot(rig.b.x - rig.a.x, rig.b.y - rig.a.y);
}

/** A single eyebolt rather than a run: both ends in the same place. Tested with a tolerance, not
 *  with ===, because a rod drawn by a click that moved one millimetre is still one fixing. */
export function isHangingPoint(rig: CeilingRig): boolean {
  return rigLengthMm(rig) < 1;
}

export function addRig(s: VenueStructure, rig: Omit<CeilingRig, "id">): { structure: VenueStructure; rigId: string } {
  const next: CeilingRig = { ...rig, id: crypto.randomUUID() };
  return { structure: { ...s, rigs: [...(s.rigs ?? []), next] }, rigId: next.id };
}

export function updateRig(s: VenueStructure, id: string, patch: Partial<Omit<CeilingRig, "id">>): VenueStructure {
  if (!s.rigs) return s;
  return { ...s, rigs: s.rigs.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

export function removeRig(s: VenueStructure, id: string): VenueStructure {
  if (!s.rigs) return s;
  return { ...s, rigs: s.rigs.filter((r) => r.id !== id) };
}

// Plausible starting dimensions per kind, so dropping one onto the plan gives something the right
// rough size to nudge rather than a nondescript square to type over.
const FEATURE_DEFAULTS: Record<FeatureKind, Pick<StructureFeature, "widthMm" | "depthMm" | "heightMm" | "shape">> = {
  pool: { widthMm: 12000, depthMm: 6000, heightMm: 0, shape: "ellipse" },
  stage: { widthMm: 6000, depthMm: 3000, heightMm: 600, shape: "rect" },
  bar: { widthMm: 4000, depthMm: 1200, heightMm: 1100, shape: "rect" },
  structure: { widthMm: 4000, depthMm: 4000, heightMm: 3000, shape: "rect" },
  other: { widthMm: 2000, depthMm: 2000, heightMm: 1000, shape: "rect" },
};

export function newFeature(kind: FeatureKind, at: Point): Omit<StructureFeature, "id"> {
  return {
    kind,
    label: FEATURE_KIND_LABEL[kind],
    x: Math.round(at.x),
    y: Math.round(at.y),
    rotationDeg: 0,
    ...FEATURE_DEFAULTS[kind],
  };
}

/** The same feature, placed from a CATALOG ROW instead of from a rough default.
 *
 *  A built bar and a built stage are the two fixed features a studio already owns a real description
 *  of — the base library ships both (lib/catalog/standard/items.ts) — so the hall plan asks "which
 *  bar" rather than "which shape, and how big". The row's name, shape and three measurements come
 *  across; nothing points BACK at it afterwards. That is deliberate: the venue's plan is the
 *  property's own drawing and outlives any edit, archive or deletion in the catalog, and a feature
 *  that resolved a product id every time it drew would go blank the day somebody tidied the catalog.
 *
 *  Width and depth are the footprint's BOUNDS, not the row's raw numbers, so the two agree for every
 *  shape — a circle's `widthMm` is its diameter here, which is what the renderer and the resize
 *  handle both already read. */
export function newFeatureFromProduct(kind: FeatureKind, product: Product, at: Point): Omit<StructureFeature, "id"> {
  const shape = product.appearance?.shape ?? (product.dimensions.diameterMm ? "circle" : "rect");
  const b = footprintBounds(resolveFootprint(product));
  const outline = shape === "custom" ? product.appearance?.outline : undefined;
  return {
    kind,
    label: product.name,
    x: Math.round(at.x),
    y: Math.round(at.y),
    rotationDeg: 0,
    widthMm: Math.round(b.w),
    depthMm: Math.round(b.h),
    heightMm: product.dimensions.heightMm,
    shape,
    ...(outline && outline.length >= 3
      ? { outline, ...(product.appearance?.edgeCurves ? { edgeCurves: product.appearance.edgeCurves } : {}) }
      : {}),
  };
}

/** What a feature is drawn as — one footprint, shared by the editor, the printed placement map and
 *  anything else that ever draws this plan.
 *
 *  A drawn outline is scaled here so its bounding box is exactly width × depth. Catalog products
 *  keep the opposite rule (there, a drawn outline IS the measurement), and the difference is real:
 *  a feature's two numbers are what its resize handles drag and what the inspector shows, so an
 *  outline that ignored them would be a shape the plan claims is 4m wide and draws at 3. */
export function featureFootprint(
  f: Pick<StructureFeature, "shape" | "widthMm" | "depthMm" | "outline" | "edgeCurves">,
): Footprint {
  return shapeFootprint(f.shape, {
    widthMm: f.widthMm,
    depthMm: f.depthMm,
    // A feature has no diameter field: a round one is as wide as it is across, which is what both
    // the old renderer and the radius handle have always assumed.
    diameterMm: f.widthMm,
    ...(f.shape === "custom" && f.outline && f.outline.length >= 3
      ? scaleOutline(f.outline, f.edgeCurves, f.widthMm, f.depthMm)
      : {}),
  });
}

/** An outline recentred on its own bounding box and stretched to `widthMm` × `depthMm`. Edge curves
 *  are offsets from their own endpoints (lib/studio/geometry), so they scale by the same two factors
 *  and stay attached to the edge they bow. */
function scaleOutline(
  outline: Point[],
  edgeCurves: (EdgeCurve | null)[] | undefined,
  widthMm: number,
  depthMm: number,
): { outline: Point[]; edgeCurves?: (EdgeCurve | null)[] } {
  const minX = Math.min(...outline.map((p) => p.x));
  const maxX = Math.max(...outline.map((p) => p.x));
  const minY = Math.min(...outline.map((p) => p.y));
  const maxY = Math.max(...outline.map((p) => p.y));
  const sx = maxX > minX ? widthMm / (maxX - minX) : 1;
  const sy = maxY > minY ? depthMm / (maxY - minY) : 1;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    outline: outline.map((p) => ({ x: (p.x - cx) * sx, y: (p.y - cy) * sy })),
    ...(edgeCurves
      ? {
          edgeCurves: edgeCurves.map((c) =>
            c ? { c1: { x: c.c1.x * sx, y: c.c1.y * sy }, c2: { x: c.c2.x * sx, y: c.c2.y * sy } } : c,
          ),
        }
      : {}),
  };
}

// ponytail: self-check. Run: node --experimental-strip-types lib/venues/structure.ts
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const at = (s: VenueStructure, id: string) => s.nodes.find((n) => n.id === id)!;

  // Two rooms sharing the wall n2→n3, the case the whole graph model exists for:
  //   n1───n2───n5
  //    │    │    │
  //   n4───n3───n6
  const base: VenueStructure = {
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 5000, y: 0 },
      { id: "n3", x: 5000, y: 4000 },
      { id: "n4", x: 0, y: 4000 },
      { id: "n5", x: 9000, y: 0 },
      { id: "n6", x: 9000, y: 4000 },
    ],
    walls: [
      { id: "w-top-a", a: "n1", b: "n2", kind: "wall" },
      { id: "w-shared", a: "n2", b: "n3", kind: "wall" },
      { id: "w-bot-a", a: "n3", b: "n4", kind: "wall" },
      { id: "w-left", a: "n4", b: "n1", kind: "wall" },
      { id: "w-top-b", a: "n2", b: "n5", kind: "wall" },
      { id: "w-right", a: "n5", b: "n6", kind: "wall" },
      { id: "w-bot-b", a: "n6", b: "n3", kind: "wall" },
    ],
    entrances: [],
    features: [],
  };

  // --- setWallLength on a shared wall -----------------------------------------------------------
  // Lengthening the shared wall drags node n3 with it. The neighbouring walls that also end at n3
  // must still end at n3 — if a "wall length" edit ever detached one, a gap would open between two
  // rooms that are physically joined, which is exactly the bug the graph exists to prevent.
  const stretched = setWallLength(base, "w-shared", 6000);
  assert(at(stretched, "n3").y === 6000, "setting a wall's length moves its far node along the wall's own direction");
  assert(at(stretched, "n2").y === 0, "…and leaves the near node alone");
  for (const id of ["w-bot-a", "w-bot-b"]) {
    const w = stretched.walls.find((x) => x.id === id)!;
    const pts = wallPoints(stretched, w)!;
    const touches = (pts.a.x === 5000 && pts.a.y === 6000) || (pts.b.x === 5000 && pts.b.y === 6000);
    assert(touches, `${id} still meets the moved corner — no gap opened between the two rooms`);
  }
  assert(stretched.nodes.length === base.nodes.length, "no corner was duplicated by the edit");

  // --- setWallAngle -----------------------------------------------------------------------------
  const turned = setWallAngle(base, "w-shared", 45);
  const tp = wallPoints(turned, turned.walls.find((w) => w.id === "w-shared")!)!;
  // Within a millimetre, not exactly: corners are stored as whole millimetres (as everything the
  // snapper emits is), and rounding x and y independently costs a fraction of the Euclidean length.
  // The guarantee is "the wall did not change size", not a bit-exact float.
  assert(Math.abs(wallLengthMm(tp.a, tp.b) - 4000) < 1, "re-aiming a wall keeps its length");
  assert(Math.round(wallAngleDeg(tp.a, tp.b)) === 45, "…at exactly the angle asked for");

  // A length of zero is not an edit, it's a request to collapse a wall into nothing — refused.
  assert(setWallLength(base, "w-shared", 0) === base, "a zero length is rejected rather than collapsing the wall");
  assert(setWallLength(base, "no-such-wall", 3000) === base, "an unknown wall id is a no-op");

  // --- nearestWall ------------------------------------------------------------------------------
  const near = nearestWall(base, { x: 4900, y: 1000 })!;
  assert(near.wallId === "w-shared", "a point beside the shared wall finds that wall, not the far ones");
  assert(near.distanceMm === 1000, "…and reports how far along its chord the point projects");
  // Past either end of a segment the projection clamps, rather than reporting a door hanging off
  // the end of the wall it is supposedly on. Checked on a lone wall so there is no second candidate
  // at the same distance to make the answer ambiguous.
  const oneWall: VenueStructure = {
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 4000, y: 0 },
    ],
    walls: [{ id: "w", a: "a", b: "b", kind: "wall" }],
    entrances: [],
    features: [],
  };
  assert(nearestWall(oneWall, { x: -5000, y: 100 })!.distanceMm === 0, "a point beyond the start clamps to the start, never to a negative distance");
  assert(nearestWall(oneWall, { x: 9000, y: 100 })!.distanceMm === 4000, "a point beyond the end clamps to the end, never past it");
  assert(nearestWall(emptyStructure(), { x: 0, y: 0 }) === null, "with no walls there is nothing to hang a door on");

  // A bowed wall: the nearest point is wherever the wall actually bends to, not on the straight
  // chord it bows away from — the bug that put a newly-hung door somewhere the designer never
  // clicked (see doorGeometry's own curve handling in geometry.ts, fixed alongside this).
  const bowCurve = bulgeToCurve({ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 2000, y: 800 });
  const bowedWall: VenueStructure = {
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 4000, y: 0 },
    ],
    walls: [{ id: "w", a: "a", b: "b", kind: "wall", curve: bowCurve }],
    entrances: [],
    features: [],
  };
  const nearBowed = nearestWall(bowedWall, { x: 2000, y: 800 })!;
  const { c1: bc1, c2: bc2 } = absoluteControlPoints({ x: 0, y: 0 }, { x: 4000, y: 0 }, bowCurve);
  const onCurve = cubicPointAt({ x: 0, y: 0 }, bc1, bc2, { x: 4000, y: 0 }, nearBowed.distanceMm / 4000);
  assert(
    Math.hypot(onCurve.x - 2000, onCurve.y - 800) < 50,
    "a click on a bowed wall's curve lands within 5cm of it, not on the straight chord ~800mm away",
  );

  // --- doors and features -----------------------------------------------------------------------
  const { structure: withDoor, entranceId } = addEntrance(base, {
    wallId: "w-shared",
    distanceMm: 2000,
    widthMm: 1600,
    swingInward: true,
    doubleDoor: true,
  });
  assert(withDoor.entrances.length === 1 && base.entrances.length === 0, "adding a door does not mutate the input");
  const widened = updateEntrance(withDoor, entranceId, { widthMm: 900 });
  assert(widened.entrances[0].widthMm === 900 && widened.entrances[0].distanceMm === 2000, "a patch touches only the fields it names");
  assert(removeWall(withDoor, "w-shared").entrances.length === 0, "deleting a wall takes its doors with it");
  assert(removeNode(withDoor, "n3").entrances.length === 0, "deleting a corner takes the doors on every wall it killed");
  assert(removeEntrance(withDoor, entranceId).entrances.length === 0, "a door can also be removed on its own");

  const { structure: withPool, featureId } = addFeature(base, newFeature("pool", { x: 2500, y: 2000 }));
  assert(withPool.features[0].shape === "ellipse" && withPool.features[0].heightMm === 0, "a pool starts as a flat ellipse");
  assert(updateFeature(withPool, featureId, { x: 3000 }).features[0].y === 2000, "moving a feature in x leaves y alone");
  assert(removeFeature(withPool, featureId).features.length === 0, "a feature can be removed");

  // --- placed from the catalog -----------------------------------------------------------------
  // The whole point of widening `shape`: a ח bar picked off the catalog has to REACH the plan as a
  // ח. Placed as a rectangle it would be the same picture as a solid 3.6×1.8m block of bar, which
  // is not where the staff stand.
  const uBar: Product = {
    id: "p-bar",
    name: "בר בצורת ח 360×180",
    category: "bars",
    layer: "floor",
    dimensions: { widthMm: 3600, depthMm: 1800, heightMm: 1100 },
    categoryFields: {},
    styleTags: [],
    variants: [],
    appearance: { shape: "u-shape", content: "none" },
  };
  const placed = newFeatureFromProduct("bar", uBar, { x: 1000.4, y: 2000.6 });
  assert(placed.shape === "u-shape", "a ח bar lands on the plan as a ח");
  assert(placed.label === "בר בצורת ח 360×180", "…under the catalog row's own name");
  assert(placed.widthMm === 3600 && placed.depthMm === 1800 && placed.heightMm === 1100, "…at the row's own three measurements");
  assert(placed.x === 1000 && placed.y === 2001, "…snapped to whole millimetres like everything else the plan stores");
  const bounds = footprintBounds(featureFootprint(placed));
  assert(bounds.w === 3600 && bounds.h === 1800, "the drawn ח measures what the inspector says it does");

  // A round product's diameter becomes the feature's width, which is the one number the circle
  // renderer and the radius handle both read.
  const roundBar = newFeatureFromProduct("bar", { ...uBar, id: "p-round", dimensions: { diameterMm: 1500, heightMm: 1100 }, appearance: undefined }, { x: 0, y: 0 });
  assert(roundBar.shape === "circle" && roundBar.widthMm === 1500 && roundBar.depthMm === 1500, "a round bar is as wide as it is across");
  assert(featureFootprint(roundBar).kind === "circle", "…and draws as a circle of that width");

  // A feature saved before any of this drew a plain box, and still does.
  assert(
    JSON.stringify(featureFootprint({ shape: "rect", widthMm: 4000, depthMm: 1200 })) ===
      JSON.stringify({ kind: "rect", widthMm: 4000, depthMm: 1200 }),
    "an existing rectangular feature draws exactly as it always did",
  );

  // A hand-drawn outline follows the feature's own two numbers rather than the size it was drawn at
  // — those are what the resize handles drag, so a shape that ignored them would draw one size and
  // measure another.
  const drawn = featureFootprint({
    shape: "custom",
    widthMm: 2000,
    depthMm: 1000,
    outline: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
  });
  assert(drawn.kind === "custom", "a drawn outline stays a drawn outline");
  const drawnBounds = footprintBounds(drawn);
  assert(drawnBounds.w === 2000 && drawnBounds.h === 1000, `a resized custom feature is redrawn to fit (${drawnBounds.w}×${drawnBounds.h})`);

  // --- curved walls -----------------------------------------------------------------------------
  // w-shared runs (5000,0)→(5000,4000). Bowing it 500mm to the left has to leave both corners put:
  // the wall belongs to two rooms, and a bow that moved a node would reshape the room next door.
  const bowed = bulgeWall(base, "w-shared", { x: 4500, y: 2000 });
  assert(Math.abs(wallBulgeMm(bowed, "w-shared") - 500) < 1e-6, "dragging the bow handle curves the wall to the drag point");
  assert(at(bowed, "n2").x === 5000 && at(bowed, "n3").y === 4000, "…without moving either corner it hangs between");
  assert(bowed.walls.filter((w) => w.curve).length === 1, "only the wall that was dragged is curved");
  // Straightness is stored as the absence of a curve, not as a curve of depth zero — otherwise
  // every renderer would have to decide for itself how flat is flat.
  assert(!setWallBulge(bowed, "w-shared", 0).walls.find((w) => w.id === "w-shared")!.curve, "a bow of zero straightens the wall outright");
  assert(!bulgeWall(bowed, "w-shared", { x: 5001, y: 2000 }).walls.find((w) => w.id === "w-shared")!.curve, "dragging the handle back onto the chord straightens it too");
  assert(Math.abs(wallBulgeMm(setWallBulge(base, "w-shared", 300), "w-shared") - 300) < 1e-6, "a bow can be dialled in by depth alone");
  // The bow travels with its corners: it is stored against the wall's ends, so stretching the wall
  // must not leave the curve behind at the old corner.
  const bowedThenStretched = setWallLength(bowed, "w-shared", 8000);
  assert(at(bowedThenStretched, "n3").y === 8000, "the stretched wall's far corner moved");
  assert(!!bowedThenStretched.walls.find((w) => w.id === "w-shared")!.curve, "…and the wall is still bowed afterwards");
  const leaned = moveWallControlPoint(bowed, "w-shared", "c1", { x: 3000, y: 1000 });
  assert(wallBulgeMm(leaned, "w-shared") > 500, "dragging a control point out deepens the curve past its symmetric bow");
  assert(moveWallControlPoint(base, "w-shared", "c1", { x: 3000, y: 1000 }) === base, "a straight wall has no control point to move");
  assert(bulgeWall(base, "no-such-wall", { x: 0, y: 0 }) === base, "an unknown wall id is a no-op");

  // --- stairs -----------------------------------------------------------------------------------
  const { structure: withStage, featureId: stageId } = addFeature(base, newFeature("stage", { x: 2500, y: 2000 }));
  const stageOf = (s: VenueStructure) => s.features.find((f) => f.id === stageId)!;
  assert(!stageOf(withStage).stairs, "a stage arrives without stairs — they are added deliberately");
  const stepped = addStairs(withStage, stageId);
  const flight = stageOf(stepped).stairs!;
  assert(flight.steps === 4 && flight.side === "front", "a 60cm stage gets four steps on its front edge");
  assert(addStairs(stepped, stageId) === stepped, "adding stairs to a stage that has them changes nothing");
  assert(updateStairs(stepped, stageId, { steps: 3 }).features.find((f) => f.id === stageId)!.stairs!.steps === 3, "the step count is editable");
  // The deck and its flight cannot disagree: shrinking the stage takes the stairs in with it.
  const shrunkStage = updateFeature(stepped, stageId, { widthMm: 900 });
  assert(stageOf(shrunkStage).stairs!.widthMm === 900, "narrowing a stage narrows the flight hanging off it");
  assert(!stageOf(removeStairs(stepped, stageId)).stairs, "stairs can be taken off again");
  assert(updateStairs(withStage, stageId, { steps: 2 }) === withStage, "a stage without stairs has no flight to patch");

  // --- ceiling rods ---------------------------------------------------------
  {
    const empty = emptyStructure();
    assert(empty.rigs === undefined, "a fresh structure has no rods, and no empty array either");

    const { structure: s1, rigId } = addRig(empty, {
      label: "מוט מרכזי",
      a: { x: 0, y: 0 },
      b: { x: 8000, y: 0 },
      heightMm: 4200,
    });
    assert(s1.rigs?.length === 1, "a rod is added");
    assert(Math.abs(rigLengthMm(s1.rigs![0]) - 8000) < 1e-9, "an 8m rod is 8m long");
    assert(!isHangingPoint(s1.rigs![0]), "…and is not a hanging point");
    assert(empty.rigs === undefined, "adding a rod does not mutate the structure it was added to");

    const s2 = updateRig(s1, rigId, { heightMm: 3800, loadKg: 200 });
    assert(s2.rigs![0].heightMm === 3800 && s2.rigs![0].loadKg === 200, "a rod can be re-measured and rated");
    assert(s2.rigs![0].label === "מוט מרכזי", "…without losing what it is called");
    assert(updateRig(s1, "gone", { heightMm: 1 }).rigs![0].heightMm === 4200, "updating a rod that is not there changes nothing");

    // A single eyebolt: both ends in the same place. Zero length, and every consumer has to
    // survive dividing by it — see resolveHang in lib/studio/anchor.ts.
    const { structure: s3 } = addRig(s2, { label: "נקודת תלייה", a: { x: 2000, y: 2000 }, b: { x: 2000, y: 2000 }, heightMm: 4000 });
    assert(rigLengthMm(s3.rigs![1]) === 0 && isHangingPoint(s3.rigs![1]), "a hanging point is a rod of zero length");

    const s4 = removeRig(s3, rigId);
    assert(s4.rigs!.length === 1 && s4.rigs![0].label === "נקודת תלייה", "a rod can be removed, and takes only itself");
  }

  console.log("venue structure self-check passed");
}
