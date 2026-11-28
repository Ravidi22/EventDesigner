// npm run check:tableware — the self-check of ./tableware.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/studio/hall";
import { CHARGER_R_MM, CORE, EDGE_GAP_MM, hitsKeepout, laySettings, placed, type Keepout, type SettingPlace, type SettingSeat } from "./tableware";

// ponytail: self-check. Run: npm run check:tableware
const assert = (ok: boolean, msg: string) => {
  if (!ok) {
    console.error("FAIL", msg);
    process.exit(1);
  }
};
const rect = (w: number, d: number): Point[] => [
  { x: -w / 2, y: -d / 2 },
  { x: w / 2, y: -d / 2 },
  { x: w / 2, y: d / 2 },
  { x: -w / 2, y: d / 2 },
];
const disc = (r: number, n = 48): Point[] => Array.from({ length: n }, (_, i) => ({ x: r * Math.cos((2 * Math.PI * i) / n), y: r * Math.sin((2 * Math.PI * i) / n) }));
const overlaps = (ps: (SettingPlace | null)[]) => {
  const live = ps.filter((p): p is SettingPlace => !!p);
  let worst = Infinity;
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) worst = Math.min(worst, Math.hypot(live[i].x - live[j].x, live[i].y - live[j].y) - CORE.r * (live[i].scale + live[j].scale));
  return worst;
};

// A long table, chairs 60cm apart down both sides: full-size settings, one a hand in from each edge.
const long = rect(2400, 1000);
const sides: SettingSeat[] = [];
for (let k = 0; k < 4; k++) {
  const x = -900 + k * 600;
  sides.push({ at: { x, y: -760 }, facing: { x: 0, y: 1 } }, { at: { x, y: 760 }, facing: { x: 0, y: -1 } });
}
const lay = laySettings(sides, [long], []);
assert(lay.every((p) => !!p && p.scale === 1), "a long table seats every setting at full size");
assert(Math.abs(lay[0]!.y - (-500 + EDGE_GAP_MM + CHARGER_R_MM)) < 1e-6, "…its charger a hand in from the edge the diner sits at");
assert(Math.abs(lay[0]!.rotationDeg - 0) < 1e-6 && Math.abs(Math.abs(lay[1]!.rotationDeg) - 180) < 1e-6, "…turned to face its diner");
assert(overlaps(lay) >= 0, "…and no two meet");

// A round of 90 seating 14: the chairs crowd the rim, so the settings shrink — and never meet.
const round = disc(450);
const ring: SettingSeat[] = Array.from({ length: 14 }, (_, i) => {
  const a = (2 * Math.PI * i) / 14;
  return { at: { x: 700 * Math.cos(a), y: 700 * Math.sin(a) }, facing: { x: -Math.cos(a), y: -Math.sin(a) } };
});
const crowded = laySettings(ring, [round], []);
assert(overlaps(crowded) >= -1e-6, `a crowded round's settings never meet (${overlaps(crowded).toFixed(1)})`);
assert(crowded.some((p) => p && p.scale < 1), "…they are drawn smaller to fit");

// A stadium table's round end: the end seats and the corner seats meet unless the fit parts them.
const stadium: Point[] = [];
for (let i = 0; i <= 12; i++) stadium.push({ x: 900 + 500 * Math.sin((Math.PI * i) / 12), y: -500 * Math.cos((Math.PI * i) / 12) });
for (let i = 0; i <= 12; i++) stadium.push({ x: -900 - 500 * Math.sin((Math.PI * i) / 12), y: 500 * Math.cos((Math.PI * i) / 12) });
const endSeats: SettingSeat[] = [
  { at: { x: 600, y: -760 }, facing: { x: 0, y: 1 } },
  { at: { x: 1150, y: -560 }, facing: { x: -0.6, y: 0.8 } },
  { at: { x: 1660, y: 0 }, facing: { x: -1, y: 0 } },
  { at: { x: 1150, y: 560 }, facing: { x: -0.6, y: -0.8 } },
  { at: { x: 600, y: 760 }, facing: { x: 0, y: -1 } },
];
const ends = laySettings(endSeats, [stadium], []);
assert(overlaps(ends) >= -1e-6, "a stadium's round end: no two settings meet");
assert(ends.filter(Boolean).length >= 4, "…and the end still has its settings");

// A centrepiece in the middle keeps the glasses off it: smaller settings on a 1m top…
const narrow = rect(1800, 1000);
const across: SettingSeat[] = [
  { at: { x: 160, y: -660 }, facing: { x: 0, y: 1 } },
  { at: { x: -160, y: 660 }, facing: { x: 0, y: -1 } },
];
const vase: Keepout = { c: { x: 0, y: 0 }, hw: 170, hd: 170, rotationDeg: 0, round: true };
const clear = laySettings(across, [narrow], [vase]);
assert(clear.every((p) => !!p && !p.bare && p.scale < 1), `a vase in the middle: both settings, drawn smaller, glasses kept (${JSON.stringify(clear)})`);
for (const p of clear) {
  const q = placed({ edge: { x: p!.x, y: Math.sign(p!.y) * 500 }, facing: { x: 0, y: -Math.sign(p!.y) }, rotationDeg: p!.rotationDeg, shift: 0 }, p!.scale);
  assert(!q.discs.some((d) => hitsKeepout(d, vase)), "…their glasses clear the vase");
}
// …and on a 75cm top with a wide bowl the glasses give way before the plates do.
const bowl: Keepout = { c: { x: 0, y: 0 }, hw: 300, hd: 60, rotationDeg: 0 };
const tight = laySettings([{ at: { x: 0, y: -535 }, facing: { x: 0, y: 1 } }], [rect(1800, 750)], [bowl]);
assert(!!tight[0] && tight[0].bare, `a bowl too close for the glasses: the setting goes without them (${JSON.stringify(tight)})`);

// Two chairs on one spot: never two settings stacked — parted along the edge, or one left out.
const twice = laySettings([{ at: { x: 0, y: -760 }, facing: { x: 0, y: 1 } }, { at: { x: 10, y: -760 }, facing: { x: 0, y: 1 } }], [long], []);
assert(twice.some(Boolean) && overlaps(twice) >= -1e-6, "two seats on one spot: never two settings on top of each other");
// An 180×90 seating eight — three a side and one at each end: the end settings meet the side
// ones at the corners, so the side ones step back along their edge and every one stays.
const eight: SettingSeat[] = [];
for (const x of [-600, 0, 600]) eight.push({ at: { x, y: -710 }, facing: { x: 0, y: 1 } }, { at: { x, y: 710 }, facing: { x: 0, y: -1 } });
eight.push({ at: { x: 1160, y: 0 }, facing: { x: -1, y: 0 } }, { at: { x: -1160, y: 0 }, facing: { x: 1, y: 0 } });
const corner = laySettings(eight, [rect(1800, 900)], []);
assert(corner.every(Boolean) && overlaps(corner) >= -1e-6, `an 180×90 seating eight: every setting stays, none meet (${JSON.stringify(corner.map((p) => p && [Math.round(p.x), Math.round(p.y), +p.scale.toFixed(2), p.bare]))} ${overlaps(corner).toFixed(1)})`);
assert(Math.abs(corner[4]!.x) < 600, `…the corner settings stepped back from the corner (${Math.round(corner[4]!.x)})`);

// A chair facing away from the top gets nothing.
assert(laySettings([{ at: { x: 0, y: -760 }, facing: { x: 0, y: -1 } }], [long], [])[0] === null, "a seat that faces no table gets no setting");
console.log("tableware ok");
