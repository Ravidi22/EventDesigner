// A banquette (בנקט), laid out: who sits at each of its two long sides, and where.
//
// ONE FUNCTION FOR BOTH BANQUETTES. A banquette is either an edge item of a stage (StageStair kind
// "bench" — a strip along the outside of a stage edge) or a `stage-benches` catalog row standing free
// on the floor (Placement.bench). The two are drawn by different code — the stage draws its edge
// items in its own frame, a placement is drawn as a footprint — but what a banquette IS cannot differ
// between them: how many sit at it, which side the chairs stand on, what a sofa side looks like, and
// what the packing list orders. So both ask `benchLayout` and only then carry the answer into their
// own frame (lib/design-document/stage.ts maps it onto the edge; the canvas and the printed map draw a
// standalone one inside the placement's own <g>).
//
// THE FRAME here is the banquette's own: centred on (0,0), its length along x, its depth along y, the
// BACK side at −y and the FRONT at +y. For a stage edge item the back is the stage side; for a
// standalone one it is the −y side as drawn, before the placement's turn.
//
// TWO KINDS OF SIDE, TWO HEIGHTS. Chairs stand against a side and use the banquette's top as their
// table — table height, BENCH_TOP_MM above the surface the chairs stand on (the deck, for an outer
// stage banquette; the floor, for a standalone one). A sofa side is sat ON, facing away from the
// strip into the room, at SOFA_SEAT_MM above the floor the sitters' feet rest on. The drawing says
// which is which: chairs are the same chairs a table has; a sofa is a row of cushions INSIDE the strip
// — one per seat, the half of the strip on that side, with a backrest line toward the other half.
//
// COUNTING. Everyone on either side is a SEAT (the seating readout, benchSeats); only a chairs side
// packs chairs (lib/design-document/measure.ts reads `chairs.length`, never `seats`). The banquette's
// own row is quoted by the metre whatever sits at it — this file never touches a price.
//
// Pure, no DOM, self-checked: `npm run check:bench`.
import type { BenchSide, BenchSideKind, BenchSpec, Placement, Point, StageStair } from "./types";
import { CHAIR_OFFSET_MM, CHAIR_W_MM, type Seat } from "../studio/seating";
import { isMain } from "../self-check";

/** A banquette: as deep as a seat. */
export const BENCH_DEPTH_MM = 450;
/** The TOP of a banquette with chairs at it — table height above the surface the chairs stand on. */
export const BENCH_TOP_MM = 750;
/** The SEAT of a sofa side, above the floor the sitters' feet rest on. */
export const SOFA_SEAT_MM = 460;
/** The room one person takes on a banquette — what an automatic seat count is measured in. */
export const SEAT_WIDTH_MM = 600;
/** A sofa's backrest, drawn as the band between its cushions and the strip's centre line. */
export const SOFA_BACK_MM = 80;

export const BENCH_SIDE_KINDS: BenchSideKind[] = ["chairs", "sofa", "none"];
export const BENCH_SIDE_LABEL: Record<BenchSideKind, string> = { chairs: "כיסאות", sofa: "ספה", none: "ללא" };

/** What a side is when nobody said: chairs along the back, nothing along the front — which is what
 *  every banquette drawn before sides existed was. */
export const DEFAULT_BACK: BenchSideKind = "chairs";
export const DEFAULT_FRONT: BenchSideKind = "none";

/** One per 60cm of length. */
export function autoBenchSeats(widthMm: number): number {
  return Math.max(0, Math.floor(widthMm / SEAT_WIDTH_MM));
}

/** How many sit along one side: none for a bare side; else as many as were asked for (never more
 *  than fit shoulder to shoulder), or one per SEAT_WIDTH_MM. */
export function sideSeats(widthMm: number, side: BenchSide | undefined, fallback: BenchSideKind): number {
  const kind = side?.kind ?? fallback;
  if (kind === "none") return 0;
  const most = Math.max(0, Math.floor(widthMm / CHAIR_W_MM));
  const asked = side?.seats !== undefined ? Math.max(0, Math.round(side.seats)) : autoBenchSeats(widthMm);
  return Math.min(most, asked);
}

/** A stage edge item's banquette spec, with the three legacy fields (StageStair.seats/heightMm/
 *  depthMm — the back side's values, from before a banquette had two sides) read where the new form
 *  says nothing. Readers go through this; writers write `bench`. */
export function benchSpecOf(item: Pick<StageStair, "bench" | "seats" | "heightMm" | "depthMm">): BenchSpec {
  const b = item.bench ?? {};
  const spec: BenchSpec = { ...b };
  if (!spec.back && item.seats !== undefined) spec.back = { kind: "chairs", seats: item.seats };
  if (spec.heightMm === undefined && item.heightMm !== undefined) spec.heightMm = item.heightMm;
  if (spec.depthMm === undefined && item.depthMm !== undefined) spec.depthMm = item.depthMm;
  return spec;
}

