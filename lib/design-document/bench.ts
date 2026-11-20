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
// packs chairs (lib/design-document/measure.ts reads `chairs.length`, never `seats`). A sofa side may
// be "not seating" (BenchSide.notSeating): the readout leaves its sitters out (`countedSeats`), the
// numbering and the occupancy do not (`seats`). The banquette's own row is quoted by the metre
// whatever sits at it — this file never touches a price.
//
// Pure, no DOM, self-checked: `npm run check:bench`.
import type { BenchSide, BenchSideKind, BenchSpec, Placement, Point, StageStair } from "./types";
import { CHAIR_OFFSET_MM, CHAIR_W_MM, type Seat } from "../studio/seating";
import { footprintOutlines, type Footprint } from "../studio/footprint";
import { footprintSpine, pointAlong, spineLength } from "../studio/spine";
import { flatRing } from "../studio/label-anchor";
import { polygonAreaMm2 } from "../studio/geometry";
import { isMain } from "../self-check";

/** A banquette nobody sits AT: as deep as a seat (a sofa side, a bare strip). */
export const BENCH_DEPTH_MM = 450;
/** A banquette with CHAIRS at it is their table, and a table is 60 deep (2026-10-31, the user:
 *  "a banquette with seats needs to be 60 deep") — a 45cm strip is a shelf, not a place to eat. */
export const BENCH_TABLE_DEPTH_MM = 600;

/** How deep a banquette is when nobody typed it: table-deep with chairs along either side, seat-deep
 *  otherwise. Read by a stage's edge banquette (lib/design-document/stage.ts) and by the drop of a
 *  standalone one; a typed depth (BenchSpec.depthMm, a stretched Placement.sizeMm) always wins. */
export function benchDefaultDepth(spec?: BenchSpec): number {
  const back = spec?.back?.kind ?? DEFAULT_BACK;
  const front = spec?.front?.kind ?? DEFAULT_FRONT;
  return back === "chairs" || front === "chairs" ? BENCH_TABLE_DEPTH_MM : BENCH_DEPTH_MM;
}
/** The TOP of a banquette with chairs at it — table height above the surface the chairs stand on. */
export const BENCH_TOP_MM = 750;
/** The SEAT of a sofa side, above the floor the sitters' feet rest on. */
export const SOFA_SEAT_MM = 460;
/** The room one person takes on a banquette — what an automatic seat count is measured in. */
export const SEAT_WIDTH_MM = 600;
/** A sofa's backrest, drawn as the band between its cushions and the strip's centre line. */
export const SOFA_BACK_MM = 80;
/** What a CHAIRS side keeps of the strip for its table when a sofa sits on the other side: a place
 *  setting's depth — or half a strip shallower than two of them. */
export const CHAIR_TABLE_MM = 300;
/** A sofa's seat is never drawn thinner than this — a cushion to see. */
const SEAT_MIN_MM = 20;
/** The range a banquette's TOP is typed in — the chairs' table, above the floor they stand on — and a
 *  sofa side's SEAT; one range for a stage's banquette and a standalone one (QA BQ-10). */
export const BENCH_TOP_RANGE_MM = { min: 200, max: 1500 } as const;
export const SOFA_SEAT_RANGE_MM = { min: 300, max: 700 } as const;

/** The backrest band between a sofa side's cushions and the strip's centre line — thinner on a
 *  shallow strip, so there is always a cushion to see. */
export function sofaBand(depthMm: number): number {
  return Math.max(0, Math.min(SOFA_BACK_MM, depthMm / 2 - 100));
}

/** A sofa side's seat when nobody typed one: its half of the strip less the backrest band. */
export function sofaSeatDefault(depthMm: number): number {
  return Math.max(0, depthMm / 2 - sofaBand(depthMm));
}

/** The deepest a sofa side's seat may be on a strip `depthMm` deep, given the OTHER side: the strip
 *  less the backrest band and whatever the other side takes — its own seat (a sofa), its table
 *  (chairs: CHAIR_TABLE_MM, or half a shallow strip), nothing (bare). */
export function sofaSeatMax(depthMm: number, other: { kind: BenchSideKind; depthMm?: number }): number {
  const d = Math.max(0, depthMm);
  const takes = other.kind === "chairs" ? Math.min(CHAIR_TABLE_MM, d / 2) : other.kind === "sofa" ? (other.depthMm ?? sofaSeatDefault(d)) : 0;
  return Math.max(0, d - sofaBand(d) - takes);
}

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
  /** What it seats when nobody types a count: one per 60 cm of ITS run (a sofa's, else the strip's;
   *  QA BQ-9), none on a bare side — what "back to automatic" puts back. */
  autoSeats: number;
  /** A sofa side's run and seat depth as DRAWN (typed, else the defaults; held to the strip and to
   *  the other side — QA BQ-2) — what the bar shows. */
  widthMm?: number;
  depthMm?: number;
  /** …the deepest its seat may be beside the other side as laid, and its seat when nobody typed one —
   *  the bar's field runs between them. */
  depthMaxMm?: number;
  depthDefaultMm?: number;
  /** A sofa side the designer said is not seating (BenchSide.notSeating) — out of the readout's count. */
  notSeating?: true;
}

