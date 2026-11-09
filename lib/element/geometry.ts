// THE ONE READER CONTRACT — a definition's geometry, for every surface (docs/superpowers/specs/
// 2026-11-07-element-model-design.md §3).
//
// `elementGeometry(def, size)` evaluates a definition at a plan size: every part's profile as the
// outlines it is drawn as (lib/studio/footprint.ts is the profile engine — the derived shapes, the
// hollow bands, the bezier sides are all its), placed in the element's frame and centred on the box
// of the lot, exactly as a composite footprint is composed today; plus each part's z and height, the
// plan's path strings bottom-up, and the floor footprint every measuring reader already knows.
//
// SIZING and COMPOSITION are footprint.ts's own (`composeShapes`, `sizedShapes` — the readings
// `sizedFootprint` has always made, plus Stage 3's pins and repeats), asked of the definition's parts
// as the ShapeParts they are, so a definition read off a row draws EXACTLY the row's plan (the parity
// check holds it) and a definition with pinned or repeated parts is laid by them: one derived shape
// RE-DERIVED at the new size, one hand-drawn hollow shape stretched outside and re-cut, a composite
// with no bindings scaled whole, one with bindings anchored part by part.
//
// PURE. Run: npm run check:element
import type { ShapePart } from "@/lib/catalog/types";
import { composeShapes, footprintBounds, footprintOutlines, pieceOf, sizedShapes, type BuiltOutline, type Footprint } from "@/lib/studio/footprint";
import { outlinePathD, outlineStrokeD } from "@/lib/studio/geometry";
import { isMain } from "../self-check";
import type { ElementDefinition, ElementPart, ElementSize } from "./types";

/** One part, evaluated: the outlines it is drawn as in the element's frame (a hollow part is
 *  several), its bottom and its height. `index` is the part's place in the definition — the
 *  surfaceLayers index its texture is found by. */
export interface ResolvedPart {
  index: number;
  part: ElementPart;
  pieces: BuiltOutline[];
  zMm: number;
  heightMm: number;
}

/** One outline of the plan as path strings, ready for any SVG surface: `d` the filled shape,
 *  `line` its stroke without seams (null when the fill's edge is the line), `open` lines only. */
export interface PlanPiece {
  d: string;
  line: string | null;
  open?: boolean;
  part: number;
  zMm: number;
  heightMm: number;
}

export interface ElementGeometry {
  /** The floor footprint — today's type, what clearance, snap, hit-testing, alignment and the
   *  printed measurements read. Centred on the element's box. */
  footprint: Footprint;
  box: { w: number; h: number };
  parts: ResolvedPart[];
  /** Bottom-up: a raised part is drawn over what it stands above. */
  plan: PlanPiece[];
  /** The element's top — the highest part's top. */
  topMm: number;
}

/** A part as the ShapePart the footprint engine reads — its profile at its place, with its pin and
 *  its repeat (footprint.ts lays the copies and follows the pins). */
export function asShapePart(p: ElementPart): ShapePart {
  return { id: p.id, ...p.profile, x: p.x, y: p.y, rotation: p.rotation, ...(p.pin ? { pin: p.pin } : {}), ...(p.repeat ? { repeat: p.repeat } : {}) };
}

/** Which part each outline of a footprint draws: a multi's pieces say (BuiltOutline.of, else their
 *  index); a single footprint is the base's. */
function partIndices(fp: Footprint, outlines: readonly BuiltOutline[]): number[] {
  return fp.kind === "multi" ? outlines.map((o, i) => pieceOf(o, i)) : outlines.map(() => 0);
}

const EMPTY: ElementGeometry = { footprint: { kind: "rect", widthMm: 0, depthMm: 0 }, box: { w: 0, h: 0 }, parts: [], plan: [], topMm: 0 };

export function elementGeometry(def: ElementDefinition, size?: ElementSize): ElementGeometry {
  if (!def.parts.length) return EMPTY;
  const [base, ...rest] = def.parts.map(asShapePart);
  const footprint = size ? sizedShapes(base.shape, base, rest, size) : composeShapes(base.shape, base, rest);
  const outlines = footprintOutlines(footprint);
  const which = partIndices(footprint, outlines);
  const parts: ResolvedPart[] = def.parts.map((part, index) => ({
    index,
    part,
    pieces: outlines.filter((_, i) => which[i] === index),
    zMm: part.zMm,
    heightMm: part.heightMm,
  }));
  const plan: PlanPiece[] = parts
    .flatMap((p) =>
      p.pieces.map((o) => ({
        d: outlinePathD(o.outline, o.edgeCurves, o.open),
        line: o.open ? null : outlineStrokeD(o.outline, o.edgeCurves),
        ...(o.open ? { open: true } : {}),
        part: p.index,
        zMm: p.zMm,
        heightMm: p.heightMm,
      })),
    )
    .sort((a, b) => a.zMm - b.zMm);
  return {
    footprint,
    box: footprintBounds(footprint),
    parts,
    plan,
    topMm: Math.max(0, ...parts.map((p) => p.zMm + p.heightMm)),
  };
}

/** Whether every part stands on the floor at the element's height — a definition read off a row
 *  that knows no heights, whose plan is exactly the footprint drawn as it always was. */
export function flat(g: ElementGeometry): boolean {
  return g.parts.every((p) => p.zMm === 0 && p.heightMm === g.topMm);
}

/** Two footprints that say the same — footprint-shape.tsx's sameFootprint, here so a pure module
 *  can ask it, and stricter: `open` and a piece's `of` count too. */
export function sameFootprint(a: Footprint, b: Footprint): boolean {
  const pts = (p: { x: number; y: number }[], q: { x: number; y: number }[]) => p.length === q.length && p.every((v, i) => v.x === q[i].x && v.y === q[i].y);
  const curves = (p?: (unknown | null)[], q?: (unknown | null)[]) => JSON.stringify(p ?? null) === JSON.stringify(q ?? null);
  switch (a.kind) {
    case "circle":
      return b.kind === "circle" && a.diameterMm === b.diameterMm;
    case "rect":
    case "ellipse":
      return b.kind === a.kind && a.widthMm === b.widthMm && a.depthMm === b.depthMm;
    case "custom":
      return b.kind === "custom" && pts(a.outline, b.outline) && curves(a.edgeCurves, b.edgeCurves) && !!a.open === !!b.open;
    case "multi":
      return (
        b.kind === "multi" &&
        a.parts.length === b.parts.length &&
        a.parts.every(
          (p, i) => pts(p.outline, b.parts[i].outline) && curves(p.edgeCurves, b.parts[i].edgeCurves) && !!p.open === !!b.parts[i].open && (p.of ?? i) === (b.parts[i].of ?? i),
        )
      );
  }
}

if (isMain(import.meta.url)) {
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
  console.log("element geometry self-check passed");
}
