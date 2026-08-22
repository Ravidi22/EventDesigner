// What is selected on the venue plan, and the two rules that decide it: what a marquee catches, and
// what a click does to a selection that already exists.
//
// Both live here rather than in the screen because they are the parts with actual semantics — "a
// wall counts only when the box holds both its ends", "clicking the one selected thing clears it" —
// and a rule buried in a component is a rule nobody can check. There is no browser to drive here,
// so a pure module with a self-check is the difference between verified and hoped-for.
import type { Point } from "@/lib/studio/hall";
import { pointAtDistance, polygonCentroid } from "@/lib/studio/geometry";
import { nodeMap, wallPoints, type VenueStructure } from "./structure";
import type { ResolvedZone } from "./zone";
import { isMain } from "../self-check";

export type PlanSelectionKind = "zone" | "wall" | "node" | "door" | "feature";

export interface PlanSelection {
  kind: PlanSelectionKind;
  id: string;
}

export interface SelectionBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const same = (a: PlanSelection, b: PlanSelection) => a.kind === b.kind && a.id === b.id;

export function isSelected(selection: PlanSelection[], kind: PlanSelectionKind, id: string): boolean {
  return selection.some((s) => s.kind === kind && s.id === id);
}

/** True when every ref is the same kind — what decides whether a group can be offered a real field
 *  (six walls all take a kind) or only a count and a delete. */
export function soleKind(selection: PlanSelection[]): PlanSelectionKind | null {
  const first = selection[0]?.kind;
  return first && selection.every((s) => s.kind === first) ? first : null;
}

/** A click. Shift toggles one ref in or out; a plain click replaces the selection — except that
 *  clicking the single thing already selected clears it, which is how you deselect without having
 *  to find empty canvas to click on. `ref: null` is a click on nothing. */
export function toggleSelection(current: PlanSelection[], ref: PlanSelection | null, additive: boolean): PlanSelection[] {
  if (!ref) return additive ? current : [];
  const at = current.findIndex((s) => same(s, ref));
  if (additive) return at >= 0 ? current.filter((_, i) => i !== at) : [...current, ref];
  return at >= 0 && current.length === 1 ? [] : [ref];
}

/** A marquee release. Shift adds to what was already selected instead of replacing it. */
export function mergeSelection(current: PlanSelection[], hits: PlanSelection[], additive: boolean): PlanSelection[] {
  if (!additive) return hits;
  const merged = [...current];
  for (const h of hits) if (!merged.some((s) => same(s, h))) merged.push(h);
  return merged;
}

/** Everything inside a marquee box, across every layer of the plan at once — the graph the canvas
 *  draws and the zones/features/doors the screen draws over it. */
export function hitsInBox(structure: VenueStructure, zones: ResolvedZone[], box: SelectionBox): PlanSelection[] {
  const inside = (p: Point) => p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
  const hits: PlanSelection[] = [];
  const nodes = nodeMap(structure);

  for (const n of structure.nodes) if (inside(n)) hits.push({ kind: "node", id: n.id });

  // A wall counts only when the box holds *both* its ends. Testing the midpoint instead would take
  // walls that mostly lie outside the box, so dragging a box over one room would quietly grab the
  // long walls of the room next door.
  for (const w of structure.walls) {
    const pts = wallPoints(structure, w, nodes);
    if (pts && inside(pts.a) && inside(pts.b)) hits.push({ kind: "wall", id: w.id });
  }

  for (const f of structure.features) if (inside(f)) hits.push({ kind: "feature", id: f.id });

  for (const e of structure.entrances) {
    const w = structure.walls.find((x) => x.id === e.wallId);
    const pts = w ? wallPoints(structure, w, nodes) : null;
    if (pts && inside(pointAtDistance(pts.a, pts.b, e.distanceMm))) hits.push({ kind: "door", id: e.id });
  }

  // Zones by centroid, not by full containment: a zone is a label over a region, and you point at
  // one by pointing at its middle. Requiring the whole region inside would make the biggest zone —
  // the one hardest to fit in a drag — the hardest to select.
  for (const r of zones) {
    if (r.boundary.length >= 3 && inside(polygonCentroid(r.boundary))) hits.push({ kind: "zone", id: r.zone.id });
  }

  return hits;
}

