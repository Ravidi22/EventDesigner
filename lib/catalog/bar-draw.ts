// A SHAPED BAR, drawn as a bar — the counter, the bartender's side of it, the back bars and their
// bottles — rather than as the bare outline of its footprint.
//
// The straight bar's picture (components/item-symbol.tsx `bar`) is built along one axis: the guests'
// counter along its front, the bartender's aisle, the back bar and its bottles along the back. A ח,
// an oval ring, a horseshoe, an arc or a rounded ח has no one axis, so the same picture is laid
// along its BAND instead:
//
//   - The edges a guest stands at are the ones on the OUTSIDE of the whole bar — its convex hull.
//     Along them runs the counter top, in the straight bar's front-strip shade.
//   - The edges that face in — the inside of a ring, the crook of a ח or an L drawn by hand — are
//     the bartender's side: the underbar shelf, in the straight bar's back-strip shade, with the
//     bottles along it.
//   - An edge that runs ACROSS the band from outside to in (the end of an arc, either side of an
//     oval's opening) is a cap, and neither strip runs along it: both stop square on it.
//   - The shapes ADDED to the bar (MapAppearance.parts) are its back counters — the island inside
//     the oval, the back wall across the horseshoe's open side, the run against the wall under the
//     rounded ח — so each is drawn as a back bar with a row of bottles down its middle.
//   - A shape with no inside edges and nothing added (a capsule, a hexagon) is a counter guests
//     stand round on every side, as the round bar is: the counter all round, bottles in the well.
//
// The strip widths are the straight bar's, read off the band's width (2·area/perimeter, which is
// the band exactly for a band and close for anything else), so a 60cm counter is drawn the same
// whether it runs straight or round. Each strip is the band between an edge and that edge moved
// inward, mitred where two edges meet: at a corner where the guest side turns into the bartender's
// (the foot of a ח's leg) the two strips meet on the diagonal, like a picture frame.
//
// Derived from the footprint alone, so a bar stretched on the plan is drawn at its new size, and
// cached per footprint like the spine and the label point. Pure; self-checked: npm run check:bar-draw.
import type { Point } from "@/lib/design-document/types";
import { customShapeBounds, footprintOutlines, pieceOf, type BuiltOutline, type Footprint } from "@/lib/studio/footprint";
import { flatRing } from "@/lib/studio/label-anchor";
import { footprintSpine, pointAlong, spineLength } from "@/lib/studio/spine";

/** One bottle seen from above, in the footprint's frame. */
export interface Bottle {
  x: number;
  y: number;
  r: number;
}

/** A strip of counter: one closed ring, or two (the whole way round a loop — drawn even-odd). */
export type Strip = Point[][];

export interface BarDrawing {
  /** The counter top along the guests' edges. */
  front: Strip[];
  /** The underbar shelf along the edges that face the bartender. */
  shelf: Strip[];
  /** The back counters — the shapes added to the bar — in the footprint's frame. */
  backs: BuiltOutline[];
  bottles: Bottle[];
}

/** One bottle every 26cm along a shelf — the straight bar's spacing. */
export const BOTTLE_PITCH_MM = 260;

/** How deep the guests' counter top is on a counter `band` deep — the straight bar's front strip. */
export const counterTopMm = (band: number) => Math.min(band * 0.4, 600);

/** How deep the bartender's shelf is on a counter `band` deep — the straight bar's back strip. */
export const counterShelfMm = (band: number) => Math.min(band * 0.2, 400);

/** A bottle's radius on a shelf `shelf` deep. */
export const bottleRadiusMm = (shelf: number) => Math.min(shelf * 0.28, 45);

type Side = "front" | "shelf" | "cap";

const cache = new Map<string, BarDrawing>();
const CACHE_MAX = 200;
const EMPTY: BarDrawing = { front: [], shelf: [], backs: [], bottles: [] };

/** How a bar of any shape is drawn. Meant for the shaped ones (a hand-drawn outline, a derived
 *  shape, a composite); a rectangle or a round has its own picture in components/item-symbol.tsx. */
export function barDrawing(f: Footprint): BarDrawing {
  const key = JSON.stringify(f);
  const hit = cache.get(key);
  if (hit) return hit;
  const result = build(f);
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, result);
  return result;
}

