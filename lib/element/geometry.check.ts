// npm run check:element — the self-check of ./geometry.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { ElementDefinition, ElementPart } from "./types";
import type { Product } from "@/lib/catalog/types";
import { resolveFootprint } from "@/lib/studio/footprint";
import { definitionOf, hasOwnBody } from "./adapter";
import { elementGeometry, EMPTY, flat, sameFootprint } from "./geometry";

const assert = (ok: boolean, what: string) => {
  if (!ok) throw new Error("FAIL: " + what);
  console.log(`  ok   ${what}`);
};
const part = (p: Partial<ElementPart> & { id: string }): ElementPart => ({
  profile: { shape: "rect", widthMm: 1000, depthMm: 500 },
  x: 0,
  y: 0,
  rotation: 0,
  zMm: 0,
  heightMm: 1100,
  op: { kind: "extrude" },
  ...p,
});
const def = (parts: ElementPart[]): ElementDefinition => ({ id: "d", version: 0, name: "בדיקה", params: [], parts, origin: "row" });

// One rectangle: the footprint stays a rect (the primitive kind every renderer draws as <rect>).
const one = elementGeometry(def([part({ id: "a", profile: { shape: "rect", widthMm: 1200, depthMm: 600 } })]));
assert(one.footprint.kind === "rect" && one.box.w === 1200 && one.box.h === 600, "one rectangle is a rect footprint 1200×600");
assert(one.parts.length === 1 && one.parts[0].pieces.length === 1 && one.plan.length === 1 && one.topMm === 1100, "…one part, one piece, one plan path, the item's height");
assert(flat(one), "…and flat");

// A bar: a counter on the floor, a back-bar behind it, a shelf on the back-bar at 1 m.
const bar = elementGeometry(
  def([
    part({ id: "counter", profile: { shape: "rect", widthMm: 3000, depthMm: 600 } }),
    part({ id: "back", profile: { shape: "rect", widthMm: 3000, depthMm: 400 }, y: -900, heightMm: 2000 }),
    part({ id: "shelf", profile: { shape: "rect", widthMm: 3000, depthMm: 300 }, y: -800, zMm: 1000, heightMm: 40 }),
  ]),
);
assert(bar.footprint.kind === "multi" && bar.footprint.parts.length === 3, "a bar of three shapes is a multi of three");
assert(bar.box.w === 3000 && bar.box.h === 1400, `…its box is the lot (${bar.box.w}×${bar.box.h})`);
assert(bar.parts[2].zMm === 1000 && bar.parts[2].heightMm === 40 && bar.topMm === 2000, "the shelf stands at 1 m, 4 cm thick; the back-bar is the top at 2 m");
assert(bar.plan[2].part === 2, "the raised shelf is drawn last, over the parts under it");
assert(!flat(bar), "…not flat");
// The footprint is centred on the lot's box, like every composite.
const ys = bar.footprint.kind === "multi" ? bar.footprint.parts.flatMap((p) => p.outline.map((v) => v.y)) : [];
assert(Math.min(...ys) === -700 && Math.max(...ys) === 700, "…centred on its box");

// Sized: a lone hexagon re-derives its corners; a composite scales whole.
const hex = elementGeometry(def([part({ id: "h", profile: { shape: "hexagon", widthMm: 1200, depthMm: 600 } })]), { widthMm: 2400, depthMm: 600 });
assert(hex.footprint.kind === "custom" && hex.box.w === 2400 && hex.box.h === 600, "a hexagon stretched is a hexagon at the new size");
const barWide = elementGeometry(
  def([part({ id: "counter", profile: { shape: "rect", widthMm: 3000, depthMm: 600 } }), part({ id: "end", profile: { shape: "circle", diameterMm: 600 }, x: 1800 })]),
  { widthMm: 4200, depthMm: 600 },
);
assert(barWide.box.w === 4200 && barWide.box.h === 600, "a composite stretched is scaled whole to the new box");
assert(barWide.parts[1].pieces.length === 1 && barWide.parts[1].pieces[0].outline.length === 4, "…and the round end is still the circle's four quarter arcs (scaled)");

// A hollow ח drawn as a band: the base's one shape is several pieces, all part 0.
const u = elementGeometry(def([part({ id: "u", profile: { shape: "rect", widthMm: 3000, depthMm: 2000, hollow: { bandMm: 600, openSides: [2] } } })]));
assert(u.parts[0].pieces.length >= 1 && u.parts.every((p) => p.index === 0), "a hollow base is pieces of part 0");
assert(u.plan.every((p) => p.part === 0 && p.d.startsWith("M")), "…each a path");

assert(elementGeometry(def([])) === EMPTY, "no parts → the empty geometry");

