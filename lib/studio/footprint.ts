// Pure appearance resolver (no window/localStorage) — shared by the Konva map renderer
// and the drawer preview. Absence of `appearance` is derived from `dimensions` so every
// legacy/seed product keeps rendering (name-in-a-shape = today's behavior).
import type { ArcSpec, HollowSpec, MapShape, Product, ResizeSpec, RingSpec, ShapePart } from "@/lib/catalog/types";
import { ARC_SWEEP, MAP_SHAPES, RESIZE_DEFAULT_STEP_MM, RING_GAP, canHollow, usesDiameter } from "@/lib/catalog/types";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import type { Point } from "@/lib/design-document/types";
import type { EdgeCurve } from "@/lib/studio/hall";
import { absoluteControlPoints, edgeMidpoint, outlineBounds } from "@/lib/studio/geometry";
import { isMain } from "../self-check";

export const MIN_FOOTPRINT_MM = 600; // floor so missing/zero dims never render at zero size

export type Footprint =
  | { kind: "rect"; widthMm: number; depthMm: number }
  | { kind: "circle"; diameterMm: number }
  | { kind: "ellipse"; widthMm: number; depthMm: number }
  | { kind: "custom"; outline: Point[]; edgeCurves?: (EdgeCurve | null)[] }
  /** An item drawn as several shapes at once — its base shape and the parts added beside it
   *  (MapAppearance.parts). Each part is an outline already turned and placed in the item's frame,
   *  and the lot is centred on the bounding box of all of them, like every other footprint. */
  | { kind: "multi"; parts: BuiltOutline[] };

export interface ResolvedContent {
  mode: "icon" | "name" | "none";
  icon?: string;
  name: string;
}

// ── The derived shapes ─────────────────────────────────────────────────────────────────────────
//
// A shape that is not one of the three SVG primitives and not a hand-drawn outline is BUILT here,
// out of the item's own width and depth. Nothing about it is stored: `{ shape: "hexagon" }` plus
// two measurements is the whole record, which is what lets the catalog grow a shape vocabulary
// without growing a column, and what makes resizing a חצי עיגול an edit to a number rather than a
// return trip to the outline editor.
//
// TWO RULES, and both are load-bearing:
//
//   1. THE BOUNDING BOX IS width × depth, exactly. The drawer asks for those two numbers and draws
//      the result at true scale; a shape that quietly measured something else would be the original
//      bug in a new costume (see MapShape in lib/catalog/types.ts).
//
//   2. EVERY EXTREME IS A VERTEX. The shapes built here are cut at their apices (an arc into
//      quarters rather than one long bow), so their box can be read off the points alone and is
//      exact. A HAND-DRAWN outline makes no such promise — a designer bows one side of a rectangle
//      and the apex lives inside the curve — so customShapeBounds samples the curves it is given
//      (sampledBounds) rather than trusting the corners: the drawer's width and depth, the saved
//      dimensions, the centring on the plan and the seating all measure the shape that is drawn.
//
// K is the standard cubic approximation of a quarter arc (0.5523 × radius) — the constant every
// circle-to-path conversion uses. Control points are offsets from their own edge's endpoints
// (absoluteControlPoints, ./geometry), which is what lets the same numbers survive recentring.
const K = 0.5523;

export interface BuiltOutline {
  outline: Point[];
  edgeCurves?: (EdgeCurve | null)[];
  /** Which of the item's shapes this outline is a piece of, in a composite — 0 the base shape, k the
   *  k-th added part (MapAppearance.parts). Set only once some shape is drawn as SEVERAL outlines (a
   *  hollow shape with sides open, buildHollow), when an outline's index among the pieces stops
   *  being the index of its shape; absent = its index, which is what every composite was before.
   *  Read through pieceOf — the surfaces (ItemSurface) and the bar's back counters (bar-draw) both
   *  ask "which shape is this", not "which outline". */
  of?: number;
}

/** Which of the item's shapes the `i`-th piece of a composite draws (BuiltOutline.of). */
export const pieceOf = (p: BuiltOutline, i: number): number => p.of ?? i;

const RAD = Math.PI / 180;

/** A circular arc from `from` to `to` degrees (screen angles: 0 is +x, 90 is straight DOWN) as one
 *  cubic: control arms of 4/3·tan(φ/4)·r along the tangents — the same construction K is for
 *  φ = 90°. Signed, so an arc walked backwards gets its arms reversed. Offsets from the arc's own
 *  endpoints, which is what an EdgeCurve stores, so the centre it is struck from does not matter. */
const bow = (radius: number, from: number, to: number): EdgeCurve => {
  const k = (4 / 3) * Math.tan(((to - from) * RAD) / 4) * radius;
  return {
    c1: { x: -k * Math.sin(from * RAD), y: k * Math.cos(from * RAD) },
    c2: { x: k * Math.sin(to * RAD), y: -k * Math.cos(to * RAD) },
  };
};

/** Collects an outline edge by edge, dropping the zero-length edges a degenerate size produces — a
 *  stadium as wide as it is deep has no straight runs, a band as wide as the radius has no inner
 *  arcs — so every vertex that remains is a real corner or apex. */
function outlineBuilder() {
  const outline: Point[] = [];
  const edgeCurves: (EdgeCurve | null)[] = [];
  const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
  return {
    /** `p`, and the edge that leaves it toward the next point added. */
    add(p: Point, curve: EdgeCurve | null) {
      const last = outline[outline.length - 1];
      if (last && same(last, p)) edgeCurves[edgeCurves.length - 1] = curve; // the edge into p was nothing
      else {
        outline.push(p);
        edgeCurves.push(curve);
      }
    },
    done(): BuiltOutline {
      if (outline.length > 1 && same(outline[outline.length - 1], outline[0]) && !edgeCurves[edgeCurves.length - 1]) {
        outline.pop(); // the closing edge was nothing either
        edgeCurves.pop();
      }
      return { outline, ...(edgeCurves.some(Boolean) ? { edgeCurves } : {}) };
    },
  };
}

/** The same outline with x and y swapped — a wide shape stood up. A reflection, so the winding
 *  flips, which nothing downstream minds: the seating reads the winding off the points. */
function transpose(o: BuiltOutline): BuiltOutline {
  const t = (p: Point): Point => ({ x: p.y, y: p.x });
  return {
    outline: o.outline.map(t),
    ...(o.edgeCurves ? { edgeCurves: o.edgeCurves.map((c) => (c ? { c1: t(c.c1), c2: t(c.c2) } : null)) } : {}),
  };
}

/** A stadium of `w` × `d`: the radius of its semicircular ends (half the shorter measurement), the
 *  straight run between their centres, and whether the runs lie along x (wide) or along y (tall). */
function stadiumOf(w: number, d: number) {
  return { wide: w >= d, R: Math.min(w, d) / 2, L: Math.abs(w - d) };
}

/** A horseshoe of `w` × `d`, open on the left: the radius of its round end (half the depth — unless
 *  the shape is too narrow for that, when it is the whole width and a straight side runs between the
 *  two quarter arcs), the legs from the open side to where the arcs begin, and that straight side. */
function horseshoeOf(w: number, d: number) {
  const R = Math.min(w, d / 2);
  return { R, L: w - R, S: d - 2 * R };
}

/** A rounded ח of `w` × `d`, open along the bottom: the radius of its two shoulders (the depth —
 *  unless the shape is too narrow for that, when it is half the width and straight sides run from
 *  the shoulders down to the open edge), the straight run between them, and those sides. */
function roundedUOf(w: number, d: number) {
  const R = Math.min(w / 2, d);
  return { R, L: w - 2 * R, S: d - R };
}

export type RingShape = "oval-ring" | "horseshoe" | "rounded-u";

/** The band and opening a hollow curved shape is actually drawn with — the stored spec, or the
 *  defaults for one that has none yet, clamped so no number typed into the modal can turn it inside
 *  out. The band never exceeds the end radius (at the radius the hole closes and the ends are solid).
 *  The opening is never longer than the run it is cut from; on the oval it is also at least
 *  RING_GAP.min unless the run itself is shorter, because it is the only way in — or exactly 0,
 *  closed. On the horseshoe the open side is the wall, so the bottom leg may stop any distance short
 *  of it, or none. The rounded ח has no opening at all: its sides are the arcs, so its gap is 0. */
export function ringSpecOf(w: number, d: number, ring?: Partial<RingSpec>, shape: RingShape = "oval-ring"): Required<RingSpec> {
  const { R, L } =
    shape === "horseshoe" ? horseshoeOf(w, d) : shape === "rounded-u" ? { R: roundedUOf(w, d).R, L: 0 } : stadiumOf(w, d);
  const band = ring?.bandMm ?? Math.min(750, R / 2);
  const wanted = ring?.gapMm ?? Math.min(RING_GAP.default, L / 2);
  const gap =
    wanted <= 0 ? 0 : shape === "horseshoe" ? Math.min(L, wanted) : Math.min(L, Math.max(Math.min(RING_GAP.min, L), wanted));
  return { bandMm: Math.min(R, Math.max(50, band)), gapMm: gap, gapAt: ring?.gapAt ?? "center" };
}

/** How deep a square ח's counter is — `ring.bandMm` when it was measured (the user, 2026-10-17: a
 *  ח bar's counter is a real 60cm, and stretching the bar must not thicken it), else a third of the
 *  shorter side, which is what every ח drew before the number existed. Clamped so an opening always
 *  survives: under half the width (the two legs) and under the depth (the closed side). */
export function uShapeBandOf(w: number, d: number, ring?: Partial<RingSpec>): number {
  const stated = ring?.bandMm;
  if (!stated || !(stated > 0)) return Math.min(w, d) / 3;
  return Math.max(50, Math.min(stated, w / 2 - 25, d - 25));
}

/** The band and sweep an arc is actually drawn with — the stored spec, or the defaults for one that
 *  has none yet, clamped so no number typed into the modal can turn it inside out. The band never
 *  exceeds the radius: at exactly the radius the hole closes and the arc is a solid slice. */
export function arcSpecOf(outerDiameterMm: number, arc?: Partial<ArcSpec>): ArcSpec {
  const R = outerDiameterMm / 2;
  const sweep = arc?.sweepDeg ?? ARC_SWEEP.default;
  const band = arc?.bandMm ?? Math.min(750, R / 2);
  return {
    sweepDeg: Math.min(ARC_SWEEP.max, Math.max(ARC_SWEEP.min, sweep)),
    bandMm: Math.min(R, Math.max(50, band)),
  };
}

/** A piece of a ring: the outer arc, a straight cap across the band, the inner arc back, and the cap
 *  home — symmetric about the top, so a half ring opens downward the way a חצי עיגול does. Sized by
 *  the circle it is cut from, so its box is DERIVED (the one shape rule 1 below does not describe).
 *
 *  Rule 2 still holds: each arc is cut at every multiple of 90° it crosses, so every extreme is a
 *  vertex, and each cut piece is at most a quarter — the span a single cubic draws well. */
export function buildArcOutline(outerDiameterMm: number, arc?: Partial<ArcSpec>): BuiltOutline {
  const R = outerDiameterMm / 2;
  const { sweepDeg, bandMm } = arcSpecOf(outerDiameterMm, arc);
  const r = R - bandMm;
  const a0 = -90 - sweepDeg / 2;
  const a1 = -90 + sweepDeg / 2;
  const cuts = [a0];
  for (let k = Math.ceil(a0 / 90) * 90; k < a1; k += 90) if (k > a0) cuts.push(k);
  cuts.push(a1);

  const at = (radius: number, deg: number): Point => ({ x: radius * Math.cos(deg * RAD), y: radius * Math.sin(deg * RAD) });

  const outline: Point[] = [];
  const edgeCurves: (EdgeCurve | null)[] = [];
  cuts.forEach((deg, i) => {
    outline.push(at(R, deg));
    edgeCurves.push(i < cuts.length - 1 ? bow(R, deg, cuts[i + 1]) : null); // the last one is a cap
  });
  if (r > 0.5) {
    for (let i = cuts.length - 1; i >= 0; i--) {
      outline.push(at(r, cuts[i]));
      edgeCurves.push(i > 0 ? bow(r, cuts[i], cuts[i - 1]) : null);
    }
  } else if (Math.abs(sweepDeg - 180) > 1e-9) {
    outline.push({ x: 0, y: 0 }); // no hole left: a slice, its point at the centre
    edgeCurves.push(null);
  } // a half slice's two radii are one straight chord — one side, not two
  const b = customShapeBounds(outline);
  return { outline: outline.map((p) => ({ x: p.x - b.cx, y: p.y - b.cy })), edgeCurves };
}

/** A capsule: two semicircular ends of the shorter measurement's diameter, joined by straight runs
 *  along the longer one. Six vertices — four when it is round and has no runs — with each arc a
 *  quarter, so both apexes are vertices (rule 2) and the box is exactly w × d (rule 1). Built wide,
 *  and transposed when it is tall. */
export function buildStadiumOutline(w: number, d: number): BuiltOutline {
  const { wide, R, L } = stadiumOf(w, d);
  const b = outlineBuilder();
  b.add({ x: -L / 2, y: -R }, null); // the top run
  b.add({ x: L / 2, y: -R }, bow(R, -90, 0)); // down round the right end, in two quarters
  b.add({ x: L / 2 + R, y: 0 }, bow(R, 0, 90));
  b.add({ x: L / 2, y: R }, null); // the bottom run
  b.add({ x: -L / 2, y: R }, bow(R, 90, 180)); // up round the left end
  b.add({ x: -L / 2 - R, y: 0 }, bow(R, 180, 270));
  return wide ? b.done() : transpose(b.done());
}

/** A stadium hollowed to a band and open at one place (ringSpecOf): the outer edge walked right
 *  round from one side of the opening to the other, a straight cap across the band, the inner edge
 *  walked back, and the cap home — ONE outline, exactly as the arc is. The opening is cut out of the
 *  bottom run. CLOSED (gap 0) it is the same walk with the two caps on top of each other, a keyhole:
 *  under the nonzero rule the inner loop, wound the other way, cuts the hole, and the doubled cap
 *  draws as the hairline that marks the hatch. Every arc is a quarter, so each apex is a vertex and
 *  the box is w × d whatever the band or the gap: the run's two ends are vertices even when the
 *  whole run is open. */
export function buildOvalRingOutline(w: number, d: number, ring?: Partial<RingSpec>): BuiltOutline {
  const { wide, R, L } = stadiumOf(w, d);
  const { bandMm, gapMm, gapAt } = ringSpecOf(w, d, ring);
  const r = R - bandMm;
  const hollow = r > 0.5; // a band the full radius leaves no inner arcs: the ends are solid
  // The opening's two ends along the bottom run, which spans x ∈ [−L/2, L/2].
  const g0 = gapAt === "left" ? -L / 2 : gapAt === "right" ? L / 2 - gapMm : -gapMm / 2;
  const g1 = g0 + gapMm;
  const b = outlineBuilder();
  // The outer edge, from the opening's right-hand side round to its left-hand side.
  b.add({ x: g1, y: R }, null);
  b.add({ x: L / 2, y: R }, bow(R, 90, 0)); // up round the right end
  b.add({ x: L / 2 + R, y: 0 }, bow(R, 0, -90));
  b.add({ x: L / 2, y: -R }, null); // the top run
  b.add({ x: -L / 2, y: -R }, bow(R, -90, -180)); // down round the left end
  b.add({ x: -L / 2 - R, y: 0 }, bow(R, -180, -270));
  b.add({ x: -L / 2, y: R }, null); // the bottom run, as far as the opening
  b.add({ x: g0, y: R }, null); // the cap across the band
  // The inner edge, back the other way.
  b.add({ x: g0, y: r }, null);
  b.add({ x: -L / 2, y: r }, hollow ? bow(r, 90, 180) : null);
  b.add({ x: -L / 2 - r, y: 0 }, hollow ? bow(r, 180, 270) : null);
  b.add({ x: -L / 2, y: -r }, null);
  b.add({ x: L / 2, y: -r }, hollow ? bow(r, -90, 0) : null);
  b.add({ x: L / 2 + r, y: 0 }, hollow ? bow(r, 0, 90) : null);
  b.add({ x: L / 2, y: r }, null);
  b.add({ x: g1, y: r }, null); // the cap home is the closing edge
  return wide ? b.done() : transpose(b.done());
}

