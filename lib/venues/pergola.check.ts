// npm run check:pergola — the self-check of ./pergola.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/studio/hall";
import { shapedOutline } from "@/lib/studio/shaped-outline";
import { autoPostSpots, beamSpotAt, latticeTicks, legsPatch, NEW_PERGOLA, PERGOLA_CATEGORY, pergolaGeometry, pergolaOfProduct, pergolaPostOf, pergolaPostsInRoom, pergolaRoofLines, pergolaSides, pergolaSpec, POST_MIN_MM, postsAdded, postsMoved, postsRemoved, type PergolaRoof } from "./pergola";

// ponytail: self-check. Run: npm run check:pergola
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const near = (a: number, b: number, eps = 1) => Math.abs(a - b) <= eps;
const inside = (p: Point, poly: readonly Point[]) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
};

// A 4 × 4: a post in each corner, inside the outline, its outer faces on it.
const sq = pergolaGeometry({ kind: "rect", widthMm: 4000, depthMm: 4000 }, NEW_PERGOLA)!;
assert(sq.posts.length === 4, `a 4 × 4 stands on four posts (got ${sq.posts.length})`);
assert(sq.posts.every((p) => near(Math.abs(p.at.x), 1925) && near(Math.abs(p.at.y), 1925)), "…each in its corner, half a post in from both sides");
const slats = pergolaRoofLines(sq);
assert(slats.length >= 10 && slats.every(([a, b]) => near(a.x, b.x) && near(Math.abs(b.y - a.y), 3850)), `the slats run across it, from beam to beam (${slats.length})`);
const xs = slats.map(([a]) => Math.round(a.x)).sort((a, b) => a - b);
assert(xs.every((x, i) => i === 0 || near(x - xs[i - 1], 300)), "…30cm apart");
assert(xs.includes(0), "…on centres struck from the middle");

// The same row laid 6 × 4: the posts and the slats keep their millimetres; only the count grows.
const wide = pergolaGeometry({ kind: "rect", widthMm: 6000, depthMm: 4000 }, NEW_PERGOLA)!;
assert(wide.postMm === 150 && wide.spacingMm === 300, "stretched, a pergola keeps its post and its spacing");
assert(wide.posts.length === 4, "…and a 6 m side still spans corner to corner");
const wideSlats = pergolaRoofLines(wide);
assert(wideSlats.every(([a, b]) => near(a.x, b.x)) && wideSlats.length > slats.length, "…its slats run across the long side, more of them");
// A 12 m side does not.
const long = pergolaGeometry({ kind: "rect", widthMm: 12000, depthMm: 4000 }, NEW_PERGOLA)!;
assert(long.posts.length === 6, `a 12 m side gets a post in its middle (got ${long.posts.length})`);
// A slat direction typed: along the width.
const along = pergolaRoofLines(pergolaGeometry({ kind: "rect", widthMm: 6000, depthMm: 4000 }, { ...NEW_PERGOLA, slatDirectionDeg: 0 })!);
assert(along.every(([a, b]) => near(a.y, b.y)), "a typed direction of 0 runs the slats along x");

// Round: posts round the rim about every 3 m, at least four.
const round = pergolaGeometry({ kind: "circle", diameterMm: 6000 }, NEW_PERGOLA)!;
assert(round.posts.length === 6, `a ⌀6 pergola stands on six posts (got ${round.posts.length})`);
assert(round.posts.every((p) => near(Math.hypot(p.at.x, p.at.y), 2925, 15)), "…on its rim, half a post in");
const small = pergolaGeometry({ kind: "circle", diameterMm: 2500 }, NEW_PERGOLA)!;
assert(small.posts.length === 4, "a small round one still stands on four");

