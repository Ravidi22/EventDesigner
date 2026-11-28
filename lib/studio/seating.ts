import type { BuiltOutline, Footprint } from "./footprint";
import { flattenEdge, footprintOutlines } from "./footprint";
import { absoluteControlPoints, polygonAreaMm2 } from "./geometry";
import type { EdgeCurve, Point } from "./hall";

// Where the chairs go.
//
// A table's seat count is not a note — it is the number of people who sit at it, and until now the
// plan drew the table and left the designer to imagine the ring around it. Two 1.80m rounds a metre
// apart look fine empty and are unusable once twelve chairs each are pulled out, which is a thing
// you find out on the night.
//
// ONE RULE FOR EVERY SHAPE, in two steps: give each SIDE a share of the chairs proportional to how
// long it is, then CENTRE that side's chairs along it.
//
// The second step is the one that matters on anything with corners. Walking the whole outline as a
// single loop apportions the chairs correctly and still looks wrong: the walk carries its running
// distance across each corner, so a side inherits whatever phase the previous side ended on and its
// chairs sit off to one side of it, with a chair straddling the corner as often as not. Nobody lays
// a table that way. Each side is now walked from its own start, so its chairs are symmetric about
// its own midpoint and the margins at both ends match.
//
// A circle is ONE side — the whole loop — so it is still the even ring anyone would draw by hand,
// which is exactly what it always was. The אביר's long sides take most of the chairs and its ends
// take the rest; the חצי עיגול's chord and its bow each take a share of their own.
//
// AND A RECTANGLE IS LAID IN A CROSS: opposite sides always get the same number. Sharing four sides
// out by length alone is arithmetically fine and looks like a mistake — a square seating six comes
// out 2,2,1,1 with the two heavy sides adjacent, so the table reads as lopsided when the honest
// answer, 2 and 2 facing each other with 1 and 1 facing each other, was available all along. Only a
// rectangle gets this, because only a rectangle has opposite sides; a triangle does not, and a
// circle has nothing to pair.
//
// Chairs are DERIVED, never placed. There is no chair object in the document and there must not be:
// a chair the designer could drag away from its table is a chair that disagrees with the seat count
// the packing list is about to order.

export interface Seat {
  /** Chair centre, in the table's own local frame — the same frame the footprint is drawn in, so
   *  the parent <g>'s position and rotation carry the chairs along with the table for free. */
  x: number;
  y: number;
  /** Which way it faces, in degrees, 0 = +x. Toward the table, because that is where the food is. */
  facingDeg: number;
}

// A banquet chair as a plan drawing. Exported so the renderer draws it at the size this file
// placed it, and in the frame it placed it in: after the seat's own rotation, +x points AT the
// table, so `CHAIR_D_MM` is how far it reaches out from the edge and `CHAIR_W_MM` is how much of
// that edge it takes up.
//
// A chair is WIDER ACROSS THE TABLE THAN IT IS DEEP — that ratio is most of what makes the shape
// read as a chair rather than as a dot, and a square one reads as neither. At a 1.80m round seating
// twelve there is then about 80mm of air between neighbours, which is what a set table looks like.
export const CHAIR_W_MM = 420; // along the table edge
export const CHAIR_D_MM = 340; // out from it
/** How far the seat sits UNDER the table. A chair pushed in is the resting state of a laid room —
 *  drawn floating off the edge, a ring of them reads as chairs pulled out and abandoned, and the
 *  table stops looking like one thing with people at it. The overlap is hidden by the table itself,
 *  which is drawn after the chairs. */
export const CHAIR_TUCK_MM = 110;
/** The backrest's depth, at the outer end of the seat — the detail that says which way it faces. */
export const CHAIR_BACK_MM = 95;

/** Table edge → chair centre. Negative tuck included, so most of the chair is outside and its inner
 *  edge is under the table. */
export const CHAIR_OFFSET_MM = CHAIR_D_MM / 2 - CHAIR_TUCK_MM;

const CURVE_STEPS = 16; // per bowed edge of an outline
const CIRCLE_STEPS = 96; // fine enough that a sampled circle is a circle at any zoom a hall is seen at
/** Within this of a vertex a seat is ON it (pointOnSide) — far above float noise, far below a mm. */
const VERTEX_TIE_MM = 1e-6;