function build(f: Footprint): BarDrawing {
  const pieces = footprintOutlines(f);
  const rings = pieces.map((p) => clean(flatRing(p)));
  // The bar's own shape is piece 0 — or, drawn hollow and opened in two places, every piece that
  // says it is shape 0 (BuiltOutline.of). The rest are the shapes added to it.
  const own = pieces.flatMap((p, i) => (pieceOf(p, i) === 0 && !p.face ? [i] : []));
  if (!own.length) return EMPTY;
  // A FRONT panel added to the bar (backdrops S2 — its band carries its `face`) is drawn as itself by
  // the outline: never a back bar with bottles, and not part of the bar's outside.
  const panel = (p: BuiltOutline) => !!p.face;

  // Which edges are the outside: the hull of the WHOLE bar, parts included — the end of a
  // horseshoe's leg tucked behind the back bar added across its opening is not where guests stand.
  const all = rings.filter((_, i) => !panel(pieces[i])).flat();
  const hull = convexHull(all);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of all) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const eps = Math.max(2, Math.max(maxX - minX, maxY - minY) * 0.002);
  const outside = (p: Point) => boundaryDistance(p, hull) <= eps;

  const front: Strip[] = [];
  const shelves: Strip[] = [];
  const bottles: Bottle[] = [];
  const wells: { piece: BuiltOutline; band: number }[] = [];
  for (const i of own) {
    const drawn = counter(rings[i], outside);
    if (!drawn) {
      if (i === own[0]) return EMPTY;
      continue;
    }
    front.push(...drawn.front);
    shelves.push(...drawn.shelf);
    bottles.push(...drawn.bottles);
    if (!drawn.shelf.length) wells.push({ piece: pieces[i], band: drawn.band });
  }

  // The shapes added to the bar are its back counters: a row of bottles down the middle of each.
  const backs = pieces.filter((p, i) => pieceOf(p, i) !== 0 && !panel(p));
  pieces.forEach((piece, i) => {
    if (pieceOf(piece, i) === 0 || panel(piece)) return;
    const ring = rings[i];
    if (ring.length < 3) return;
    const d = (2 * Math.abs(signedArea(ring))) / ringLength(ring);
    bottles.push(...spread(spineOf(piece), 0, Math.min(d * 0.09, 40)));
  });

  // Nothing faces in and nothing was added: guests all round, the bartender in the middle, the
  // bottles down the well — the round bar's picture, for any outline.
  if (shelves.length === 0 && backs.length === 0) {
    for (const w of wells) bottles.push(...spread(spineOf(w.piece), 0, Math.min(w.band * 0.056, 45)));
  }

  return { front, shelf: shelves, backs, bottles };
}

/** A piece's spine where the piece stands in the footprint's frame (footprintSpine centres it). */
function spineOf(piece: BuiltOutline): Point[] {
  const b = customShapeBounds(piece.outline, piece.edgeCurves);
  return footprintSpine({ kind: "custom", outline: piece.outline, ...(piece.edgeCurves ? { edgeCurves: piece.edgeCurves } : {}) }).map((p) => ({ x: p.x + b.cx, y: p.y + b.cy }));
}

/** One outline of the bar's own shape drawn as counter: the guests' strip along its outside edges,
 *  the bartender's shelf and its bottles along the edges that face in. Null for a degenerate one. */
function counter(base: Point[], outside: (p: Point) => boolean): { front: Strip[]; shelf: Strip[]; bottles: Bottle[]; band: number } | null {
  if (!base || base.length < 3) return null;
  const area = Math.abs(signedArea(base));
  const perimeter = ringLength(base);
  if (!(area > 0) || !(perimeter > 0)) return null;

  const band = (2 * area) / perimeter;
  const top = counterTopMm(band);
  const shelf = counterShelfMm(band);
  const r = bottleRadiusMm(shelf);

  const n = base.length;
  const sides: Side[] = base.map((a, i) => {
    const b = base[(i + 1) % n];
    const oa = outside(a);
    const ob = outside(b);
    if (oa && ob && outside({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })) return "front";
    // From the outside to the inside, about as long as the band is deep: across the band.
    if (oa !== ob && Math.hypot(b.x - a.x, b.y - a.y) <= band * 1.3) return "cap";
    return "shelf";
  });

  const frame = edgeFrame(base);
  const depth = (s: Side) => (s === "front" ? top : s === "shelf" ? shelf : 0);
  const offsets = sides.map(depth);
  const inner = offsetVertices(base, frame, offsets);

  const front: Strip[] = [];
  const shelves: Strip[] = [];
  const bottles: Bottle[] = [];
  const runs = runsOf(sides);
  for (const run of runs) {
    if (run.side === "cap") continue;
    const strip: Strip =
      run.loop
        ? [base, inner]
        : [[...run.vertices.map((k) => base[k]), ...run.vertices.map((k) => inner[k]).reverse()]];
    (run.side === "front" ? front : shelves).push(strip);
  }

  // The bottles stand down the middle of each shelf — the shelf's own edge moved in half its depth,
  // stopped where it meets the strips on either side of it.
  const halfway = offsetVertices(
    base,
    frame,
    sides.map((s) => (s === "shelf" ? shelf / 2 : depth(s))),
  );
  for (const run of runs) {
    if (run.side !== "shelf") continue;
    const line = run.loop ? [...halfway, halfway[0]] : run.vertices.map((k) => halfway[k]);
    bottles.push(...spread(line, shelf / 2, r));
  }

  return { front, shelf: shelves, bottles, band };
}