export interface BenchSideLayout {
  kind: BenchSideKind;
  seats: number;
}

export interface BenchLayout {
  widthMm: number;
  depthMm: number;
  /** The top, for a chairs side — above the surface the chairs stand on. */
  heightMm: number;
  /** A sofa side's seat, above the floor. */
  sofaHeightMm: number;
  back: BenchSideLayout;
  front: BenchSideLayout;
  /** The chairs, in the banquette's frame (−y back, +y front), each facing the strip. */
  chairs: Seat[];
  /** A sofa side's cushions — one quad per seat, inside the strip on that side. */
  cushions: Point[][];
  /** A sofa side's backrest — a line along the strip, toward its other half. */
  backs: [Point, Point][];
  /** Everyone seated; of them, those on chairs (packed) and those on a sofa (not). */
  seats: number;
  chairSeats: number;
  sofaSeats: number;
}

/** Lay a banquette `widthMm` long and `depthMm` deep out of its spec. */
export function benchLayout(widthMm: number, depthMm: number, spec?: BenchSpec): BenchLayout {
  const w = Math.max(0, widthMm);
  const d = Math.max(0, depthMm);
  const half = d / 2;
  const backKind = spec?.back?.kind ?? DEFAULT_BACK;
  const frontKind = spec?.front?.kind ?? DEFAULT_FRONT;
  const back: BenchSideLayout = { kind: backKind, seats: sideSeats(w, spec?.back, DEFAULT_BACK) };
  const front: BenchSideLayout = { kind: frontKind, seats: sideSeats(w, spec?.front, DEFAULT_FRONT) };

  const chairs: Seat[] = [];
  const cushions: Point[][] = [];
  const backs: [Point, Point][] = [];
  // A cushion runs from the side's edge toward the centre line, leaving the backrest band — thinner
  // on a shallow strip, so there is always a cushion to see.
  const backBand = Math.max(0, Math.min(SOFA_BACK_MM, half - 100));

  const lay = (side: BenchSideLayout, sign: -1 | 1) => {
    const n = side.seats;
    if (n <= 0) return;
    const xAt = (i: number) => -w / 2 + (i * w) / n;
    if (side.kind === "chairs") {
      // Pushed in against the strip, facing it — a table's chairs, with the banquette as their table.
      for (let i = 0; i < n; i++) chairs.push({ x: xAt(i + 0.5), y: sign * (half + CHAIR_OFFSET_MM), facingDeg: sign === -1 ? 90 : -90 });
      return;
    }
    const edge = sign * half;
    const inner = sign * backBand;
    for (let i = 0; i < n; i++) {
      const x0 = xAt(i);
      const x1 = xAt(i + 1);
      cushions.push([
        { x: x0, y: edge },
        { x: x1, y: edge },
        { x: x1, y: inner },
        { x: x0, y: inner },
      ]);
    }
    backs.push([
      { x: -w / 2, y: inner },
      { x: w / 2, y: inner },
    ]);
  };
  lay(back, -1);
  lay(front, 1);

  const chairSeats = (back.kind === "chairs" ? back.seats : 0) + (front.kind === "chairs" ? front.seats : 0);
  const sofaSeats = (back.kind === "sofa" ? back.seats : 0) + (front.kind === "sofa" ? front.seats : 0);
  return {
    widthMm: w,
    depthMm: d,
    heightMm: spec?.heightMm && spec.heightMm > 0 ? spec.heightMm : BENCH_TOP_MM,
    sofaHeightMm: spec?.sofaHeightMm && spec.sofaHeightMm > 0 ? spec.sofaHeightMm : SOFA_SEAT_MM,
    back,
    front,
    chairs,
    cushions,
    backs,
    seats: chairSeats + sofaSeats,
    chairSeats,
    sofaSeats,
  };
}

// ── Standalone banquettes ─────────────────────────────────────────────────────────────────────

/** Says whether a placement is a `stage-benches` row standing free, and how big: its box on the
 *  plan (stretched size, else the catalog's). Null for anything else. The CATALOG decides — a stage,
 *  a perched item and a table item are never one — so the pure code here needs no catalog of its
 *  own; lib/studio/catalog-resolver.ts has the app's one (`benchOf`). */
export type BenchLookup = (p: Placement) => { widthMm: number; depthMm: number } | null;

/** The layout of a standalone banquette, or null for a placement that is not one. */
export function standaloneBench(p: Placement, benches: BenchLookup | undefined): BenchLayout | null {
  if (!benches || p.stage || p.perch || p.tableId) return null;
  const box = benches(p);
  if (!box) return null;
  return benchLayout(box.widthMm, box.depthMm, p.bench);
}

