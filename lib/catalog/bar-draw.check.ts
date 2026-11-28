// npm run check:bar-draw — the self-check of ./bar-draw.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/design-document/types";
import { composeShapes, customShapeBounds, footprintOutlines, resolveFootprint, type Footprint } from "@/lib/studio/footprint";
import { flatRing, signedDistance } from "@/lib/studio/label-anchor";
import { barDrawing, BOTTLE_PITCH_MM, clean, counterShelfMm, ringLength, signedArea, type BarDrawing } from "./bar-draw";

// ponytail: self-check. Run: npm run check:bar-draw
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const bar = (dimensions: { widthMm?: number; depthMm?: number; diameterMm?: number }, appearance: object) =>
  resolveFootprint({
    id: "b", name: "בר", category: "bars", layer: "floor",
    dimensions: { heightMm: 1100, ...dimensions }, categoryFields: {}, styleTags: [], variants: [],
    appearance: { content: "none", ...appearance } as never,
  });
const baseRing = (f: Footprint) => clean(flatRing(footprintOutlines(f)[0]));
const inside = (p: Point, ring: Point[], tol = 1) => signedDistance(p.x, p.y, ring) >= -tol;
/** Every strip vertex on the counter, and every shelf bottle on it too. */
const onCounter = (f: Footprint, d: BarDrawing, label: string) => {
  const ring = baseRing(f);
  for (const s of [...d.front, ...d.shelf]) for (const r of s) for (const p of r) assert(inside(p, ring, 2), `${label}: a strip stays on the counter (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
};

// A ח 240×120 (the counter a third of the short side, 40cm): the counter along the top, the outer
// sides and the feet of the legs; the shelf round the inside of the ח, with its bottles.
const u = bar({ widthMm: 2400, depthMm: 1200 }, { shape: "u-shape" });
const ud = barDrawing(u);
const uRing = baseRing(u);
assert(ud.front.length >= 1 && ud.shelf.length === 1, `a ח has the guests' counter outside and one shelf inside (${ud.front.length}/${ud.shelf.length})`);
assert(ud.backs.length === 0, "…and nothing added");
onCounter(u, ud, "ח");
// Inside the ח the shelf runs 80 + 160 + 80 cm; bottles every 26cm, clear of the ends.
assert(ud.bottles.length >= 8 && ud.bottles.length <= 13, `the ח's shelf carries its bottles (${ud.bottles.length})`);
// Inside the ח: the hole's three faces are x = ±800 below y = −200, and y = −200 between them.
const seg = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
};
const uShelf = counterShelfMm((2 * Math.abs(signedArea(uRing))) / ringLength(uRing));
for (const b of ud.bottles) {
  assert(signedDistance(b.x, b.y, uRing) > b.r * 0.9, "…every one on the counter");
  const toHole = Math.min(seg(b, { x: -800, y: -200 }, { x: 800, y: -200 }), seg(b, { x: 800, y: -200 }, { x: 800, y: 600 }), seg(b, { x: -800, y: -200 }, { x: -800, y: 600 }));
  assert(toHole <= uShelf + 1, `…on the bartender's side of it (${toHole.toFixed(0)}mm from the inside)`);
}
assert(barDrawing(u) === ud, "the drawing is cached per footprint");

// The arc bar (⌀4.5m, a 60cm band round 330°): the counter round the outside, the shelf round the
// inside, both stopped square on the two ends — no strip runs across a cap.
const arc = bar({ diameterMm: 4500 }, { shape: "arc", arc: { bandMm: 600, sweepDeg: 330 } });
const ad = barDrawing(arc);
assert(ad.front.length === 1 && ad.shelf.length === 1, `an arc bar has one counter and one shelf (${ad.front.length}/${ad.shelf.length})`);
onCounter(arc, ad, "arc");
const inner = 2 * Math.PI * (2250 - 600) * (330 / 360);
assert(Math.abs(ad.bottles.length - Math.floor((inner - 120) / BOTTLE_PITCH_MM)) <= 2, `bottles every 26cm round the inside (${ad.bottles.length} for ${inner.toFixed(0)}mm)`);
const arcRing = baseRing(arc);
// The ring's centre: the middle of the box across, and 2.25m in from whichever end of the box
// the full circle reaches (the opening shortens the other).
const hub = ((): Point => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of arcRing) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const x = (minX + maxX) / 2;
  const c = [minY + 2250, maxY - 2250].map((y) => ({ x, y }));
  return c.find((h) => arcRing.every((p) => Math.hypot(p.x - h.x, p.y - h.y) <= 2251)) ?? c[0];
})();
for (const b of ad.bottles) {
  const rad = Math.hypot(b.x - hub.x, b.y - hub.y);
  assert(rad > 1650 && rad < 1650 + 120, `an arc's bottles stand on the inner shelf (r=${rad.toFixed(0)})`);
}

