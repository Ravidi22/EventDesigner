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
import { isMain } from "../self-check";

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

// Self-check. Run: npm run check:perch
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const outline = [
    { x: -3000, y: -1500 },
    { x: 3000, y: -1500 },
    { x: 3000, y: 1500 },
    { x: -3000, y: 1500 },
  ];
  const stageWith = (stairs: NonNullable<Placement["stage"]>["stairs"]): Placement => ({
    id: "S",
    variantId: "deck",
    layer: "floor",
    quantity: 1,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: 1,
    stage: { outline, front: 0, heightMm: 400, stairs } as unknown as NonNullable<Placement["stage"]>,
  });
  const candle: Placement = { id: "c", variantId: "cand", layer: "table", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, perch: { stageId: "S", itemId: "b1" } };
  const docOf = (stage: Placement, extra: Placement[] = [candle]): DesignDocumentContent =>
    ({ tables: [], placements: [stage, ...extra], groups: [] }) as unknown as DesignDocumentContent;

  const bench = { id: "b1", edge: 2, t: 0.5, widthMm: 2400, kind: "bench" as const };
  const kept = docOf(stageWith([bench]));
  assert(dropOrphanPerches(kept) === kept, "a candle on a banquette that is still there stays, and the doc is returned as it was");
  const cut = dropOrphanPerches(docOf(stageWith([])));
  assert(!cut.placements.some((p) => p.id === "c") && cut.placements.some((p) => p.id === "S"), "the banquette gone from the stage → the candle goes, the stage stays");
  const turned = dropOrphanPerches(docOf(stageWith([{ ...bench, kind: "stairs" }])));
  assert(!turned.placements.some((p) => p.id === "c"), "the banquette turned into stairs → the candle goes");
  const loose = docOf(stageWith([]), []);
  assert(dropOrphanPerches(loose) === loose, "nothing perched → the same doc");
  const noStage = { tables: [], placements: [candle], groups: [] } as unknown as DesignDocumentContent;
  assert(dropOrphanPerches(noStage) === noStage, "a perch whose stage is gone is left to the reducer");
  console.log("perch: ok");
}
