// A saved sketch — a whole design document kept under a name, to be started from again — and what
// has to happen to one before it can be drawn into a different room.
//
// The actions that store them are in ./sketch-actions.ts; this is the pure half, so it runs under
// node and the rule below is self-checked: `npm run check:sketches`.
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { isMain } from "../self-check";

/** A saved sketch as the pickers list it — never its content, which can be hundreds of placements
 *  and is fetched only when one is actually loaded. */
export interface SketchTemplateSummary {
  id: string;
  name: string;
  /** The property it was drawn in, or null when it was drawn without one (or the venue is gone). */
  venueId: string | null;
  tables: number;
  items: number;
  createdAt: number;
}

/** Caps on a saved sketch — the same ceilings design_documents keeps (lib/studio/actions.ts), for
 *  the same reason: a JSONB column arriving over HTTP has to have one. */
export const MAX_SKETCH_TABLES = 2_000;
export const MAX_SKETCH_PLACEMENTS = 20_000;
export const MAX_SKETCHES = 60;
export const MAX_SKETCH_NAME = 80;

/**
 * A sketch as it will be drawn into a room: the same drawing when the room is the one it was drawn
 * in, and otherwise the drawing less what belonged to the OTHER room.
 *
 * A drape is a run along a named wall of a named property, and a feature arrangement is an offset
 * from where THAT property keeps its bar; in another venue the wall id resolves to nothing and the
 * bar is not there to move. Carried across anyway, a drape would draw nothing and still bill the
 * client for its metres (the dangling-wall contract in lib/studio/anchor.ts), which is the one
 * outcome worse than losing it. Everything with a position of its own — tables, stages, rugs,
 * items — keeps its millimetres: the designer puts the room right by dragging, which is what a
 * sketch is for. `sameVenue` is the caller's answer to "is this the room it was drawn in"; a sketch
 * drawn with no venue at all is in no room, so nothing is the same room as it.
 */
export function adoptSketch(content: DesignDocumentContent, sameVenue: boolean): DesignDocumentContent {
  if (sameVenue) return content;
  const { features: _theirs, ...rest } = content;
  return { ...rest, placements: content.placements.filter((p) => !p.span) };
}

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const base = (): DesignDocumentContent => ({
    calibration: { mmPerUnit: 1 },
    tables: [{ id: "t", type: "עגול", number: 1, position: { x: 0, y: 0 }, rotation: 0, diameterMm: 1800 }],
    placements: [
      { id: "rug", variantId: "v", layer: "floor", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
      { id: "drape", variantId: "d", layer: "ceiling", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, span: { wallId: "w", from: 0, to: 1 } },
    ],
    features: [{ featureId: "bar", dx: 100, dy: 0 }],
  });
  const same = adoptSketch(base(), true);
  assert(same.placements.length === 2 && same.features?.length === 1, "in the room it was drawn in, a sketch is the drawing as saved");
  const other = adoptSketch(base(), false);
  assert(other.placements.length === 1 && other.placements[0].id === "rug", "in another room the drapes are left behind…");
  assert(other.features === undefined, "…and so are the arrangements of the other room's own furniture");
  assert(other.tables.length === 1 && other.tables[0].position.x === 0, "…while everything with a place of its own keeps it");
  console.log("sketches self-check passed");
}
