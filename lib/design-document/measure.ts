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
 *  list total over. */
export function measureTotals(doc: DesignDocumentContent, ctx: MeasureContext): Map<string, number> {
  const totals = new Map<string, number>();
  for (const p of doc.placements) {
    totals.set(p.variantId, round2((totals.get(p.variantId) ?? 0) + measure(p, ctx)));
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

  console.log("measure self-check passed");
}
