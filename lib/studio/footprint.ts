// Pure appearance resolver (no window/localStorage) — shared by the Konva map renderer
// and the drawer preview. Absence of `appearance` is derived from `dimensions` so every
// legacy/seed product keeps rendering (name-in-a-shape = today's behavior).
import type { ArcSpec, MapShape, Product, RingSpec, ShapePart } from "@/lib/catalog/types";
import { ARC_SWEEP, RESIZE_DEFAULT_STEP_MM, RING_GAP, usesDiameter } from "@/lib/catalog/types";
import type { Point } from "@/lib/design-document/types";
import type { EdgeCurve } from "@/lib/studio/hall";
import { absoluteControlPoints, outlineBounds } from "@/lib/studio/geometry";
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
//   2. EVERY EXTREME IS A VERTEX. Bounds are read off the points (customShapeBounds → outlineBounds)
//      and no bezier is consulted, so an apex that lives only inside a curve is an apex nothing
//      downstream can see — the preview would scale wrong and the seating would walk a table shorter
//      than it looks. That is why the arcs below are cut into quarters at their apex rather than
//      drawn as one long bow.
//
// K is the standard cubic approximation of a quarter arc (0.5523 × radius) — the constant every
// circle-to-path conversion uses. Control points are offsets from their own edge's endpoints
// (absoluteControlPoints, ./geometry), which is what lets the same numbers survive recentring.
const K = 0.5523;