/** Half an oval ring, cut along its short axis: two legs reaching the open side — the wall it stands
 *  against, on the left — joined by the round end on the right, as one band. The outer edge is
 *  walked from the wall along the top leg, round the end and back along the bottom leg, which stops
 *  `gapMm` short of the wall (the entrance); a cap across the band, the inner edge back, and the cap
 *  along the wall home. One outline with the open side as an edge, so it never needs a hole. Every
 *  arc is a quarter, so the box is exactly w × d. */
export function buildHorseshoeOutline(w: number, d: number, ring?: Partial<RingSpec>): BuiltOutline {
  const { R, L, S } = horseshoeOf(w, d);
  const { bandMm, gapMm } = ringSpecOf(w, d, ring, "horseshoe");
  const r = R - bandMm;
  const hollow = r > 0.5;
  const wall = -w / 2; // the open side
  const c = wall + L; // where the legs end and the arcs begin
  const b = outlineBuilder();
  b.add({ x: wall, y: -d / 2 }, null); // the top leg, along the outside
  b.add({ x: c, y: -d / 2 }, bow(R, -90, 0)); // round the end
  b.add({ x: c + R, y: -S / 2 }, null); // the straight side, when the end is too narrow to be a semicircle
  b.add({ x: c + R, y: S / 2 }, bow(R, 0, 90));
  b.add({ x: c, y: d / 2 }, null); // the bottom leg, as far as the entrance
  b.add({ x: wall + gapMm, y: d / 2 }, null); // the cap across the band
  b.add({ x: wall + gapMm, y: d / 2 - bandMm }, null); // the bottom leg, along the inside
  b.add({ x: c, y: d / 2 - bandMm }, hollow ? bow(r, 90, 0) : null); // back round the inside of the end
  b.add({ x: c + r, y: S / 2 }, null);
  b.add({ x: c + r, y: -S / 2 }, hollow ? bow(r, 0, -90) : null);
  b.add({ x: c, y: -d / 2 + bandMm }, null); // the top leg, along the inside
  b.add({ x: wall, y: -d / 2 + bandMm }, null); // the cap along the wall is the closing edge
  return b.done();
}

/** The other half of an oval ring, cut along its long axis: the straight run on top and a quarter
 *  arc down each side to the open edge along the bottom — the wall — as one band. A ח with round
 *  shoulders, open the same way the square ח is. The outer edge is walked up the left side, over the
 *  top and down the right; a cap across the band; the inner edge back; and the cap home. One outline
 *  with the open side as an edge. Every arc is a quarter, so the box is exactly w × d; a shape too
 *  narrow for its shoulders to meet the open edge grows straight sides rather than a wider box. */
export function buildRoundedUOutline(w: number, d: number, ring?: Partial<RingSpec>): BuiltOutline {
  const { R, S } = roundedUOf(w, d);
  const { bandMm } = ringSpecOf(w, d, ring, "rounded-u");
  const r = R - bandMm;
  const hollow = r > 0.5;
  const open = d / 2; // the open side, along the bottom
  const cy = open - S; // the shoulders' centre line
  const cl = -w / 2 + R; // the shoulders' centres
  const cr = w / 2 - R;
  const b = outlineBuilder();
  b.add({ x: -w / 2, y: open }, null); // up the left side, along the outside
  b.add({ x: -w / 2, y: cy }, bow(R, 180, 270)); // over the left shoulder
  b.add({ x: cl, y: -d / 2 }, null); // the top run
  b.add({ x: cr, y: -d / 2 }, bow(R, -90, 0)); // over the right shoulder
  b.add({ x: w / 2, y: cy }, null); // down the right side
  b.add({ x: w / 2, y: open }, null); // the cap across the band
  b.add({ x: w / 2 - bandMm, y: open }, null); // up the right side, along the inside
  b.add({ x: w / 2 - bandMm, y: cy }, hollow ? bow(r, 0, -90) : null);
  b.add({ x: cr, y: -d / 2 + bandMm }, null); // the top run, along the inside
  b.add({ x: cl, y: -d / 2 + bandMm }, hollow ? bow(r, 270, 180) : null);
  b.add({ x: -w / 2 + bandMm, y: cy }, null); // down the left side, along the inside
  b.add({ x: -w / 2 + bandMm, y: open }, null); // the cap home is the closing edge
  return b.done();
}

/** The outline of a derived shape, centred on (0,0) and measuring exactly `w` × `d`.
 *  Null for the shapes that are not derived: the three primitives and the designer's own "custom".
 *  The arc is the exception to "measuring w × d": it is cut from a circle `w` across (see above). */
export function buildShapeOutline(
  shape: MapShape,
  w: number,
  d: number,
  arc?: Partial<ArcSpec>,
  ring?: Partial<RingSpec>,
): BuiltOutline | null {
  const hw = w / 2;
  const hh = d / 2;
  switch (shape) {
    case "arc":
      return buildArcOutline(w, arc);
    case "stadium":
      return buildStadiumOutline(w, d);
    case "oval-ring":
      return buildOvalRingOutline(w, d, ring);
    case "horseshoe":
      return buildHorseshoeOutline(w, d, ring);
    case "rounded-u":
      return buildRoundedUOutline(w, d, ring);

    // The chord along the bottom, the arc over the top in two quarters so the apex is a vertex.
    case "half-circle":
      return {
        outline: [
          { x: -hw, y: hh },
          { x: hw, y: hh },
          { x: 0, y: -hh },
        ],
        edgeCurves: [
          null, // the chord is the diameter — straight
          { c1: { x: 0, y: -K * d }, c2: { x: K * hw, y: 0 } },
          { c1: { x: -K * hw, y: 0 }, c2: { x: 0, y: -K * d } },
        ],
      };

    // The corner piece: two straight radii meeting at the corner, and one arc between their ends.
    case "quarter-circle":
      return {
        outline: [
          { x: -hw, y: hh }, // the corner — the centre the arc is struck from
          { x: hw, y: hh },
          { x: -hw, y: -hh },
        ],
        edgeCurves: [null, { c1: { x: 0, y: -K * d }, c2: { x: K * w, y: 0 } }, null],
      };

    // A serpentine: an outer arc rising the full depth and an inner one rising half of it, meeting
    // at two tips. The band is d/2 across at its middle, which is the proportion a serpentine table
    // is actually built in.
    case "crescent": {
      const t = hh; // how far the inner arc rises
      return {
        outline: [
          { x: -hw, y: hh }, // start tip
          { x: 0, y: hh - t }, // inner apex
          { x: hw, y: hh }, // end tip
          { x: 0, y: -hh }, // outer apex
        ],
        edgeCurves: [
          { c1: { x: 0, y: -K * t }, c2: { x: -K * hw, y: 0 } },
          { c1: { x: K * hw, y: 0 }, c2: { x: 0, y: -K * t } },
          { c1: { x: 0, y: -K * d }, c2: { x: K * hw, y: 0 } },
          { c1: { x: -K * hw, y: 0 }, c2: { x: 0, y: -K * d } },
        ],
      };
    }

    case "triangle":
      return { outline: [{ x: -hw, y: hh }, { x: hw, y: hh }, { x: 0, y: -hh }] };

    // Top edge half the base — the proportion that lets a run of them bend a head table.
    case "trapezoid":
      return {
        outline: [
          { x: -hw, y: hh },
          { x: hw, y: hh },
          { x: hw / 2, y: -hh },
          { x: -hw / 2, y: -hh },
        ],
      };

    case "hexagon":
      return {
        outline: [
          { x: -hw, y: 0 },
          { x: -hw / 2, y: hh },
          { x: hw / 2, y: hh },
          { x: hw, y: 0 },
          { x: hw / 2, y: -hh },
          { x: -hw / 2, y: -hh },
        ],
      };

    // 0.2071 = (1 − 1/(1+√2))/2, the corner cut that makes a REGULAR octagon out of a square.
    case "octagon": {
      const cx = w * 0.2071;
      const cy = d * 0.2071;
      return {
        outline: [
          { x: -hw, y: hh - cy },
          { x: -hw + cx, y: hh },
          { x: hw - cx, y: hh },
          { x: hw, y: hh - cy },
          { x: hw, y: -hh + cy },
          { x: hw - cx, y: -hh },
          { x: -hw + cx, y: -hh },
          { x: -hw, y: -hh + cy },
        ],
      };
    }

    // A ח: three sides of a rectangle with the fourth left open — how a bar counter is actually
    // built, and how a long run of tables is laid around a dance floor. Eight corners, all straight,
    // and every extreme is one of them: the outer box is the full w × d and both legs reach the open
    // edge, so rule 1 holds with no curve anywhere to hide an apex inside.
    //
    // The counter is a third of the SHORTER side unless it was measured (uShapeBandOf). A share of
    // the depth alone would read right on a wide bar and then swallow its own opening on a ח deeper
    // than it is wide, which is the one way a derived shape can stop being the shape it is named after.
    case "u-shape": {
      const t = uShapeBandOf(w, d, ring);
      return {
        outline: [
          { x: -hw, y: -hh }, // the closed side, along the top
          { x: hw, y: -hh },
          { x: hw, y: hh }, // down the outside of one leg, to the open edge
          { x: hw - t, y: hh },
          { x: hw - t, y: -hh + t }, // back up its inside, and around the inner corner
          { x: -hw + t, y: -hh + t },
          { x: -hw + t, y: hh },
          { x: -hw, y: hh },
        ],
      };
    }

    default:
      return null; // rect / circle / ellipse are primitives, and "custom" is the designer's own
  }
}

/** The diameter a round shape is drawn at (usesDiameter). A row that states one is taken at its word;
 *  one from before these shapes were round carries a width instead, and the width is what its box
 *  was — the whole circle across for a half, one radius for a quarter. */
export function roundSizeMm(shape: MapShape, d: { widthMm?: number; depthMm?: number; diameterMm?: number }): number | undefined {
  if (d.diameterMm) return d.diameterMm;
  if (shape === "quarter-circle") {
    const r = d.widthMm || d.depthMm;
    return r ? r * 2 : undefined;
  }
  return d.widthMm || d.depthMm || undefined;
}

/** What a shape is drawn from: its measurements, a hand-drawn outline, and the specs of the shapes
 *  that have more to say than two numbers. A catalog row's dimensions + appearance, a ShapePart and a
 *  venue feature all fit it. */
export interface ShapeDims {
  widthMm?: number;
  depthMm?: number;
  diameterMm?: number;
  outline?: Point[];
  edgeCurves?: (EdgeCurve | null)[];
  arc?: Partial<ArcSpec>;
  ring?: Partial<RingSpec>;
  hollow?: HollowSpec;
}

/** A shape plus the measurements it is drawn from, resolved to the one footprint every surface in
 *  the app already knows how to draw.
 *
 *  Split out of resolveFootprint because a catalog product is no longer the only thing with a
 *  footprint: a venue's fixed features are placed FROM the catalog now (lib/venues/structure.ts), so
 *  a bar shaped like a ח has to be a ח on the hall plan too rather than the box its two numbers
 *  describe. One resolver, so the two cannot disagree about what a shape means.
 *
 *  A shape drawn hollow (HollowSpec) is the band cut inside its own outline (buildHollow): one
 *  outline — a keyhole, or a band open on a side — as a custom footprint, or several (a band opened
 *  in two places) as a multi, whose pieces all say they are the one shape (BuiltOutline.of). */
export function shapeFootprint(shape: MapShape, d: ShapeDims): Footprint {
  return hollowOf(shape, d.hollow) ? piecesFootprint(shapePieces(shape, d)) : solidFootprint(shape, d);
}

/** The hollow spec a shape is actually drawn with — none for a shape that cannot be hollow, or a
 *  band of nothing. */
const hollowOf = (shape: MapShape, h: HollowSpec | undefined): HollowSpec | undefined =>
  h && canHollow(shape) && h.bandMm > 0 ? h : undefined;

/** The shape drawn SOLID, as one outline centred on its own box: the outline a hollow shape's band
 *  is cut inside, and whose edges are the sides that may be opened (HollowSpec.openSides). For the
 *  primitives that is footprintOutlines' four corners or four quarter arcs; for a hand-drawn one, the
 *  drawing. What the shape editor shows and drags, hollow or not. */
export function hollowOuter(shape: MapShape, d: ShapeDims): BuiltOutline {
  return footprintOutlines(solidFootprint(shape, d))[0];
}

/** The outlines a shape is drawn as, in the frame of its OUTER box (hollowOuter) — one for a solid
 *  shape, the band's pieces for a hollow one. That frame and not the pieces' own box, because it is
 *  the frame everything else measures from: a part's x/y is its offset from the base's outer box
 *  (the shape editor centres it there), and a band opened on a side may no longer reach every side
 *  of that box. */
export function shapePieces(shape: MapShape, d: ShapeDims): BuiltOutline[] {
  const outer = hollowOuter(shape, d);
  const h = hollowOf(shape, d.hollow);
  return h ? buildHollow(outer, h) : [outer];
}

/** Outlines as one footprint: a single one as `custom` (which every drawer centres on its own box),
 *  several as a `multi` centred on the box of all of them, each piece marked as the base shape's. */
export function piecesFootprint(pieces: readonly BuiltOutline[]): Footprint {
  if (pieces.length === 1) {
    const p = pieces[0];
    return { kind: "custom", outline: p.outline, ...(p.edgeCurves ? { edgeCurves: p.edgeCurves } : {}) };
  }
  const b = sampledBounds(pieces);
  return {
    kind: "multi",
    parts: pieces.map((p) => ({
      outline: p.outline.map((v) => ({ x: v.x - b.cx, y: v.y - b.cy })),
      ...(p.edgeCurves ? { edgeCurves: p.edgeCurves } : {}),
      of: 0,
    })),
  };
}

// ── Hollow ─────────────────────────────────────────────────────────────────────────────────────
//
// Any solid shape may be drawn as a band round an open middle (HollowSpec, lib/catalog/types.ts).
// The band is cut INSIDE the shape's own outline: every edge is moved inward by the band's depth —
// an open side by nothing, so the band's legs run right up to its line — and the moved edges are
// trimmed or extended until they meet at the corners. That inner loop is joined to the outline the
// way the oval ring always was, as ONE keyhole: the outer edge walked round, a cap across the band,
// the inner edge walked back the other way, the cap home. Under the nonzero rule the reversed inner
// loop is the hole; a closed ring has its two caps on top of each other, the hairline that marks the
// hatch. With sides open, each run of closed sides between two open ones is a band of its own — one
// outline, or several.
//
// THE OUTLINE IS NOT TOUCHED, so the box is still width × depth (rule 1) and its extremes are still
// vertices (rule 2): the band only ever takes floor out of the middle.
//
// CURVES STAY CURVES. The seating joins edges that meet smoother than 3° into one side and lays its
// chairs along it (lib/studio/seating.ts); an inner arc sampled into a polyline would be sixteen
// sides of a chair each. So a bowed edge is moved as a bowed edge: its ends along their own normals,
// its control arms shortened by how sharply it bends at each end — which for a circular arc is the
// concentric arc, exactly (offsetEdge). Where two moved edges cross, a straight one is cut
// analytically and a curved one at the crossing found on its samples (de Casteljau, so it stays one
// cubic). Where they part — a reflex corner, or a closed side meeting an open one that runs on
// smoothly — a straight bevel joins them; it is the cap across the band where that is what it is.
// A moved edge the band swallows whole (a short side of a deep band) is dropped and its neighbours
// meet each other instead. A band so deep that nothing is left inside is the solid shape.

