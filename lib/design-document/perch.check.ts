// npm run check:perch — the self-check of ./perch.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignDocumentContent, Placement } from "./types";
import { dropOrphanPerches } from "./perch";

// Self-check. Run: npm run check:perch
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
