// npm run check:stage-fill — the self-check of ./stage-fill.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/design-document/types";
import { defaultFront, fillWithDecks, lengthSnapper, polygonsOverlap, resizeRect, type DeckType, type FillResult } from "./stage-fill";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const big = { id: "2x1", widthMm: 2000, depthMm: 1000 };
const small = { id: "1x1", widthMm: 1000, depthMm: 1000 };
const imperial = { id: "4x8", widthMm: 1220, depthMm: 2440 };
const count = (r: FillResult, id: string) => r.decks.filter((d) => d.typeId === id).length;

const six = fillWithDecks(rect(0, 0, 6000, 4000), [big]);
assert(six.decks.length === 12 && Math.abs(six.coverage - 1) < 1e-9, "a 6×4 area is exactly twelve 2×1 decks");
assert(six.decks.every((d) => d.rotation === 0), "…every one of them long side along the front");
assert(six.suggestions.length === 0, "…and an exact area suggests nothing");

const walls = fillWithDecks(rect(0, 0, 6010, 3990), [big]);
assert(walls.decks.length === 12, "wall to wall, 10mm short of four rows, is still four rows");

const odd = fillWithDecks(rect(0, 0, 5000, 3000), [big, small]);
assert(Math.abs(odd.coverage - 1) < 1e-9, "a 5×3 area is covered exactly with 2×1s and 1×1s");
assert(count(odd, "2x1") >= 6, "…mostly by the big deck");

const mixed = fillWithDecks(rect(0, 0, 6000, 4000), [big, imperial]);
assert(Math.abs(mixed.coverage - 1) < 1e-9 && count(mixed, "4x8") === 0, "a metric and an imperial deck are never one platform");

// The front: a 6×4.5 area laid from its bottom edge leaves the half-metre at the top, and from its
// top edge at the bottom — the gap is always behind.
const deep = rect(0, 0, 6000, 4500);
const fromBottom = fillWithDecks(deep, [big], { front: 0 });
assert(fromBottom.decks.every((d) => d.centre.y < 4000), "rows start at the front; the slack is at the back");
const fromTop = fillWithDecks(deep, [big], { front: 2 });
assert(fromTop.decks.every((d) => d.centre.y > 500), "…whichever edge the front is");
assert(fromTop.decks.length === 12, "…and it is the same stage from either side");

const endTurn = fillWithDecks(rect(0, 0, 7000, 2000), [big]);
assert(endTurn.decks.length === 7 && endTurn.coverage > 0.999, "a 7×2 is six decks along the front and one turned to finish");
const centred = fillWithDecks(rect(0, 0, 7000, 1000), [big]);
const xs = centred.decks.map((d) => d.centre.x);
assert(Math.min(...xs) === 1500 && Math.max(...xs) === 5500, "a row with slack is centred — two half-metre ends, not one metre on one side");

const catwalk = fillWithDecks(rect(0, 0, 1000, 6000), [big], { front: 0 });
assert(catwalk.decks.length === 3 && catwalk.decks.every((d) => d.rotation === 90), "a 1m catwalk is decked along its length");

const square = fillWithDecks(rect(0, 0, 3000, 3000), [big]);
assert(square.coverage < 1, "a 3×3 cannot be built from 2×1s…");
const smaller = square.suggestions.find((s) => s.direction === "smaller");
const larger = square.suggestions.find((s) => s.direction === "larger");
assert(smaller?.widthMm === 3000 && smaller.depthMm === 2000 && smaller.decks === 3, "…so 3×2 is offered, keeping the front");
assert(larger?.widthMm === 3000 && larger.depthMm === 4000 && larger.decks === 6, "…and 3×4");

