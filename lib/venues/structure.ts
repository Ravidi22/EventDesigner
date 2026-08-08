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
import { endpointFromLengthAngle, wallAngleDeg, wallLengthMm } from "@/lib/studio/geometry";

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
  shape: "rect" | "circle" | "ellipse";
  rotationDeg: number;
  /** Per-element look (fill/stroke/dash). Absent = the renderer's own default, so features saved
   *  before styling existed draw exactly as they always did. See lib/element-style.ts. */
  style?: ElementStyle;
}

export const FEATURE_KIND_LABEL: Record<FeatureKind, string> = {
  pool: "בריכה",
  stage: "במה",
  bar: "בר",
  structure: "מבנה",
  other: "אחר",
};

export interface VenueStructure {
  nodes: StructureNode[];
  walls: Wall[];
  entrances: StructureEntrance[];
  features: StructureFeature[];
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
    const t = Math.max(0, Math.min(1, ((p.x - pts.a.x) * dx + (p.y - pts.a.y) * dy) / lenSq));
    const distSq = (p.x - (pts.a.x + dx * t)) ** 2 + (p.y - (pts.a.y + dy * t)) ** 2;
    if (!best || distSq < best.distSq) best = { wallId: wall.id, distanceMm: t * Math.sqrt(lenSq), distSq };
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
  return { ...s, features: s.features.map((f) => (f.id === id ? { ...f, ...patch } : f)) };
}

export function removeFeature(s: VenueStructure, id: string): VenueStructure {
  return { ...s, features: s.features.filter((f) => f.id !== id) };
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

// ponytail: self-check. Run: node --experimental-strip-types lib/venues/structure.ts
if ((import.meta as { main?: boolean }).main) {
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

  console.log("venue structure self-check passed");
}
