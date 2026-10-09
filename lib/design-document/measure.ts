// How much of a thing a placement actually is — the number the quote multiplies a price by and the
// packing list prints.
//
// For almost everything that is `quantity`: four candlesticks are four candlesticks. But a drape is
// bought by the running metre and a carpet by the square metre, and both are drawn to fit rather
// than chosen at a size (CategoryDef.sizing === "stretch"). Charging those per item would price a
// 14-metre wall the same as a 2-metre one.
//
// Pure, like every other aggregation over the document: the wall a drape hangs on belongs to the
// VENUE, not to this document, so the caller injects a way to measure one (`wallLengthMm`). A
// caller that has no plan to hand — the server rendering a quote from stored JSON — gets the honest
// fallback of the item's own count. See lib/outputs/lookup.ts for the wiring.
import type { DesignDocumentContent, Placement } from "./types";
import { edgeItemShape, edgeKind, skirtMm, stageAreaMm2, stageCorners, stageDeckCounts, type DeckLookup, type StagePlacement, type WallDistance } from "./stage";
import { isMain } from "../self-check";

/** What a placement's amount is counted in, decided by the product's price unit. */
export type MeasureUnit = "unit" | "m" | "m2";

export interface MeasureContext {
  /** The product's price unit for this variant — "unit" for anything ordinary. */
  unitOf: (variantId: string) => MeasureUnit;
  /** The full length of a venue wall, in mm. Absent (or undefined for an unknown wall) = no plan
   *  available, so a drape falls back to being counted rather than measured. */
  wallLengthMm?: (wallId: string) => number | undefined;
  /** The product's catalog footprint, in mm — the fallback size for a stretch item that has not
   *  been resized on the plan yet. */
  footprintMm?: (variantId: string) => { widthMm: number; depthMm: number } | undefined;
  /** A deck's measurements, for counting a STAGE as the decks it is built from (Placement.stage).
   *  Absent = no catalog to lay them with, and a stage then counts as one of its own variant — a
   *  caller that can say less says less, rather than inventing a build. */
  deckOf?: DeckLookup;
  /** How far a point is from the venue's nearest wall — which sides of a stage are against one, and
   *  so need no skirt. Absent = no plan, and every side is counted as open. */
  wallDistance?: WallDistance;
  /** The studio's row for a stage part, for a stage that names none — one drawn before the studio
   *  had a banquette in its catalog still bills its banquette once it does. */
  stagePart?: (kind: "stairs" | "bench" | "barrier" | "backdrop" | "ramp" | "skirt" | "chair") => string | undefined;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The run of a drape along its wall, in millimetres — the span fraction against the real wall. */
export function spanLengthMm(p: Placement, wallLengthMm?: (wallId: string) => number | undefined): number | undefined {
  if (!p.span || !wallLengthMm) return undefined;
  const full = wallLengthMm(p.span.wallId);
  if (!full) return undefined; // wall deleted at the venue, or no plan loaded
  return Math.abs(p.span.to - p.span.from) * full;
}

/** The billable amount of one placement: metres for a drape, square metres for a laid carpet,
 *  otherwise its plain count. Quantity still multiplies — two identical drapes on two walls are
 *  two runs of fabric. */
export function measure(p: Placement, ctx: MeasureContext): number {
  const unit = ctx.unitOf(p.variantId);
  if (unit === "unit") return p.quantity;

  const size = p.sizeMm ?? ctx.footprintMm?.(p.variantId);
  if (unit === "m") {
    const mm = spanLengthMm(p, ctx.wallLengthMm) ?? size?.widthMm;
    // No span and no size to fall back on: count it, rather than quietly bill zero metres.
    return mm ? round2((mm / 1000) * p.quantity) : p.quantity;
  }
  if (!size?.widthMm || !size?.depthMm) return p.quantity;
  return round2(((size.widthMm / 1000) * (size.depthMm / 1000)) * p.quantity);
}

/** Billable amounts per variant across the whole document — what both the quote and the packing
 *  list total over.
 *
 *  TABLES COUNT TOO, one each, whenever they carry a catalog row (DesignTable.variantId). They are
 *  furniture the crew loads onto the same lorry as everything else, and they only stayed out of
 *  these totals while the only way to get one was a toolbar button that referenced no product —
 *  there was nothing to name on the list. A table dragged off the rail has a row, and an order that
 *  silently omitted forty of them would be wrong in the one direction that costs a wedding. A table
 *  is never a stretch item, so there is nothing to measure: it is one table. */
export function measureTotals(doc: DesignDocumentContent, ctx: MeasureContext): Map<string, number> {
  const totals = new Map<string, number>();
  const add = (variantId: string, amount: number) => totals.set(variantId, round2((totals.get(variantId) ?? 0) + amount));
  for (const p of doc.placements) {
    // A STAGE is the decks it is built from, each measured in its own product's price unit: a deck
    // priced per unit counts decks, one priced per m² counts the floor they cover. Never the stage's
    // own variant — that is only the deck it was mostly built from when it was drawn.
    if (p.stage && ctx.deckOf) {
      for (const [variantId, decks] of stageDeckCounts(p.stage, ctx.deckOf)) {
        const unit = ctx.unitOf(variantId);
        for (const d of decks)
          add(variantId, (unit === "m2" ? (d.widthMm / 1000) * (d.depthMm / 1000) : unit === "m" ? d.widthMm / 1000 : 1) * p.quantity);
      }
      // Its edge items and its skirt, each in its own product's unit: by the metre, or by how many
      // pieces of that product's width it takes — a 6m run of stairs is six 1m stair modules side by
      // side, not one flight.
      const runOf = (variantId: string, mm: number) => {
        if (mm <= 0) return;
        const unit = ctx.unitOf(variantId);
        const piece = ctx.footprintMm?.(variantId)?.widthMm || 1000;
        add(variantId, (unit === "unit" ? Math.ceil(mm / piece - 1e-6) : round2(mm / 1000)) * p.quantity);
      };
      const variantOf = (kind: "stairs" | "bench" | "barrier" | "backdrop" | "ramp") =>
        ({
          stairs: p.stage!.stairsVariant,
          bench: p.stage!.benchVariant,
          barrier: p.stage!.barrierVariant,
          backdrop: p.stage!.backdropVariant,
          ramp: p.stage!.rampVariant,
        })[kind] ?? ctx.stagePart?.(kind);
      for (const it of p.stage.stairs ?? []) {
        const shape = edgeItemShape(p.stage, it, ctx.deckOf);
        if (!shape) continue;
        const kind = edgeKind(it);
        const variant = variantOf(kind);
        if (!variant) continue;
        // A ramp is one ramp (or so many metres of run); everything else is measured along its edge.
        if (kind === "ramp") add(variant, (ctx.unitOf(variant) === "m" ? round2(shape.depthMm / 1000) : 1) * p.quantity);
        else runOf(variant, shape.widthMm);
      }
      // The chairs standing on its banquettes, as the studio's chairs — a table's chairs are packed
      // off the table, a banquette's off the banquette.
      const chairRow = ctx.stagePart?.("chair");
      if (chairRow) {
        const deckOf = ctx.deckOf;
        const seated = (p.stage.stairs ?? []).reduce((n, it) => n + (edgeKind(it) === "bench" ? (edgeItemShape(p.stage!, it, deckOf)?.seats ?? 0) : 0), 0);
        if (seated > 0) add(chairRow, seated * p.quantity);
      }
      // Corner pieces: one more stair module for a stair corner; a banquette corner adds its depth.
      for (const c of stageCorners(p.stage, ctx.deckOf)) {
        const variant = variantOf(c.kind);
        if (!variant) continue;
        if (c.kind === "stairs" && ctx.unitOf(variant) === "unit") add(variant, p.quantity);
        else runOf(variant, c.depthMm);
      }
      // The surface: by the square metre of deck.
      if (p.stage.surfaceVariant) {
        const m2 = stageAreaMm2(p.stage) / 1e6;
        add(p.stage.surfaceVariant, (ctx.unitOf(p.stage.surfaceVariant) === "m2" ? round2(m2) : 1) * p.quantity);
      }
      const skirt = p.stage.skirtVariant ?? ctx.stagePart?.("skirt");
      if (skirt) runOf(skirt, skirtMm(p as StagePlacement, ctx.deckOf, ctx.wallDistance));
      continue;
    }
    add(p.variantId, measure(p, ctx));
  }
  for (const t of doc.tables) {
    if (!t.variantId) continue;
    totals.set(t.variantId, round2((totals.get(t.variantId) ?? 0) + 1));
  }
  return totals;
}

// ponytail: self-check. Run: node --experimental-strip-types lib/design-document/measure.ts
if (isMain(import.meta.url)) {
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
  assert(measure({ ...carpet, quantity: 2 }, ctx) === 15, "two carpets, twice the area");
  assert(measure({ ...base, id: "f", variantId: "carpet", quantity: 3 }, ctx) === 3, "an unsized carpet falls back to its count");

  const totals = measureTotals({ calibration: { mmPerUnit: 1 }, tables: [], placements: [counted, wholeWall, carpet] }, ctx);
  assert(totals.get("candlestick") === 4 && totals.get("drape") === 14 && totals.get("carpet") === 7.5, "totals per variant");

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

  const noCatalog = measureTotals({ calibration: { mmPerUnit: 1 }, tables: [], placements: [stage(["deck"])] }, { unitOf: () => "unit" });
  assert(noCatalog.get("deck") === 1, "with no catalog to lay it with, a stage counts as itself rather than guessing");

  console.log("measure self-check passed");
}
