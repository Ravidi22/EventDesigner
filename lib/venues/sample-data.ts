// Seed venues: one structure per property, plus the zones naming regions of it.
//
// Read the AMARE structure below as a map, not as a list of rooms. אולם גדול and חופה אולם גדול
// share the wall `bh-sw → bh-se` — it is stored ONCE and bounds both regions, so dragging either
// of its nodes reshapes the hall and the חופה together. Same for אולם קטן and its חופה, which
// share the small hall's east wall. That sharing is the reason the structure is a graph.
import type { Venue } from "./types";
import { emptyStructure, type StructureFeature, type VenueStructure, type Wall } from "./structure";
import { newZone, type Zone } from "./zone";

const RONIT = "venue-ronit";
const HADAR = "venue-hadar";
const ZAYIT = "venue-zayit";

// --- seed helpers ----------------------------------------------------------
// Walls are written as node-id pairs so the sharing is visible in the source: a wall listed once
// but bounding two rooms is the whole design, and spelling out coordinates twice would hide it.

// Ids are spelled out rather than generated from a counter: doors reference their wall by id, and
// a counter would silently renumber every wall the moment something was inserted above it.
function wall(id: string, a: string, b: string, kind: Wall["kind"] = "wall"): Wall {
  return { id, a, b, kind };
}

function ring(prefix: string, cx: number, cy: number, rMm: number, sides: number) {
  const nodes = Array.from({ length: sides }, (_, i) => {
    const t = (i / sides) * Math.PI * 2;
    return { id: `${prefix}-${i}`, x: Math.round(cx + rMm * Math.cos(t)), y: Math.round(cy + rMm * Math.sin(t)) };
  });
  // An "edge", not a "wall": the קוליסאום's rim is a boundary you can see and step over, not
  // something you could hang a door on. It still closes a region, so the area is detectable.
  const walls = nodes.map((n, i) => wall(`${prefix}-w${i}`, n.id, nodes[(i + 1) % sides].id, "edge"));
  return { nodes, walls };
}

// --- חוות רונית — אמארה ----------------------------------------------------

const colosseum = ring("col", 52000, 28000, 11000, 12);

const RONIT_STRUCTURE: VenueStructure = {
  nodes: [
    // אולם גדול — the four corners of the big hall
    { id: "bh-nw", x: 8000, y: 6000 },
    { id: "bh-ne", x: 30000, y: 6000 },
    { id: "bh-se", x: 30000, y: 22000 },
    { id: "bh-sw", x: 8000, y: 22000 },
    // חופה אולם גדול — hangs off the big hall's south wall, adding only two new corners
    { id: "bc-se", x: 30000, y: 32000 },
    { id: "bc-sw", x: 8000, y: 32000 },
    // אולם קטן
    { id: "sh-nw", x: 8000, y: 42000 },
    { id: "sh-ne", x: 24000, y: 42000 },
    { id: "sh-se", x: 24000, y: 55000 },
    { id: "sh-sw", x: 8000, y: 55000 },
    // חופה אולם קטן — hangs off the small hall's east wall
    { id: "sc-ne", x: 35000, y: 42000 },
    { id: "sc-se", x: 35000, y: 55000 },
    ...colosseum.nodes,
  ],
  walls: [
    // אולם גדול
    wall("w-bh-n", "bh-nw", "bh-ne"),
    wall("w-bh-e", "bh-ne", "bh-se"),
    wall("w-shared-big", "bh-se", "bh-sw"), // ← SHARED: south wall of the hall, north wall of the חופה
    wall("w-bh-w", "bh-sw", "bh-nw"),
    // חופה אולם גדול — closes against the shared wall above
    wall("w-bc-e", "bh-se", "bc-se"),
    wall("w-bc-s", "bc-se", "bc-sw"),
    wall("w-bc-w", "bc-sw", "bh-sw"),
    // אולם קטן
    wall("w-sh-n", "sh-nw", "sh-ne"),
    wall("w-shared-small", "sh-ne", "sh-se"), // ← SHARED: east wall of the hall, west wall of its חופה
    wall("w-sh-s", "sh-se", "sh-sw"),
    wall("w-sh-w", "sh-sw", "sh-nw"),
    // חופה אולם קטן
    wall("w-sc-n", "sh-ne", "sc-ne"),
    wall("w-sc-e", "sc-ne", "sc-se"),
    wall("w-sc-s", "sc-se", "sh-se"),
    ...colosseum.walls,
  ],
  entrances: [
    // On the shared wall, centred — the doors between אולם גדול and its חופה.
    { id: "ent-big-south", wallId: "w-shared-big", distanceMm: 11000, widthMm: 2400, swingInward: false, doubleDoor: true },
    // On the small hall's shared east wall.
    { id: "ent-small-east", wallId: "w-shared-small", distanceMm: 6500, widthMm: 1800, swingInward: false, doubleDoor: true },
  ],
  features: [
    { id: "f-big-stage", kind: "stage", label: "במה", x: 19000, y: 9000, widthMm: 8000, depthMm: 2400, heightMm: 600, shape: "rect", rotationDeg: 0 },
    { id: "f-big-bar", kind: "bar", label: "בר", x: 12000, y: 19000, widthMm: 4000, depthMm: 1200, heightMm: 1100, shape: "rect", rotationDeg: 0 },
    { id: "f-small-stage", kind: "stage", label: "במה", x: 16000, y: 44500, widthMm: 5000, depthMm: 2000, heightMm: 400, shape: "rect", rotationDeg: 0 },
    // The pool at the centre of the קוליסאום — real geometry, because you cannot seat anyone on it.
    { id: "f-pool", kind: "pool", label: "בריכה", x: 52000, y: 28000, widthMm: 9000, depthMm: 5200, heightMm: 0, shape: "ellipse", rotationDeg: 0 },
  ],
};

