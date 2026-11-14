// FLOWERS THAT FOLLOW A SHAPE — where the heads go on any outline.
//
// An arrangement used to be a round thing or a strip: a dome, a cushion, a runner. Drawn as a ring,
// an arc, a ח, a spiral or a line it fell back to an outline with its name in it (the user,
// 2026-11-13: "more shapes of סידורי פרחים like spiral, ring and more — the shapes I have should
// behave like bar… flowers can be in all shapes: on a wall, on an עמוד, on a canopy, falling off a
// table"). A bar is laid along whatever band it is drawn as (./bar-draw.ts); this module does the same
// for flowers, for ANY shape: it says where a head stands so the shape is COVERED.
//
// One rule for every outline:
//   1. the RIM ROW — the outline walked a head apart, each head a little inside it. A band thinner
//      than a head gets one row down its middle (the two sides' rows fall on each other and one is
//      dropped): a garland. Lines only (an open outline) are walked along the lines themselves.
//   2. the INSIDE — a jittered honeycomb a head apart, wherever there is room behind the rim row.
// Every spot knows how DEEP it lies in the shape and which way is OUT, which is all the room needs
// to lift it (lib/scene/flower-cover.ts): the middle of a shape stands highest, a head near the rim
// leans out over it — the dome's own law, on any outline; a circle gives the dome back.
//
// The same function covers a shape drawn on the FRONT plane (its face is just another outline): a
// flower wall, an arch covered along its curve.
//
// Pure, seeded, no React. Run: npm run check:flower-cover
import { isMain } from "../self-check";

export type CoverPoint = { x: number; y: number };

/** One outline to cover: a closed polygon (curves already flattened — a keyhole's seam is fine), or,
 *  `open`, the lines from its first point to its last with nothing inside. */
export interface CoverShape {
  poly: CoverPoint[];
  open?: boolean;
}

export interface CoverSpot {
  x: number;
  y: number;
  /** How deep in the shape it lies: its distance to the nearest edge (0 on a line). */
  d: number;
  /** The way OUT of the shape from here, a unit vector toward the nearest edge. */
  nx: number;
  ny: number;
  /** On the rim row (walked along the outline) rather than inside. */
  rim: boolean;
  /** Which shape it stands on. */
  shape: number;
  /** A rim spot's place along its outline, 0–1 from the outline's first point (a spiral wound up a
   *  tall piece is cut by it); 0 inside. */
  u: number;
}

export interface CoverLayout {
  spots: CoverSpot[];
  /** Each shape's depth: the deepest any of its spots lies (0 for lines, near 0 for a garland). */
  depth: number[];
  /** The spacing used — `step`, grown when the shapes would have taken more than `max` spots (the
   *  caller grows its heads by the same share, so a flower ceiling is still covered). */
  step: number;
}