type Cubic = [Point, Point, Point, Point];

const vAdd = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const vSub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const vMul = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
const vDot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
const vCross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
const vLen = (a: Point): number => Math.hypot(a.x, a.y);
const vDist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const vUnit = (a: Point): Point => {
  const l = vLen(a);
  return l > 0 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};
const vLerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

function bezAt(c: Cubic, t: number): Point {
  const u = 1 - t;
  const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
  return { x: w0 * c[0].x + w1 * c[1].x + w2 * c[2].x + w3 * c[3].x, y: w0 * c[0].y + w1 * c[1].y + w2 * c[2].y + w3 * c[3].y };
}

function bezTangent(c: Cubic, t: number): Point {
  const u = 1 - t;
  return vAdd(vAdd(vMul(vSub(c[1], c[0]), 3 * u * u), vMul(vSub(c[2], c[1]), 6 * u * t)), vMul(vSub(c[3], c[2]), 3 * t * t));
}

/** De Casteljau: the cubic cut at `t` into its two halves, each a cubic of its own. */
function bezSplit(c: Cubic, t: number): [Cubic, Cubic] {
  const p01 = vLerp(c[0], c[1], t), p12 = vLerp(c[1], c[2], t), p23 = vLerp(c[2], c[3], t);
  const p012 = vLerp(p01, p12, t), p123 = vLerp(p12, p23, t);
  const m = vLerp(p012, p123, t);
  return [[c[0], p01, p012, m], [m, p123, p23, c[3]]];
}

/** The stretch of a cubic between parameters t0 ≤ t1, as one cubic. */
function bezWindow(c: Cubic, t0: number, t1: number): Cubic {
  const right = t0 > 0 ? bezSplit(c, t0)[1] : c;
  const t = t0 >= 1 ? 0 : (t1 - t0) / (1 - t0);
  return t >= 1 ? right : bezSplit(right, Math.max(0, t))[0];
}

/** Where two lines p + d·t and q + e·u meet, as their two parameters; null when they are parallel. */
function lineMeet(p: Point, d: Point, q: Point, e: Point): { t: number; u: number } | null {
  const den = vCross(d, e);
  if (Math.abs(den) < 1e-9 * (vLen(d) * vLen(e) || 1)) return null;
  const w = vSub(q, p);
  return { t: vCross(w, e) / den, u: vCross(w, d) / den };
}

/** One edge of a band, in absolute coordinates — straight, or a cubic through `c` — and the edge of
 *  the shape it runs along (-1 for a cap or a bevel). */
interface Piece {
  src: number;
  from: Point;
  to: Point;
  c?: [Point, Point];
}

const cubicOf = (p: Piece): Cubic | null => (p.c ? [p.from, p.c[0], p.c[1], p.to] : null);

function piecePoint(p: Piece, t: number): Point {
  const c = cubicOf(p);
  return c ? bezAt(c, t) : vLerp(p.from, p.to, t);
}

const reversedPiece = (p: Piece): Piece => ({ src: p.src, from: p.to, to: p.from, ...(p.c ? { c: [p.c[1], p.c[0]] as [Point, Point] } : {}) });

/** A piece between its parameters t0 ≤ t1. */
function cutPiece(p: Piece, t0: number, t1: number): Piece {
  const c = cubicOf(p);
  if (!c) return { src: p.src, from: piecePoint(p, t0), to: piecePoint(p, t1) };
  const w = bezWindow(c, t0, t1);
  return { src: p.src, from: w[0], to: w[3], c: [w[1], w[2]] };
}

function edgePiece(src: number, a: Point, b: Point, curve: EdgeCurve | null | undefined): Piece {
  if (!curve) return { src, from: a, to: b };
  const { c1, c2 } = absoluteControlPoints(a, b, curve);
  return { src, from: a, to: b, c: [c1, c2] };
}

const SAMPLES = 64;

/** The arc length along a piece at SAMPLES + 1 evenly spaced parameters — how a gap typed in mm is
 *  found on a curved side. */
function lengthTable(p: Piece): number[] {
  const out = [0];
  let prev = p.from;
  for (let k = 1; k <= SAMPLES; k++) {
    const q = piecePoint(p, k / SAMPLES);
    out.push(out[k - 1] + vDist(prev, q));
    prev = q;
  }
  return out;
}

function lengthAtParam(p: Piece, table: number[], t: number): number {
  if (!p.c) return clamp01(t) * table[SAMPLES];
  const f = clamp01(t) * SAMPLES;
  const k = Math.min(SAMPLES - 1, Math.floor(f));
  return table[k] + (table[k + 1] - table[k]) * (f - k);
}

function paramAtLength(p: Piece, table: number[], len: number): number {
  const total = table[SAMPLES];
  if (!(total > 0)) return 0;
  if (!p.c) return clamp01(len / total);
  if (len <= 0) return 0;
  if (len >= total) return 1;
  let k = 0;
  while (k < SAMPLES - 1 && table[k + 1] < len) k++;
  const span = table[k + 1] - table[k];
  return (k + (span > 0 ? (len - table[k]) / span : 0)) / SAMPLES;
}

/** The parameter of the point on a piece nearest to `q`. */
function nearestParam(p: Piece, q: Point): number {
  if (!p.c) {
    const d = vSub(p.to, p.from);
    const L2 = vDot(d, d);
    return L2 > 0 ? clamp01(vDot(vSub(q, p.from), d) / L2) : 0;
  }
  const dist = (t: number) => vDist(piecePoint(p, t), q);
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k <= SAMPLES; k++) {
    const d = dist(k / SAMPLES);
    if (d < bestD) [best, bestD] = [k / SAMPLES, d];
  }
  let lo = Math.max(0, best - 1 / SAMPLES);
  let hi = Math.min(1, best + 1 / SAMPLES);
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (dist(m1) < dist(m2)) hi = m2;
    else lo = m1;
  }
  return (lo + hi) / 2;
}

/** A closed run of pieces as a polygon — for its area. */
function piecesRing(pieces: readonly Piece[]): Point[] {
  return pieces.flatMap((p) => {
    const c = cubicOf(p);
    return c ? Array.from({ length: 16 }, (_, k) => bezAt(c, k / 16)) : [p.from];
  });
}

function shoelace(ring: readonly Point[]): number {
  let sum = 0;
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length];
    sum += p.x * q.y - q.x * p.y;
  });
  return sum / 2;
}

/** An edge moved inward, before its ends are settled: an endless straight line (o + u·s, s in mm)
 *  or the moved cubic (s its parameter). [s0, s1] is the stretch of it the band keeps. */
interface Offset {
  src: number;
  line?: { o: Point; u: Point; len: number };
  cubic?: Cubic;
  s0: number;
  s1: number;
}

const offsetAt = (g: Offset, s: number): Point => (g.line ? vAdd(g.line.o, vMul(g.line.u, s)) : bezAt(g.cubic!, s));
const naturalEnd = (g: Offset): number => (g.line ? g.line.len : 1);

/** Square to direction `u`, into an outline wound `sgn` (+1 when its shoelace area is positive). */
const inward = (u: Point, sgn: number): Point => ({ x: -u.y * sgn, y: u.x * sgn });

/** How sharply a cubic bends at its start and at its end, signed: + turning to the left of its own
 *  direction. 2/3 · the cross of its first two arms over the first arm's length cubed (its curvature
 *  at t = 0), and the same from the other end. */
function bendAtStart(c: Cubic): number {
  const arm = vSub(c[1], c[0]);
  const l = vLen(arm);
  return l > 1e-9 ? ((2 / 3) * vCross(arm, vSub(c[2], c[1]))) / l ** 3 : 0;
}
function bendAtEnd(c: Cubic): number {
  const arm = vSub(c[3], c[2]);
  const l = vLen(arm);
  return l > 1e-9 ? ((2 / 3) * vCross(vSub(c[2], c[1]), arm)) / l ** 3 : 0;
}

/** One edge moved `off` mm inward. A straight one is the parallel line. A curved one has its ends
 *  moved along their own normals and each control arm scaled by (1 − off·κ) — κ its bend at that
 *  end, signed so an edge curving round the inside shrinks — which keeps the bow a bow. A CIRCULAR
 *  arc (its two end normals meet at one point, as far from both ends) is scaled about that centre
 *  instead, by (R − off)/R exactly: a cubic's curvature at its ends is only nearly 1/R, and the ring
 *  the user asks for is concentric. */
function offsetEdge(src: number, a: Point, b: Point, curve: EdgeCurve | null | undefined, off: number, sgn: number): Offset {
  if (!curve) {
    const d = vSub(b, a);
    const u = vUnit(d);
    return { src, line: { o: vAdd(a, vMul(inward(u, sgn), off)), u, len: vLen(d) }, s0: 0, s1: vLen(d) };
  }
  const { c1, c2 } = absoluteControlPoints(a, b, curve);
  const c: Cubic = [a, c1, c2, b];
  const firstDir = [vSub(c1, a), vSub(c2, a), vSub(b, a)].find((v) => vLen(v) > 1e-9) ?? { x: 1, y: 0 };
  const lastDir = [vSub(b, c2), vSub(b, c1), vSub(b, a)].find((v) => vLen(v) > 1e-9) ?? { x: 1, y: 0 };
  const n0 = inward(vUnit(firstDir), sgn);
  const n1 = inward(vUnit(lastDir), sgn);
  let f0 = 1;
  let f1 = 1;
  if (off !== 0) {
    const centre = lineMeet(a, n0, b, n1);
    if (centre && Math.abs(centre.t) > 1e-6 && Math.abs(centre.t - centre.u) <= 1e-3 * Math.max(Math.abs(centre.t), Math.abs(centre.u))) {
      const R = (centre.t + centre.u) / 2;
      f0 = f1 = (R - off) / R;
    } else {
      f0 = 1 - off * sgn * bendAtStart(c);
      f1 = 1 - off * sgn * bendAtEnd(c);
    }
  }
  const p0 = vAdd(a, vMul(n0, off));
  const p3 = vAdd(b, vMul(n1, off));
  return {
    src,
    cubic: [p0, vAdd(p0, vMul(vSub(c1, a), Math.max(0, f0))), vAdd(p3, vMul(vSub(c2, b), Math.max(0, f1))), p3],
    s0: 0,
    s1: 1,
  };
}

/** The parameters where a line crosses a cubic, in [0, 1]: sign changes of the distance from the
 *  line along the cubic's samples, each closed in on by halving. An end touching the line counts. */
function lineCubicRoots(L: { o: Point; u: Point }, c: Cubic): number[] {
  const f = (t: number) => vCross(L.u, vSub(bezAt(c, t), L.o));
  const TOUCH = 1e-6;
  const roots: number[] = [];
  let tp = 0;
  let fp = f(0);
  if (Math.abs(fp) < TOUCH) roots.push(0);
  for (let k = 1; k <= SAMPLES; k++) {
    const t = k / SAMPLES;
    const ft = f(t);
    if (Math.abs(ft) < TOUCH) roots.push(t);
    else if (Math.abs(fp) >= TOUCH && fp * ft < 0) {
      let lo = tp;
      let hi = t;
      let flo = fp;
      for (let i = 0; i < 50; i++) {
        const m = (lo + hi) / 2;
        const fm = f(m);
        if (flo * fm <= 0) hi = m;
        else [lo, flo] = [m, fm];
      }
      roots.push((lo + hi) / 2);
    }
    [tp, fp] = [t, ft];
  }
  return roots;
}

/** Where two cubics cross, nearest the corner between them (late on A, early on B): found on their
 *  samples, then settled by Newton's method on the curves themselves. */
function cubicMeet(A: Cubic, B: Cubic): { sA: number; sB: number } | null {
  const N = 48;
  const pa = Array.from({ length: N + 1 }, (_, k) => bezAt(A, k / N));
  const pb = Array.from({ length: N + 1 }, (_, k) => bezAt(B, k / N));
  let best: { sA: number; sB: number } | null = null;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const m = lineMeet(pa[i], vSub(pa[i + 1], pa[i]), pb[j], vSub(pb[j + 1], pb[j]));
      if (!m || m.t < -1e-9 || m.t > 1 + 1e-9 || m.u < -1e-9 || m.u > 1 + 1e-9) continue;
      const hit = { sA: (i + m.t) / N, sB: (j + m.u) / N };
      if (!best || 1 - hit.sA + hit.sB < 1 - best.sA + best.sB) best = hit;
    }
  }
  if (!best) return null;
  let { sA, sB } = best;
  for (let k = 0; k < 8; k++) {
    const F = vSub(bezAt(A, sA), bezAt(B, sB));
    const dA = bezTangent(A, sA);
    const dB = vMul(bezTangent(B, sB), -1);
    const det = vCross(dA, dB);
    if (Math.abs(det) < 1e-12) break;
    const r = vMul(F, -1);
    sA = clamp01(sA + vCross(r, dB) / det);
    sB = clamp01(sB + vCross(dA, r) / det);
  }
  return { sA, sB };
}

/** Where the moved edge A (ending at a corner) and the moved edge B (leaving it) meet: their
 *  parameters there, or null for a bevel — they part, or meet so far off (two nearly parallel edges
 *  moved by different amounts) that the point would be a spike rather than a corner. `near` are the
 *  shape's own corners between them. */
function settleCorner(A: Offset, B: Offset, near: readonly Point[], limit: number): { sA: number; sB: number } | null {
  if (vDist(offsetAt(A, naturalEnd(A)), offsetAt(B, 0)) < 0.01) return { sA: naturalEnd(A), sB: 0 }; // they already meet
  let hit: { sA: number; sB: number } | null = null;
  if (A.line && B.line) {
    const m = lineMeet(A.line.o, A.line.u, B.line.o, B.line.u);
    if (m) hit = { sA: m.t, sB: m.u };
  } else if (A.line || B.line) {
    const L = (A.line ?? B.line)!;
    const c = (A.cubic ?? B.cubic)!;
    const roots = lineCubicRoots(L, c);
    if (roots.length) {
      // The crossing nearest the corner: early on a cubic that leaves it, late on one that ends there.
      const t = A.line ? Math.min(...roots) : Math.max(...roots);
      const s = vDot(vSub(bezAt(c, t), L.o), L.u);
      hit = A.line ? { sA: s, sB: t } : { sA: t, sB: s };
    }
  } else hit = cubicMeet(A.cubic!, B.cubic!);
  if (!hit) return null;
  const p = offsetAt(A, hit.sA);
  return near.some((v) => vDist(v, p) <= limit) ? hit : null;
}

/** The edges of `base` moved inward by `offs`, trimmed to meet each other — the inner edge of the
 *  band, as the moved edges that survive, in order. An edge the band swallows (its stretch comes out
 *  empty or backwards) is dropped, the most swallowed first, and the corners are settled again
 *  without it. Null when fewer than two survive: nothing is left inside. */