const resized = resizeRect(rect(0, 0, 3000, 3000), 0, 3000, 2000);
const ry = resized.map((p) => p.y);
assert(Math.min(...ry) === 1000 && Math.max(...ry) === 3000, "a suggested size keeps the back edge where it was");
assert(fillWithDecks(resized, [big], { front: 0 }).coverage > 0.999, "…and the resized area really is exact");
// QA 2026-11-20 ST-3: a stage in a corner, made wider, grows from the wall it stands against — its
// far end moves — instead of about its middle into that wall.
const fromStart = resizeRect(rect(0, 0, 6900, 3000), 0, 7320, 3000, "start");
assert(Math.min(...fromStart.map((p) => p.x)) === 0 && Math.max(...fromStart.map((p) => p.x)) === 7320, "anchored at the front's first corner, it grows from there");
const fromEnd = resizeRect(rect(0, 0, 6900, 3000), 0, 7320, 3000, "end");
assert(Math.min(...fromEnd.map((p) => p.x)) === -420 && Math.max(...fromEnd.map((p) => p.x)) === 6900, "…at its second, from there");
const aboutMiddle = resizeRect(rect(0, 0, 6900, 3000), 0, 7320, 3000);
assert(Math.min(...aboutMiddle.map((p) => p.x)) === -210, "…and by default about its middle, as before");

// Turned: a 4×2 area drawn at 30° is decked along its own edge.
const t = (30 * Math.PI) / 180;
const turned = rect(0, 0, 4000, 2000).map((p) => ({ x: p.x * Math.cos(t) - p.y * Math.sin(t), y: p.x * Math.sin(t) + p.y * Math.cos(t) }));
const tf = fillWithDecks(turned, [big]);
assert(tf.decks.length === 4 && Math.abs(tf.coverage - 1) < 1e-6, "an angled area is decked along its front edge");
assert(tf.decks.every((d) => Math.abs(d.rotation - 30) < 0.01), "…with every deck turned to match");
const cw = [...turned].reverse();
assert(fillWithDecks(cw, [big]).decks.length === 4, "…whichever way round its corners were clicked");

const blocked = fillWithDecks(rect(0, 0, 6000, 4000), [big], { obstacles: [rect(0, 0, 2000, 4000)] });
assert(blocked.decks.length === 8, "a stage already standing there is decked around");

const lShape: Point[] = [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 2000 },
  { x: 2000, y: 2000 },
  { x: 2000, y: 4000 },
  { x: 0, y: 4000 },
];
const l = fillWithDecks(lShape, [big]);
assert(Math.abs(l.coverage - 1) < 1e-9 && l.decks.length === 6, "an L is decked into its corner and no further");
assert(l.rect === null && l.suggestions.length === 0, "…and, not being a rectangle, is offered no sizes");

// A stage against the back wall faces the other way.
const wallAtY = (y: number) => (p: Point) => Math.abs(p.y - y);
assert(defaultFront(rect(0, 0, 6000, 3000), wallAtY(3000)) === 0, "against a wall behind, the front is the opposite edge");
assert(defaultFront(rect(0, 0, 6000, 3000), wallAtY(0)) === 2, "…and turned round, the other one");

const clipped = fillWithDecks(rect(4000, 0, 4000, 2000), [big], { within: rect(0, 0, 6000, 4000) });
assert(clipped.decks.length === 2 && clipped.decks.every((d) => d.centre.x < 6000), "a level drawn past its stage is laid only where the stage is");

assert(polygonsOverlap(rect(0, 0, 4000, 2000), rect(3000, 1000, 4000, 2000)), "two areas crossing overlap");
assert(!polygonsOverlap(rect(0, 0, 4000, 2000), rect(4000, 0, 4000, 2000)), "…two built flush do not");
assert(polygonsOverlap(rect(0, 0, 6000, 4000), rect(1000, 1000, 1000, 1000)), "…one inside the other does");
assert(!polygonsOverlap(rect(0, 0, 1000, 1000), rect(5000, 5000, 1000, 1000)), "…two apart do not");

assert(fillWithDecks(rect(0, 0, 1000, 1000), []).decks.length === 0, "no decks chosen, nothing laid");
assert(fillWithDecks(rect(0, 0, 500, 500), [big]).decks.length === 0, "an area smaller than any deck lays nothing");

// 244×122 sheets: the lengths they build pull a length in; anything else stays where it was put.
const sheets = lengthSnapper([{ id: "s", widthMm: 2440, depthMm: 1220 }]);
assert(sheets(4850, { magnetMm: 60 }) === 4880 && sheets(9790, { magnetMm: 60 }) === 9760, "a length near what the sheets build is pulled onto it");
assert(sheets(4700, { magnetMm: 60 }) === 4700 && sheets(4703) === 4700, "…anything else stays exact, to the centimetre");
assert(sheets(4960, { magnetMm: 60, gridMm: 100 }) === 5000, "…or to the grid it was asked for");
assert(lengthSnapper([big, small])(2960, { magnetMm: 60 }) === 3000, "metric decks pull to whole metres");
const sheet16 = fillWithDecks(rect(0, 0, 4880, 9760), [{ id: "s", widthMm: 2440, depthMm: 1220 }]);
assert(sheet16.decks.length === 16 && sheet16.coverage > 0.999, "a 4.88×9.76 is exactly sixteen 244×122 sheets");

