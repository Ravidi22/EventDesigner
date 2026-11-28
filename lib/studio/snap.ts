import type { Point } from "./hall";

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
  /** The angle lock's step and the direction it is counted from. Default: 5° steps off the page's
   *  own axes, which is how a hall is traced. The catalog's shape editor asks for 45° steps from the
   *  shape's FIRST side instead (the stage tool's rule, lib/studio/stage-draw.ts): a table drawn at
   *  an angle is still square to itself. */
  angleStepDeg?: number;
  angleRefDeg?: number;
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
  self?: { widthMm: number; depthMm: number; flush?: FlushExtent };
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
  /** What the box is the room OF, when that is not the box itself — a turned rectangle or a circle.
   *  The box above stays the axis-aligned room the thing takes up (what a marquee and the room's own
   *  lines read); the no-overlap rule (collide.ts) and the snap between things standing at one angle
   *  (snapTurned) read this. Absent = the box is the outline: an unturned rectangle. */
  shape?: BoxShape;
  /** A neighbour of the moving thing's OWN kind (collide.ts's solid key): meeting it edge to edge —
   *  flush — is claimed before any other line within reach (snapPoint). */
  flush?: boolean;
  /** The extent a `flush` box is MET at, when that is not the box: a table's seat ring
   *  (lib/studio/seat-ring.ts), so the next table goes flush where their chairs meet (QA MG-16).
   *  Axis-aligned, in the room. Absent = the box. */
  flushBox?: { x: number; y: number; widthMm: number; depthMm: number };
}

/** The extent the moving thing meets a `flushBox` at, about its own centre (dx, dy). */
export interface FlushExtent {
  dx: number;
  dy: number;
  widthMm: number;
  depthMm: number;
}

/** A thing's true outline about its box's centre: a circle as wide as `widthMm` (`round`), else a
 *  rectangle of its own `widthMm` × `depthMm`, turned `rotation`° (clockwise on screen, as every
 *  rotation on the plan). */
export interface BoxShape {
  round?: boolean;
  rotation: number;
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

// Nearest multiple of the step, counted from `refDeg` (the page's axes by default, a shape's first
// side when a host asks), except that the four orthogonals to the reference win an exact tie (2.5°
// sits between 0 and 5 — a wall meant to be square should fall square, not shear off by a notch).
export function constrainAngleDeg(deg: number, stepDeg = ANGLE_STEP_DEG, refDeg = 0): number {
  const rel = deg - refDeg;
  const stepped = refDeg + Math.round(rel / stepDeg) * stepDeg;
  const ortho = refDeg + Math.round(rel / 90) * 90;
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
    const rad = (constrainAngleDeg((Math.atan2(dy, dx) * 180) / Math.PI, ctx.angleStepDeg ?? ANGLE_STEP_DEG, ctx.angleRefDeg ?? 0) * Math.PI) / 180;
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

  /** FLUSH FIRST: against a box of its own kind (SnapBox.flush) standing BESIDE it — overlapping it
   *  on the other axis, so the two would really meet — the thing's edge goes onto that box's edge
   *  before any other line within reach is considered. The nearest line used to win outright: a
   *  deck dragged 4cm short of the deck beside it snapped to a table's edge 1cm away across the
   *  room, and the 4cm stayed. */
  const flushOn = (axis: Axis, at: number): { value: number; guide: number } | null => {
    if (!ctx.self) return null;
    // A box met at its flushBox is met by the mover's own flush extent (a ring against a ring); any
    // other flush box by the mover's box.
    const plain: FlushExtent = { dx: 0, dy: 0, widthMm: ctx.self.widthMm, depthMm: ctx.self.depthMm };
    const cross = crossOf(axis);
    const off = (e: FlushExtent, a: Axis) => (a === "x" ? e.dx : e.dy);
    let best: { value: number; guide: number } | null = null;
    let err = tol;
    for (const box of ctx.boxes ?? []) {
      if (!box.flush) continue;
      const b = box.flushBox ?? box;
      const self = box.flushBox ? (ctx.self.flush ?? plain) : plain;
      if (Math.abs(b[cross] - (p[cross] + off(self, cross))) >= (sizeOn(b, cross) + sizeOn(self, cross)) / 2 - 1) continue;
      const lo = b[axis] - sizeOn(b, axis) / 2;
      const hi = b[axis] + sizeOn(b, axis) / 2;
      const half = sizeOn(self, axis) / 2;
      for (const [value, guide] of [
        [hi + half - off(self, axis), hi],
        [lo - half - off(self, axis), lo],
      ]) {
        const d = Math.abs(at - value);
        if (d < err) {
          err = d;
          best = { value, guide };
        }
      }
    }
    return best;
  };

  const ax = flushOn("x", p.x) ?? align("x", p.x, xs);
  const ay = flushOn("y", p.y) ?? align("y", p.y, ys);
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

/** How many quarter turns take rotation `a` onto rotation `b` — null unless a whole number of them
 *  does (within half a degree). */
function quarterTurns(a: number, b: number): number | null {
  const d = norm360(b - a);
  const k = Math.round(d / 90);
  return Math.abs(d - k * 90) < 0.5 ? k % 4 : null;
}

/**
 * The snap for a thing standing AT AN ANGLE — `self.rotation` not a whole quarter turn — among things
 * standing at the same angle (or a quarter turn from it): worked in their common frame on their TRUE
 * sizes (SnapBox.shape) — edges flush, flush-first, edges and centres in line, equal air — and turned
 * back into the room. The room's own snap measures a turned thing by the box it takes up, which is
 * bigger than it on every side: two 4×2 stages along a 30° wall snapped "flush" stood 232mm apart
 * (1000mm at 45°), and Ctrl+G then would not merge them.
 *
 * Null when nothing at its angle is within reach — the caller snaps as it always did. No guide lines
 * come back: the canvas draws its guides along the room's axes, and these are not.
 */
export function snapTurned(
  p: Point,
  self: { widthMm: number; depthMm: number; rotation: number },
  boxes: readonly SnapBox[],
  toleranceMm: number,
): Point | null {
  if (quarterTurns(0, self.rotation) !== null) return null;
  const t = (self.rotation * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const toFrame = (q: Point): Point => ({ x: q.x * c + q.y * s, y: -q.x * s + q.y * c });
  const local: SnapBox[] = [];
  for (const b of boxes) {
    if (!b.shape || b.shape.round) continue;
    const k = quarterTurns(self.rotation, b.shape.rotation);
    if (k === null) continue;
    const q = toFrame(b);
    const [w, d] = k % 2 ? [b.shape.depthMm, b.shape.widthMm] : [b.shape.widthMm, b.shape.depthMm];
    // A box met at its ring (flushBox) is not flush in this frame, which knows only true sizes.
    local.push({ x: q.x, y: q.y, widthMm: w, depthMm: d, ...(b.flush && !b.flushBox ? { flush: true } : {}) });
  }
  if (!local.length) return null;
  // No outline, no fixtures, and a 1mm "grid": in this frame the room's corners and grid mean nothing.
  const r = snapPoint(toFrame(p), { toleranceMm, outline: [], fixtures: [], gridMm: 1, self: { widthMm: self.widthMm, depthMm: self.depthMm }, boxes: local });
  if (r.guides.x === null && r.guides.y === null && !r.gaps) return null;
  return roundPt({ x: r.point.x * c - r.point.y * s, y: r.point.x * s + r.point.y * c });
}