function innerLoop(base: BuiltOutline, offs: readonly number[], sgn: number): Offset[] | null {
  const P = base.outline;
  const n = P.length;
  let segs = P.map((a, i) => offsetEdge(i, a, P[(i + 1) % n], base.edgeCurves?.[i], offs[i], sgn));
  for (let pass = 0; pass <= n; pass++) {
    const m = segs.length;
    if (m < 2) return null;
    for (const g of segs) [g.s0, g.s1] = [0, naturalEnd(g)];
    for (let k = 0; k < m; k++) {
      const A = segs[k];
      const B = segs[(k + 1) % m];
      const near: Point[] = [];
      for (let e = (A.src + 1) % n; ; e = (e + 1) % n) {
        near.push(P[e]);
        if (e === B.src) break;
      }
      const hit = settleCorner(A, B, near, 10 * Math.max(offs[A.src], offs[B.src]) + 1);
      if (hit) [A.s1, B.s0] = [hit.sA, hit.sB];
    }
    let worst = -1;
    let worstShare = 1e-4;
    segs.forEach((g, k) => {
      const share = (g.s1 - g.s0) / (naturalEnd(g) || 1);
      if (share < worstShare) [worst, worstShare] = [k, share];
    });
    if (worst < 0) return segs;
    segs = segs.filter((_, k) => k !== worst);
  }
  return null;
}

/** The settled moved edges as pieces, with a straight bevel wherever two of them part. */
function loopPieces(segs: readonly Offset[]): Piece[] {
  const out: Piece[] = [];
  segs.forEach((g, k) => {
    if (g.cubic) {
      const w = bezWindow(g.cubic, g.s0, g.s1);
      out.push({ src: g.src, from: w[0], to: w[3], c: [w[1], w[2]] });
    } else out.push({ src: g.src, from: offsetAt(g, g.s0), to: offsetAt(g, g.s1) });
    const next = segs[(k + 1) % segs.length];
    const end = out[out.length - 1].to;
    const start = offsetAt(next, next.s0);
    if (vDist(end, start) > 0.01) out.push({ src: -1, from: end, to: start });
  });
  return out;
}

/** A closed walk of pieces as an outline. A piece of no length (a cap the bevel already drew, a gap
 *  at a side's very end) leaves no corner behind. */
function emitOutline(path: readonly Piece[]): BuiltOutline {
  const outline: Point[] = [];
  const edgeCurves: (EdgeCurve | null)[] = [];
  for (const p of path) {
    const curve = p.c ? { c1: vSub(p.c[0], p.from), c2: vSub(p.c[1], p.to) } : null;
    const last = outline[outline.length - 1];
    if (last && vDist(last, p.from) < 0.05) edgeCurves[edgeCurves.length - 1] = curve; // the piece before was nothing
    else {
      outline.push(p.from);
      edgeCurves.push(curve);
    }
  }
  if (outline.length > 1 && vDist(outline[outline.length - 1], outline[0]) < 0.05) {
    outline.pop();
    edgeCurves.pop();
  }
  return { outline, ...(edgeCurves.some(Boolean) ? { edgeCurves } : {}) };
}

/** The edge of a shape an entrance goes in when none was chosen: the lowest on screen (largest y at
 *  its middle) — the bottom run of a capsule, the base of a triangle. The first of a tie. */
function lowestEdge(outer: readonly Piece[]): number {
  let best = 0;
  let bestY = -Infinity;
  outer.forEach((p, i) => {
    const y = piecePoint(p, 0.5).y;
    if (y > bestY + 1e-6) [best, bestY] = [i, y];
  });
  return best;
}

/** A band that runs all the way round, as ONE outline: the outer edge from one side of the entrance
 *  round to the other, a cap in, the inner edge back, a cap out. Closed (no entrance) the two caps
 *  lie on top of each other at one point — the hatch's hairline.
 *
 *  The entrance is placed on the stretch of its side that the band runs straight along — between
 *  the band's INNER corners, not the shape's outer ones — so both caps cross the band square and an
 *  entrance at the start of a rectangle's side opens beside the leg rather than cutting the corner
 *  out from under it. On a side that runs on smoothly into the next (a capsule's bottom run) the two
 *  are the same, which is where the oval ring always put its opening. */
function closedBand(outer: readonly Piece[], inner: readonly Piece[], spec: HollowSpec): BuiltOutline {
  const n = outer.length;
  const g = spec.gapSide !== undefined && Number.isInteger(spec.gapSide) && spec.gapSide >= 0 && spec.gapSide < n ? spec.gapSide : lowestEdge(outer);
  const e = outer[g];
  const table = lengthTable(e);
  let k = inner.findIndex((p) => p.src === g);
  let lo = 0;
  let hi = table[SAMPLES];
  if (k >= 0) {
    const a = lengthAtParam(e, table, nearestParam(e, inner[k].from));
    const b = lengthAtParam(e, table, nearestParam(e, inner[k].to));
    [lo, hi] = [Math.min(a, b), Math.max(a, b)];
  }
  const gap = k >= 0 ? Math.min(Math.max(0, spec.gapMm ?? 0), hi - lo) : 0;
  const at = spec.gapAt ?? "center";
  const x0 = at === "start" ? lo : at === "end" ? hi - gap : (lo + hi - gap) / 2;
  const t0 = paramAtLength(e, table, x0);
  const t1 = gap > 0 ? paramAtLength(e, table, x0 + gap) : t0;
  const o0 = piecePoint(e, t0);
  const o1 = piecePoint(e, t1);
  if (k < 0) {
    // The band swallowed this side's inner edge: the seam goes to the nearest point of what is left.
    let bestD = Infinity;
    inner.forEach((p, i) => {
      const d = vDist(piecePoint(p, nearestParam(p, o0)), o0);
      if (d < bestD) [k, bestD] = [i, d];
    });
  }
  let v0 = nearestParam(inner[k], o0);
  let v1 = gap > 0 ? nearestParam(inner[k], o1) : v0;
  if (v1 < v0) v0 = v1 = (v0 + v1) / 2;
  const m = inner.length;
  const path: Piece[] = [cutPiece(e, t1, 1)];
  for (let i = 1; i < n; i++) path.push(outer[(g + i) % n]);
  path.push(cutPiece(e, 0, t0));
  const back0 = reversedPiece(cutPiece(inner[k], 0, v0)); // from the entrance's near side, backwards
  const back1 = reversedPiece(cutPiece(inner[k], v1, 1)); // …round to its far side
  path.push({ src: -1, from: o0, to: back0.from }); // the cap in
  path.push(back0);
  for (let i = 1; i < m; i++) path.push(reversedPiece(inner[(k - i + m) % m]));
  path.push(back1);
  path.push({ src: -1, from: back1.to, to: o1 }); // the cap out
  return emitOutline(path);
}

/** A shape's outline cut into a band `spec.bandMm` deep, inside it (see "Hollow" above) — the
 *  outlines it is drawn as, in the outline's own frame: one keyhole for a band that runs all the way
 *  round, one outline per run of closed sides between open ones, or the outline itself, solid, when
 *  the band leaves nothing inside (as deep as the shape), every side is open, or there is no band. */
export function buildHollow(base: BuiltOutline, spec: HollowSpec): BuiltOutline[] {
  const P = base.outline;
  const n = P.length;
  if (n < 2 || !(spec.bandMm > 0)) return [base];
  const outer = P.map((a, i) => edgePiece(i, a, P[(i + 1) % n], base.edgeCurves?.[i]));
  const outerArea = shoelace(piecesRing(outer));
  if (!(Math.abs(outerArea) > 1e-6)) return [base];
  const sgn = outerArea > 0 ? 1 : -1;
  const open = new Set((spec.openSides ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < n));
  if (open.size >= n) return [base];
  const offs = P.map((_, i) => (open.has(i) ? 0 : spec.bandMm));
  const segs = innerLoop(base, offs, sgn);
  if (!segs) return [base];
  const inner = loopPieces(segs);
  // Nothing left inside — or the inner edge turned itself inside out: the band is the whole shape.
  if (shoelace(piecesRing(inner)) * sgn <= 0.02 * Math.abs(outerArea)) return [base];
  // An open side the band closed off before reaching it (its moved line was swallowed) is no longer
  // a way out: it is walked as part of the band beside it.
  const opens = inner.flatMap((p, k) => (p.src >= 0 && open.has(p.src) ? [k] : []));
  if (!opens.length) return [closedBand(outer, inner, spec)];
  const m = inner.length;
  const out: BuiltOutline[] = [];
  opens.forEach((ka, idx) => {
    const kb = opens[(idx + 1) % opens.length];
    const a = inner[ka].src;
    const b = inner[kb].src;
    const run: Piece[] = [];
    for (let e = (a + 1) % n; e !== b; e = (e + 1) % n) run.push(outer[e]);
    if (!run.length) return; // two open sides side by side: nothing between them
    const back: Piece[] = [];
    for (let k = (kb - 1 + m) % m; k !== ka; k = (k - 1 + m) % m) back.push(reversedPiece(inner[k]));
    // The caps across the band lie ON the open sides — the inner edge was trimmed to them — so a cap
    // on a curved open side follows its curve rather than cutting the chord across it.
    const capOut = outer[b].c
      ? cutPiece(outer[b], 0, nearestParam(outer[b], inner[kb].from))
      : { src: -1, from: run[run.length - 1].to, to: inner[kb].from };
    const capHome = outer[a].c
      ? cutPiece(outer[a], nearestParam(outer[a], inner[ka].to), 1)
      : { src: -1, from: inner[ka].to, to: run[0].from };
    out.push(emitOutline([...run, capOut, ...back, capHome]));
  });
  return out.length ? out : [base];
}

/** The sides of a shape that may be opened (HollowSpec.openSides): the edges of its solid outline
 *  (hollowOuter), each with a name for the editor's chips — the direction its middle faces from the
 *  shape's centre, measured in the shape's own box so an ellipse's quarters read as diagonals, in
 *  eight words, with "(2)" on the second of a name. Screen y is DOWN. */
export interface HollowSide {
  index: number;
  mid: Point;
  name: string;
}

const SIDE_WORDS = ["ימין", "ימין-למטה", "למטה", "שמאל-למטה", "שמאל", "שמאל-למעלה", "למעלה", "ימין-למעלה"];

export function hollowSides(base: BuiltOutline): HollowSide[] {
  const n = base.outline.length;
  const b = sampledBounds([base]);
  const hw = b.w / 2 || 1;
  const hh = b.h / 2 || 1;
  const seen = new Map<string, number>();
  return base.outline.map((a, i) => {
    const mid = edgeMidpoint(a, base.outline[(i + 1) % n], base.edgeCurves?.[i]);
    const sector = ((Math.round(Math.atan2((mid.y - b.cy) / hh, (mid.x - b.cx) / hw) / (Math.PI / 4)) % 8) + 8) % 8;
    const word = SIDE_WORDS[sector];
    const count = (seen.get(word) ?? 0) + 1;
    seen.set(word, count);
    return { index: i, mid, name: count > 1 ? `${word} (${count})` : word };
  });
}

export const hollowSideNames = (base: BuiltOutline): string[] => hollowSides(base).map((s) => s.name);

/** The side an entrance goes in when the spec names none (or names one the shape no longer has). */
export function hollowGapSide(base: BuiltOutline, spec?: Pick<HollowSpec, "gapSide">): number {
  const n = base.outline.length;
  const g = spec?.gapSide;
  if (g !== undefined && Number.isInteger(g) && g >= 0 && g < n) return g;
  return lowestEdge(base.outline.map((a, i) => edgePiece(i, a, base.outline[(i + 1) % n], base.edgeCurves?.[i])));
}

/** A new hollow shape's band: 60cm — a bar module, a banquet table — unless the shape is too small
 *  for that to leave a middle, when a third of its shorter side. */
export const defaultHollowBand = (w: number, d: number): number => Math.max(10, Math.round(Math.min(600, Math.min(w, d) / 3)));

/** The shape drawn solid — what shapeFootprint was before a shape could be hollow. */
function solidFootprint(shape: MapShape, d: ShapeDims): Footprint {
  if (shape === "custom") {
    const { outline, edgeCurves } = d;
    if (outline && outline.length >= 3) return { kind: "custom", outline, ...(edgeCurves ? { edgeCurves } : {}) };
    // malformed custom → fall through to a safe rectangle
  }
  if (shape === "circle") {
    const D = d.diameterMm || d.widthMm || d.depthMm || MIN_FOOTPRINT_MM;
    // Part of the circle (`arc.sweepDeg` under 360): the solid slice — the arc's own outline with a
    // band the full radius. Hollowed with its radii open, it is the old קשת חלולה.
    const sweep = d.arc?.sweepDeg;
    if (sweep && sweep < 360) {
      const built = buildArcOutline(D, { sweepDeg: sweep, bandMm: D / 2 });
      return { kind: "custom", outline: built.outline, edgeCurves: built.edgeCurves };
    }
    return { kind: "circle", diameterMm: D };
  }
  if (shape === "arc") {
    const built = buildArcOutline(d.diameterMm || d.widthMm || MIN_FOOTPRINT_MM, d.arc);
    return { kind: "custom", outline: built.outline, edgeCurves: built.edgeCurves };
  }
  // Round by construction: the box is derived from the circle, never typed independently.
  if (shape === "half-circle" || shape === "quarter-circle") {
    const D = roundSizeMm(shape, d) || MIN_FOOTPRINT_MM;
    const built = shape === "half-circle" ? buildShapeOutline(shape, D, D / 2)! : buildShapeOutline(shape, D / 2, D / 2)!;
    return { kind: "custom", outline: built.outline, ...(built.edgeCurves ? { edgeCurves: built.edgeCurves } : {}) };
  }
  // Same single-measurement idea as circle above, just squared off instead of round — a "square"
  // Footprint kind of its own would only ever draw identically to "rect" with widthMm===depthMm,
  // so it resolves straight to that instead of adding a fourth shape every renderer has to know.
  if (shape === "square") {
    const side = d.diameterMm || d.widthMm || d.depthMm || MIN_FOOTPRINT_MM;
    return { kind: "rect", widthMm: side, depthMm: side };
  }
  // d.diameterMm is in this fallback chain too: a round-dims product (only a diameter field, no
  // width/depth) that's explicitly drawn as a rect/ellipse should still draw at its real size
  // instead of silently collapsing to the generic MIN_FOOTPRINT_MM box.
  const widthMm = d.widthMm || d.diameterMm || MIN_FOOTPRINT_MM;
  const depthMm = d.depthMm || d.diameterMm || MIN_FOOTPRINT_MM;
  // A derived shape resolves to a custom footprint the app draws FOR the designer: the canvas, the
  // printed placement map, the drag image and the seating that walks a table's edges all already
  // know how to render an outline with bowed edges, so a new shape needs nothing new anywhere else.
  const built = buildShapeOutline(shape, widthMm, depthMm, undefined, d.ring);
  if (built) return { kind: "custom", outline: built.outline, ...(built.edgeCurves ? { edgeCurves: built.edgeCurves } : {}) };
  return { kind: shape === "ellipse" ? "ellipse" : "rect", widthMm, depthMm };
}

export function resolveFootprint(product: Product): Footprint {
  const d = product.dimensions;
  const a = product.appearance;
  const shape = a?.shape ?? (d.diameterMm ? "circle" : "rect");
  const dims: ShapeDims = { ...d, outline: a?.outline, edgeCurves: a?.edgeCurves, arc: a?.arc, ring: a?.ring, hollow: a?.hollow };
  // With parts, the base joins the composite as its pieces in its OUTER box's frame (shapePieces) —
  // the frame the parts' offsets are measured from — rather than re-centred on what a hollow band
  // opened on a side leaves of it.
  return a?.parts?.length ? composePieces(shapePieces(shape, dims), a.parts) : shapeFootprint(shape, dims);
}

