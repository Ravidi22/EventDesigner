// THE BOX A CATEGORY'S PICTURE IS DRAWN IN — on the plan and in the room.
//
// A category's picture (lib/catalog/symbols.ts: a lamp's shade, a sofa, a chandelier's arms) is laid
// into a box. Until 2026-11-13 it was drawn only when the item's footprint WAS a box — a circle, an
// ellipse or a rectangle — and any other first shape (a hexagon, a half-round, a hand-drawn outline),
// or any second shape added to the item, dropped the picture to a bare outline with a name in it
// (the user: "a lot of the categories in the catalog are broken when changing the shape").
//
// The rule now: THE PICTURE BELONGS TO THE FIRST SHAPE. It is drawn in the box of the item's first
// shape, where that shape stands; the shape's own outline is drawn round it, and every shape added
// beside it is drawn (and built) as the shape it is. The one case with no honest box is a first
// shape that is mostly AIR — a ring, an arc, a ח, lines only: a sofa laid into the box of a ring
// would be drawn across the hole in the middle of it, so that still reads as its outline (and a bar,
// a banquette, a pergola and a chuppah have recipes of their own that follow such shapes).
//
// Pure. Run: npm run check:picture-frame
import { customShapeBounds, flattenEdge, pieceOf, sampledBounds, type BuiltOutline, type Footprint } from "@/lib/studio/footprint";
import { polygonAreaMm2 } from "@/lib/studio/geometry";

export interface PictureFrame {
  /** The box's centre in the footprint's own frame (a footprint is drawn about its box centre). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Drawn as a round thing (a pouf, a round lamp, a ring of arms) rather than a boxy one. */
  round: boolean;
  /** The footprint IS the box — a circle, an ellipse or a rectangle: there is no outline to draw
   *  round the picture and nothing beside it. */
  plain: boolean;
}

/** How much of its box a first shape must fill for a picture to be laid into that box: a triangle is
 *  half its box, a hexagon three quarters; a ring, a ח or an arc is mostly air. */
export const PICTURE_FILL_MIN = 0.45;
/** A shape that fills its box as a circle does (π/4 ≈ 0.785 — a hexagon 0.75, an octagon 0.83) with
 *  more corners than a quadrilateral is drawn as a ROUND thing. */
const ROUND_FILL: readonly [number, number] = [0.72, 0.85];

function flatten(o: BuiltOutline): { x: number; y: number }[] {
  const n = o.outline.length;
  return o.outline.flatMap((a, i) => flattenEdge(a, o.outline[(i + 1) % n], o.edgeCurves?.[i]).slice(0, -1));
}

function framed(o: BuiltOutline, b: { w: number; h: number; cx: number; cy: number }, origin: { x: number; y: number }): PictureFrame | null {
  if (o.open || o.face || b.w <= 0 || b.h <= 0) return null;
  const fill = polygonAreaMm2(flatten(o)) / (b.w * b.h);
  if (fill < PICTURE_FILL_MIN) return null;
  const curved = !!o.edgeCurves?.some((c) => !!c);
  const round = fill >= ROUND_FILL[0] && fill <= ROUND_FILL[1] && (curved || o.outline.length >= 5);
  // A ROUND picture is drawn INSIDE the shape: the largest oval of the box's proportions that the
  // outline holds (a hexagon's corners are cut — an oval the size of its box pokes out past its flat
  // sides). Found in the box's own stretched space, where that oval is a circle about the middle: the
  // nearest the outline comes to the centre.
  const fit = round ? inscribed(flatten(o), b) : 1;
  // (A drawn circle's sampled arcs come a hair short of its box: that is the whole circle.)
  const k = fit > 0.985 ? 1 : Math.max(0.6, fit);
  return { x: b.cx - origin.x, y: b.cy - origin.y, w: b.w * k, h: b.h * k, round, plain: false };
}

/** How near the outline comes to its box's centre, as a share of the box's half-size (1 = it touches
 *  the box all round, as a circle does). */
function inscribed(poly: { x: number; y: number }[], b: { w: number; h: number; cx: number; cy: number }): number {
  const p = poly.map((q) => ({ x: (q.x - b.cx) / (b.w / 2), y: (q.y - b.cy) / (b.h / 2) }));
  let best = Infinity;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const c = p[(i + 1) % p.length];
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(a.x + dx * t, a.y + dy * t));
  }
  return Number.isFinite(best) ? best : 1;
}

const frameCache = new WeakMap<object, PictureFrame | null>();

/** The box a picture is drawn in on this footprint, or null when its first shape has no honest box
 *  (mostly air, lines only, a front panel's band). Remembered per footprint object. */
export function pictureFrame(f: Footprint): PictureFrame | null {
  if (f.kind === "circle") return { x: 0, y: 0, w: f.diameterMm, h: f.diameterMm, round: true, plain: true };
  if (f.kind === "ellipse") return { x: 0, y: 0, w: f.widthMm, h: f.depthMm, round: true, plain: true };
  if (f.kind === "rect") return { x: 0, y: 0, w: f.widthMm, h: f.depthMm, round: false, plain: true };
  if (frameCache.has(f)) return frameCache.get(f)!;
  let out: PictureFrame | null;
  if (f.kind === "custom") {
    // A hand-drawn outline is drawn about its box centre (FootprintShape), so its frame is at (0,0).
    const b = customShapeBounds(f.outline, f.edgeCurves);
    out = framed({ outline: f.outline, edgeCurves: f.edgeCurves, open: f.open, face: f.face }, b, { x: b.cx, y: b.cy });
  } else {
    // Several shapes: the FIRST one's box, where it stands in the item's frame. A first shape drawn
    // as several pieces (a band with two sides open) is mostly air.
    const base = f.parts.filter((p, i) => pieceOf(p, i) === 0);
    out = base.length === 1 ? framed(base[0], sampledBounds(base), { x: 0, y: 0 }) : null;
  }
  frameCache.set(f, out);
  return out;
}

/** The plain footprint a picture's recipe is handed for a frame: the box it is drawn in, as the
 *  circle, ellipse or rectangle the recipes have always read. */
export function frameFootprint(frame: Pick<PictureFrame, "w" | "h" | "round">): Footprint {
  if (!frame.round) return { kind: "rect", widthMm: frame.w, depthMm: frame.h };
  return Math.abs(frame.w - frame.h) <= 1 ? { kind: "circle", diameterMm: frame.w } : { kind: "ellipse", widthMm: frame.w, depthMm: frame.h };
}
