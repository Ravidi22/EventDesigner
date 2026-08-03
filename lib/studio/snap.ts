import type { Point } from "./hall";

// Snapping for the shape canvas, pulled out of the component so both modes share one rule set:
// dragging a vertex/fixture (alignment only) and drawing a new wall (alignment + an angle lock off
// the previous vertex). Pure — the draw preview re-derives it every render, so releasing the angle
// lock shows up instantly without any state to keep in sync.

const ANGLE_STEP_DEG = 15; // walls are almost never at 37.4° — quantise the direction, not the point

export interface SnapContext {
  toleranceMm: number; // the snap radius in world units — callers pass ~6px worth of mm
  outline: Point[];
  fixtures: Point[]; // stage + bar centres; the caller pre-filters the one being dragged
  gridMm: number;
  excludeVertexIdx?: number; // the vertex being dragged must not snap to itself
  anchor?: Point; // previous vertex while drawing — enables the angle constraint
  constrainAngle?: boolean;
}

export interface SnapResult {
  point: Point;
  guides: { x: number | null; y: number | null }; // the matched reference axes, for the accent lines
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

// Every x/y worth aligning to: the outline's bbox edges + centre, each vertex, each fixture centre.
// The vertex being dragged is dropped from the bbox too, not just from the vertex list — otherwise
// it defines the very edge it then snaps back onto.
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
  return { xs, ys };
}

export function snapPoint(p: Point, ctx: SnapContext): SnapResult {
  const tol = Math.max(0, ctx.toleranceMm);
  const { xs, ys } = referenceAxes(ctx);
  const step = gridStepMm(ctx.gridMm, tol);
  const anchor = ctx.anchor;

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

  let sx = p.x, gx: number | null = null, bx = tol;
  for (const x of xs) { const d = Math.abs(p.x - x); if (d < bx) { bx = d; sx = x; gx = x; } }
  let sy = p.y, gy: number | null = null, by = tol;
  for (const y of ys) { const d = Math.abs(p.y - y); if (d < by) { by = d; sy = y; gy = y; } }
  if (gx === null) sx = roundTo(sx, step);
  if (gy === null) sy = roundTo(sy, step);
  return { point: roundPt({ x: sx, y: sy }), guides: { x: gx, y: gy }, angleLocked: false };
}

// ponytail: self-check. Run: node --experimental-strip-types lib/studio/snap.ts
if ((import.meta as { main?: boolean }).main) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const origin: Point = { x: 0, y: 0 };
  const base = { outline: [] as Point[], fixtures: [] as Point[], gridMm: 1000, toleranceMm: 120 }; // ~6px at the default hall zoom

  assert(constrainAngleDeg(37) === 30, "37° quantises down to 30°");
  assert(constrainAngleDeg(88) === 90, "88° quantises to the orthogonal");
  assert(constrainAngleDeg(7.5) === 0, "an exact tie between 0° and 15° goes to the orthogonal");
  assert(constrainAngleDeg(97.5) === 90, "an exact tie around 90° goes to the orthogonal");
  assert(constrainAngleDeg(-5) === 0, "negative angles normalise into [0,360)");
  assert(constrainAngleDeg(352) === 345 || constrainAngleDeg(352) === 0, "wrap-around stays on a 15° multiple");
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

  // A zero-length draw can't emit a degenerate wall.
  const degenerate = snapPoint({ x: 3, y: 2 }, { ...base, anchor: origin, constrainAngle: true });
  assert(Math.hypot(degenerate.point.x, degenerate.point.y) >= 100, "a locked draw never commits a zero-length wall");

  console.log("snap self-check passed");
}
