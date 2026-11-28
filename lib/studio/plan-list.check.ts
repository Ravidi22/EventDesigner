// npm run check:plan-list — the self-check of ./plan-list.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignDocumentContent as DesignDocument, Placement } from "../design-document/types";
import { listCrumb, planListRows, type PlanListOptions } from "./plan-list";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error(`plan-list: ${m}`);
};
const table = (id: string, extra: Partial<DesignDocument["tables"][number]> = {}): DesignDocument["tables"][number] => ({
  id,
  type: "עגול 180",
  number: Number(id.replace(/\D/g, "")) || 1,
  position: { x: 0, y: 0 },
  rotation: 0,
  diameterMm: 1800,
  seats: 10,
  variantId: "v-round",
  ...extra,
});
const placement = (id: string, variantId: string, layer: Placement["layer"], extra: Partial<Placement> = {}): Placement => ({
  id,
  variantId,
  layer,
  quantity: 1,
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: 1,
  ...extra,
});
const doc: DesignDocument = {
  calibration: { mmPerUnit: 1 },
  tables: [
    table("t1"),
    table("t2"),
    table("t3"),
    table("b1", { type: "מלבן", variantId: "v-rect", groupId: "g", number: 4, seats: 8 }),
    table("b2", { type: "מלבן", variantId: "v-rect", groupId: "g", number: 5, seats: 8 }),
  ],
  groups: [{ id: "g", number: 4 }],
  placements: [
    placement("c1", "v-candle", "table", { tableId: "t1" }),
    placement("c2", "v-candle", "table", { tableId: "t2" }),
    placement("d1", "v-vase", "table", { tableId: "t3" }),
    placement("r1", "v-rug", "floor", { quantity: 3 }),
    placement("s1", "v-deck", "floor", {
      stage: {
        outline: [
          { x: -3000, y: -2000 },
          { x: 3000, y: -2000 },
          { x: 3000, y: 2000 },
          { x: -3000, y: 2000 },
        ],
        front: 2,
        decks: [],
      },
    }),
    placement("x1", "v-gone", "ceiling"),
  ],
};
const names: Record<string, string> = { "v-round": "שולחן עגול", "v-rect": "שולחן מלבני", "v-candle": "פמוט", "v-vase": "אגרטל", "v-rug": "שטיח", "v-deck": "פלטה" };
const resolve: PlanListOptions["resolve"] = (v) => (names[v] ? { product: { id: "p-" + v, name: names[v] }, swatch: "#fff" } : undefined);
const rows = planListRows(doc, { resolve });

assert(rows.tables.length === 2, "three lone tables of one variant and one block are two rows");
assert(rows.tables[0].label === "שולחן עגול" && rows.tables[0].count === 3, "the lone tables are one row named by the product, counted");
assert(rows.tables[0].meta === "30 מושבים", "…with their seats summed");
assert(rows.tables[1].refs.length === 2 && rows.tables[1].meta === "2 שולחנות", "the block is one row holding both members");
assert(rows.tables[1].label === "שולחן 4", "…named as the plan names it");

assert(rows.table.length === 2, "candlesticks of one product and a vase are two rows on the table plane");
assert(rows.table[0].count === 2 && rows.table[1].count === 1, "…counted per product");
assert(rows.table[0].meta === undefined, "…and a count equal to the quantity needs no meta");

const rug = rows.floor.find((r) => r.label === "שטיח");
assert(rug?.count === 1 && rug.meta === "×3", "a rug of quantity 3 says so");
const stage = rows.floor.find((r) => r.label === "במה");
assert(!!stage && stage.meta!.includes("6") && stage.meta!.includes("4"), "a stage is a row of its own with its size in metres");
assert(stage!.meta === "6 × 4 מ׳", "…6 × 4");
assert(Object.values(rows).every((plane) => plane.every((r) => r.refs.every((ref) => ref.kind !== "feature"))), "nothing of the venue's own is listed — only what the event put on the plan");
assert(rows.ceiling.length === 1 && rows.ceiling[0].label === "פריט", "a variant that does not resolve is an 'פריט'");

// A table's CLOTH is its surface and is never selected on its own (the canvas has no way to): its
// row selects the tables wearing it. The row stays — it says which cloth and how many.
const clothed: DesignDocument = {
  ...doc,
  placements: [...doc.placements, placement("k1", "v-cloth", "table", { tableId: "t1" }), placement("k2", "v-cloth", "table", { tableId: "b2" })],
};
const withAnchor: PlanListOptions["resolve"] = (v) => (v === "v-cloth" ? { product: { id: "p-cloth", name: "מפה" }, anchor: "table" } : resolve(v));
const clothRows = planListRows(clothed, { resolve: withAnchor });
const clothRow = clothRows.table.find((r) => r.label === "מפה");
assert(clothRow?.count === 2, "a cloth is a row on the table plane, counted");
assert(
  !!clothRow && clothRow.refs.length === 2 && clothRow.refs.every((r) => r.kind === "table") && clothRow.refs.map((r) => r.id).join() === "t1,b2",
  "…and its refs are the TABLES wearing it, never the cloths",
);
assert(!!clothRows.table.find((r) => r.label === "פמוט")?.refs.every((r) => r.kind === "placement"), "an item ON a table is still selected itself");

assert(listCrumb(rows, [{ kind: "placement", id: "c2" }]) === "עיצוב שולחן › פמוט", "the crumb names the plane and the row");
assert(listCrumb(rows, [{ kind: "table", id: "b2" }]) === "שולחנות › שולחן 4", "…a block member finds its block");
assert(listCrumb(rows, [{ kind: "placement", id: "nope" }]) === undefined, "…and a thing the list lacks has none");
assert(listCrumb(rows, []) === undefined, "…nor does an empty selection");

// A table with no catalog row is named by its type, and two types are two rows.
const bare = planListRows({ calibration: { mmPerUnit: 1 }, tables: [table("a", { variantId: undefined }), table("b", { variantId: undefined, type: "מלבן" })], placements: [] }, { resolve });
assert(bare.tables.length === 2 && bare.tables[0].label === "עגול 180", "an uncatalogued table is named by its type word");
console.log("plan-list: ok");
