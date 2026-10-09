import type { BuiltOutline, Footprint } from "./footprint";
import { flattenEdge, footprintOutlines } from "./footprint";
import { absoluteControlPoints } from "./geometry";
import type { EdgeCurve, Point } from "./hall";
import { isMain } from "../self-check";
import { buildArcOutline } from "./footprint";

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
  while (seg < lengths.length - 1 && walked + lengths[seg] < along) {
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
  const measure = (pts: Point[], orient: number, covered = false): SeatSide => {
    const lengths = pts.slice(0, -1).map((p, i) => dist(p, pts[i + 1]));
    return { pts, lengths, len: lengths.reduce((a, b) => a + b, 0), orient, covered };
  };

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

  const parts = footprintOutlines(f).map(outlineSides);
  const out: SeatSide[] = [];
  parts.forEach((part, pi) => {
    for (const pts of part.sides) {
      const side = measure(pts, part.orient);
      if (parts.length > 1 && side.len > 0) {
        const { on, nx, ny } = pointOnSide(side, side.len / 2);
        const probe = { x: on.x + nx * SEAM_PROBE_MM, y: on.y + ny * SEAM_PROBE_MM };
        side.covered = parts.some((other, oi) => oi !== pi && inside(probe, other.polygon));
      }
      out.push(side);
    }
  });
  return out;
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
  const sides = seatSides(footprint);
  const open = sides.map((s, i) => s.len > 0 && !s.covered && !blocked.includes(i));
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

// ponytail: self-check. Run: node --experimental-strip-types lib/studio/seating.ts
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

  assert(seatsAround({ kind: "circle", diameterMm: 1800 }, 0).length === 0, "no seats, no chairs");
  assert(seatsAround({ kind: "circle", diameterMm: 1800 }, -3).length === 0, "…nor for a nonsense count");

  // A 1.80m round seating twelve: twelve chairs, all on one ring, evenly spaced.
  const round = seatsAround({ kind: "circle", diameterMm: 1800 }, 12, 330);
  assert(round.length === 12, "twelve seats, twelve chairs");
  const radii = round.map((s) => Math.hypot(s.x, s.y));
  assert(radii.every((r) => near(r, 1230, 12)), "every chair sits the same distance out from a round table");
  const angles = round.map((s) => (Math.atan2(s.y, s.x) * 180) / Math.PI).map((a) => (a + 360) % 360).sort((a, b) => a - b);
  const steps = angles.map((a, i) => (i === 0 ? a + 360 - angles[angles.length - 1] : a - angles[i - 1]));
  assert(steps.every((d) => near(d, 30, 1)), "…and they are evenly spaced round it");
  // Facing the table: the chair's heading points back at the centre.
  assert(
    round.every((s) => {
      const toCentre = ((Math.atan2(-s.y, -s.x) * 180) / Math.PI + 360) % 360;
      return near(((s.facingDeg % 360) + 360) % 360, toCentre, 2);
    }),
    "every chair faces the table",
  );

  // A long banquet table: the chairs go where the length is, and each is square to its own side.
  const knight = seatsAround({ kind: "rect", widthMm: 4800, depthMm: 1200 }, 16, 330);
  assert(knight.length === 16, "sixteen seats, sixteen chairs");
  const onSides = knight.filter((s) => near(Math.abs(s.y), 930, 1)).length;
  const onEnds = knight.filter((s) => near(Math.abs(s.x), 2730, 1)).length;
  assert(onSides + onEnds === 16, "every chair is against one edge or another");
  assert(onSides === 12 && onEnds === 4, "the long sides take their share of the chairs, the ends take theirs");
  assert(knight.every((s) => Math.abs(s.x) <= 2730 + 1 && Math.abs(s.y) <= 930 + 1), "…and none of them is out past a corner");
  // Square to the side: a chair on the long side faces straight across it, not diagonally.
  const northSide = knight.filter((s) => near(s.y, -930, 1));
  assert(northSide.every((s) => near(((s.facingDeg % 360) + 360) % 360, 90, 1)), "a chair on the long side sits square to it");

  // A square table hands each of its four equal sides an equal share.
  const square = seatsAround({ kind: "rect", widthMm: 1600, depthMm: 1600 }, 8, 300);
  const squareSides = [
    square.filter((s) => near(s.y, -1100, 1)),
    square.filter((s) => near(s.y, 1100, 1)),
    square.filter((s) => near(s.x, -1100, 1)),
    square.filter((s) => near(s.x, 1100, 1)),
  ];
  assert(squareSides.map((g) => g.length).join(",") === "2,2,2,2", "a square table seats two a side");

  // ── centred on each side ──────────────────────────────────────────────────────────────────────
  // The thing a single walk round the perimeter got wrong: it carried its running distance across
  // every corner, so each side inherited the previous side's phase and its chairs sat off to one
  // end of it. A side's chairs are symmetric about its own midpoint now, whatever else is going on.
  const centred = (group: Seat[], axis: "x" | "y") => {
    const vals = group.map((g) => g[axis]);
    return near(vals.reduce((a, b) => a + b, 0) / vals.length, 0, 1);
  };
  assert(centred(squareSides[0], "x") && centred(squareSides[1], "x"), "a square's top and bottom chairs centre on their side");
  assert(centred(squareSides[2], "y") && centred(squareSides[3], "y"), "…and so do the two down its sides");
  // Two a side on a 1600 edge means quarter and three-quarter points: ±400 from the middle.
  assert(
    squareSides[0].map((g) => Math.round(g.x)).sort((a, b) => a - b).join(",") === "-400,400",
    "…at the quarter points of the edge, with equal air at both corners",
  );

  // ── laid in a cross ───────────────────────────────────────────────────────────────────────────
  // Opposite sides always match, whatever the count does. Shared out by length alone a square
  // seating six lands 2,2,1,1 with the heavy sides adjacent, which reads as a mistake.
  const sidesFor = (f: Parameters<typeof seatsAround>[0], n: number, w: number, d: number) => {
    const out = seatsAround(f, n, 300);
    return [
      out.filter((g) => near(g.y, -(d / 2 + 300), 1)).length, // top
      out.filter((g) => near(g.x, w / 2 + 300, 1)).length, // right
      out.filter((g) => near(g.y, d / 2 + 300, 1)).length, // bottom
      out.filter((g) => near(g.x, -(w / 2 + 300), 1)).length, // left
    ];
  };
  const cross = (share: number[]) => share[0] === share[2] && share[1] === share[3];

  const six = sidesFor({ kind: "rect", widthMm: 1600, depthMm: 1600 }, 6, 1600, 1600);
  assert(six.reduce((a, b) => a + b, 0) === 6, "six seats, six chairs");
  assert(cross(six), "a square seating six is laid in a cross, not lopsided");
  assert(six.join(",") === "2,1,2,1", "…two facing two, one facing one");

  assert(cross(sidesFor({ kind: "rect", widthMm: 1600, depthMm: 1600 }, 8, 1600, 1600)), "…and so is one seating eight");
  assert(cross(sidesFor({ kind: "rect", widthMm: 4800, depthMm: 1200 }, 16, 4800, 1200)), "an אביר is too");
  assert(
    sidesFor({ kind: "rect", widthMm: 4800, depthMm: 1200 }, 16, 4800, 1200).join(",") === "6,2,6,2",
    "…with the long sides taking most of them",
  );
  assert(cross(sidesFor({ kind: "rect", widthMm: 2400, depthMm: 1200 }, 10, 2400, 1200)), "…and a 240×120 seating ten");

  // An odd count cannot mirror. It goes on the longest side rather than wherever the rounding fell.
  const odd = sidesFor({ kind: "rect", widthMm: 2400, depthMm: 1200 }, 9, 2400, 1200);
  assert(odd.reduce((a, b) => a + b, 0) === 9, "nine seats, nine chairs");
  assert(odd[0] === odd[2] + 1 && odd[1] === odd[3], "the odd chair lands on a long side, everything else still mirrors");

  // Same on a table whose sides are NOT equal: each side still centres on itself.
  const oblong = seatsAround({ kind: "rect", widthMm: 1800, depthMm: 1200 }, 8, 300);
  const oblongTop = oblong.filter((s) => near(s.y, -900, 1));
  const oblongLeft = oblong.filter((s) => near(s.x, -1200, 1));
  assert(oblong.length === 8, "eight seats, eight chairs");
  assert(centred(oblongTop, "x") && centred(oblongLeft, "y"), "an oblong centres every side too");
  assert(
    oblong.every((g) => Math.abs(g.x) <= 1200 + 1 && Math.abs(g.y) <= 900 + 1),
    "…and no chair is pushed out past a corner",
  );

  // The long banquet table, where the phase error used to be most visible.
  assert(centred(knight.filter((g) => near(g.y, -930, 1)), "x"), "the אביר's long side centres its own chairs");
  assert(centred(knight.filter((g) => near(g.x, 2730, 1)), "y"), "…and so does its end");

  // A custom outline is walked like any other — the chairs follow the shape that is actually drawn.
  // This is the base library's חצי עיגול: a chord with two quarter-arc beziers over it (K is the
  // standard 0.5523×r approximation), recentred on its own bounding box the way the renderer does.
  const K = Math.round(0.5523 * 600);
  const halfRoundFootprint = {
    kind: "custom" as const,
    outline: [{ x: -600, y: 0 }, { x: 600, y: 0 }, { x: 0, y: -600 }],
    edgeCurves: [null, { c1: { x: 0, y: -K }, c2: { x: K, y: 0 } }, { c1: { x: -K, y: 0 }, c2: { x: 0, y: -K } }],
  };
  const halfRound = seatsAround(halfRoundFootprint, 4, 300);
  assert(halfRound.length === 4, "a custom shape gets its chairs too");
  assert(halfRound.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y)), "…at real coordinates");
  // The bow is followed, not cut across. Recentred on its own bounding box the arc has radius 600
  // about (0, 300) — the midpoint of the chord — so a chair on it should sit at 600 + the offset
  // from that point. Walking the chord instead would put it ~175mm short of the real edge, which at
  // this size means drawn under the table.
  const arcSeats = halfRound.filter((s) => s.y < 300);
  assert(arcSeats.length >= 2, "the arc takes its share of the chairs");
  assert(
    arcSeats.every((s) => near(Math.hypot(s.x, s.y - 300), 900, 25)),
    "a chair on the bow sits on the bow, not on the chord it cuts",
  );
  const chordSeats = halfRound.filter((s) => s.y >= 300);
  assert(chordSeats.length >= 1 && chordSeats.every((s) => near(s.y, 600, 1)), "…and one on the flat edge is against the flat edge");

  // The default offset tucks the seat under the table rather than parking it outside: its inner
  // edge lands INSIDE the 900mm radius, its outer edge outside.
  const tucked = seatsAround({ kind: "circle", diameterMm: 1800 }, 8);
  const centre = Math.hypot(tucked[0].x, tucked[0].y);
  assert(near(centre, 900 + CHAIR_OFFSET_MM, 1), "a chair sits at the table edge plus the offset");
  assert(centre - CHAIR_D_MM / 2 < 900, "…with its inner edge under the table");
  assert(near(900 - (centre - CHAIR_D_MM / 2), CHAIR_TUCK_MM, 1), "…by exactly the tuck");
  assert(centre + CHAIR_D_MM / 2 > 900, "…and its back outside it");

  // A degenerate footprint cannot place a chair, and must not try.
  assert(seatsAround({ kind: "rect", widthMm: 0, depthMm: 0 }, 6).length === 0, "a table with no size seats nobody");

  // ── sides, and the ones nobody sits at ──────────────────────────────────────────────────────
  // A חצי עיגול is two sides to anyone at it — the flat one and the bow — however many edges its
  // outline was cut into to keep its apex a vertex.
  assert(seatSides(halfRoundFootprint).length === 2, "a half round is two sides: the chord and the bow");
  assert(seatSides({ kind: "rect", widthMm: 1800, depthMm: 1200 }).length === 4, "a rectangle is four");
  assert(seatSides({ kind: "circle", diameterMm: 1800 }).length === 1, "a round table is one");

  // A head table with its back to the room: nothing on the top side, and the ten chairs it seats
  // still all at the table — the count is what the packing list orders.
  const head = seatsAround({ kind: "rect", widthMm: 2400, depthMm: 1200 }, 10, 300, [0]);
  assert(head.length === 10, "a blocked side moves its chairs, it does not lose them");
  assert(head.every((s) => s.y > -900 + 1), "…and none of them sits along the blocked side");
  const headEnds = [head.filter((s) => near(s.x, -1500, 1)).length, head.filter((s) => near(s.x, 1500, 1)).length];
  assert(headEnds[0] === headEnds[1], `…with the two open ends still matching (${headEnds})`);
  assert(seatsAround({ kind: "rect", widthMm: 2400, depthMm: 1200 }, 10, 300, [0, 1, 2, 3]).length === 0, "every side blocked seats nobody on the plan");
  assert(seatsAround({ kind: "circle", diameterMm: 1800 }, 10, 300, [7]).length === 10, "an index past the last side blocks nothing");

  // The ring from the reference photo: a half ring 4m across, 75cm deep, chairs on both arcs and
  // none on the two short caps. Every chair faces the band — the outer ones inward, the inner ones
  // OUT toward the middle of the ring, which is where the band is from there.
  const ringFootprint = { kind: "custom" as const, ...buildArcOutline(4000, { sweepDeg: 180, bandMm: 750 }) };
  const ringSides = seatSides(ringFootprint);
  assert(ringSides.length === 4, `a ring piece is four sides: outer arc, cap, inner arc, cap (${ringSides.length})`);
  const caps = ringSides.map((s, i) => ({ i, len: s.len })).filter((s) => s.len < 800).map((s) => s.i);
  assert(caps.length === 2, "…two of them the short caps across the band");
  const ringSeats = seatsAround(ringFootprint, 20, 300, caps);
  assert(ringSeats.length === 20, "twenty seats, twenty chairs");
  // Recentred on its box, the ring's centre is at (0, 1000).
  const fromCentre = ringSeats.map((s) => Math.hypot(s.x, s.y - 1000));
  const outer = fromCentre.filter((r) => near(r, 2000 + 300, 30)).length;
  const inner = fromCentre.filter((r) => near(r, 1250 - 300, 30)).length;
  assert(outer + inner === 20 && outer > inner && inner > 0, `chairs ring both arcs, more on the longer one (${outer} out, ${inner} in)`);
  const faces = (s: Seat, tx: number, ty: number) => {
    const want = (Math.atan2(ty - s.y, tx - s.x) * 180) / Math.PI;
    return near((((s.facingDeg - want) % 360) + 540) % 360 - 180, 0, 3);
  };
  assert(
    ringSeats.every((s) => (Math.hypot(s.x, s.y - 1000) > 1600 ? faces(s, 0, 1000) : !faces(s, 0, 1000))),
    "outer chairs face the ring's centre, inner chairs face away from it — both toward the band",
  );

  // A small quarter ring: its inner curve is shorter at the chair line than one chair is wide, so it
  // seats nobody and the outer curve takes the lot — rather than three chairs stacked on one spot.
  const smallQuarter = { kind: "custom" as const, ...buildArcOutline(1800, { sweepDeg: 90, bandMm: 600 }) };
  const sqSides = seatSides(smallQuarter);
  const sqCaps = sqSides.map((s, i) => (s.pts.length === 2 ? i : -1)).filter((i) => i >= 0);
  const sqSeats = seatsAround(smallQuarter, 3, 300, sqCaps);
  assert(sqSeats.length === 3, "a small quarter ring still seats its count");
  // Recentred on its box; its circle's centre sits below it. Inner chairs would be within 900mm of it.
  const sqCentreY = (() => {
    const o = buildArcOutline(1800, { sweepDeg: 90, bandMm: 600 }).outline[0];
    return o.y + Math.sqrt(900 ** 2 - o.x ** 2);
  })();
  assert(sqSeats.every((s) => Math.hypot(s.x, s.y - sqCentreY) > 900), "…all of them on the outer curve, none crammed on the inner");

  // Two shapes, one item: a counter and a round end. The seam where they meet is not a side.
  const combo = { kind: "multi" as const, parts: [
    { outline: [{ x: -1250, y: -300 }, { x: 750, y: -300 }, { x: 750, y: 300 }, { x: -1250, y: 300 }] },
    ...footprintOutlines({ kind: "circle", diameterMm: 1000 }).map((o) => ({ ...o, outline: o.outline.map((p) => ({ x: p.x + 750, y: p.y })) })),
  ] };
  const comboSides = seatSides(combo);
  assert(comboSides.filter((s) => s.covered).length === 1, "the counter's end under the round is the one buried side");
  const comboSeats = seatsAround(combo, 10, 300);
  assert(comboSeats.length === 10, "a composite item seats its whole count");
  assert(
    comboSeats.every((s) => !(Math.abs(s.x - 750) < 200 && Math.abs(s.y) < 300)),
    "…and nobody sits in the seam between its two shapes",
  );

  console.log("seating self-check passed");
}
