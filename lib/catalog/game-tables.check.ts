// npm run check:billiard — the self-check of ./game-tables.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { BILLIARD_TABLE, billiardLayout, GAME_TABLES_CATEGORY } from "./game-tables";

// ponytail: self-check. Run: npm run check:billiard
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const t = billiardLayout(2540, 1420);
assert(t.alongX && t.railMm === 142 && t.cloth.w === 2540 - 284 && t.cloth.h === 1420 - 284, "an 8-foot table: 14.2 cm rails round a 2.26 × 1.14 m cloth");
assert(t.pockets.length === 6 && t.pockets.filter((p) => Math.abs(p.x) < 1e-9).length === 2, "six pockets — two of them in the middle of the long rails");
assert(t.pockets.every((p) => Math.abs(p.x) <= 2540 / 2 && Math.abs(p.y) <= 1420 / 2), "…all inside the table");
assert(t.sights.length === 18, "three sights between each pair of pockets, three on each short rail");
assert(t.headString[0].x < 0 && t.footSpot.x > 0 && t.footSpot.y === 0, "the head string at one end, the foot spot at the other, on the middle line");
const up = billiardLayout(1420, 2540);
assert(!up.alongX && up.cloth.h === t.cloth.w && up.pockets.filter((p) => Math.abs(p.y) < 1e-9).length === 2, "laid the long way down, the same table turned");
assert(BILLIARD_TABLE.category === GAME_TABLES_CATEGORY && BILLIARD_TABLE.unitPrice === undefined, "the standard table carries no price");
console.log("billiard ok");