// The user's oval: a 7.34×3.6 ring, 60cm band, a 1.845m opening, and an island back bar inside.
const oval = bar({ widthMm: 7340, depthMm: 3600 }, {
  shape: "oval-ring",
  ring: { gapAt: "right", gapMm: 1845, bandMm: 600 },
  parts: [{ x: 0, y: 0, id: "p", shape: "stadium", depthMm: 600, widthMm: 2800, rotation: 0 }],
});
const od = barDrawing(oval);
assert(oval.kind === "multi" && od.backs.length === 1, "the island inside the oval is a back bar");
assert(od.front.length === 1 && od.shelf.length === 1, `the oval has one counter outside and one shelf inside, stopped at the opening (${od.front.length}/${od.shelf.length})`);
onCounter(oval, od, "oval");
const island = clean(flatRing(od.backs[0]));
const onIsland = od.bottles.filter((b) => signedDistance(b.x, b.y, island) > 0);
assert(onIsland.length >= 6, `the island carries a row of bottles (${onIsland.length})`);
assert(onIsland.every((b) => Math.abs(b.y) < 30), "…down its middle");

// The horseshoe with the back wall across its open side, and the closed one with none.
const shoe = bar({ widthMm: 3670, depthMm: 3600 }, {
  shape: "horseshoe",
  ring: { gapMm: 800, bandMm: 600 },
  parts: [{ x: -2012, y: 1, id: "w", shape: "rect", depthMm: 3598, widthMm: 380, rotation: 0 }],
});
const sd = barDrawing(shoe);
assert(sd.backs.length === 1 && sd.front.length >= 1 && sd.shelf.length >= 1, "a horseshoe has its counter, its shelf and the back wall");
onCounter(shoe, sd, "horseshoe");
const closed = bar({ widthMm: 5800, depthMm: 5070 }, { shape: "horseshoe", ring: { gapMm: 0, bandMm: 750 } });
const cd = barDrawing(closed);
assert(cd.front.length >= 1 && cd.shelf.length >= 1 && cd.bottles.length > 20, `the closed horseshoe is drawn too (${cd.bottles.length} bottles)`);
onCounter(closed, cd, "closed horseshoe");

// The rounded ח with its counter along the wall.
const half = bar({ widthMm: 7340, depthMm: 1800 }, {
  shape: "rounded-u",
  ring: { bandMm: 600 },
  parts: [{ x: 0, y: 600, id: "p", shape: "stadium", depthMm: 600, widthMm: 2800, rotation: 0 }],
});
const hd = barDrawing(half);
assert(hd.backs.length === 1 && hd.front.length >= 1 && hd.shelf.length >= 1, "a rounded ח has its counter, its shelf and its back bar");
onCounter(half, hd, "rounded ח");

// A capsule bar: guests all round — one counter strip the whole way round, no shelf, the bottles
// down the well in the middle.
const capsule = bar({ widthMm: 3000, depthMm: 900 }, { shape: "stadium" });
const kd = barDrawing(capsule);
assert(kd.front.length === 1 && kd.front[0].length === 2 && kd.shelf.length === 0, "a capsule's counter runs all the way round");
assert(kd.bottles.length >= 4 && kd.bottles.every((b) => Math.abs(b.y) < 30), `…with its bottles down the middle (${kd.bottles.length})`);

// An L drawn by hand: the crook of the L is the bartender's side.
const L = barDrawing({ kind: "custom", outline: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 600 }, { x: 600, y: 600 }, { x: 600, y: 2400 }, { x: 0, y: 2400 }] });
assert(L.front.length === 1 && L.shelf.length === 1, `an L's crook is its shelf (${L.front.length}/${L.shelf.length})`);
assert(L.bottles.length >= 6, "…and carries the bottles");

// A rectangle drawn hollow and open along its bottom is the ח, and is drawn as one.
const hollowU = bar({ widthMm: 2400, depthMm: 1200 }, { shape: "rect", hollow: { bandMm: 400, openSides: [2] } });
const hu = barDrawing(hollowU);
assert(hu.front.length === ud.front.length && hu.shelf.length === ud.shelf.length && hu.bottles.length === ud.bottles.length, `a hollow rectangle open at the bottom is drawn as the ח (${hu.front.length}/${hu.shelf.length}/${hu.bottles.length})`);
onCounter(hollowU, hu, "hollow ח");
// Opened at both ends it is two straight bars — both the bar's own counter, neither a back bar.
const twoRuns = barDrawing(bar({ widthMm: 3000, depthMm: 2400 }, { shape: "rect", hollow: { bandMm: 600, openSides: [1, 3] } }));
assert(twoRuns.backs.length === 0 && twoRuns.front.length >= 2 && twoRuns.shelf.length === 2, `a band opened in two is two counters, not a counter and a back bar (${twoRuns.front.length}/${twoRuns.shelf.length}/${twoRuns.backs.length})`);

// A FRONT panel added to a bar (backdrops S2, review I2): its plan band is drawn as itself (the
// outline, its face marked), never a back bar with bottles — and it is not the bar's outside.
const withPanel = composeShapes("rect", { widthMm: 3000, depthMm: 600 }, [{ id: "p", plane: "front", shape: "rect", widthMm: 3000, depthMm: 900, thicknessMm: 40, x: 0, y: -500, rotation: 0, zMm: 1100 }]);
const wp = barDrawing(withPanel);
const band = footprintOutlines(withPanel)[1];
const bb = customShapeBounds(band.outline);
assert(wp.backs.length === 0, "a front panel added to a bar is not a back bar");
assert(!wp.bottles.some((b) => b.y >= bb.minY - 1 && b.y <= bb.maxY + 1), "…and no bottles stand along it");
assert(wp.front.length > 0 && wp.shelf.length === 0, "…and the counter is still the guests' all round");
console.log("bar-draw: all checks passed");
