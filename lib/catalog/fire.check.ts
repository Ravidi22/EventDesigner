// npm run check:fire — the self-check of ./fire.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { fireLayout, firePatch } from "./fire";

// Self-check. Run: npm run check:fire
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const def = fireLayout(1200, 250, false, undefined);
assert(def.bodyH === 120 && def.colour === "#F2F0EA" && !def.guard && def.frameMm === 0, "no spec: a 12 cm body, white stones inside, no guard, no frame");
assert(def.stones.length > 50 && def.stones.every((s) => Math.abs(s.x) <= 600 && Math.abs(s.y) <= 125), "…the stones all inside the trough");
assert(def.stones.every((s) => !(Math.abs(s.x) < def.slot.halfL && Math.abs(s.y) < def.slot.halfD)), "…and none on the burner");
const framed = fireLayout(1200, 250, false, { stones: "frame" });
assert(framed.frameMm === 75 && framed.stones.length > 50 && framed.stones.every((s) => Math.abs(s.x) > 600 || Math.abs(s.y) > 125), "a frame: the stones round the trough on the table, none in it");
assert(fireLayout(1200, 250, false, { stones: "both" }).stones.length > def.stones.length + framed.stones.length * 0.8, "both: in it and round it");
assert(fireLayout(1200, 250, false, { stones: "none" }).stones.length === 0, "none: no stones");
assert(JSON.stringify(fireLayout(1200, 250, false, undefined).stones) === JSON.stringify(def.stones), "the same trough lays the same stones");
const round = fireLayout(600, 600, true, undefined);
assert(round.stones.length > 20 && round.stones.every((s) => Math.hypot(s.x, s.y) <= 300 && Math.hypot(s.x, s.y) > round.slot.halfL), "a round trough: a ring of stones round the burner");
assert(firePatch(undefined, { stones: "inside", stoneColour: "#F2F0EA" }) === undefined && firePatch(undefined, { guard: true })?.guard === true, "defaults are not stored");
console.log("fire self-check passed");
