// npm run check:composition — the self-check of ./composition.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Placement, TableDesign } from "../design-document/types";
import type { Clip } from "../studio/clipboard";
import type { CompositionLine, Product } from "./types";
import { compositionCounts, compositionPrice, fromSelection, fromTableDesign, isTableSet, layoutRecipe } from "./composition";

// ponytail: self-check. Run: npm run check:composition
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const product = (id: string, category: string, layer: Product["layer"], dims: Product["dimensions"], extra: Partial<Product> = {}): Product => ({
  id,
  name: id,
  category,
  layer,
  dimensions: dims,
  categoryFields: {},
  styleTags: [],
  variants: [],
  ...extra,
});
const catalog = new Map<string, Product>([
  ["rect", product("rect", "tables", "floor", { widthMm: 2400, depthMm: 1200, heightMm: 750 }, { categoryFields: { seats: 10 } })],
  ["round", product("round", "tables", "floor", { diameterMm: 1800, heightMm: 750 }, { categoryFields: { seats: 12 } })],
  ["cloth", product("cloth", "tablecloths", "table", { widthMm: 3000, depthMm: 1800, heightMm: 0 }, { variants: [{ id: "cloth-gold", name: "זהב" }] })],
  ["candle", product("candle", "candlesticks", "table", { diameterMm: 200, heightMm: 600 })],
  ["chandelier", product("chandelier", "chandeliers", "ceiling", { diameterMm: 900, heightMm: 800 })],
  ["chair", product("chair", "chairs", "floor", { widthMm: 450, depthMm: 500, heightMm: 900 })],
  ["sofa", product("sofa", "sofas", "floor", { widthMm: 2000, depthMm: 900, heightMm: 800 })],
  ["drape", product("drape", "curtains", "ceiling", { heightMm: 3000 })],
]);
let seq = 0;
const newId = () => `id${++seq}`;
const lookup = (id: string) => catalog.get(id);
const line = (productId: string, quantity: number, variantId?: string): CompositionLine => ({ id: `l-${productId}`, productId, quantity, ...(variantId ? { variantId } : {}) });

// A head table: two rectangles, a cloth each, six candlesticks, a chandelier, 24 chairs.
const head = layoutRecipe([line("rect", 2), line("cloth", 2), line("candle", 6), line("chandelier", 1), line("chair", 24)], lookup, newId);
const hc = head.composition;
assert(hc.tables.length === 2 && hc.groups.length === 1 && hc.tables.every((t) => t.groupId === hc.groups[0].id), "two rectangles are pushed into one block");
assert(Math.abs(hc.tables[1].position.x - hc.tables[0].position.x) === 2400 && hc.tables[0].position.y === 0, "…touching, end to end");
assert(hc.tables[0].position.x === -1200 && hc.tables[1].position.x === 1200, "…centred on the item's middle");
assert(head.widthMm === 4800 && head.depthMm === 1200, `the item measures its tables (${head.widthMm}×${head.depthMm})`);
assert(hc.tables.every((t) => t.seats === 12 && t.chairVariantId === "chair"), "24 chairs are the tables' 12 seats each, of that chair");
const clothOn = (id: string) => hc.placements.filter((p) => p.tableId === id && p.variantId === "cloth-gold");
assert(hc.tables.every((t) => clothOn(t.id).length === 1 && clothOn(t.id)[0].quantity === 1), "a cloth on each table, in the row's first shade");
assert(hc.tables.every((t) => hc.placements.filter((p) => p.tableId === t.id && p.variantId === "candle").length === 3), "six candlesticks, three a table");
const hungItem = hc.placements.find((p) => p.variantId === "chandelier");
assert(!!hungItem && hungItem.layer === "ceiling" && hungItem.over === hc.tables[0].id && hungItem.position.x === hc.tables[0].position.x, "the chandelier hangs over a table's middle, linked to it");
assert(!hc.placements.some((p) => p.variantId === "chair"), "chairs are seats, not floor items");
assert(hc.recipe?.length === 5, "the list is kept, to be edited and laid out again");

// Rounds are not pushed together; the row of floor items stands in front.
const lounge = layoutRecipe([line("round", 2), line("sofa", 2), line("drape", 1)], lookup, newId);
const lc = lounge.composition;
assert(lc.groups.length === 0 && lc.tables.every((t) => !t.groupId), "round tables stay loose");
assert(Math.abs(lc.tables[1].position.x - lc.tables[0].position.x) === 1800 + 1500, "…a walkway apart");
const sofas = lc.placements.filter((p) => p.variantId === "sofa");
assert(sofas.length === 2 && sofas.every((s) => s.position.y > lc.tables[0].position.y + 900), "the sofas stand in a row in front of the tables");
assert(sofas.every((s) => s.rotation === 180), "…turned to face them");
assert(!lc.placements.some((p) => p.variantId === "drape"), "a drape is never a part");
assert(lc.tables.every((t) => t.seats === 12 && !t.chairVariantId), "with no chair line, a table keeps its catalog seats and the studio's chair");

// No table: table items are left out, floor items still stand.
const bare = layoutRecipe([line("candle", 3), line("sofa", 1)], lookup, newId);
assert(bare.composition.placements.length === 1 && bare.composition.placements[0].variantId === "sofa", "a candlestick with no table to stand on is left out");
assert(bare.composition.placements[0].position.x === 0 && bare.composition.placements[0].position.y === 0 && bare.composition.placements[0].rotation === 0, "…and the one sofa is the item's middle, as the catalog draws it");

