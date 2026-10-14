// Drawing stages CLEANLY — the geometry behind the area tool's straight lines, and behind putting
// several stages together.
//
// A stage is nearly always a rectangle, an L or a T: straight sides at right angles. A pointer is not
// that precise, and a side 2° off square is not a cosmetic problem here — the fill lays its rows from
// the front edge, so a skewed side leaves a sliver of stage no deck fits and a ragged build. So:
//
//   • while drawing, each new side is held to 45° steps from the FIRST side (not from the page — a
//     stage along an angled wall is square to that wall), and its length to whole 10cm (Alt frees
//     both, for the stage that really is odd);
//   • when the outline closes, a shape whose sides are all within a few degrees of square is made
//     exactly square (squareUp) — which is what fixes the closing side, the one side the designer
//     does not draw;
//   • an outline that crosses itself is refused, since no stage has that shape.
//
// And for several stages at once: stickBoxes closes the gaps between them (and lines up edges that
// are nearly in line), and unionOutline merges touching orthogonal stages into ONE outline, so the
// skirt, the stairs and the railing are worked out for the platform as built — not for its parts,
// which would skirt the seam between two stages pushed together.
//
// Pure, no DOM, self-checked: `npm run check:stage-draw`.
import type { Point } from "@/lib/design-document/types";
import { isMain } from "../self-check";

export const DRAW_ANGLE_STEP_DEG = 45;
export const DRAW_LENGTH_STEP_MM = 100;

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

/** The next corner of an outline being drawn: from `anchor` towards `raw`, its direction held to
 *  45° steps from `refDeg` and its length to whole DRAW_LENGTH_STEP_MM. `typedMm` replaces the
 *  length (a length typed in). Free when `free` (Alt). */
export function constrainNext(
  anchor: Point,
  raw: Point,
  refDeg: number,
  opts: { free?: boolean; typedMm?: number; snapLength?: (mm: number) => number } = {},
): Point {
  const dx = raw.x - anchor.x;
  const dy = raw.y - anchor.y;
  const dist = Math.hypot(dx, dy);
  if (opts.free && !opts.typedMm) return { x: Math.round(raw.x), y: Math.round(raw.y) };
  if (dist < 1e-6 && !opts.typedMm) return { ...anchor };
  let a = deg(Math.atan2(dy, dx));
  if (!opts.free) a = refDeg + Math.round((a - refDeg) / DRAW_ANGLE_STEP_DEG) * DRAW_ANGLE_STEP_DEG;
  const len =
    opts.typedMm ??
    (opts.free
      ? dist
      : opts.snapLength
        ? opts.snapLength(dist)
        : Math.max(DRAW_LENGTH_STEP_MM, Math.round(dist / DRAW_LENGTH_STEP_MM) * DRAW_LENGTH_STEP_MM));
  return { x: Math.round(anchor.x + Math.cos(rad(a)) * len), y: Math.round(anchor.y + Math.sin(rad(a)) * len) };
}

/** Make a nearly-square outline exactly square: in the frame of its first side, every side within
 *  `tolDeg` of horizontal gives its two corners one shared y, and every side near vertical one shared
 *  x (each shared value the average of the corners that share it). Returned unchanged when any side
 *  is genuinely angled — a 45° corner is meant. */
export function squareUp(poly: readonly Point[], tolDeg = 6): Point[] {
  const n = poly.length;
  if (n < 4) return [...poly];
  const a0 = Math.atan2(poly[1].y - poly[0].y, poly[1].x - poly[0].x);
  const c = Math.cos(a0);
  const s = Math.sin(a0);
  const o = poly[0];
  const local = poly.map((p) => ({ x: (p.x - o.x) * c + (p.y - o.y) * s, y: -(p.x - o.x) * s + (p.y - o.y) * c }));
  const kind: ("h" | "v")[] = [];
  for (let i = 0; i < n; i++) {
    const p = local[i];
    const q = local[(i + 1) % n];
    const ang = Math.abs(deg(Math.atan2(q.y - p.y, q.x - p.x))) % 180;
    if (Math.min(ang, 180 - ang) <= tolDeg) kind.push("h");
    else if (Math.abs(ang - 90) <= tolDeg) kind.push("v");
    else return [...poly];
  }
  // Union-find per axis: corners joined by a horizontal side share y; by a vertical side, x.
  const share = (which: "h" | "v") => {
    const parent = local.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    kind.forEach((k, i) => {
      if (k === which) parent[find(i)] = find((i + 1) % n);
    });
    return local.map((_, i) => find(i));
  };
  const hy = share("h");
  const vx = share("v");
  const avg = (groups: number[], pick: (p: Point) => number) => {
    const sum = new Map<number, { t: number; k: number }>();
    groups.forEach((g, i) => {
      const e = sum.get(g) ?? { t: 0, k: 0 };
      e.t += pick(local[i]);
      e.k += 1;
      sum.set(g, e);
    });
    return groups.map((g) => sum.get(g)!.t / sum.get(g)!.k);
  };
  const ys = avg(hy, (p) => p.y);
  const xs = avg(vx, (p) => p.x);
  return local.map((_, i) => {
    const x = xs[i];
    const y = ys[i];
    return { x: Math.round(o.x + x * c - y * s), y: Math.round(o.y + x * s + y * c) };
  });
}

