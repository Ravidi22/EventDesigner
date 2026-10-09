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
  console.log("stage-draw self-check passed");
}
