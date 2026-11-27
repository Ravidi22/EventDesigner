// npm run check:mirror — the self-check of ./mirror.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "./types";
import { mirrorFlips, uprightTransform } from "./mirror";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const one = mirrorFlips([{ kind: "p", id: "a", position: { x: 500, y: 200 }, rotation: 30 }], "horizontal", { x: 500, y: 200 });
assert(one[0].position.x === 500 && one[0].position.y === 200, "one item mirrors in place");
assert(one[0].rotation === 330 && one[0].mirrored, "…turning the other way, flipped");

const again = mirrorFlips(one, "horizontal", { x: 500, y: 200 });
assert(again[0].rotation === 30 && !again[0].mirrored, "mirroring twice is where it started");

const row = mirrorFlips(
  [
    { kind: "t", id: "l", position: { x: 0, y: 0 }, rotation: 0 },
    { kind: "t", id: "r", position: { x: 4000, y: 0 }, rotation: 90 },
  ],
  "horizontal",
  { x: 2000, y: 0 },
);
assert(row[0].position.x === 4000 && row[1].position.x === 0, "a pair mirrors about the centre they share");
assert(row[1].rotation === 270, "…each facing reflected");

const down = mirrorFlips([{ kind: "p", id: "a", position: { x: 0, y: 100 }, rotation: 0 }], "vertical", { x: 0, y: 0 });
assert(down[0].position.y === -100 && down[0].rotation === 180 && down[0].mirrored, "top-to-bottom is a flip plus half a turn");

// The identity the whole module rests on: reflect a point of the item's own outline both ways and
// land on the same world point.
const local = { x: 300, y: 100 };
const world = (pos: Point, r: number, m: boolean, p: Point) => {
  const lx = m ? -p.x : p.x;
  const t = (r * Math.PI) / 180;
  return { x: pos.x + lx * Math.cos(t) - p.y * Math.sin(t), y: pos.y + lx * Math.sin(t) + p.y * Math.cos(t) };
};
const before = world({ x: 1000, y: 500 }, 40, false, local);
const [v] = mirrorFlips([{ kind: "p", id: "a", position: { x: 1000, y: 500 }, rotation: 40 }], "vertical", { x: 0, y: 0 });
const after = world(v.position, v.rotation, v.mirrored, local);
assert(Math.abs(after.x - before.x) < 1e-6 && Math.abs(after.y + before.y) < 1e-6, "a vertical mirror reflects every point of the shape");
const [h] = mirrorFlips([{ kind: "p", id: "a", position: { x: 1000, y: 500 }, rotation: 40 }], "horizontal", { x: 0, y: 0 });
const afterH = world(h.position, h.rotation, h.mirrored, local);
assert(Math.abs(afterH.x + before.x) < 1e-6 && Math.abs(afterH.y - before.y) < 1e-6, "…and so does a horizontal one");

assert(uprightTransform(0) === undefined, "an unturned, unflipped label needs no transform");
assert(uprightTransform(30, true) === "scale(-1 1) rotate(-30)", "a flipped label unflips before it unturns");

console.log("mirror self-check passed");
