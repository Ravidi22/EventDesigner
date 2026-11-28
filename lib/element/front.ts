// THE FRONT SHAPE — a shape drawn on the FRONT plane and pushed back by its thickness (docs/
// superpowers/specs/2026-11-09-backdrops-front-drawing-and-text-design.md §1–§2, S2). A plan shape is
// drawn on the floor and pushed UP by its height; a backdrop's panel, an arch, a wave, a petal is
// drawn in the חזית view and pushed BACK. Its profile fields (`shape`, `widthMm`, `depthMm`,
// `outline`, `hollow`…) describe its FACE — x across, the second axis UP, stored as the elevation
// canvas draws it (y = −up) — and the footprint engine reads it as its PLAN BAND: the face's across
// extent by its thickness, bent along an arc (lib/studio/footprint.ts frontBand), so every plan reader
// sees the band without knowing what a front shape is.
//
// This module is the front shape's own arithmetic beyond the band: which rows have one, how a bent
// panel's points stand in the room (the 3D builds the face pushed back through `panelPoint`), where a
// face is cut to bend it, and the front-only presets (a wave, a petal).
//
// Pure. Run: npm run check:front
import { FRONT_BEND_MAX_DEG, FRONT_THICK_MM, usesDiameter, type Product, type ShapePart } from "@/lib/catalog/types";
import { frontBandOffset, frontFace } from "@/lib/studio/footprint";
import type { EdgeCurve, Point } from "@/lib/studio/hall";

/** A shape drawn on the front plane. */
export const isFront = (s: { plane?: string } | undefined): boolean => s?.plane === "front";

/** Whether any shape of the row — its base or an added one — is drawn on the front plane. */
export function hasFront(product: Product): boolean {
  const a = product.appearance;
  if (!a) return false;
  return isFront(a) || (a.parts ?? []).some(isFront);
}

// ── Standing it in the room ─────────────────────────────────────────────────────────────────────

/** A point of a front panel on the plan: `u` across its mid-line (−W/2 … W/2, left to right as its
 *  face is seen), `w` through it (−t/2 the back … +t/2 the face), relative to its plan band's BOX
 *  centre (lib/studio/footprint.ts frontBand) — so the 3D stands each face point exactly on the band
 *  the plan draws. Flat: (u, w). Bent: on the arc of radius R = W / sweep struck from in front (+ bend)
 *  or behind (− bend), the face the inner arc of a + bend and the outer of a − one. */
export function panelPoint(u: number, w: number, widthMm: number, thicknessMm: number, bendDeg: number): Point {
  const W = Math.max(1, widthMm);
  const sweep = Math.min(FRONT_BEND_MAX_DEG, Math.abs(bendDeg || 0));
  if (sweep < 0.5) return { x: u, y: w };
  const R = W / ((sweep * Math.PI) / 180);
  const flip = bendDeg < 0;
  // For a − bend the drawing is the + one mirrored front to back, which turns the face to the back:
  // w is read the other way round before the mirror.
  const ww = flip ? -w : w;
  const r = Math.max(1, R - ww);
  const a = -Math.PI / 2 + u / R;
  const p = { x: r * Math.cos(a), y: r * Math.sin(a) };
  if (flip) p.y = -p.y;
  const o = frontBandOffset(W, Math.max(1, thicknessMm), bendDeg);
  return { x: p.x - o.x, y: p.y - o.y };
}

/** Where a face is cut across to be bent: both ends and a cut every ≤ 10° of sweep (a flat one is
 *  not cut). Each slab between two cuts is laid flat and its points moved through panelPoint. */
export function bendCuts(widthMm: number, bendDeg: number): number[] {
  const W = Math.max(1, widthMm);
  const sweep = Math.min(FRONT_BEND_MAX_DEG, Math.abs(bendDeg || 0));
  if (sweep < 0.5) return [-W / 2, W / 2];
  const n = Math.max(2, Math.ceil(sweep / 10));
  return Array.from({ length: n + 1 }, (_, k) => -W / 2 + (W * k) / n);
}

/** A polygon clipped to the slab a ≤ x ≤ b (Sutherland–Hodgman, one side then the other). A concave
 *  polygon may come back with zero-width bridges along a cut, which a triangulation takes in its stride. */
export function clipSlab(polygon: readonly Point[], a: number, b: number): Point[] {
  const clip = (pts: readonly Point[], keep: (p: Point) => boolean, cut: number): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const pin = keep(p);
      const qin = keep(q);
      if (pin) out.push(p);
      if (pin !== qin && q.x !== p.x) {
        const t = (cut - p.x) / (q.x - p.x);
        out.push({ x: cut, y: p.y + (q.y - p.y) * t });
      }
    }
    return out;
  };
  const lo = clip(polygon, (p) => p.x >= a, a);
  return lo.length ? clip(lo, (p) => p.x <= b, b) : [];
}

// ── Editing a front shape ───────────────────────────────────────────────────────────────────────

/** A front shape bent to `bendDeg` without moving its MIDDLE: a shape's place is its band's box
 *  centre, which slides as the arc deepens, so the place is moved by the difference — the panel
 *  bends about the point of its mid-line it is held by. */
