// npm run check:aisle — the self-check of ./aisle.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Product } from "./types";
import { AISLE_CATEGORY, AISLE_MAX_PIECES, AISLE_PIECE_FIELD, AISLE_PITCH_MM, AISLE_RUNNER_COLOUR, aisleBringsOf, aisleLayout, aislePatch, aisleWords, canBeAislePiece, cleanAisle, mergedAisle } from "./aisle";

let n = 0;
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
  n++;
};
const box = { widthMm: 8000, depthMm: 3000 };
const rose = { widthMm: 600, depthMm: 500 };

const a = aisleLayout(box, rose, {});
// usable 7400 / 1500 → 4.93 → 5 steps → 6 a side.
assert(a.perSide === 6 && a.spots.length === 12, `both sides are lined, a piece every ~1.5 m (${a.perSide}, ${a.spots.length})`);
assert(a.spots[0].x === -3700 && a.spots[5].x === 3700, "a piece stands flush at each end");
assert(a.pitchMm === 1480, `…the rest spread evenly (${a.pitchMm})`);
assert(a.spots[0].y === -1250 && a.spots[6].y === 1250, "each side stands inside the box's long edge");
assert(a.spots[0].rotation === 0 && a.spots[6].rotation === 180, "the near side looks across the walk, the far side looks back");
assert(a.walkMm === 2000 && a.runner?.widthMm === 1700 && a.runner.lengthMm === 8000 && a.runner.y === 0, "the runner lies down the middle of the walk, a margin off the pieces");
assert(a.runner?.colour === AISLE_RUNNER_COLOUR, "…in the default colour");

// Longer aisle, more pieces — the ends still flush.
const long = aisleLayout({ widthMm: 12500, depthMm: 3000 }, rose, {});
assert(long.perSide === 9 && long.spots[0].x === -5950, `stretched, it gains pieces (${long.perSide})`);

// Touching: a hedge.
const hedge = aisleLayout(box, rose, { pitchMm: 100 });
assert(hedge.perSide === 13 && hedge.pitchMm >= 600, `pieces never overlap — a pitch under the piece's width is a hedge (${hedge.perSide}, ${hedge.pitchMm})`);

const one = aisleLayout(box, rose, { sides: "one" });
assert(one.spots.length === 6 && one.spots.every((s) => s.side === -1), "one side only");
assert(one.walkMm === 2500 && one.runner?.y === 250, "…the walk and its runner beside the row");

const stag = aisleLayout(box, rose, { stagger: true });
assert(stag.spots.length === 11 && stag.spots[6].x === -3700 + stag.pitchMm / 2, "staggered: the far side stands half a step along, one fewer");

assert(aisleLayout(box, rose, { runner: false }).runner === null, "no runner when switched off");
assert(aisleLayout({ widthMm: 8000, depthMm: 1100 }, rose, {}).runner === null, "…nor where the pieces leave no walk");
const red = aisleLayout(box, rose, { runner: { widthMm: 5000, colour: "#aa0000" } });
assert(red.runner?.widthMm === 2000 && red.runner.colour === "#aa0000", "a typed runner is held to the walk, in its own colour");

const short = aisleLayout({ widthMm: 500, depthMm: 3000 }, rose, {});
assert(short.perSide === 1 && short.spots[0].x === 0 && short.pitchMm === 0, "an aisle shorter than its piece holds one a side, in the middle");
const ghost = aisleLayout(box, null, {});
assert(ghost.spots.length === 12, "no piece chosen: the spots are still laid, as markers");
assert(aisleLayout({ widthMm: 60000, depthMm: 3000 }, { widthMm: 10, depthMm: 10 }, { pitchMm: 100 }).spots.length <= AISLE_MAX_PIECES, "never more than the cap");