/** Does the outline cross itself (two sides that are not neighbours intersect)? */
export function selfIntersects(poly: readonly Point[]): boolean {
  const n = poly.length;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const hit = (p1: Point, p2: Point, q1: Point, q2: Point) => {
    const d1 = cross(q1, q2, p1);
    const d2 = cross(q1, q2, p2);
    const d3 = cross(p1, p2, q1);
    const d4 = cross(p1, p2, q2);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (hit(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true;
    }
  return false;
}

// ── Several stages ────────────────────────────────────────────────────────────────────────────

/** A stage (or any piece of one) as its turned box: centre, facing, and its size in its own frame. */
export interface StickItem {
  id: string;
  centre: Point;
  rotation: number;
  widthMm: number;
  depthMm: number;
}

interface Box {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Edges this close to in line are lined up when two stages are pushed together. */
export const STICK_ALIGN_MM = 300;

/** Push stages together: every gap between them closed, edges that nearly line up lined up. The
 *  largest stays where it is and the rest join it one at a time, nearest first, each on the side it
 *  is already on. Only stages square to the largest take part (a 30° stage has no side to butt
 *  against a 0° one); the rest are returned where they were. Returns each moved stage's new centre. */
export function stickBoxes(items: readonly StickItem[]): Map<string, Point> {
  const out = new Map<string, Point>();
  if (items.length < 2) return out;
  const anchor = [...items].sort((a, b) => b.widthMm * b.depthMm - a.widthMm * a.depthMm)[0];
  const t = rad(anchor.rotation);
  const c = Math.cos(t);
  const s = Math.sin(t);
  const toF = (p: Point) => ({ x: p.x * c + p.y * s, y: -p.x * s + p.y * c });
  const toW = (p: Point) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c });
  const square = (r: number) => {
    const d = (((r - anchor.rotation) % 90) + 90) % 90;
    return Math.min(d, 90 - d) < 0.5;
  };
  const boxOf = (it: StickItem): Box => {
    const f = toF(it.centre);
    // Turned a quarter from the anchor, its width runs along the anchor's depth.
    const q = Math.round((((it.rotation - anchor.rotation) % 180) + 180) % 180) === 90;
    const w = q ? it.depthMm : it.widthMm;
    const d = q ? it.widthMm : it.depthMm;
    return { id: it.id, minX: f.x - w / 2, maxX: f.x + w / 2, minY: f.y - d / 2, maxY: f.y + d / 2 };
  };
  const placed: Box[] = [boxOf(anchor)];
  const rest = items.filter((it) => it.id !== anchor.id && square(it.rotation)).map(boxOf);
  const gap = (a: Box, b: Box) =>
    Math.hypot(Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX)), Math.max(0, Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY)));
  const overlaps = (a: Box, b: Box) => Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > 1 && Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > 1;
  const shift = (b: Box, dx: number, dy: number): Box => ({ ...b, minX: b.minX + dx, maxX: b.maxX + dx, minY: b.minY + dy, maxY: b.maxY + dy });
  /** Line b's edges up with a's on one axis, when they are nearly in line already. */
  const align = (aMin: number, aMax: number, bMin: number, bMax: number) => {
    const opts = [aMin - bMin, aMax - bMax, (aMin + aMax) / 2 - (bMin + bMax) / 2];
    const best = opts.reduce((p, q) => (Math.abs(q) < Math.abs(p) ? q : p));
    return Math.abs(best) <= STICK_ALIGN_MM ? best : 0;
  };
  /** How far b must move on one axis to touch a — zero when they already overlap on that axis. */
  const touch = (aMin: number, aMax: number, bMin: number, bMax: number) =>
    (bMin + bMax) / 2 >= (aMin + aMax) / 2 ? aMax - bMin : aMin - bMax;

  while (rest.length) {
    rest.sort((p, q) => Math.min(...placed.map((a) => gap(a, p))) - Math.min(...placed.map((a) => gap(a, q))));
    const b = rest.shift()!;
    const a = placed.reduce((best, x) => (gap(x, b) < gap(best, b) ? x : best));
    const ovX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    const ovY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
    const tries: Box[] = [];
    // Side by side (they share height) → close the x gap; above/below → close the y gap. A corner
    // neighbour closes both.
    const sideways = ovY >= ovX;
    const horiz = () => shift(b, touch(a.minX, a.maxX, b.minX, b.maxX), ovY > 0 ? align(a.minY, a.maxY, b.minY, b.maxY) : touch(a.minY, a.maxY, b.minY, b.maxY));
    const vert = () => shift(b, ovX > 0 ? align(a.minX, a.maxX, b.minX, b.maxX) : touch(a.minX, a.maxX, b.minX, b.maxX), touch(a.minY, a.maxY, b.minY, b.maxY));
    tries.push(sideways ? horiz() : vert(), sideways ? vert() : horiz());
    const moved = tries.find((m) => !placed.some((p) => overlaps(p, m))) ?? b;
    placed.push(moved);
    if (moved !== b) out.set(b.id, toW({ x: (moved.minX + moved.maxX) / 2, y: (moved.minY + moved.maxY) / 2 }));
  }
  for (const [id, p] of out) out.set(id, { x: Math.round(p.x), y: Math.round(p.y) });
  return out;
}

/** The outline of several ORTHOGONAL outlines that touch, as one: every outline square to the x/y
 *  axes of the frame they are given in. Null when they do not form one connected piece, when the
 *  result would have a hole, or when any side is not square (the union of angled shapes is not
 *  what this is for). The outlines may overlap. */
