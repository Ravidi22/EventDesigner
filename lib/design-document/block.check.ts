// npm run check:block — the self-check of ./block.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "./types";
import { footprintOutlines, type BuiltOutline, type Footprint } from "../studio/footprint";
import { CHAIR_D_MM, CHAIR_OFFSET_MM, type Seat } from "../studio/seating";
import { blockFrame, blockLabelPoint, blockOutline, blockSeats, blockSpine, RAD, type BlockFrame } from "./block";

// ponytail: self-check. Run: npm run check:block
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
const rect = (widthMm: number, depthMm: number): Footprint => ({ kind: "rect", widthMm, depthMm });
const round = (diameterMm: number): Footprint => ({ kind: "circle", diameterMm });
const turn = (p: Point, deg: number): Point => ({ x: p.x * Math.cos(deg * RAD) - p.y * Math.sin(deg * RAD), y: p.x * Math.sin(deg * RAD) + p.y * Math.cos(deg * RAD) });
const inRoom = (b: BlockFrame, s: Seat): Point => {
  const q = turn({ x: s.x, y: s.y }, b.rotation);
  return { x: b.centre.x + q.x, y: b.centre.y + q.y };
};

// Two 240×120 end to end: one 480×120 block, seated on the outside only.
const pair = blockFrame([
  { id: "a", footprint: rect(2400, 1200), position: { x: -1200, y: 0 } },
  { id: "b", footprint: rect(2400, 1200), position: { x: 1200, y: 0 } },
])!;
assert(near(pair.widthMm, 4800) && near(pair.depthMm, 1200) && near(pair.centre.x, 0) && near(pair.centre.y, 0), "two 240×120 end to end box as 480×120 about their middle");
const seats = blockSeats(pair, 20);
assert(seats.length === 20, "the block seats what its members seat");
assert(seats.every((s) => Math.abs(s.x) > 2400 - 1 || Math.abs(s.y) > 600 - 1), "…and no chair sits in the seam between them");
assert(seats.filter((s) => s.y < -600).length === seats.filter((s) => s.y > 600).length, "…the long sides seated alike");
assert(seats.some((s) => s.x < -2400) && seats.some((s) => s.x > 2400), "…and the two outer ends seated too");

// The same block turned 30°: the chairs turn with it.
const turned = blockFrame([
  { id: "a", footprint: rect(2400, 1200), position: turn({ x: -1200, y: 0 }, 30), rotation: 30 },
  { id: "b", footprint: rect(2400, 1200), position: turn({ x: 1200, y: 0 }, 30), rotation: 30 },
])!;
assert(turned.rotation === 30 && near(turned.widthMm, 4800) && near(turned.depthMm, 1200), "a turned block is boxed in its own frame, not the room's");
const turnedSeats = blockSeats(turned, 20);
assert(turnedSeats.length === 20, "…seats the same twenty");
assert(
  turnedSeats.every((s) => {
    const r = inRoom(turned, s);
    const local = turn(r, -30);
    return near(Math.abs(local.y), 600 + CHAIR_OFFSET_MM, 2) || near(Math.abs(local.x), 2400 + CHAIR_OFFSET_MM, 2);
  }),
  "…each chair pushed in against the turned block's own edge",
);

// A head table's blocked back: the members' blocked sides carry across. Side 0 of a rectangle is
// its top (−y); block it on both and the chairs go to the front and the ends.
const head = blockFrame([
  { id: "a", footprint: rect(2400, 1200), position: { x: -1200, y: 0 }, blockedSides: [0] },
  { id: "b", footprint: rect(2400, 1200), position: { x: 1200, y: 0 }, blockedSides: [0] },
])!;
assert(head.blocked.length === 2 && head.blocked.includes(0) && head.blocked.includes(4), "each member's blocked side is a side of the whole");
const headSeats = blockSeats(head, 10);
assert(headSeats.length === 10 && headSeats.every((s) => s.y > -600), "a head table block has no chair behind it");