export interface BuiltOutline {
  outline: Point[];
  edgeCurves?: (EdgeCurve | null)[];
}

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
  } else {
    outline.push({ x: 0, y: 0 }); // no hole left: a slice, its point at the centre
    edgeCurves.push(null);
  }
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
    // The counter is a third of the SHORTER side. A share of the depth alone would read right on a
    // wide bar and then swallow its own opening on a ח deeper than it is wide, which is the one way
    // a derived shape can stop being the shape it is named after.
    case "u-shape": {
      const t = Math.min(w, d) / 3;
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

/** A shape plus the measurements it is drawn from, resolved to the one footprint every surface in
 *  the app already knows how to draw.
 *
 *  Split out of resolveFootprint because a catalog product is no longer the only thing with a
 *  footprint: a venue's fixed features are placed FROM the catalog now (lib/venues/structure.ts), so
 *  a bar shaped like a ח has to be a ח on the hall plan too rather than the box its two numbers
 *  describe. One resolver, so the two cannot disagree about what a shape means. */
export function shapeFootprint(
  shape: MapShape,
  d: {
    widthMm?: number;
    depthMm?: number;
    diameterMm?: number;
    outline?: Point[];
    edgeCurves?: (EdgeCurve | null)[];
    arc?: Partial<ArcSpec>;
    ring?: Partial<RingSpec>;
  },
): Footprint {
  if (shape === "custom") {
    const { outline, edgeCurves } = d;
    if (outline && outline.length >= 3) return { kind: "custom", outline, ...(edgeCurves ? { edgeCurves } : {}) };
    // malformed custom → fall through to a safe rectangle
  }
  if (shape === "circle") return { kind: "circle", diameterMm: d.diameterMm || d.widthMm || d.depthMm || MIN_FOOTPRINT_MM };
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
  const base = shapeFootprint(shape, { ...d, outline: a?.outline, edgeCurves: a?.edgeCurves, arc: a?.arc, ring: a?.ring });
  return a?.parts?.length ? composeFootprint(base, a.parts) : base;
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
      const b = customShapeBounds(f.outline);
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
 *  there, not at a vertex — so the curves are sampled rather than trusted to rule 2. */
function sampledBounds(pieces: readonly BuiltOutline[]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { outline, edgeCurves } of pieces) {
    outline.forEach((a, i) => {
      for (const p of flattenEdge(a, outline[(i + 1) % outline.length], edgeCurves?.[i])) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
    });
  }
  if (!Number.isFinite(minX)) return { w: 0, h: 0, cx: 0, cy: 0 };
  return { w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/** A base footprint and the parts added beside it, as one footprint. Each part is resolved by the
 *  same rule a base shape is (shapeFootprint), turned about its own centre, moved to its offset from
 *  the base's centre — and then the whole lot is re-centred on its own box, because every footprint
 *  is drawn centred on the point its item stands on. */
export function composeFootprint(base: Footprint, parts: readonly ShapePart[]): Footprint {
  const pieces: BuiltOutline[] = [...footprintOutlines(base)];
  for (const part of parts) {
    const t = ((part.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const turn = (v: Point): Point => ({ x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos });
    for (const o of footprintOutlines(shapeFootprint(part.shape, part))) {
      pieces.push({
        outline: o.outline.map((v) => {
          const q = turn(v);
          return { x: q.x + (part.x || 0), y: q.y + (part.y || 0) };
        }),
        ...(o.edgeCurves ? { edgeCurves: o.edgeCurves.map((c) => (c ? { c1: turn(c.c1), c2: turn(c.c2) } : null)) } : {}),
      });
    }
  }
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

// Bounds of a catalog item's custom shape, in the item's own local space. The min/max itself is
// geometry.outlineBounds — this only adds the centre point the shape editor and previews recentre
// on, and keeps the short w/h names those call sites read. Named for the catalog shape rather than
// "outline" so it can't be confused with the canonical one in ./geometry.
export function customShapeBounds(outline: Point[]) {
  const { minX, maxX, minY, maxY, widthMm, heightMm } = outlineBounds(outline);
  return { minX, maxX, minY, maxY, w: widthMm, h: heightMm, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function footprintBounds(f: Footprint): { w: number; h: number } {
  switch (f.kind) {
    case "circle": return { w: f.diameterMm, h: f.diameterMm };
    case "rect":
    case "ellipse": return { w: f.widthMm, h: f.depthMm };
    case "custom": { const b = customShapeBounds(f.outline); return { w: b.w, h: b.h }; }
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

/** Which of the box's two sides the plan may change, or null for a thing of one size. A round
 *  shape has ONE measurement: width is its diameter and depth follows it, so a round table can grow
 *  but never become an egg. */
export function resizeAxes(product: Product): { width: boolean; depth: boolean; uniform: boolean } | null {
  const r = product.resize;
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
  if (!axes || !product.resize) return base;
  const step = Math.max(1, product.resize.stepMm || RESIZE_DEFAULT_STEP_MM);
  const fit = (v: number, range: { minMm: number; maxMm: number } | undefined, fallback: number) => {
    if (!range) return fallback;
    const lo = Math.min(range.minMm, range.maxMm);
    const hi = Math.max(range.minMm, range.maxMm);
    const snapped = Math.round(v / step) * step;
    return Math.round(Math.min(hi, Math.max(lo, snapped || step)));
  };
  const widthMm = axes.width ? fit(size.widthMm, product.resize.width, base.widthMm) : base.widthMm;
  if (axes.uniform) {
    const ratio = base.widthMm ? base.depthMm / base.widthMm : 1;
    return { widthMm, depthMm: Math.round(widthMm * ratio) };
  }
  const depthMm = axes.depth ? fit(size.depthMm, product.resize.depth, base.depthMm) : base.depthMm;
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
      return { kind: "multi", parts: f.parts.map((p) => ({ outline: p.outline.map(pt), ...(p.edgeCurves ? { edgeCurves: curves(p.edgeCurves) } : {}) })) };
  }
}

/** The footprint a placed item is drawn with: the catalog's, or — for one stretched on the plan —
 *  the same shape at the size it was stretched to (see the note above). */
export function sizedFootprint(product: Product, sizeMm?: { widthMm: number; depthMm: number }): Footprint {
  if (!sizeMm || !product.resize) return resolveFootprint(product);
  const a = product.appearance;
  const shape = shapeOfProduct(product);
  if (!a?.parts?.length && shape !== "custom") {
    if (usesDiameter(shape)) {
      // The box's width IS the circle's diameter for everything cut from one except the quarter,
      // whose box is one radius across (see ROUND_FIELD).
      const diameterMm = shape === "quarter-circle" ? sizeMm.widthMm * 2 : sizeMm.widthMm;
      return shapeFootprint(shape, { diameterMm, arc: a?.arc });
    }
    return shapeFootprint(shape, { widthMm: sizeMm.widthMm, depthMm: sizeMm.depthMm, arc: a?.arc, ring: a?.ring });
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

  console.log("footprint self-check passed");
}