/** Everyone a document's standalone banquettes seat. A placement's quantity multiplies, as it does
 *  on the packing list. */
export function standaloneBenchSeats(placements: readonly Placement[], benches: BenchLookup | undefined): number {
  let n = 0;
  for (const p of placements) n += (standaloneBench(p, benches)?.seats ?? 0) * Math.max(1, p.quantity);
  return n;
}

/** Whether a standalone banquette takes part in the plan's numbering: somebody sits at it AND it
 *  carries a number (the designer may clear it — "optional" means optional). With nobody seated the
 *  number is kept underneath and comes back with the first seat. */
export function benchIsNumbered(p: Placement, layout: BenchLayout | null): layout is BenchLayout {
  return !!layout && layout.seats > 0 && p.bench?.number !== undefined;
}

/** A spec with one side patched — kind and/or count (`seats: null` = back to automatic). */
export function patchBenchSide(spec: BenchSpec | undefined, side: "back" | "front", patch: { kind?: BenchSideKind; seats?: number | null }): BenchSpec {
  const cur: BenchSide = spec?.[side] ?? { kind: side === "back" ? DEFAULT_BACK : DEFAULT_FRONT };
  const next: BenchSide = { ...cur, ...(patch.kind !== undefined ? { kind: patch.kind } : {}) };
  if (patch.seats === null) delete next.seats;
  else if (patch.seats !== undefined) next.seats = Math.max(0, Math.round(patch.seats));
  return { ...spec, [side]: next };
}

