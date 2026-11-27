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
// Nothing here can resize or add a feature, and nothing here touches a wall, a door or a zone.
// Moving a thing that was built to be moved is most of it — and taking it out of THIS event's room
// (FeaturePlacement.removed), which deletes nothing at the venue: "bring it back" clears a flag.
import type { DesignDocumentContent, FeaturePlacement } from "./types";
import { featureMovable, type StructureFeature, type VenueStructure } from "../venues/structure";

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

/** One feature as this event has it. A feature the venue does not let a sketch move
 *  (featureMovable) is where the property has it, whatever row this event kept from before the
 *  switch was turned off — the row is left alone, so turning it back on brings the arrangement back. */
export function arrangedFeature(doc: DesignDocumentContent, f: StructureFeature): StructureFeature {
  const p = featurePlacement(doc, f.id);
  if (!p || !featureMovable(f)) return f;
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
  if (!structure.features.some((f) => byId.has(f.id) && featureMovable(f))) return structure;
  // A feature this event took out (FeaturePlacement.removed) is simply not in its room — not drawn,
  // not measured, not in the way of a table, not on the crew's map. Only a movable one: a feature
  // the venue has since fixed in place comes back, its row kept for the day it is freed again.
  return {
    ...structure,
    features: structure.features.filter((f) => !(byId.get(f.id)?.removed && featureMovable(f))).map((f) => arrangedFeature(doc, f)),
  };
}

/** Has this event taken this feature out of its room? */
export function isFeatureRemoved(doc: DesignDocumentContent, f: Pick<StructureFeature, "id" | "kind" | "movable">): boolean {
  return !!featurePlacement(doc, f.id)?.removed && featureMovable(f);
}

/** The venue's features this event has taken out — what "bring it back" offers. */
export function removedFeatures(structure: VenueStructure, doc: DesignDocumentContent): StructureFeature[] {
  if (!doc.features?.some((r) => r.removed)) return [];
  return structure.features.filter((f) => isFeatureRemoved(doc, f));
}