export function bendKeepingMiddle(s: ShapePart, bendDeg: number): Partial<ShapePart> {
  const bend = Math.max(-FRONT_BEND_MAX_DEG, Math.min(FRONT_BEND_MAX_DEG, Math.round(bendDeg)));
  const W = frontFace(s.shape, s).w;
  const t = s.thicknessMm ?? FRONT_THICK_MM;
  const before = panelPoint(0, 0, W, t, s.bendDeg ?? 0);
  const after = panelPoint(0, 0, W, t, bend);
  const r = ((s.rotation || 0) * Math.PI) / 180;
  const dx = before.x - after.x;
  const dy = before.y - after.y;
  return {
    bendDeg: bend || undefined,
    x: Math.round(s.x + dx * Math.cos(r) - dy * Math.sin(r)),
    y: Math.round(s.y + dx * Math.sin(r) + dy * Math.cos(r)),
  };
}

/** A plan shape stood up on the front plane ("העמדה בחזית"): its outline becomes its face, its height
 *  (else the item's) the face's height, 2 cm thick, at its own z; what a front shape does not take
 *  (a body of revolution, a pin, a repeat) goes. A round one keeps its diameter. */
export function toFront(s: ShapePart, itemHeightMm: number): ShapePart {
  const rise = s.heightMm ?? itemHeightMm;
  return {
    ...s,
    plane: "front",
    ...(s.shape === "custom" || usesDiameter(s.shape) ? {} : { depthMm: rise }),
    thicknessMm: FRONT_THICK_MM,
    heightMm: undefined,
    revolve: undefined,
    pin: undefined,
    repeat: undefined,
  };
}

/** A front shape laid back on the plan ("החזרה לתוכנית"): as deep as it was thick, as tall as its
 *  face, at its own z. */
export function toPlan(s: ShapePart): ShapePart {
  const face = frontFace(s.shape, s);
  return {
    ...s,
    plane: undefined,
    ...(s.shape === "custom" || usesDiameter(s.shape) ? {} : { depthMm: s.thicknessMm ?? FRONT_THICK_MM }),
    heightMm: Math.round(face.h),
    thicknessMm: undefined,
    bendDeg: undefined,
    faceTurnDeg: undefined,
  };
}

// ── The front-only presets (the חזית rail's גל and עלה) ─────────────────────────────────────────
//
// Outlines in the FACE frame (x across, y = −up), filling exactly their w × h box: every extreme is a
// vertex and every curve's tangent is level or plumb there, so the box read off the points is the box
// drawn (lib/studio/footprint.ts rule 2).

/** A WAVE — picture 5's "mountain" layer: a flat foot, plumb sides, and a top of `crests` smooth
 *  hills, the valleys `WAVE_DIP` of the height down, both ends in a valley. */
export function waveOutline(widthMm: number, heightMm: number, crests = 3): { outline: Point[]; edgeCurves: (EdgeCurve | null)[] } {
  const w = Math.max(10, widthMm);
  const h = Math.max(10, heightMm);
  const n = Math.max(1, Math.round(crests));
  const top = -h / 2;
  const valley = top + WAVE_DIP * h;
  const outline: Point[] = [{ x: -w / 2, y: h / 2 }, { x: w / 2, y: h / 2 }];
  const edgeCurves: (EdgeCurve | null)[] = [null, null];
  // The top, right to left: valley, crest, valley … — each edge an S with level tangents at both ends.
  const steps = 2 * n;
  for (let k = 0; k <= steps; k++) {
    outline.push({ x: w / 2 - (w * k) / steps, y: k % 2 ? top : valley });
    const dx = -w / steps;
    edgeCurves.push(k < steps ? { c1: { x: dx / 2, y: 0 }, c2: { x: -dx / 2, y: 0 } } : null);
  }
  return { outline, edgeCurves };
}

/** How far a wave's valleys dip below its crests, as a share of its height. */
export const WAVE_DIP = 0.35;

/** A PETAL — picture 2's pleated panel: a flat foot narrower than the petal, round shoulders at its
 *  widest, and a pointed tip on top in the middle. */
export function petalOutline(widthMm: number, heightMm: number): { outline: Point[]; edgeCurves: (EdgeCurve | null)[] } {
  const w = Math.max(10, widthMm);
  const h = Math.max(10, heightMm);
  const foot = 0.3 * w;
  const shoulderY = h / 2 - 0.4 * h;
  const outline: Point[] = [
    { x: -foot, y: h / 2 },
    { x: foot, y: h / 2 },
    { x: w / 2, y: shoulderY },
    { x: 0, y: -h / 2 },
    { x: -w / 2, y: shoulderY },
  ];
  const k = 0.3 * h;
  const edgeCurves: (EdgeCurve | null)[] = [
    null,
    // Out from the foot to the shoulder, arriving plumb (the shoulder is the widest point).
    { c1: { x: 0.12 * w, y: -0.05 * h }, c2: { x: 0, y: k * 0.5 } },
    // Up from the shoulder, leaving plumb, to the tip.
    { c1: { x: 0, y: -k }, c2: { x: 0.12 * w, y: 0.25 * h } },
    { c1: { x: -0.12 * w, y: 0.25 * h }, c2: { x: 0, y: -k } },
    { c1: { x: 0, y: k * 0.5 }, c2: { x: -0.12 * w, y: -0.05 * h } },
  ];
  return { outline, edgeCurves };
}
