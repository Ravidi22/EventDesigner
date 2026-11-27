// npm run check:seats — the self-check of ./seating.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { footprintOutlines } from "./footprint";
import { buildArcOutline } from "./footprint";
import { CHAIR_D_MM, CHAIR_OFFSET_MM, CHAIR_TUCK_MM, seatsAround, seatSides, seatTransform, type Seat } from "./seating";

// ponytail: self-check. Run: node --experimental-strip-types lib/studio/seating.ts
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
// A 2.44 round seating sixteen puts every chair EXACTLY on one of its 96 vertices. Each takes the
// segment it reached the vertex by — the same one for all sixteen, so the ring is one ring, and
// the same on the server and in the browser (which decided a bare float tie differently).
const sixteen = seatsAround({ kind: "circle", diameterMm: 2440 }, 16);
const off = sixteen.map((s, k) => {
  const vertex = (k + 0.5) * 22.5;
  const normal = ((((s.facingDeg + 180) % 360) + 360) % 360);
  return Math.round((normal - vertex) * 1000) / 1000;
});
assert(off.every((d) => d === -1.875), `every chair on a vertex takes the segment before it (${off.join(", ")})`);
assert(seatTransform({ x: 1.23456, y: -0.0004, facingDeg: 90.00049 }) === "translate(1.235 0) rotate(90)", "the transform string is rounded to a thousandth");
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

// A table with a line drawn beside it (a rope, a rail): the line takes no chairs, the table all.
const withLine = { kind: "multi" as const, parts: [
  { outline: [{ x: -1000, y: -400 }, { x: 1000, y: -400 }, { x: 1000, y: 400 }, { x: -1000, y: 400 }] },
  { outline: [{ x: -1000, y: -1210 }, { x: 1000, y: -1210 }, { x: 1000, y: -1190 }, { x: -1000, y: -1190 }] },
] };
const lineSeats = seatsAround(withLine, 8, 300);
assert(lineSeats.length === 8 && lineSeats.every((s) => s.y > -1000), "a line in the item seats nobody — the table seats them all");
const linesOnly = { kind: "custom" as const, open: true, outline: [{ x: 0, y: 0 }, { x: 0, y: 1000 }, { x: 2000, y: 1000 }, { x: 2000, y: 0 }] };
assert(seatSides(linesOnly).every((s) => s.covered), "a lines-only drawing has no side to sit at");

// Two rounds pushed together: each is one loop, buried only at the pinch — the chairs go round
// both and none stands where the rims meet.
const twoRounds = { kind: "multi" as const, parts: [
  ...footprintOutlines({ kind: "circle", diameterMm: 1800 }).map((o) => ({ ...o, outline: o.outline.map((p) => ({ x: p.x - 900, y: p.y })) })),
  ...footprintOutlines({ kind: "circle", diameterMm: 1800 }).map((o) => ({ ...o, outline: o.outline.map((p) => ({ x: p.x + 900, y: p.y })) })),
] };
const twoSeats = seatsAround(twoRounds, 20);
assert(twoSeats.length === 20, "two rounds seat twenty");
assert(
  twoSeats.every((s) => (s.x < 0 ? Math.hypot(s.x - 900, s.y) : Math.hypot(s.x + 900, s.y)) >= 900 + CHAIR_D_MM / 2 - 20),
  "…and none of them in the pinch, standing in the other table",
);
assert(twoSeats.filter((s) => s.x < 0).length === 10, "…ten round each");
// A short table against half of a long one: the long side's other half still seats.
const halfCovered = { kind: "multi" as const, parts: [
  { outline: [{ x: -1200, y: -600 }, { x: 1200, y: -600 }, { x: 1200, y: 600 }, { x: -1200, y: 600 }] },
  { outline: [{ x: 0, y: 600 }, { x: 1200, y: 600 }, { x: 1200, y: 1800 }, { x: 0, y: 1800 }] },
] };
const hcSeats = seatsAround(halfCovered, 14);
assert(hcSeats.some((s) => s.y > 600 && s.y < 700 && s.x < 0), "the uncovered half of a half-covered side still takes chairs");
assert(!hcSeats.some((s) => s.y > 600 && s.y < 700 && s.x > 0 && s.x < 1200), "…and the covered half takes none");

console.log("seating self-check passed");
