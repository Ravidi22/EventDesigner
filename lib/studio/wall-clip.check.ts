// npm run check:wall-clip — the self-check of ./wall-clip.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/studio/hall";
import { clipToWalls, crossesWalls, segmentCrossing, wallAt } from "./wall-clip";

// ponytail: self-check. Run: npm run check:wall-clip
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
// A 10m × 6m room: four walls round the origin's corner.
const room: Point[][] = [
  [{ x: 0, y: 0 }, { x: 10000, y: 0 }],
  [{ x: 10000, y: 0 }, { x: 10000, y: 6000 }],
  [{ x: 10000, y: 6000 }, { x: 0, y: 6000 }],
  [{ x: 0, y: 6000 }, { x: 0, y: 0 }],
];
const clipped = clipToWalls({ x: 1000, y: 1000 }, { x: 12000, y: 1000 }, room);
assert(clipped.x === 10000 && clipped.y === 1000, `a side drawn through the wall stops on it (${clipped.x})`);
const inside = clipToWalls({ x: 1000, y: 1000 }, { x: 8000, y: 4000 }, room);
assert(inside.x === 8000 && inside.y === 4000, "a side inside the room is left alone");
const along = clipToWalls({ x: 0, y: 0 }, { x: 5000, y: 0 }, room);
assert(along.x === 5000, "a side running along a wall is not stopped by it");
const off = clipToWalls({ x: 10000, y: 2000 }, { x: 4000, y: 2000 }, room);
assert(off.x === 4000, "a side leaving a wall it starts on is not stopped by that wall");
const flush = clipToWalls({ x: 2000, y: 1000 }, { x: 10000.4, y: 1000 }, room);
assert(flush.x === 10000, "a hair past the wall is on the wall");
const nearStart = clipToWalls({ x: 10000.4, y: 2000 }, { x: 4000, y: 2000 }, room);
assert(nearStart.x === 4000, "…and a corner rounded a hair past the wall still draws its next side into the room");

assert(!crossesWalls([{ x: 1000, y: 1000 }, { x: 5000, y: 1000 }, { x: 5000, y: 3000 }, { x: 1000, y: 3000 }], room), "a stage inside the room crosses nothing");
assert(crossesWalls([{ x: 6000, y: 1000 }, { x: 12000, y: 1000 }, { x: 12000, y: 3000 }, { x: 6000, y: 3000 }], room), "a stage through the wall crosses it");
assert(!crossesWalls([{ x: 6000, y: 1000 }, { x: 10000, y: 1000 }, { x: 10000, y: 3000 }, { x: 6000, y: 3000 }], room), "a stage flush against the wall does not");
assert(!crossesWalls([{ x: 6000, y: 1000 }, { x: 10000.5, y: 1000 }, { x: 10000.5, y: 3000 }, { x: 6000, y: 3000 }], room), "…nor one half a millimetre into it");
assert(crossesWalls([{ x: 6000, y: -1000 }, { x: 8000, y: -1000 }, { x: 8000, y: 3000 }, { x: 6000, y: 3000 }], room), "a stage whose sides pass through the wall crosses it, wherever its corners are");
assert(segmentCrossing({ x: 0, y: 1 }, { x: 10, y: 1 }, { x: 0, y: 0 }, { x: 10, y: 0 }) === null, "parallel lines never cross");

