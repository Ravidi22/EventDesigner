// Drawing stages CLEANLY — the geometry behind the area tool's straight lines, and behind putting
// several stages together.
//
// A stage is nearly always a rectangle, an L or a T: straight sides at right angles. A pointer is not
// that precise, and a side 2° off square is not a cosmetic problem here — the fill lays its rows from
// the front edge, so a skewed side leaves a sliver of stage no deck fits and a ragged build. So:
//
//   • while drawing, each side is held to the room's own 45° grid — the first side also along or
//     square to a wall that genuinely stands at an angle beside it (firstSideAngles), every later
//     side also along or square to the FIRST side (laterSideAngles) — so a stage laid along an
//     angled wall turns square to the wall or straight down the room, whichever the pointer says;
//     and its length to whole 10cm (Alt frees both, for the stage that really is odd);
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

export const DRAW_ANGLE_STEP_DEG = 45;
export const DRAW_LENGTH_STEP_MM = 100;
/** How far off square a wall may stand and still be read as SQUARE. A surveyed wall is seldom exactly
 *  on the room's axes, and a stage drawn against one 3° off is still meant square to the room — the
 *  fill, the decks and every other stage in the hall are. Past this the wall is architecture (a
 *  chamfer, a wing) and a stage may follow it. squareUp's tolerance, for the same reason. */
export const WALL_SQUARE_TOL_DEG = 6;

export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;

/** A set of directions a side may be held to: every `stepDeg` from `refDeg`. */
export interface DrawAngles {
  refDeg: number;
  stepDeg: number;
}

/** The frame a wall standing at `wallDeg` lends a stage drawn beside it: its own line folded into a
 *  quarter turn (a wall at 120° lends 30°) — or nothing (null) when there is no wall, or the wall is
 *  within WALL_SQUARE_TOL_DEG of square, in which case the room's own frame is the one meant. */
export function wallFrameDeg(wallDeg: number | null): number | null {
  if (wallDeg === null) return null;
  const w = ((wallDeg % 90) + 90) % 90;
  return Math.min(w, 90 - w) <= WALL_SQUARE_TOL_DEG ? null : w;
}

/** The directions the FIRST side of a stage may take, clicked beside a wall at `wallDeg` (null = no
 *  wall near): always the room's own 45° grid; and, when the wall genuinely stands at an angle, ALONG
 *  that wall or square to it as well — the pointer picks, nearest wins. Only the wall's line and its
 *  square, not its diagonals: a stage against an angled wall is square to it, and the room's grid
 *  already has every diagonal a designer means. The first version held the first side to the nearest
 *  wall ALONE, so a click near a 30° wall could draw nothing but 30/75/120° sides, and a wall 3° off
 *  square tilted the whole stage 3° (2026-10-31, the user: an angled or near-angled wall "forces me to
 *  go on weird angles"). A wall within the tolerance adds nothing — offering 0° and 3° side by side
 *  cuts the pointer's band into slivers — and the odd stage that really should hug it is Alt's. */
export function firstSideAngles(wallDeg: number | null): DrawAngles[] {
  const room: DrawAngles = { refDeg: 0, stepDeg: DRAW_ANGLE_STEP_DEG };
  const w = wallFrameDeg(wallDeg);
  return w === null ? [room] : [room, { refDeg: w, stepDeg: 90 }];
}

/** The directions every side AFTER the first may take, the first side standing at `firstDeg`: the
 *  room's 45° grid, and along or square to the first side — so a stage laid along an angled wall
 *  turns square to the wall OR straight down the room, as the pointer says (the trapezoid against
 *  an angled wall: along the wall, then down the room's own wall). The first version held every
 *  later side to 45° steps from the first side ALONE, so along a 60° wall "straight down" could only
 *  be 105° (2026-10-31, the user: "it blocks me from doing a straight line — it forces me by its
 *  angle"). A first side on the room's grid adds nothing new. */
export function laterSideAngles(firstDeg: number): DrawAngles[] {
  return [
    { refDeg: 0, stepDeg: DRAW_ANGLE_STEP_DEG },
    { refDeg: firstDeg, stepDeg: 90 },
  ];
}

/** `a` (degrees) held to the nearest direction any of `angles` offers; an exact tie goes to the
 *  earlier set — the room's grid before a wall's. */
