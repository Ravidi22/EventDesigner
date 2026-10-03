import type { Point } from "./hall";
import { isMain } from "../self-check";

// Snapping for the shape canvas, pulled out of the component so both modes share one rule set:
// dragging a vertex/fixture (alignment only) and drawing a new wall (alignment + an angle lock off
// the previous vertex). Pure — the draw preview re-derives it every render, so releasing the angle
// lock shows up instantly without any state to keep in sync.
//
// A POINT AND A BOX ARE SNAPPED DIFFERENTLY, and everything below turns on which one the caller
// handed over. A point has one coordinate per axis and can only ever be put ON a line. A BOX — a
// stage, a table, a whole selection being dragged as one — has three per axis, its two edges and
// its centre, and the two rules that matter most for furniture are both about the edges: going
// FLUSH (a deck against a wall, or against the deck beside it, with no gap) and keeping EQUAL AIR
// (the same gap again). Pass `self` and you get all of it; leave it off, as the hall editor's
// vertex drag does, and this is the centre-only pull it has always been.

const ANGLE_STEP_DEG = 5; // walls are almost never at 37.4° — quantise the direction, not the point

export interface SnapContext {
  toleranceMm: number; // the snap radius in world units — callers pass ~6px worth of mm
  outline: Point[];
  fixtures: Point[]; // stage + bar centres; the caller pre-filters the one being dragged
  gridMm: number;
  excludeVertexIdx?: number; // the vertex being dragged must not snap to itself
  anchor?: Point; // previous vertex while drawing — enables the angle constraint
  constrainAngle?: boolean;
  /** The extent of the thing being moved, if the caller knows it — its centre is the point being
   *  snapped. This is what turns on the two rules a POINT cannot express:
   *
   *    • EDGE snapping — the item's own edges may meet a reference, not only its centre. That is
   *      how a stage goes back-against-the-wall, how two staging decks butt into one platform, and
   *      how a run of them comes out with their front edges in one line.
   *    • EQUAL-GAP snapping — the air between this item and its neighbour is the same air there is
   *      between the two beside it. A gap is between edges, and a point has none.
   *
   *  A caller that only knows centres (a wall corner being dragged) leaves it off and gets exactly
   *  the alignment-only snap it always had. */
  self?: { widthMm: number; depthMm: number };
  /** Everything the moving item could line up with, be spaced against, or butt up to — the caller
   *  drops the item itself from this list. Each box contributes THREE reference values per axis:
   *  its two edges and its centre. */
  boxes?: SnapBox[];
}

/** A thing on the plan with a size: its centre and its extent, in world millimetres. */
export interface SnapBox {
  x: number;
  y: number;
  widthMm: number;
  depthMm: number;
}

/** One run of equal air, for drawing. `segments` are the matched gaps: `from`/`to` along `axis`,
 *  `at` on the other one — so a horizontal run draws lines from x=from to x=to at y=at. Every
 *  segment in one guide is the same length, which is the whole thing being said. */
export interface GapGuide {
  axis: "x" | "y";
  gapMm: number;
  segments: { from: number; to: number; at: number }[];
}

export interface SnapResult {
  point: Point;
  guides: { x: number | null; y: number | null }; // the matched reference axes, for the accent lines
  /** The equal gaps this point landed on — at most one guide per axis. */
  gaps?: GapGuide[];
  angleLocked?: boolean;
}

const norm360 = (deg: number) => ((deg % 360) + 360) % 360;
const signedDelta = (a: number, b: number) => {
  const d = norm360(a - b);
  return d > 180 ? d - 360 : d;
};

// Nearest multiple of 15°, except that the four orthogonals win an exact tie (7.5° sits between
// 0 and 15 — a wall meant to be square should fall square, not shear off by a notch).
export function constrainAngleDeg(deg: number): number {
  const stepped = Math.round(deg / ANGLE_STEP_DEG) * ANGLE_STEP_DEG;
  const ortho = Math.round(deg / 90) * 90;
  const useOrtho = Math.abs(signedDelta(deg, ortho)) <= Math.abs(signedDelta(deg, stepped)) + 1e-9;
  return norm360(useOrtho ? ortho : stepped);
}

