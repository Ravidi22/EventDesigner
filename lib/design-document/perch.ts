// What stands on a stage's banquette (Placement.perch) lives only as long as that banquette does.
//
// A banquette can go without anyone deleting it: stairs clicked onto its side cut it back or drop it
// (shareSide), a typed width or a grip pushes it under 30cm, a stage is shrunk, a kind is changed
// to stairs, a level is removed. The candles that stood on it then perched on nothing — drawn
// nowhere (canvas-stage's perchedSpots finds no bench) and still counted, packed and quoted
// (QA EI-11). Deleting the banquette by hand already takes its dressing with it; this is the same
// rule for every other way it can go.
//
// Run by the studio when an edit is DONE — after each `act` / `batch`, and once when a gesture ends —
// never on a drag frame: a grip pushed across a neighbour drops it for a frame and gives it back
// when the pointer comes back, and its dressing must still be there when it does.
import type { DesignDocumentContent, Placement } from "./types";
import { edgeKind } from "./stage";

/** `doc` without the placements perched on a banquette its stage no longer holds. The same object
 *  when nothing is perched on nothing — the studio compares by identity. */
export function dropOrphanPerches(doc: DesignDocumentContent): DesignDocumentContent {
  let stages: Map<string, Placement> | null = null;
  let gone: Set<string> | null = null;
  for (const p of doc.placements) {
    if (!p.perch) continue;
    stages ??= new Map(doc.placements.filter((x) => x.stage).map((x) => [x.id, x]));
    const stage = stages.get(p.perch.stageId)?.stage;
    // A perch whose STAGE is gone is the reducer's (removePlacement takes them together); only a
    // stage that is still there and no longer holds the banquette is this rule's.
    if (!stage) continue;
    const item = stage.stairs?.find((st) => st.id === p.perch!.itemId);
    if (item && edgeKind(item) === "bench") continue;
    (gone ??= new Set()).add(p.id);
  }
  return gone ? { ...doc, placements: doc.placements.filter((p) => !gone!.has(p.id)) } : doc;
}