interface Edge {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  len: number;
  /** Unit normal pointing OUT of the shape (to the left of travel on an open line). */
  nx: number;
  ny: number;
  /** The length walked along the outline before this edge. */
  s0: number;
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Even-odd: a keyhole's hole is outside, as it is drawn. */
export function insidePoly(poly: readonly CoverPoint[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function polyArea(poly: readonly CoverPoint[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** The edges a shape is walked along: its sides, less a keyhole's seam (a side walked once each way
 *  is no edge of anything) and, lines only, less the closing side. */
function edgesOf(shape: CoverShape): { edges: Edge[]; length: number } {
  const P = shape.poly;
  const n = P.length;
  const count = shape.open ? n - 1 : n;
  const raw: { a: CoverPoint; b: CoverPoint }[] = [];
  for (let i = 0; i < count; i++) raw.push({ a: P[i], b: P[(i + 1) % n] });
  const near = (p: CoverPoint, q: CoverPoint) => Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5;
  const edges: Edge[] = [];
  let s0 = 0;
  raw.forEach((e, i) => {
    const len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
    if (len < 0.5) return;
    if (!shape.open && raw.some((o, j) => j !== i && near(o.a, e.b) && near(o.b, e.a))) return;
    let nx = (e.b.y - e.a.y) / len;
    let ny = -(e.b.x - e.a.x) / len;
    if (!shape.open) {
      // Out is the side of the edge that is not in the shape.
      const mx = (e.a.x + e.b.x) / 2;
      const my = (e.a.y + e.b.y) / 2;
      const eps = Math.min(2, len * 0.25);
      if (insidePoly(P, mx + nx * eps, my + ny * eps) && !insidePoly(P, mx - nx * eps, my - ny * eps)) {
        nx = -nx;
        ny = -ny;
      }
    }
    edges.push({ ax: e.a.x, ay: e.a.y, bx: e.b.x, by: e.b.y, len, nx, ny, s0 });
    s0 += len;
  });
  return { edges, length: s0 };
}

/** The nearest edge to a point: how far, and the way to it (the edge's own normal on the edge). */
function nearest(edges: readonly Edge[], x: number, y: number): { d: number; nx: number; ny: number } {
  let best = Infinity;
  let bx = 0;
  let by = 0;
  let be: Edge | null = null;
  for (const e of edges) {
    const dx = e.bx - e.ax;
    const dy = e.by - e.ay;
    const t = Math.max(0, Math.min(1, ((x - e.ax) * dx + (y - e.ay) * dy) / (e.len * e.len)));
    const qx = e.ax + dx * t;
    const qy = e.ay + dy * t;
    const d = Math.hypot(qx - x, qy - y);
    if (d < best) {
      best = d;
      bx = qx - x;
      by = qy - y;
      be = e;
    }
  }
  if (!be) return { d: 0, nx: 1, ny: 0 };
  if (best < 1e-6) return { d: 0, nx: be.nx, ny: be.ny };
  return { d: best, nx: bx / best, ny: by / best };
}

/** A grid of what is already placed, so "is anything within m of here" asks nine cells. */
class Taken {
  private cells = new Map<string, CoverPoint[]>();
  constructor(private size: number) {}
  private key(cx: number, cy: number) {
    return cx + ":" + cy;
  }
  free(x: number, y: number, m: number): boolean {
    const cx = Math.floor(x / this.size);
    const cy = Math.floor(y / this.size);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const cell = this.cells.get(this.key(cx + i, cy + j));
        if (!cell) continue;
        for (const p of cell) if ((p.x - x) ** 2 + (p.y - y) ** 2 < m * m) return false;
      }
    return true;
  }
  add(x: number, y: number) {
    const k = this.key(Math.floor(x / this.size), Math.floor(y / this.size));
    const cell = this.cells.get(k);
    if (cell) cell.push({ x, y });
    else this.cells.set(k, [{ x, y }]);
  }
}

/** At most this many spots however large the shapes (a hall's flower ceiling): past it the spacing
 *  grows, and the caller's heads with it. */
export const COVER_MAX_SPOTS = 1400;

/**
 * Where the heads stand so that `shapes` are covered: `step` apart, the rim row `inset` inside the
 * outline. Seeded — the same shapes lay out the same every time.
 */
export function coverSpots(shapes: readonly CoverShape[], o: { step: number; inset: number; seed: number; max?: number }): CoverLayout {
  const rng = mulberry32(o.seed);
  const walked = shapes.map(edgesOf);
  // The budget: what the shapes would take at this spacing, and the spacing that keeps it in hand.
  let step = Math.max(8, o.step);
  const max = o.max ?? COVER_MAX_SPOTS;
  const want = shapes.reduce((s, sh, i) => s + (sh.open ? walked[i].length / step : Math.max(polyArea(sh.poly) / (step * step * 0.866), walked[i].length / (2 * step))), 0);
  if (want > max) step *= Math.sqrt(want / max);
  const inset = o.inset * (step / Math.max(8, o.step));
  const spots: CoverSpot[] = [];
  const depth: number[] = shapes.map(() => 0);
  const taken = new Taken(step);

  shapes.forEach((shape, si) => {
    const { edges, length } = walked[si];
    if (!edges.length || length <= 0) return;
    // 1. The rim row: the outline walked `step` apart — evenly, so a ring closes without a gap.
    const n = Math.max(shape.open ? 2 : 3, Math.round(length / step));
    const pitch = length / n;
    let at = shape.open ? pitch / 2 : pitch * rng();
    let ei = 0;
    for (let k = 0; k < n; k++, at += pitch) {
      const s = at % length;
      while (ei < edges.length - 1 && edges[ei].s0 + edges[ei].len < s) ei++;
      if (edges[ei].s0 > s) ei = 0;
      while (ei < edges.length - 1 && edges[ei].s0 + edges[ei].len < s) ei++;
      const e = edges[ei];
      const t = Math.max(0, Math.min(1, (s - e.s0) / e.len));
      const qx = e.ax + (e.bx - e.ax) * t;
      const qy = e.ay + (e.by - e.ay) * t;
      let spot: CoverSpot | null = null;
      if (shape.open) spot = { x: qx, y: qy, d: 0, nx: e.nx, ny: e.ny, rim: true, shape: si, u: s / length };
      else {
        // A little inside the outline; a band too thin for that takes it nearer the edge, then on it.
        // (Each a little more or less inside than the last: a row of flowers, not a string of beads.)
        const deep = inset * (0.55 + 0.9 * rng());
        for (const dd of [deep, inset / 2, 0]) {
          const x = qx - e.nx * dd;
          const y = qy - e.ny * dd;
          if (dd === 0) {
            spot = { x, y, d: 0, nx: e.nx, ny: e.ny, rim: true, shape: si, u: s / length };
            break;
          }
          if (!insidePoly(shape.poly, x, y)) continue;
          const near = nearest(edges, x, y);
          if (near.d < dd * 0.85) continue;
          spot = { x, y, d: near.d, nx: near.nx, ny: near.ny, rim: true, shape: si, u: s / length };
          break;
        }
      }
      if (!spot || !taken.free(spot.x, spot.y, step * 0.72)) continue;
      taken.add(spot.x, spot.y);
      spots.push(spot);
      depth[si] = Math.max(depth[si], spot.d);
    }
    if (shape.open) return;
    // 2. The inside: a honeycomb, jittered, wherever there is room behind the rim row.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of shape.poly) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const dy = step * 0.866;
    const ox = rng() * step;
    const oy = rng() * dy;
    let row = 0;
    for (let y = minY + oy - dy; y <= maxY + dy; y += dy, row++) {
      for (let x = minX + ox - step + (row % 2 ? step / 2 : 0); x <= maxX + step; x += step) {
        const px = x + (rng() - 0.5) * step * 0.4;
        const py = y + (rng() - 0.5) * step * 0.4;
        if (!insidePoly(shape.poly, px, py)) continue;
        const near = nearest(edges, px, py);
        if (near.d < inset + step * 0.45) continue;
        if (!taken.free(px, py, step * 0.72)) continue;
        taken.add(px, py);
        spots.push({ x: px, y: py, d: near.d, nx: near.nx, ny: near.ny, rim: false, shape: si, u: 0 });
        depth[si] = Math.max(depth[si], near.d);
      }
    }
  });
  return { spots, depth, step };
}

/** A SPIRAL BAND as an outline, about its own middle, `sizeMm` across: `turns` turns of a band
 *  `bandMm` wide (absent = a little over half the pitch between two turns), winding out from the
 *  middle. What the shape editor's "ספירלה" tool lays; flowers then follow it like any outline. */
export function spiralOutline(sizeMm: number, turns = 2.5, bandMm?: number): CoverPoint[] {
  const R = Math.max(100, sizeMm) / 2;
  const n = Math.max(1, Math.min(6, turns));
  const pitch = R / (n + 0.5);
  const band = Math.max(20, Math.min(pitch * 0.85, bandMm ?? pitch * 0.58));
  const r0 = band / 2 + pitch * 0.12;
  const r1 = R - band / 2;
  const steps = Math.round(n * 28);
  const outer: CoverPoint[] = [];
  const inner: CoverPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * n * 2 * Math.PI;
    const r = r0 + (r1 - r0) * t;
    outer.push({ x: (r + band / 2) * Math.cos(a), y: (r + band / 2) * Math.sin(a) });
    inner.push({ x: (r - band / 2) * Math.cos(a), y: (r - band / 2) * Math.sin(a) });
  }
  const pts = outer.concat(inner.reverse());
  // About its own box centre, as a hand-drawn outline is kept.
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return pts.map((p) => ({ x: Math.round((p.x - cx) * 10) / 10, y: Math.round((p.y - cy) * 10) / 10 }));
}

if (isMain(import.meta.url)) {
  const assert = (ok: boolean, what: string) => {
    if (!ok) throw new Error("FAIL: " + what);
    console.log(`  ok   ${what}`);
  };
  const circle = (r: number, n = 48, cx = 0, cy = 0): CoverPoint[] => Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((i * 2 * Math.PI) / n), y: cy + r * Math.sin((i * 2 * Math.PI) / n) }));
  const o = { step: 70, inset: 22, seed: 5 };

  // A disc: covered rim to middle, the middle deepest, every spot looking out from the middle.
  const disc = coverSpots([{ poly: circle(300) }], o);
  assert(disc.spots.length > 50 && disc.spots.every((s) => Math.hypot(s.x, s.y) <= 300), `a ⌀60 disc is covered inside its outline (${disc.spots.length} heads)`);
  assert(Math.abs(disc.depth[0] - 300) < 80, `…its middle the deepest (${Math.round(disc.depth[0])})`);
  assert(disc.spots.filter((s) => Math.hypot(s.x, s.y) > 60).every((s) => s.nx * s.x + s.ny * s.y > 0), "…and the way out of a disc is away from its middle");
  const rimCount = disc.spots.filter((s) => s.rim).length;
  assert(Math.abs(rimCount - Math.round((2 * Math.PI * 300) / 70)) <= 2, `…its rim row a head apart all the way round (${rimCount})`);
  assert(disc.spots.every((a) => disc.spots.every((b) => a === b || Math.hypot(a.x - b.x, a.y - b.y) >= 70 * 0.72 - 1e-6)), "no two heads on one spot");
  assert(JSON.stringify(coverSpots([{ poly: circle(300) }], o)) === JSON.stringify(disc), "the same shape lays out the same twice");

  // A ring as a keyhole (outer one way, the hole back the other, a seam between): nothing in the hole.
  const outer = circle(400);
  const hole = circle(250).reverse();
  const ring = coverSpots([{ poly: [...outer, outer[0], hole[hole.length - 1], ...hole, hole[hole.length - 1]] }], o);
  assert(ring.spots.length > 40 && ring.spots.every((s) => Math.hypot(s.x, s.y) > 245 && Math.hypot(s.x, s.y) < 405), `a ring is covered on its band and not across its hole (${ring.spots.length})`);
  assert(ring.depth[0] < 90, `…a band 15 cm wide is 7.5 deep (${Math.round(ring.depth[0])})`);
  assert(ring.spots.some((s) => s.nx * s.x + s.ny * s.y < 0) && ring.spots.some((s) => s.nx * s.x + s.ny * s.y > 0), "…and its heads look out of BOTH its rims, the inner one too");

  // A band thinner than a head (a front panel's plan band, the "קו" shape): one row, a garland.
  const thin = coverSpots([{ poly: [{ x: -1000, y: -10 }, { x: 1000, y: -10 }, { x: 1000, y: 10 }, { x: -1000, y: 10 }] }], o);
  assert(thin.spots.length >= 24 && thin.spots.length <= 34 && thin.spots.every((s) => Math.abs(s.y) <= 10), `a 2 cm band is one row down its length (${thin.spots.length})`);
  // Lines only: walked along the drawn lines, never the closing side.
  const lines = coverSpots([{ poly: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 800 }], open: true }], o);
  assert(lines.spots.length >= 24 && lines.spots.every((s) => s.rim && s.d === 0 && (Math.abs(s.y) < 1e-6 || Math.abs(s.x - 1000) < 1e-6)), `lines are a garland along the lines (${lines.spots.length})`);
  assert(lines.depth[0] === 0 && lines.spots[0].u < lines.spots[lines.spots.length - 1].u, "…each head knowing how far along it is");

  // Two shapes keep their own spots, and never share one where they touch.
  const two = coverSpots([{ poly: circle(200, 32, -150, 0) }, { poly: circle(200, 32, 150, 0) }], o);
  assert(two.spots.some((s) => s.shape === 0) && two.spots.some((s) => s.shape === 1), "two shapes are both covered");
  // A hall's flower ceiling stays inside the budget: the spacing grows.
  const big = coverSpots([{ poly: [{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 8000 }, { x: 0, y: 8000 }] }], o);
  assert(big.spots.length <= COVER_MAX_SPOTS * 1.15 && big.step > 70, `a 12 × 8 m ceiling is held to the budget (${big.spots.length} at ${Math.round(big.step)} mm)`);

  // The spiral: a band winding out, inside its size, covered along its whole length.
  const sp = spiralOutline(1200, 2.5);
  assert(sp.every((p) => Math.abs(p.x) <= 601 && Math.abs(p.y) <= 601) && polyArea(sp) > 0.15 * 1200 * 1200 && polyArea(sp) < 0.6 * 1200 * 1200, "a spiral is a band inside its box, mostly air");
  const spiral = coverSpots([{ poly: sp }], o);
  assert(spiral.spots.length > 60 && !insidePoly(sp, 0, 0), `…covered along its band (${spiral.spots.length}), its eye open`);
  console.log("flower-cover self-check passed");
}