// ── QA 2026-11-20 ST-1: touching is judged ACROSS the wall, not along the side ──────────────────
// אמרה's west wall drifts 5 mm over 14 m (its 13.3 m wall 23 mm): a stage drawn square to the room
// with its corner snapped onto it runs a few millimetres into its line. That is a stage against
// the wall — it was read as crossing it, and every typed figure after it went red.
const drift: Point[][] = [[{ x: 0, y: 0 }, { x: 5, y: 14000 }]];
const onDrift = [{ x: 1, y: 2000 }, { x: 4001, y: 2000 }, { x: 4001, y: 8000 }, { x: 1, y: 8000 }];
assert(!crossesWalls(onDrift, drift), "a stage whose side lies on a wall drifting 5 mm over 14 m does not cross it");
assert(!crossesWalls([{ x: 1, y: 300 }, { x: 4001, y: 300 }, { x: 4001, y: 14000 }, { x: 1, y: 14000 }], drift), "…all along it");
const drift23: Point[][] = [[{ x: 0, y: 0 }, { x: 23, y: 13300 }]];
assert(!crossesWalls([{ x: 0, y: 300 }, { x: 3000, y: 300 }, { x: 3000, y: 13000 }, { x: 0, y: 13000 }], drift23), "…nor one along a wall a tenth of a degree off square (23 mm over 13.3 m)");
const alongDrift = clipToWalls({ x: 1, y: 2000 }, { x: 1, y: 12000 }, drift);
assert(alongDrift.x === 1 && alongDrift.y === 12000, `a side drawn along a drifting wall is not cut short (${alongDrift.y})`);
const alongDrift23 = clipToWalls({ x: 0, y: 300 }, { x: 0, y: 13000 }, drift23, -1);
assert(alongDrift23.y === 13000, `…nor along the 23 mm one, the stage beside it (${alongDrift23.y})`);
const angled: Point[][] = [[{ x: 0, y: 0 }, { x: 6000, y: 7151 }]]; // 50°, as in hall 2
for (const k of [0, 1, 2, 3, 4, 5, 6, 7]) {
  const t0 = 0.05 + k * 0.07;
  const p = { x: Math.round(6000 * t0), y: Math.round(7151 * t0) };
  const q = { x: Math.round(p.x + 3000 * Math.cos((50 * Math.PI) / 180)), y: Math.round(p.y + 3000 * Math.sin((50 * Math.PI) / 180)) };
  const c = clipToWalls(p, q, angled);
  assert(c.x === q.x && c.y === q.y, `a side drawn along a 50° wall from a corner rounded onto it is not cut short (start ${k})`);
}
assert(crossesWalls([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 6000 }, { x: 0, y: 6000 }], [[{ x: 0, y: 0 }, { x: 105, y: 6000 }]]), "a wall a whole degree off square, 10 cm into the stage, still crosses it");

// ── WORKS FOR EVERY VENUE (2026-11-20, the user: "should work to all"): the band along a side a
// wall is traced a hair off grows with the side, so no fixed millimetre figure has to fit them all.
const long: Point[][] = [[{ x: 0, y: 0 }, { x: Math.round(30000 * Math.tan((0.3 * Math.PI) / 180)), y: 30000 }]]; // 157 mm over 30 m
assert(!crossesWalls([{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 30000 }, { x: 0, y: 30000 }], long), "a 30 m stage along a wall traced 0.3° off (157 mm) does not cross it");
const alongLong = clipToWalls({ x: 0, y: 0 }, { x: 0, y: 30000 }, long, -1);
assert(alongLong.y === 30000, `…and a side drawn all along it is not cut short (${alongLong.y})`);
const real4: Point[][] = [[{ x: 0, y: 0 }, { x: Math.round(9100 * Math.tan((4 * Math.PI) / 180)), y: 9100 }]]; // אמרה's 4° wall
assert(crossesWalls([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 9100 }, { x: 0, y: 9100 }], real4), "a wall at a real angle (4°) still crosses a stage drawn square past it");
assert(crossesWalls([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 10000 }, { x: 0, y: 10000 }], [[{ x: 500, y: 1000 }, { x: 500, y: 9000 }]]), "a wall parallel to a side but half a metre inside the stage still crosses it");