export interface BenchLayout {
  /** The strip's length — along its spine, for a shaped one — and its depth (the band's). */
  widthMm: number;
  depthMm: number;
  /** Laid along a SHAPE's spine rather than a straight strip (benchLayoutFor): the chairs and
   *  cushions are in the footprint's frame, and the top is the footprint, not a w×d rectangle. */
  shaped?: boolean;
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
  /** Of everyone seated, those the seating readout COUNTS: every chair, and a sofa side's sitters
   *  unless it is not seating (BenchSide.notSeating). The numbering and the occupancy go by `seats`
   *  — a banquette people sit on keeps its number whether they are counted or not. */
  countedSeats: number;
  /** The strip as the room raises it, side by side (benchBlocks) — in this layout's frame; carried
   *  along the spine (`outline`) for a shaped banquette. */
  blocks: BenchBlock[];
}

/** A block of a banquette as the room raises it (lib/scene): along the strip x0…x1, across it y0…y1
 *  (the banquette's own frame, −y the back). `kind`: "table" — the top chairs eat at (or a bare
 *  strip's top), at BenchLayout.heightMm; "seat" — a sofa side's seat under its cushions; "back" — a
 *  sofa's backrest, or the strip behind a sofa nobody eats at (its solid back). `side`: whose floor
 *  its top stands above ("both" = the higher). `core`: the strip between the two sides, end to end. */
export interface BenchBlock {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  kind: "table" | "seat" | "back";
  side: "back" | "front" | "both";
  core?: true;
  /** Its outline where the strip is not straight — a shaped banquette's spine, a stage's curve. */
  outline?: Point[];
}

/** A sofa's backrest is this thick behind its cushions (or what the strip leaves). */
export const BACKREST_THICK_MM = 60;

/** The strip cut by who is at each side, each part at ITS height (QA BQ-4/BQ-5: the room used to
 *  raise one solid to table height round a sofa's cushions, or re-derive the sofa from defaults): a
 *  sofa side's SEAT over its run from its edge to its seat's inner line, its BACKREST right behind,
 *  the strip between the sides the chairs' TABLE — or, with no chairs at it, the sofa's solid BACK
 *  (never a 75 cm slab nobody eats at — QA BQ-10) — and the strip beyond a short sofa run the same
 *  as that core. */
export function benchBlocks(lay: Pick<BenchLayout, "widthMm" | "depthMm" | "back" | "front">): BenchBlock[] {
  const w = lay.widthMm;
  const d = lay.depthMm;
  const h = d / 2;
  if (!(w > 0) || !(d > 0)) return [];
  const sofa = (s: BenchSideLayout) => s.kind === "sofa" && s.seats > 0;
  const sb = sofa(lay.back) ? Math.min(d, lay.back.depthMm ?? 0) : 0;
  const sf = sofa(lay.front) ? Math.min(d - sb, lay.front.depthMm ?? 0) : 0;
  const gap = Math.max(0, d - sb - sf);
  const both = sofa(lay.back) && sofa(lay.front);
  const thick = (on: boolean) => (on ? Math.min(BACKREST_THICK_MM, both ? gap / 2 : gap) : 0);
  const tb = thick(sofa(lay.back));
  const tf = thick(sofa(lay.front));
  const chairs = lay.back.kind === "chairs" ? "back" : lay.front.kind === "chairs" ? "front" : null;
  const coreKind: BenchBlock["kind"] = chairs || !(sofa(lay.back) || sofa(lay.front)) ? "table" : "back";
  const coreSide: BenchBlock["side"] = chairs ?? (both ? "both" : sofa(lay.back) ? "back" : "front");
  const out: BenchBlock[] = [];
  const y0 = -h + sb + tb;
  const y1 = h - sf - tf;
  if (y1 - y0 > 0.5) out.push({ x0: -w / 2, x1: w / 2, y0, y1, kind: coreKind, side: coreSide, core: true });
  const span = (a: number, b: number) => ({ y0: Math.min(a, b), y1: Math.max(a, b) });
  const sofaBlocks = (s: BenchSideLayout, key: "back" | "front", seat: number, t: number) => {
    if (!sofa(s)) return;
    const r = Math.min(w, s.widthMm ?? w);
    const sign = key === "back" ? -1 : 1;
    const edge = sign * h;
    const inner = sign * (h - seat);
    const behind = sign * (h - seat - t);
    out.push({ x0: -r / 2, x1: r / 2, ...span(edge, inner), kind: "seat", side: key });
    if (t > 0.5) out.push({ x0: -r / 2, x1: r / 2, ...span(inner, behind), kind: "back", side: key });
    if (r < w - 1)
      for (const [x0, x1] of [
        [-w / 2, -r / 2],
        [r / 2, w / 2],
      ])
        out.push({ x0, x1, ...span(edge, behind), kind: coreKind, side: coreSide });
  };
  sofaBlocks(lay.back, "back", sb, tb);
  sofaBlocks(lay.front, "front", sf, tf);
  return out;
}