/** A chair's SVG transform in its table's frame, every number to a thousandth of a mm (or degree):
 *  the one string every surface that draws a ring writes, so the server's HTML and the browser's
 *  first render print the same text (a hydration mismatch otherwise). */
export function seatTransform(seat: Seat): string {
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return `translate(${r3(seat.x)} ${r3(seat.y)}) rotate(${r3(seat.facingDeg)})`;
}

/** One side of a table as the seating sees it — a run of edge somebody could sit along.
 *
 *  A SIDE IS NOT AN EDGE of the outline. A derived shape cuts its arcs into quarters so that every
 *  extreme is a vertex (lib/studio/footprint.ts, rule 2), and a חצי עיגול is therefore three edges
 *  for what anyone at the table would call two sides: the flat one and the bow. Edges that meet
 *  SMOOTHLY — same direction on both sides of the vertex — are one side here, so the bow's chairs
 *  are spaced evenly along the whole bow instead of centred on each quarter of it, and a designer
 *  blocking "the bow" blocks one thing rather than two halves of it. */
export interface SeatSide {
  pts: Point[];
  lengths: number[];
  len: number;
  /** +1 or −1: the winding of the outline this side belongs to, which is what says which way is
   *  OUT. Not the direction from the centre — on the inner edge of a ring or a ח, out is toward the
   *  middle, and a chair there faces the other way. */
  orient: number;
  /** The side is buried against another shape of the same item — the seam where a round end meets
   *  its counter. Not an edge anybody sits at, so it takes no chairs, blocked or not. */
  covered: boolean;
}

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

const SMOOTH_COS = Math.cos((3 * Math.PI) / 180); // within 3° reads as one continuous edge

function smooth(u: Point, v: Point): boolean {
  const lu = Math.hypot(u.x, u.y);
  const lv = Math.hypot(v.x, v.y);
  if (lu === 0 || lv === 0) return false;
  return (u.x * v.x + u.y * v.y) / (lu * lv) > SMOOTH_COS;
}

/** Shoelace sign of a closed polyline — which way round it was drawn. */
function windingOf(pts: Point[]): number {
  let sum = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    sum += p.x * q.y - q.x * p.y;
  });
  return sum >= 0 ? 1 : -1;
}

/** One closed outline's sides: its edges flattened, then joined wherever two meet smoothly. */
function outlineSides(o: BuiltOutline): { sides: Point[][]; polygon: Point[]; orient: number } {
  const n = o.outline.length;
  const edges = o.outline.map((a, i) => {
    const b = o.outline[(i + 1) % n];
    const curve: EdgeCurve | null = o.edgeCurves?.[i] ?? null;
    const pts = flattenEdge(a, b, curve, CURVE_STEPS);
    // The direction the edge leaves its start and arrives at its end — the control arms when it is
    // curved, the chord when it is not (or when an arm is folded onto its own endpoint).
    const { c1, c2 } = curve ? absoluteControlPoints(a, b, curve) : { c1: b, c2: a };
    const leave = dist(a, c1) > 1e-6 ? { x: c1.x - a.x, y: c1.y - a.y } : { x: b.x - a.x, y: b.y - a.y };
    const arrive = dist(c2, b) > 1e-6 ? { x: b.x - c2.x, y: b.y - c2.y } : { x: b.x - a.x, y: b.y - a.y };
    return { pts, leave, arrive };
  });
  const polygon = edges.flatMap((e) => e.pts.slice(0, -1));
  const orient = windingOf(polygon);
  const joins = (i: number) => smooth(edges[(i - 1 + n) % n].arrive, edges[i].leave);

  // Start at a corner, so no side is split in two by where the outline happened to begin. An
  // outline with no corner at all is one closed loop — a circle drawn as four quarters.
  const start = edges.findIndex((_, i) => !joins(i));
  if (start === -1) return { sides: [[...polygon, polygon[0]]], polygon, orient };
  const sides: Point[][] = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (k > 0 && joins(i)) sides[sides.length - 1].push(...edges[i].pts.slice(1));
    else sides.push([...edges[i].pts]);
  }
  return { sides, polygon, orient };
}

