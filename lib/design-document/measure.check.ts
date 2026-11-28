// npm run check:measure — the self-check of ./measure.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { measure, measureTotals, rodLengthMm, type MeasureContext } from "./measure";

// ponytail: self-check. Run: npm run check:measure
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const base = { layer: "floor" as const, position: { x: 0, y: 0 }, rotation: 0, scale: 1 };
const ctx: MeasureContext = {
  unitOf: (v) => (v === "drape" ? "m" : v === "carpet" ? "m2" : "unit"),
  wallLengthMm: (id) => (id === "w14" ? 14000 : undefined),
  footprintMm: (v) => (v === "drape" ? { widthMm: 3000, depthMm: 100 } : undefined),
};

const counted = { ...base, id: "a", variantId: "candlestick", quantity: 4 };
assert(measure(counted, ctx) === 4, "an ordinary item is counted");

const wholeWall = { ...base, id: "b", variantId: "drape", quantity: 1, span: { wallId: "w14", from: 0, to: 1 } };
assert(measure(wholeWall, ctx) === 14, "a drape across a 14m wall bills 14 metres");
assert(measure({ ...wholeWall, span: { wallId: "w14", from: 0.25, to: 0.75 } }, ctx) === 7, "half the wall bills half");
assert(measure({ ...wholeWall, quantity: 2 }, ctx) === 28, "two identical runs are twice the fabric");

const noPlan = measure(wholeWall, { ...ctx, wallLengthMm: undefined });
assert(noPlan === 3, "with no plan to measure against, a drape falls back to its catalog width");
assert(measure({ ...base, id: "d", variantId: "drape", quantity: 2 }, { ...ctx, footprintMm: undefined }) === 2, "…and with no size either, to its count");
assert(measure({ ...wholeWall, span: { wallId: "gone", from: 0, to: 1 } }, ctx) === 3, "a drape whose wall was deleted falls back too");

const carpet = { ...base, id: "e", variantId: "carpet", quantity: 1, sizeMm: { widthMm: 3000, depthMm: 2500 } };
assert(measure(carpet, ctx) === 7.5, "a 3×2.5m carpet bills 7.5 square metres");
// Laid to an outline (Placement.outline): an L of 3×2.5 less a 1×1 corner, and a 0.5×0.5 hole.
const ell = { ...carpet, id: "ell", outline: [{ x: -1500, y: -1250 }, { x: 1500, y: -1250 }, { x: 1500, y: 250 }, { x: 500, y: 250 }, { x: 500, y: 1250 }, { x: -1500, y: 1250 }], holes: [[{ x: -1000, y: -1000 }, { x: -500, y: -1000 }, { x: -500, y: -500 }, { x: -1000, y: -500 }]] };
assert(measure(ell, ctx) === 6.25, `a carpet laid to an L with a hole bills the floor it covers (${measure(ell, ctx)})`);
assert(measure({ ...ell, variantId: "candlestick" }, ctx) === 1, "…and a row priced per unit is still one");
assert(measure({ ...carpet, quantity: 2 }, ctx) === 15, "two carpets, twice the area");
assert(measure({ ...base, id: "f", variantId: "carpet", quantity: 3 }, ctx) === 3, "an unsized carpet falls back to its count");

const ramp = { ...base, id: "r", variantId: "ramp", quantity: 1, sizeMm: { widthMm: 1200, depthMm: 3480 } };
const byRun = { ...ctx, unitOf: () => "m" as const, climbOf: (v: string) => (v === "ramp" ? ("ramp" as const) : undefined) };
assert(measure(ramp, byRun) === 3.48, "a ramp on its own priced by the metre bills its 3.48m run, not its 1.2m width");
assert(measure(ramp, { ...ctx, unitOf: () => "unit" }) === 1, "…and priced per ramp, it is one ramp");

const totals = measureTotals({ calibration: { mmPerUnit: 1 }, tables: [], placements: [counted, wholeWall, carpet] }, ctx);
assert(totals.get("candlestick") === 4 && totals.get("drape") === 14 && totals.get("carpet") === 7.5, "totals per variant");

