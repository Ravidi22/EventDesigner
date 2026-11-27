// npm run check:sketches — the self-check of ./sketches.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignDocumentContent, Placement } from "@/lib/design-document/types";
import { adoptSketch, ALL_SKETCH_LAYERS, takeLayers, type SketchLayer } from "./sketches";

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
// Rails: a drape on the other room's wall rail or feature stays behind; one on this sketch's own
// stage, or on a rod, comes along.
const railed = adoptSketch(
  {
    ...base(),
    placements: [
      { id: "stg", variantId: "s", layer: "floor", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
      { id: "on-wall", variantId: "d", layer: "ceiling", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, rail: { type: "wall", wallId: "w", from: 0, to: 1 } },
      { id: "on-bar", variantId: "d", layer: "ceiling", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, rail: { type: "side", featureId: "venue-bar", side: 0, from: 0, to: 1, out: 1 } },
      { id: "on-stage", variantId: "d", layer: "ceiling", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, rail: { type: "side", featureId: "stg", side: 0, from: 0, to: 1, out: 1 } },
      { id: "on-rod", variantId: "d", layer: "ceiling", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, rail: { type: "rod", points: [{ x: 0, y: 0 }, { x: 3000, y: 0 }], heightMm: 2400 } },
    ],
  },
  false,
);
assert(railed.placements.map((p) => p.id).join(",") === "stg,on-stage,on-rod", "in another room a drape on its wall or its feature is left behind — one on the sketch's own stage or a rod comes along");
// Covers (lib/studio/cover.ts): a carpet over the other room's lawn comes along let go, its shape
// kept; one over the sketch's own stage stays laid over it.
const sq = [{ x: -500, y: -500 }, { x: 500, y: -500 }, { x: 500, y: 500 }, { x: -500, y: 500 }];
const carried = adoptSketch(
  {
    ...base(),
    placements: [
      { id: "on-lawn", variantId: "v", layer: "floor", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, cover: { featureId: "lawn" }, outline: sq },
      { id: "on-own", variantId: "v", layer: "floor", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1, cover: { stageId: "stg" }, outline: sq },
    ],
  },
  false,
);
assert(!carried.placements[0].cover && carried.placements[0].outline === sq && carried.placements[1].cover?.stageId === "stg", "in another room a carpet over its lawn is let go, shape kept; one over the sketch's own stage stays laid");

// ── takeLayers ──
const at = { x: 0, y: 0 };
const put = (id: string, variantId: string, extra: Partial<Placement> = {}): Placement => ({
  id, variantId, layer: "floor", quantity: 1, position: at, rotation: 0, scale: 1, ...extra,
});
const CAT: Record<string, string> = { rug: "rugs", bar: "bars", chuppah: "chuppahs", cp: "centerpieces", ch: "chandeliers", stg: "stages", bench: "stage-benches" };
const cat = (v: string) => CAT[v];
const room = (): DesignDocumentContent => ({
  calibration: { mmPerUnit: 1 },
  tables: [
    { id: "t1", type: "עגול", number: 1, position: at, rotation: 0, diameterMm: 1800, groupId: "g" },
    { id: "t2", type: "עגול", number: 2, position: at, rotation: 0, diameterMm: 1800 },
  ],
  groups: [{ id: "g" }, { id: "g2" }],
  placements: [
    put("rug", "rug"),
    put("bar", "bar"),
    put("chuppah", "chuppah"),
    put("cp", "cp", { layer: "table", tableId: "t1" }),
    put("ch", "ch", { layer: "ceiling", over: "t2", groupId: "g" }),
    put("stage", "stg", { stage: {} as never }),
    put("loose-bench", "bench"),
    put("perched", "cp", { perch: { stageId: "stage", itemId: "b" } }),
    put("drape", "x", { layer: "ceiling", span: { wallId: "w", from: 0, to: 1 }, groupId: "g2" }),
  ],
  exceptions: [{ tableId: "t1", variantId: "cp" }],
  features: [{ featureId: "f", dx: 1, dy: 0 }],
});
const ids = (d: DesignDocumentContent) => d.placements.map((p) => p.id).sort().join(",");
const only = (l: SketchLayer) => takeLayers(room(), { tables: false, stages: false, design: false, ceiling: false, [l]: true }, cat);

const whole = takeLayers(room(), ALL_SKETCH_LAYERS, cat);
assert(ids(whole) === ids(room()) && whole.tables.length === 2, "all four boxes give back the whole sketch");
assert(whole.features?.length === 1 && whole.exceptions?.length === 1, "…features and exceptions included");

assert(only("tables").tables.length === 2 && ids(only("tables")) === "bar,rug", "tables: the tables, the bar and the rug");
assert(only("tables").features?.length === 1, "…and the moves of the venue's own furniture");
assert(ids(only("stages")) === "loose-bench,stage" && only("stages").tables.length === 0, "stages: the stage and loose stage pieces");
assert(ids(only("design")) === "chuppah", "design alone: the floor design — the table item has no table, the perched item no stage");
assert(ids(only("ceiling")) === "ch,drape", "ceiling: everything overhead, drapes included");
assert(only("ceiling").placements.find((p) => p.id === "ch")?.over === undefined, "…a chandelier whose table stayed behind keeps hanging, unlinked");
assert(!only("design").exceptions && !only("tables").exceptions, "exceptions need the tables AND the design");

const usual = takeLayers(room(), { tables: true, stages: true, design: false, ceiling: false }, cat);
assert(ids(usual) === "bar,loose-bench,rug,stage", "the designer's usual: the hall and the stages, nothing designed");
assert(!usual.groups?.length && usual.tables.every((t) => !t.groupId), "a group left with one member is dropped and its id cleared");
const dressed = takeLayers(room(), { tables: true, stages: true, design: true, ceiling: false }, cat);
assert(ids(dressed).includes("cp") && ids(dressed).includes("perched"), "with tables and stages, what stands on them comes too");
console.log("sketches self-check passed");
