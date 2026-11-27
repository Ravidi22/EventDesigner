// npm run check:collide — the self-check of ./collide.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { FLOOR_COVER, mayOverlap, nudgeApart, overlappingAtStart, pushApart, WALL_SOLID, wallSolids, type SolidBox } from "./collide";

// ponytail: self-check. Run: node --experimental-strip-types lib/studio/collide.ts
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const deck = (x: number, y: number, solid = "stage", w = 4000, d = 2000): SolidBox => ({ x, y, widthMm: w, depthMm: d, solid });

// Clear of everything: nothing to say.
assert(pushApart([deck(9000, 0)], [deck(0, 0)]).x === 0, "a deck standing clear is left alone");
assert(pushApart([deck(9000, 0)], []).y === 0, "…and so is one with nothing to hit");

// Exactly flush is LEGAL — it is the answer the snap was aiming for.
const flush = pushApart([deck(4000, 0)], [deck(0, 0)]);
assert(flush.x === 0 && flush.y === 0, "two decks touching edge to edge are not overlapping");

// Pushed 500 into its neighbour, it comes back out to flush — along x, the shorter way out.
const nudged = pushApart([deck(3500, 0)], [deck(0, 0)]);
assert(nudged.x === 500 && nudged.y === 0, "a deck pushed into another is put back against it");
assert(3500 + nudged.x - 4000 / 2 === 0 + 4000 / 2, "…exactly flush, no gap invented");

// From the other side it goes the other way.
assert(pushApart([deck(-3500, 0)], [deck(0, 0)]).x === -500, "…and out the way it came in");

// The SHORTER axis wins: a deck sitting slightly low over another leaves through the y, even
// though it is deep inside on x.
const shallow = pushApart([deck(200, 1900)], [deck(0, 0)]);
assert(shallow.x === 0 && shallow.y === 100, "it leaves by the nearest edge, not the furthest");

// ONE DELTA for a whole selection, and the selection keeps its shape.
const block = [deck(0, 0), deck(4000, 0)]; // two decks already butted into one platform
const together = pushApart(block, [deck(7500, 0)]);
assert(together.x === -500, "a block pushed into something stops as a block");
assert(together.y === 0, "…without shearing, because there is only ever one delta");

// Different kinds pass through each other: a chuppah stands on a stage, and that is not a bug.
assert(pushApart([deck(3500, 0, "chuppah")], [deck(0, 0, "stage")]).x === 0, "a chuppah may stand on a stage");
assert(pushApart([deck(3500, 0, "stage")], [deck(0, 0, "stage")]).x === 500, "…but a stage may not stand on a stage");

// A 4m hole between two decks, and a 4m deck pushed at the left-hand one: it settles in the hole,
// flush with both. The gap a run of modules leaves is exactly one module wide, so this is the
// ordinary case and not a corner of one.
const between = pushApart([deck(3500, 0)], [deck(0, 0), deck(8000, 0)]);
const at = 3500 + between.x;
assert(at === 4000, "squeezed into the hole between two decks it lands in the hole");
assert(at - 2000 === 2000 && at + 2000 === 6000, "…flush with the one on each side of it");

// Already overlapping when the gesture began: left alone, or the first pixel of a drag would
// teleport it. It can still be dragged out, and once out it cannot go back in.
const mover = [deck(1000, 0)];
const obstacle = [deck(0, 0)];
const wasOverlapping = overlappingAtStart(mover, obstacle);
assert(wasOverlapping(0, 0), "a pair that starts overlapped is remembered");
const held = pushApart(mover, obstacle, wasOverlapping);
assert(held.x === 0 && held.y === 0, "…and is not resolved mid-gesture");
const forced = pushApart(mover, obstacle);
// Out along y: 3000 deep on x and only 2000 on y, and the rule is always the shorter way out.
assert(forced.x === 0 && forced.y === 2000, "…while the same pair without that memory is put right");
assert(!overlappingAtStart([deck(9000, 0)], obstacle)(0, 0), "a pair that starts clear is not");
// …and once it HAS been dragged out the memory is let go: pushed back in, it is held like any
// other pair. It used to stay exempt for the whole gesture, dragged clear or not.
const exempt = overlappingAtStart([deck(1000, 0)], [deck(0, 0)]);
exempt.release([deck(2500, 0)], [deck(0, 0)]);
assert(exempt(0, 0), "a pair still overlapping stays exempt");
exempt.release([deck(4100, 0)], [deck(0, 0)]);
assert(!exempt(0, 0), "a pair dragged clear is exempt no longer");
const heldAgain = nudgeApart([deck(3900, 0)], [deck(0, 0)], 150, exempt);
assert(heldAgain.x === 100 && heldAgain.y === 0, "…pushed back against it, it is held flush like any other pair");