export function lockAngle(a: number, angles: readonly DrawAngles[]): number {
  let best = a;
  let bestErr = Infinity;
  for (const { refDeg, stepDeg } of angles) {
    const cand = refDeg + Math.round((a - refDeg) / stepDeg) * stepDeg;
    const err = Math.abs(cand - a);
    if (err < bestErr - 1e-9) {
      best = cand;
      bestErr = err;
    }
  }
  return best;
}

/** The next corner of an outline being drawn: from `anchor` towards `raw`, its direction held to
 *  45° steps from `ref` (a number — a side already drawn, a level's stage) or to the nearest of the
 *  direction sets given (the first side's, from firstSideAngles), and its length to whole
 *  DRAW_LENGTH_STEP_MM. `typedMm` replaces the length (a length typed in). Free when `free` (Alt). */
export function constrainNext(
  anchor: Point,
  raw: Point,
  ref: number | readonly DrawAngles[],
  opts: { free?: boolean; typedMm?: number; snapLength?: (mm: number) => number } = {},
): Point {
  const dx = raw.x - anchor.x;
  const dy = raw.y - anchor.y;
  const dist = Math.hypot(dx, dy);
  if (opts.free && !opts.typedMm) return { x: Math.round(raw.x), y: Math.round(raw.y) };
  if (dist < 1e-6 && !opts.typedMm) return { ...anchor };
  let a = deg(Math.atan2(dy, dx));
  if (!opts.free) a = lockAngle(a, typeof ref === "number" ? [{ refDeg: ref, stepDeg: DRAW_ANGLE_STEP_DEG }] : ref);
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
 *  against a 0° one); the rest are returned where they were. Returns each moved stage's new centre.
 *  For RECTANGLES only — each item is read as the box it is: the box of an L holds its bite, and a
 *  deck standing there was thrown out past the box's far edge. Stages of any other shape are pushed
 *  by their outlines, and sorted by angle first (lib/design-document/stage.ts pushTogether,
 *  stickTogether). */
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
export const areaOf = (poly: readonly Point[]) =>
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

/** Side `i` made exactly `lengthMm` long — a TYPED length, beside dragging. One end of it moves along
 *  the side, and the side beyond that end moves with it unchanged, so a square corner stays square
 *  (a rectangle given a new width is still a rectangle). `keep` is the end that stays: the side's
 *  first corner ("start") or its second ("end"). */
export function setSideLength(poly: readonly Point[], i: number, lengthMm: number, keep: "start" | "end" = "start"): Point[] {
  const n = poly.length;
  const a = poly[i];
  const b = poly[(i + 1) % n];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1 || !(lengthMm >= 1)) return [...poly];
  const d = keep === "start" ? lengthMm - len : len - lengthMm;
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const end = keep === "start" ? (i + 1) % n : i;
  // A triangle has no side beyond to carry: its far corner alone moves.
  const moved = n > 3 ? [end, keep === "start" ? (i + 2) % n : (i - 1 + n) % n] : [end];
  return poly.map((v, k) => (moved.includes(k) ? { x: Math.round(v.x + u.x * d), y: Math.round(v.y + u.y * d) } : { ...v }));
}

/** A side's length as TYPED into its box (QA 2026-11-20, ST-4). The box is in centimetres — the unit
 *  it shows, and the one the area tool's typed lengths take — except for a number that cannot be
 *  meant as centimetres of a stage side: one under 10 (no side is shorter than 10cm) or a decimal
 *  under 100 ("5.5", "12.20" — nobody types a fraction of a centimetre of stage). That is METRES, the
 *  unit the side's own figure is written in on the plan, so "600", "6" and "6.00" are all six metres.
 *  `metres` says which reading was taken, for the box to show its unit as it is typed; null when the
 *  text is no positive number. */
export function typedSideLength(text: string): { mm: number; metres: boolean } | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d*\.?\d*$/.test(t) || !/\d/.test(t)) return null;
  const v = Number(t);
  if (!(v > 0)) return null;
  const metres = v < 10 || (t.includes(".") && v < 100);
  return { mm: Math.round(metres ? v * 1000 : v * 10), metres };
}