// A rounded rectangle (lib/studio/shaped-outline.ts makes the arcs): one post on each corner's
// arc, none where the arc meets the side.
const shaped = shapedOutline(
  [
    { x: -2000, y: -1500 },
    { x: 2000, y: -1500 },
    { x: 2000, y: 1500 },
    { x: -2000, y: 1500 },
  ],
  undefined,
  [600, 600, 600, 600],
);
const rounded = pergolaGeometry({ kind: "custom", outline: shaped.outline, edgeCurves: shaped.edgeCurves }, NEW_PERGOLA)!;
assert(rounded.posts.length === 4, `a rounded rectangle stands on four posts (got ${rounded.posts.length})`);
const cornerC = { x: 2000 - 600, y: 1500 - 600 };
assert(rounded.posts.some((p) => near(Math.hypot(p.at.x - cornerC.x, p.at.y - cornerC.y), 600 - 75, 20)), "…each on its corner's arc, half a post in");

// A side bowed out between two corners: the corners hold it, and a post between them on the bow.
const bowed = pergolaGeometry(
  {
    kind: "custom",
    outline: [
      { x: -4000, y: -2000 },
      { x: 4000, y: -2000 },
      { x: 4000, y: 2000 },
      { x: -4000, y: 2000 },
    ],
    edgeCurves: [{ c1: { x: 2667, y: -1333 }, c2: { x: -2667, y: -1333 } }, null, null, null],
  },
  NEW_PERGOLA,
)!;
assert(bowed.posts.length >= 6, `a bowed 8 m side has posts along its bow as well as its corners (got ${bowed.posts.length})`);

