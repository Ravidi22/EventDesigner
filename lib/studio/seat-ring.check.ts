// npm run check:seat-ring — the self-check of ./seat-ring.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { CHAIR_D_MM, CHAIR_W_MM, type Seat } from "./seating";
import { ringInRoom, seatRing } from "./seat-ring";

// ponytail: self-check. Run: npx tsx lib/studio/seat-ring.ts
const assert = (cond: boolean, m: string) => {
  if (!cond) throw new Error("FAIL: " + m);
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
// A bare table is its own box.
const bare = seatRing({ widthMm: 2400, depthMm: 1200 }, []);
assert(bare.widthMm === 2400 && bare.depthMm === 1200 && bare.cx === 0 && bare.cy === 0, "a table with no chairs is its top");
// A chair facing up (+y toward the table, i.e. facing −90°?) — one on the +y side, facing −y.
const below: Seat = { x: 0, y: 600 + CHAIR_D_MM / 2, facingDeg: -90 };
const one = seatRing({ widthMm: 2400, depthMm: 1200 }, [below]);
assert(near(one.depthMm, 1200 + CHAIR_D_MM) && near(one.cy, CHAIR_D_MM / 2) && one.widthMm === 2400, "chairs on one side only: the ring grows on that side, off-centre");
// A round table: the circle through the furthest chair corner.
const r = 900;
const ringed = seatRing({ widthMm: 1800, depthMm: 1800, round: true }, [{ x: r + 100, y: 0, facingDeg: 180 }]);
assert(ringed.round && near(ringed.widthMm / 2, Math.hypot(r + 100 + CHAIR_D_MM / 2, CHAIR_W_MM / 2)), "a round table's ring is the circle through its furthest chair corner");
// Into the room: the off-centre ring turns with the table, and a mirror flips it side to side.
const side = seatRing({ widthMm: 2000, depthMm: 1000 }, [{ x: 1000 + CHAIR_D_MM / 2, y: 0, facingDeg: 180 }]);
assert(side.cx > 0, "a chair at the +x end puts the ring's middle toward +x");
const turned = ringInRoom(side, { x: 0, y: 0 }, 90);
assert(near(turned.x, 0) && near(turned.y, side.cx) && near(turned.widthMm, side.depthMm) && near(turned.depthMm, side.widthMm), "turned a quarter, the ring's middle and box turn with it");
const flipped = ringInRoom(side, { x: 0, y: 0 }, 0, true);
assert(near(flipped.x, -side.cx), "mirrored, the seated end is on the other side");
console.log("seat-ring self-check passed");
