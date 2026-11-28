// npm run check:spine — the self-check of ./spine.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/design-document/types";
import { footprintOutlines } from "./footprint";
import { flatRing, signedDistance } from "./label-anchor";
import { alongSpine, footprintSpine, pointAlong, spanAlong, spineLength, spineParam } from "./spine";

// ponytail: self-check. Run: npm run check:spine
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (p: Point, q: Point, tol: number) => Math.hypot(p.x - q.x, p.y - q.y) <= tol;

// A rectangle: its long axis, end to end.
const rect = footprintSpine({ kind: "rect", widthMm: 2400, depthMm: 1000 });
assert(rect.length === 2 && near(rect[0], { x: -1200, y: 0 }, 1) && near(rect[1], { x: 1200, y: 0 }, 1), "a rectangle's spine is its long axis");
const tall = footprintSpine({ kind: "rect", widthMm: 800, depthMm: 2000 });
assert(near(tall[0], { x: 0, y: -1000 }, 1) && near(tall[1], { x: 0, y: 1000 }, 1), "…vertical when the depth is the long side");
const round = footprintSpine({ kind: "circle", diameterMm: 1800 });
assert(near(round[0], { x: -900, y: 0 }, 1) && near(round[1], { x: 900, y: 0 }, 1), "a round's spine is its horizontal diameter");

// Three along a 2.4m table: symmetric, the middle one dead centre, inset from the ends.
const three = alongSpine(rect, 3);
assert(three.length === 3 && near(three[1], { x: 0, y: 0 }, 1) && Math.abs(three[0].x + three[2].x) < 1, "three along a rectangle are symmetric about its middle");
assert(three[0].x > -1200 * 0.92 - 1 && three[0].x < -400, "…and inset from the ends");
assert(near(alongSpine(rect, 1)[0], { x: 0, y: 0 }, 1), "one along is the middle");
assert(near(pointAlong(rect, 600), { x: -600, y: 0 }, 1), "pointAlong walks the line");
assert(Math.abs(spineParam(rect, { x: 300, y: 80 }) - 1500) < 1, "spineParam is the distance along to the nearest point");
const strung = spanAlong([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 6000, y: 0 }], 4);
assert(strung.length === 4 && strung[0].x === 0 && strung[3].x === 6000 && strung[1].x === 2000, "spanAlong strings a run end to end, the ends included");
assert(spanAlong([{ x: 0, y: 0 }, { x: 6000, y: 0 }], 1)[0].x === 3000, "…one is the middle");

// A half ring (an arc head table, as footprint.ts builds it: outer radius 2m, band 60cm): the
// spine runs ROUND the band, not across the air inside it — every point on it is inside the
// outline, about the band's middle radius, and it starts near one end and finishes near the
// other.
const R = 2000, r = 1400;
const arc: Point[] = [];
for (let k = 0; k <= 36; k++) arc.push({ x: R * Math.cos(Math.PI - (k * Math.PI) / 36), y: -R * Math.sin(Math.PI - (k * Math.PI) / 36) });
for (let k = 36; k >= 0; k--) arc.push({ x: r * Math.cos(Math.PI - (k * Math.PI) / 36), y: -r * Math.sin(Math.PI - (k * Math.PI) / 36) });
const ring = flatRing({ outline: arc });
const arcSpine = footprintSpine({ kind: "custom", outline: arc });
assert(arcSpine.length >= 8, "a curved band's spine has the points to follow the curve");
const mid = (R + r) / 2;
const cx = 0, cy = 0; // the ring is drawn about the origin, and the custom footprint's box centre is where footprintOutlines puts it
void cx; void cy;
// In the footprint's frame the outline is re-centred on its box, so compare radii about the box
// centre: (0, -R/2 + something). Read the centre back off the first/last outline points instead.
const outlines = footprintOutlines({ kind: "custom", outline: arc })[0].outline;
const centre = { x: (outlines[0].x + outlines[36].x) / 2, y: outlines[0].y };
for (const p of arcSpine) {
  const rad = Math.hypot(p.x - centre.x, p.y - centre.y);
  assert(Math.abs(rad - mid) < 120, `the spine keeps to the middle of the band (r=${rad.toFixed(0)} vs ${mid})`);
  assert(signedDistance(p.x, p.y, flatRing(footprintOutlines({ kind: "custom", outline: arc })[0])) > 0, "…and inside the outline");
}
void ring;
const ends = [arcSpine[0], arcSpine[arcSpine.length - 1]];
assert(ends.every((e) => Math.abs(e.y - centre.y) < 600), "the spine reaches down toward both ends of the arc");
assert(ends[0].x * ends[1].x < 0, "…one end each side");
const apex = alongSpine(arcSpine, 1)[0];
assert(Math.abs(apex.x - centre.x) < 60 && apex.y < centre.y - 1000, "one item along an arc lands at its apex");
const five = alongSpine(arcSpine, 5);
assert(five.every((p) => Math.abs(Math.hypot(p.x - centre.x, p.y - centre.y) - mid) < 130), "five along an arc all sit on the band");

// A fan (a sector): the spine runs down its axis of symmetry toward the point.
const fan: Point[] = [{ x: 0, y: 1200 }];
for (let k = 0; k <= 12; k++) fan.push({ x: 2000 * Math.sin(-0.6 + (k * 1.2) / 12), y: 1200 - 2000 * Math.cos(-0.6 + (k * 1.2) / 12) });
const fanSpine = footprintSpine({ kind: "custom", outline: fan });
assert(fanSpine.every((p) => Math.abs(p.x) < 60), "a fan's spine is its axis of symmetry");
assert(fanSpine[0].y !== fanSpine[fanSpine.length - 1].y && Math.abs(fanSpine[0].y - fanSpine[fanSpine.length - 1].y) > 800, "…and runs from the wide end toward the point");

// A closed oval ring: the spine is one loop, not a line walked twice.
const oval: Point[] = [];
for (let k = 0; k < 48; k++) oval.push({ x: 2000 * Math.cos((k * 2 * Math.PI) / 48), y: 1200 * Math.sin((k * 2 * Math.PI) / 48) });
for (let k = 47; k >= 0; k--) oval.push({ x: 1400 * Math.cos((k * 2 * Math.PI) / 48), y: 600 * Math.sin((k * 2 * Math.PI) / 48) });
// (Two concentric rings joined by a hairline — the keyhole the oval-ring builder draws.)
const ovalSpine = footprintSpine({ kind: "custom", outline: [...oval, oval[0]] });
assert(spineLength(ovalSpine) > 8000 && spineLength(ovalSpine) < 13000, `a closed ring's spine is one loop round it (${spineLength(ovalSpine).toFixed(0)}mm)`);

console.log("spine: all checks passed");
