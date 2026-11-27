// npm run check:quote-sections — the self-check of ./quote-sections.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { DesignDocumentContent, DesignTable } from "@/lib/design-document/types";
import { type MeasureContext } from "@/lib/design-document/measure";
import type { QuoteLookup } from "./quote";
import { quoteSections, tableShapeWords } from "./quote-sections";

// ponytail: self-check. Run: npm run check:quote-sections
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const t = (id: string, number: number, extra: Partial<DesignTable> = {}) =>
  ({ id, type: "שולחן עגול 244", number, position: { x: 0, y: 0 }, rotation: 0, seats: 10, variantId: "tbl-round", ...extra }) as DesignTable;
const on = (id: string, tableId: string, variantId: string, quantity = 1) =>
  ({ id, layer: "table" as const, tableId, variantId, quantity, position: { x: 0, y: 0 }, rotation: 0, scale: 1 });
const free = (id: string, layer: "floor" | "ceiling", variantId: string, quantity = 1) =>
  ({ id, layer, variantId, quantity, position: { x: 0, y: 0 }, rotation: 0, scale: 1 });

const info: Record<string, { cat: string; price?: number }> = {
  "tbl-round": { cat: "tables", price: 100 },
  "tbl-rect": { cat: "tables", price: 120 },
  lamp: { cat: "centerpieces", price: 300 },
  roses: { cat: "flower-arrangements", price: 80 },
  bar: { cat: "bars", price: 5000 },
  curtain: { cat: "curtains", price: 50 },
  led: { cat: "led-strips", price: 40 },
  chandelier: { cat: "chandeliers" },
  venezia: { cat: "chairs", price: 15 },
  macao: { cat: "chairs", price: 25 },
  arch: { cat: "arches", price: 4000 },
  deck: { cat: "stage-decks", price: 1500 },
};
const lookup: QuoteLookup = (id) =>
  info[id] ? { label: id, productId: `p-${id}`, categoryId: info[id].cat, categoryLabel: info[id].cat, categoryOrder: 0, unitPrice: info[id].price } : undefined;

assert(tableShapeWords("שולחן מלבן 240×120")[1] === "מלבניים", "size and the word שולחן come off");
assert(tableShapeWords("שולחן מעוגל צד")[1] === "מעוגלי צד", "a two-word shape");
assert(tableShapeWords("round")[1] === "עגולים", "the built-in types");
assert(tableShapeWords("שולחן בננה 300")[1] === "בננה", "an unknown shape is kept, size removed");

const doc: DesignDocumentContent = {
  calibration: { mmPerUnit: 1 },
  tables: [
    t("r1", 1), t("r2", 2), t("r3", 3),
    t("s1", 4, { type: "שולחן מלבן 240×120", variantId: "tbl-rect", chairVariantId: "macao" }),
    t("s2", 5, { type: "שולחן מלבן 480×120", variantId: "tbl-rect", chairVariantId: "macao" }),
    t("k1", 6, { type: "rectangle", groupId: "g" }), t("k2", 7, { type: "rectangle", groupId: "g" }),
    t("bare", 8, { seats: 12 }),
  ],
  groups: [{ id: "g" }],
  placements: [
    on("a", "r1", "lamp"), on("b", "r2", "lamp"), on("c", "r3", "lamp"),
    on("d", "s1", "roses", 4), on("e", "s2", "roses", 4),
    on("f", "k1", "lamp"),
    free("g1", "floor", "bar"), free("g2", "ceiling", "curtain", 2), free("g3", "ceiling", "chandelier", 6),
    free("g4", "ceiling", "led"),
  ],
};
const sections = quoteSections(doc, { lookup, chairOf: (tb) => tb.chairVariantId ?? "venezia" });
const by = (k: string) => sections.find((s) => s.key === k);

const rounds = by("kit:r1")!;
assert(rounds.title === "עיצוב 3 שולחנות עגולים", `round kit titled: ${rounds.title}`);
assert(rounds.perTable === true && rounds.lines[0].perUnit === 1, "one lamp per round table");
assert(!rounds.lines.some((l) => l.variantId === "tbl-round"), "the tables themselves are not in the quote");
assert(rounds.seating?.join() === "venezia", "the kit names its chairs");
const rects = by("kit:s1")!;
assert(rects.title === "עיצוב 2 שולחנות מלבניים", `a 240 and a 480 are both rectangles: ${rects.title}`);
assert(rects.lines[0].perUnit === 4, "four rose tumblers per table");
assert(sections.some((s) => s.title === "עיצוב שולחן אביר"), "a block of tables reads as an אביר table");
assert(!sections.some((s) => s.lines.some((l) => l.variantId.startsWith("tbl-"))), "no table furniture anywhere");
assert(by("floor")!.lines.some((l) => l.variantId === "curtain"), "a curtain belongs to the room, not the ceiling");
assert(by("floor")!.lines.some((l) => l.variantId === "led") && !by("ceiling")!.lines.some((l) => l.variantId === "led"), "an LED strip is the room's too, beside its curtains");
assert(by("ceiling")!.lines[0].quantity === 6 && !by("ceiling")!.lines[0].priced, "six unpriced chandeliers, flagged");