// The base library's decks: the 244×122 sheet and the 80/60/40 strips cut to its length. They
// share no 10cm module, but one side exactly — one platform, the strips finishing the depth.
const sheet = { id: "122", widthMm: 2440, depthMm: 1220, heightMm: 600 };
const s80 = { id: "80", widthMm: 2440, depthMm: 800, heightMm: 600 };
const s60 = { id: "60", widthMm: 2440, depthMm: 600, heightMm: 600 };
const s40 = { id: "40", widthMm: 2440, depthMm: 400, heightMm: 600 };
const base244 = [sheet, s80, s60, s40];
const deep304 = fillWithDecks(rect(0, 0, 4880, 3040), base244, { front: 0 });
assert(deep304.coverage > 0.999, "a 4.88×3.04 stage is covered exactly by sheets and strips");
assert(count(deep304, "122") === 4 && count(deep304, "60") === 2, "…four sheets in two rows, and a 60cm strip behind each pair");
assert(deep304.decks.every((d) => d.rotation === 0), "…every one long side along the front");
const deep284 = fillWithDecks(rect(0, 0, 7320, 2840), base244, { front: 0 });
assert(deep284.coverage > 0.999 && count(deep284, "122") === 6 && count(deep284, "40") === 3, "a 7.32×2.84 is six sheets and three 40cm strips");
assert(count(fillWithDecks(rect(0, 0, 4880, 2440), base244), "122") === 4, "a depth the sheets divide uses no strips");
assert(lengthSnapper(base244)(3045, { magnetMm: 60 }) === 3040 && lengthSnapper(base244)(2845, { magnetMm: 60 }) === 2840, "the strips' depths are lengths the drawing pulls to");
const strips = fillWithDecks(rect(0, 0, 6000, 4000), [big, small, sheet, s40]);
assert(strips.decks.every((d) => d.typeId === "2x1" || d.typeId === "1x1") || strips.decks.every((d) => d.typeId === "122" || d.typeId === "40"), "a sheet and a metric deck are still never one platform");

// Exceeding the line: a 6.90m front gets a seventh metre of deck 10cm over the line; a 6.30m
// front does not get one 70cm over it; and a level never reaches past its stage.
const strip = fillWithDecks(rect(0, 0, 6900, 1000), [big, small], { front: 0 });
assert(strip.decks.length === 3 && strip.coverage < 0.9, "by default a 6.90m front is six metres of deck and a bare strip");
const over = fillWithDecks(rect(0, 0, 6900, 1000), [big, small], { front: 0, exceed: true });
assert(over.decks.length === 4 && over.decks.some((d) => d.centre.x + d.widthMm / 2 > 6900), "exceeding, a seventh metre of deck is laid over the line");
assert(over.decks.every((d) => d.centre.x + d.widthMm / 2 <= 6900 + 100 && d.centre.x - d.widthMm / 2 >= -100), "…by no more than the strip it covers, split between the two ends");
assert(over.coverage > 0.999, "…and the front is covered");
const worse = fillWithDecks(rect(0, 0, 6300, 1000), [big, small], { front: 0, exceed: true });
assert(worse.decks.length === 3, "a deck that would hang 70cm over to cover 30cm is not laid, even when exceeding");
const levelOver = fillWithDecks(rect(4000, 0, 4000, 2000), [big], { within: rect(0, 0, 6000, 4000), exceed: true });
assert(levelOver.decks.length === 2 && levelOver.decks.every((d) => d.centre.x + d.widthMm / 2 <= 6000), "a level never exceeds the stage it stands on");
assert(fillWithDecks(rect(0, 0, 6000, 4000), [big], { exceed: true }).decks.length === 12, "an exact area is the same build either way");