// PROVING ITEM 3 (spec §13, Stage 3): a pergola 400×400 — its first part the roof's reach, an
// outline only; posts 12×12 repeated at the corners, 2.2 m to the beams' underside; beams 15×20
// along the edges at 2.2 m; slats 5×10 across every 30 cm on the beams. Stretched 6×4 on the
// sketch it keeps its posts in the corners and its slats at 30 cm.
const pergola = def([
  part({ id: "roof", profile: { shape: "rect", widthMm: 4000, depthMm: 4000 }, heightMm: 2500, op: { kind: "none" } }),
  part({ id: "post", profile: { shape: "rect", widthMm: 120, depthMm: 120 }, heightMm: 2200, repeat: { along: "corners" }, own: true }),
  part({ id: "beam", profile: { shape: "rect", widthMm: 1000, depthMm: 150 }, zMm: 2200, heightMm: 200, repeat: { along: "edges" }, own: true }),
  part({ id: "slat", profile: { shape: "rect", widthMm: 50, depthMm: 1000 }, zMm: 2400, heightMm: 100, repeat: { along: "row", spacingMm: 300, axis: "x", marginMm: 150 }, own: true }),
]);
const pg = elementGeometry(pergola);
assert(Math.abs(pg.box.w - 4000) < 0.6 && Math.abs(pg.box.h - 4000) < 0.6 && pg.topMm === 2500, `the pergola's footprint is its roof's reach, 2.5 m to the top (${pg.box.w}×${pg.box.h})`);
assert(pg.parts[1].pieces.length === 4 && pg.parts[2].pieces.length === 4 && pg.parts[3].pieces.length === 13, `four posts, four beams, thirteen slats (${pg.parts[1].pieces.length}, ${pg.parts[2].pieces.length}, ${pg.parts[3].pieces.length})`);
assert(pg.plan[0].part === 0 && pg.plan[pg.plan.length - 1].part === 3, "the plan draws the roof's outline first and the slats last, over the beams and posts");
const pgWide = elementGeometry(pergola, { widthMm: 6000, depthMm: 4000 });
assert(Math.abs(pgWide.box.w - 6000) < 0.6 && pgWide.parts[1].pieces.length === 4 && pgWide.parts[3].pieces.length === 19, `laid 6 × 4: still four posts, nineteen slats (${pgWide.parts[3].pieces.length})`);
const postX = pgWide.parts[1].pieces.map((o) => o.outline.reduce((s, v) => s + v.x, 0) / o.outline.length).map(Math.abs);
assert(postX.every((x) => Math.abs(x - 2940) < 0.6), "…the posts stand in the new corners");

// THE FRONT PLANE (backdrops S2): picture 5's three wave layers at three depths, 2.4 / 2.0 / 1.6 m.
const panel = (thicknessMm: number) => ({ kind: "panel" as const, thicknessMm, bendDeg: 0, faceTurnDeg: 0 });
const layers = def([
  // The first part stands at the element's origin; the others are placed from it.
  part({ id: "l1", profile: { shape: "rect", widthMm: 4000, depthMm: 2400 }, op: panel(30), heightMm: 2400, own: true }),
  part({ id: "l2", profile: { shape: "rect", widthMm: 3600, depthMm: 2000 }, y: 300, op: panel(30), heightMm: 2000, own: true }),
  part({ id: "l3", profile: { shape: "rect", widthMm: 3200, depthMm: 1600 }, y: 600, op: panel(30), heightMm: 1600, own: true }),
]);
const lg = elementGeometry(layers);
assert(lg.footprint.kind === "multi" && lg.footprint.parts.length === 3, "three panels are three bands");
assert(Math.abs(lg.box.w - 4000) < 0.6 && Math.abs(lg.box.h - 630) < 0.6, `…the lot 4000 × 630 (${lg.box.w}×${lg.box.h})`);
assert(lg.topMm === 2400, "…the tallest is the top");
// A row read off the catalog: a front base row is a panel on the floor, its face height high.
const wallRow = {
  id: "w",
  name: "קיר",
  category: "other",
  layer: "floor",
  dimensions: { widthMm: 4000, depthMm: 30, heightMm: 2600 },
  categoryFields: {},
  styleTags: [],
  variants: [],
  appearance: { shape: "rect", content: "none", plane: "front" },
} as Product;
const wd = definitionOf(wallRow);
assert(wd.parts[0].op.kind === "panel" && wd.parts[0].heightMm === 2600 && wd.parts[0].profile.depthMm === 2600 && wd.parts[0].zMm === 0, "a front base is a panel 2600 high on the floor");
assert(wd.parts[0].op.kind === "panel" && wd.parts[0].op.thicknessMm === 30, "…30 thick");
assert(hasOwnBody(wallRow), "…and the element model builds it");
assert(sameFootprint(elementGeometry(wd).footprint, resolveFootprint(wallRow)), "the element's footprint is the row's");
// A front PART behind a plan base: a panel at its own z, its rise its face's.
const barRow = { ...wallRow, dimensions: { widthMm: 3000, depthMm: 600, heightMm: 1100 }, appearance: { shape: "rect", content: "none", parts: [{ id: "p", plane: "front", shape: "rect", widthMm: 3000, depthMm: 900, thicknessMm: 40, x: 0, y: -500, rotation: 0, zMm: 1100 }] } } as Product;
const bd2 = definitionOf(barRow);
assert(bd2.parts[1].op.kind === "panel" && bd2.parts[1].zMm === 1100 && bd2.parts[1].heightMm === 900 && bd2.parts[1].own === true, "a front part stands at its z, 900 high");
assert(sameFootprint(elementGeometry(bd2).footprint, resolveFootprint(barRow)), "…and the lot's footprint is the row's");
console.log("element geometry self-check passed");
