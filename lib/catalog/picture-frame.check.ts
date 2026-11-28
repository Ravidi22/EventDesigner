// npm run check:picture-frame — the self-check of ./picture-frame.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { type BuiltOutline } from "@/lib/studio/footprint";
import { frameFootprint, pictureFrame } from "./picture-frame";

const assert = (ok: boolean, what: string) => {
  if (!ok) throw new Error("FAIL: " + what);
  console.log(`  ok   ${what}`);
};
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
const circle = pictureFrame({ kind: "circle", diameterMm: 400 })!;
assert(circle.plain && circle.round && circle.w === 400 && circle.x === 0, "a circle is its own frame, round");
assert(pictureFrame({ kind: "rect", widthMm: 2000, depthMm: 900 })!.round === false && pictureFrame({ kind: "ellipse", widthMm: 600, depthMm: 300 })!.round, "a rectangle is boxy, an ellipse round");

// A regular hexagon, drawn off-centre: its box about its own middle, drawn round.
const hex = Array.from({ length: 6 }, (_, i) => ({ x: 5000 + 300 * Math.cos((i * Math.PI) / 3), y: 900 + 300 * Math.sin((i * Math.PI) / 3) }));
const hexFrame = pictureFrame({ kind: "custom", outline: hex })!;
assert(hexFrame !== null && !hexFrame.plain && hexFrame.round && hexFrame.x === 0 && hexFrame.y === 0, "a hexagon carries the picture as a round thing, about its own middle");
assert(hexFrame.w < 600 && hexFrame.w > 500 && near(hexFrame.w / hexFrame.h, 600 / 520, 0.01), `…in the largest oval of its box's proportions that fits INSIDE it (${Math.round(hexFrame.w)} × ${Math.round(hexFrame.h)})`);
// A triangle fills half its box: still a frame, boxy.
const tri = pictureFrame({ kind: "custom", outline: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 500, y: 800 }] })!;
assert(tri !== null && !tri.round && near(tri.w, 1000) && near(tri.h, 800), "a triangle is a boxy frame");
// A thin L (mostly air), lines only, and a front panel's band: no frame.
const ell = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 200 }, { x: 200, y: 200 }, { x: 200, y: 2000 }, { x: 0, y: 2000 }];
assert(pictureFrame({ kind: "custom", outline: ell }) === null, "an L that is mostly air has no box to lay a picture in");
assert(pictureFrame({ kind: "custom", outline: hex, open: true }) === null, "lines only carry no picture");
assert(pictureFrame({ kind: "custom", outline: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 20 }, { x: 0, y: 20 }], face: [0] }) === null, "a front panel's band is not a picture's box");

// Two shapes: the picture is the FIRST one's, where it stands; the second is beside it.
const sq = (cx: number, cy: number, s: number): BuiltOutline => ({ outline: [{ x: cx - s, y: cy - s }, { x: cx + s, y: cy - s }, { x: cx + s, y: cy + s }, { x: cx - s, y: cy + s }] });
const two = pictureFrame({ kind: "multi", parts: [sq(-300, 0, 200), sq(300, 0, 100)] })!;
assert(two !== null && !two.plain && near(two.x, -300) && near(two.y, 0) && near(two.w, 400) && near(two.h, 400), "with a second shape added, the picture stays on the first — in its box, where it stands");
// A first shape cut into two pieces (a band open on two sides): mostly air.
assert(pictureFrame({ kind: "multi", parts: [{ ...sq(-300, 0, 50), of: 0 }, { ...sq(300, 0, 50), of: 0 }] }) === null, "a first shape drawn as two pieces is no box");
const f = { kind: "custom" as const, outline: hex };
assert(pictureFrame(f) === pictureFrame(f), "the frame is remembered per footprint");
assert(frameFootprint(hexFrame).kind === "ellipse" && frameFootprint(two).kind === "rect" && frameFootprint(circle).kind === "circle", "a frame is handed to a recipe as the plain shape it reads");
// A circle drawn as an outline (four arcs) loses nothing.
const K = 0.5522847498;
const arcs = { outline: [{ x: 300, y: 0 }, { x: 0, y: 300 }, { x: -300, y: 0 }, { x: 0, y: -300 }], edgeCurves: [{ c1: { x: 0, y: 300 * K }, c2: { x: 300 * K, y: 0 } }, { c1: { x: -300 * K, y: 0 }, c2: { x: 0, y: 300 * K } }, { c1: { x: 0, y: -300 * K }, c2: { x: -300 * K, y: 0 } }, { c1: { x: 300 * K, y: 0 }, c2: { x: 0, y: -300 * K } }] };
const drawnCircle = pictureFrame({ kind: "multi", parts: [arcs, sq(900, 0, 100)] });
assert(!!drawnCircle && drawnCircle.round && drawnCircle.w === 600, `a round first shape beside another keeps its whole circle (${drawnCircle ? Math.round(drawnCircle.w) : "none"})`);
console.log("picture-frame self-check passed");