// A pile it cannot untangle: it keeps whatever it managed and stops, rather than looping.
const pile = pushApart([deck(0, 0)], [deck(0, 0), deck(10, 0), deck(-10, 0)], undefined, 3);
assert(Number.isFinite(pile.x) && Number.isFinite(pile.y), "an impossible pile still returns an answer");

// ── TRUE SHAPES (QA MG-4/MG-9). A turned thing is held by its outline, never by the room its
// turned box takes — two 30° decks a few centimetres apart have boxes overlapping by hundreds of
// millimetres; two rounds on a diagonal, by ~750.
const turnedBox = (x: number, y: number, rotation: number, w = 4000, d = 2000, solid = "stage"): SolidBox => {
  const t = (rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(t));
  const s = Math.abs(Math.sin(t));
  return { x, y, widthMm: w * c + d * s, depthMm: w * s + d * c, solid, shape: { rotation, widthMm: w, depthMm: d } };
};
const along30 = (k: number) => ({ x: k * Math.cos(Math.PI / 6), y: k * Math.sin(Math.PI / 6) });
const at30 = (k: number) => turnedBox(along30(k).x, along30(k).y, 30);
assert(pushApart([at30(4100)], [turnedBox(0, 0, 30)]).x === 0 && pushApart([at30(4100)], [turnedBox(0, 0, 30)]).y === 0, "two 30° decks 100mm apart are clear, though their turned boxes overlap");
const into30 = pushApart([at30(3950)], [turnedBox(0, 0, 30)]);
assert(Math.abs(Math.hypot(into30.x, into30.y) - 50) <= 1 && Math.abs(into30.x - along30(50).x) <= 1, "one pushed 50mm into another is put back flush ALONG their own frame");
assert(!overlappingAtStart([at30(4000)], [turnedBox(0, 0, 30)])(0, 0), "two 30° decks flush are not an overlap the drag began with");
assert(nudgeApart([at30(3990)], [turnedBox(0, 0, 30)], 150).x !== 0, "…and dragged 1cm into each other, the magnet holds them flush");
const disc = (x: number, y: number, dia = 1800): SolidBox => ({ x, y, widthMm: dia, depthMm: dia, solid: "table", shape: { round: true, rotation: 0, widthMm: dia, depthMm: dia } });
const diag = (1800 + 300) / Math.SQRT2;
assert(pushApart([disc(diag, diag)], [disc(0, 0)]).x === 0, "two ⌀1.8 rounds on a diagonal with 30cm between the rims are clear");
const pressed = pushApart([disc(1700 / Math.SQRT2, 1700 / Math.SQRT2)], [disc(0, 0)]);
assert(Math.abs(pressed.x - 100 / Math.SQRT2) <= 1 && Math.abs(pressed.y - 100 / Math.SQRT2) <= 1, "…pressed 10cm into each other, pushed back out along the line between their centres");
const t45 = (k: number) => turnedBox((k * Math.SQRT2) / 2, (k * Math.SQRT2) / 2, 45, 2000, 1000, "table");
const air = pushApart([t45(2300)], [t45(0)]);
assert(air.x === 0 && air.y === 0, "two 45° tables with 30cm of real air are left alone — not pushed 1.5m apart on a drop");
const square = pushApart([turnedBox(3500, 0, 90, 2000, 4000)], [deck(0, 0)]);
assert(square.x === 500 && square.y === 0, "a deck stood on end is still its own box");