function inside(p: Point, poly: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** A point `along` a side, with the outward normal of the segment it landed on. */
function pointOnSide(side: SeatSide, along: number): { on: Point; nx: number; ny: number } {
  const { pts, lengths, orient } = side;
  let seg = 0;
  let walked = 0;
  // A seat that falls EXACTLY on a vertex (a round's 16 chairs land on every sixth of its 96 steps)
  // stays on the segment it reached the vertex by. Compared without a tolerance, the last digit of
  // the summed lengths decided it — and Node and the browser decided differently, so a round's ring
  // was drawn 3.75° apart on the server and the client (a hydration mismatch on every load).
  while (seg < lengths.length - 1 && walked + lengths[seg] < along - VERTEX_TIE_MM) {
    walked += lengths[seg];
    seg++;
  }
  const a = pts[seg];
  const b = pts[seg + 1];
  const len = lengths[seg] || 1;
  const t = Math.min(1, Math.max(0, (along - walked) / len));
  // The edge's OWN normal, turned outward by the outline's winding. Not the direction from the
  // centre: at the corner of a long banquet table those differ by nearly 45°, and a chair square to
  // the side it belongs to is the difference between a plan that reads and one that looks knocked
  // over — and on the inside of a ring, the centre is the direction that is OUT.
  const dx = (b.x - a.x) / len;
  const dy = (b.y - a.y) / len;
  return {
    on: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
    nx: orient * dy,
    ny: -orient * dx,
  };
}

/** How far out from a side to look for another shape of the same item. */
const SEAM_PROBE_MM = 60;

/** The narrowest piece anybody sits at (twice its area over its perimeter) — under it, a line. */
const SEAT_MIN_BAND_MM = 150;

/** The footprint's sides, in its own centred frame — each walked from its own start so the chairs on
 *  it can be centred on it. The INDEX of a side in this list is what MapAppearance.blockedSides and
 *  DesignTable.blockedSides store.
 *
 *  A rectangle has four. A circle or an ellipse has ONE, the whole loop, which is why a round table
 *  still gets the even ring it always did. Every other shape has one per run of smoothly joined
 *  edges (see SeatSide), and a composite item has the sides of each of its shapes in turn, the
 *  seams between them marked `covered`.
 *
 *  A BOWED EDGE IS SAMPLED, not shortened to its chord: walking the chord of a חצי עיגול's bow puts
 *  its chairs up to 175mm inside the table, which at that size means they vanish under it. */
export function seatSides(f: Footprint): SeatSide[] {
  const measure = measureSide;

  if (f.kind === "circle" || f.kind === "ellipse") {
    const rx = (f.kind === "circle" ? f.diameterMm : f.widthMm) / 2;
    const ry = (f.kind === "circle" ? f.diameterMm : f.depthMm) / 2;
    const loop = Array.from({ length: CIRCLE_STEPS + 1 }, (_, i) => {
      const a = (i / CIRCLE_STEPS) * Math.PI * 2;
      return { x: Math.cos(a) * rx, y: Math.sin(a) * ry };
    });
    return [measure(loop, 1)]; // closed by repeating the first point — one side, walked all the way round
  }
  if (f.kind === "rect") {
    const w = f.widthMm / 2;
    const d = f.depthMm / 2;
    const c = [
      { x: -w, y: -d },
      { x: w, y: -d },
      { x: w, y: d },
      { x: -w, y: d },
    ];
    return [0, 1, 2, 3].map((i) => measure([c[i], c[(i + 1) % 4]], 1));
  }

  return compositeSides(f).sides;
}

function measureSide(pts: Point[], orient: number, covered = false): SeatSide {
  const lengths = pts.slice(0, -1).map((p, i) => dist(p, pts[i + 1]));
  return { pts, lengths, len: lengths.reduce((a, b) => a + b, 0), orient, covered };
}

/** The sides of a shape built from outlines — and, for each, which outline it belongs to, with
 *  every outline's polygon: what the seam test needs. */
function compositeSides(f: Footprint): { sides: SeatSide[]; part: number[]; polygons: Point[][]; bare: boolean[] } {
  const outlines = footprintOutlines(f);
  const parts = outlines.map(outlineSides);
  // Nobody sits at a line: a lines-only drawing, or a piece thinner than SEAT_MIN_BAND_MM (a "line"
  // shape — a rope, a rail) takes no chairs, wherever it stands in the item.
  const bare = outlines.map((o, i) => {
    const poly = parts[i].polygon;
    const perimeter = poly.reduce((s, p, k) => s + dist(p, poly[(k + 1) % poly.length]), 0);
    return !!o.open || (perimeter > 0 && (2 * Math.abs(polygonAreaMm2(poly))) / perimeter < SEAT_MIN_BAND_MM);
  });
  const sides: SeatSide[] = [];
  const part: number[] = [];
  parts.forEach((p, pi) => {
    for (const pts of p.sides) {
      const side = measureSide(pts, p.orient, bare[pi]);
      if (!side.covered && parts.length > 1 && side.len > 0) {
        const { on, nx, ny } = pointOnSide(side, side.len / 2);
        const probe = { x: on.x + nx * SEAM_PROBE_MM, y: on.y + ny * SEAM_PROBE_MM };
        side.covered = parts.some((other, oi) => oi !== pi && inside(probe, other.polygon));
      }
      sides.push(side);
      part.push(pi);
    }
  });
  return { sides, part, polygons: parts.map((p) => p.polygon), bare };
}

/** A side, or the piece of one a chair could stand along, remembering which side it came from. */
interface Stretch extends SeatSide {
  /** Its index in seatSides() — what `blocked` names. */
  of: number;
}

/** How often a side is tested for another shape standing against it, mm along it. */
const SEAM_STEP_MM = 100;

/** The pieces of a composite's sides a chair can actually stand on. A side's one midpoint probe says
 *  whether the WHOLE side is buried — right for a counter's end under its round, wrong for two
 *  rounds pushed together (one loop each, buried only at the pinch) or a long table with a short one
 *  against half of it. So each side is walked in SEAM_STEP_MM steps and a chair tried at each: its
 *  centre `offsetMm` out, its back half a chair further; where either lands inside another shape the
 *  stretch is covered, and the uncovered stretches between are the sides chairs are shared over. A
 *  stretch too short for one chair is covered too. A loop's two ends are one stretch when both are
 *  open, so the ring stays even across where the loop happened to start. */
function splitAtSeams(f: Footprint, offsetMm: number): Stretch[] {
  const { sides, part, polygons, bare } = compositeSides(f);
  if (polygons.length < 2) return sides.map((s, i) => ({ ...s, of: i }));
  const out: Stretch[] = [];
  sides.forEach((side, i) => {
    if (side.len <= 0 || bare[part[i]]) {
      out.push({ ...side, of: i });
      return;
    }
    const others = polygons.filter((_, pi) => pi !== part[i]);
    const n = Math.max(1, Math.ceil(side.len / SEAM_STEP_MM));
    const buried = Array.from({ length: n }, (_, k) => {
      const { on, nx, ny } = pointOnSide(side, ((k + 0.5) * side.len) / n);
      const at = (d: number) => ({ x: on.x + nx * d, y: on.y + ny * d });
      const seat = at(offsetMm);
      const back = at(offsetMm + CHAIR_D_MM / 2);
      return others.some((poly) => inside(seat, poly) || inside(back, poly));
    });
    if (buried.every((b) => b === buried[0])) {
      out.push({ ...side, covered: buried[0], of: i });
      return;
    }
    // Runs of equal answer, each a stretch of the side.
    const runs: { from: number; to: number; buried: boolean }[] = [];
    buried.forEach((b, k) => {
      const last = runs[runs.length - 1];
      if (last && last.buried === b) last.to = k + 1;
      else runs.push({ from: k, to: k + 1, buried: b });
    });
    const step = side.len / n;
    const slice = (from: number, to: number) => slicePolyline(side, from * step, to * step);
    const closed = dist(side.pts[0], side.pts[side.pts.length - 1]) < 1e-6;
    let pieces = runs.map((r) => ({ pts: slice(r.from, r.to), buried: r.buried }));
    if (closed && runs.length > 1 && runs[0].buried === runs[runs.length - 1].buried) {
      // The loop's start falls inside one run: join its two ends into one stretch, last then first.
      const head = pieces[0];
      const tail = pieces[pieces.length - 1];
      pieces = [{ pts: [...tail.pts, ...head.pts.slice(1)], buried: head.buried }, ...pieces.slice(1, -1)];
    }
    for (const piece of pieces) {
      const s = measureSide(piece.pts, side.orient, piece.buried);
      out.push({ ...s, covered: s.covered || s.len < CHAIR_W_MM, of: i });
    }
  });
  return out;
}

/** The points of a side between `from` and `to` mm along it, both ends included. */
function slicePolyline(side: SeatSide, from: number, to: number): Point[] {
  const pts: Point[] = [pointOnSide(side, from).on];
  let walked = 0;
  for (let i = 0; i < side.lengths.length; i++) {
    const end = walked + side.lengths[i];
    if (end > from + 1e-6 && end < to - 1e-6) pts.push(side.pts[i + 1]);
    walked = end;
  }
  pts.push(pointOnSide(side, to).on);
  return pts;
}

/** Split `count` between sides in proportion to their lengths, exactly — largest remainder, so the
 *  shares always add back up to `count` however the rounding falls. A side too short to earn one
 *  gets none, which is right: nobody seats the 60cm end of a narrow table. */
function apportion(lengths: number[], count: number): number[] {
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total <= 0) return lengths.map(() => 0);
  const exact = lengths.map((l) => (l / total) * count);
  const share = exact.map(Math.floor);
  let left = count - share.reduce((a, b) => a + b, 0);
  // Biggest fractional part first; ties fall to the longer side, which is where a chair fits best.
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e), len: lengths[i] }))
    .sort((a, b) => b.frac - a.frac || b.len - a.len);
  for (const o of order) {
    if (left <= 0) break;
    if (lengths[o.i] <= 0) continue;
    share[o.i]++;
    left--;
  }
  return share;
}

