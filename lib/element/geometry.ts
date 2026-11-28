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
  // A panel is a front shape again, so the engine plans its band.
  const front = p.op.kind === "panel" ? { plane: "front" as const, thicknessMm: p.op.thicknessMm, bendDeg: p.op.bendDeg, faceTurnDeg: p.op.faceTurnDeg } : {};
  return { id: p.id, ...p.profile, ...front, x: p.x, y: p.y, rotation: p.rotation, ...(p.pin ? { pin: p.pin } : {}), ...(p.repeat ? { repeat: p.repeat } : {}) };
}

/** Which part each outline of a footprint draws: a multi's pieces say (BuiltOutline.of, else their
 *  index); a single footprint is the base's. */
function partIndices(fp: Footprint, outlines: readonly BuiltOutline[]): number[] {
  return fp.kind === "multi" ? outlines.map((o, i) => pieceOf(o, i)) : outlines.map(() => 0);
}

export const EMPTY: ElementGeometry = { footprint: { kind: "rect", widthMm: 0, depthMm: 0 }, box: { w: 0, h: 0 }, parts: [], plan: [], topMm: 0 };

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