// The rounding quantum, derived from the zoom rather than fixed: divide the visible grid down by
// 1/2/5/10… until a step is no coarser than the snap radius. Zoomed out of a hall that's 100mm;
// zoomed right in it becomes 2mm, so fine placement stays possible instead of sticking to a
// grid the user can no longer see past.
export function gridStepMm(gridMm: number, toleranceMm: number): number {
  const divisors = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  let step = gridMm;
  for (const d of divisors) {
    step = gridMm / d;
    if (step <= toleranceMm) break;
  }
  return Math.max(1, Math.round(step));
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step;
const roundPt = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });

// Every x/y worth aligning to: the outline's bbox edges + centre, each vertex, each fixture centre,
// and — for anything the caller handed over as a BOX — its two edges as well as its centre. The
// vertex being dragged is dropped from the bbox too, not just from the vertex list — otherwise it
// defines the very edge it then snaps back onto.
//
// A box's EDGES are references in their own right, and that is most of what makes furniture behave.
// A stage is not usually lined up by its middle: it goes against a wall, or against the stage beside
// it, or its front edge is squared with the front edge of the bar. Those are all statements about an
// edge, and a reference list of centres can express none of them.
function referenceAxes(ctx: SnapContext): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  const others = ctx.outline.filter((_, i) => i !== ctx.excludeVertexIdx);
  if (others.length >= 2) {
    const oxs = others.map((v) => v.x);
    const oys = others.map((v) => v.y);
    const minX = Math.min(...oxs), maxX = Math.max(...oxs), minY = Math.min(...oys), maxY = Math.max(...oys);
    xs.push(minX, (minX + maxX) / 2, maxX);
    ys.push(minY, (minY + maxY) / 2, maxY);
  }
  for (const v of others) {
    xs.push(v.x);
    ys.push(v.y);
  }
  for (const f of ctx.fixtures) {
    xs.push(f.x);
    ys.push(f.y);
  }
  for (const b of ctx.boxes ?? []) {
    xs.push(b.x - b.widthMm / 2, b.x, b.x + b.widthMm / 2);
    ys.push(b.y - b.depthMm / 2, b.y, b.y + b.depthMm / 2);
  }
  return { xs, ys };
}

type Axis = "x" | "y";
const crossOf = (a: Axis): Axis => (a === "x" ? "y" : "x");
const sizeOn = (s: { widthMm: number; depthMm: number }, a: Axis) => (a === "x" ? s.widthMm : s.depthMm);

/** Equal spacing along ONE axis — the second guide every drawing tool draws, the one that says
 *  "the same gap again".
 *
 *  Only boxes in the same ROW (for x) or COLUMN (for y) take part, which is the difference between
 *  spacing and coincidence: two tables at opposite ends of the hall are not evenly spaced, they are
 *  simply in different places. Membership is an overlap test on the other axis — the same rule the
 *  eye uses.
 *
 *  Three positions are worth offering, and they are the three a designer actually reaches for:
 *
 *    • CENTRED between the two nearest neighbours — dropping one into a hole leaves equal air
 *      either side of it.
 *    • CONTINUING the rhythm the two nearest neighbours on the left already have.
 *    • …or the two on the right.
 *
 *  Whichever lands closest to where the pointer already is wins, and only if it is inside the same
 *  tolerance an alignment pull gets. Nothing is invented: every gap offered is a gap already on the
 *  plan. */
