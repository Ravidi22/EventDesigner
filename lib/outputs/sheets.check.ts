// npm run check:sheets — the self-check of ./sheets.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignDocumentContent } from "../design-document/types";
import { PLAN_SHEETS, sheetById, sheetHasContent } from "./sheets";

// ponytail: self-check. Run: npm run check:sheets
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
assert(new Set(PLAN_SHEETS.map((s) => s.id)).size === PLAN_SHEETS.length, "sheet ids are unique");
assert(PLAN_SHEETS.every((s) => s.label.trim().length > 0), "every sheet is named on screen");
assert(sheetById("ceiling")!.tables === "ghost", "the ceiling plan ghosts the tables, so a rigger knows what is underneath");
assert(!!sheetById("ceiling")!.measure?.hangs && PLAN_SHEETS.filter((s) => s.measure?.hangs).length === 1, "only the ceiling plan carries the hang points' ties and heights");
assert(sheetById("hall")!.layers.includes("floor"), "the hall plan carries the furniture standing on the floor");
assert(!!sheetById("dims")!.measure?.gaps, "the dimension plan carries the gaps");
assert(sheetById("design")!.layers.includes("table"), "the design sheet carries what is ON the tables");
assert(sheetById("gone") === undefined, "an unknown id is undefined, not a throw");
const cat = (id: string) => (id === "rug" ? { category: "rugs", group: "grp-accessories" } : { category: "chandeliers", group: "grp-ceiling-design" });
const bare = { calibration: { mmPerUnit: 1 }, tables: [], placements: [] } as unknown as DesignDocumentContent;
const withRug = { ...bare, placements: [{ id: "r", layer: "floor", variantId: "rug" }] } as unknown as DesignDocumentContent;
assert(sheetHasContent(sheetById("hall")!, bare, cat), "the hall plan always has the room");
assert(!sheetHasContent(sheetById("rugs")!, bare, cat) && sheetHasContent(sheetById("rugs")!, withRug, cat), "the rug plan has content only when a rug is placed");
assert(!sheetHasContent(sheetById("ceiling")!, withRug, cat), "a rug does not make a ceiling plan");
assert(sheetById("design")!.numbers === false, "the design sheet carries no table numbers");
assert(sheetById("chairs")!.numbers && !!sheetById("chairs")!.chairCounts, "the chairs sheet numbers its tables and counts their chairs");
assert(PLAN_SHEETS.filter((s) => s.chairCounts).length === 1, "only the chairs sheet counts chairs at the table");
assert(!sheetById("ceiling")!.numbers, "the ceiling plan's ghosted tables stay unnumbered");
console.log("sheets self-check passed");