/** How many chairs one side can take without two of them sharing a floor tile — measured along the
 *  line the chairs actually stand on, not along the table edge. On a convex edge that line is longer
 *  than the edge; on a CONCAVE one — the inside of a ring — it is shorter, and on a small quarter
 *  ring it is shorter than a single chair. Shared out by edge length alone, that inner curve was
 *  handed three chairs to stack on one spot. */
export const SEAT_PITCH_MM = CHAIR_W_MM + 40;
function capacityOf(side: SeatSide, offsetMm: number): number {
  const STEPS = 32;
  let run = 0;
  let prev: Point | null = null;
  for (let k = 0; k <= STEPS; k++) {
    const { on, nx, ny } = pointOnSide(side, (k / STEPS) * side.len);
    const p = { x: on.x + nx * offsetMm, y: on.y + ny * offsetMm };
    if (prev) run += dist(prev, p);
    prev = p;
  }
  // A closed loop (a round table) is `run` of chairs end to end; an open side also gets one at each
  // end's half-pitch, which is the same count.
  return Math.floor(run / SEAT_PITCH_MM + 1e-9);
}

/** Proportional shares, then any side over its capacity hands the excess to sides with room — by
 *  length again among those. When every side is full the excess stays where it fell: the seat count
 *  is what the packing list orders, and the plan showing a crowded table is the plan telling the
 *  truth about it. */
