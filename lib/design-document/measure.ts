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
import { standaloneBench, type BenchLookup } from "./bench";
import { railLengthMm, railOf, rodPath } from "../studio/rail";
import { clothAreaMm2 } from "../studio/ceiling-cloth";
import { carpetAreaMm2 } from "../studio/cover";

/** What a placement's amount is counted in, decided by the product's price unit. */
export type MeasureUnit = "unit" | "m" | "m2";

export interface MeasureContext {
  /** The product's price unit for this variant — "unit" for anything ordinary. */
  unitOf: (variantId: string) => MeasureUnit;
  /** The full length of a venue wall, in mm. Absent (or undefined for an unknown wall) = no plan
   *  available, so a drape falls back to being counted rather than measured. */
  wallLengthMm?: (wallId: string) => number | undefined;
  /** A קאנט's run along its table's sides (lib/catalog/kant.ts kantRunMm); undefined for anything else. */
  edgeRunMm?: (p: Placement) => number | undefined;
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
  /** Whether a row is a flight or a ramp (lib/studio/climb-item.ts). A ramp standing on its own and
   *  priced by the metre bills its RUN, as a stage's ramp does. Absent = everything by its width. */
  climbOf?: (variantId: string) => "stairs" | "ramp" | undefined;
  /** Which placements are STANDALONE banquettes, and how long (lib/design-document/bench.ts): their
   *  chairs are packed as the studio's chairs, as a stage banquette's are. Absent = none are known,
   *  and a banquette row is simply its own metres. */
  benchOf?: BenchLookup;
  /** The vase or jug an arrangement stands in (lib/catalog/vessel.ts vesselOf) — counted beside it,
   *  one per arrangement. Absent = no catalog to say, and none is counted. */
  vesselOf?: (p: Placement) => string | undefined;
  /** How long a drape's RAIL is along itself, mm, for a rail that is not a wall (a side of a thing, a
   *  rod — lib/studio/rail.ts railLengthMm), read against the WHOLE document and the venue: a side
   *  rail's thing may be in another quote section's subset. Absent / undefined = no plan to read it
   *  against, and the drape falls back as a wall drape with no plan does. A wall rail is measured as
   *  it always was, through `wallLengthMm`. */
  railLengthMm?: (p: Placement) => number | undefined;
  /** The studio's row a drape's free-standing ROD is billed as (category `curtain-rods`, per metre —
   *  spec 2026-11-07 §6.2, as a stage's skirt is billed off the stage). Absent / undefined = the studio
   *  has no rod row, and the drape's quote line says it is partial. */
  rodOf?: () => string | undefined;
  /** Is this variant a ROD's own row (category `curtain-rods`)? A placement of one is a BARE ROD
   *  (lib/studio/rail.ts isRodRow): it is billed by its own metres and brings no second rod. Absent =
   *  only the row `rodOf` names is known to be one. */
  isRod?: (variantId: string) => boolean;
  /** The CLOTH a sail or a ceiling drape is, mm² (lib/studio/ceiling-cloth.ts clothAreaMm2), read
   *  against the room — a sail tied to a wall or a thing where it now stands. Absent / undefined = off
   *  its own points as placed. What a row priced per m² bills (spec 2026-11-07 §6.3). */
  railAreaMm2?: (p: Placement) => number | undefined;
  /** What an AISLE brings beside its own row (lib/catalog/aisle.ts, catalog-resolver aisleBrings): N of
   *  the piece that lines it — and of that piece's vessel — counted as those rows, so the packing
   *  list, the stock peak, the florist's order and the quote all see fourteen boxes of roses. Absent =
   *  no catalog to say, and the aisle is one of its own row. */
  aisleOf?: (p: Placement) => { variantId: string; count: number }[] | undefined;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The run of a drape along its wall, in millimetres — the span fraction against the real wall. */
export function spanLengthMm(p: Placement, wallLengthMm?: (wallId: string) => number | undefined): number | undefined {
  // The legacy span and a wall rail are the same stretch (lib/studio/rail.ts railOf).
  const rail = railOf(p);
  if (!rail || rail.type !== "wall" || !wallLengthMm) return undefined;
  const full = wallLengthMm(rail.wallId);
  if (!full) return undefined; // wall deleted at the venue, or no plan loaded
  return Math.abs(rail.to - rail.from) * full;
}

/** A drape's run along ANY rail, mm: a wall's as always (the stretch's fraction of the wall's arc), a
 *  side's or a rod's read through the context. Undefined with nothing to read it against. */
export function railRunMm(p: Placement, ctx: Pick<MeasureContext, "wallLengthMm" | "railLengthMm">): number | undefined {
  const rail = railOf(p);
  if (!rail) return undefined;
  if (rail.type === "wall") return spanLengthMm(p, ctx.wallLengthMm);
  // A rod, a run, a canopy are their own points — no plan needed to measure them.
  if (rail.type === "rod" || rail.type === "run" || rail.type === "canopy") return railLengthMm(rail, { structure: NO_VENUE });
  return ctx.railLengthMm?.(p);
}
const NO_VENUE = { nodes: [], walls: [], entrances: [], features: [] };

/** How many metres of rod a drape on a free-standing rod brings — its polyline, the cantilevered arm
 *  held to its reach; 0 on any other rail. Pure: a rod is its own points. */
export function rodLengthMm(p: Placement): number {
  const rail = railOf(p);
  if (!rail || rail.type !== "rod") return 0;
  const path = rodPath(rail);
  return path.slice(1).reduce((n, q, i) => n + Math.hypot(q.x - path[i].x, q.y - path[i].y), 0);
}

/** The metres of rod a placement BRINGS beside itself — a curtain on a free-standing rod; never a bare
 *  rod, which is its own line (it would be billed twice). */
export function broughtRodMm(p: Placement, ctx: Pick<MeasureContext, "rodOf" | "isRod">): number {
  const mm = rodLengthMm(p);
  if (mm <= 0) return 0;
  const bare = ctx.isRod ? ctx.isRod(p.variantId) : ctx.rodOf?.() === p.variantId;
  return bare ? 0 : mm;
}

/** The billable amount of one placement: metres for a drape, square metres for a laid carpet,
 *  otherwise its plain count. Quantity still multiplies — two identical drapes on two walls are
 *  two runs of fabric. */
export function measure(p: Placement, ctx: MeasureContext): number {
  const unit = ctx.unitOf(p.variantId);
  if (unit === "unit") return p.quantity;

  const size = p.sizeMm ?? ctx.footprintMm?.(p.variantId);
  if (unit === "m") {
    const along = ctx.climbOf?.(p.variantId) === "ramp" ? size?.depthMm : size?.widthMm;
    // A קאנט runs the sides of its table it is on (lib/catalog/kant.ts), read against the document.
    const mm = railRunMm(p, ctx) ?? ctx.edgeRunMm?.(p) ?? along;
    // No span and no size to fall back on: count it, rather than quietly bill zero metres.
    return mm ? round2((mm / 1000) * p.quantity) : p.quantity;
  }
  // A sail (its polygon) or a ceiling drape (its runs × its width) — lib/studio/ceiling-cloth.ts —
  // billed by the cloth it is, read against the room when the caller can, else off its own points.
  const clothRail = railOf(p);
  const cloth = clothRail ? (ctx.railAreaMm2?.(p) ?? clothAreaMm2(clothRail)) : undefined;
  if (cloth !== undefined) return round2((cloth / 1e6) * p.quantity);
  // A carpet laid to an outline (over a surface or a stage — lib/studio/cover.ts) is billed by the
  // floor it covers, curves and holes and all, not by the box round it.
  const outlined = carpetAreaMm2(p);
  if (outlined !== null) return round2((outlined / 1e6) * p.quantity);
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
      // The chairs standing at its banquettes, as the studio's chairs — a table's chairs are packed
      // off the table, a banquette's off the banquette. CHAIRS, not seats: a sofa side seats people
      // on the banquette itself and packs nothing.
      const chairRow = ctx.stagePart?.("chair");
      if (chairRow) {
        const deckOf = ctx.deckOf;
        const chairs = (p.stage.stairs ?? []).reduce((n, it) => n + (edgeKind(it) === "bench" ? (edgeItemShape(p.stage!, it, deckOf)?.chairs.length ?? 0) : 0), 0);
        if (chairs > 0) add(chairRow, chairs * p.quantity);
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
        const m2 = stageAreaMm2(p.stage, ctx.deckOf) / 1e6;
        add(p.stage.surfaceVariant, (ctx.unitOf(p.stage.surfaceVariant) === "m2" ? round2(m2) : 1) * p.quantity);
      }
      const skirt = p.stage.skirtVariant ?? ctx.stagePart?.("skirt");
      if (skirt) runOf(skirt, skirtMm(p as StagePlacement, ctx.deckOf, ctx.wallDistance));
      continue;
    }
    // A STANDALONE banquette is its own metres (below, like any item priced by the metre) AND the
    // chairs standing at it, packed as the studio's chairs exactly as a stage banquette's are. Its
    // sofa seats pack nothing, and nothing here changes what the banquette itself is billed as.
    const bench = standaloneBench(p, ctx.benchOf);
    if (bench && bench.chairSeats > 0) {
      const chairRow = ctx.stagePart?.("chair");
      if (chairRow) add(chairRow, bench.chairSeats * p.quantity);
    }
    // The vessel an arrangement stands in: one of it under every one of them.
    const vessel = ctx.vesselOf?.(p);
    if (vessel) add(vessel, p.quantity);
    // A drape on a free-standing ROD brings its rod: the studio's rod row, by the metre of the rod
    // (or one rod, for a row priced per unit) — the stage's skirt pattern. No row = nothing billed,
    // and the quote says the drape's line is partial.
    // An aisle's lining: N of its piece (and of the piece's vessel), beside the aisle's own row.
    for (const part of ctx.aisleOf?.(p) ?? []) add(part.variantId, part.count * p.quantity);
    const rodMm = broughtRodMm(p, ctx);
    const rod = rodMm > 0 ? ctx.rodOf?.() : undefined;
    if (rod) add(rod, (ctx.unitOf(rod) === "unit" ? 1 : round2(rodMm / 1000)) * p.quantity);
    add(p.variantId, measure(p, ctx));
  }
  for (const t of doc.tables) {
    if (!t.variantId) continue;
    totals.set(t.variantId, round2((totals.get(t.variantId) ?? 0) + 1));
  }
  return totals;
}