// ── Outlines, for everything ───────────────────────────────────────────────────────────────────
//
// Every footprint as closed outlines centred in its own frame. The primitives own none — they draw
// as SVG circle/ellipse/rect — so they are spelled out here: a rectangle's four corners, and a
// circle or ellipse as four quarter arcs with the apex of each at a vertex (rule 2, so the bounds
// read off the points stay honest). This is what lets a part of ANY shape join a composite, and the
// custom-shape editor start from any shape.

export function footprintOutlines(f: Footprint): BuiltOutline[] {
  switch (f.kind) {
    case "multi":
      return f.parts;
    case "custom": {
      const b = customShapeBounds(f.outline, f.edgeCurves);
      return [{ outline: f.outline.map((p) => ({ x: p.x - b.cx, y: p.y - b.cy })), edgeCurves: f.edgeCurves }];
    }
    case "rect": {
      const hw = f.widthMm / 2;
      const hh = f.depthMm / 2;
      return [{ outline: [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }] }];
    }
    default: {
      const rx = (f.kind === "circle" ? f.diameterMm : f.widthMm) / 2;
      const ry = (f.kind === "circle" ? f.diameterMm : f.depthMm) / 2;
      return [
        {
          outline: [{ x: -rx, y: 0 }, { x: 0, y: ry }, { x: rx, y: 0 }, { x: 0, y: -ry }],
          edgeCurves: [
            { c1: { x: 0, y: K * ry }, c2: { x: -K * rx, y: 0 } },
            { c1: { x: K * rx, y: 0 }, c2: { x: 0, y: K * ry } },
            { c1: { x: 0, y: -K * ry }, c2: { x: K * rx, y: 0 } },
            { c1: { x: -K * rx, y: 0 }, c2: { x: 0, y: -K * ry } },
          ],
        },
      ];
    }
  }
}

const CURVE_STEPS = 16;

/** One edge as a polyline — straight, or its bezier sampled. Both ends included. */
export function flattenEdge(a: Point, b: Point, curve?: EdgeCurve | null, steps = CURVE_STEPS): Point[] {
  if (!curve) return [a, b];
  const { c1, c2 } = absoluteControlPoints(a, b, curve);
  const pts = [a];
  for (let k = 1; k < steps; k++) {
    const t = k / steps;
    const u = 1 - t;
    const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
    pts.push({ x: w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x, y: w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y });
  }
  pts.push(b);
  return pts;
}

/** The box around outlines whose extremes may sit INSIDE a curve — a part turned 30° has its apex
 *  there, not at a vertex, and so does a hand-drawn side bowed in the shape editor — so the curves
 *  are sampled rather than trusted to rule 2. */