const dirDeg = (a: Point, b: Point) => deg(Math.atan2(b.y - a.y, b.x - a.x));
/** A turn folded into (−180, 180]. */
const foldDeg = (d: number) => {
  const f = ((((d + 180) % 360) + 360) % 360) - 180;
  return f === -180 ? 180 : f;
};

/** The angle INSIDE the outline at corner `k`, in degrees: 90 at a square corner, under 90 where
 *  the corner is sharp, over 180 where it is a notch, 180 on a straight line. Read off the two sides
 *  meeting there, whichever way round the outline runs. */
export function cornerAngle(poly: readonly Point[], k: number): number {
  const n = poly.length;
  const p = poly[(k - 1 + n) % n];
  const c = poly[k];
  const q = poly[(k + 1) % n];
  const s = areaOf(poly) >= 0 ? 1 : -1;
  const turn = foldDeg(dirDeg(c, q) - dirDeg(p, c));
  const inside = 180 - s * turn;
  return inside < 0 ? inside + 360 : inside;
}

/** Corner `k` made exactly `angleDeg` inside — a TYPED angle, beside dragging the corner. ONE of the
 *  two sides meeting the corner turns about it, its length kept, and only the far corner of that side
 *  moves (the side beyond leans to meet it, as it does when a corner is dragged): `turn: "next"` turns
 *  the side LEAVING the corner, `"prev"` the side ARRIVING at it — the caller keeps the front, or a
 *  side against a wall, where it is by turning the other one. An angle that is not between 0 and 360
 *  leaves the outline alone.
 *
 *  `slideOn`: the line of a wall the far corner of that side stands on. The corner then SLIDES along
 *  it — it goes where the turned side meets the wall, the side taking the length that needs — rather
 *  than lift off it and tilt the side beyond (QA 2026-11-20, ST-7: a 6×4 stage against a wall typed
 *  100° at a front corner took its back corner 61 mm off the wall). A turned side that runs along the
 *  wall, or would meet it absurdly far off, keeps its length as before. */
export function setCornerAngle(poly: readonly Point[], k: number, angleDeg: number, turn: "next" | "prev" = "next", slideOn?: readonly [Point, Point]): Point[] {
  const n = poly.length;
  if (n < 3 || !(angleDeg > 0 && angleDeg < 360)) return [...poly];
  const ip = (k - 1 + n) % n;
  const inx = (k + 1) % n;
  const p = poly[ip];
  const c = poly[k];
  const q = poly[inx];
  const s = areaOf(poly) >= 0 ? 1 : -1;
  const want = s * (180 - angleDeg);
  const out = poly.map((v) => ({ ...v }));
  /** How far from the corner, along (ux, uy), the far corner goes: onto the wall it stood on, else
   *  as far as it was. */
  const reach = (ux: number, uy: number, len: number) => {
    if (!slideOn) return len;
    const [a, b] = slideOn;
    const wx = b.x - a.x;
    const wy = b.y - a.y;
    const den = ux * wy - uy * wx;
    if (Math.abs(den) < 1e-6 * Math.hypot(wx, wy)) return len;
    const t = ((a.x - c.x) * wy - (a.y - c.y) * wx) / den;
    return t > 1 && t < len * 10 ? t : len;
  };
  if (turn === "next") {
    const len = Math.hypot(q.x - c.x, q.y - c.y);
    if (len < 1) return [...poly];
    const d = rad(dirDeg(p, c) + want);
    const r = reach(Math.cos(d), Math.sin(d), len);
    out[inx] = { x: Math.round(c.x + Math.cos(d) * r), y: Math.round(c.y + Math.sin(d) * r) };
  } else {
    const len = Math.hypot(c.x - p.x, c.y - p.y);
    if (len < 1) return [...poly];
    const d = rad(dirDeg(c, q) - want);
    const r = reach(-Math.cos(d), -Math.sin(d), len);
    out[ip] = { x: Math.round(c.x - Math.cos(d) * r), y: Math.round(c.y - Math.sin(d) * r) };
  }
  return out;
}

/** Side `i` split in its middle: two corners on one point, so either half can be pushed on its own.
 *  The front stays the side it was (its first half, when it is the one split). */
export function splitSide(poly: readonly Point[], front: number, i: number, t = 0.5): { outline: Point[]; front: number } {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  // At `t` along the side — where it was double-clicked (connected drawings §5.1); its middle by default.
  const m = { x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t) };
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
