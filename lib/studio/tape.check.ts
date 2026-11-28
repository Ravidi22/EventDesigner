// npm run check:tape — the self-check of ./tape.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { type Poly } from "./proximity";
import { addTape, anchorAt, pruneTape, removeTape, resolveTape, tapeAngleDeg, tapeId, tapeReadout, type TapeLookup, type TapeMeasurement } from "./tape";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
const rect = (cx: number, cy: number, w: number, d: number): Poly => [
  { x: cx - w / 2, y: cy - d / 2 },
  { x: cx + w / 2, y: cy - d / 2 },
  { x: cx + w / 2, y: cy + d / 2 },
  { x: cx - w / 2, y: cy + d / 2 },
];
// Two tables, 1m apart edge to edge; the second one can be moved by swapping the lookup.
let tables: Record<string, Poly[]> = { "table:1": [rect(0, 0, 2000, 1000)], "table:2": [rect(3000, 0, 1000, 1000)] };
const lookup: TapeLookup = (id) => tables[id];

// Free to free: the points themselves, with an angle to read.
const free = resolveTape({ a: anchorAt({ x: 0, y: 0 }), b: anchorAt({ x: 3000, y: 4000 }) }, lookup);
assert(!!free && !free.between && near(free.lengthMm, 5000), "two free points measure between themselves");
assert(tapeAngleDeg(free!) === 53, "…and read their bearing");
const r = tapeReadout(free!);
assert(r?.length === "5.00 מ׳" && r.detail === "53°", "a free measurement reads metres and an angle");
assert(tapeReadout(resolveTape({ a: anchorAt({ x: 5, y: 5 }), b: anchorAt({ x: 5, y: 5 }) }, lookup)!) === null, "two points on top of each other read nothing");

// Item to item: edge to edge, whatever points were pressed inside them.
const both = resolveTape({ a: anchorAt({ x: 100, y: 100 }, "table:1"), b: anchorAt({ x: 3100, y: -100 }, "table:2") }, lookup);
assert(!!both && both.between && near(both.lengthMm, 1500), "two items: the air between their edges");
assert(near(both!.a.x, 1000) && near(both!.b.x, 2500), "…from the first's edge to the second's");
assert(tapeReadout(both!)?.detail === "מקצה לקצה", "between items the detail is edge-to-edge, not an angle");

// Item to point, point to item: from the nearest point of the outline.
const toPoint = resolveTape({ a: anchorAt({ x: 0, y: 0 }, "table:1"), b: anchorAt({ x: 0, y: 2500 }) }, lookup);
assert(!!toPoint && toPoint.between && near(toPoint.lengthMm, 2000) && near(toPoint.a.y, 500), "item to point: off the item's edge");
const fromPoint = resolveTape({ a: anchorAt({ x: 0, y: 2500 }), b: anchorAt({ x: 0, y: 0 }, "table:1") }, lookup);
assert(!!fromPoint && near(fromPoint.lengthMm, 2000) && near(fromPoint.b.y, 500) && near(fromPoint.a.y, 2500), "point to item: the point stays, the other end is the edge");

// Both ends in one item: the two points pressed, not the item against itself (which reads zero).
const self = resolveTape({ a: anchorAt({ x: -900, y: 0 }, "table:1"), b: anchorAt({ x: 900, y: 0 }, "table:1") }, lookup);
assert(!!self && !self.between && near(self.lengthMm, 1800), "one item on both ends measures between the two points pressed");
assert(resolveTape({ a: anchorAt({ x: 0, y: 0 }, "table:9"), b: anchorAt({ x: 1, y: 0 }, "table:9") }, lookup) === null, "…but still nothing once that item is gone");

// LIVE: the item moves, the measurement follows — nothing was copied.
tables = { ...tables, "table:2": [rect(4000, 0, 1000, 1000)] };
const moved = resolveTape({ a: anchorAt({ x: 0, y: 0 }, "table:1"), b: anchorAt({ x: 3100, y: 0 }, "table:2") }, lookup);
assert(!!moved && near(moved.lengthMm, 2500), "a moved item is measured where it is now");

// Touching reads "צמודים".
tables = { ...tables, "table:2": [rect(1500, 0, 1000, 1000)] };
const touching = resolveTape({ a: anchorAt({ x: 0, y: 0 }, "table:1"), b: anchorAt({ x: 1500, y: 0 }, "table:2") }, lookup);
assert(!!touching && touching.lengthMm < 1 && tapeReadout(touching)?.length === "צמודים", "two things touching read צמודים");

// The list: add, drop the ones whose item is gone, remove one, same array when nothing changes.
let list: TapeMeasurement[] = [];
list = addTape(list, { id: tapeId(), a: anchorAt({ x: 0, y: 0 }), b: anchorAt({ x: 1000, y: 0 }) });
list = addTape(list, { id: tapeId(), a: anchorAt({ x: 0, y: 0 }, "table:1"), b: anchorAt({ x: 3100, y: 0 }, "table:2") });
list = addTape(list, { id: tapeId(), a: anchorAt({ x: 0, y: 2500 }), b: anchorAt({ x: 0, y: 0 }, "table:1") });
assert(list.length === 3 && new Set(list.map((m) => m.id)).size === 3, "three measurements, three ids");
assert(pruneTape(list, lookup) === list, "nothing gone: the same list back");
tables = { "table:1": tables["table:1"] }; // table 2 deleted
const pruned = pruneTape(list, lookup);
assert(pruned.length === 2 && pruned.every((m) => m.b.targetId !== "table:2"), "a measurement to a deleted item is dropped; the others stay");
assert(resolveTape(list[1], lookup) === null, "…because it resolves to nothing");
const less = removeTape(pruned, pruned[0].id);
assert(less.length === 1 && less[0] === pruned[1], "removing one by id leaves the rest");
assert(removeTape(less, "nope") === less, "removing an unknown id changes nothing");

console.log("check:tape ok");