export function sampledBounds(pieces: readonly BuiltOutline[]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { outline, edgeCurves } of pieces) {
    outline.forEach((a, i) => {
      for (const p of flattenEdge(a, outline[(i + 1) % outline.length], edgeCurves?.[i])) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
    });
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0, w: 0, h: 0, cx: 0, cy: 0 };
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/** An outline in a part's own frame turned about its centre and moved to the part's offset. */
function placeInPart(o: BuiltOutline, part: ShapePart): BuiltOutline {
  const t = ((part.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const turn = (v: Point): Point => ({ x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos });
  return {
    outline: o.outline.map((v) => {
      const q = turn(v);
      return { x: q.x + (part.x || 0), y: q.y + (part.y || 0) };
    }),
    ...(o.edgeCurves ? { edgeCurves: o.edgeCurves.map((c) => (c ? { c1: turn(c.c1), c2: turn(c.c2) } : null)) } : {}),
  };
}

/** One part as ONE outline in the BASE shape's frame — resolved like a base shape, turned about its
 *  own centre and moved to its offset — and drawn SOLID: what the appearance editor hands its outline
 *  editor when a part is redrawn by hand, and whose edges are the part's sides to open. A hollow part
 *  redrawn by hand keeps its HollowSpec, so the redrawn outline is the outside of its band. */
export function placedPartOutline(part: ShapePart): BuiltOutline {
  return placeInPart(hollowOuter(part.shape, part), part);
}

/** One part as the outlines it is drawn as, in the base's frame: one, or a hollow part's pieces. */
export function placedPartOutlines(part: ShapePart): BuiltOutline[] {
  return shapePieces(part.shape, part).map((o) => placeInPart(o, part));
}

/** A base footprint and the parts added beside it, as one footprint. Each part is resolved by the
 *  same rule a base shape is (shapeFootprint), turned about its own centre, moved to its offset from
 *  the base's centre — and then the whole lot is re-centred on its own box, because every footprint
 *  is drawn centred on the point its item stands on. */
export function composeFootprint(base: Footprint, parts: readonly ShapePart[]): Footprint {
  return composePieces(footprintOutlines(base), parts);
}

/** The base's pieces and each part's, as one multi re-centred on the lot. In order — the base's,
 *  then each part's — and while every shape is one outline, piece k IS shape k, which is how
 *  ItemSurface reads a part's own texture. A shape drawn as several (a hollow one opened in two
 *  places) breaks that count, so then every piece says which shape it is (BuiltOutline.of). */
function composePieces(basePieces: readonly BuiltOutline[], parts: readonly ShapePart[]): Footprint {
  const groups = [basePieces, ...parts.map(placedPartOutlines)];
  const several = groups.some((g) => g.length !== 1);
  const pieces = groups.flatMap((g, k) => g.map((p) => (several ? { ...p, of: k } : p)));
  const b = sampledBounds(pieces);
  return {
    kind: "multi",
    parts: pieces.map((p) => ({ ...p, outline: p.outline.map((v) => ({ x: v.x - b.cx, y: v.y - b.cy })) })),
  };
}

export function resolveContent(product: Product): ResolvedContent {
  const a = product.appearance;
  let mode: ResolvedContent["mode"] = a?.content ?? "name";
  if (mode === "icon" && !a?.icon) mode = "name"; // never render blank
  return { mode, icon: a?.icon, name: product.name };
}

// Bounds of a catalog item's custom shape, in the item's own local space — the box the shape editor
// and every preview recentre on, with the short w/h names those call sites read. Given the outline's
// curves it samples them (sampledBounds), because a bowed side's apex is not a corner: without them
// a rectangle with one side bowed out was measured, saved and centred as if the bow were not there.
// Without curves (or with none set) the min/max is geometry.outlineBounds over the points. Named for
// the catalog shape rather than "outline" so it can't be confused with the canonical one in ./geometry.
export function customShapeBounds(outline: Point[], edgeCurves?: (EdgeCurve | null)[]) {
  if (edgeCurves?.some((c, i) => c && i < outline.length)) return sampledBounds([{ outline, edgeCurves }]);
  const { minX, maxX, minY, maxY, widthMm, heightMm } = outlineBounds(outline);
  return { minX, maxX, minY, maxY, w: widthMm, h: heightMm, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function footprintBounds(f: Footprint): { w: number; h: number } {
  switch (f.kind) {
    case "circle": return { w: f.diameterMm, h: f.diameterMm };
    case "rect":
    case "ellipse": return { w: f.widthMm, h: f.depthMm };
    case "custom": { const b = customShapeBounds(f.outline, f.edgeCurves); return { w: b.w, h: b.h }; }
    case "multi": { const b = sampledBounds(f.parts); return { w: b.w, h: b.h }; }
  }
}

// ── Sized on the plan ──────────────────────────────────────────────────────────────────────────
//
// A resizable product (Product.resize) is stretched per placement, and what is stored is the new
// BOUNDING BOX — the same width × depth a derived shape is drawn from. So a derived shape is simply
// derived again at the new size: a ח stretched from 3.6m to 4.8m is a 4.8m ח, not a 3.6m one pulled
// wide, and a hexagon stays the hexagon its two numbers describe. Only the two things that have no
// numbers to re-derive from — a hand-drawn outline and a composite with added parts — are SCALED,
// which is the one reading of "make it bigger" either can honour.

/** The box the catalog draws this item at, in whole millimetres — what "back to the catalog's size"
 *  means, and the size every other size is measured against. */
export function catalogBox(product: Product): { widthMm: number; depthMm: number } {
  const b = footprintBounds(resolveFootprint(product));
  return { widthMm: Math.round(b.w), depthMm: Math.round(b.h) };
}

const shapeOfProduct = (product: Product): MapShape =>
  product.appearance?.shape ?? (product.dimensions.diameterMm ? "circle" : "rect");

/** How the plan may stretch this product: the row's own say (Product.resize) when it has one, else
 *  its category's default (CategoryDef.defaultResize — a banquette is laid to length without every
 *  studio switching that on row by row). Undefined = a thing of one size. Every reader of `resize`
 *  on this side of the catalog goes through here, so a category default is honoured by the handles,
 *  the size panel and the drawing alike. */
export function resizeSpecOf(product: Product): ResizeSpec | undefined {
  return product.resize ?? CATEGORY_BY_ID[product.category]?.defaultResize;
}

/** Which of the box's two sides the plan may change, or null for a thing of one size. A round
 *  shape has ONE measurement: width is its diameter and depth follows it, so a round table can grow
 *  but never become an egg. */
export function resizeAxes(product: Product): { width: boolean; depth: boolean; uniform: boolean } | null {
  const r = resizeSpecOf(product);
  if (!r || (!r.width && !r.depth)) return null;
  const uniform = usesDiameter(shapeOfProduct(product));
  if (uniform && !r.width) return null;
  return { width: !!r.width, depth: !uniform && !!r.depth, uniform };
}

/** A requested size made honest: each free side snapped to the item's module and held inside its
 *  range, each fixed side put back to the catalog's, and a round shape's depth re-derived from its
 *  width. Every size a gesture or a typed number writes goes through this, so the plan can never
 *  hold a 2.37m stage built in 1m decks. */
export function clampSize(product: Product, size: { widthMm: number; depthMm: number }): { widthMm: number; depthMm: number } {
  const base = catalogBox(product);
  const axes = resizeAxes(product);
  const spec = resizeSpecOf(product);
  if (!axes || !spec) return base;
  const step = Math.max(1, spec.stepMm || RESIZE_DEFAULT_STEP_MM);
  const fit = (v: number, range: { minMm: number; maxMm: number } | undefined, fallback: number) => {
    if (!range) return fallback;
    const lo = Math.min(range.minMm, range.maxMm);
    const hi = Math.max(range.minMm, range.maxMm);
    const snapped = Math.round(v / step) * step;
    return Math.round(Math.min(hi, Math.max(lo, snapped || step)));
  };
  const widthMm = axes.width ? fit(size.widthMm, spec.width, base.widthMm) : base.widthMm;
  if (axes.uniform) {
    const ratio = base.widthMm ? base.depthMm / base.widthMm : 1;
    return { widthMm, depthMm: Math.round(widthMm * ratio) };
  }
  const depthMm = axes.depth ? fit(size.depthMm, spec.depth, base.depthMm) : base.depthMm;
  return { widthMm, depthMm };
}

/** Every point and bezier offset of a footprint pulled by (sx, sy) about its own centre. A linear
 *  map carries a bezier exactly, control points and all, so a bowed edge stays the same bow. */
export function scaleFootprint(f: Footprint, sx: number, sy: number): Footprint {
  const pt = (p: Point): Point => ({ x: p.x * sx, y: p.y * sy });
  const curves = (c?: (EdgeCurve | null)[]) => c?.map((e) => (e ? { c1: pt(e.c1), c2: pt(e.c2) } : null));
  switch (f.kind) {
    case "rect":
      return { kind: "rect", widthMm: f.widthMm * sx, depthMm: f.depthMm * sy };
    case "ellipse":
      return { kind: "ellipse", widthMm: f.widthMm * sx, depthMm: f.depthMm * sy };
    case "circle":
      return Math.abs(sx - sy) < 1e-9
        ? { kind: "circle", diameterMm: f.diameterMm * sx }
        : { kind: "ellipse", widthMm: f.diameterMm * sx, depthMm: f.diameterMm * sy };
    case "custom":
      return { kind: "custom", outline: f.outline.map(pt), ...(f.edgeCurves ? { edgeCurves: curves(f.edgeCurves) } : {}) };
    case "multi":
      return { kind: "multi", parts: f.parts.map((p) => ({ ...p, outline: p.outline.map(pt), ...(p.edgeCurves ? { edgeCurves: curves(p.edgeCurves) } : {}) })) };
  }
}

/** The footprint a placed item is drawn with: the catalog's, or — for one stretched on the plan —
 *  the same shape at the size it was stretched to (see the note above). */
export function sizedFootprint(product: Product, sizeMm?: { widthMm: number; depthMm: number }): Footprint {
  if (!sizeMm || !resizeSpecOf(product)) return resolveFootprint(product);
  const a = product.appearance;
  const shape = shapeOfProduct(product);
  if (!a?.parts?.length && shape !== "custom") {
    if (usesDiameter(shape)) {
      // The box's width IS the circle's diameter for everything cut from one except the quarter,
      // whose box is one radius across (see ROUND_FIELD).
      const diameterMm = shape === "quarter-circle" ? sizeMm.widthMm * 2 : sizeMm.widthMm;
      return shapeFootprint(shape, { diameterMm, arc: a?.arc, hollow: a?.hollow });
    }
    return shapeFootprint(shape, { widthMm: sizeMm.widthMm, depthMm: sizeMm.depthMm, arc: a?.arc, ring: a?.ring, hollow: a?.hollow });
  }
  // A hand-drawn outline drawn hollow: the OUTLINE is stretched and the band cut inside it again, so
  // the band stays the depth of its modules, as it does on a derived shape. (With parts the whole
  // composite is scaled, band and all — the one reading of "bigger" a composite has.)
  const hollow = !a?.parts?.length ? hollowOf(shape, a?.hollow) : undefined;
  if (hollow) {
    const outer = hollowOuter(shape, { outline: a?.outline, edgeCurves: a?.edgeCurves });
    const ob = sampledBounds([outer]);
    if (ob.w && ob.h) {
      const stretched = scaleFootprint({ kind: "custom", outline: outer.outline, ...(outer.edgeCurves ? { edgeCurves: outer.edgeCurves } : {}) }, sizeMm.widthMm / ob.w, sizeMm.depthMm / ob.h);
      return piecesFootprint(buildHollow(footprintOutlines(stretched)[0], hollow));
    }
  }
  const base = resolveFootprint(product);
  const b = footprintBounds(base);
  if (!b.w || !b.h) return base;
  return scaleFootprint(base, sizeMm.widthMm / b.w, sizeMm.depthMm / b.h);
}

// ponytail: self-check. Run: node --experimental-strip-types lib/studio/footprint.ts
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error("FAIL: " + m); };
  const base: Product = {
    id: "x", name: "בדיקה", category: "chairs", layer: "floor",
    dimensions: { heightMm: 900 }, categoryFields: {}, styleTags: [], variants: [],
  };
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  assert(eq(resolveFootprint({ ...base, dimensions: { diameterMm: 1800, heightMm: 750 } }), { kind: "circle", diameterMm: 1800 }), "diameter derives circle");
  assert(eq(resolveFootprint({ ...base, dimensions: { widthMm: 420, depthMm: 450, heightMm: 920 } }), { kind: "rect", widthMm: 420, depthMm: 450 }), "w/d derives rect");
  assert(eq(resolveFootprint(base), { kind: "rect", widthMm: 600, depthMm: 600 }), "missing dims → floor default");
  assert(eq(resolveFootprint({ ...base, dimensions: { widthMm: 800, depthMm: 400, heightMm: 100 }, appearance: { shape: "ellipse", content: "none" } }), { kind: "ellipse", widthMm: 800, depthMm: 400 }), "explicit ellipse");
  assert(eq(resolveFootprint({ ...base, dimensions: { widthMm: 120, depthMm: 120, heightMm: 350 }, appearance: { shape: "circle", content: "none" } }), { kind: "circle", diameterMm: 120 }), "circle falls back to width when no diameter");
  assert(eq(resolveFootprint({ ...base, dimensions: { diameterMm: 1800, heightMm: 750 }, appearance: { shape: "ellipse", content: "none" } }), { kind: "ellipse", widthMm: 1800, depthMm: 1800 }), "a round-dims product drawn as ellipse falls back to its real diameter, not the generic floor default");
  assert(eq(resolveFootprint({ ...base, dimensions: { diameterMm: 1800, heightMm: 750 }, appearance: { shape: "square", content: "none" } }), { kind: "rect", widthMm: 1800, depthMm: 1800 }), "square resolves to an equal-sided rect, sized from whichever dimension is set");
  const outline = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }];
  assert(eq(resolveFootprint({ ...base, appearance: { shape: "custom", outline, content: "none" } }), { kind: "custom", outline }), "valid custom");
  assert(eq(resolveFootprint({ ...base, dimensions: { widthMm: 200, depthMm: 200, heightMm: 1 }, appearance: { shape: "custom", outline: [{ x: 0, y: 0 }], content: "none" } }), { kind: "rect", widthMm: 200, depthMm: 200 }), "malformed custom → rect fallback");

  assert(resolveContent(base).mode === "name", "content defaults to name");
  assert(resolveContent({ ...base, appearance: { shape: "rect", content: "icon" } }).mode === "name", "icon without icon → name");
  assert(eq(resolveContent({ ...base, appearance: { shape: "rect", content: "icon", icon: "wine" } }), { mode: "icon", icon: "wine", name: "בדיקה" }), "icon with icon");

  assert(eq(footprintBounds({ kind: "circle", diameterMm: 800 }), { w: 800, h: 800 }), "circle bounds");
  assert(eq(footprintBounds({ kind: "custom", outline }), { w: 100, h: 100 }), "custom bounds");

  // ── The derived shapes ───────────────────────────────────────────────────────────────────────
  // Rule 1 (the bounding box IS width × depth) and rule 2 (every extreme is a vertex, which is what
  // makes rule 1 measurable at all), for every shape in the vocabulary — at a size whose width and
  // depth differ, so a shape that quietly squared itself cannot pass.
  const derived: MapShape[] = ["stadium", "half-circle", "quarter-circle", "crescent", "oval-ring", "horseshoe", "triangle", "trapezoid", "hexagon", "octagon", "u-shape", "rounded-u"];
  for (const shape of derived) {
    const built = buildShapeOutline(shape, 1200, 600);
    if (!built) throw new Error(`FAIL: ${shape} is not built — it would fall back to a rectangle`);
    assert(built.outline.length >= 3, `${shape}: is a closed shape`);
    assert(
      built.edgeCurves === undefined || built.edgeCurves.length === built.outline.length,
      `${shape}: one curve slot per edge, or no curves at all`,
    );
    const b = customShapeBounds(built.outline);
    assert(b.w === 1200 && b.h === 600, `${shape}: measures exactly what the drawer asked for`);
    assert(Math.abs(b.cx) < 1e-9 && Math.abs(b.cy) < 1e-9, `${shape}: is centred on its own origin`);

    const item: Product = {
      ...base,
      dimensions: { widthMm: 1200, depthMm: 600, heightMm: 750 },
      appearance: { shape, content: "none" },
    };
    const f = resolveFootprint(item);
    assert(f.kind === "custom", `${shape}: resolves to an outline the whole app already draws`);
    // The round ones are sized by their circle (usesDiameter): a width of 1200 is a half circle
    // 1200 across — 1200×600, as before — and a quarter of radius 1200.
    const want = shape === "quarter-circle" ? { w: 1200, h: 1200 } : { w: 1200, h: 600 };
    assert(eq(footprintBounds(f), want), `${shape}: keeps its size through the resolver`);
  }

  // A derived shape with no measurements is floored like a rectangle — never drawn at zero.
  assert(
    eq(footprintBounds(resolveFootprint({ ...base, appearance: { shape: "hexagon", content: "none" } })), { w: MIN_FOOTPRINT_MM, h: MIN_FOOTPRINT_MM }),
    "a derived shape with no dimensions gets the same floor a rectangle does",
  );

  // The base library's חצי עיגול 120×60 (lib/catalog/standard/items.ts) is a half-circle of exactly
  // these two numbers: the built arc is the one that file used to spell out by hand, to the
  // millimetre. This is the assertion that keeps the two from drifting apart.
  const half = buildShapeOutline("half-circle", 1200, 600);
  const arc = half?.edgeCurves?.[1];
  assert(!!arc && Math.abs(arc.c1.y + 331) < 1 && Math.abs(arc.c2.x - 331) < 1, "the built חצי עיגול is the table the base library drew by hand");

  // The ח is the one derived shape with a HOLE in it — an outline that measured 1200×600 and still
  // filled the whole box would be a rectangle wearing the name. Shoelace area, against the counter
  // the shape claims to be: w·d minus the opening, which is (w − 2t) × (d − t) at t = min(w,d)/3.
  const u = buildShapeOutline("u-shape", 1200, 600)!;
  const area = (pts: Point[]) =>
    Math.abs(pts.reduce((sum, p, i) => {
      const q = pts[(i + 1) % pts.length];
      return sum + (p.x * q.y - q.x * p.y);
    }, 0)) / 2;
  const t = 200; // min(1200, 600) / 3
  assert(u.outline.length === 8, "the ח has eight corners — three sides and an open fourth");
  assert(!u.edgeCurves, "…and not one of them is curved");
  assert(
    Math.abs(area(u.outline) - (1200 * 600 - (1200 - 2 * t) * (600 - t))) < 1e-6,
    `the ח is a ${t}mm counter around an open middle, not a filled box (${area(u.outline)})`,
  );
  // Deeper than it is wide: the band comes off the short side, so the opening survives.
  const tall = buildShapeOutline("u-shape", 900, 3000)!;
  assert(area(tall.outline) < 900 * 3000, "a ח deeper than it is wide is still open, not a solid slab");
  // A measured counter: ורדה's 9.0 × 1.2m ח bar drew a 40cm counter (a third of 1.2m); at 60cm it is
  // 60cm whatever the box, and a stretched bar keeps it rather than thickening with the arms.
  const counter = (w: number, d: number) => {
    const o = buildShapeOutline("u-shape", w, d, undefined, { bandMm: 600 })!.outline;
    return o[2].x - o[3].x; // the outside of the right leg to its inside, along the open edge
  };
  assert(Math.abs(counter(9000, 1200) - 600) < 1e-6 && Math.abs(counter(9000, 2400) - 600) < 1e-6, "a measured ח counter stays its depth when the bar is stretched");
  assert(uShapeBandOf(1200, 600) === 200 && uShapeBandOf(1200, 600, {}) === 200, "…and with no number it is still a third of the shorter side");
  assert(uShapeBandOf(1000, 3000, { bandMm: 900 }) === 475 && uShapeBandOf(3000, 500, { bandMm: 900 }) === 475, "a counter never closes the ח's opening");
  {
    const u60 = buildShapeOutline("u-shape", 3600, 1800, undefined, { bandMm: 600 })!;
    const b60 = customShapeBounds(u60.outline);
    assert(b60.w === 3600 && b60.h === 1800, "a measured ח still measures its two numbers");
  }

  assert(buildShapeOutline("rect", 100, 100) === null, "a primitive is not built");
  assert(buildShapeOutline("custom", 100, 100) === null, "a drawn outline is not built");

  // ── Round means round ──────────────────────────────────────────────────────────────────────
  // Two numbers that are not 2:1 used to make a half ELLIPSE. The circle wins now: a stated diameter
  // is the whole story, and a width/depth pair from an older row is read as the circle's width.
  const halfOf = (dims: Product["dimensions"]) =>
    footprintBounds(resolveFootprint({ ...base, dimensions: dims, appearance: { shape: "half-circle", content: "none" } }));
  assert(eq(halfOf({ diameterMm: 1800, heightMm: 750 }), { w: 1800, h: 900 }), "a half circle is half its circle");
  assert(eq(halfOf({ widthMm: 1800, depthMm: 1400, heightMm: 750 }), { w: 1800, h: 900 }), "…whatever depth an old row typed");
  const quarter = footprintBounds(resolveFootprint({ ...base, dimensions: { diameterMm: 2000, heightMm: 750 }, appearance: { shape: "quarter-circle", content: "none" } }));
  assert(eq(quarter, { w: 1000, h: 1000 }), "a quarter circle is one radius square");

  // ── The arc ────────────────────────────────────────────────────────────────────────────────
  // A half ring 4m across with a 75cm band: 4m wide, 2m tall, and a hole in it — the band's area,
  // not the half-disc's. Sized by its circle, so the box follows from the diameter and the sweep.
  const ring = buildArcOutline(4000, { sweepDeg: 180, bandMm: 750 });
  const rb = customShapeBounds(ring.outline);
  assert(Math.abs(rb.w - 4000) < 1e-6 && Math.abs(rb.h - 2000) < 1e-6, `a half ring is as wide as its circle and half as tall (${rb.w}×${rb.h})`);
  assert(Math.abs(rb.cx) < 1e-9 && Math.abs(rb.cy) < 1e-9, "…and centred on its own origin");
  assert(ring.edgeCurves?.length === ring.outline.length, "one curve slot per edge");
  const third = customShapeBounds(buildArcOutline(4000, { sweepDeg: 120, bandMm: 750 }).outline);
  assert(third.w < 4000 && Math.abs(third.w - 4000 * Math.sin(Math.PI / 3)) < 1, "a third of a ring is narrower than its circle, by the chord");
  const big = customShapeBounds(buildArcOutline(4000, { sweepDeg: 270, bandMm: 750 }).outline);
  // Centred on the top, 270° runs from -225° to 45°: it touches the top, left and right of its
  // circle, and its two ends stop 45° short of the bottom.
  assert(
    Math.abs(big.w - 4000) < 1e-6 && Math.abs(big.h - 2000 * (1 + Math.SQRT1_2)) < 1e-6,
    `three quarters of a ring reaches three sides of its circle (${big.w}×${big.h})`,
  );
  const sweepClamp = arcSpecOf(2000, { sweepDeg: 400, bandMm: 5000 });
  assert(sweepClamp.sweepDeg === 330 && sweepClamp.bandMm === 1000, "an arc cannot close into a ring, nor its band outgrow the radius");
  const slice = buildArcOutline(2000, { sweepDeg: 90, bandMm: 1000 });
  // -135°…-45° crosses the -90° cut: three points on the arc, then the centre — no inner arc.
  assert(slice.outline.length === 4, "a band the full radius is a slice: the arc, and the centre it closes on");
  const arcItem: Product = { ...base, dimensions: { diameterMm: 4000, heightMm: 750 }, appearance: { shape: "arc", content: "none", arc: { sweepDeg: 180, bandMm: 750 } } };
  assert(eq(footprintBounds(resolveFootprint(arcItem)), { w: 4000, h: 2000 }), "the resolver draws an arc from its diameter");
  const near = (a: { w: number; h: number }, b: { w: number; h: number }) => Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1;
  const halfSlice = shapeFootprint("circle", { diameterMm: 2000, arc: { sweepDeg: 180, bandMm: 0 } });
  assert(halfSlice.kind === "custom" && halfSlice.outline.length === 3 && near(footprintBounds(halfSlice), { w: 2000, h: 1000 }), "half of a circle is a half circle: the arc and ONE chord");
  assert(shapeFootprint("circle", { diameterMm: 2000, arc: { sweepDeg: 360, bandMm: 0 } }).kind === "circle", "all of a circle is the circle");
  const thirdRing = shapeFootprint("circle", { diameterMm: 4000, arc: { sweepDeg: 120, bandMm: 0 }, hollow: { bandMm: 750, openSides: [2, 3] } });
  const thirdArc = shapeFootprint("arc", { diameterMm: 4000, arc: { sweepDeg: 120, bandMm: 750 } });
  assert(thirdRing.kind === "custom" && near(footprintBounds(thirdRing), footprintBounds(thirdArc)), "a third of a circle, hollow with its radii open, is the third of a ring the arc drew");

  // ── The capsule, and the hollow oval ───────────────────────────────────────────────────────
  const flat = (o: BuiltOutline): Point[] =>
    o.outline.flatMap((a, i) => flattenEdge(a, o.outline[(i + 1) % o.outline.length], o.edgeCurves?.[i]).slice(0, -1));
  const inside = (p: Point, poly: Point[]): boolean => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };
  // A 1200×600 capsule is a 600×600 square of runs with a whole ⌀600 circle of ends; a tall one is
  // the same shape stood up, and one as wide as it is deep has no runs at all.
  const capsule = buildShapeOutline("stadium", 1200, 600)!;
  assert(capsule.outline.length === 6, "a capsule is six vertices — two runs and four quarter arcs");
  assert(
    Math.abs(area(flat(capsule)) - (600 * 600 + Math.PI * 300 * 300)) < 0.005 * 1200 * 600,
    `…with the area of a square and a circle (${area(flat(capsule))})`,
  );
  const tallCapsule = customShapeBounds(buildShapeOutline("stadium", 600, 1200)!.outline);
  assert(tallCapsule.w === 600 && tallCapsule.h === 1200, "a tall capsule stands up to its own two numbers");
  assert(buildShapeOutline("stadium", 800, 800)!.outline.length === 4, "a capsule as wide as it is deep is a circle: four quarters, no runs");

  // The oval ring is the modular curved bar it was added for: 7.34×3.60 in 60cm-deep modules, with
  // a 184.5cm staff opening at the right end of its bottom run and a counter in the middle.
  const ovalBar: Product = {
    ...base,
    category: "bars",
    dimensions: { widthMm: 7340, depthMm: 3600, heightMm: 1100 },
    appearance: { shape: "oval-ring", content: "none", ring: { bandMm: 600, gapMm: 1845, gapAt: "right" } },
  };
  const ovalF = resolveFootprint(ovalBar);
  assert(ovalF.kind === "custom", "an oval ring is one outline, like the arc");
  assert(eq(footprintBounds(ovalF), { w: 7340, h: 3600 }), "…measuring exactly its two numbers, opening and all");
  const ovalPoly = flat(footprintOutlines(ovalF)[0]);
  assert(!inside({ x: 0, y: 0 }, ovalPoly), "the middle of the ring is floor the staff stand on, not bar");
  assert(inside({ x: 0, y: -1500 }, ovalPoly), "the top run is bar");
  assert(inside({ x: -1500, y: 1500 }, ovalPoly), "the bottom run is bar left of the opening…");
  assert(!inside({ x: 1000, y: 1500 }, ovalPoly), "…and the opening itself is floor");
  assert(inside({ x: 3370, y: 0 }, ovalPoly) && !inside({ x: 2500, y: 0 }, ovalPoly), "the right end is a 60cm band round an open middle");
  const ovalArea = 3740 * 3600 + Math.PI * 1800 ** 2 - (3740 * 2400 + Math.PI * 1200 ** 2) - 1845 * 600;
  assert(Math.abs(area(ovalPoly) - ovalArea) < 0.002 * ovalArea, `a ring is a band less its opening, not a slab (${area(ovalPoly)} vs ${ovalArea})`);
  const clamped = ringSpecOf(7340, 3600, { bandMm: 5000, gapMm: 100, gapAt: "left" });
  assert(clamped.bandMm === 1800 && clamped.gapMm === RING_GAP.min, "the band stops at the end radius, and an opening that is not nothing is wide enough to walk through");
  // Closed: the same band all the way round, the hole still a hole, the box still the box.
  const closedRing = buildShapeOutline("oval-ring", 7340, 3600, undefined, { bandMm: 600, gapMm: 0, gapAt: "right" })!;
  const closedB = customShapeBounds(closedRing.outline);
  assert(closedB.w === 7340 && closedB.h === 3600, "a closed ring measures its two numbers");
  const closedPoly = flat(closedRing);
  assert(
    !inside({ x: 0, y: 0 }, closedPoly) && inside({ x: 0, y: 1500 }, closedPoly) && inside({ x: 1000, y: 1500 }, closedPoly),
    "…its middle is still floor and its bottom run is bar all the way along",
  );
  const bandArea = 3740 * 3600 + Math.PI * 1800 ** 2 - (3740 * 2400 + Math.PI * 1200 ** 2);
  assert(Math.abs(area(closedPoly) - bandArea) < 0.002 * bandArea, `…and it is the whole band (${area(closedPoly)} vs ${bandArea})`);
  assert(ringSpecOf(7340, 3600, { bandMm: 600, gapMm: 99999 }).gapMm === 3740, "…and never longer than the run it is cut from");
  const openRun = customShapeBounds(buildShapeOutline("oval-ring", 2400, 1800, undefined, { bandMm: 400, gapMm: 9999 })!.outline);
  assert(openRun.w === 2400 && openRun.h === 1800, "with the whole bottom run open the box still measures what it says");
  const tallRing = flat(buildShapeOutline("oval-ring", 3600, 7340, undefined, { bandMm: 600, gapMm: 1845, gapAt: "right" })!);
  assert(inside({ x: -1500, y: 0 }, tallRing) && !inside({ x: 1500, y: 1000 }, tallRing), "a tall oval ring is the wide one stood up, open on its right-hand run");
  // Stretched on the plan it gains straight run; the band stays the depth of its modules.
  const ovalWide = sizedFootprint({ ...ovalBar, resize: { stepMm: 100, width: { minMm: 4000, maxMm: 12000 } } }, { widthMm: 9000, depthMm: 3600 });
  assert(eq(footprintBounds(ovalWide), { w: 9000, h: 3600 }), "a stretched oval ring is re-derived at its new box");
  const widePoly = flat(footprintOutlines(ovalWide)[0]);
  assert(inside({ x: 0, y: -1500 }, widePoly) && !inside({ x: 0, y: -1100 }, widePoly), "…with the band still 60cm, not stretched with it");
  // The counter in the middle is a capsule part, inside the box the ring already claims.
  const withCounter: Product = {
    ...ovalBar,
    appearance: { ...ovalBar.appearance!, parts: [{ id: "c", shape: "stadium", widthMm: 2800, depthMm: 600, x: 0, y: 0, rotation: 0 }] },
  };
  const wc = resolveFootprint(withCounter);
  const wcb = footprintBounds(wc);
  assert(wc.kind === "multi" && wc.parts.length === 2 && Math.abs(wcb.w - 7340) < 2 && Math.abs(wcb.h - 3600) < 2, `a counter inside the ring adds nothing to the box (${wcb.w}×${wcb.h})`);

  // ── The horseshoe: half the oval, against a wall ───────────────────────────────────────────
  // The פרסה bar is the right half of the oval bar: 3.67×3.60, its top leg to the wall and its
  // bottom leg stopping 80cm short of it for the staff.
  const parsa = buildShapeOutline("horseshoe", 3670, 3600, undefined, { bandMm: 600, gapMm: 800 })!;
  const parsaB = customShapeBounds(parsa.outline);
  assert(parsaB.w === 3670 && parsaB.h === 3600 && Math.abs(parsaB.cx) < 1e-9 && Math.abs(parsaB.cy) < 1e-9, "a horseshoe measures its two numbers and is centred on them");
  const parsaPoly = flat(parsa);
  assert(inside({ x: -1500, y: -1500 }, parsaPoly), "the top leg reaches the wall");
  assert(!inside({ x: -1500, y: 1500 }, parsaPoly) && inside({ x: -500, y: 1500 }, parsaPoly), "the bottom leg stops 80cm short of it — the entrance");
  assert(
    !inside({ x: 0, y: 0 }, parsaPoly) && !inside({ x: -1700, y: 0 }, parsaPoly) && inside({ x: 1500, y: 0 }, parsaPoly),
    "between the legs it is open to the wall, and the end is a band",
  );
  const parsaArea = 1870 * 600 + (1870 - 800) * 600 + (Math.PI / 2) * (1800 ** 2 - 1200 ** 2);
  assert(Math.abs(area(parsaPoly) - parsaArea) < 0.002 * parsaArea, `two legs and half a ring (${area(parsaPoly)} vs ${parsaArea})`);
  // Half an oval ring IS a horseshoe: a point in the oval's right half is bar or floor in both.
  const wholeOval = flat(buildShapeOutline("oval-ring", 7340, 3600, undefined, { bandMm: 600, gapMm: 0, gapAt: "left" })!);
  const halfOval = flat(buildShapeOutline("horseshoe", 3670, 3600, undefined, { bandMm: 600, gapMm: 0 })!);
  for (const p of [{ x: 500, y: -1500 }, { x: 1000, y: 0 }, { x: 2500, y: 0 }, { x: 3400, y: 0 }, { x: 2000, y: 1500 }, { x: 3300, y: 1400 }, { x: 2900, y: -1000 }]) {
    assert(inside(p, wholeOval) === inside({ x: p.x - 1835, y: p.y }, halfOval), `a horseshoe is the right half of the oval ring (${p.x}, ${p.y})`);
  }
  // Too narrow for a semicircle: a D with a straight side, still exactly its own two numbers.
  const narrowD = buildShapeOutline("horseshoe", 1000, 3000, undefined, { bandMm: 300, gapMm: 0 })!;
  const narrowB = customShapeBounds(narrowD.outline);
  const narrowPoly = flat(narrowD);
  assert(
    narrowB.w === 1000 && narrowB.h === 3000 && inside({ x: 350, y: 0 }, narrowPoly) && !inside({ x: 0, y: 0 }, narrowPoly),
    "a horseshoe narrower than its end's radius grows a straight side rather than a wider box",
  );
  assert(ringSpecOf(3670, 3600, { bandMm: 600, gapMm: 300 }, "horseshoe").gapMm === 300, "a horseshoe's bottom leg may stop any distance short of the wall");
  assert(ringSpecOf(3670, 3600, { bandMm: 600, gapMm: 99999 }, "horseshoe").gapMm === 1870, "…but not further than the leg is long");

  // ── The rounded ח: the other half of the oval, against a wall ──────────────────────────────
  // The oval bar's top half: 7.34×1.80, the straight run and a quarter arc down each side.
  const topHalf = buildShapeOutline("rounded-u", 7340, 1800, undefined, { bandMm: 600 })!;
  const topB = customShapeBounds(topHalf.outline);
  assert(topB.w === 7340 && topB.h === 1800 && Math.abs(topB.cx) < 1e-9 && Math.abs(topB.cy) < 1e-9, "a rounded ח measures its two numbers and is centred on them");
  const topPoly = flat(topHalf);
  assert(inside({ x: 0, y: -600 }, topPoly) && !inside({ x: 0, y: 300 }, topPoly), "the run along the top is bar and the middle is open to the wall");
  assert(inside({ x: 3370, y: 600 }, topPoly) && !inside({ x: 2500, y: 600 }, topPoly), "each side is a quarter of the band, down to the wall");
  const topArea = 3740 * 600 + (Math.PI / 2) * (1800 ** 2 - 1200 ** 2);
  assert(Math.abs(area(topPoly) - topArea) < 0.002 * topArea, `a run and two quarter rings (${area(topPoly)} vs ${topArea})`);
  // Half an oval ring the other way IS a rounded ח: a point in the oval's top half is bar or floor in both.
  for (const p of [{ x: 0, y: -1500 }, { x: 1000, y: -500 }, { x: 3400, y: -300 }, { x: -3000, y: -800 }, { x: -2500, y: -200 }, { x: 3600, y: -100 }]) {
    assert(inside(p, wholeOval) === inside({ x: p.x, y: p.y + 900 }, topPoly), `a rounded ח is the top half of the oval ring (${p.x}, ${p.y})`);
  }
  // Too narrow for the shoulders to reach the open edge: straight sides, still its own two numbers.
  const tallU = buildShapeOutline("rounded-u", 1000, 3000, undefined, { bandMm: 200 })!;
  const tallUB = customShapeBounds(tallU.outline);
  const tallUPoly = flat(tallU);
  assert(tallUB.w === 1000 && tallUB.h === 3000 && inside({ x: 400, y: 0 }, tallUPoly) && !inside({ x: 0, y: 0 }, tallUPoly), "a tall rounded ח grows straight sides rather than a wider box");
  assert(ringSpecOf(7340, 1800, { bandMm: 600, gapMm: 800 }, "rounded-u").gapMm === 0, "a rounded ח has no opening — its sides are the arcs");

  // ── Hollow: any solid shape as a band ──────────────────────────────────────────────────────
  // The band is cut INSIDE the outline, so the box is still the shape's two numbers and the area is
  // the outline's less what is left inside. Shoelace on the flattened outline — a keyhole's reversed
  // inner loop subtracts itself, and its two caps cancel.
  {
    const fine = (o: BuiltOutline): Point[] =>
      o.outline.flatMap((a, i) => flattenEdge(a, o.outline[(i + 1) % o.outline.length], o.edgeCurves?.[i], 64).slice(0, -1));
    const areaOf = (f: Footprint) => footprintOutlines(f).reduce((s, o) => s + area(fine(o)), 0);
    const near = (a: number, b: number, share: number) => Math.abs(a - b) <= share * Math.abs(b);
    const hollow = (shape: MapShape, dims: ShapeDims, h: HollowSpec) => shapeFootprint(shape, { ...dims, hollow: h });

    // A rectangle as a ring, closed: one keyhole, its box the rectangle's, the band all the way round.
    const ring = hollow("rect", { widthMm: 1200, depthMm: 600 }, { bandMm: 100 });
    assert(ring.kind === "custom", "a closed hollow rectangle is one outline, a keyhole");
    assert(eq(footprintBounds(ring), { w: 1200, h: 600 }), "…measuring exactly its two numbers");
    const ringPoly = flat(footprintOutlines(ring)[0]);
    assert(!inside({ x: 0, y: 0 }, ringPoly) && inside({ x: 0, y: -250 }, ringPoly) && inside({ x: 550, y: 0 }, ringPoly), "its middle is floor and its sides are band");
    assert(Math.abs(areaOf(ring) - (1200 * 600 - 1000 * 400)) < 1e-6, `…and its area is the rectangle less the middle (${areaOf(ring)})`);
    // An entrance cut through a closed ring takes exactly its width × the band out of it.
    const door = hollow("rect", { widthMm: 1200, depthMm: 600 }, { bandMm: 100, gapMm: 300 });
    assert(Math.abs(areaOf(door) - (areaOf(ring) - 300 * 100)) < 1e-6, `an entrance takes gap × band out of the ring (${areaOf(door)})`);
    assert(!inside({ x: 0, y: 250 }, flat(footprintOutlines(door)[0])) && inside({ x: 300, y: 250 }, flat(footprintOutlines(door)[0])), "…in the middle of the bottom side unless told otherwise");
    // A band as deep as the shape leaves nothing inside: the solid shape, not an inside-out one.
    const solid = hollow("rect", { widthMm: 1200, depthMm: 600 }, { bandMm: 400 });
    assert(Math.abs(areaOf(solid) - 1200 * 600) < 1e-6 && footprintOutlines(solid)[0].outline.length === 4, "a band deeper than the shape is the solid shape");
    assert(eq(hollow("crescent", { widthMm: 1200, depthMm: 600 }, { bandMm: 100 }), shapeFootprint("crescent", { widthMm: 1200, depthMm: 600 })), "a shape that is a band already ignores a hollow spec");
    // Rule 1 holds hollow, for every shape that may be: the band only ever takes floor out of the middle.
    for (const shape of MAP_SHAPES.filter(canHollow)) {
      const dims: ShapeDims = { widthMm: 1200, depthMm: 600, diameterMm: 1200, outline: [{ x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 900, y: 600 }, { x: 0, y: 600 }] };
      const whole = shapeFootprint(shape, dims);
      const cut = hollow(shape, dims, { bandMm: 100 });
      const wb = footprintBounds(whole);
      const cb = footprintBounds(cut);
      assert(Math.abs(wb.w - cb.w) < 1e-6 && Math.abs(wb.h - cb.h) < 1e-6, `${shape}: hollow, it still measures what it does solid (${cb.w}×${cb.h})`);
      assert(areaOf(cut) < areaOf(whole) - 1, `${shape}: …and is a band, not the whole of it`);
    }

    // The legacy shapes are hollow solids now. A rectangle open along its bottom IS the ח…
    const openBottom = hollow("rect", { widthMm: 1200, depthMm: 600 }, { bandMm: 200, openSides: [2] });
    assert(Math.abs(areaOf(openBottom) - area(buildShapeOutline("u-shape", 1200, 600, undefined, { bandMm: 200 })!.outline)) < 1e-6, `a rectangle open along its bottom is the ח (${areaOf(openBottom)})`);
    assert(eq(footprintBounds(openBottom), { w: 1200, h: 600 }), "…and measures what the ח measured");
    // …a capsule hollowed all the way round is the closed oval ring…
    const capsuleRing = hollow("stadium", { widthMm: 7340, depthMm: 3600 }, { bandMm: 600 });
    assert(near(areaOf(capsuleRing), bandArea, 0.002), `a hollow capsule is the closed oval ring (${areaOf(capsuleRing)} vs ${bandArea})`);
    // …a half circle open along its chord is the half ring…
    const halfRing = hollow("half-circle", { diameterMm: 4000 }, { bandMm: 750, openSides: [0] });
    assert(near(areaOf(halfRing), area(flat(buildArcOutline(4000, { sweepDeg: 180, bandMm: 750 }))), 0.01), `a half circle open along its chord is the half ring (${areaOf(halfRing)})`);
    assert(eq(footprintBounds(halfRing), { w: 4000, h: 2000 }), "…as wide as its circle and half as tall");
    // …and a quarter circle open along both radii is a quarter of a ring.
    const quarterRing = hollow("quarter-circle", { diameterMm: 4000 }, { bandMm: 500, openSides: [0, 2] });
    assert(near(areaOf(quarterRing), (Math.PI / 4) * (2000 ** 2 - 1500 ** 2), 0.01), `a quarter circle open along both radii is a quarter ring (${areaOf(quarterRing)})`);
    // A circle hollowed is a ring, its inner edge concentric — still four quarter arcs, not a polyline.
    const circleRing = hollow("circle", { diameterMm: 2000 }, { bandMm: 300 });
    assert(near(areaOf(circleRing), Math.PI * (1000 ** 2 - 700 ** 2), 0.01), `a hollow circle is a ring (${areaOf(circleRing)})`);
    const circleInner = footprintOutlines(circleRing)[0].outline.filter((p) => Math.abs(Math.hypot(p.x, p.y) - 700) < 0.5);
    assert(circleInner.length >= 4 && (footprintOutlines(circleRing)[0].edgeCurves?.filter(Boolean).length ?? 0) >= 8, "…its inner edge four arcs on the 70cm radius, curves and all");

    // A triangle's band is the same width all round, so what is left inside is the triangle shrunk
    // about its incentre: its area is the outer's × ((r − b)/r)², r the inradius.
    const tri = hollow("triangle", { widthMm: 1200, depthMm: 900 }, { bandMm: 100 });
    const triOuter = area(buildShapeOutline("triangle", 1200, 900)!.outline);
    const inradius = (2 * triOuter) / (1200 + 2 * Math.hypot(600, 900));
    const triInner = triOuter - areaOf(tri);
    assert(near(triInner / triOuter, ((inradius - 100) / inradius) ** 2, 0.01), `a hollow triangle's middle is the triangle shrunk about its incentre (${triInner / triOuter})`);

    // A hand-drawn L: the band follows the reflex corner inside it as well as the four outside.
    const L: Point[] = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 800 }, { x: 800, y: 800 }, { x: 800, y: 2000 }, { x: 0, y: 2000 }];
    const hollowL = hollow("custom", { outline: L }, { bandMm: 200 });
    assert(Math.abs(areaOf(hollowL) - (2000 * 800 + 800 * 1200 - (1600 * 400 + 400 * 1200))) < 1e-6, `a hollow L is a 20cm band round an L of floor (${areaOf(hollowL)})`);
    assert(eq(footprintBounds(hollowL), { w: 2000, h: 2000 }), "…and keeps the box it was drawn in");

    // Opening two opposite sides parts the band in two: a multi of two bars, each w × band.
    const bars = hollow("rect", { widthMm: 1200, depthMm: 600 }, { bandMm: 100, openSides: [1, 3] });
    assert(bars.kind === "multi" && bars.parts.length === 2, "a rectangle open at both ends is two bars");
    for (const p of footprintOutlines(bars)) {
      const b = customShapeBounds(p.outline);
      assert(Math.abs(b.w - 1200) < 1e-6 && Math.abs(b.h - 100) < 1e-6 && p.of === 0, `…each the width by the band, and both the one shape (${b.w}×${b.h})`);
    }
    assert(eq(footprintBounds(bars), { w: 1200, h: 600 }), "…still standing in the rectangle's box");
    assert(eq(hollowSideNames(hollowOuter("rect", { widthMm: 1200, depthMm: 600 })), ["למעלה", "ימין", "למטה", "שמאל"]), "a rectangle's sides are named by where they face");
    assert(eq(hollowSideNames(hollowOuter("circle", { diameterMm: 1000 })), ["שמאל-למטה", "ימין-למטה", "ימין-למעלה", "שמאל-למעלה"]), "…a circle's four quarters by their diagonals");

    // From a catalog row, through every reader: the resolver, a stretch on the plan, a composite.
    const hollowBar: Product = { ...base, category: "bars", dimensions: { widthMm: 2400, depthMm: 1200, heightMm: 1100 }, appearance: { shape: "rect", content: "none", hollow: { bandMm: 600, openSides: [2] } } };
    assert(Math.abs(areaOf(resolveFootprint(hollowBar)) - (2400 * 1200 - 1200 * 600)) < 1e-6, "the resolver draws a row's hollow spec");
    const stretchedBar = sizedFootprint({ ...hollowBar, resize: { stepMm: 100, width: { minMm: 1200, maxMm: 6000 } } }, { widthMm: 4800, depthMm: 1200 });
    assert(Math.abs(areaOf(stretchedBar) - (4800 * 1200 - 3600 * 600)) < 1e-6, "a hollow row stretched on the plan keeps its band 60cm, not stretched with it");
    const drawnRing: Product = { ...base, appearance: { shape: "custom", content: "none", outline: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1000 }, { x: 0, y: 1000 }], hollow: { bandMm: 200 } } };
    const drawnStretched = sizedFootprint({ ...drawnRing, resize: { stepMm: 100, width: { minMm: 1000, maxMm: 6000 } } }, { widthMm: 4000, depthMm: 1000 });
    assert(Math.abs(areaOf(drawnStretched) - (4000 * 1000 - 3600 * 600)) < 1e-3, `a hand-drawn ring stretched keeps its band too (${areaOf(drawnStretched)})`);
    const barWithBack = resolveFootprint({ ...hollowBar, appearance: { ...hollowBar.appearance!, hollow: { bandMm: 300, openSides: [1, 3] }, parts: [{ id: "b", shape: "rect", widthMm: 2400, depthMm: 300, x: 0, y: 0, rotation: 0 }] } });
    assert(barWithBack.kind === "multi" && eq(barWithBack.parts.map((p, i) => pieceOf(p, i)), [0, 0, 1]), "in a composite, a hollow base's pieces and the part's each say which shape they are");
    assert(eq(footprintBounds(barWithBack), { w: 2400, h: 1200 }), "…and the part stands where it was put, in the base's box");
  }

  // ── Several shapes, one item ───────────────────────────────────────────────────────────────
  // A 2m counter with a 1m round butted against its right end: 2m + half the round's 1m past the
  // counter's end, so 3m by 1m, centred on the lot rather than on the counter.
  const combo: Product = {
    ...base,
    dimensions: { widthMm: 2000, depthMm: 600, heightMm: 750 },
    appearance: { shape: "rect", content: "none", parts: [{ id: "p", shape: "circle", diameterMm: 1000, x: 1000, y: 0, rotation: 0 }] },
  };
  const cf = resolveFootprint(combo);
  assert(cf.kind === "multi" && cf.parts.length === 2, "an item with a part is drawn as both shapes");
  const cb = footprintBounds(cf);
  assert(Math.abs(cb.w - 2500) < 1 && Math.abs(cb.h - 1000) < 1, `…and measures the two of them together (${cb.w}×${cb.h})`);
  // A part turned a quarter swaps its width and depth on the plan.
  const turned = resolveFootprint({
    ...combo,
    appearance: { shape: "rect", content: "none", parts: [{ id: "p", shape: "rect", widthMm: 1000, depthMm: 200, x: 0, y: 0, rotation: 90 }] },
  });
  assert(Math.abs(footprintBounds(turned).h - 1000) < 1e-6, "a part turned 90° stands across the base, not along it");
  assert(eq(resolveFootprint({ ...combo, appearance: { shape: "rect", content: "none", parts: [] } }), { kind: "rect", widthMm: 2000, depthMm: 600 }), "no parts, no composite");
  // A hand-drawn part: its outline wherever it was drawn, recentred on its box, which sits at x/y.
  const drawn = resolveFootprint({
    ...combo,
    appearance: {
      shape: "rect",
      content: "none",
      parts: [{ id: "d", shape: "custom", outline: [{ x: 5000, y: 5000 }, { x: 5400, y: 5000 }, { x: 5000, y: 5300 }], x: 1200, y: 0, rotation: 0 }],
    },
  });
  const db = footprintBounds(drawn);
  assert(drawn.kind === "multi" && drawn.parts.length === 2 && Math.abs(db.w - 2400) < 1 && Math.abs(db.h - 600) < 1, `a hand-drawn part joins the item where it was put (${db.w}×${db.h})`);

  // ── A hand-drawn side bowed out ───────────────────────────────────────────────────────────────
  // A 1200×600 rectangle whose top side bows up to y = −500: the apex is inside the curve, not at a
  // corner, so the corners alone say 600 deep and centred on y = 0 — and the drawer's fields, the
  // saved dimensions and the centring on the plan all used to believe them. The box is what is drawn.
  {
    const rect: Point[] = [{ x: -600, y: -300 }, { x: 600, y: -300 }, { x: 600, y: 300 }, { x: -600, y: 300 }];
    // A symmetric cubic from (−600,−300) to (600,−300) with both arms straight up by `a` reaches
    // y = −300 − 0.75a at its middle; a = 800/3 puts the apex at −500.
    const a = 800 / 3;
    const bowed: (EdgeCurve | null)[] = [{ c1: { x: 0, y: -a }, c2: { x: 0, y: -a } }, null, null, null];
    const corners = customShapeBounds(rect);
    const bb = customShapeBounds(rect, bowed);
    assert(corners.h === 600 && Math.abs(bb.h - 800) < 0.5 && Math.abs(bb.cy + 100) < 0.5, `a bowed side is measured at its apex (${bb.h} deep, centred on ${bb.cy})`);
    assert(bb.w === 1200 && Math.abs(bb.cx) < 1e-9, "…and the straight sides still measure what they are");
    const bowedF: Footprint = { kind: "custom", outline: rect, edgeCurves: bowed };
    const fb = footprintBounds(bowedF);
    assert(Math.abs(fb.w - 1200) < 0.5 && Math.abs(fb.h - 800) < 0.5, `a bowed custom footprint's box is width × depth of what is drawn (${fb.w}×${fb.h})`);
    const cb = sampledBounds([footprintOutlines(bowedF)[0]]);
    assert(Math.abs(cb.cx) < 1e-9 && Math.abs(cb.cy) < 1e-9, "…and it is centred on the box of what is drawn, bow included");
    const bowedItem: Product = { ...base, appearance: { shape: "custom", content: "none", outline: rect, edgeCurves: bowed } };
    assert(Math.abs(footprintBounds(resolveFootprint(bowedItem)).h - 800) < 0.5, "the resolver measures the bow too");
    const stretched = footprintBounds(
      sizedFootprint({ ...bowedItem, resize: { stepMm: 100, width: { minMm: 600, maxMm: 2400 }, depth: { minMm: 400, maxMm: 1600 } } }, { widthMm: 2400, depthMm: 1600 }),
    );
    assert(Math.abs(stretched.w - 2400) < 1 && Math.abs(stretched.h - 1600) < 1, `a bowed outline stretched on the plan lands on the box asked for (${stretched.w}×${stretched.h})`);
    // The built shapes keep their promise: sampling their arcs finds nothing past a vertex.
    const halfRound = buildShapeOutline("half-circle", 1200, 600)!;
    const hb = customShapeBounds(halfRound.outline, halfRound.edgeCurves);
    assert(hb.w === 1200 && hb.h === 600, "a built shape measures the same with its curves sampled");
  }

  // ── sized on the plan ─────────────────────────────────────────────────────────────────────────
  {
    const deck: Product = {
      ...base,
      category: "stages",
      dimensions: { widthMm: 2000, depthMm: 1000, heightMm: 600 },
      appearance: { shape: "rect", content: "none" },
      resize: { stepMm: 1000, width: { minMm: 1000, maxMm: 8000 }, depth: { minMm: 1000, maxMm: 4000 } },
    };
    assert(eq(catalogBox(deck), { widthMm: 2000, depthMm: 1000 }), "the catalog box is the drawn size");
    assert(eq(clampSize(deck, { widthMm: 4400, depthMm: 2600 }), { widthMm: 4000, depthMm: 3000 }), "a size snaps to the module");
    assert(eq(clampSize(deck, { widthMm: 12000, depthMm: 100 }), { widthMm: 8000, depthMm: 1000 }), "…and stays inside the range");
    assert(eq(sizedFootprint(deck, { widthMm: 6000, depthMm: 4000 }), { kind: "rect", widthMm: 6000, depthMm: 4000 }), "a stretched rect draws at its new size");
    assert(eq(sizedFootprint({ ...deck, resize: undefined }, { widthMm: 6000, depthMm: 4000 }), { kind: "rect", widthMm: 2000, depthMm: 1000 }), "a product that does not stretch ignores a stored size");

    const bar: Product = { ...deck, category: "bars", resize: { stepMm: 500, width: { minMm: 1500, maxMm: 5000 } } };
    assert(eq(clampSize(bar, { widthMm: 3200, depthMm: 9000 }), { widthMm: 3000, depthMm: 1000 }), "a fixed side stays the catalog's");

    const u: Product = { ...deck, dimensions: { widthMm: 3600, depthMm: 1800, heightMm: 1100 }, appearance: { shape: "u-shape", content: "none" } };
    const uWide = footprintBounds(sizedFootprint(u, { widthMm: 4800, depthMm: 1800 }));
    assert(Math.round(uWide.w) === 4800 && Math.round(uWide.h) === 1800, "a derived shape is re-derived at the new box");

    const round: Product = {
      ...base,
      category: "tables",
      dimensions: { diameterMm: 1800, heightMm: 750 },
      appearance: { shape: "circle", content: "none" },
      resize: { stepMm: 100, width: { minMm: 1200, maxMm: 2400 }, depth: { minMm: 1, maxMm: 9999 } },
    };
    assert(eq(resizeAxes(round), { width: true, depth: false, uniform: true }), "a round shape has one measurement");
    assert(eq(clampSize(round, { widthMm: 2440, depthMm: 500 }), { widthMm: 2400, depthMm: 2400 }), "…and its depth follows it");
    assert(eq(sizedFootprint(round, { widthMm: 2400, depthMm: 2400 }), { kind: "circle", diameterMm: 2400 }), "…so it stays a circle");

    const half: Product = { ...round, dimensions: { diameterMm: 1200, heightMm: 750 }, appearance: { shape: "half-circle", content: "none" } };
    assert(eq(clampSize(half, { widthMm: 1800, depthMm: 0 }), { widthMm: 1800, depthMm: 900 }), "a half circle keeps its 2:1 box");

    const sofa: Product = {
      ...base,
      category: "sofas",
      appearance: { shape: "custom", content: "none", outline: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 900 }, { x: 0, y: 900 }] },
      resize: { stepMm: 100, width: { minMm: 1000, maxMm: 4000 } },
    };
    const sofaWide = footprintBounds(sizedFootprint(sofa, { widthMm: 3000, depthMm: 900 }));
    assert(Math.round(sofaWide.w) === 3000 && Math.round(sofaWide.h) === 900, "a hand-drawn outline is scaled to the new box");
    assert(eq(scaleFootprint({ kind: "circle", diameterMm: 100 }, 2, 1), { kind: "ellipse", widthMm: 200, depthMm: 100 }), "a circle pulled one way is an ellipse");
  }

  // A category may stretch its rows by default (CategoryDef.defaultResize): a banquette that says
  // nothing of its own is laid to length — along its length only — and one that does is its own.
  {
    const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const bench: Product = {
      id: "bench",
      name: "בנקט",
      category: "stage-benches",
      layer: "floor",
      dimensions: { widthMm: 1000, depthMm: 450, heightMm: 750 },
      categoryFields: {},
      styleTags: [],
      variants: [],
      appearance: { shape: "rect", content: "none" },
    };
    assert(eq(resizeAxes(bench), { width: true, depth: false, uniform: false }), "a banquette row with no resize of its own stretches along its length by default");
    assert(eq(clampSize(bench, { widthMm: 6040, depthMm: 900 }), { widthMm: 6000, depthMm: 450 }), "…in 10cm steps, its depth the catalog's");
    assert(eq(clampSize(bench, { widthMm: 100, depthMm: 450 }), { widthMm: 600, depthMm: 450 }), "…never shorter than one seat");
    assert(eq(sizedFootprint(bench, { widthMm: 6000, depthMm: 450 }), { kind: "rect", widthMm: 6000, depthMm: 450 }), "…and draws at the stretched length");
    const ownBench: Product = { ...bench, resize: { stepMm: 500, width: { minMm: 1000, maxMm: 3000 } } };
    assert(eq(clampSize(ownBench, { widthMm: 6000, depthMm: 450 }), { widthMm: 3000, depthMm: 450 }), "a row's own resize wins over its category's default");
    assert(resizeAxes({ ...bench, category: "arches" }) === null, "a category with no default leaves a plain row a thing of one size");
  }

  console.log("footprint self-check passed");
}