// Saved off a sketch: centred, what dangles let go.
const clip: Clip = {
  tables: [{ id: "t1", type: "x", number: 4, position: { x: 5000, y: 3000 }, rotation: 0, widthMm: 2000, depthMm: 1000, seated: 8, order: 3, groupId: "g1" }],
  placements: [
    { id: "p1", variantId: "candle", layer: "table", quantity: 1, tableId: "t1", position: { x: 100, y: 0 }, rotation: 0, scale: 1 },
    { id: "p2", variantId: "candle", layer: "table", quantity: 1, tableId: "elsewhere", position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    { id: "p3", variantId: "chandelier", layer: "ceiling", quantity: 1, over: "elsewhere", position: { x: 5500, y: 3000 }, rotation: 0, scale: 1 },
    { id: "p4", variantId: "sofa", layer: "floor", quantity: 1, position: { x: 5000, y: 4500 }, rotation: 0, scale: 1 },
    { id: "p5", variantId: "cloth", layer: "table", quantity: 1, tableId: "t1", position: { x: 0, y: 0 }, rotation: 0, scale: 1, border: { widthMm: 40, colour: "#c9a24a" } },
    { id: "p6", variantId: "rug", layer: "floor", quantity: 1, position: { x: 5000, y: 3000 }, rotation: 0, scale: 1, border: null },
  ],
  groups: [{ id: "g1", number: 4 }, { id: "unused" }],
};
const saved = fromSelection(clip, { minX: 4000, minY: 2500, maxX: 6000, maxY: 5000 });
assert(saved.tables[0].position.x === 0 && saved.tables[0].position.y === -750, "the table is moved to the item's frame");
assert(saved.tables[0].seated === undefined && saved.tables[0].order === undefined, "who sat there and the old stack stay behind");
assert(saved.placements.some((p) => p.id === "p1" && p.position.x === 100), "a table item keeps its place on its table");
assert(!saved.placements.some((p) => p.id === "p2"), "an item on a table left behind is let go");
const freed = saved.placements.find((p) => p.id === "p3");
assert(!!freed && freed.over === undefined && freed.position.x === 500, "a pendant over a table left behind hangs free, moved with the rest");
assert(saved.placements.find((p) => p.id === "p4")!.position.y === 750, "a floor item moves with the origin");
assert(saved.groups.length === 1 && saved.groups[0].id === "g1", "only the groups something still belongs to");
// A contour on this plan (Placement.border, lib/catalog/border.ts) is part of what the item looks
// like, so it goes into the item — a hemmed cloth stays hemmed, a rug with none here stays without.
assert(saved.placements.find((p) => p.id === "p5")?.border?.colour === "#c9a24a" && saved.placements.find((p) => p.id === "p6")?.border === null, "a contour, and none, are kept");

const counted = compositionCounts(hc);
assert(counted.lines[0].table && counted.lines[0].quantity === 2 && counted.seats === 24, "counted: two tables first, 24 seats");
assert(counted.lines.find((l) => l.variantId === "candle")?.quantity === 6, "…and six candlesticks");
const prices = new Map([["rect", 400], ["cloth-gold", 150], ["candle", 30], ["chandelier", 900], ["chair", 20]]);
const priced = compositionPrice(hc, (id) => (prices.has(id) ? { price: prices.get(id), perUnit: true } : undefined));
assert(!priced.partial && priced.total === 2 * 400 + 24 * 20 + 2 * 150 + 6 * 30 + 900, `the parts add up, chairs included (${priced.total})`);
assert(compositionPrice(lc, (id) => (prices.has(id) ? { price: prices.get(id), perUnit: true } : undefined)).partial, "a part with no price makes the sum partial");
// A set of what stands on a table, without it, is a TABLE SET — laid onto a table, not the floor.
const chip = (id: string, layer: Placement["layer"]): Placement => ({ id, variantId: id, layer, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 });
assert(isTableSet({ tables: [], placements: [chip("vase", "table"), chip("candle", "table")], groups: [] }), "a centrepiece and its candlesticks are a table set");
assert(isTableSet({ tables: [], placements: [chip("vase", "table"), chip("pendant", "ceiling")], groups: [] }), "…with what hangs over them");
assert(!isTableSet({ tables: [], placements: [chip("sofa", "floor"), chip("vase", "table")], groups: [] }), "a set with a sofa in it stands on the floor");
assert(!isTableSet({ tables: [], placements: [chip("pendant", "ceiling")], groups: [] }), "nothing on a table, no table set");

// A saved design from before the merge becomes the table set it always was.
const legacy: TableDesign = {
  id: "d1",
  name: "גולד רומנטי",
  arranged: true,
  frame: { widthMm: 2400, depthMm: 1200 },
  items: [
    { variantId: "cloth-gold", quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 },
    { variantId: "candle", quantity: 3, position: { x: -600, y: 0 }, rotation: 0, scale: 1.2, mirrored: true, vessel: null },
  ],
};
const adopted = fromTableDesign(legacy, (i) => `d1-${i}`);
assert(isTableSet(adopted), "a saved design is a table set");
assert(adopted.frame?.widthMm === 2400 && adopted.arranged === true, "…keeping the table it was dressed on, and that it was arranged");
const c3 = adopted.placements[1];
assert(c3.id === "d1-1" && c3.quantity === 3 && c3.position.x === -600 && c3.scale === 1.2 && c3.mirrored === true && c3.vessel === null, "…each item as it was saved");
const older = fromTableDesign({ ...legacy, frame: undefined, arranged: undefined }, (i) => `x${i}`);
assert(!older.frame && !older.arranged, "a design saved before frames is a set of pieces, worn about the middle as before");
console.log("composition: ok");