function apportionCapped(lengths: number[], caps: number[], count: number): number[] {
  const share = apportion(lengths, count);
  for (let round = 0; round < lengths.length; round++) {
    let excess = 0;
    share.forEach((n, i) => {
      if (n > caps[i]) {
        excess += n - caps[i];
        share[i] = caps[i];
      }
    });
    if (excess === 0) return share;
    const room = lengths.map((l, i) => (share[i] < caps[i] ? l : 0));
    if (room.every((l) => l <= 0)) {
      // Nowhere left: put it back where length says, overflow and all.
      return apportion(lengths, count);
    }
    const extra = apportion(room, excess);
    extra.forEach((n, i) => (share[i] += n));
  }
  return share;
}

/** How a RECTANGLE shares its chairs out: [top, right, bottom, left], with top === bottom and
 *  left === right, matching the side order seatSides builds.
 *
 *  Chairs are apportioned in PAIRS — half the count, split between one width-side and one
 *  depth-side by length, then mirrored. An odd chair cannot be mirrored, so it goes on the longest
 *  side, where there is the most room for it and the asymmetry shows least.
 *
 *  With sides blocked there is no cross to lay, so the open sides share by length — and then any
 *  two OPPOSITE sides that are both still open even out between them, which is what keeps a head
 *  table with its back to the room from seating three at one end and two at the other. */