// RAILS (2026-11-07): a wall rail measures as the legacy span; a side or a rod through the context;
// a rod brings its rod row by the metre.
assert(measure({ ...wholeWall, span: undefined, rail: { type: "wall", wallId: "w14", from: 0, to: 0.5 } }, ctx) === 7, "a wall rail bills its stretch of the wall, as the span did");
const onRod = { ...base, id: "rod", variantId: "drape", quantity: 1, rail: { type: "rod" as const, points: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 2000 }], heightMm: 2400 } };
const railCtx: MeasureContext = { ...ctx, unitOf: (v) => (v === "rod-row" ? "m" : ctx.unitOf(v)), railLengthMm: () => 6000, rodOf: () => "rod-row" };
assert(measure(onRod, railCtx) === 6 && rodLengthMm(onRod) === 6000, "a curtain on a rod bills the rod's 6 m of cloth");
const rodTotals = measureTotals({ calibration: { mmPerUnit: 1 }, tables: [], placements: [onRod] }, railCtx);
assert(rodTotals.get("drape") === 6 && rodTotals.get("rod-row") === 6, "…and 6 m of the studio's rod");
assert(!measureTotals({ calibration: { mmPerUnit: 1 }, tables: [], placements: [onRod] }, { ...railCtx, rodOf: () => undefined }).has("rod-row"), "no rod row, no rod billed");
// A BARE ROD (2026-11-13) — a placement of the rod's own row — is its own metres, once.
const bareRod = { ...onRod, id: "bare", variantId: "rod-row" };
const bareTotals = measureTotals({ calibration: { mmPerUnit: 1 }, tables: [], placements: [bareRod] }, railCtx);
assert(bareTotals.get("rod-row") === 6 && bareTotals.size === 1, `a bare rod is billed its own 6 m, never twice (${bareTotals.get("rod-row")})`);
const otherShade = { ...bareRod, variantId: "rod-gold" };
const shadeCtx: MeasureContext = { ...railCtx, unitOf: (v) => (v.startsWith("rod-") ? "m" : ctx.unitOf(v)), isRod: (v) => v.startsWith("rod-") };
const shadeTotals = measureTotals({ calibration: { mmPerUnit: 1 }, tables: [], placements: [otherShade, onRod] }, shadeCtx);
assert(shadeTotals.get("rod-gold") === 6 && shadeTotals.get("rod-row") === 6, "a bare rod in another shade is its own line, and the curtain beside it still brings its rod");
assert(measure(onRod, { ...railCtx, railLengthMm: undefined }) === 6, "a rod is its own points — measured with no plan at all");
const onSide = { ...base, id: "side", variantId: "drape", quantity: 1, rail: { type: "side" as const, featureId: "bar", side: 0, from: 0, to: 1, out: 1 as const } };
assert(measure(onSide, { ...railCtx, railLengthMm: () => 2500 }) === 2.5 && measure(onSide, { ...railCtx, railLengthMm: undefined }) === 3, "a side rail reads its side through the plan, or falls back to its catalog width");
// SAILS and CEILING DRAPES (lib/studio/ceiling-cloth.ts): a sail per m² of its polygon, a drape per
// metre of its runs — or per m² of its cloth, its runs × its width.
const clothCtx: MeasureContext = { unitOf: (v) => (v === "sail" ? "m2" : v === "drape-m2" ? "m2" : v === "swag" ? "m" : "unit") };
const sail = { ...base, id: "sail", variantId: "sail", quantity: 1, rail: { type: "sail" as const, ties: [{ p: { x: 0, y: 0 }, heightMm: 3000 }, { p: { x: 4000, y: 0 }, heightMm: 3000 }, { p: { x: 4000, y: 3000 }, heightMm: 3000 }, { p: { x: 0, y: 3000 }, heightMm: 3000 }] } };
assert(measure(sail, clothCtx) === 12 && measure(sail, { ...clothCtx, railAreaMm2: () => 10_500_000 }) === 10.5, "a sail bills its polygon's m² — off its points, or as it hangs in the room");
assert(measure({ ...sail, variantId: "unit-sail" }, clothCtx) === 1, "…and one sail when its row is per unit");
const canopy = { ...base, id: "canopy", variantId: "swag", quantity: 1, rail: { type: "canopy" as const, outline: [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }], heightMm: 3500, directionDeg: 0, spacingMm: 1000 } };
assert(measure(canopy, clothCtx) === 24 && measure({ ...canopy, variantId: "drape-m2" }, clothCtx) === 28.8, "a canopy of four 6 m runs is 24 m of drape — 28.8 m² of 1.2 m cloth");