// Anchors sit at the centre of the region each zone names. Stored as a point, not a polygon, so
// the region follows the walls when they move — see zone.ts.
const RONIT_ZONES: Zone[] = [
  { ...newZone(RONIT, "hall", { type: "face", anchor: { x: 19000, y: 14000 } }, "אולם גדול"), id: "z-ronit-big", ceilingHeightMm: 6000, capacity: { seated: 400, standing: 550 }, createdAt: Date.parse("2026-05-02") },
  { ...newZone(RONIT, "canopy", { type: "face", anchor: { x: 19000, y: 27000 } }, "חופה אולם גדול"), id: "z-ronit-big-canopy", capacity: { seated: 300, standing: 380 }, createdAt: Date.parse("2026-05-02") },
  { ...newZone(RONIT, "hall", { type: "face", anchor: { x: 16000, y: 48500 } }, "אולם קטן"), id: "z-ronit-small", ceilingHeightMm: 4500, capacity: { seated: 180, standing: 240 }, createdAt: Date.parse("2026-05-02") },
  { ...newZone(RONIT, "canopy", { type: "face", anchor: { x: 29500, y: 48500 } }, "חופה אולם קטן"), id: "z-ronit-small-canopy", capacity: { seated: 150, standing: 200 }, createdAt: Date.parse("2026-05-02") },
  { ...newZone(RONIT, "open", { type: "face", anchor: { x: 52000, y: 28000 } }, "קוליסאום"), id: "z-ronit-colosseum", capacity: { seated: 200, standing: 320 }, createdAt: Date.parse("2026-05-02") },
];

// --- אחוזת הדר -------------------------------------------------------------
// A second, plainer property. Its garden is drawn rather than detected — open ground with no walls
// around it, which is exactly the case face detection cannot serve.

const HADAR_STRUCTURE: VenueStructure = {
  nodes: [
    { id: "hh-nw", x: 5000, y: 5000 },
    { id: "hh-ne", x: 25000, y: 5000 },
    { id: "hh-se", x: 25000, y: 18000 },
    { id: "hh-sw", x: 5000, y: 18000 },
  ],
  walls: [
    wall("w-hh-n", "hh-nw", "hh-ne"),
    wall("w-hh-e", "hh-ne", "hh-se"),
    wall("w-hh-s", "hh-se", "hh-sw"),
    wall("w-hh-w", "hh-sw", "hh-nw"),
  ],
  entrances: [],
  features: [],
};

const HADAR_ZONES: Zone[] = [
  { ...newZone(HADAR, "hall", { type: "face", anchor: { x: 15000, y: 11500 } }, "אולם ראשי"), id: "z-hadar-hall", ceilingHeightMm: 4500, capacity: { seated: 220, standing: 300 }, createdAt: Date.parse("2026-06-18") },
  {
    ...newZone(
      HADAR,
      "open",
      { type: "region", boundary: [{ x: 5000, y: 22000 }, { x: 30000, y: 22000 }, { x: 30000, y: 40000 }, { x: 5000, y: 40000 }] },
      "גן",
    ),
    id: "z-hadar-garden",
    capacity: { seated: 260, standing: 400 },
    createdAt: Date.parse("2026-06-18"),
  },
];

// Three venues, matching the switcher and the seeded halls in lib/setup/sample-data.ts — dropping
// one here would orphan its halls and its Gantt row. גן הזית deliberately has no plan drawn yet:
// it is the empty-venue path the plan editor has to open cleanly on.
export const DEFAULT_VENUES: Venue[] = [
  { id: RONIT, name: "חוות רונית אמארה", plan: { mmPerUnit: 1 } },
  { id: HADAR, name: "אחוזת הדר", plan: { mmPerUnit: 1 } },
  { id: ZAYIT, name: "גן הזית", plan: { mmPerUnit: 1 } },
];

export const DEFAULT_ZONES: Zone[] = [...RONIT_ZONES, ...HADAR_ZONES];

export const DEFAULT_STRUCTURES: Record<string, VenueStructure> = {
  [RONIT]: RONIT_STRUCTURE,
  [HADAR]: HADAR_STRUCTURE,
};

export function structureForVenue(venueId: string): VenueStructure {
  return DEFAULT_STRUCTURES[venueId] ?? emptyStructure();
}