const chairs = by("chairs")!;
assert(sections[sections.length - 1] === chairs, "chairs close the spec");
assert(chairs.lines.length === 2, `one line per KIND of chair: ${chairs.lines.map((l) => l.variantId)}`);
assert(chairs.lines.find((l) => l.variantId === "venezia")?.quantity === 62, "rounds + block + the bare table, summed");
assert(chairs.lines.find((l) => l.variantId === "macao")?.quantity === 20, "the rectangles' chairs");

// A stage is one line, priced as what it is built from. (No deckOf here, so it counts as its own
// row — the decks-and-stairs breakdown is measureTotals' business and check:measure's.)
const staged = quoteSections(
  { ...doc, placements: [...doc.placements, { ...free("st", "floor", "deck"), stage: { outline: [], front: 0, decks: [] } }] },
  { lookup },
);
const stage = staged.find((s) => s.key === "floor")!.lines.find((l) => l.key === "floor|stages");
assert(stage?.label === "תוספת במה" && stage.lineTotal === 1500 && stage.quantity === 1, `one stage line: ${JSON.stringify(stage)}`);
assert(!staged.find((s) => s.key === "floor")!.lines.some((l) => l.label === "deck"), "no deck rows of its own");

// Two zones: the one with tables is the room; the other is one section of its own.
const chuppah: DesignDocumentContent = { calibration: doc.calibration, tables: [], placements: [free("x", "floor", "arch")] };
const zoned = quoteSections(doc, {
  lookup,
  chairOf: () => "venezia",
  zones: [
    { id: "z-chuppah", name: "חופה", doc: chuppah },
    { id: "z-hall", name: "אולם", doc },
  ],
});
assert(zoned[0].key === "zone:z-chuppah" && zoned[0].title === "עיצוב חופה", "the ceremony zone comes first, as its own section");
assert(zoned.some((s) => s.key === "kit:r1"), "the hall still breaks down into kits");

// 2026-11-07: a curtain on a ROD brings its rod — 6 m of curtain on a 6 m rod at 30/m folded into
// the curtain's line ("כולל מוט 6 מ׳"); no rod row, and the curtain's line is partial.
info.rod = { cat: "curtain-rods", price: 30 };
const rodded = { ...free("rc", "ceiling", "curtain"), rail: { type: "rod" as const, points: [{ x: 0, y: 0 }, { x: 6000, y: 0 }], heightMm: 2400 } };
const rodDoc: DesignDocumentContent = { calibration: doc.calibration, tables: [], placements: [rodded] };
const rodCtx = (rodOf?: () => string | undefined): MeasureContext => ({ unitOf: (v) => (v === "curtain" || v === "rod" ? "m" : "unit"), railLengthMm: () => 6000, rodOf });
const withRod = quoteSections(rodDoc, { lookup, ctx: rodCtx(() => "rod") }).find((s) => s.key === "floor")!.lines;
assert(withRod.length === 1 && withRod[0].variantId === "curtain" && withRod[0].lineTotal === 6 * 50 + 6 * 30 && withRod[0].detail === "כולל מוט 6 מ׳" && !withRod[0].partial, `the rod is in the curtain's line, in words: ${JSON.stringify(withRod)}`);
const noRod = quoteSections(rodDoc, { lookup, ctx: rodCtx(() => undefined) }).find((s) => s.key === "floor")!.lines;
assert(noRod.length === 1 && noRod[0].lineTotal === 300 && noRod[0].partial === true && noRod[0].detail === "כולל מוט 6 מ׳", "no rod row: the curtain alone, partial");

// 2026-11-13: an AISLE is ONE line — fourteen rose tumblers at 80 folded into it, in words; the one
// standing loose beside it keeps a line of its own. The aisle's row has no price: what lines it prices it.
info.walk = { cat: "aisles" };
const aisleDoc: DesignDocumentContent = { calibration: doc.calibration, tables: [], placements: [free("aw", "floor", "walk"), free("lb", "floor", "roses")] };
const aisleCtx: MeasureContext = { unitOf: () => "unit", aisleOf: (p) => (p.variantId === "walk" ? [{ variantId: "roses", count: 14 }] : undefined) };
const aisled = quoteSections(aisleDoc, { lookup, ctx: aisleCtx }).find((s) => s.key === "floor")!.lines;
const walkLine = aisled.find((x) => x.variantId === "walk");
assert(!!walkLine && walkLine.lineTotal === 14 * 80 && walkLine.priced && !walkLine.partial && walkLine.unitPrice === 14 * 80 && /^14 × /.test(walkLine.detail ?? ""), `the aisle's line carries its pieces: ${JSON.stringify(walkLine)}`);
assert(aisled.find((x) => x.variantId === "roses")?.quantity === 1 && aisled.find((x) => x.variantId === "roses")?.lineTotal === 80, "…and the loose one keeps its own line");

console.log("quote-sections self-check passed");