// ponytail: self-check. Run: npm run check:bench
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };

  // ── Defaults: chairs along the back, nothing along the front — the banquette every stage had.
  const plain = benchLayout(6000, BENCH_DEPTH_MM);
  assert(plain.back.kind === "chairs" && plain.front.kind === "none", "a banquette nobody configured has chairs at its back and nothing at its front");
  assert(plain.seats === 10 && plain.chairSeats === 10 && plain.sofaSeats === 0, "…one chair per 60cm of a 6m run");
  assert(plain.chairs.length === 10 && plain.cushions.length === 0, "…drawn as ten chairs and no cushions");
  assert(plain.chairs.every((c) => c.y === -(BENCH_DEPTH_MM / 2 + CHAIR_OFFSET_MM) && c.facingDeg === 90), "…standing behind the back side, tucked in, facing the strip");
  assert(plain.heightMm === BENCH_TOP_MM && plain.sofaHeightMm === SOFA_SEAT_MM, "…its top at table height, a sofa seat at 46cm");
  const xs = plain.chairs.map((c) => c.x);
  assert(Math.abs(xs[0] + xs[xs.length - 1]) < 1e-6 && Math.abs(xs[1] - xs[0] - 600) < 1e-6, "…spread evenly along it, symmetric about its middle");

  // ── A set count, and a cap at what fits.
  assert(benchLayout(6000, 450, { back: { kind: "chairs", seats: 3 } }).chairs.length === 3, "a typed count is what is drawn");
  assert(benchLayout(6000, 450, { back: { kind: "chairs", seats: 99 } }).seats === Math.floor(6000 / CHAIR_W_MM), "…never more than fit shoulder to shoulder");
  assert(benchLayout(6000, 450, { back: { kind: "chairs", seats: 0 } }).seats === 0, "…and zero is zero");
  assert(benchLayout(6000, 450, { back: { kind: "none" } }).seats === 0, "a bare back seats nobody");

  // ── A sofa side: seats, no chairs; cushions on its half, a backrest toward the other half.
  const sofa = benchLayout(3000, 600, { back: { kind: "sofa" } });
  assert(sofa.seats === 5 && sofa.sofaSeats === 5 && sofa.chairSeats === 0, "a 3m sofa seats five, and packs no chairs");
  assert(sofa.chairs.length === 0 && sofa.cushions.length === 5 && sofa.backs.length === 1, "…drawn as five cushions and one backrest");
  assert(sofa.cushions.every((q) => q.every((p) => p.y <= 0 && p.y >= -300)), "…the cushions on the back half of the strip");
  assert(sofa.cushions.every((q) => Math.min(...q.map((p) => p.y)) === -300 && Math.max(...q.map((p) => p.y)) === -SOFA_BACK_MM), "…from the back edge to the backrest band");
  assert(sofa.backs[0][0].y === -SOFA_BACK_MM && sofa.backs[0][1].y === -SOFA_BACK_MM, "…the backrest line toward the strip's other half");
  const shallow = benchLayout(3000, 300, { front: { kind: "sofa" } });
  assert(shallow.cushions.every((q) => Math.max(...q.map((p) => p.y)) === 150 && Math.min(...q.map((p) => p.y)) === 50), "a shallow strip thins the backrest so a cushion still shows");

  // ── Both sides, independently.
  const both = benchLayout(4800, 600, { back: { kind: "chairs", seats: 6 }, front: { kind: "sofa", seats: 4 } });
  assert(both.seats === 10 && both.chairSeats === 6 && both.sofaSeats === 4, "chairs at the back and a sofa at the front add up");
  assert(both.chairs.length === 6 && both.chairs.every((c) => c.y < 0), "…the chairs behind the back");
  assert(both.cushions.length === 4 && both.cushions.every((q) => q.every((p) => p.y >= 0)), "…the cushions on the front half");
  const frontChairs = benchLayout(2400, 450, { front: { kind: "chairs" }, back: { kind: "none" } });
  assert(frontChairs.chairs.length === 4 && frontChairs.chairs.every((c) => c.y === 225 + CHAIR_OFFSET_MM && c.facingDeg === -90), "chairs at the front stand in front of it, facing back at it");
  const twoSofas = benchLayout(3000, 600, { back: { kind: "sofa" }, front: { kind: "sofa" } });
  assert(twoSofas.seats === 10 && twoSofas.backs.length === 2, "a sofa both ways seats both ways");

  // ── Heights are the designer's when typed.
  const tall = benchLayout(3000, 450, { heightMm: 900, sofaHeightMm: 400 });
  assert(tall.heightMm === 900 && tall.sofaHeightMm === 400, "typed heights are read back");
  assert(benchLayout(3000, 450, { heightMm: 0 }).heightMm === BENCH_TOP_MM, "…a zero height falls back to the default");

  // ── The legacy stage edge item reads as the back side.
  const legacy = benchSpecOf({ seats: 4, heightMm: 500, depthMm: 500 });
  assert(legacy.back?.kind === "chairs" && legacy.back.seats === 4 && legacy.heightMm === 500 && legacy.depthMm === 500, "an old edge item's seats, height and depth are its back side's");
  const newer = benchSpecOf({ seats: 4, bench: { back: { kind: "sofa" }, front: { kind: "chairs", seats: 2 } } });
  assert(newer.back?.kind === "sofa" && newer.back.seats === undefined && newer.front?.seats === 2, "…and the new form wins over it where it speaks");
  assert(benchSpecOf({}).back === undefined, "an item with neither says nothing — the defaults apply");

  // ── Patching a side.
  const patched = patchBenchSide(undefined, "front", { kind: "sofa" });
  assert(patched.front?.kind === "sofa" && patched.back === undefined, "patching the front leaves the back to its default");
  const counted = patchBenchSide(patched, "front", { seats: 3 });
  assert(counted.front?.kind === "sofa" && counted.front.seats === 3, "…a count keeps the kind");
  assert(patchBenchSide(counted, "front", { seats: null }).front?.seats === undefined, "…and null puts the count back to automatic");

  // ── Standalone banquettes: the catalog says which placement is one.
  const free = (id: string, bench?: BenchSpec, extra: Partial<Placement> = {}): Placement => ({
    id,
    variantId: "bench",
    layer: "floor",
    quantity: 1,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: 1,
    ...(bench ? { bench } : {}),
    ...extra,
  });
  const benches: BenchLookup = (p) => (p.variantId === "bench" ? (p.sizeMm ?? { widthMm: 3000, depthMm: 450 }) : null);
  assert(standaloneBench(free("a"), benches)?.seats === 5, "a banquette off the rail seats one per 60cm of its catalog length");
  assert(standaloneBench(free("b", undefined, { sizeMm: { widthMm: 6000, depthMm: 450 } }), benches)?.seats === 10, "…stretched on the plan, of its stretched length");
  assert(standaloneBench(free("c", undefined, { variantId: "arch" }), benches) === null, "an arch is not a banquette");
  assert(standaloneBench(free("d", undefined, { perch: { stageId: "s", itemId: "i" } }), benches) === null, "…nor is a banquette row perched on a stage's banquette");
  assert(standaloneBench(free("e"), undefined) === null, "with no catalog to ask, nothing is a banquette");
  assert(standaloneBenchSeats([free("a"), free("b", { back: { kind: "none" } }), free("c", undefined, { quantity: 2 })], benches) === 15, "the readout sums them, a quantity multiplying");

  // ── Numbered when seated and numbered; the number waits under an empty one.
  const numbered = free("n", { number: 4 });
  assert(benchIsNumbered(numbered, standaloneBench(numbered, benches)), "a seated banquette with a number is a numbered unit");
  const empty = free("m", { number: 4, back: { kind: "none" } });
  assert(!benchIsNumbered(empty, standaloneBench(empty, benches)), "…with nobody seated it takes no number");
  assert(!benchIsNumbered(free("o"), standaloneBench(free("o"), benches)), "…and without a number it is not numbered, seated or not");

  console.log("bench self-check passed");
}