/** Lay a banquette `widthMm` long and `depthMm` deep out of its spec. */
export function benchLayout(widthMm: number, depthMm: number, spec?: BenchSpec): BenchLayout {
  const w = Math.max(0, widthMm);
  const d = Math.max(0, depthMm);
  const half = d / 2;
  const backKind = spec?.back?.kind ?? DEFAULT_BACK;
  const frontKind = spec?.front?.kind ?? DEFAULT_FRONT;
  // A cushion runs from the side's edge toward the centre line, leaving the backrest band (sofaBand).
  const seatDefault = sofaSeatDefault(d);
  const sofaRun = (side: BenchSide | undefined) => (side?.kind === "sofa" && side.widthMm && side.widthMm > 0 ? Math.min(w, Math.round(side.widthMm)) : w);
  // The seat each sofa side asks for — typed, else the default — held to what the strip leaves beside
  // the other side's kind (sofaSeatMax: never onto the chairs' table, never past the far edge). Two
  // sofas share the strip less one backrest band, and asking more than it holds between them both
  // give way in proportion — what the bar writes never asks it (patchBenchSide). QA BQ-2: the seat
  // shown, drawn and stored used to be three different numbers, and two sides overlapped.
  const wants = (side: BenchSide | undefined) => (side?.depthMm && side.depthMm > 0 ? Math.round(side.depthMm) : seatDefault);
  let seatB = backKind === "sofa" ? wants(spec?.back) : 0;
  let seatF = frontKind === "sofa" ? wants(spec?.front) : 0;
  if (backKind === "sofa" && frontKind === "sofa") {
    const room = Math.max(0, d - sofaBand(d));
    if (seatB + seatF > room) {
      const k = room / (seatB + seatF);
      seatB = Math.floor(seatB * k);
      seatF = Math.floor(seatF * k);
    }
  } else {
    if (backKind === "sofa") seatB = Math.min(seatB, sofaSeatMax(d, { kind: frontKind }));
    if (frontKind === "sofa") seatF = Math.min(seatF, sofaSeatMax(d, { kind: backKind }));
  }
  const seatMin = Math.min(SEAT_MIN_MM, half);
  if (backKind === "sofa") seatB = Math.max(seatMin, seatB);
  if (frontKind === "sofa") seatF = Math.max(seatMin, seatF);
  const sideOf = (side: BenchSide | undefined, fallback: BenchSideKind, seat: number, other: { kind: BenchSideKind; depthMm?: number }): BenchSideLayout => {
    const kind = side?.kind ?? fallback;
    // A sofa seats along ITS run, not the whole strip's — and goes back to one per 60 cm of it.
    const run = kind === "sofa" ? sofaRun(side) : w;
    return {
      kind,
      seats: sideSeats(run, side, fallback),
      autoSeats: sideSeats(run, { kind }, fallback),
      ...(kind === "sofa" ? { widthMm: run, depthMm: seat, depthMaxMm: Math.max(seatMin, sofaSeatMax(d, other)), depthDefaultMm: seatDefault, ...(side?.notSeating ? { notSeating: true as const } : {}) } : {}),
    };
  };
  const back = sideOf(spec?.back, DEFAULT_BACK, seatB, { kind: frontKind, ...(frontKind === "sofa" ? { depthMm: seatF } : {}) });
  const front = sideOf(spec?.front, DEFAULT_FRONT, seatF, { kind: backKind, ...(backKind === "sofa" ? { depthMm: seatB } : {}) });

  const chairs: Seat[] = [];
  const cushions: Point[][] = [];
  const backs: [Point, Point][] = [];

  const lay = (side: BenchSideLayout, sign: -1 | 1) => {
    const n = side.seats;
    if (n <= 0) return;
    if (side.kind === "chairs") {
      const xAt = (i: number) => -w / 2 + (i * w) / n;
      // Pushed in against the strip, facing it — a table's chairs, with the banquette as their table.
      for (let i = 0; i < n; i++) chairs.push({ x: xAt(i + 0.5), y: sign * (half + CHAIR_OFFSET_MM), facingDeg: sign === -1 ? 90 : -90 });
      return;
    }
    // A sofa: its run centred on the strip, its seat from the edge in (as held above), the backrest
    // line at the seat's inner edge.
    const run = side.widthMm ?? w;
    const seatDepth = side.depthMm ?? seatDefault;
    const xAt = (i: number) => -run / 2 + (i * run) / n;
    const edge = sign * half;
    const inner = sign * (half - seatDepth);
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
      { x: -run / 2, y: inner },
      { x: run / 2, y: inner },
    ]);
  };
  lay(back, -1);
  lay(front, 1);

  const chairSeats = (back.kind === "chairs" ? back.seats : 0) + (front.kind === "chairs" ? front.seats : 0);
  const sofaSeats = (back.kind === "sofa" ? back.seats : 0) + (front.kind === "sofa" ? front.seats : 0);
  const counted = (side: BenchSideLayout) => (side.kind === "none" || side.notSeating ? 0 : side.seats);
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
    countedSeats: counted(back) + counted(front),
    blocks: benchBlocks({ widthMm: w, depthMm: d, back, front }),
  };
}

// ── A banquette of any shape ─────────────────────────────────────────────────────────────────

const ringLength = (ring: readonly Point[]) => ring.reduce((t, p, i) => t + Math.hypot(ring[(i + 1) % ring.length].x - p.x, ring[(i + 1) % ring.length].y - p.y), 0);

