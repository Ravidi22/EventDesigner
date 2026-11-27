// npm run check:add-tools — the self-check of ./add-tools.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Product } from "@/lib/catalog/types";
import { PLANT_SPECIES, SURFACE_MATERIALS } from "./structure";
import { POOL_PRESETS } from "./pool";
import { BILLIARD_TABLE } from "@/lib/catalog/game-tables";
import { STANDARD_TABLES } from "@/lib/catalog/standard/items";
import { ADD_TOOL_SECTION_LABEL, ADD_TOOL_SECTIONS, addTools, catalogTools, DRAW_SURFACE_ID, findAddTool, railSections } from "./add-tools";

// ponytail: self-check. Run: npm run check:add-tools
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const product = (id: string, name: string, category: string, archived = false): Product => ({
  id,
  name,
  category,
  layer: "floor",
  dimensions: { widthMm: 3600, depthMm: 1800, heightMm: 1100 },
  categoryFields: {},
  styleTags: [],
  variants: [],
  ...(archived ? { archived } : {}),
});

// An empty catalog is the studio that predates the base library. Every kind is still placeable.
const empty = addTools([]);
assert(empty.length === 18 + STANDARD_TABLES.length + POOL_PRESETS.length + PLANT_SPECIES.length + SURFACE_MATERIALS.length, "an empty catalog offers the seventeen plain things — door, window, curtain, a curtain on a rod, an LED strip on a wall or a side, a free one, an LED screen, stairs, ramp, fountain, structure, column, pergola, other, bar, stage, chairs in rows — the billiard table, a pool in each of its shapes, and the planting");
const billiard = empty.find((t) => t.section === "lounge");
assert(!!billiard && billiard.kind === "item" && billiard.product === BILLIARD_TABLE, "the standard billiard table is offered to every business, as the venue's own item");
assert(findAddTool(empty, "led")?.kind === "led" && findAddTool(empty, "led-run")?.kind === "led" && findAddTool(empty, "screen")?.kind === "screen", "the venue's LED strip (on a wall or a side, or drawn free) and its screen");
assert(findAddTool(empty, "pergola")?.kind === "pergola" && findAddTool(empty, "pergola")?.section === "structure", "a pergola is a structure of its own kind, with no row behind it");
const pools = empty.filter((t) => t.section === "pool");
assert(pools.map((t) => t.pool).join() === "rect,ellipse,kidney,L,free" && pools.every((t) => t.kind === "pool"), "the pools come shape first: מלבן · אליפסה · כליה · ר · חופשי");
assert(findAddTool(empty, "pool")?.pool === "ellipse", "…the oval keeping the one pool tool's id");
assert(empty.find((t) => t.kind === "seating")?.chair === undefined, "…the rows of a dining chair when there is no chair to take");
assert(empty.filter((t) => t.product && t.product !== BILLIARD_TABLE && t.kind !== "table").length === 0, "…none of them backed by a row that isn't there");
const stdTables = empty.filter((t) => t.section === "tables");
assert(stdTables.length === STANDARD_TABLES.length && stdTables.every((t) => t.kind === "table" && t.product?.category === "tables"), "with no tables of its own, a business lays out the base library's standard tables");
for (const kind of ["bar", "stage"] as const) {
  const t = empty.find((x) => x.id === kind)!;
  assert(!!t && t.kind === kind, `${kind} falls back to the plain kind rather than to an empty section`);
}

const tools = addTools([
  product("c1", "נברשת קריסטל", "chandeliers"),
  product("b2", "בר ישר 200×60", "bars"),
  product("b1", "בר בצורת ח 360×180", "bars"),
  product("b3", "בר ישן", "bars", true),
  product("s1", "במה 400×300", "stages"),
  product("r1", "רמפת נגישות", "stage-ramps"),
  product("t1", "עגול 180", "tables"),
  product("pg1", "פרגולה 4×4", "pergolas"),
]);
assert(findAddTool(tools, "product:pg1")?.kind === "pergola" && findAddTool(tools, "product:pg1")?.section === "structure" && !!findAddTool(tools, "pergola"), "a pergola row lands as the venue's pergola, beside the plain one");
const bars = tools.filter((t) => t.section === "bars");
assert(bars.length === 2, "a department with rows offers the rows, not the plain kind");
assert(bars.every((t) => t.kind === "bar"), "…and every one of them still lands as a bar on the plan");
assert(bars[0].label === "בר בצורת ח 360×180", "…in the order a Hebrew reader would look for them");
assert(!tools.some((t) => t.product?.id === "b3"), "an archived row is off the list (F-4.5)");
assert(findAddTool(tools, "table:t1")?.kind === "table" && findAddTool(tools, "table:t1")?.section === "tables", "the studio's own table is a table of the venue's layout");
assert(tools.filter((t) => t.section === "tables").length === 1, "…in place of the standard ones, when it has tables of its own");
assert(tools.filter((t) => t.section === "stages").length === 2, "the stage department is catalog-backed too");
assert(findAddTool(tools, "product:r1")?.kind === "ramp" && findAddTool(tools, "product:s1")?.kind === "stage", "…and a ramp in it lands as the venue's ramp, a stage as a stage");
assert(new Set(tools.map((t) => t.id)).size === tools.length, "ids are unique — a drag has to name exactly one tool");
const fromCatalog = catalogTools(tools);
assert(fromCatalog.length === 1 && fromCatalog[0].kind === "item" && fromCatalog[0].id === "item:c1", "the catalog tab holds the chandelier as an item — not the bars, the stage, the table or the pergola");
assert(!railSections(tools).some((r) => r.tools.some((t) => t.section === "catalog")), "…and the build tab never shows it"); 

assert(findAddTool(tools, "product:b1")?.product?.id === "b1", "a drag payload finds its row");
assert(findAddTool(tools, "entrance")?.kind === null, "the door is a tool with no feature kind");
assert(findAddTool(tools, "window")?.kind === null, "…and so is the window: hung on a wall, not placed");
assert(findAddTool(tools, "fountain")?.kind === "fountain", "a fountain is a feature of its own kind");
assert(findAddTool(tools, "curtain")?.kind === "curtain", "…and so is the venue's curtain");
assert(findAddTool(tools, "product:gone") === undefined, "an id from another list is a no-op, not a guess");
assert(findAddTool(tools, null) === undefined, "…and so is no id at all");

// The halls rail: one grid per section, in the sections' order, every tool exactly once.
const rail = railSections(empty);
const expected = ADD_TOOL_SECTIONS.filter((s) => empty.some((t) => t.section === s));
assert(rail.map((r) => r.section).join() === expected.join(), "the rail's sections come in ADD_TOOL_SECTIONS order, the empty ones dropped");
assert(rail.every((r) => r.tools.length > 0), "…and none of them is empty");
assert(rail.reduce((n, r) => n + r.tools.length, 0) === empty.length, "…and every tool is in exactly one");
assert(rail.every((r) => r.label === ADD_TOOL_SECTION_LABEL[r.section]), "…each under its own label");
assert(DRAW_SURFACE_ID === "surface:draw", "the free-drawn surface keeps its old id");

console.log(`add tools: ${tools.length} ok`);