function equalGapOn(
  axis: Axis,
  p: Point,
  self: { widthMm: number; depthMm: number },
  boxes: SnapBox[],
  tol: number,
): { value: number; guide: GapGuide } | null {
  const cross = crossOf(axis);
  const selfHalf = sizeOn(self, axis) / 2;
  const selfCrossHalf = sizeOn(self, cross) / 2;
  const at = p[cross];

  const band = boxes.filter((b) => Math.abs(b[cross] - at) < sizeOn(b, cross) / 2 + selfCrossHalf);
  if (band.length < 2) return null;

  const lo = (b: SnapBox) => b[axis] - sizeOn(b, axis) / 2;
  const hi = (b: SnapBox) => b[axis] + sizeOn(b, axis) / 2;
  // Nearest first on each side. A box the dragged item currently straddles falls into one of these
  // lists and yields a negative gap, which every branch below refuses.
  const before = band.filter((b) => b[axis] < p[axis]).sort((a, b) => hi(b) - hi(a));
  const after = band.filter((b) => b[axis] >= p[axis]).sort((a, b) => lo(a) - lo(b));

  const seg = (from: number, to: number) => ({ from, to, at });
  type Candidate = { value: number; gapMm: number; segments: { from: number; to: number; at: number }[] };
  const candidates: Candidate[] = [];

  if (before[0] && after[0]) {
    const gap = (lo(after[0]) - hi(before[0]) - selfHalf * 2) / 2;
    if (gap >= 0) {
      const edge = hi(before[0]);
      candidates.push({
        value: edge + gap + selfHalf,
        gapMm: gap,
        segments: [seg(edge, edge + gap), seg(lo(after[0]) - gap, lo(after[0]))],
      });
    }
  }
  if (before[1]) {
    const gap = lo(before[0]) - hi(before[1]);
    if (gap >= 0) {
      const edge = hi(before[0]);
      candidates.push({
        value: edge + gap + selfHalf,
        gapMm: gap,
        segments: [seg(hi(before[1]), lo(before[0])), seg(edge, edge + gap)],
      });
    }
  }
  if (after[1]) {
    const gap = lo(after[1]) - hi(after[0]);
    if (gap >= 0) {
      const edge = lo(after[0]);
      candidates.push({
        value: edge - gap - selfHalf,
        gapMm: gap,
        segments: [seg(hi(after[0]), lo(after[1])), seg(edge - gap, edge)],
      });
    }
  }

  let best: { err: number; c: Candidate } | null = null;
  for (const c of candidates) {
    const err = Math.abs(c.value - p[axis]);
    if (err <= tol && (!best || err < best.err)) best = { err, c };
  }
  if (!best) return null;
  return { value: best.c.value, guide: { axis, gapMm: Math.round(best.c.gapMm), segments: best.c.segments } };
}