/** Bottles every BOTTLE_PITCH_MM along a polyline, `inset` clear of both its ends. */
function spread(line: Point[], inset: number, r: number): Bottle[] {
  if (line.length < 2 || !(r > 0)) return [];
  const L = spineLength(line);
  const usable = L - inset * 2;
  const count = Math.floor(usable / BOTTLE_PITCH_MM);
  if (count < 1) return [];
  return Array.from({ length: count }, (_, i) => {
    const p = pointAlong(line, inset + ((i + 0.5) * usable) / count);
    return { x: p.x, y: p.y, r };
  });
}

// ── the geometry ────────────────────────────────────────────────────────────────────────────────

/** A flattened ring without its zero-length edges (a keyhole's caps may meet in a point). */
export function clean(ring: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.01) out.push(p);
  }
  while (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= 0.01) out.pop();
  return out;
}

export function signedArea(ring: Point[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function ringLength(ring: Point[]): number {
  let L = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    L += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return L;
}

/** Andrew's monotone chain. */
function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** How far `p` is from the nearest edge of a closed polygon. */
function boundaryDistance(p: Point, ring: Point[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
  }
  return best;
}

interface Edge {
  /** Along the edge. */
  u: Point;
  /** Square to it, into the shape. */
  n: Point;
}

function edgeFrame(ring: Point[]): Edge[] {
  // Which side is in: the left of every edge on a positively wound ring, the right otherwise.
  const s = signedArea(ring) > 0 ? 1 : -1;
  return ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    return { u, n: { x: -u.y * s, y: u.x * s } };
  });
}

/** Each vertex moved in: where the edge into it, moved in by its offset, meets the edge out of it,
 *  moved in by its own — a mitre, which is a strip's corner whether the two offsets agree or not.
 *  An offset of 0 keeps that edge where it is, so a strip ends square on a cap. */
function offsetVertices(ring: Point[], frame: Edge[], offsets: number[]): Point[] {
  const n = ring.length;
  return ring.map((p, k) => {
    const A = frame[(k - 1 + n) % n];
    const B = frame[k];
    const oa = offsets[(k - 1 + n) % n];
    const ob = offsets[k];
    const pa = { x: p.x + A.n.x * oa, y: p.y + A.n.y * oa };
    const pb = { x: p.x + B.n.x * ob, y: p.y + B.n.y * ob };
    const cross = A.u.x * B.u.y - A.u.y * B.u.x;
    let q: Point;
    if (Math.abs(cross) < 1e-6) q = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    else {
      const t = ((pb.x - pa.x) * B.u.y - (pb.y - pa.y) * B.u.x) / cross;
      q = { x: pa.x + A.u.x * t, y: pa.y + A.u.y * t };
    }
    // A very sharp corner sends its mitre far off: hold it to a few strip-widths.
    const reach = 4 * Math.max(oa, ob, 1);
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d = Math.hypot(dx, dy);
    return d > reach ? { x: p.x + (dx / d) * reach, y: p.y + (dy / d) * reach } : q;
  });
}

interface Run {
  side: Side;
  /** The vertices it runs through, first to last (one more than its edges). */
  vertices: number[];
  /** All the way round, with no other side anywhere. */
  loop: boolean;
}

/** The ring's edges grouped into runs of one side. */
function runsOf(sides: Side[]): Run[] {
  const n = sides.length;
  const start = sides.findIndex((s, i) => s !== sides[(i - 1 + n) % n]);
  if (start < 0) return [{ side: sides[0], vertices: [], loop: true }];
  const runs: Run[] = [];
  for (let i = 0; i < n; ) {
    const k = (start + i) % n;
    const side = sides[k];
    const vertices = [k];
    while (i < n && sides[(start + i) % n] === side) {
      vertices.push((start + i + 1) % n);
      i++;
    }
    runs.push({ side, vertices, loop: false });
  }
  return runs;
}