// The magnet: a shallow overlap is held flush, a deep one is let through.
const touching = nudgeApart([deck(3900, 0)], [deck(0, 0)], 150);
assert(touching.x === 100 && touching.y === 0, "just touching, the dragged deck is held flush");
const pushedOn = nudgeApart([deck(2500, 0)], [deck(0, 0)], 150);
assert(pushedOn.x === 0 && pushedOn.y === 0, "pushed well past the edge, it is no longer held — it follows the pointer");
assert(nudgeApart([deck(9000, 0)], [deck(0, 0)], 150).x === 0, "clear of everything, nothing to say");
assert(nudgeApart([deck(1000, 0)], [deck(0, 0)], 150, overlappingAtStart([deck(1000, 0)], [deck(0, 0)])).x === 0, "…and a pair already overlapping is still ignored");

// ── EVERY ELEMENT (the user, 2026-11-20): one list of pairs that may overlap; every other pair
// of floor things holds.
assert(pushApart([deck(3500, 0, "table")], [deck(0, 0, "sofas")]).x === 500, "a table pushed into a sofa is held off it");
assert(pushApart([deck(3500, 0, "bar")], [deck(0, 0, "columns")]).x === 500, "a bar is held off a column");
assert(pushApart([deck(3500, 0, "table")], [deck(0, 0, "stage")]).x === 0, "a table may stand on a stage");
assert(pushApart([deck(3500, 0, "chuppahs")], [deck(0, 0, "stage")]).x === 0, "…and so may a chuppah");
assert(pushApart([deck(3500, 0, FLOOR_COVER)], [deck(0, 0, "table")]).x === 0, "a rug lies under a table");
assert(pushApart([deck(3500, 0, "table")], [deck(0, 0, FLOOR_COVER)]).x === 0, "…whichever of them is dragged");
assert(pushApart([deck(3500, 0, "aisles")], [deck(0, 0, "chairs")]).x === 0, "an aisle runs between its rows of chairs");
assert(pushApart([deck(3500, 0, "table")], [deck(0, 0, "aisles")]).x === 500, "…but a table is held off it");
assert(!overlappingAtStart([deck(1000, 0, "table")], [deck(0, 0, "stage")])(0, 0), "a pair that may overlap is nothing the gesture remembers");
assert(overlappingAtStart([deck(1000, 0, "table")], [deck(0, 0, "sofas")])(0, 0), "…a pair that holds, already overlapping, is");
assert(mayOverlap("stage", "table") && mayOverlap("table", "stage") && !mayOverlap("stage", "stage"), "the table reads both ways round, and two stages hold");
assert(!mayOverlap("table", WALL_SOLID) && !mayOverlap(FLOOR_COVER, WALL_SOLID) && !mayOverlap("stage", WALL_SOLID), "nothing on the floor passes through a wall — not a rug, not a stage");
assert(mayOverlap(FLOOR_COVER, FLOOR_COVER), "two rugs may be layered");

// ── WALLS: every wall line is a thin segment in the same test.
const room = wallSolids([[{ x: 0, y: 0 }, { x: 10000, y: 0 }], [{ x: 10000, y: 0 }, { x: 10000, y: 8000 }]]);
assert(room.length === 2, "one obstacle per wall segment");
const intoWall = pushApart([deck(5000, 900, "table")], room); // 2000 deep: its top edge at −100
assert(intoWall.x === 0 && intoWall.y === 100, "a table pushed 10cm through a wall comes back flush against it");
assert(pushApart([deck(5000, 1000, "table")], room).y === 0, "flush against the wall is legal");
assert(pushApart([deck(8100, 3000, "stage")], room).x === -100, "a stage is held by a wall like everything else");
const slanted = wallSolids([[{ x: 0, y: 0 }, { x: 10000, y: 10000 }]]);
const diagonal = pushApart([deck(5300, 4700, "table", 1000, 1000)], slanted);
assert(diagonal.x > 0 && Math.abs(diagonal.x + diagonal.y) <= 1, "an angled wall pushes straight out across its line");
// A doorway is not a wall: the stretch between a door's jambs takes nothing.
const door = wallSolids([[{ x: 0, y: 0 }, { x: 10000, y: 0 }]], [{ a: { x: 4000, y: 0 }, b: { x: 6000, y: 0 } }]);
assert(door.length === 2, "a door cuts its wall in two");
assert(pushApart([deck(5000, 0, "gates", 1800, 400)], door).y === 0, "a gate stands in the doorway");
assert(pushApart([deck(3000, 0, "gates", 1800, 400)], door).y !== 0, "…but not in the wall beside it");

console.log("collide self-check passed");