// ponytail: self-check. Run: node --experimental-strip-types lib/venues/selection.ts
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const ids = (s: PlanSelection[]) => s.map((r) => `${r.kind}:${r.id}`).sort().join(",");

  // --- click semantics --------------------------------------------------------------------------
  const wallA: PlanSelection = { kind: "wall", id: "a" };
  const wallB: PlanSelection = { kind: "wall", id: "b" };
  const nodeA: PlanSelection = { kind: "node", id: "a" };

  assert(ids(toggleSelection([], wallA, false)) === "wall:a", "a plain click on nothing selected selects it");
  assert(ids(toggleSelection([wallB], wallA, false)) === "wall:a", "a plain click replaces the selection");
  assert(toggleSelection([wallA], wallA, false).length === 0, "clicking the one selected thing clears it");
  assert(ids(toggleSelection([wallA, wallB], wallA, false)) === "wall:a", "clicking one member of a group collapses to it, rather than clearing");
  assert(ids(toggleSelection([wallA], wallB, true)) === "wall:a,wall:b", "shift-click adds");
  assert(ids(toggleSelection([wallA, wallB], wallA, true)) === "wall:b", "shift-click on a selected member removes it");
  assert(toggleSelection([wallA], null, false).length === 0, "a plain click on empty canvas clears");
  assert(ids(toggleSelection([wallA], null, true)) === "wall:a", "a shift-click on empty canvas leaves the selection alone");
  // kind and id together identify a ref — a wall and a corner may share an id string.
  assert(ids(toggleSelection([wallA], nodeA, true)) === "node:a,wall:a", "same id under a different kind is a different thing");

  assert(soleKind([wallA, wallB]) === "wall", "an all-wall group reports its kind");
  assert(soleKind([wallA, nodeA]) === null, "a mixed group has no single kind");
  assert(soleKind([]) === null, "an empty selection has no kind");

  assert(ids(mergeSelection([wallA], [wallB], true)) === "wall:a,wall:b", "a shift-marquee adds to what was selected");
  assert(ids(mergeSelection([wallA], [wallA, wallB], true)) === "wall:a,wall:b", "…without duplicating what was already in");
  assert(ids(mergeSelection([wallA], [wallB], false)) === "wall:b", "a plain marquee replaces");

  // --- marquee hit-testing ----------------------------------------------------------------------
  // A 4×4m room, with a second room sharing its east wall, one door and one feature:
  //   n1───n2───n5
  //    │ ⌂  │    │        ⌂ = feature at (2,2)m,  door on the shared wall n2→n3
  //   n4───n3───n6
  const s: VenueStructure = {
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 4000, y: 0 },
      { id: "n3", x: 4000, y: 4000 },
      { id: "n4", x: 0, y: 4000 },
      { id: "n5", x: 9000, y: 0 },
      { id: "n6", x: 9000, y: 4000 },
    ],
    walls: [
      { id: "w-n", a: "n1", b: "n2", kind: "wall" },
      { id: "w-shared", a: "n2", b: "n3", kind: "wall" },
      { id: "w-s", a: "n3", b: "n4", kind: "wall" },
      { id: "w-w", a: "n4", b: "n1", kind: "wall" },
      { id: "w-far-n", a: "n2", b: "n5", kind: "wall" },
      { id: "w-far-e", a: "n5", b: "n6", kind: "wall" },
      { id: "w-far-s", a: "n6", b: "n3", kind: "wall" },
    ],
    entrances: [{ id: "d1", wallId: "w-shared", distanceMm: 2000, widthMm: 1000, swingInward: true, doubleDoor: false }],
    features: [
      { id: "f1", kind: "bar", label: "בר", x: 2000, y: 2000, widthMm: 1000, depthMm: 500, heightMm: 1100, shape: "rect", rotationDeg: 0 },
    ],
  };
  const zoneLeft: ResolvedZone = {
    zone: { id: "z-left", venueId: "v", name: "שמאל", kind: "hall", source: { type: "face", anchor: { x: 2000, y: 2000 } }, ceilingHeightMm: 4000, createdAt: 0 },
    boundary: [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 4000 },
      { x: 0, y: 4000 },
    ],
    detached: false,
  };
  const zoneRight: ResolvedZone = {
    zone: { id: "z-right", venueId: "v", name: "ימין", kind: "hall", source: { type: "face", anchor: { x: 6500, y: 2000 } }, ceilingHeightMm: 4000, createdAt: 0 },
    boundary: [
      { x: 4000, y: 0 },
      { x: 9000, y: 0 },
      { x: 9000, y: 4000 },
      { x: 4000, y: 4000 },
    ],
    detached: false,
  };
  const zones = [zoneLeft, zoneRight];

  // A box around the left room only.
  const left = hitsInBox(s, zones, { minX: -500, minY: -500, maxX: 4500, maxY: 4500 });
  assert(ids(left.filter((h) => h.kind === "node")) === "node:n1,node:n2,node:n3,node:n4", "the box takes exactly the four corners inside it");
  assert(
    ids(left.filter((h) => h.kind === "wall")) === "wall:w-n,wall:w-s,wall:w-shared,wall:w-w",
    "…and the four walls whose BOTH ends are inside — including the shared one, whose neighbours' walls are not taken",
  );
  assert(!left.some((h) => h.kind === "wall" && h.id.startsWith("w-far")), "a wall with one end outside the box is left alone");
  assert(ids(left.filter((h) => h.kind === "zone")) === "zone:z-left", "only the zone whose centre is in the box");
  assert(ids(left.filter((h) => h.kind === "feature")) === "feature:f1", "the feature inside comes along");
  assert(ids(left.filter((h) => h.kind === "door")) === "door:d1", "the door on the shared wall is in the box");

  // A box in the empty middle of nothing takes nothing.
  assert(hitsInBox(s, zones, { minX: 20000, minY: 20000, maxX: 21000, maxY: 21000 }).length === 0, "an empty box selects nothing");

  // A box over everything takes everything, once each.
  const all = hitsInBox(s, zones, { minX: -1000, minY: -1000, maxX: 10000, maxY: 5000 });
  assert(all.filter((h) => h.kind === "node").length === 6, "a box over the whole plan takes every corner");
  assert(all.filter((h) => h.kind === "wall").length === 7, "…every wall");
  assert(all.filter((h) => h.kind === "zone").length === 2, "…every zone");
  assert(new Set(all.map((h) => `${h.kind}:${h.id}`)).size === all.length, "…and nothing twice");

  // A zone whose region came undone has no boundary to take a centre from — it must not throw or
  // report a hit at the origin, which is where an empty polygon's centroid would land.
  const detached: ResolvedZone = { ...zoneLeft, zone: { ...zoneLeft.zone, id: "z-gone" }, boundary: [], detached: true };
  const withDetached = hitsInBox(s, [detached], { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 });
  assert(withDetached.every((h) => h.kind !== "zone"), "a detached zone is never caught by a box near the origin");

  console.log("venue selection self-check passed");
}