export function snapPoint(p: Point, ctx: SnapContext): SnapResult {
  const tol = Math.max(0, ctx.toleranceMm);
  const { xs, ys } = referenceAxes(ctx);
  const step = gridStepMm(ctx.gridMm, tol);
  const anchor = ctx.anchor;

  // Drawing along a fixed angle answers early: no caller
  // passes both, and a wall being drawn has no reason to land on a ceiling rod. If one ever
  // does, the line snap has to move into this branch too rather than silently doing nothing.
  if (anchor && ctx.constrainAngle) {
    const dx = p.x - anchor.x;
    const dy = p.y - anchor.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return { point: roundPt(anchor), guides: { x: null, y: null }, angleLocked: true };
    const rad = (constrainAngleDeg((Math.atan2(dy, dx) * 180) / Math.PI) * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    // The direction is fixed, so alignment can only act along the ray: slide the endpoint out/in to
    // meet a reference axis. That keeps the angle exact *and* lands the corner on an existing edge —
    // the inference SketchUp draws as a coloured line.
    let bestT = dist;
    let bestErr = Infinity;
    let gx: number | null = null;
    let gy: number | null = null;
    if (Math.abs(ux) > 1e-9) {
      for (const x of xs) {
        const t = (x - anchor.x) / ux;
        const err = Math.abs(t - dist);
        if (t > 0 && err <= tol && err < bestErr) { bestErr = err; bestT = t; gx = x; gy = null; }
      }
    }
    if (Math.abs(uy) > 1e-9) {
      for (const y of ys) {
        const t = (y - anchor.y) / uy;
        const err = Math.abs(t - dist);
        if (t > 0 && err <= tol && err < bestErr) { bestErr = err; bestT = t; gx = null; gy = y; }
      }
    }
    // Nothing to infer → round the *length* to the grid step, never the endpoint: rounding x/y
    // independently would shear the wall off the angle we just locked.
    const t = bestErr === Infinity ? Math.max(step, roundTo(dist, step)) : bestT;
    return { point: roundPt({ x: anchor.x + ux * t, y: anchor.y + uy * t }), guides: { x: gx, y: gy }, angleLocked: true };
  }

  // THREE WAYS TO MEET A REFERENCE, not one: the item's centre on it, its low edge on it, or its
  // high edge on it. `offsets` is what the centre has to become for each — 0, +half, -half — and
  // the whole of what "flush" means falls out of the last two. A stage whose low edge lands on the
  // high edge of the stage before it is butted up against it: no gap, and no arithmetic done in the
  // designer's head.
  //
  // Without `self` the list is just [0] and every line below is the centre-only pull this file has
  // always done — which is exactly what a wall corner being dragged still gets.
  const halfOn = (a: Axis) => (ctx.self ? sizeOn(ctx.self, a) / 2 : 0);
  const offsets = (a: Axis): number[] => (ctx.self ? [0, halfOn(a), -halfOn(a)] : [0]);

  /** The nearest way to meet any reference on one axis: where the centre lands, and the reference
   *  line that claimed it — the guide is drawn at the LINE, which is the thing being lined up with,
   *  not at the centre that ended up half a stage away from it. */
  const align = (axis: Axis, at: number, refs: number[]) => {
    let best: { value: number; guide: number } | null = null;
    let err = tol;
    // OFFSET OUTER, refs inner — the loop order is the tie-break. Three boxes of the same width
    // sitting in a column have their left edges, their centres and their right edges all in line at
    // once, so all three readings are true and only one line can be drawn: whichever pass claims it
    // first. Trying every centre before any edge makes that line the centre line, which is the one
    // a designer means by "line them up".
    for (const off of offsets(axis)) {
      for (const r of refs) {
        const d = Math.abs(at - (r + off));
        if (d < err) {
          err = d;
          best = { value: r + off, guide: r };
        }
      }
    }
    return best;
  };

  const ax = align("x", p.x, xs);
  const ay = align("y", p.y, ys);
  let sx = ax ? ax.value : p.x;
  const gx: number | null = ax ? ax.guide : null;
  let sy = ay ? ay.value : p.y;
  const gy: number | null = ay ? ay.guide : null;

  // Spacing is the WEAKER claim and goes second: an axis that lined up with something is already
  // saying the more specific thing, and two rules fighting over one coordinate would just chatter.
  // Each axis is measured against the OTHER one's settled value, so which row an item is in is
  // decided before where it sits along that row.
  const gaps: GapGuide[] = [];
  if (ctx.self && ctx.boxes?.length) {
    if (gx === null) {
      const s = equalGapOn("x", { x: p.x, y: sy }, ctx.self, ctx.boxes, tol);
      if (s) { sx = s.value; gaps.push(s.guide); }
    }
    if (gy === null) {
      const s = equalGapOn("y", { x: sx, y: p.y }, ctx.self, ctx.boxes, tol);
      if (s) { sy = s.value; gaps.push(s.guide); }
    }
  }
  const spaced = (a: Axis) => gaps.some((g) => g.axis === a);

  if (gx === null && !spaced("x")) sx = roundTo(sx, step);
  if (gy === null && !spaced("y")) sy = roundTo(sy, step);

  return {
    point: roundPt({ x: sx, y: sy }),
    guides: { x: gx, y: gy },
    ...(gaps.length ? { gaps } : {}),
    angleLocked: false,
  };
}

// ponytail: self-check. Run: node --experimental-strip-types lib/studio/snap.ts
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const origin: Point = { x: 0, y: 0 };
  const base = { outline: [] as Point[], fixtures: [] as Point[], gridMm: 1000, toleranceMm: 120 }; // ~6px at the default hall zoom

  assert(constrainAngleDeg(37) === 35, "37° quantises down to 35°");
  assert(constrainAngleDeg(88) === 90, "88° quantises to the orthogonal");
  assert(constrainAngleDeg(92.5) === 90, "an exact tie between the orthogonal and the next 5° step goes to the orthogonal");
  assert(constrainAngleDeg(-2) === 0, "negative angles normalise into [0,360)");
  assert(constrainAngleDeg(352) === 350, "wrap-around stays on a 5° multiple");
  assert(constrainAngleDeg(358) === 0, "just under 360° snaps to 0, not 360");

  assert(gridStepMm(1000, 120) === 100, "a hall grid zoomed out steps in 100mm");
  assert(gridStepMm(1000, 6) === 5, "the same grid zoomed in steps in 5mm");
  assert(gridStepMm(100, 0.01) === 1, "the step never drops below a whole millimetre");
  assert(gridStepMm(1000, 5000) === 1000, "a tolerance wider than the grid keeps the grid itself");

  // Angle lock: a wall drawn 2° off horizontal lands exactly horizontal, at a rounded length.
  const locked = snapPoint({ x: 4237.7719, y: 148 }, { ...base, anchor: origin, constrainAngle: true });
  assert(locked.angleLocked === true && locked.point.y === 0, "a near-horizontal draw locks to 0°");
  assert(locked.point.x % 100 === 0, "the locked length rounds to the grid step");
  assert(Number.isInteger(locked.point.x) && Number.isInteger(locked.point.y), "snapped points are whole millimetres");

  // …and Alt (constrainAngle false) leaves the direction alone, only rounding.
  const free = snapPoint({ x: 4237.7719, y: 148 }, { ...base, anchor: origin, constrainAngle: false });
  assert(free.angleLocked === false && free.point.y === 100 && free.point.x === 4200, "releasing the lock falls back to plain grid rounding");

  // Inference along the ray: the locked direction is kept, the length stretches to meet an
  // existing vertex's x — so the new corner lines up with the wall opposite.
  const withOutline = { ...base, outline: [origin, { x: 3000, y: 1000 }] };
  const inferred = snapPoint({ x: 2990, y: 20 }, { ...withOutline, anchor: origin, constrainAngle: true });
  assert(inferred.point.x === 3000 && inferred.point.y === 0, "the locked ray slides out to a reference x");
  assert(inferred.guides.x === 3000 && inferred.guides.y === null, "the matched axis comes back as a guide");

  // Plain alignment (a vertex drag) is unchanged: pull onto the nearby axis, report the guide.
  const dragged = snapPoint({ x: 3020, y: 640 }, { ...withOutline, excludeVertexIdx: undefined });
  assert(dragged.point.x === 3000 && dragged.guides.x === 3000, "a drag snaps onto a reference x");
  assert(dragged.point.y === 600 && dragged.guides.y === null, "the unmatched axis just rounds to the grid step");

  // The dragged vertex must not snap to its own coordinates.
  const self = snapPoint({ x: 3012, y: 1004 }, { ...withOutline, excludeVertexIdx: 1 });
  assert(self.guides.x === null && self.point.x === 3000, "an excluded vertex is not its own snap target");

  // A zero-length draw can't emit a degenerate wall. The threshold sits a hair under the grid
  // step (100mm) rather than exactly on it: rounding x/y to whole millimetres independently can
  // shave a fraction of a millimetre off the Euclidean length, which is fine — the guarantee this
  // checks is "nowhere near zero", not an exact minimum.
  const degenerate = snapPoint({ x: 3, y: 2 }, { ...base, anchor: origin, constrainAngle: true });
  assert(Math.hypot(degenerate.point.x, degenerate.point.y) >= 99, "a locked draw never commits a zero-length wall");

  // ── equal gaps ────────────────────────────────────────────────────────────────────────────────
  // Two 1000-wide tables in a row with 500 of air between them. A third dragged up to the right of
  // them continues the rhythm rather than landing wherever the pointer was.
  const box = (x: number, y: number, w = 1000, d = 1000): SnapBox => ({ x, y, widthMm: w, depthMm: d });
  const row = [box(0, 0), box(1500, 0)]; // edges at 500 and 1000 → a 500 gap
  const mover = { widthMm: 1000, depthMm: 1000 };
  const spaced = { ...base, gridMm: 1000, toleranceMm: 200, self: mover, boxes: row };

  const continued = snapPoint({ x: 3050, y: 0 }, spaced);
  assert(continued.point.x === 3000, "a third box continues the run at the same 500 gap");
  assert(continued.gaps?.[0].gapMm === 500, "…and reports that gap");
  assert(continued.gaps?.[0].segments.length === 2, "…with both equal gaps drawn, not just the new one");
  assert(continued.gaps![0].segments.every((g) => Math.round(g.to - g.from) === 500), "…each segment the gap's own length");

  // Dropped into the hole between two, it centres: equal air either side.
  const hole = [box(0, 0), box(4000, 0)]; // edges at 500 and 3500 → 3000 of hole, 1000 of table
  const centred = snapPoint({ x: 2100, y: 0 }, { ...spaced, boxes: hole });
  assert(centred.point.x === 2000, "dropped into a hole it centres between the two");
  assert(centred.gaps?.[0].gapMm === 1000, "…with 1000 either side");

  // Out of tolerance, nothing is claimed — the point only rounds to the grid, as it always did.
  const far = snapPoint({ x: 3600, y: 0 }, spaced);
  assert(far.gaps === undefined && far.point.x === 3600, "beyond the tolerance no gap is claimed");

  // A box in a different row is not "spaced" from this one, it is simply somewhere else.
  const elsewhere = snapPoint({ x: 3050, y: 0 }, { ...spaced, boxes: [box(0, 9000), box(1500, 9000)] });
  assert(elsewhere.gaps === undefined, "boxes in another row take no part in this one's spacing");

  // Alignment is the stronger claim and keeps the axis it matched: a reference x within tolerance
  // wins over any gap that would have moved the item off it.
  const pulled = snapPoint({ x: 3050, y: 0 }, { ...spaced, outline: [{ x: 3040, y: 0 }, { x: 3040, y: 5000 }] });
  assert(pulled.point.x === 3040 && pulled.guides.x === 3040, "an alignment match wins the axis");
  assert(!pulled.gaps?.some((g) => g.axis === "x"), "…and no gap guide is drawn for it");

  // The two axes are resolved INDEPENDENTLY, and not necessarily by the same rule. A box dropped
  // under a column of two: its x is claimed by the alignment it shares with the column, and its y
  // by the rhythm the column already has — 800 of air, so 800 again.
  const column = [box(3000, 0), box(3000, 1800)]; // edges at 500 and 1300 → an 800 gap
  const under = snapPoint({ x: 3040, y: 3630 }, { ...spaced, boxes: column });
  assert(under.point.x === 3000 && under.point.y === 3600, "the two axes are resolved independently, by whichever rule claims each");
  assert(under.guides.x === 3000, "…the alignment says which line it lined up with");
  assert(under.gaps?.length === 1 && under.gaps[0].axis === "y", "…and only the axis alignment did not claim gets a gap guide");
  assert(under.gaps![0].gapMm === 800, "…continuing the 800 the column already has");

  // The same four boxes as a 2×2 block, with the fifth dragged out to the diagonal: it is in neither
  // that block's row nor its column, so there is no gap for it to be equal to. Nothing is claimed —
  // the honest answer, and the one that keeps a diagonal drag from being yanked square.
  const square = [box(0, 0), box(1500, 0), box(0, 1500), box(1500, 1500)];
  const diagonal = snapPoint({ x: 3040, y: 3030 }, { ...spaced, boxes: square });
  assert(diagonal.gaps === undefined, "a box in neither row nor column is spaced against nothing");

  // ── edges, and going flush ────────────────────────────────────────────────────────────────────
  // The thing a centre cannot say. Every reference can now be met three ways — the item's centre on
  // it, or either of its own edges — which is the whole of "put the stage against the wall" and
  // "butt these two decks into one platform", neither of which is a statement about a centre.
  {
    const deck = { widthMm: 4000, depthMm: 2000 }; // a run of staging modules
    const room = [{ x: 0, y: 0 }, { x: 20000, y: 0 }, { x: 20000, y: 12000 }, { x: 0, y: 12000 }];
    const ctx = { ...base, gridMm: 1000, toleranceMm: 200, self: deck };

    // Against the wall: dragged near y=0, the deck's BACK EDGE lands on it — not its centre, which
    // would put half the stage outside the building.
    const wall = snapPoint({ x: 10000, y: 1100 }, { ...ctx, outline: room });
    assert(wall.point.y === 1000, "a deck dragged at the wall lands with its back edge on the wall");
    assert(wall.guides.y === 0, "…and the guide is drawn along the wall, not through the deck");

    // Flush: a second deck butts onto the first, no gap and no arithmetic.
    const first: SnapBox = { x: 0, y: 5000, widthMm: 4000, depthMm: 2000 }; // edges at ±2000
    const butted = snapPoint({ x: 4100, y: 5000 }, { ...ctx, boxes: [first] });
    assert(butted.point.x === 4000, "a second deck butts up against the first");
    assert(butted.point.x - deck.widthMm / 2 === first.x + first.widthMm / 2, "…with no gap at all between them");
    assert(butted.guides.x === 2000, "…and the guide is the edge they meet on");
    assert(butted.point.y === 5000, "…in the same row, which is the ordinary centre pull");

    // Edges in line across the room: a narrow item lines its own left edge up with a wide one's,
    // which is a different answer from lining up their centres — and the one that was asked for.
    const wide: SnapBox = { x: 0, y: 0, widthMm: 4000, depthMm: 2000 }; // left edge at -2000
    const narrow = { widthMm: 1000, depthMm: 1000 };
    const flushLeft = snapPoint({ x: -1460, y: 6000 }, { ...ctx, self: narrow, boxes: [wide] });
    assert(flushLeft.point.x === -1500, "a narrow item can line its own edge up with a wide one's");
    assert(flushLeft.point.x - narrow.widthMm / 2 === wide.x - wide.widthMm / 2, "…which is what having the same left edge means");
    assert(flushLeft.guides.x === -2000, "…and the guide is that shared edge");

    // NO EXTENT, NO EDGE RULE. A wall corner being dragged is a point and has no edges, so it gets
    // exactly the centre-only pull this file has always given it.
    const asPoint = snapPoint({ x: -1460, y: 6000 }, { ...ctx, self: undefined, boxes: [wide] });
    assert(asPoint.point.x === -1400, "without an extent nothing has an edge, and the point only rounds to the grid");
    assert(asPoint.guides.x === null, "…and claims no alignment it cannot have");

    // Ties go to the CENTRE. Three same-width decks in a column line up by their edges and by their
    // centres at once; the line drawn is the one through the middle.
    const above: SnapBox = { x: 6000, y: 0, widthMm: 4000, depthMm: 2000 };
    const below = snapPoint({ x: 6040, y: 4000 }, { ...ctx, boxes: [above] });
    assert(below.point.x === 6000, "a deck under another lines up with it");
    assert(below.guides.x === 6000, "…on the centre line, not on whichever edge was reached first");
  }

  console.log("snap self-check passed");
}