// A curved front: the rows run along the curve's end-to-end chord, not along its first chord. A
// 6×4 whose front is bowed 30cm out: with the first chord as the axis every deck leans with it;
// with the chord as the axis the build is the plain rectangle's, squared to the sides.
{
  const bowPts = Array.from({ length: 9 }, (_, k) => {
    const x = -3000 + (6000 * k) / 8;
    return { x, y: -300 * (1 - (x / 3000) ** 2) };
  });
  const bowed: Point[] = [...bowPts, { x: 3000, y: 4000 }, { x: -3000, y: 4000 }];
  const askew = fillWithDecks(bowed, [big], { front: 0 });
  assert(askew.decks.some((d) => d.rotation > 5 && d.rotation < 355), "(laid along a bow's first chord, the rows lean)");
  const square = fillWithDecks(bowed, [big], { front: 0, axis: [bowPts[0], bowPts[8]] });
  assert(square.decks.length >= askew.decks.length && square.decks.every((d) => d.rotation === 0), "laid along the bow's chord, the rows are square to the stage");
  assert(square.decks.every((d) => d.centre.y - d.depthMm / 2 >= -300 - 60), "…and start at the front");
}

// THE FRONT LINE AND THE RIM — the stage that showed the old fill up: a 12×5 body with an R1.8
// half-round out of the middle of its front. Laid from the apron's tip, the body's rows were
// offset from its own front, strips ran from the apron through the body, and a hole was left in
// its middle; the curve was stair-stepped with strips.
{
  const arc = (cx: number, cy: number, r: number, from: number, to: number, n: number): Point[] =>
    Array.from({ length: n + 1 }, (_, k) => {
      const a = ((from + ((to - from) * k) / n) * Math.PI) / 180;
      return { x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)) };
    });
  const apron: Point[] = [{ x: 0, y: 0 }, ...arc(6000, 0, 1800, 180, 360, 16), { x: 12000, y: 0 }, { x: 12000, y: 5000 }, { x: 0, y: 5000 }];
  const smooth = Array.from({ length: 15 }, (_, k) => k + 2);
  const withApron = fillWithDecks(apron, base244, { front: 0, smooth });
  const bodyAlone = fillWithDecks(rect(0, 0, 12000, 5000), base244, { front: 0 });
  assert(JSON.stringify(withApron.decks) === JSON.stringify(bodyAlone.decks), "an apron leaves the body's decks exactly as the body alone has them — its rows from its own front line");
  assert(withApron.decks.every((d) => d.centre.y > 0), "…no strip run out into the apron");
  assert(
    withApron.missing.length === 2 && withApron.missing.every((m) => m.info.kind === "quarter" && Math.abs((m.info.radiusMm ?? 0) - 1800) <= 20) && withApron.missing[0].shape === withApron.missing[1].shape,
    "…and the apron is named for what it is: one piece, a quarter-round R180, twice",
  );
  const R = 1800;
  const quarter: DeckType = { id: "q180", widthMm: R, depthMm: R, quarterMm: R, outline: [{ x: -R / 2, y: R / 2 }, { x: R / 2, y: R / 2 }, ...arc(-R / 2, R / 2, R, 0, -90, 8).slice(1, 8), { x: -R / 2, y: -R / 2 }] };
  const owned = fillWithDecks(apron, [...base244, quarter], { front: 0, smooth });
  const pieces = owned.decks.filter((d) => d.typeId === "q180");
  assert(owned.missing.length === 0 && pieces.length === 2 && pieces.every((d) => d.outline!.every((q) => q.y <= 1 && Math.hypot(q.x - 6000, q.y) <= R + 3)), "…and with the piece in the catalog, two of it stand in the apron");
  assert(owned.coverage > withApron.coverage + 0.05, "…covering what was missing");

  // A T: the catwalk in front of the front line is laid on its own, from its tip back, and the
  // body's rows still start at the line.
  const tee: Point[] = [{ x: 0, y: 0 }, { x: 2440, y: 0 }, { x: 2440, y: -1830 }, { x: 4880, y: -1830 }, { x: 4880, y: 0 }, { x: 7320, y: 0 }, { x: 7320, y: 3660 }, { x: 0, y: 3660 }];
  const t = fillWithDecks(tee, base244, { front: 0 });
  const behind = t.decks.filter((d) => d.centre.y > 0);
  assert(behind.length === 9 && behind.every((d) => d.rotation === 0 && [610, 1830, 3050].includes(d.centre.y)), "a T's body is its nine sheets in rows from the front line");
  assert(t.coverage > 0.995 && t.missing.length === 0, "…and its catwalk is decked to its tip");

  // Small rounded corners on sheets: the four corner sheets are one curved sheet, four of it — and a
  // corner cut at 45° is a sheet with its corner cut, named, not a hole.
  const r5: Point[] = [];
  const s5: number[] = [];
  for (const [cx, cy, from] of [[500, 500, 180], [6820, 500, 270], [6820, 3160, 0], [500, 3160, 90]] as const)
    arc(cx, cy, 500, from, from + 90, 6).forEach((p, k) => {
      if (k > 0 && k < 6) s5.push(r5.length);
      r5.push(p);
    });
  const rounded = fillWithDecks(r5, [sheet], { front: 6, smooth: s5 });
  assert(rounded.decks.length === 5 && rounded.missing.length === 4 && new Set(rounded.missing.map((m) => m.shape)).size === 1 && rounded.missing[0].info.kind === "curve", "a 7.32×3.66 rounded R50: five sheets, and one curved sheet four times");
  const cut = fillWithDecks([{ x: 0, y: 0 }, { x: 7320, y: 0 }, { x: 7320, y: 2440 }, { x: 6100, y: 3660 }, { x: 0, y: 3660 }], [sheet], { front: 0 });
  assert(cut.decks.length === 8 && cut.missing.length === 1 && cut.missing[0].info.kind === "angled", "a corner cut at 45°: eight sheets, and the corner sheet with its corner cut, named");
  const t2 = Date.now();
  fillWithDecks(apron, base244, { front: 0, smooth });
  assert(Date.now() - t2 < 1000, "a stage with a rim answers inside a second");

  // ורדה, 2026-10-28: an 8.01m deep band. Ten rows of 80cm strips cover it to the millimetre;
  // six rows of sheets and a 60cm strip leave 9cm at the back — and are what a crew lays.
  const band = fillWithDecks(rect(0, 0, 14640, 8012), base244, { front: 0 });
  assert(count(band, "122") === 36 && count(band, "60") === 6 && band.decks.length === 42, "an 8.01m deep band is six rows of sheets and a strip, not ten rows of strips");

  // A long side at 45° gets a row of sheets turned to run along it (the אמארה plan's crew) —
  // the square rows behind, and nothing listed to buy.
  const splay = fillWithDecks([{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 1000 }, { x: 7000, y: 6000 }, { x: 0, y: 6000 }], base244, { front: 0 });
  const along45 = splay.decks.filter((d) => Math.abs((((d.rotation % 180) + 180) % 180) - 135) < 0.5);
  assert(along45.length === 2 && along45.every((d) => d.typeId === "122"), "a 7m side at 45° carries two sheets turned along it");
  assert(splay.missing.length === 0 && splay.decks.every((d) => along45.includes(d) || d.rotation % 90 === 0), "…the rest square to the front, and no cut pieces");

  // A half-round apron too big to be one piece is decked as far as sheets reach — from the front
  // line out — and only its rim is pieces.
  const bigApron: Point[] = [{ x: 0, y: 0 }, ...arc(6000, 0, 4000, 180, 360, 24), { x: 12000, y: 0 }, { x: 12000, y: 4880 }, { x: 0, y: 4880 }];
  const ba = fillWithDecks(bigApron, base244, { front: 0, smooth: Array.from({ length: 23 }, (_, k) => k + 2) });
  const inApron = ba.decks.filter((d) => d.centre.y < 0 && !d.outline);
  assert(inApron.length >= 6 && inApron.some((d) => Math.abs(d.centre.y + 610) < 2), "a 4m half-round apron is sheets inside, the first row on the front line");
  assert(ba.missing.every((m) => m.info.kind !== "rect"), "…and none of its pieces is a rectangle a sheet would cover");
}

const t0 = Date.now();
fillWithDecks(rect(0, 0, 30000, 20000), [big, small, imperial]);
assert(Date.now() - t0 < 1500, "a ballroom-sized area answers inside a second and a half");
const t1 = Date.now();
fillWithDecks(rect(0, 0, 30000, 20000), base244);
assert(Date.now() - t1 < 1500, "…and so does one built from the 244 sheet and its strips (a 2cm grid)");
console.log("stage-fill self-check passed");