// Tables off the rail are counted; a table placed before tables came out of the catalog carries
// no row and cannot be, which is what keeps every document drawn until now totalling as it did.
const tabled = measureTotals(
  {
    calibration: { mmPerUnit: 1 },
    placements: [counted],
    tables: [
      { id: "t1", type: "עגול 180", number: 1, position: { x: 0, y: 0 }, rotation: 0, diameterMm: 1800, variantId: "round180" },
      { id: "t2", type: "עגול 180", number: 2, position: { x: 0, y: 0 }, rotation: 0, diameterMm: 1800, variantId: "round180" },
      { id: "t3", type: "אביר", number: 3, position: { x: 0, y: 0 }, rotation: 0, widthMm: 4800, depthMm: 1200 },
    ],
  },
  ctx,
);
assert(tabled.get("round180") === 2, "two tables of the same row total two");
assert(tabled.get("candlestick") === 4, "…alongside the placements, untouched");
assert(tabled.size === 2, "a table with no catalog row adds nothing to total");

// A stage counts as its decks, in each deck's own unit.
const stageCtx: MeasureContext = {
  unitOf: (v) => (v === "deck-m2" ? "m2" : "unit"),
  deckOf: (v) => (v === "deck" || v === "deck-m2" ? { id: v, widthMm: 2000, depthMm: 1000 } : undefined),
};
const stage = (decks: string[]) => ({
  ...base,
  id: "s",
  variantId: decks[0],
  quantity: 1,
  stage: { outline: [{ x: -3000, y: -2000 }, { x: 3000, y: -2000 }, { x: 3000, y: 2000 }, { x: -3000, y: 2000 }], front: 0, decks },
});
const byDeck = measureTotals({ calibration: { mmPerUnit: 1 }, tables: [], placements: [stage(["deck"])] }, stageCtx);
assert(byDeck.get("deck") === 12, "a 6×4 stage of 2×1 decks priced per unit is twelve decks");
const byArea = measureTotals({ calibration: { mmPerUnit: 1 }, tables: [], placements: [stage(["deck-m2"])] }, stageCtx);
assert(byArea.get("deck-m2") === 24, "…and priced per m², twenty-four square metres");
const finished = measureTotals(
  {
    calibration: { mmPerUnit: 1 },
    tables: [],
    placements: [
      {
        ...stage(["deck"]),
        stage: {
          ...stage(["deck"]).stage,
          stairs: [{ id: "f", edge: 1, t: 0.5, widthMm: 1000 }],
          stairsVariant: "stairs",
          skirtVariant: "skirt",
        },
      },
    ],
  },
  { ...stageCtx, unitOf: (v) => (v === "skirt" ? "m" : "unit"), wallDistance: (p) => Math.abs(p.y - 2000) },
);
assert(finished.get("stairs") === 1, "a stage with one flight orders one flight");
assert(finished.get("skirt") === 13, "…and 13m of skirt: front 6 and two sides of 4, less the flight's metre, with the back against the wall");

const edged = measureTotals(
  {
    calibration: { mmPerUnit: 1 },
    tables: [],
    placements: [
      {
        ...stage(["deck"]),
        stage: {
          ...stage(["deck"]).stage,
          stairs: [
            { id: "s", edge: 1, t: 0.5, widthMm: 0, full: true },
            { id: "b", kind: "bench" as const, edge: 0, t: 0.5, widthMm: 0, full: true },
            { id: "r", kind: "barrier" as const, edge: 3, t: 0.5, widthMm: 2500 },
          ],
          stairsVariant: "stairs",
          benchVariant: "bench",
          barrierVariant: "rail",
        },
      },
    ],
  },
  { ...stageCtx, unitOf: (v) => (v === "bench" || v === "rail" ? "m" : "unit") },
);
assert(edged.get("stairs") === 4, "stairs the whole of a 4m side are four 1m stair modules");
assert(edged.get("bench") === 6 && edged.get("rail") === 2.5, "…a banquette along the 6m front is 6m, and a barrier its own 2.5m");
const floored = measureTotals(
  {
    calibration: { mmPerUnit: 1 },
    tables: [],
    placements: [{ ...stage(["deck"]), stage: { ...stage(["deck"]).stage, surfaceVariant: "carpet" } }],
  },
  { ...stageCtx, unitOf: (v) => (v === "carpet" ? "m2" : "unit") },
);
assert(floored.get("carpet") === 24, "a carpet on a 6×4 stage is 24m²");
const seatedBench = measureTotals(
  {
    calibration: { mmPerUnit: 1 },
    tables: [],
    placements: [{ ...stage(["deck"]), stage: { ...stage(["deck"]).stage, stairs: [{ id: "b", kind: "bench" as const, edge: 0, t: 0.5, widthMm: 0, full: true }] } }],
  },
  { ...stageCtx, stagePart: (k) => (k === "chair" ? "chair" : undefined) },
);
assert(seatedBench.get("chair") === 10, "a banquette along a 6m front packs its ten chairs");
const sofaBench = measureTotals(
  {
    calibration: { mmPerUnit: 1 },
    tables: [],
    placements: [
      {
        ...stage(["deck"]),
        stage: {
          ...stage(["deck"]).stage,
          stairs: [{ id: "b", kind: "bench" as const, edge: 0, t: 0.5, widthMm: 0, full: true, bench: { back: { kind: "chairs", seats: 4 }, front: { kind: "sofa" } } }],
          benchVariant: "bench",
        },
      },
    ],
  },
  { ...stageCtx, unitOf: (v) => (v === "bench" ? "m" : "unit"), stagePart: (k) => (k === "chair" ? "chair" : undefined) },
);
assert(sofaBench.get("chair") === 4 && sofaBench.get("bench") === 6, "a banquette with four chairs behind and a sofa in front packs four chairs, and is still six metres of banquette");