// Cleaning and patching.
assert(JSON.stringify(cleanAisle({ pitchMm: 1234.4, sides: "two", stagger: 1, runner: { colour: "red", widthMm: 10 } })) === '{"pitchMm":1234,"runner":{"widthMm":300}}', "a stored spec is cleaned");
assert(aislePatch({ sides: "one" }, { sides: "both", stagger: false }) === undefined, "both sides and no stagger are the defaults — a row stores neither");
assert(aislePatch(undefined, { pitchMm: AISLE_PITCH_MM }) === undefined, "the defaults store nothing");
assert(JSON.stringify(aislePatch({ pitchMm: 900 }, { sides: "one" })) === '{"pitchMm":900,"sides":"one"}', "a patch keeps what was set");
assert(aislePatch({ sides: "one", stagger: true }, { sides: undefined, stagger: false }) === undefined, "…and lets go of what went back to the default");
const merged = mergedAisle({ pitchMm: 900, sides: "one", stagger: true }, { piece: "v1", stagger: false, runner: false });
assert(merged.pitchMm === 900 && merged.sides === "one" && merged.stagger === false && merged.runner === false, "a placement's own answers lie over its row's");
assert(mergedAisle({ sides: "one" }, { sides: "both" }).sides === "both", "…both sides again on one plan");

// Which rows may line an aisle.
const row = (category: string, layer: Product["layer"] = "floor", extra: Partial<Product> = {}) => ({ category, layer, name: "x", dimensions: { heightMm: 100 }, ...extra });
assert(canBeAislePiece(row("flower-arrangements", "table")) && canBeAislePiece(row("columns")) && canBeAislePiece(row("candlesticks", "table")) && canBeAislePiece(row("trees")), "flowers, columns, candlesticks and trees line an aisle");
assert(canBeAislePiece(row("chairs")), "…and so does a row of chairs");
assert(!canBeAislePiece(row("tables")) && !canBeAislePiece(row("stages")) && !canBeAislePiece(row("rugs")) && !canBeAislePiece(row("curtains", "ceiling")), "a table, a stage, a rug and a drape do not");
assert(!canBeAislePiece(row("chandeliers", "ceiling")) && !canBeAislePiece(row(AISLE_CATEGORY)) && !canBeAislePiece(row("columns", "floor", { archived: true })), "nor a hung piece, another aisle, an archived row");
assert(!canBeAislePiece(row("tablecloths", "table")), "a cloth does not");

// The count a caller with its own catalog map reads.
const cat: Record<string, Product> = {
  walk: { id: "walk", name: "שדרה", category: AISLE_CATEGORY, layer: "floor", dimensions: { widthMm: 8000, depthMm: 3000, heightMm: 0 }, categoryFields: { [AISLE_PIECE_FIELD]: "rose" }, styleTags: [], variants: [] },
  rose: { id: "rose", name: "קופסת ורדים", category: "flower-arrangements", layer: "floor", dimensions: { widthMm: 600, depthMm: 500, heightMm: 700 }, categoryFields: {}, styleTags: [], variants: [] },
  col: { id: "col", name: "עמוד", category: "columns", layer: "floor", dimensions: { diameterMm: 400, heightMm: 2000 }, categoryFields: {}, styleTags: [], variants: [] },
};
const boxOf = (x: Product) => ({ widthMm: x.dimensions.widthMm ?? x.dimensions.diameterMm ?? 0, depthMm: x.dimensions.depthMm ?? x.dimensions.diameterMm ?? 0 });
const brings = (p: Parameters<typeof aisleBringsOf>[0]) => aisleBringsOf(p, (id) => cat[id], boxOf);
assert(brings({ variantId: "walk" })?.count === 12 && brings({ variantId: "walk" })?.variantId === "rose", "an aisle brings N of its row's piece");
assert(brings({ variantId: "walk", sizeMm: { widthMm: 12500, depthMm: 3000 } })?.count === 18, "…more when the plan stretched it");
assert(brings({ variantId: "walk", aisle: { piece: "col", sides: "one" } })?.variantId === "col" && brings({ variantId: "walk", aisle: { piece: "col", sides: "one" } })?.count === 6, "…and a placement's own piece and sides");
assert(brings({ variantId: "rose" }) === undefined && brings({ variantId: "walk", aisle: { piece: "gone" } }) === undefined, "nothing for another row, or a piece that is gone");

assert(aisleWords(a) === "12 פריטים · כל 1.48 מ׳" && aisleWords(short) === "2 פריטים", `read back in words (${aisleWords(a)})`);
console.log(`aisle self-check passed (${n})`);
