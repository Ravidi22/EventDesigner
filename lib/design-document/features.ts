// Where THIS event puts the venue's own movable features.
//
// The rule everywhere else in this app is that the property is drawn once at /halls and an event is
// designed inside it — a wall corrected there fixes every event that was ever drawn on it, because
// no event holds a copy (see lib/events/plan.ts). That rule is right and this file does not break
// it. What it adds is the one fact it could never express: a rolling bar stands against the far
// wall for a wedding and in the middle of the room for a product launch, and BOTH are true at once.
//
// So the venue keeps saying where a feature lives, and the document says only how far this event
// pushed it (FeaturePlacement — an offset and a turn, never an absolute point). Which means:
//
//   • Two events on the same property arrange the same bar differently and neither disturbs the
//     other, which is the whole reason this is not a write back to the venue.
//   • A property re-surveyed at /halls carries every event's arrangement with it. An absolute point
//     would leave a bar hanging three metres outside a corrected wall, on every event ever drawn.
//   • "Put it back" is deleting a row, not remembering a number.
//
// Nothing here can resize, delete or add a feature, and nothing here touches a wall, a door or a
// zone. Moving a thing that was built to be moved is the whole of it.
import type { DesignDocumentContent, FeaturePlacement } from "./types";
import type { StructureFeature, VenueStructure } from "../venues/structure";
import { isMain } from "../self-check";

const norm360 = (deg: number) => ((deg % 360) + 360) % 360;

/** This event's arrangement of one feature, if it has moved it at all. */
export function featurePlacement(
  doc: DesignDocumentContent,
  featureId: string,
): FeaturePlacement | undefined {
  return doc.features?.find((f) => f.featureId === featureId);
}

/** Has this event moved this feature off where the property has it? A zero offset is not a move —
 *  it is a row left behind by dragging something back to where it started, and the inspector's
 *  "return it" button has nothing to do about it. */
export function isFeatureMoved(doc: DesignDocumentContent, featureId: string): boolean {
  const p = featurePlacement(doc, featureId);
  return !!p && (p.dx !== 0 || p.dy !== 0 || norm360(p.rotationDeg ?? 0) !== 0);
}

/** One feature as this event has it. */
export function arrangedFeature(doc: DesignDocumentContent, f: StructureFeature): StructureFeature {
  const p = featurePlacement(doc, f.id);
  if (!p) return f;
  return {
    ...f,
    x: Math.round(f.x + p.dx),
    y: Math.round(f.y + p.dy),
    rotationDeg: norm360((f.rotationDeg ?? 0) + (p.rotationDeg ?? 0)),
  };
}

/**
 * The venue's structure as THIS event has arranged it: the same walls, doors, nodes and zones the
 * property has, with only the features moved.
 *
 * Every surface that draws an event on a plan goes through this — the studio canvas, the placement
 * map the crew is handed, the client-facing view — so that a bar the designer pushed across the
 * room is in the same place on all three. A renderer that reached for `plan.structure` directly
 * would quietly print the crew a map of where the bar ISN'T.
 *
 * Returns the SAME object when the document arranges nothing, which is most documents: no copy, and
 * every memo downstream keeps its identity.
 */
export function arrangedStructure(
  structure: VenueStructure,
  doc: DesignDocumentContent,
): VenueStructure {
  const rows = doc.features;
  if (!rows?.length) return structure;
  // A row pointing at a feature since deleted at /halls is ignored, exactly like a drape's dangling
  // wallId: the property is the authority on what exists, and an event cannot conjure one back.
  const byId = new Map(rows.map((r) => [r.featureId, r]));
  if (!structure.features.some((f) => byId.has(f.id))) return structure;
  return { ...structure, features: structure.features.map((f) => arrangedFeature(doc, f)) };
}

// ponytail: self-check. Run: npm run check:features
if (isMain(import.meta.url)) {
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

  console.log("features self-check passed");
}
