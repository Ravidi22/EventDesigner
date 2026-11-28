// npm run check:dance-floor — the self-check of ./dance-floor.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/studio/hall";
import { type Footprint } from "@/lib/studio/footprint";
import { area, DANCE_MAX_PANELS, DANCE_PANEL_MM, danceFloorGrid, danceFloorRings, inside } from "./dance-floor";

// ponytail: self-check. Run: npm run check:dance-floor
const assert = (c: unknown, m: string) => {
  if (!c) {
    console.error("FAIL:", m);
    process.exit(1);
  }
  console.log("ok  ", m);
};
const sum = (ps: Point[][]) => ps.reduce((n, r) => n + Math.abs(area(r)), 0);

// A plain 6×6 floor: ten panels each way, centred, so the two cut columns match and exactly half
// the floor is the alternate shade.
const square = danceFloorRings(6000, 6000);
const g = danceFloorGrid(square);
assert(g.panelMm === DANCE_PANEL_MM && g.alt.length === 50, `a 6×6 floor is 10×10 panels, 50 of them the other shade (${g.alt.length})`);
assert(Math.abs(sum(g.alt) - 18e6) < 1, `…which cover exactly half of it (${sum(g.alt)})`);
assert(g.seams.length === 18 && g.seams.every(([a, b]) => Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 6000) < 1e-6), "nine seams each way, edge to edge");
const edge = g.alt.flat();
assert(edge.every((p) => Math.abs(p.x) <= 3000 + 1e-6 && Math.abs(p.y) <= 3000 + 1e-6), "no panel past the floor's edge");

// Rounded corners: every panel piece stays on the floor, and the alternate panels are still about
// half of what the floor covers.
const rounded = danceFloorRings(6000, 4000, { shape: { corners: [1500, 1500, 1500, 1500] } });
const rg = danceFloorGrid(rounded);
assert(rg.alt.flat().every((p) => inside({ x: p.x * 0.999, y: p.y * 0.999 }, rounded) || Math.abs(Math.abs(p.x) - 3000) < 1 || Math.abs(Math.abs(p.y) - 2000) < 1), "a rounded floor's panels are cut to its corners");
const floorArea = Math.abs(area(rounded[0]));
assert(Math.abs(sum(rg.alt) / floorArea - 0.5) < 0.05, `…and about half of it is the other shade (${(sum(rg.alt) / floorArea).toFixed(3)})`);
// A seam never runs off the rounded corner.
assert(rg.seams.every(([a, b]) => inside({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, rounded)), "every seam runs on the floor");

// A carpet over a stage with a hole cut through it (a column): the seams stop at the hole.
const hole: Point[] = [{ x: -400, y: -400 }, { x: 400, y: -400 }, { x: 400, y: 400 }, { x: -400, y: 400 }];
const fp: Footprint = { kind: "custom", outline: [{ x: -3000, y: -2000 }, { x: 3000, y: -2000 }, { x: 3000, y: 2000 }, { x: -3000, y: 2000 }] };
const holed = danceFloorRings(6000, 4000, { footprint: fp, holes: [hole] });
assert(holed.length === 2, "the outline and its hole are both rings");
const hg = danceFloorGrid(holed);
assert(hg.seams.every(([a, b]) => !(Math.abs((a.x + b.x) / 2) < 399 && Math.abs((a.y + b.y) / 2) < 399)), "no seam crosses the hole");
const solids = danceFloorGrid(holed, DANCE_PANEL_MM, 1).panels;
assert(solids.length === hg.alt.length - solids.reduce((n, s) => n + s.holes.length, 0) && solids.some((s) => s.holes.length === 1), "as solids, the hole's pieces are cut out of their panels, never panels of their own");
const mid = hg.seams.filter(([a, b]) => a.x === 0 && b.x === 0).map(([a, b]) => [a.y, b.y]);
assert(JSON.stringify(mid) === JSON.stringify([[-2000, -400], [400, 2000]]), `…the seam through it stops at its edges (${JSON.stringify(mid)})`);

// A floor the size of a stadium is drawn in bigger panels, never thousands of paths more.
const huge = danceFloorGrid(danceFloorRings(60000, 60000));
assert(huge.panelMm > DANCE_PANEL_MM && huge.alt.length <= DANCE_MAX_PANELS / 2 + 1, `a 60m floor draws ${huge.alt.length} panels of ${huge.panelMm}mm`);
assert(danceFloorGrid([]).alt.length === 0, "nothing to lay, nothing drawn");
console.log("dance floor: ok");
