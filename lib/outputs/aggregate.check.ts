// npm run check:aggregate — the self-check of ./aggregate.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { packingList, placementLegend, UNTYPED_CHAIRS, type ItemLookup } from "./aggregate";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const doc: DesignDocumentContent = {
  calibration: { mmPerUnit: 1 },
  tables: [
    { id: "t1", type: "עגול", number: 1, position: { x: 0, y: 0 }, rotation: 0 },
    { id: "t2", type: "עגול", number: 2, position: { x: 0, y: 0 }, rotation: 0 },
    { id: "t3", type: "עגול", number: 3, position: { x: 0, y: 0 }, rotation: 0 },
  ],
  placements: [
    { id: "p1", variantId: "cloth", layer: "table", quantity: 1, tableId: "t1", position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    { id: "p2", variantId: "cloth", layer: "table", quantity: 1, tableId: "t2", position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    { id: "p3", variantId: "chand", layer: "ceiling", quantity: 2, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    { id: "p4", variantId: "flora", layer: "table", quantity: 20, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
  ],
};
const lookup: ItemLookup = (id) =>
  id === "cloth"
    ? { productName: "מפה", variantLabel: "מפה · זהב", categoryId: "cloths", categoryLabel: "מפות", categoryOrder: 0 }
    : id === "flora"
      ? {
          productName: "סידור נמוך",
          variantLabel: "סידור נמוך",
          categoryId: "flora",
          categoryLabel: "סידורי פרחים",
          categoryOrder: 2,
          armsMultiplier: { label: "גבעולים", count: 17 },
          components: [{ label: "ורד", count: 12 }, { label: "פיאוני", count: 5 }],
        }
      : { productName: "שנדליר", variantLabel: "שנדליר", categoryId: "chand", categoryLabel: "שנדליירים", categoryOrder: 1, armsMultiplier: { label: "נרות", count: 5 } };

const pl = packingList(doc, lookup);
assert(pl.length === 3, "three category groups");
assert(pl[0].rows[0].quantity === 2, "cloth counted across two tables");
assert(pl[1].rows[0].derived?.quantity === 10, "candles = 5 arms × 2 fixtures");
assert(pl[1].rows[0].breakdown === undefined, "a multiplier with no components has no breakdown");
const flora = pl[2].rows[0];
assert(flora.derived?.quantity === 340, "stems = 17 × 20 arrangements");
assert(flora.breakdown?.length === 2 && flora.breakdown[0].quantity === 240 && flora.breakdown[1].quantity === 100, "…and per flower: 12×20 roses, 5×20 peonies");

// Chairs round the tables, by the chair each table names, else the default.
const seated: DesignDocumentContent = {
  ...doc,
  tables: [
    { ...doc.tables[0], seats: 10 },
    { ...doc.tables[1], seats: 10, chairVariantId: "arm" },
    { ...doc.tables[2], seats: 8 },
  ],
};
const chairLookup: ItemLookup = (id) =>
  id === "napoleon" || id === "arm"
    ? { productName: id, variantLabel: id, categoryId: "chairs", categoryLabel: "כיסאות", categoryOrder: 3 }
    : lookup(id);
const chairs = packingList(seated, chairLookup, undefined, (t) => t.chairVariantId ?? "napoleon").find((g) => g.categoryId === "chairs")!;
assert(chairs.rows.find((r) => r.variantId === "napoleon")?.quantity === 18 && chairs.rows.find((r) => r.variantId === "arm")?.quantity === 10, "every table's seats are packed as its chair");
const none = packingList(seated, lookup, undefined, () => undefined);
assert(none[0].categoryId === UNTYPED_CHAIRS && none[0].rows[0].quantity === 28, "with no chair in the catalog the chairs are still counted");
assert(packingList(seated, lookup).every((g) => g.categoryId !== UNTYPED_CHAIRS), "without chairOf nothing changes (the quote's path)");

const legend = placementLegend(doc, (id) => lookup(id)?.productName);
const withCloth = legend.find((e) => e.items.length > 0)!;
assert(withCloth.tableNumbers.join(",") === "1,2", "tables 1 & 2 grouped by same item");
assert(legend.some((e) => e.items.length === 0 && e.tableNumbers.includes(3)), "empty table 3 in its own group");

// A block of pushed-together tables is ONE line on the crew's list, under the one number they
// share, carrying what the whole block wears.
const blocked = placementLegend(
  {
    calibration: { mmPerUnit: 1 },
    tables: [
      { id: "t1", type: "מלבן", number: 1, position: { x: 0, y: 0 }, rotation: 0, groupId: "g" },
      { id: "t2", type: "מלבן", number: 2, position: { x: 0, y: 0 }, rotation: 0, groupId: "g" },
    ],
    placements: [
      { id: "p1", variantId: "cloth", layer: "table", quantity: 1, tableId: "t1", position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
      { id: "p2", variantId: "cloth", layer: "table", quantity: 2, tableId: "t2", position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    ],
    groups: [{ id: "g", number: 1 }],
  },
  (v) => (v === "cloth" ? "מפה" : undefined),
);
assert(blocked.length === 1 && blocked[0].tableNumbers.join(",") === "1", "a group is one numbered unit on the legend");
assert(blocked[0].items.join("|") === "מפה ×3", "…carrying what the whole block wears");
console.log("aggregate self-check passed");