export function unionOutline(polys: readonly (readonly Point[])[]): Point[] | null {
  const tol = 2;
  for (const poly of polys)
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      if (Math.abs(p.x - q.x) > tol && Math.abs(p.y - q.y) > tol) return null;
    }
  const snap = (v: number) => Math.round(v);
  const xs = [...new Set(polys.flatMap((p) => p.map((q) => snap(q.x))))].sort((a, b) => a - b);
  const ys = [...new Set(polys.flatMap((p) => p.map((q) => snap(q.y))))].sort((a, b) => a - b);
  const inside = (pt: Point, poly: readonly Point[]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  if (nx < 1 || ny < 1) return null;
  const cell = (i: number, j: number) =>
    i >= 0 && j >= 0 && i < nx && j < ny && polys.some((p) => inside({ x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 }, p));
  const filled: boolean[][] = [];
  for (let i = 0; i < nx; i++) {
    filled.push([]);
    for (let j = 0; j < ny; j++) filled[i].push(cell(i, j));
  }
  const on = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && filled[i][j];
  // One connected piece?
  const cells: [number, number][] = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if (filled[i][j]) cells.push([i, j]);
  if (!cells.length) return null;
  const seen = new Set<string>([cells[0].join()]);
  const stack = [cells[0]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${i + di},${j + dj}`;
      if (on(i + di, j + dj) && !seen.has(k)) {
        seen.add(k);
        stack.push([i + di, j + dj]);
      }
    }
  }
  if (seen.size !== cells.length) return null;
  // Boundary edges, directed with the inside on their LEFT in grid index space, chained into loops.
  type E = { a: [number, number]; b: [number, number] };
  const edges: E[] = [];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      if (!filled[i][j]) continue;
      if (!on(i, j - 1)) edges.push({ a: [i, j], b: [i + 1, j] });
      if (!on(i + 1, j)) edges.push({ a: [i + 1, j], b: [i + 1, j + 1] });
      if (!on(i, j + 1)) edges.push({ a: [i + 1, j + 1], b: [i, j + 1] });
      if (!on(i - 1, j)) edges.push({ a: [i, j + 1], b: [i, j] });
    }
  const from = new Map<string, E[]>();
  for (const e of edges) from.set(e.a.join(), [...(from.get(e.a.join()) ?? []), e]);
  const loop: [number, number][] = [];
  let cur = edges[0];
  const used = new Set<E>();
  while (cur && !used.has(cur)) {
    used.add(cur);
    loop.push(cur.a);
    const next = (from.get(cur.b.join()) ?? []).filter((e) => !used.has(e));
    cur = next[0];
  }
  if (used.size !== edges.length) return null; // a second loop — a hole in the middle
  // Drop the corners that are not corners (collinear runs).
  const pts = loop.map(([i, j]) => ({ x: xs[i], y: ys[j] }));
  const out = pts.filter((p, k) => {
    const a = pts[(k - 1 + pts.length) % pts.length];
    const b = pts[(k + 1) % pts.length];
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
  return out.length >= 3 ? out : null;
}

// ── Round areas: a disc, an oval, a half-round ─────────────────────────────────────────────────
//
// The area tool draws corners; a stage that is ROUND is drawn as what it is instead — a centre and
// a diameter, a box for an oval, a chord and a side for a half-round — and comes out as a fine
// polygon whose corners along the curve are smooth (StageBuild.smooth), so its rim is one side and
// the stairs round it follow it. Chords of about 25cm, as a round stage piece's are.

/** How a stage area is drawn: corner by corner, or as one of the round shapes. */
export type AreaShape = "corners" | "circle" | "ellipse" | "half";

/** About how long each chord of a curve drawn here is — a round area's rim, a rounded corner, a
 *  bowed front. Short enough to read as a curve, long enough to stay a few dozen points. */
export const ROUND_CHORD_MM = 250;

/** An ellipse `w` × `h` about `centre`, turned `deg`, starting at its top — every corner smooth. */
export function ellipseArea(centre: Point, w: number, h: number, deg = 0): { outline: Point[]; smooth: number[] } {
  const a = w / 2;
  const b = h / 2;
  const perimeter = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  const n = Math.max(24, 4 * Math.ceil(perimeter / (4 * ROUND_CHORD_MM)));
  const step = (2 * Math.PI) / n;
  const outline = Array.from({ length: n }, (_, k) => {
    const th = -Math.PI / 2 - step / 2 + k * step;
    const q = rotP({ x: a * Math.cos(th), y: b * Math.sin(th) }, deg);
    return { x: Math.round(centre.x + q.x), y: Math.round(centre.y + q.y) };
  });
  return { outline, smooth: outline.map((_, k) => k) };
}

/** A half-round on the chord a → b, bulging to `side` of it (+1 = the left of a → b as the numbers
 *  run, −1 the right): the chord is a straight side, its two ends real corners, and every corner
 *  along the arc smooth, the apex one of them. */
export function halfRoundArea(a: Point, b: Point, side: 1 | -1): { outline: Point[]; smooth: number[] } {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const R = L / 2;
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const u = { x: (b.x - a.x) / (L || 1), y: (b.y - a.y) / (L || 1) };
  const n = { x: -side * u.y, y: side * u.x };
  const steps = Math.max(4, 2 * Math.ceil((Math.PI * R) / (2 * ROUND_CHORD_MM)));
  const outline = Array.from({ length: steps + 1 }, (_, k) => {
    const th = (Math.PI * k) / steps;
    return { x: Math.round(m.x - u.x * R * Math.cos(th) + n.x * R * Math.sin(th)), y: Math.round(m.y - u.y * R * Math.cos(th) + n.y * R * Math.sin(th)) };
  });
  return { outline, smooth: outline.map((_, k) => k).filter((k) => k > 0 && k < steps) };
}

// ── Rounded corners and a bowed front ─────────────────────────────────────────────────────────
//
// The two things a designer asks of a rectangle that the corner tool cannot draw: its corners
// rounded off, and its front bowed out toward the room. Both come out as the same kind of outline
// a round area does — a fine polygon with the corners ALONG each curve marked smooth — so the rim
// is sides and arcs, and the stairs follow them (lib/design-document/stage.ts stageSide). The
// TANGENT points, where an arc meets a straight run, are REAL corners: each straight run and each
// arc is its own side. Were they smooth, a rectangle rounded at every corner would be one closed
// side with no front on it.

/** Which corners a rounding applies to: every one, the two bounding the front, or the others. */
export type RoundedAt = "all" | "front" | "back";

/** An outline with the corners a curve runs through, and which edge is its front. */
export interface ShapedOutline {
  outline: Point[];
  smooth: number[];
  front: number;
}

const unitV = (a: Point, b: Point): Point => {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
};
const roundP = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });

/** The arc about `c` of radius `r` from `from` round the SHORT way to `to`, as chords of about
 *  ROUND_CHORD_MM: its interior points only, never the two ends. */
function arcBetween(c: Point, r: number, from: Point, to: Point): Point[] {
  const a0 = Math.atan2(from.y - c.y, from.x - c.x);
  let d = Math.atan2(to.y - c.y, to.x - c.x) - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const n = Math.max(2, Math.ceil((Math.abs(d) * r) / ROUND_CHORD_MM));
  return Array.from({ length: n - 1 }, (_, k) => {
    const th = a0 + (d * (k + 1)) / n;
    return { x: c.x + r * Math.cos(th), y: c.y + r * Math.sin(th) };
  });
}

/** The two REAL corners bounding the side edge `front` is on: back from its start through any
 *  smooth corner, on from its end. On a straight side, the edge's own two ends. */
function frontCorners(n: number, front: number, smooth: ReadonlySet<number>): [number, number] {
  let fs = ((front % n) + n) % n;
  let fe = (fs + 1) % n;
  for (let guard = 0; smooth.has(fs) && guard < n; guard++) fs = (fs - 1 + n) % n;
  for (let guard = 0; smooth.has(fe) && guard < n; guard++) fe = (fe + 1) % n;
  return [fs, fe];
}

/**
 * The outline with its corners rounded off: each picked corner replaced by a fillet of `radiusMm`
 * tangent to both its sides, cut into chords. The tangent points are real corners; the chords'
 * corners are smooth. A radius the corner has no room for gives way: the tangent points never pass
 * the middle of the shorter side, so two fillets on one side never cross. Corners already smooth
 * (part of a curve) are left alone. The returned `front` names the front side's straight run — the
 * edge leaving the front corner's tangent point.
 */
export function roundCorners(outline: readonly Point[], radiusMm: number, which: RoundedAt, front: number, smooth: readonly number[] = []): ShapedOutline {
  const n = outline.length;
  const sm = new Set(smooth);
  if (n < 3 || radiusMm <= 0) return { outline: outline.map(roundP), smooth: [...smooth], front: ((front % n) + n) % n };
  const [fs, fe] = frontCorners(n, front, sm);
  const picked = (v: number) => !sm.has(v) && (which === "all" || (which === "front") === (v === fs || v === fe));
  const out: Point[] = [];
  const outSmooth: number[] = [];
  const last: number[] = [];
  const push = (p: Point, isSmooth = false) => {
    if (isSmooth) outSmooth.push(out.length);
    out.push(roundP(p));
  };
  for (let v = 0; v < n; v++) {
    const c = outline[v];
    const a = outline[(v - 1 + n) % n];
    const b = outline[(v + 1) % n];
    const La = Math.hypot(c.x - a.x, c.y - a.y);
    const Lb = Math.hypot(b.x - c.x, b.y - c.y);
    const u1 = unitV(a, c);
    const u2 = unitV(c, b);
    // The wedge between the two sides at this corner — the angle between the rays back to a and on
    // to b — and the fillet that fits it: a tangent point t = r / tan(θ/2) along each side.
    const theta = Math.acos(Math.max(-1, Math.min(1, -(u1.x * u2.x + u1.y * u2.y))));
    const flat = theta < rad(2) || theta > rad(178) || La < 1 || Lb < 1;
    const tan = Math.tan(theta / 2);
    const t = flat ? 0 : Math.min(radiusMm / tan, Math.min(La, Lb) / 2);
    const r = t * tan;
    if (!picked(v) || r < 5) {
      push(c, sm.has(v));
      last[v] = out.length - 1;
      continue;
    }
    const A = { x: c.x - u1.x * t, y: c.y - u1.y * t };
    const B = { x: c.x + u2.x * t, y: c.y + u2.y * t };
    const bis = unitV({ x: 0, y: 0 }, { x: -u1.x + u2.x, y: -u1.y + u2.y });
    const F = { x: c.x + (bis.x * r) / Math.sin(theta / 2), y: c.y + (bis.y * r) / Math.sin(theta / 2) };
    push(A);
    for (const q of arcBetween(F, r, A, B)) push(q, true);
    push(B);
    last[v] = out.length - 1;
  }
  return { outline: out, smooth: outSmooth, front: last[((front % n) + n) % n] % out.length };
}

/**
 * The outline with edge `front` bowed out — replaced by a circular arc through its two ends that
 * stands `sagittaMm` proud of it at the middle, cut into chords, its corners smooth. The two ends
 * stay the real corners they were. The returned `front` is the arc's first chord, which is still
 * edge `front`: everything after it moves along.
 */
export function bowFront(outline: readonly Point[], front: number, sagittaMm: number, smooth: readonly number[] = []): ShapedOutline {
  const n = outline.length;
  const f = ((front % n) + n) % n;
  const a = outline[f];
  const b = outline[(f + 1) % n];
  const L = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  if (n < 3 || sagittaMm <= 0 || L < 1) return { outline: outline.map(roundP), smooth: [...smooth], front: f };
  // Never a full half-circle: the arc's ends would run parallel to the sides and there would be no
  // corner left to turn at.
  const s = Math.min(sagittaMm, L * 0.49);
  const R = (L * L) / 4 / (2 * s) + s / 2;
  const sg = areaOf(outline) >= 0 ? 1 : -1;
  const u = unitV(a, b);
  const out = { x: sg * u.y, y: -sg * u.x };
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const c = { x: m.x - out.x * (R - s), y: m.y - out.y * (R - s) };
  const arc = arcBetween(c, R, a, b).map(roundP);
  const k = arc.length;
  return {
    outline: [...outline.slice(0, f + 1).map(roundP), ...arc, ...outline.slice(f + 1).map(roundP)],
    smooth: [...smooth.map((i) => (i > f ? i + k : i)), ...arc.map((_, j) => f + 1 + j)].sort((x, y) => x - y),
    front: f,
  };
}

/** What a rectangle is shaped with (StageBuild.roundedMm / roundedAt / bowMm). */
export interface RectShape {
  roundedMm?: number;
  roundedAt?: RoundedAt;
  bowMm?: number;
}

/**
 * A rectangle `widthMm` × `depthMm`, its corners rounded and its front bowed as asked — the one
 * shape the fill tool composes, so it is built here once: with a bow AND rounded front corners,
 * each front fillet is struck tangent to the SIDE and to the BOW'S CIRCLE, not to the chord, so the
 * bow runs into the corner as one line rather than meeting the fillet at a kink. The outline is
 * CENTRED ON ITS OWN BOX (a bow pushes the box forward by the sagitta) and wound as rectOutline is,
 * with the front as edge 0: the bow's first chord, or the straight front run. `offset` is where the
 * new centre stands in the plain rectangle's frame — (0, −s/2) for a bow — so the caller can keep
 * the rectangle where it was. A radius or a sagitta the rectangle has no room for is clamped; with
 * nothing asked, the plain rectangle comes back.
 */
export function shapeRect(widthMm: number, depthMm: number, shape: RectShape): ShapedOutline & { offset: Point } {
  const w = widthMm;
  const d = depthMm;
  const at = shape.roundedAt ?? "all";
  let r = Math.max(0, Math.min(shape.roundedMm ?? 0, Math.min(w, d) / 2 - 1));
  if (r < 5) r = 0;
  let s = Math.max(0, Math.min(shape.bowMm ?? 0, w * 0.45));
  if (s < 5) s = 0;
  const plain: Point[] = [
    { x: -w / 2, y: -d / 2 },
    { x: w / 2, y: -d / 2 },
    { x: w / 2, y: d / 2 },
    { x: -w / 2, y: d / 2 },
  ];
  const finish = (o: ShapedOutline): ShapedOutline & { offset: Point } => {
    // The front as edge 0…
    const n = o.outline.length;
    const f = o.front;
    const turned = f ? [...o.outline.slice(f), ...o.outline.slice(0, f)] : o.outline;
    const sm = f ? o.smooth.map((i) => (i - f + n) % n).sort((x, y) => x - y) : o.smooth;
    // …centred on its box.
    const xs = turned.map((q) => q.x);
    const ys = turned.map((q) => q.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    return { outline: turned.map((q) => roundP({ x: q.x - cx, y: q.y - cy })), smooth: sm, front: 0, offset: roundP({ x: cx, y: cy }) };
  };
  const frontRounded = r > 0 && at !== "back";
  if (!(s > 0 && frontRounded)) {
    let o: ShapedOutline = { outline: plain, smooth: [], front: 0 };
    if (s > 0) o = bowFront(o.outline, 0, s);
    if (r > 0) o = roundCorners(o.outline, r, at, o.front, o.smooth);
    return finish(o);
  }
  // A bow with rounded front corners. The bow's circle: through the two front corners, s proud of
  // the front at the middle, its centre back inside the stage. Each front fillet's centre is r in
  // from its side and R − r from the bow's centre (tangent to both from inside).
  const R = (w * w) / 4 / (2 * s) + s / 2;
  const C = { x: 0, y: -d / 2 + (R - s) };
  const fx = w / 2 - r;
  const fy = C.y - Math.sqrt(Math.max(0, (R - r) ** 2 - fx * fx));
  // No room for it — its tangent on the side would reach the back corner (or its fillet): the front
  // corners stay as the bow left them.
  if (fy > d / 2 - (at === "all" ? r : 0) - 1) {
    let o = bowFront(plain, 0, s);
    if (at === "all") o = roundCorners(o.outline, r, "back", 0, o.smooth);
    return finish(o);
  }
  const pts: Point[] = [];
  const sm: number[] = [];
  const push = (p: Point, isSmooth = false) => {
    if (isSmooth) sm.push(pts.length);
    pts.push(p);
  };
  const arc = (c: Point, radius: number, from: Point, to: Point) => {
    for (const q of arcBetween(c, radius, from, to)) push(q, true);
  };
  const F = { x: fx, y: fy };
  const Fl = { x: -fx, y: fy };
  const k = R / (R - r);
  // Where each fillet touches the bow, and where it touches its side.
  const Tb = { x: C.x + (F.x - C.x) * k, y: C.y + (F.y - C.y) * k };
  const Tbl = { x: C.x + (Fl.x - C.x) * k, y: C.y + (Fl.y - C.y) * k };
  const Ts = { x: w / 2, y: fy };
  const Tsl = { x: -w / 2, y: fy };
  push(Tbl);
  arc(C, R, Tbl, Tb);
  push(Tb);
  arc(F, r, Tb, Ts);
  push(Ts);
  if (at === "all") {
    push({ x: w / 2, y: d / 2 - r });
    arc({ x: w / 2 - r, y: d / 2 - r }, r, { x: w / 2, y: d / 2 - r }, { x: w / 2 - r, y: d / 2 });
    push({ x: w / 2 - r, y: d / 2 });
    push({ x: -w / 2 + r, y: d / 2 });
    arc({ x: -w / 2 + r, y: d / 2 - r }, r, { x: -w / 2 + r, y: d / 2 }, { x: -w / 2, y: d / 2 - r });
    push({ x: -w / 2, y: d / 2 - r });
  } else {
    push({ x: w / 2, y: d / 2 });
    push({ x: -w / 2, y: d / 2 });
  }
  push(Tsl);
  arc(Fl, r, Tsl, Tbl);
  return finish({ outline: pts.map(roundP), smooth: sm, front: 0 });
}

// ── Several outlines of ANY shape, as one ─────────────────────────────────────────────────────
//
// unionOutline is for square stages, and its grid is exact for them. A round stage pushed against a
// rectangular one — a half-round apron in front of a stage, a disc overlapping a catwalk — is not
// square, and refusing it is what made Ctrl+G group them as two stages instead of building one. So
// this is the general union: every outline's edges cut where another's cross or touch them, the
// pieces that lie OUTSIDE every other outline kept (a stretch two outlines share facing the same way
// once; a seam between them — shared facing opposite ways — not at all), and the kept pieces chained
// back into one loop.
//
// A CURVE IS KEPT A CURVE. A round stage is a fine polygon whose corners are `smooth` (StageBuild):
// each corner of the result says whether it is one — it is when the loop arrives at it and leaves it
// along the same input outline, at a corner that outline called smooth. Where the curve meets the
// other outline the loop turns, and that point is a real corner.

/** An outline, and which of its corners a curve runs through (StageBuild.smooth). */
export interface ShapeOutline {
  outline: readonly Point[];
  smooth?: readonly number[];
}

/**
 * The outline of several simple outlines that overlap or touch, as one — and which of its corners
 * are smooth. Null when they do not make ONE piece without a hole (apart, meeting at a single point,
 * or enclosing a hole). `tolMm` is how close two lines must be to count as the same line: stages
 * pushed flush meet within a millimetre or two, never exactly.
 */
export function unionShapes(shapes: readonly ShapeOutline[], tolMm = 2): { outline: Point[]; smooth: number[] } | null {
  type V = { x: number; y: number; smooth: boolean };
  const same = (a: Point, b: Point, d = 0.5) => Math.abs(a.x - b.x) <= d && Math.abs(a.y - b.y) <= d;
  // Each outline wound the same way (positive area), its smooth corners carried on the points.
  const polys: V[][] = [];
  for (const s of shapes) {
    const sm = new Set(s.smooth ?? []);
    const pts: V[] = [];
    s.outline.forEach((q, i) => {
      const v = { x: q.x, y: q.y, smooth: sm.has(i) };
      if (!pts.length || !same(pts[pts.length - 1], v)) pts.push(v);
    });
    while (pts.length > 1 && same(pts[0], pts[pts.length - 1])) pts.pop();
    if (pts.length < 3 || Math.abs(areaOf(pts)) < 1) continue;
    polys.push(areaOf(pts) < 0 ? pts.reverse() : pts);
  }
  if (!polys.length) return null;
  const smoothOf = (loop: V[]) => loop.flatMap((v, i) => (v.smooth ? [i] : []));
  if (polys.length === 1) return { outline: polys[0].map(({ x, y }) => ({ x, y })), smooth: smoothOf(polys[0]) };

  // 1. A corner within the tolerance of another outline's corner IS that corner: shared corners
  //    must be the same point, or the pieces will not chain.
  for (let j = 1; j < polys.length; j++)
    for (const v of polys[j])
      for (let i = 0; i < j; i++) {
        const hit = polys[i].find((w) => same(w, v, tolMm));
        if (hit) {
          v.x = hit.x;
          v.y = hit.y;
          break;
        }
      }

  // 2. Cut every edge where another outline touches it (a corner on it) or crosses it.
  const segD = (p: Point, a: Point, b: Point) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    return { d: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t };
  };
  const cuts: { t: number; p: V }[][][] = polys.map((poly) => poly.map(() => []));
  for (let i = 0; i < polys.length; i++)
    for (let j = 0; j < polys.length; j++) {
      if (i === j) continue;
      const A = polys[i];
      const B = polys[j];
      for (let k = 0; k < A.length; k++) {
        const a = A[k];
        const b = A[(k + 1) % A.length];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        if (L < 1e-6) continue;
        for (const v of B) {
          const { d, t } = segD(v, a, b);
          if (d <= tolMm && t * L > tolMm && (1 - t) * L > tolMm) cuts[i][k].push({ t, p: { x: v.x, y: v.y, smooth: false } });
        }
        // Proper crossings — computed once per pair (i < j) and cut into both edges at the same point.
        if (j < i) continue;
        for (let m = 0; m < B.length; m++) {
          const c = B[m];
          const e = B[(m + 1) % B.length];
          const r = { x: b.x - a.x, y: b.y - a.y };
          const s = { x: e.x - c.x, y: e.y - c.y };
          const den = r.x * s.y - r.y * s.x;
          const M = Math.hypot(s.x, s.y);
          if (Math.abs(den) < 1e-9 * L * M || M < 1e-6) continue;
          const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
          const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
          if (t * L <= tolMm || (1 - t) * L <= tolMm || u * M <= tolMm || (1 - u) * M <= tolMm || t >= 1 || u >= 1) continue;
          const p = { x: a.x + t * r.x, y: a.y + t * r.y, smooth: false };
          cuts[i][k].push({ t, p });
          cuts[j][m].push({ t: u, p: { ...p } });
        }
      }
    }
  type Seg = { a: V; b: V; poly: number; used?: boolean };
  const segs: Seg[] = [];
  polys.forEach((poly, i) =>
    poly.forEach((a, k) => {
      const b = poly[(k + 1) % poly.length];
      const run = [a, ...cuts[i][k].sort((x, y) => x.t - y.t).map((c) => c.p), b];
      const pts = run.filter((p, n) => n === 0 || !same(p, run[n - 1]));
      for (let n = 0; n < pts.length - 1; n++) if (!same(pts[n], pts[n + 1])) segs.push({ a: pts[n], b: pts[n + 1], poly: i });
    }),
  );

  // 3. Keep what is outside every other outline. On another's line: kept once when both run the same
  //    way (a shared outer stretch), dropped from both when they run opposite ways (a seam).
  const inside = (p: Point, poly: readonly Point[]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  const kept = segs.filter((sg) => {
    const m = { x: (sg.a.x + sg.b.x) / 2, y: (sg.a.y + sg.b.y) / 2 };
    const dir = { x: sg.b.x - sg.a.x, y: sg.b.y - sg.a.y };
    for (let j = 0; j < polys.length; j++) {
      if (j === sg.poly) continue;
      const B = polys[j];
      let best = { d: Infinity, k: -1 };
      for (let k = 0; k < B.length; k++) {
        const { d } = segD(m, B[k], B[(k + 1) % B.length]);
        if (d < best.d) best = { d, k };
      }
      if (best.d <= tolMm) {
        const c = B[best.k];
        const e = B[(best.k + 1) % B.length];
        const along = dir.x * (e.x - c.x) + dir.y * (e.y - c.y) > 0;
        if (!along || j < sg.poly) return false;
      } else if (inside(m, B)) return false;
    }
    return true;
  });

  // 4. Chain the kept pieces into loops. Where two leave one point (outlines meeting at a corner),
  //    take the sharpest turn toward the inside: it closes each loop on itself rather than passing
  //    through the point into the other — and two loops mean two pieces, not one stage.
  const key = (p: Point) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
  const from = new Map<string, Seg[]>();
  for (const sg of kept) from.set(key(sg.a), [...(from.get(key(sg.a)) ?? []), sg]);
  const loops: Seg[][] = [];
  for (const start of kept) {
    if (start.used) continue;
    const loop: Seg[] = [];
    let cur: Seg = start;
    for (;;) {
      cur.used = true;
      loop.push(cur);
      if (key(cur.b) === key(start.a)) break; // round again
      const u = { x: cur.b.x - cur.a.x, y: cur.b.y - cur.a.y };
      const next = (from.get(key(cur.b)) ?? [])
        .filter((n) => !n.used)
        .map((n) => {
          const v = { x: n.b.x - n.a.x, y: n.b.y - n.a.y };
          return { n, turn: Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y) };
        })
        .sort((p, q) => q.turn - p.turn)[0]?.n;
      if (!next) return null; // a loose end: the outlines did not close into a loop
      cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  const real = loops.filter((l) => Math.abs(areaOf(l.map((s) => s.a))) > 10_000); // slivers under 1cm² are noise
  if (real.length !== 1 || areaOf(real[0].map((s) => s.a)) <= 0) return null;

  // 5. Its corners: smooth where the loop arrives and leaves along one outline at a corner that
  //    outline called smooth; and the corners that are no corner (a straight run cut and rejoined)
  //    taken out.
  const loop = real[0];
  let out: V[] = loop.map((s, i) => {
    const prev = loop[(i - 1 + loop.length) % loop.length];
    return { x: s.a.x, y: s.a.y, smooth: s.a.smooth && prev.poly === s.poly };
  });
  out = out.filter((v, i) => {
    if (v.smooth) return true;
    const a = out[(i - 1 + out.length) % out.length];
    const b = out[(i + 1) % out.length];
    const u = { x: v.x - a.x, y: v.y - a.y };
    const w = { x: b.x - v.x, y: b.y - v.y };
    const lu = Math.hypot(u.x, u.y);
    const lw = Math.hypot(w.x, w.y);
    if (lu < 0.5 || lw < 0.5) return false;
    return Math.abs(u.x * w.y - u.y * w.x) / (lu * lw) > 1e-4 || u.x * w.x + u.y * w.y < 0;
  });
  if (out.length < 3) return null;
  return { outline: out.map(({ x, y }) => ({ x, y })), smooth: smoothOf(out) };
}

// ── Editing an outline that already exists — the corners and sides of a drawn stage, dragged.
//
// Every one keeps the outline the shape it was: a corner moved takes the square sides that meet it
// along (a flat side's far end follows in y, an upright one's in x — in the frame of `refDeg`, the
// stage's own front), a side pushed moves straight out along its normal. Splitting a side puts two
// corners on top of each other in its middle, which is what lets half of it be pushed out into an L;
// cleanOutline takes away what is left over (corners on a straight line, sides of no length).

const rotP = (p: Point, d: number): Point => {
  const r = rad(d);
  return { x: p.x * Math.cos(r) - p.y * Math.sin(r), y: p.x * Math.sin(r) + p.y * Math.cos(r) };
};
const areaOf = (poly: readonly Point[]) =>
  poly.reduce((s, p, i) => {
    const q = poly[(i + 1) % poly.length];
    return s + p.x * q.y - q.x * p.y;
  }, 0) / 2;
type SideKind = "none" | "flat" | "upright" | "angled";
const sideKind = (a: Point, b: Point): SideKind =>
  Math.hypot(b.x - a.x, b.y - a.y) < 1 ? "none" : Math.abs(b.y - a.y) < 1 ? "flat" : Math.abs(b.x - a.x) < 1 ? "upright" : "angled";

/** Corner `i` dragged to `to`. THE CORNER ALONE MOVES, by default: the two sides meeting it lean to
 *  follow it and nothing else on the outline shifts — which is what pulling one point of a shape
 *  means, and what the designer asked for after the first version moved whole sides along with it.
 *  With `keepSquare` (Shift), the square sides meeting the corner stay square instead: their far
 *  corners follow, so a rectangle stays a rectangle while one corner is pulled. Either way, with
 *  `snapLength` the lengths along a flat or upright side are pulled to what the decks build. */
export function moveVertex(
  poly: readonly Point[],
  i: number,
  to: Point,
  refDeg: number,
  snapLength?: (mm: number) => number,
  keepSquare = false,
): Point[] {
  const n = poly.length;
  const L = poly.map((p) => rotP(p, -refDeg));
  let t = rotP(to, -refDeg);
  const ip = (i - 1 + n) % n;
  const inx = (i + 1) % n;
  const kp = sideKind(L[ip], L[i]);
  const kn = sideKind(L[i], L[inx]);
  if (snapLength) {
    const pull = (from: number, v: number) => from + Math.sign(v - from || 1) * snapLength(Math.abs(v - from));
    for (const [k, j] of [
      [kp, ip],
      [kn, inx],
    ] as const) {
      if (k === "flat") t = { ...t, x: pull(L[j].x, t.x) };
      else if (k === "upright") t = { ...t, y: pull(L[j].y, t.y) };
    }
  }
  const out = L.map((p) => ({ ...p }));
  out[i] = t;
  if (keepSquare)
    for (const [k, j] of [
      [kp, ip],
      [kn, inx],
    ] as const) {
      if (k === "flat") out[j] = { ...out[j], y: t.y };
      else if (k === "upright") out[j] = { ...out[j], x: t.x };
    }
  return out.map((p) => {
    const q = rotP(p, refDeg);
    return { x: Math.round(q.x), y: Math.round(q.y) };
  });
}

/** Side `i` pushed `d` mm straight out (negative: in). With `snapLength`, the push is adjusted so a
 *  side square to it comes out a length the decks build. */
export function pushSide(poly: readonly Point[], i: number, d: number, snapLength?: (mm: number) => number): Point[] {
  const n = poly.length;
  const a = poly[i];
  const b = poly[(i + 1) % n];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const s = areaOf(poly) >= 0 ? 1 : -1;
  const nrm = { x: (s * (b.y - a.y)) / len, y: (-s * (b.x - a.x)) / len };
  if (snapLength) {
    for (const [p, q] of [
      [poly[(i - 1 + n) % n], a],
      [poly[(i + 2) % n], b],
    ]) {
      const sl = Math.hypot(q.x - p.x, q.y - p.y);
      if (sl < 1) continue;
      const dot = ((q.x - p.x) * nrm.x + (q.y - p.y) * nrm.y) / sl;
      if (Math.abs(Math.abs(dot) - 1) > 0.01 || sl + d * dot <= 0) continue;
      d = (snapLength(sl + d * dot) - sl) / dot;
      break;
    }
  }
  const j = (i + 1) % n;
  return poly.map((v, k) => (k === i || k === j ? { x: Math.round(v.x + nrm.x * d), y: Math.round(v.y + nrm.y * d) } : { ...v }));
}

/** Side `i` split in its middle: two corners on one point, so either half can be pushed on its own.
 *  The front stays the side it was (its first half, when it is the one split). */
export function splitSide(poly: readonly Point[], front: number, i: number): { outline: Point[]; front: number } {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  const m = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
  const outline = [...poly.slice(0, i + 1), m, { ...m }, ...poly.slice(i + 1)];
  return { outline, front: front > i ? front + 2 : front };
}

/** Corner `k` taken away — its two sides become one. Never below a triangle. */
export function removeVertex(poly: readonly Point[], front: number, k: number): { outline: Point[]; front: number } {
  const n = poly.length;
  if (n <= 3) return { outline: [...poly], front };
  const idx = (j: number) => (j < k ? j : j - 1);
  const prev = (k - 1 + n) % n;
  const f = front === k || front === prev ? idx(prev) : idx(front);
  return { outline: poly.filter((_, j) => j !== k), front: f };
}

/** An edited outline put straight: corners on top of each other, and corners on a straight line,
 *  taken away. */
export function cleanOutline(poly: readonly Point[], front: number): { outline: Point[]; front: number } {
  let cur = { outline: [...poly], front };
  for (let guard = 0; guard < 64; guard++) {
    const p = cur.outline;
    const n = p.length;
    if (n <= 3) break;
    const k = p.findIndex((v, j) => {
      const a = p[(j - 1 + n) % n];
      const b = p[(j + 1) % n];
      const l1 = Math.hypot(v.x - a.x, v.y - a.y);
      if (l1 < 1) return true;
      const l2 = Math.hypot(b.x - v.x, b.y - v.y);
      if (l2 < 1) return false; // the next corner is the duplicate; it goes on its own turn
      const cross = ((v.x - a.x) * (b.y - v.y) - (v.y - a.y) * (b.x - v.x)) / (l1 * l2);
      const dot = ((v.x - a.x) * (b.x - v.x) + (v.y - a.y) * (b.y - v.y)) / (l1 * l2);
      return Math.abs(cross) < 1e-3 && dot > 0;
    });
    if (k < 0) break;
    cur = removeVertex(p, cur.front, k);
  }
  return cur;
}

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const o = { x: 0, y: 0 };
  const p1 = constrainNext(o, { x: 3040, y: 130 }, 0);
  assert(p1.x === 3000 && p1.y === 0, "a side drawn nearly flat is flat, and a whole number of 10cm");
  const p2 = constrainNext(o, { x: 1480, y: 1530 }, 0);
  assert(Math.abs(p2.x - p2.y) <= 1, "…one drawn near 45° is 45°");
  const p3 = constrainNext(o, { x: 3040, y: 130 }, 0, { free: true });
  assert(p3.x === 3040 && p3.y === 130, "Alt draws it as pointed");
  const p4 = constrainNext(o, { x: 100, y: 5 }, 0, { typedMm: 4250 });
  assert(p4.x === 4250 && p4.y === 0, "a typed length is laid along the direction pointed");
  const turned = constrainNext(o, { x: 0, y: 2000 }, 30);
  const a = (Math.atan2(turned.y, turned.x) * 180) / Math.PI;
  assert(Math.abs(a - 120) < 0.1 || Math.abs(a - 75) < 0.1, "…held to 45° steps from the first side, not the page");

  const skew = [
    { x: 0, y: 0 },
    { x: 6000, y: 0 },
    { x: 6030, y: 4000 },
    { x: 10, y: 3980 },
  ];
  const sq = squareUp(skew);
  assert(sq[1].y === sq[0].y && sq[2].x === sq[1].x && sq[3].y === sq[2].y && sq[0].x === sq[3].x, "a nearly-square outline is made square");
  const diamond = [
    { x: 0, y: 0 },
    { x: 2000, y: 2000 },
    { x: 0, y: 4000 },
    { x: -2000, y: 2000 },
  ];
  assert(squareUp(diamond)[1].x === 2000, "…a meant 45° is left alone");

  const bow = [
    { x: 0, y: 0 },
    { x: 2000, y: 2000 },
    { x: 2000, y: 0 },
    { x: 0, y: 2000 },
  ];
  assert(selfIntersects(bow) && !selfIntersects(skew), "a bow-tie crosses itself; a rectangle does not");

  // Two 4×2 stages 700mm apart and 150mm out of line are pushed together and lined up.
  const moved = stickBoxes([
    { id: "a", centre: { x: 0, y: 0 }, rotation: 0, widthMm: 6000, depthMm: 4000 },
    { id: "b", centre: { x: 5700, y: 150 }, rotation: 0, widthMm: 4000, depthMm: 2000 },
  ]);
  const b = moved.get("b")!;
  assert(b.x === 5000 && (b.y === -1000 || b.y === 1000 || b.y === 0), "a stage beside another is pushed flush and lined up");
  const below = stickBoxes([
    { id: "a", centre: { x: 0, y: 0 }, rotation: 0, widthMm: 6000, depthMm: 4000 },
    { id: "c", centre: { x: 100, y: 3800 }, rotation: 0, widthMm: 6000, depthMm: 2000 },
  ]).get("c")!;
  assert(below.x === 0 && below.y === 3000, "…and one in front is pushed back against it and centred");
  const angled = stickBoxes([
    { id: "a", centre: { x: 0, y: 0 }, rotation: 0, widthMm: 6000, depthMm: 4000 },
    { id: "d", centre: { x: 9000, y: 0 }, rotation: 30, widthMm: 2000, depthMm: 1000 },
  ]);
  assert(!angled.has("d"), "a stage at 30° to the others is left where it is");

  const L = unionOutline([
    [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 2000 },
      { x: 0, y: 2000 },
    ],
    [
      { x: 0, y: 2000 },
      { x: 2000, y: 2000 },
      { x: 2000, y: 4000 },
      { x: 0, y: 4000 },
    ],
  ]);
  assert(!!L && L.length === 6, "two touching rectangles become one L of six corners");
  assert(
    unionOutline([
      [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 1000 },
        { x: 0, y: 1000 },
      ],
      [
        { x: 3000, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 1000 },
        { x: 3000, y: 1000 },
      ],
    ]) === null,
    "two stages apart are not one",
  );
  // Editing: a 6×4 split along its back and half of it pushed out is an L; its corner dragged keeps
  // it square; cleaned, a rectangle with a corner in the middle of a side is four corners again.
  const box = [
    { x: 0, y: 0 },
    { x: 6000, y: 0 },
    { x: 6000, y: 4000 },
    { x: 0, y: 4000 },
  ];
  const split = splitSide(box, 0, 2);
  assert(split.outline.length === 6 && split.front === 0, "a split side is two corners on its middle, and the front stays put");
  const ell = pushSide(split.outline, 2, 2000);
  assert(ell[2].y === 6000 && ell[3].y === 6000 && ell[4].y === 4000 && !selfIntersects(ell), "…so half of it pushes out into an L");
  const sheet = (mm: number) => Math.round(mm / 1220) * 1220;
  const pushed = pushSide(box, 1, 900, sheet);
  assert(pushed[1].x === 7320 && pushed[2].x === 7320, "a side pushed out lands where the next side is a length the decks build");
  const dragged = moveVertex(ell, 3, { x: 2600, y: 6400 }, 0);
  assert(dragged[3].x === 2600 && dragged[3].y === 6400 && dragged[2].y === 6000 && dragged[4].x === 3000, "a dragged corner moves alone — its neighbours stay where they were");
  const squared = moveVertex(ell, 3, { x: 2600, y: 6400 }, 0, undefined, true);
  assert(squared[3].x === 2600 && squared[3].y === 6400 && squared[2].y === 6400 && squared[4].x === 2600, "…and with Shift keeps both its square sides square");
  const lumpy = cleanOutline(splitSide(box, 2, 0).outline, 4);
  assert(lumpy.outline.length === 4 && lumpy.front === 2, "an unpushed split cleans away, and the front is still the same side");
  const fewer = removeVertex(ell, 0, 3);
  assert(fewer.outline.length === 5 && fewer.front === 0, "a corner taken away joins its two sides");

  // ANY SHAPE: the general union, curves kept.
  {
    const rect = (x: number, y: number, w: number, h: number) => [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
    const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
    const overlap = unionShapes([{ outline: rect(0, 0, 4000, 4000) }, { outline: rect(2000, 2000, 4000, 4000) }]);
    assert(!!overlap && overlap.outline.length === 8 && near(Math.abs(areaOf(overlap.outline)), 28e6, 1), "two overlapping squares are one outline of eight corners");
    // A half-round apron flush against the front of a 6×4: its chord on the stage's edge, its arc out.
    const arc = (cx: number, cy: number, r: number, from: number, to: number, n: number) =>
      Array.from({ length: n + 1 }, (_, k) => {
        const th = from + ((to - from) * k) / n;
        return { x: Math.round(cx + r * Math.cos(th)), y: Math.round(cy + r * Math.sin(th)) };
      });
    const half = arc(3000, 4000, 1200, 0, Math.PI, 16); // (4200,4000) round through (3000,5200) to (1800,4000)
    const apron = unionShapes([
      { outline: rect(0, 0, 6000, 4000) },
      { outline: half, smooth: half.map((_, k) => k).filter((k) => k > 0 && k < 16) },
    ]);
    assert(!!apron, "a half-round flush against a rectangle is one stage");
    assert(apron!.smooth.length === 15, "…its curve still a curve: every corner along the arc smooth");
    assert(apron!.outline.length === 4 + 17, "…the rectangle's corners, and the arc's two ends where it meets the front");
    const ends = apron!.outline.filter((q, i) => !apron!.smooth.includes(i) && q.y === 4000 && q.x > 0 && q.x < 6000);
    assert(ends.length === 2, "…which are real corners, not smooth ones");
    // A disc overlapping the edge: what is inside the rectangle is gone, the crossings are corners.
    const discPts = arc(3000, 4000, 1000, 0, 2 * Math.PI, 32).slice(0, 32);
    const disc = unionShapes([{ outline: rect(0, 0, 6000, 4000) }, { outline: discPts, smooth: discPts.map((_, k) => k) }]);
    assert(!!disc && disc.outline.every((q) => q.y <= 4000 + 1001), "a disc over the front edge merges");
    assert(disc!.outline.filter((q, i) => !disc!.smooth.includes(i)).length === 6, "…four rectangle corners and the two crossings");
    // Apart, meeting at a corner, or round a hole: not one stage.
    assert(unionShapes([{ outline: rect(0, 0, 2000, 2000) }, { outline: rect(5000, 0, 2000, 2000) }]) === null, "two stages apart are not one");
    assert(unionShapes([{ outline: rect(0, 0, 2000, 2000) }, { outline: rect(2000, 2000, 2000, 2000) }]) === null, "…nor two that meet only at a corner");
    const frame = [rect(0, 0, 6000, 1000), rect(0, 5000, 6000, 1000), rect(0, 0, 1000, 6000), rect(5000, 0, 1000, 6000)].map((outline) => ({ outline }));
    assert(unionShapes(frame) === null, "…nor four round a hole");
    // Flush within a couple of millimetres, as stages pushed together are.
    const flush = unionShapes([{ outline: rect(0, 0, 3000, 2000) }, { outline: rect(3001, 0, 3000, 2000) }]);
    assert(!!flush && flush.outline.length === 4, "stages flush to a millimetre are one rectangle");
  }

  // ROUND AREAS, as the area tool draws them.
  {
    const disc = ellipseArea({ x: 5000, y: 5000 }, 4000, 4000);
    assert(disc.smooth.length === disc.outline.length && disc.outline.length >= 24, "a disc is a fine polygon, every corner smooth");
    assert(Math.abs(Math.abs(areaOf(disc.outline)) - Math.PI * 4e6) < 0.01 * Math.PI * 4e6, "…of the disc's area");
    const tilted = ellipseArea({ x: 0, y: 0 }, 6000, 2000, 90);
    const txs = tilted.outline.map((q) => q.x);
    assert(Math.max(...txs) - Math.min(...txs) < 2100, "an oval turned a quarter stands on its end");
    const half = halfRoundArea({ x: 0, y: 0 }, { x: 4000, y: 0 }, 1);
    assert(half.outline[0].x === 0 && half.outline[half.outline.length - 1].x === 4000, "a half-round starts and ends on its chord");
    assert(half.smooth.length === half.outline.length - 2, "…its two chord ends real corners, the arc smooth");
    assert(half.outline.every((q) => q.y >= -1) && half.outline.some((q) => Math.abs(q.y - 2000) <= 1), "…bulging to the side asked, its apex a corner, two metres out");
    assert(halfRoundArea({ x: 0, y: 0 }, { x: 4000, y: 0 }, -1).outline.every((q) => q.y <= 1), "…or to the other side");
    assert(Math.abs(Math.abs(areaOf(half.outline)) - (Math.PI * 4e6) / 2) < 0.01 * Math.PI * 4e6, "…half a disc of area");
  }

  // ROUNDED CORNERS AND A BOWED FRONT.
  {
    const box6: Point[] = [
      { x: -3000, y: -2000 },
      { x: 3000, y: -2000 },
      { x: 3000, y: 2000 },
      { x: -3000, y: 2000 },
    ];
    const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
    const turnAt = (o: readonly Point[], i: number) => {
      const n = o.length;
      const a = o[(i - 1 + n) % n];
      const c = o[i];
      const b = o[(i + 1) % n];
      const u = Math.atan2(c.y - a.y, c.x - a.x);
      const v = Math.atan2(b.y - c.y, b.x - c.x);
      const d = Math.abs(v - u) % (2 * Math.PI);
      return Math.min(d, 2 * Math.PI - d);
    };
    // Every corner rounded at 1.2m: four arcs (1885mm each — eight chords, seven smooth corners)
    // between real tangent corners, so the rim is eight sides and the front is still a side of its own.
    const all = roundCorners(box6, 1200, "all", 0);
    assert(all.outline.length === 36 && all.smooth.length === 28, "a 6×4 rounded at 1.2m is four arcs of seven smooth corners, each between two real tangent corners");
    assert(all.outline[all.front].x === -1800 && all.outline[all.front].y === -2000 && all.outline[(all.front + 1) % 36].x === 1800, "…and its front is the straight run between the two front tangent points");
    assert(all.outline.every((q) => Math.abs(q.x) <= 3000 && Math.abs(q.y) <= 2000), "…inside the rectangle it was");
    assert(all.smooth.every((i) => turnAt(all.outline, i) < rad(15)), "…every smooth corner turning only a chord's worth");
    const tangent = all.outline.findIndex((q, i) => !all.smooth.includes(i) && q.x === -1800 && q.y === -2000);
    assert(tangent >= 0 && turnAt(all.outline, tangent) < rad(8), "…and a tangent point is a real corner that barely turns");
    assert(Math.abs(areaOf(all.outline)) < 24e6 && Math.abs(areaOf(all.outline)) > 24e6 - 4 * (1 - Math.PI / 4) * 1200 * 1200 - 60_000, "…losing only the four corners' worth of floor");
    // A radius the corner has no room for gives way to half the shorter side.
    const clamped = roundCorners(box6, 5000, "all", 0);
    assert(clamped.outline.every((q) => Math.abs(q.y) <= 2000) && clamped.outline.some((q) => q.x === -1000 && q.y === -2000), "a 5m radius on a 4m-deep stage is clamped to 2m — tangent points at the middle of the short sides");
    // Front corners only, back corners only.
    const fr = roundCorners(box6, 600, "front", 0);
    assert(fr.smooth.length === 6 && fr.outline.some((q) => q.x === 3000 && q.y === 2000) && fr.outline.some((q) => q.x === -3000 && q.y === 2000), "front corners only: the back corners are left square");
    const bk = roundCorners(box6, 600, "back", 0);
    assert(bk.outline[bk.front].x === -3000 && bk.outline[bk.front].y === -2000 && bk.outline[(bk.front + 1) % bk.outline.length].x === 3000, "back corners only: the front is the whole front edge still");
    assert(roundCorners(box6, 0, "all", 0).outline.length === 4, "no radius, no change");
    // A bowed front: an arc through the two front corners, 30cm proud at the middle.
    const bowed = bowFront(box6, 0, 300);
    assert(bowed.front === 0 && bowed.outline[0].x === -3000 && bowed.outline[0].y === -2000, "a bow keeps the front's start as a real corner and the first chord as the front");
    assert(near(Math.min(...bowed.outline.map((q) => q.y)), -2300, 2), "…standing 30cm proud of the line at its middle");
    assert(bowed.smooth.length === bowed.outline.length - 4 && bowed.smooth.every((i) => i >= 1 && i <= bowed.smooth.length), "…its chords' corners smooth, the four rectangle corners real");
    assert(Math.abs(areaOf(bowed.outline)) > 24e6 + 1.1e6 && Math.abs(areaOf(bowed.outline)) < 24e6 + 1.3e6, "…adding about two thirds of 6m × 0.3m of floor");
    assert(bowFront([...box6].reverse(), 2, 300).outline.some((q) => q.y < -2250), "…bulging outward whichever way round the corners run");
    // The composition the fill tool uses: a rounded rectangle with a bow, as ONE line.
    const both = shapeRect(6000, 4000, { roundedMm: 600, roundedAt: "all", bowMm: 300 });
    assert(both.front === 0 && both.offset.x === 0 && both.offset.y === -150, "a bowed rounded rectangle has its front as edge 0 and stands 15cm forward of the plain one");
    const bys = both.outline.map((q) => q.y);
    assert(near(Math.min(...bys), -2150, 2) && near(Math.max(...bys), 2150, 2), "…centred on its own box, which the bow made 4.3m deep");
    const kinks = both.outline.map((_, i) => i).filter((i) => !both.smooth.includes(i)).map((i) => turnAt(both.outline, i));
    assert(kinks.length === 8 && kinks.every((k) => k < rad(15)), "…every real corner a tangent point turning no more than a chord does: the front fillets are struck against the bow's circle, not its chord");
    const plainR = shapeRect(6000, 4000, { roundedMm: 1200 });
    assert(plainR.outline.length === 36 && plainR.offset.y === 0 && plainR.front === 0, "rounding alone is roundCorners, front first");
    const plainB = shapeRect(6000, 4000, { bowMm: 300 });
    assert(plainB.smooth.length === bowed.smooth.length && plainB.offset.y === -150, "a bow alone is bowFront, recentred");
    assert(shapeRect(6000, 4000, {}).outline.length === 4 && shapeRect(6000, 4000, { roundedMm: 0, bowMm: 0 }).outline.length === 4, "nothing asked, the plain rectangle");
    const backOnly = shapeRect(6000, 4000, { roundedMm: 600, roundedAt: "back", bowMm: 300 });
    assert(backOnly.outline[0].x === -3000 && backOnly.outline.filter((q, i) => !backOnly.smooth.includes(i)).length === 6, "a bow with the back corners rounded: the bow's two ends, and two tangent points per back corner");
  }
  console.log("stage-draw self-check passed");
}
