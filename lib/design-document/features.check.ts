// npm run check:features — the self-check of ./features.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignDocumentContent, FeaturePlacement } from "./types";
import { featureMovable, type StructureFeature, type VenueStructure } from "../venues/structure";
import { arrangedFeature, arrangedStructure, isFeatureMoved, isFeatureRemoved, removedFeatures } from "./features";

// ponytail: self-check. Run: npm run check:features
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const feature = (id: string, x: number, y: number, rotationDeg = 0): StructureFeature => ({
  id,
  kind: "bar",
  label: "בר",
  x,
  y,
  widthMm: 2000,
  depthMm: 600,
  heightMm: 1100,
  shape: "rect",
  rotationDeg,
});
const structure: VenueStructure = {
  nodes: [{ id: "n1", x: 0, y: 0 }],
  walls: [],
  entrances: [],
  features: [feature("bar", 1000, 1000), feature("pool", 5000, 5000)],
};
const doc = (features?: FeaturePlacement[]): DesignDocumentContent => ({
  calibration: { mmPerUnit: 1 },
  tables: [],
  placements: [],
  ...(features ? { features } : {}),
});

// An event that arranged nothing gets the property back untouched — the same object, so nothing
// downstream re-renders or re-derives because this function was called.
assert(arrangedStructure(structure, doc()) === structure, "a document with no arrangement is a pass-through");
assert(arrangedStructure(structure, doc([])) === structure, "…and so is an empty list");

// The offset is applied to the VENUE's position, so the property still decides where it starts.
const moved = arrangedStructure(structure, doc([{ featureId: "bar", dx: 500, dy: -200, rotationDeg: 45 }]));
const bar = moved.features.find((f) => f.id === "bar")!;
assert(bar.x === 1500 && bar.y === 800, "an offset moves the feature off where the property has it");
assert(bar.rotationDeg === 45, "…and the turn is added to its own facing");
assert(moved.features.find((f) => f.id === "pool")!.x === 5000, "a feature nobody moved stays put");
assert(moved.walls === structure.walls && moved.nodes === structure.nodes, "walls and corners are untouched");
assert(structure.features[0].x === 1000, "…and the venue's own structure is not mutated");

// The whole point of an offset: /halls re-surveys the property and the arrangement travels.
const resurveyed: VenueStructure = { ...structure, features: [feature("bar", 4000, 4000), feature("pool", 5000, 5000)] };
const after = arrangedStructure(resurveyed, doc([{ featureId: "bar", dx: 500, dy: -200 }]));
assert(after.features[0].x === 4500 && after.features[0].y === 3800, "a corrected plan carries the event's arrangement with it");

// A turn on top of a feature that already has one, wrapped back into [0,360).
const spun = arrangedStructure(
  { ...structure, features: [feature("bar", 0, 0, 300)] },
  doc([{ featureId: "bar", dx: 0, dy: 0, rotationDeg: 90 }]),
);
assert(spun.features[0].rotationDeg === 30, "rotation wraps rather than running past 360");

// A row for a feature /halls has since deleted is not an error and not a ghost.
const dangling = arrangedStructure(structure, doc([{ featureId: "gone", dx: 900, dy: 900 }]));
assert(dangling === structure, "a row pointing at a deleted feature is ignored");
assert(dangling.features.length === 2, "…and conjures nothing back");

// What the inspector asks before offering to put something back.
assert(isFeatureMoved(doc([{ featureId: "bar", dx: 1, dy: 0 }]), "bar"), "a moved feature says so");
assert(!isFeatureMoved(doc([{ featureId: "bar", dx: 0, dy: 0 }]), "bar"), "a row that moves nothing is not a move");
assert(!isFeatureMoved(doc([{ featureId: "bar", dx: 0, dy: 0, rotationDeg: 360 }]), "bar"), "…nor is a full turn");
assert(isFeatureMoved(doc([{ featureId: "bar", dx: 0, dy: 0, rotationDeg: 90 }]), "bar"), "…but a quarter turn is");
assert(!isFeatureMoved(doc(), "bar"), "an event that arranged nothing has moved nothing");

// ── which features a sketch may move ─────────────────────────────────────────────────────────
// Absent switch = the kind's default: a bar and a stage roll about, a pool, a column, the planting
// and the floor do not.
assert(featureMovable({ kind: "bar" }) && featureMovable({ kind: "stage" }), "a bar and a stage move by default");
assert(!featureMovable({ kind: "pool" }) && !featureMovable({ kind: "structure" }) && !featureMovable({ kind: "surface" }), "…a pool, a column and a floor do not");
assert(featureMovable({ kind: "structure", movable: true }), "the venue's switch turns a column movable");
assert(!featureMovable({ kind: "bar", movable: false }), "…and a built-in bar fixed");

// A fixed feature ignores an arrangement — and the row is kept, not deleted.
const pool: StructureFeature = { ...feature("pool", 5000, 5000), kind: "pool" };
const withFixed: VenueStructure = { ...structure, features: [{ ...feature("bar", 1000, 1000), movable: false }, pool] };
const rows = doc([{ featureId: "bar", dx: 500, dy: 0 }, { featureId: "pool", dx: 500, dy: 0 }]);
assert(arrangedStructure(withFixed, rows) === withFixed, "nothing movable was arranged, so the property comes back as is");
assert(arrangedFeature(rows, pool).x === 5000, "a pool (fixed by default) stays where the property has it");
assert(arrangedFeature(rows, { ...pool, movable: true }).x === 5500, "…until the venue lets it move, and the event's row applies again");

// ── taken out for one event ─────────────────────────────────────────────────────────────────
const out = doc([{ featureId: "bar", dx: 500, dy: 0, removed: true }]);
assert(!arrangedStructure(structure, out).features.some((f) => f.id === "bar"), "a feature this event took out is not in its room");
assert(arrangedStructure(structure, out).features.length === 1 && structure.features.length === 2, "…the rest is, and the venue keeps it");
assert(removedFeatures(structure, out).map((f) => f.id).join() === "bar", "…and it is listed for bringing back");
assert(isFeatureRemoved(out, structure.features[0]) && !isFeatureRemoved(out, structure.features[1]), "only the one taken out says so");
const fixedOut: VenueStructure = { ...structure, features: [{ ...feature("bar", 1000, 1000), movable: false }, pool] };
assert(arrangedStructure(fixedOut, out).features.some((f) => f.id === "bar"), "a feature the venue has since fixed comes back into the room");
assert(removedFeatures(fixedOut, out).length === 0, "…and is not offered as taken out");

console.log("features self-check passed");
