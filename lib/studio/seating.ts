import type { Footprint } from "./footprint";
import { customShapeBounds } from "./footprint";
import { absoluteControlPoints } from "./geometry";
import type { EdgeCurve, Point } from "./hall";
import { isMain } from "../self-check";

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

const CIRCLE_STEPS = 96; // fine enough that a sampled circle is a circle at any zoom a hall is seen at
const CURVE_STEPS = 16; // per bowed edge of a custom outline

const cubicAt = (t: number, a: Point, c1: Point, c2: Point, b: Point): Point => {
  const u = 1 - t;
  const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
  return {
    x: w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x,
    y: w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y,
  };
};

/** The footprint's edges, in its own centred frame — one open polyline per SIDE, each walked from
 *  its own start so the chairs on it can be centred on it.
 *
 *  A rectangle has four. A circle has ONE, the whole loop, which is why a round table still gets the
 *  even ring it always did. A custom shape has one per edge of its outline.
 *
 *  A BOWED EDGE IS SAMPLED, not shortened to its chord. The one custom shape in the base library is
 *  the חצי עיגול, whose outline is two quarter-arcs over a chord — walking the chord instead puts
 *  its chairs up to 175mm inside the table, which at that size means they vanish under it. The
 *  flattening lives here because this is the only caller that needs one: everything else draws the
 *  curve, and SVG can draw a bezier. */
function sidesOf(f: Footprint): Point[][] {
  if (f.kind === "circle" || f.kind === "ellipse") {
    const rx = (f.kind === "circle" ? f.diameterMm : f.widthMm) / 2;
    const ry = (f.kind === "circle" ? f.diameterMm : f.depthMm) / 2;
    const loop = Array.from({ length: CIRCLE_STEPS + 1 }, (_, i) => {
      const a = (i / CIRCLE_STEPS) * Math.PI * 2;
      return { x: Math.cos(a) * rx, y: Math.sin(a) * ry };
    });
    return [loop]; // closed by repeating the first point — one side, walked all the way round
  }
  if (f.kind === "custom") {
    const b = customShapeBounds(f.outline);
    const at = (i: number) => ({ x: f.outline[i].x - b.cx, y: f.outline[i].y - b.cy });
    return f.outline.map((_, i) => {
      const a = at(i);
      const end = at((i + 1) % f.outline.length);
      // Offsets are relative to the edge's OWN endpoints (the EdgeCurve convention), so they
      // survive the recentring above untouched.
      const curve: EdgeCurve | null = f.edgeCurves?.[i] ?? null;
      if (!curve) return [a, end];
      const { c1, c2 } = absoluteControlPoints(a, end, curve);
      const pts = [a];
      for (let k = 1; k < CURVE_STEPS; k++) pts.push(cubicAt(k / CURVE_STEPS, a, c1, c2, end));
      pts.push(end);
      return pts;
    });
  }
  const w = f.widthMm / 2;
  const d = f.depthMm / 2;
  const c = [
    { x: -w, y: -d },
    { x: w, y: -d },
    { x: w, y: d },
    { x: -w, y: d },
  ];
  return [
    [c[0], c[1]],
    [c[1], c[2]],
    [c[2], c[3]],
    [c[3], c[0]],
  ];
}

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

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
    share[o.i]++;
    left--;
  }
  return share;
}

/** How a RECTANGLE shares its chairs out: [top, right, bottom, left], with top === bottom and
 *  left === right, matching the side order sidesOf builds.
 *
 *  Chairs are apportioned in PAIRS — half the count, split between one width-side and one
 *  depth-side by length, then mirrored. An odd chair cannot be mirrored, so it goes on the longest
 *  side, where there is the most room for it and the asymmetry shows least. */
function apportionRect(widthMm: number, depthMm: number, count: number): number[] {
  const pairs = Math.floor(count / 2);
  const [w, d] = apportion([widthMm, depthMm], pairs);
  const share = [w, d, w, d];
  if (count % 2 === 1) share[widthMm >= depthMm ? 0 : 1]++;
  return share;
}

/** A point `along` one side, with the outward normal of the segment it landed on. */
function walkSide(pts: Point[], lengths: number[], along: number, offsetMm: number): Seat {
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
  const on = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };

  // The edge's OWN normal, turned to point away from the middle of the shape. Not the direction
  // from the centre: at the corner of a long banquet table those differ by nearly 45°, and a chair
  // square to the side it belongs to is the difference between a plan that reads and one that looks
  // knocked over.
  let nx = (b.y - a.y) / len;
  let ny = -(b.x - a.x) / len;
  if (nx * on.x + ny * on.y < 0) {
    nx = -nx;
    ny = -ny;
  }
  return {
    x: on.x + nx * offsetMm,
    y: on.y + ny * offsetMm,
    // Facing the table: the inward direction, which is the normal reversed.
    facingDeg: (Math.atan2(-ny, -nx) * 180) / Math.PI,
  };
}

/**
 * `count` chairs around a footprint, each tucked `CHAIR_TUCK_MM` under its edge and facing it.
 *
 * Each side takes a share proportional to its length and then centres it: `n` chairs on a side of
 * length `L` sit at `(k + 0.5) · L / n` from that side's own start, which is symmetric about its
 * midpoint and leaves the same margin at both corners. On a round table there is one side and the
 * same formula is the even ring.
 */
export function seatsAround(footprint: Footprint, count: number, offsetMm = CHAIR_OFFSET_MM): Seat[] {
  if (count <= 0) return [];
  const sides = sidesOf(footprint)
    .map((pts) => {
      const lengths = pts.slice(0, -1).map((p, i) => dist(p, pts[i + 1]));
      return { pts, lengths, len: lengths.reduce((a, b) => a + b, 0) };
    })
    .filter((s) => s.len > 0);
  if (sides.length === 0) return [];

  // A rectangle is laid in a cross; anything else is shared out by length alone.
  const share =
    footprint.kind === "rect" && sides.length === 4
      ? apportionRect(footprint.widthMm, footprint.depthMm, count)
      : apportion(sides.map((s) => s.len), count);
  const seats: Seat[] = [];
  sides.forEach((side, i) => {
    const n = share[i];
    for (let k = 0; k < n; k++) {
      seats.push(walkSide(side.pts, side.lengths, ((k + 0.5) * side.len) / n, offsetMm));
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

  console.log("seating self-check passed");
}