// A wall that ENDS on a side — a T, as where a garden wall meets the hall — touches the stage when
// it comes from outside, and crosses it only when its body goes in.
const tee: Point[][] = [...room, [{ x: -5000, y: 2000 }, { x: 0, y: 2000 }]];
const byWest = [{ x: 0, y: 1000 }, { x: 4000, y: 1000 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }];
assert(!crossesWalls(byWest, tee), "a stage whose side a wall ends on from outside does not cross it");
assert(crossesWalls(byWest, [...room, [{ x: 2000, y: 1000 }, { x: 2000, y: 2000 }]]), "…one whose wall comes in from that side does");
assert(crossesWalls(byWest, [...room, [{ x: 1500, y: 1500 }, { x: 2500, y: 2500 }]]), "…and so does one with a wall standing wholly inside it");
assert(crossesWalls(byWest, [...room, [{ x: 0, y: 1000 }, { x: 4000, y: 3000 }]]), "…and one a wall runs corner to corner across");
const pastTee = clipToWalls({ x: 0, y: 500 }, { x: 0, y: 5000 }, tee);
assert(pastTee.y === 5000, `a side drawn along the hall past a wall meeting it from outside is not stopped there (${pastTee.y})`);
const pastTeeIn = clipToWalls({ x: 0, y: 500 }, { x: 0, y: 5000 }, tee, -1);
assert(pastTeeIn.y === 5000, `…nor when the stage is known to be on the room side (${pastTeeIn.y})`);
const partition: Point[][] = [...room, [{ x: 0, y: 3000 }, { x: 4000, y: 3000 }]];
const atPartition = clipToWalls({ x: 0, y: 500 }, { x: 0, y: 5000 }, partition, -1);
assert(clipToWalls({ x: 0, y: 500 }, { x: 0, y: 5000 }, partition).y === 5000, "…which, before the drawing says where the stage is, is left to the closed outline");
assert(atPartition.y === 3000, `a partition meeting the hall wall on the stage's side stops the side at it (${atPartition.y})`);

// ONLY WHAT AN EDIT MADE WORSE: an outline already 21 cm into a wall (a resize pushed it there) is
// not refused for typing its other sides — only for going deeper.
const into = [{ x: -210, y: 1000 }, { x: 4000, y: 1000 }, { x: 4000, y: 3000 }, { x: -210, y: 3000 }];
assert(crossesWalls(into, room), "a stage 21 cm into the wall crosses it");
assert(!crossesWalls([{ x: -210, y: 1000 }, { x: 4000, y: 1000 }, { x: 4000, y: 3600 }, { x: -210, y: 3600 }], room, into), "…and may still have its other sides typed");
assert(crossesWalls([{ x: -400, y: 1000 }, { x: 4000, y: 1000 }, { x: 4000, y: 3000 }, { x: -400, y: 3000 }], room, into), "…but not be pushed further in");
assert(!crossesWalls([{ x: -100, y: 1000 }, { x: 4000, y: 1000 }, { x: 4000, y: 3000 }, { x: -100, y: 3000 }], room, into), "…and may be pulled back out a step at a time");
assert(crossesWalls([{ x: 6000, y: 1000 }, { x: 12000, y: 1000 }, { x: 12000, y: 3000 }, { x: 6000, y: 3000 }], room, [{ x: 6000, y: 1000 }, { x: 9000, y: 1000 }, { x: 9000, y: 3000 }, { x: 6000, y: 3000 }]), "an edit that takes a stage through a wall it stood clear of is refused");

// The wall a corner stands on (ST-7: a typed angle slides it along that wall).
const onNorth = wallAt({ x: 4000, y: 3 }, room);
assert(!!onNorth && onNorth[0].y === 0 && onNorth[1].y === 0, "a corner 3 mm off the north wall stands on it");
assert(wallAt({ x: 4000, y: 300 }, room) === null, "…one 30 cm off stands on none");
const inCorner = wallAt({ x: 2, y: 1 }, room, { x: 0, y: 1 });
assert(!!inCorner && inCorner[0].x === 0 && inCorner[1].x === 0, "a corner in the room's corner takes the wall running the way asked (the west wall, down)");
console.log("wall-clip self-check passed");