function apportionRect(widthMm: number, depthMm: number, count: number, open: boolean[]): number[] {
  if (open.every(Boolean)) {
    const pairs = Math.floor(count / 2);
    const [w, d] = apportion([widthMm, depthMm], pairs);
    const share = [w, d, w, d];
    if (count % 2 === 1) share[widthMm >= depthMm ? 0 : 1]++;
    return share;
  }
  const share = apportion([widthMm, depthMm, widthMm, depthMm].map((l, i) => (open[i] ? l : 0)), count);
  // A side whose opposite is blocked has nothing to mirror — the odd chair of a pair goes there.
  const lone = [0, 1, 2, 3].find((i) => open[i] && !open[(i + 2) % 4]);
  for (const [a, b] of [[0, 2], [1, 3]]) {
    if (!open[a] || !open[b]) continue;
    let both = share[a] + share[b];
    if (both % 2 === 1 && lone !== undefined) {
      both--;
      share[lone]++;
    }
    share[a] = Math.ceil(both / 2);
    share[b] = Math.floor(both / 2);
  }
  return share;
}

/**
 * `count` chairs around a footprint, each tucked `CHAIR_TUCK_MM` under its edge and facing it.
 *
 * Each open side takes a share proportional to its length and then centres it: `n` chairs on a
 * side of length `L` sit at `(k + 0.5) · L / n` from that side's own start, which is symmetric about
 * its midpoint and leaves the same margin at both corners. On a round table there is one side and
 * the same formula is the even ring.
 *
 * `blocked` are indices into seatSides(). The count is NOT reduced by them — it is what the packing
 * list orders, so the chairs move to the sides that are open. Every side blocked seats nobody on the
 * plan, which is what the designer said.
 */
export function seatsAround(
  footprint: Footprint,
  count: number,
  offsetMm = CHAIR_OFFSET_MM,
  blocked: readonly number[] = [],
): Seat[] {
  if (count <= 0) return [];
  // A composite's sides are cut where another of its shapes stands against them; everything else
  // is seated on its sides whole (the stretches are then the sides, one each).
  const sides: Stretch[] = footprint.kind === "multi" ? splitAtSeams(footprint, offsetMm) : seatSides(footprint).map((s, i) => ({ ...s, of: i }));
  const open = sides.map((s) => s.len > 0 && !s.covered && !blocked.includes(s.of));
  if (!open.some(Boolean)) return [];

  // A rectangle is laid in a cross; anything else is shared out by length alone.
  const share =
    footprint.kind === "rect"
      ? apportionRect(footprint.widthMm, footprint.depthMm, count, open)
      : apportionCapped(
          sides.map((s, i) => (open[i] ? s.len : 0)),
          sides.map((s, i) => (open[i] ? capacityOf(s, offsetMm) : 0)),
          count,
        );
  const seats: Seat[] = [];
  sides.forEach((side, i) => {
    const n = share[i];
    for (let k = 0; k < n; k++) {
      const { on, nx, ny } = pointOnSide(side, ((k + 0.5) * side.len) / n);
      seats.push({
        x: on.x + nx * offsetMm,
        y: on.y + ny * offsetMm,
        // Facing the table: the inward direction, which is the normal reversed.
        facingDeg: (Math.atan2(-ny, -nx) * 180) / Math.PI,
      });
    }
  });
  return seats;
}