/**
 * A banquette laid along the SHAPE it was drawn as (2026-10-31, the user: a banquette "with odd
 * shapes doesn't behave and draw like a banquette"). A straight strip wider than deep is the plain
 * layout above. Anything else — a crescent, a ח, a strip drawn deep, an oval — is read as a BAND:
 * its length is its spine's (lib/studio/spine.ts, the mid-line walked along the ridge of depth),
 * its depth the band's (2·area ÷ perimeter, the straight bar's own reading in bar-draw.ts), and
 * each side is laid along the spine instead of along x — a chair at every seat's point, stood off
 * the band by half its depth on that side and faced square at it; a sofa's cushions as quads
 * between the edge line and the seat's inner line, its backrest a segment per seat so a curve bends
 * with it. Which side is the BACK: the one that lies toward −y (where a straight strip's back is),
 * decided once over the whole spine, so a turned crescent keeps its chairs on the same rim. In the
 * footprint's own frame, like everything a placement draws.
 */
export function benchLayoutFor(footprint: Footprint, spec?: BenchSpec): BenchLayout {
  if (footprint.kind === "rect" && footprint.widthMm >= footprint.depthMm) return benchLayout(footprint.widthMm, footprint.depthMm, spec);
  const spine = footprintSpine(footprint);
  const L = spineLength(spine);
  const ring = footprintOutlines(footprint)
    .map(flatRing)
    .filter((r) => r.length >= 3)
    .sort((a, b) => polygonAreaMm2(b) - polygonAreaMm2(a))[0];
  const area = ring ? Math.abs(polygonAreaMm2(ring)) : 0;
  const perimeter = ring ? ringLength(ring) : 0;
  // The band's depth; a strip drawn deep (a 45×300 rectangle) is exactly its short side.
  const d = footprint.kind === "rect" ? Math.min(footprint.widthMm, footprint.depthMm) : Math.max(1, Math.round(area > 0 && perimeter > 0 ? (2 * area) / perimeter : 0));
  if (!(L > 0) || !(d > 0)) return { ...benchLayout(0, 0, spec), shaped: true };
  // The straight layout, laid along a strip L long and d deep — the counts, heights and the cushion
  // and chair positions along x — then every point carried onto the spine.
  const straight = benchLayout(L, d, spec);
  const eps = Math.min(50, L / 4);
  const frame = (s: number) => {
    const p = pointAlong(spine, s);
    const a = pointAlong(spine, Math.max(0, s - eps));
    const b = pointAlong(spine, Math.min(L, s + eps));
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    return { p, u, n: { x: -u.y, y: u.x } };
  };
  // Which way "−y" (the back) lies off the spine: the normal side that points toward −y over the
  // whole spine (a vertical strip's is a tie, and goes to +n — its left).
  let lower = 0;
  for (let k = 0; k <= 8; k++) lower += -frame((L * k) / 8).n.y;
  const backSign = lower >= 0 ? 1 : -1; // +n lies toward −y when lower ≥ 0
  const carry = (x: number, y: number): Point => {
    const { p, n } = frame(x + L / 2);
    // The straight frame's −y is the back: y < 0 goes to the back's normal side.
    const k = -y * backSign;
    return { x: p.x + n.x * k, y: p.y + n.y * k };
  };
  const face = (x: number, deg: number): number => {
    const { u, n } = frame(x + L / 2);
    // 90° in the straight frame faces +y; +y maps to −backSign·n. Along-strip (0°) maps to u.
    const r = (deg * Math.PI) / 180;
    const dir = { x: u.x * Math.cos(r) - backSign * n.x * Math.sin(r), y: u.y * Math.cos(r) - backSign * n.y * Math.sin(r) };
    return (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
  };
  const chairs = straight.chairs.map((c) => ({ ...carry(c.x, c.y), facingDeg: face(c.x, c.facingDeg) }));
  const cushions = straight.cushions.map((q) => q.map((p) => carry(p.x, p.y)));
  // A backrest line per seat rather than one end to end, so it follows the curve.
  const backs: [Point, Point][] = [];
  for (const q of straight.cushions) {
    const inner = q.slice(2, 4);
    backs.push([carry(inner[1].x, inner[1].y), carry(inner[0].x, inner[0].y)]);
  }
  // The room's blocks, each carried along the spine as an outline (sampled every ~15 cm).
  const blocks = straight.blocks.map((b) => {
    const n = Math.max(1, Math.ceil((b.x1 - b.x0) / 150));
    const xs = Array.from({ length: n + 1 }, (_, k) => b.x0 + ((b.x1 - b.x0) * k) / n);
    return { ...b, outline: [...xs.map((x) => carry(x, b.y0)), ...[...xs].reverse().map((x) => carry(x, b.y1))] };
  });
  return { ...straight, widthMm: Math.round(L), depthMm: d, chairs, cushions, backs, blocks, shaped: true };
}

// ── Standalone banquettes ─────────────────────────────────────────────────────────────────────

/** Says whether a placement is a `stage-benches` row standing free, and how big: its box on the
 *  plan (stretched size, else the catalog's) — and its footprint, when the caller can draw one, so
 *  a shaped banquette is laid along its shape. Null for anything else. The CATALOG decides — a
 *  stage, a perched item and a table item are never one — so the pure code here needs no catalog of
 *  its own; lib/studio/catalog-resolver.ts has the app's one (`benchOf`). */
export type BenchLookup = (p: Placement) => { widthMm: number; depthMm: number; footprint?: Footprint } | null;

/** The layout of a standalone banquette, or null for a placement that is not one. */
export function standaloneBench(p: Placement, benches: BenchLookup | undefined): BenchLayout | null {
  if (!benches || p.stage || p.perch || p.tableId) return null;
  const box = benches(p);
  if (!box) return null;
  return box.footprint ? benchLayoutFor(box.footprint, p.bench) : benchLayout(box.widthMm, box.depthMm, p.bench);
}

/** Everyone a document's standalone banquettes seat, as the seating readout COUNTS them — a sofa side
 *  that is not seating left out (BenchLayout.countedSeats). A placement's quantity multiplies, as it
 *  does on the packing list. */
export function standaloneBenchSeats(placements: readonly Placement[], benches: BenchLookup | undefined): number {
  let n = 0;
  for (const p of placements) n += (standaloneBench(p, benches)?.countedSeats ?? 0) * Math.max(1, p.quantity);
  return n;
}

/** Whether a standalone banquette takes part in the plan's numbering: somebody sits at it AND it
 *  carries a number (the designer may clear it — "optional" means optional). With nobody seated the
 *  number is kept underneath and comes back with the first seat. */
export function benchIsNumbered(p: Placement, layout: BenchLayout | null): layout is BenchLayout {
  return !!layout && layout.seats > 0 && p.bench?.number !== undefined;
}

/** One side of a banquette as its bar lists it: as laid, and whether its count was TYPED. */
export type BenchSideRowOf = BenchSideLayout & { set: boolean };

/** A STAGE banquette's two sides as its bar shows them: everything the layout says of each — what
 *  it is, its count, a sofa's run and seat as drawn (QA BQ-1: the bar built them from kind and count
 *  alone, so a sofa's fields read 0 and a blur wrote the fields' floors into the drawing) — and
 *  whether each count was typed, read through benchSpecOf, so a legacy `seats` is the back side's
 *  only while the new form says nothing of the back (QA BQ-10). */
export function benchSideRows(item: Pick<StageStair, "bench" | "seats" | "heightMm" | "depthMm">, lay: BenchLayout | undefined): { back: BenchSideRowOf; front: BenchSideRowOf } {
  const spec = benchSpecOf(item);
  return {
    back: { ...(lay?.back ?? { kind: DEFAULT_BACK, seats: 0, autoSeats: 0 }), set: spec.back?.seats !== undefined },
    front: { ...(lay?.front ?? { kind: DEFAULT_FRONT, seats: 0, autoSeats: 0 }), set: spec.front?.seats !== undefined },
  };
}

/** A spec with one side patched — kind, count (`seats: null` = back to automatic), and a sofa's run
 *  and seat depth (`null` = back to the whole length / the half strip).
 *
 *  Given the banquette as it is LAID now (its layout — the length and depth it is drawn at, the other
 *  side as drawn), a sofa's run and seat are WRITTEN as they will be drawn (QA BQ-2): a run as long
 *  as the banquette or longer is the whole length (so it follows a stretch), and a seat no deeper
 *  than the other side leaves it (sofaSeatMax) — while a sofa on the other side whose stored seat is
 *  deeper than it is drawn is written as drawn, so the next edit of either is exactly what is typed. */
export function patchBenchSide(
  spec: BenchSpec | undefined,
  side: "back" | "front",
  patch: { kind?: BenchSideKind; seats?: number | null; widthMm?: number | null; depthMm?: number | null; notSeating?: boolean },
  laid?: Pick<BenchLayout, "widthMm" | "depthMm" | "back" | "front">,
): BenchSpec {
  const cur: BenchSide = spec?.[side] ?? { kind: side === "back" ? DEFAULT_BACK : DEFAULT_FRONT };
  const next: BenchSide = { ...cur, ...(patch.kind !== undefined ? { kind: patch.kind } : {}) };
  // Counted as seating or not (a sofa side's "לא נספר כישיבה") — absent is counted.
  if (patch.notSeating === true) next.notSeating = true;
  else if (patch.notSeating === false) delete next.notSeating;
  if (patch.seats === null) delete next.seats;
  else if (patch.seats !== undefined) next.seats = Math.max(0, Math.round(patch.seats));
  if (patch.widthMm === null) delete next.widthMm;
  else if (patch.widthMm !== undefined) next.widthMm = Math.max(0, Math.round(patch.widthMm));
  if (patch.depthMm === null) delete next.depthMm;
  else if (patch.depthMm !== undefined) next.depthMm = Math.max(0, Math.round(patch.depthMm));
  const out: BenchSpec = { ...spec, [side]: next };
  if (laid && next.kind === "sofa") {
    if (patch.widthMm != null && next.widthMm !== undefined && next.widthMm >= laid.widthMm - 0.5) delete next.widthMm;
    if (patch.depthMm != null && next.depthMm !== undefined) {
      const other = side === "back" ? "front" : "back";
      const them = laid[other];
      next.depthMm = Math.min(next.depthMm, Math.floor(sofaSeatMax(laid.depthMm, them)));
      const theirs = spec?.[other];
      if (theirs?.kind === "sofa" && theirs.depthMm !== undefined && them.kind === "sofa" && them.depthMm !== undefined && theirs.depthMm > them.depthMm) out[other] = { ...theirs, depthMm: them.depthMm };
    }
  }
  return out;
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

  // ── The default depth: table-deep with chairs, seat-deep without.
  assert(benchDefaultDepth() === BENCH_TABLE_DEPTH_MM && benchDefaultDepth({ front: { kind: "chairs" }, back: { kind: "none" } }) === BENCH_TABLE_DEPTH_MM, "a banquette with chairs at it is 60 deep — it is their table");
  assert(benchDefaultDepth({ back: { kind: "sofa" } }) === BENCH_DEPTH_MM && benchDefaultDepth({ back: { kind: "none" } }) === BENCH_DEPTH_MM, "…a sofa or a bare strip stays seat-deep");

  // ── A sofa's own run and seat depth.
  const shortSofa = benchLayout(6000, 600, { back: { kind: "sofa", widthMm: 2400, depthMm: 400 } });
  assert(shortSofa.seats === 4 && shortSofa.cushions.length === 4, "a 2.4m sofa on a 6m banquette seats four, not ten");
  assert(shortSofa.cushions.every((q) => q.every((p) => p.x >= -1200 && p.x <= 1200)), "…its cushions centred on the strip, inside its run");
  assert(shortSofa.cushions.every((q) => Math.min(...q.map((p) => p.y)) === -300 && Math.max(...q.map((p) => p.y)) === 100), "…and 40cm deep from the edge in");
  assert(shortSofa.backs[0][0].x === -1200 && shortSofa.backs[0][1].x === 1200 && shortSofa.backs[0][0].y === 100, "…the backrest along the run at the seat's inner edge");
  assert(shortSofa.back.widthMm === 2400 && shortSofa.back.depthMm === 400, "…and the layout says what was laid");
  assert(benchLayout(3000, 600, { back: { kind: "sofa", depthMm: 5000 } }).cushions.every((q) => Math.max(...q.map((p) => p.y)) <= 280), "a seat deeper than the strip stops short of its far edge");
  const widened = patchBenchSide(patchBenchSide(undefined, "back", { kind: "sofa", widthMm: 2000, depthMm: 350 }), "back", { widthMm: null });
  assert(widened.back?.widthMm === undefined && widened.back?.depthMm === 350, "null puts a sofa's run back to the whole length and keeps its depth");

  // ── A sofa's seat is what is DRAWN, and it never runs into the other side (QA BQ-2).
  //    (a) The default seat on a 45 cm strip is under the old field floor of 20 cm — the bar is told it.
  const plain45 = benchLayout(3000, 450, { back: { kind: "none" }, front: { kind: "sofa" } });
  assert(plain45.front.depthMm === 145 && plain45.front.depthDefaultMm === 145, "a 45 cm strip's default seat is 14.5 cm, and the layout says so");
  //    (b) A seat typed deeper than the strip: the layout says what it draws.
  const deepSeat = benchLayout(3000, 450, { back: { kind: "none" }, front: { kind: "sofa", depthMm: 800 } });
  const drawnDepth = (q: Point[]) => Math.max(...q.map((p) => p.y)) - Math.min(...q.map((p) => p.y));
  assert(deepSeat.front.depthMm === 450 - SOFA_BACK_MM && deepSeat.cushions.every((q) => drawnDepth(q) === deepSeat.front.depthMm), "a seat typed deeper than the strip is drawn to the strip less its backrest — and that is the number read back");
  assert(deepSeat.front.depthMaxMm === 450 - SOFA_BACK_MM, "…which is the most the bar offers");
  //    …and WRITTEN as drawn: a deeper strip later never brings back a hidden 80 cm seat.
  const sofa45: BenchSpec = { back: { kind: "none" }, front: { kind: "sofa" } };
  const clampedSpec = patchBenchSide(sofa45, "front", { depthMm: 800 }, benchLayout(3000, 450, sofa45));
  assert(clampedSpec.front?.depthMm === 450 - SOFA_BACK_MM, "a seat deeper than the strip is stored as the deepest it draws");
  assert(benchLayout(3000, 1000, clampedSpec).front.depthMm === 450 - SOFA_BACK_MM, "…so deepening the banquette keeps the seat that was shown");
  //    (c) A run as long as the banquette or longer is the whole length — it follows a stretch.
  const frontSofa: BenchSpec = { front: { kind: "sofa" } };
  const longRun = patchBenchSide(frontSofa, "front", { widthMm: 4000 }, benchLayout(2400, 600, frontSofa));
  assert(longRun.front?.widthMm === undefined && benchLayout(6000, 600, longRun).front.widthMm === 6000, "a sofa typed longer than its banquette runs the whole length, and stretches with it");
  assert(patchBenchSide(frontSofa, "front", { widthMm: 1800 }, benchLayout(2400, 600, frontSofa)).front?.widthMm === 1800, "…a shorter run is kept as typed");
  //    (d) Two sides share the strip: a sofa never sits on the chairs' table, two sofas never overlap.
  const besideChairs = benchLayout(3000, 600, { back: { kind: "chairs" }, front: { kind: "sofa", depthMm: 500 } });
  assert(besideChairs.front.depthMm === 600 - CHAIR_TABLE_MM - SOFA_BACK_MM && besideChairs.cushions.every((q) => q.every((p) => p.y >= 0)), "beside chairs a sofa keeps off their table — a 30 cm place, the backrest between");
  assert(besideChairs.front.depthMaxMm === besideChairs.front.depthMm, "…and the bar's most is that");
  assert(benchLayout(3000, 1000, { back: { kind: "chairs" }, front: { kind: "sofa", depthMm: 500 } }).front.depthMm === 500, "…a deeper banquette leaves the sofa room to be deeper");
  const twoDeep = benchLayout(3000, 600, { back: { kind: "sofa", depthMm: 400 }, front: { kind: "sofa", depthMm: 400 } });
  const backInner = Math.max(...twoDeep.cushions.slice(0, twoDeep.back.seats).flat().map((p) => p.y));
  const frontInner = Math.min(...twoDeep.cushions.slice(twoDeep.back.seats).flat().map((p) => p.y));
  assert(frontInner - backInner >= SOFA_BACK_MM - 1, `two sofas typed 40 cm on a 60 cm strip share it — never overlapping, a backrest between (${backInner}…${frontInner})`);
  const backToBack: BenchSpec = { back: { kind: "sofa", depthMm: 300 }, front: { kind: "sofa" } };
  const nextToSofa = patchBenchSide(backToBack, "front", { depthMm: 400 }, benchLayout(3000, 600, backToBack));
  assert(nextToSofa.front?.depthMm === 600 - SOFA_BACK_MM - 300, "a seat typed beside another sofa is written to what the other leaves");
  const squeezed: BenchSpec = { back: { kind: "sofa", depthMm: 450 }, front: { kind: "sofa", depthMm: 450 } };
  const evened = patchBenchSide(squeezed, "front", { depthMm: 200 }, benchLayout(3000, 600, squeezed));
  assert(evened.back?.depthMm === benchLayout(3000, 600, squeezed).back.depthMm && benchLayout(3000, 600, evened).front.depthMm === 200, "…and a sofa beside it stored deeper than it is drawn is written as drawn, so the next edit is exactly what is typed");
  // ── A side seats one per 60 cm of ITS run when nobody typed a count (QA BQ-9).
  assert(benchLayout(6000, 600, { back: { kind: "sofa", widthMm: 2400 } }).back.autoSeats === 4, "a 2.4 m sofa on a 6 m banquette goes back to four, not ten");
  assert(benchLayout(6000, 600).back.autoSeats === 10 && benchLayout(6000, 600).front.autoSeats === 0, "…a chairs side to one per 60 cm of the banquette, a bare side to none");

  // ── The bar's rows for a STAGE banquette (QA BQ-1): its sofa side's run and seat as laid — the
  //    fields read 0 and a blur wrote the field's floor into the drawing — and whether each count
  //    was typed, through benchSpecOf (QA BQ-10: a legacy count is the back side's only while the new
  //    form says nothing of the back).
  const edgeSofa: Pick<StageStair, "bench"> = { bench: { back: { kind: "chairs" }, front: { kind: "sofa", widthMm: 2400, depthMm: 200 } } };
  const edgeRows = benchSideRows(edgeSofa, benchLayout(6000, 600, benchSpecOf(edgeSofa)));
  assert(edgeRows.front.kind === "sofa" && edgeRows.front.widthMm === 2400 && edgeRows.front.depthMm === 200, "a stage banquette's sofa side reads its run and seat as laid, never 0");
  assert(!edgeRows.front.set && !edgeRows.back.set && edgeRows.back.kind === "chairs" && edgeRows.back.seats === 10, "…its chairs side as laid, and no count typed on either");
  const legacySofa = { seats: 4, bench: { back: { kind: "sofa" as const } } };
  assert(!benchSideRows(legacySofa, benchLayout(3000, 450, benchSpecOf(legacySofa))).back.set, "a legacy chair count under a back the new form names is not that side's typed count");
  assert(benchSideRows({ seats: 4 }, benchLayout(3000, 450, benchSpecOf({ seats: 4 }))).back.set, "…while the new form says nothing of the back, it is");
  assert(benchSideRows({}, undefined).back.kind === "chairs" && benchSideRows({}, undefined).front.kind === "none", "with no layout the sides are the defaults");

  // ── A banquette of any shape is laid along its spine.
  const strip: Footprint = { kind: "rect", widthMm: 6000, depthMm: 600 };
  const viaShape = benchLayoutFor(strip);
  assert(!viaShape.shaped && viaShape.chairs.length === plain.chairs.length, "a straight strip laid by its shape is the straight layout");
  const deep = benchLayoutFor({ kind: "rect", widthMm: 600, depthMm: 6000 });
  assert(!!deep.shaped && deep.widthMm === 6000 && deep.depthMm === 600 && deep.chairs.length === 10, "a strip drawn deep is read along its long side — ten chairs, not one");
  assert(deep.chairs.every((c) => Math.abs(Math.abs(c.x) - (300 + CHAIR_OFFSET_MM)) < 1 && (Math.abs(Math.abs(c.facingDeg) - 180) < 1 || Math.abs(c.facingDeg) < 1)), "…standing off its long side, facing it square");
  // A crescent: the top half of a ring 6m across, 60cm deep, as a hand-drawn outline.
  const arc: Point[] = [];
  for (let k = 0; k <= 24; k++) arc.push({ x: 3000 * Math.cos(Math.PI - (Math.PI * k) / 24), y: -3000 * Math.sin(Math.PI - (Math.PI * k) / 24) });
  for (let k = 24; k >= 0; k--) arc.push({ x: 2400 * Math.cos(Math.PI - (Math.PI * k) / 24), y: -2400 * Math.sin(Math.PI - (Math.PI * k) / 24) });
  const crescent = benchLayoutFor({ kind: "custom", outline: arc }, { back: { kind: "chairs" }, front: { kind: "sofa", seats: 3 } });
  // A custom outline is drawn about its BOX's centre (footprintOutlines), so the ring's centre is
  // 1.5m down from the frame's origin.
  const C = { x: 0, y: 1500 };
  const rad = (p: Point) => Math.hypot(p.x - C.x, p.y - C.y);
  assert(!!crescent.shaped && crescent.widthMm > 8000 && crescent.widthMm < 8800 && Math.abs(crescent.depthMm - 600) < 60, "a crescent's length is its arc, its depth the band's");
  assert(crescent.chairs.length === Math.floor(crescent.widthMm / SEAT_WIDTH_MM), "…seating one per 60cm OF THE ARC");
  assert(crescent.chairs.every((c) => rad(c) > 2700 + crescent.depthMm / 2 + CHAIR_OFFSET_MM - 40), "…its chairs round the OUTER rim (the −y side, the back)");
  assert(crescent.chairs.every((c) => Math.abs(((((c.facingDeg - (Math.atan2(C.y - c.y, C.x - c.x) * 180) / Math.PI) % 360) + 540) % 360) - 180) < 8), "…each facing in toward the centre, square at the band");
  assert(crescent.cushions.length === 3 && crescent.cushions.every((q) => q.every((p) => rad(p) < 2720)), "…and the sofa's cushions on the inner half of the band");
  assert(crescent.backs.length === 3, "…its backrest in segments that follow the curve");

  // ── The room's blocks, each side at its own height (QA BQ-4/BQ-5/BQ-10).
  const tableOnly = benchLayout(3000, 600).blocks;
  assert(tableOnly.length === 1 && tableOnly[0].kind === "table" && !!tableOnly[0].core && tableOnly[0].y0 === -300 && tableOnly[0].y1 === 300, "chairs alone: the whole strip is their table");
  const mixed = benchLayout(6000, 600, { back: { kind: "chairs" }, front: { kind: "sofa", widthMm: 2400, depthMm: 200 } }).blocks;
  const seatBlock = mixed.find((b) => b.kind === "seat")!;
  const backBlock = mixed.find((b) => b.kind === "back")!;
  const coreBlock = mixed.find((b) => b.core)!;
  assert(seatBlock.side === "front" && seatBlock.x0 === -1200 && seatBlock.x1 === 1200 && seatBlock.y0 === 100 && seatBlock.y1 === 300, "a sofa's seat is raised over ITS run, from the edge to its typed depth");
  assert(backBlock.y1 === 100 && backBlock.y0 === 100 - BACKREST_THICK_MM && backBlock.x1 === 1200, "…its backrest right behind the seat, along the run");
  assert(coreBlock.kind === "table" && coreBlock.side === "back" && coreBlock.y1 === backBlock.y0, "…the chairs' table from the backrest to their edge, never over the cushions");
  assert(mixed.filter((b) => !b.core && b.kind === "table").length === 2, "…and the strip beyond a short run is table too");
  const sofaAlone = benchLayout(3000, 450, { back: { kind: "sofa" } }).blocks;
  assert(!sofaAlone.some((b) => b.kind === "table") && sofaAlone.find((b) => b.core)?.kind === "back", "a sofa nobody eats at has a solid back, no table slab");
  const crescentBlocks = benchLayoutFor({ kind: "custom", outline: arc }, { back: { kind: "chairs" }, front: { kind: "sofa" } }).blocks;
  assert(crescentBlocks.length >= 3 && crescentBlocks.every((b) => (b.outline?.length ?? 0) >= 4), "a shaped banquette's blocks are carried along its spine as outlines");

  // ── A sofa side may be left out of the seating readout (U6, QA BQ-3) — the COUNT only.
  const lounge: BenchSpec = { back: { kind: "chairs", seats: 4 }, front: { kind: "sofa", seats: 3, notSeating: true } };
  const loungeLay = benchLayout(3000, 600, lounge);
  assert(loungeLay.seats === 7 && loungeLay.countedSeats === 4 && loungeLay.sofaSeats === 3, "a sofa side that is not seating is out of the count — its three still sit there");
  assert(benchLayout(3000, 600, { ...lounge, front: { kind: "sofa", seats: 3 } }).countedSeats === 7, "…while one that is counts");
  const loungeOnly = free("lo", { back: { kind: "sofa", notSeating: true }, number: 6 });
  assert(benchIsNumbered(loungeOnly, standaloneBench(loungeOnly, benches)), "…a banquette people sit on keeps its number though none of them is counted");
  assert(standaloneBenchSeats([loungeOnly, free("a")], benches) === 5, "…and the readout leaves its sofa out");
  assert(patchBenchSide(undefined, "front", { kind: "sofa", notSeating: true }).front?.notSeating === true, "the switch is written on the side");
  assert(patchBenchSide(lounge, "front", { notSeating: false }).front?.notSeating === undefined, "…and taken off it");

  console.log("bench self-check passed");
}