// A STANDALONE banquette: its own metres, and its chairs as the studio's chairs — never its sofa.
const benchCtx: MeasureContext = {
  unitOf: (v) => (v === "bench" ? "m" : "unit"),
  footprintMm: (v) => (v === "bench" ? { widthMm: 3000, depthMm: 450 } : undefined),
  stagePart: (k) => (k === "chair" ? "chair" : undefined),
  benchOf: (p) => (p.variantId === "bench" ? (p.sizeMm ?? { widthMm: 3000, depthMm: 450 }) : null),
};
const freeBench = { ...base, id: "fb", variantId: "bench", quantity: 1 };
const loose = measureTotals({ calibration: { mmPerUnit: 1 }, tables: [], placements: [freeBench] }, benchCtx);
assert(loose.get("bench") === 3 && loose.get("chair") === 5, "a 3m banquette on the floor is three metres of banquette and five chairs");
const stretched = measureTotals({ calibration: { mmPerUnit: 1 }, tables: [], placements: [{ ...freeBench, sizeMm: { widthMm: 6000, depthMm: 450 } }] }, benchCtx);
assert(stretched.get("bench") === 6 && stretched.get("chair") === 10, "…stretched to 6m, six metres and ten chairs");
const sofaOnly = measureTotals({ calibration: { mmPerUnit: 1 }, tables: [], placements: [{ ...freeBench, bench: { back: { kind: "sofa" } } }] }, benchCtx);
assert(sofaOnly.get("bench") === 3 && sofaOnly.get("chair") === undefined, "…as a sofa, the same three metres and no chairs at all");
const unknown = measureTotals({ calibration: { mmPerUnit: 1 }, tables: [], placements: [freeBench] }, { ...benchCtx, benchOf: undefined });
assert(unknown.get("bench") === 3 && unknown.get("chair") === undefined, "with no way to tell a banquette, it is only its metres");

const noCatalog = measureTotals({ calibration: { mmPerUnit: 1 }, tables: [], placements: [stage(["deck"])] }, { unitOf: () => "unit" });
assert(noCatalog.get("deck") === 1, "with no catalog to lay it with, a stage counts as itself rather than guessing");

// An arrangement in a vase: the vase is counted beside it, one per arrangement.
const inVase = { ...base, id: "fl", variantId: "peony", quantity: 3, layer: "table" as const, tableId: "t" };
const lined = measureTotals(
  { calibration: { mmPerUnit: 1 }, tables: [], placements: [{ ...base, id: "aisle", variantId: "walk", quantity: 1, sizeMm: { widthMm: 12000, depthMm: 3000 } }] },
  { ...ctx, unitOf: (v) => (v === "walk" ? "m" : "unit"), aisleOf: (p) => (p.variantId === "walk" ? [{ variantId: "rose-box", count: 14 }, { variantId: "urn", count: 14 }] : undefined) },
);
assert(lined.get("rose-box") === 14 && lined.get("urn") === 14 && lined.get("walk") === 12, "an aisle counts N of its piece and the piece's vessel, and bills its own row by its length");
const vased = measureTotals({ calibration: { mmPerUnit: 1 }, tables: [], placements: [inVase] }, { ...ctx, vesselOf: (p) => (p.variantId === "peony" ? "jug" : undefined) });
assert(vased.get("peony") === 3 && vased.get("jug") === 3, "three arrangements in a jug each pack three jugs");
console.log("measure self-check passed");