// An L: every slat inside the outline, none across the notch.
const L = pergolaGeometry(
  {
    kind: "custom",
    outline: [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 3000 },
      { x: 3000, y: 3000 },
      { x: 3000, y: 6000 },
      { x: 0, y: 6000 },
    ],
  },
  NEW_PERGOLA,
)!;
assert(L.posts.length === 6, `an L stands on a post at each of its six corners (got ${L.posts.length})`);
const Lslats = pergolaRoofLines(L);
assert(Lslats.length > 0 && Lslats.every(([a, b]) => inside({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, L.outline)), "…its slats all under its roof, none across the notch");

// Roofs.
assert(pergolaRoofLines(pergolaGeometry({ kind: "rect", widthMm: 4000, depthMm: 4000 }, { ...NEW_PERGOLA, roof: "none" })!).length === 0, "beams only: no lines across");
const hatch = pergolaRoofLines(pergolaGeometry({ kind: "rect", widthMm: 4000, depthMm: 4000 }, { ...NEW_PERGOLA, roof: "solid" })!);
assert(hatch.length > 0 && hatch.every(([a, b]) => !near(a.x, b.x) && !near(a.y, b.y)), "a solid roof is hatched across, at a slant");

// Lattice: on the closed sides, between the outline and a post's depth in.
const latticed = pergolaGeometry({ kind: "rect", widthMm: 4000, depthMm: 3000 }, { ...NEW_PERGOLA, closedSides: [1] })!;
const ticks = latticeTicks(latticed.sides[1]);
assert(ticks.length > 10 && ticks.every(([a, b]) => near(a.x, 2000) && near(b.x, 1850)), "a closed side is hatched across a post-deep band along it");
assert(pergolaSides({ kind: "rect", widthMm: 4000, depthMm: 3000 }).map((s) => s.name).join() === "למעלה,ימין,למטה,שמאל", "the sides are named by where they face");

// The spec, cleaned.
assert(pergolaSpec(undefined).postMm === 150 && pergolaSpec(undefined).roof === "slats", "absent reads as a new pergola");
assert(pergolaSpec({ postMm: 5, roof: "glass" as PergolaRoof }).postMm === POST_MIN_MM && pergolaSpec({ roof: "glass" as PergolaRoof }).roof === "slats", "a nonsense post or roof is held to sense");
assert(pergolaSpec({ slatDirectionDeg: 270 }).slatDirectionDeg === 90, "a direction is a line: 270° is 90°");
assert(JSON.stringify(pergolaSpec({ closedSides: [2, 0, 2, -1] }).closedSides) === "[0,2]", "closed sides unique, sorted, real");
const row = { category: PERGOLA_CATEGORY, categoryFields: { postMm: 200 }, appearance: { shape: "rect" as const, content: "none" as const, symbolStyle: "fabric" } };
assert(pergolaOfProduct(row).postMm === 200 && pergolaOfProduct(row).roof === "fabric", "a row's post is its categoryFields.postMm, its roof its drawing style");
assert(pergolaPostOf({ category: "chuppahs", categoryFields: {} }) === undefined, "…and a row that is not a pergola has no post");
assert(pergolaOfProduct({ category: PERGOLA_CATEGORY, categoryFields: {} }).roof === "slats", "a row with no style has slats");

// Legs (2026-11-19): none, or put by hand on the beam line.
const rect = { kind: "rect" as const, widthMm: 4000, depthMm: 3000 };
assert(pergolaGeometry(rect, { ...NEW_PERGOLA, legs: "none" })!.posts.length === 0, "no legs: beams and roof, no posts");
assert(pergolaRoofLines(pergolaGeometry(rect, { ...NEW_PERGOLA, legs: "none" })!).length > 0, "…its roof still across them");
const auto = autoPostSpots(rect, NEW_PERGOLA);
assert(auto.length === 4, `custom starts from the four automatic posts (got ${auto.length})`);
const fromAuto = pergolaGeometry(rect, { ...NEW_PERGOLA, legs: "custom", posts: auto })!;
const autoG = pergolaGeometry(rect, NEW_PERGOLA)!;
assert(fromAuto.posts.length === 4 && fromAuto.posts.every((p) => autoG.posts.some((q) => near(p.at.x, q.at.x) && near(p.at.y, q.at.y))), "…standing exactly where the automatic ones stood");
assert(fromAuto.posts.every((p, i) => p.spot === i), "…each knowing which spot it is");
const mid = beamSpotAt(autoG, { x: 0, y: -1700 })!;
assert(mid.spot.side === 0 && near(mid.spot.t, 0.5, 0.001) && near(mid.at.y, -1425), `a click near the top side's middle lands on its beam line, half way (side ${mid.spot.side}, t ${mid.spot.t})`);
const five = pergolaSpec({ ...NEW_PERGOLA, legs: "custom", posts: postsAdded({ ...NEW_PERGOLA, posts: auto }, mid.spot) });
assert(pergolaGeometry(rect, five)!.posts.length === 5, "a post put there is a fifth post");
const wider = pergolaGeometry({ kind: "rect", widthMm: 8000, depthMm: 3000 }, five)!;
assert(wider.posts.some((p) => near(p.at.x, 0) && near(p.at.y, -1425)), "…and it stays at its side's middle when the pergola is stretched");
const moved = pergolaSpec({ ...five, posts: postsMoved(five, 4, { side: 0, t: 0.25 }) });
assert(pergolaGeometry(rect, moved)!.posts.some((p) => p.spot === 4 && near(p.at.x, -963, 2)), "a post slid a quarter along its side");
assert(pergolaGeometry(rect, pergolaSpec({ ...five, posts: postsRemoved(five, 0) }))!.posts.length === 4, "…and one taken away");
assert(pergolaGeometry(rect, pergolaSpec({ ...NEW_PERGOLA, legs: "custom", posts: [{ side: 9, t: 0.5 }] }))!.posts.length === 0, "a post on a side the outline no longer has goes with it");
assert(pergolaSpec({ legs: "custom", posts: [{ side: 1, t: 2 }, { side: 1, t: 1 }, { side: -1, t: 0 }] }).posts!.length === 1, "spots held to their side, unique, real");
assert(pergolaSpec({ legs: "auto", posts: auto }).legs === undefined && pergolaSpec({ legs: "auto", posts: auto }).posts === undefined, "automatic is stored as nothing, and keeps no hand-put posts");
const back = legsPatch(rect, five, "custom");
assert(back.posts!.length === 5, "choosing מותאם again keeps the posts already put");

// In the room: turned 90° about its place.
const room = pergolaPostsInRoom(sq, { x: 10000, y: 5000 }, 90);
assert(room.length === 4 && room.every((poly) => poly.every((q) => near(Math.abs(q.x - 10000), 1925, 76) && near(Math.abs(q.y - 5000), 1925, 76))), "its posts carried into the room");

console.log(`pergola: ok (${sq.posts.length}/${round.posts.length}/${rounded.posts.length}/${L.posts.length} posts)`);
