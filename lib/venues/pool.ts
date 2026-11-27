// A POOL STARTS FROM ITS SHAPE (2026-11-07, the user: "curve edges any shape, like pool"; spec
// docs/superpowers/specs/2026-11-07-venue-heights-rails-and-covers-design.md §4.4).
//
// The hall plan's "בריכה" used to be one thing — a 12 × 6 m ellipse — and every real pool was then
// reshaped out of it point by point. The flyout now offers the shape first: מלבן · אליפסה · כליה · ר
// · ציור חופשי. The first two are the plain shapes a feature already has (rect, ellipse); a kidney and
// an L are CUSTOM OUTLINES with their bows and corner radii already set — the very fields the outline
// editor bows and rounds (lib/studio/shaped-outline.ts), so a kidney placed here is edited exactly
// like one drawn by hand. "ציור חופשי" is the freehand trace laid in the `water` material, which
// already existed; the screen starts it (app/(app)/halls/halls-screen.tsx).
//
// A kidney is TWO UNEQUAL LOBES — a big round end, a smaller one, a waist drawn in on one long side —
// not an oval: four points, the side across the waist bowed in, every corner rounded deep enough
// that each end is a lobe. The L is a ר: a bar across the top and a leg down one end, every corner
// (the inner one too) rounded a little, as a pool's are.
//
// Pure; self-checked: npm run check:pool.
import type { EdgeCurve, Point } from "../studio/hall";
import { bowShapeSide, roundShapeCorner, shapedOutline, type OutlineShape } from "../studio/shaped-outline";
import { customShapeBounds } from "../studio/footprint";
import { asOutline } from "./face-surfaces";
import { featureFootprint, newFeature, type StructureFeature } from "./structure";

export type PoolPreset = "rect" | "ellipse" | "kidney" | "L" | "free";

/** In the order the flyout offers them. */
export const POOL_PRESETS: PoolPreset[] = ["rect", "ellipse", "kidney", "L", "free"];

export const POOL_PRESET_LABEL: Record<PoolPreset, string> = {
  rect: "מלבן",
  ellipse: "אליפסה",
  kidney: "כליה",
  L: "ר",
  free: "ציור חופשי",
};

/** The size each shape is put down at — a family pool, not the 12 × 6 m oval the plain kind starts
 *  as; the ellipse keeps that one (it IS the plain kind). */
export const POOL_PRESET_SIZE: Record<Exclude<PoolPreset, "free">, { widthMm: number; depthMm: number }> = {
  rect: { widthMm: 10000, depthMm: 5000 },
  ellipse: { widthMm: 12000, depthMm: 6000 },
  kidney: { widthMm: 10000, depthMm: 5000 },
  L: { widthMm: 10000, depthMm: 7000 },
};

/** A shape drawn about the origin in a w × d box: points, bows, radii. */
function kidneyShape(w: number, d: number): OutlineShape {
  // The big lobe on the left, the full depth; the small lobe on the right, about three quarters of
  // it, its top lower.
  const pts: Point[] = [
    { x: -w / 2, y: -d / 2 },
    { x: w / 2, y: -d / 2 + d * 0.22 },
    { x: w / 2, y: d / 2 - d * 0.06 },
    { x: -w / 2, y: d / 2 },
  ];
  let s: OutlineShape = { outline: pts };
  s = bowShapeSide(s, 0, -d * 0.34); // the waist, drawn IN
  s = bowShapeSide(s, 2, d * 0.08); // the other long side, a little full
  s = roundShapeCorner(s, 0, d * 0.45);
  s = roundShapeCorner(s, 3, d * 0.45);
  s = roundShapeCorner(s, 1, d * 0.36);
  s = roundShapeCorner(s, 2, d * 0.36);
  return s;
}

function lShape(w: number, d: number): OutlineShape {
  // ר: the bar across the top, the leg down the right-hand end.
  const arm = Math.min(w, d) * 0.4;
  const pts: Point[] = [
    { x: -w / 2, y: -d / 2 },
    { x: w / 2, y: -d / 2 },
    { x: w / 2, y: d / 2 },
    { x: w / 2 - arm, y: d / 2 },
    { x: w / 2 - arm, y: -d / 2 + arm },
    { x: -w / 2, y: -d / 2 + arm },
  ];
  return roundShapeCorner({ outline: pts }, "all", Math.round(Math.min(600, arm / 4)));
}

/** A drawn shape stretched until what it DRAWS (bows and arcs included) fills `w` × `d` — its points
 *  and bows by the box, its radii by the mean of the two factors. Three passes settle it. */
function fitted(make: (w: number, d: number) => OutlineShape, w: number, d: number): OutlineShape {
  let s = make(w, d);
  for (let k = 0; k < 3; k++) {
    const drawn = shapedOutline(s.outline, s.edgeCurves, s.corners);
    const b = customShapeBounds(drawn.outline, drawn.edgeCurves);
    const sx = w / (b.w || 1);
    const sy = d / (b.h || 1);
    const sr = Math.sqrt(sx * sy);
    const scale = (p: Point): Point => ({ x: (p.x - b.cx) * sx, y: (p.y - b.cy) * sy });
    s = {
      outline: s.outline.map(scale),
      ...(s.edgeCurves ? { edgeCurves: s.edgeCurves.map((c): EdgeCurve | null => (c ? { c1: { x: c.c1.x * sx, y: c.c1.y * sy }, c2: { x: c.c2.x * sx, y: c.c2.y * sy } } : null)) } : {}),
      ...(s.corners ? { corners: s.corners.map((r) => (r === null ? null : r * sr)) } : {}),
    };
  }
  return s;
}

/** A preset's outline about the origin at `w` × `d`: the plain shapes as themselves, the kidney and
 *  the L as custom outlines with their bows and radii. */
export function poolOutline(preset: Exclude<PoolPreset, "free">, w: number, d: number): Pick<StructureFeature, "shape" | "widthMm" | "depthMm"> & Pick<StructureFeature, "outline" | "edgeCurves" | "corners"> {
  if (preset === "rect") return { shape: "rect", widthMm: w, depthMm: d };
  if (preset === "ellipse") return { shape: "ellipse", widthMm: w, depthMm: d };
  const s = fitted(preset === "kidney" ? kidneyShape : lShape, w, d);
  const { shape, widthMm, depthMm, outline, edgeCurves, corners } = asOutline(s.outline, s.edgeCurves, s.corners);
  return { shape, widthMm, depthMm, outline, ...(edgeCurves ? { edgeCurves } : {}), ...(corners ? { corners } : {}) };
}

/** A new pool of that shape standing at `at`, its own default size unless one is given. */
export function newPoolFeature(preset: Exclude<PoolPreset, "free">, at: Point, size = POOL_PRESET_SIZE[preset]): Omit<StructureFeature, "id"> {
  return { ...newFeature("pool", at), ...poolOutline(preset, size.widthMm, size.depthMm) };
}

export function footprintBoxOf(f: Omit<StructureFeature, "id">) {
  const fp = featureFootprint(f);
  return fp.kind === "custom" ? customShapeBounds(fp.outline, fp.edgeCurves) : { w: f.widthMm, h: f.depthMm };
}