// Two rounds pushed together are seated round two circles, not round a rectangle.
const rounds = blockFrame([
  { id: "a", footprint: round(1800), position: { x: -900, y: 0 } },
  { id: "b", footprint: round(1800), position: { x: 900, y: 0 } },
])!;
const roundSeats = blockSeats(rounds, 20);
assert(roundSeats.length === 20, "two rounds seat twenty");
assert(
  roundSeats.every((s) => near(Math.hypot(s.x + 900, s.y), 900 + CHAIR_OFFSET_MM, 25) || near(Math.hypot(s.x - 900, s.y), 900 + CHAIR_OFFSET_MM, 25)),
  "…every chair on one rim or the other",
);
assert(
  roundSeats.every((s) => (s.x < 0 ? Math.hypot(s.x - 900, s.y) : Math.hypot(s.x + 900, s.y)) >= 900 + CHAIR_D_MM / 2 - 20),
  "…and none in the pinch, standing in the other table",
);

// A mirrored member is placed as its mirror image: a ח open on the right, flipped, is open on the left.
const u: Footprint = { kind: "custom", outline: [{ x: -600, y: -300 }, { x: 600, y: -300 }, { x: 600, y: 300 }, { x: 300, y: 300 }, { x: 300, y: -100 }, { x: -300, y: -100 }, { x: -300, y: 300 }, { x: -600, y: 300 }] };
const flipped = blockFrame([{ id: "u", footprint: u, position: { x: 0, y: 0 }, mirrored: true }, { id: "r", footprint: rect(600, 200), position: { x: 0, y: -400 } }])!;
const mirroredPart = (flipped.footprint as { parts: BuiltOutline[] }).parts[0].outline;
const original = footprintOutlines(u)[0].outline;
assert(mirroredPart.every((p, i) => near(p.x, -original[i].x - (flipped.centre.x), 1)), "a mirrored member's points are mirrored across its own width");

// A single member is itself: same box, same chairs as seating it alone.
const lone = blockFrame([{ id: "a", footprint: rect(1800, 900), position: { x: 500, y: 700 }, rotation: 90 }])!;
assert(near(lone.centre.x, 500) && near(lone.centre.y, 700) && lone.rotation === 90 && near(lone.widthMm, 1800) && near(lone.depthMm, 900), "one member is its own block");
assert(blockSeats(lone, 8).length === 8, "…and seats as itself");

assert(blockFrame([]) === null, "no members, no block");

// ONE shape: the number and the spine read the block, never its largest member.
const pairOne = blockOutline(pair);
assert(pairOne?.kind === "rect" && near(pairOne.widthMm, 4800) && near(pairOne.depthMm, 1200), "two 240×120 end to end are one 480×120 rectangle");
const pairLabel = blockLabelPoint(pair);
assert(near(pairLabel.x, 0) && near(pairLabel.y, 0), "…numbered at its middle, on the seam");
const pairSpine = blockSpine(pair);
assert(near(pairSpine[0].x, -2400) && near(pairSpine[pairSpine.length - 1].x, 2400), "…and spread along its whole length, not one half");
// A ח of three: the number goes mid-run on the top table, not in the air between the legs.
const het = blockFrame([
  { id: "top", footprint: rect(3000, 900), position: { x: 0, y: -600 } },
  { id: "l", footprint: rect(900, 1200), position: { x: -1050, y: 450 } },
  { id: "r", footprint: rect(900, 1200), position: { x: 1050, y: 450 } },
])!;
assert(blockOutline(het)?.kind === "custom", "a ח of three is one outline");
const hetLabel = blockLabelPoint(het);
const hetTop = { x: 0 - het.centre.x, y: -600 - het.centre.y };
assert(Math.abs(hetLabel.x - hetTop.x) < 300 && Math.abs(hetLabel.y - hetTop.y) < 400, "…numbered on its top run, not between its legs");
// Rounds that only touch make no one outline: the number stands on a table, never on the kiss.
assert(blockOutline(rounds) === null, "two rounds touching at a point are not one outline");
const roundLabel = blockLabelPoint(rounds);
assert(near(Math.abs(roundLabel.x), 900, 30) && near(roundLabel.y, 0, 30), "…numbered at the middle of one of them");
console.log("block self-check passed");
