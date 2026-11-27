// npm run check:selection — the self-check of ./selection.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { type VenueStructure } from "./structure";
import type { ResolvedZone } from "./zone";
import { hitsInBox, mergeSelection, soleKind, toggleSelection, type PlanSelection } from "./selection";

// ponytail: self-check. Run: node --experimental-strip-types lib/venues/selection.ts
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
assert(ids(mergeSelection([wallA, wallB], [wallB, nodeA], "toggle")) === "node:a,wall:a", "a Ctrl-marquee toggles: what it caught that was selected goes out, the rest comes in");
assert(ids(mergeSelection([wallA], [wallB], "add")) === "wall:a,wall:b" && ids(mergeSelection([wallA], [wallB], "replace")) === "wall:b", "the named modes match the two booleans");

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

// A feature is caught by a band that only TOUCHES it: f1 spans x 1500–2500, y 1750–2250.
assert(ids(hitsInBox(s, zones, { minX: 2400, minY: 2100, maxX: 3000, maxY: 2600 }).filter((h) => h.kind === "feature")) === "feature:f1", "a band over a feature's corner takes it");
assert(hitsInBox(s, zones, { minX: 2600, minY: 2100, maxX: 3000, maxY: 2600 }).every((h) => h.kind !== "feature"), "…a band beside it does not");
// Turned 90°, the same bar is 500 wide and 1000 deep, so its box reaches further in y.
const turned: VenueStructure = { ...s, features: [{ ...s.features[0], rotationDeg: 90 }] };
assert(ids(hitsInBox(turned, zones, { minX: 1900, minY: 2400, maxX: 2100, maxY: 2600 }).filter((h) => h.kind === "feature")) === "feature:f1", "the band reads the feature's turned extent");

// The ground is taken only whole: a band across part of a lawn takes the planter on it, not the lawn.
const lawn: VenueStructure = { ...s, features: [...s.features, { id: "g", kind: "surface", label: "דשא", x: 2000, y: 2000, widthMm: 3000, depthMm: 3000, heightMm: 0, shape: "rect", rotationDeg: 0, surface: "grass" }] };
assert(ids(hitsInBox(lawn, zones, { minX: 1400, minY: 1400, maxX: 2600, maxY: 2600 }).filter((h) => h.kind === "feature")) === "feature:f1", "a band round the bar on a lawn takes the bar, not the lawn");
assert(ids(hitsInBox(lawn, zones, { minX: 0, minY: 0, maxX: 4000, maxY: 4000 }).filter((h) => h.kind === "feature")) === "feature:f1,feature:g", "…one round the whole lawn takes it too");

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
