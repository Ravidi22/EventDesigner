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
import { FRONT_BEND_MAX_DEG, FRONT_THICK_MM, type Product, type ShapePart } from "@/lib/catalog/types";
import { frontBand, frontBandOffset, frontFace, footprintBounds, placedPartOutline, placedPartOutlines, resolveFootprint, rowShapeDims, sampledBounds } from "@/lib/studio/footprint";
import type { EdgeCurve, Point } from "@/lib/studio/hall";
import { isMain } from "../self-check";

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

if (isMain(import.meta.url)) {
  const assert = (ok: boolean, what: string) => {
    if (!ok) throw new Error("FAIL: " + what);
    console.log(`  ok   ${what}`);
  };
  {
    const near = (a: number, b: number, tol = 0.6) => Math.abs(a - b) <= tol;

    // A flat panel 300 wide, 2 thick, standing at (100, -400): its band is 3000 × 20 centred there.
    const panel: ShapePart = { id: "p", plane: "front", shape: "rect", widthMm: 3000, depthMm: 2400, thicknessMm: 20, x: 100, y: -400, rotation: 0 };
    const pb = sampledBounds(placedPartOutlines(panel));
    assert(near(pb.w, 3000) && near(pb.h, 20) && near(pb.cx, 100) && near(pb.cy, -400), `a flat panel's plan band is width × thickness at its place (${pb.w}×${pb.h} at ${pb.cx},${pb.cy})`);
    assert(JSON.stringify(placedPartOutline(panel).face) === "[2]", "…its face is the +y side");
    // No thickness → FRONT_THICK_MM.
    assert(near(sampledBounds(placedPartOutlines({ ...panel, thicknessMm: undefined })).h, FRONT_THICK_MM), "a panel with no thickness is 2 cm");
    // The face is not the plan: a half-circle arch 2400 across (diameter) is a 2400 band.
    const arch: ShapePart = { id: "a", plane: "front", shape: "half-circle", diameterMm: 2400, x: 0, y: 0, rotation: 0 };
    assert(near(sampledBounds(placedPartOutlines(arch)).w, 2400), "an arch's band is its face's width");
    const ff = frontFace("half-circle", { diameterMm: 2400 });
    assert(near(ff.w, 2400) && near(ff.h, 1200), `the arch's face is 2400 × 1200 (${ff.w}×${ff.h})`);
    assert(Math.min(...ff.pieces[0].outline.map((v) => v.y)) < -500, "…its apex is UP (negative y in the face frame)");
    // Turned in its face 90°: the band is the face's height wide.
    assert(near(frontFace("rect", { widthMm: 3000, depthMm: 1000, faceTurnDeg: 90 }).w, 1000), "a face turned 90° is its height across");
    // A hollow face (a frame) is still a solid band on the plan.
    assert(placedPartOutlines({ ...panel, hollow: { bandMm: 100 } }).length === 1, "a frame is one band on the plan");
    assert(frontFace("rect", { widthMm: 3000, depthMm: 2000, hollow: { bandMm: 100 } }).pieces.length >= 1, "…and a frame on its face");
    // Bent 180° concave toward the front: the mid-line stays 3000 long; the ends come forward.
    const bent = placedPartOutline({ ...panel, x: 0, y: 0, bendDeg: 180 });
    const bb = sampledBounds([bent]);
    assert(near(bb.w, (2 * 3000) / Math.PI + 20, 2) && near(bb.h, 3000 / Math.PI + 10, 2), `a half-cylinder's box is its diameter by its radius (${bb.w}×${bb.h})`);
    assert(!!bent.face && bent.face.length >= 2 && bent.face.every((i) => i < bent.outline.length), "…its face is the inner arc's segments");
    const faceYs = bent.face!.flatMap((i) => [bent.outline[i].y, bent.outline[(i + 1) % bent.outline.length].y]);
    const backYs = bent.outline.filter((_, i) => !bent.face!.includes(i) && !bent.face!.includes((i - 1 + bent.outline.length) % bent.outline.length)).map((v) => v.y);
    assert(Math.min(...faceYs) > Math.min(...backYs), "…the face arc stands in front of the back arc at the middle");
    // Bent the other way: convex toward the front, the middle is the front-most point.
    const convex = sampledBounds([placedPartOutline({ ...panel, x: 0, y: 0, bendDeg: -90 })]);
    assert(near(convex.w, sampledBounds([placedPartOutline({ ...panel, x: 0, y: 0, bendDeg: 90 })]).w, 0.01), "a − bend is the + bend mirrored");
    // Extremes stay finite and closed.
    for (const [w, t, b] of [[100, 20, 300], [3000, 5000, 300], [3000, 20, -300], [10, 1, 1], [3000, 20, 400]] as const) {
      const o = frontBand(w, t, b);
      assert(o.outline.length >= 4 && o.outline.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y)), `band ${w}/${t}/${b}° is finite`);
    }
    // A row whose BASE is front: resolveFootprint is its band; depth is the thickness.
    const row = {
      id: "r",
      name: "קיר",
      category: "other",
      layer: "floor",
      dimensions: { widthMm: 4000, depthMm: 30, heightMm: 2600 },
      categoryFields: {},
      styleTags: [],
      variants: [],
      appearance: { shape: "rect", content: "none", plane: "front" },
    } as Product;
    const rb = footprintBounds(resolveFootprint(row));
    assert(near(rb.w, 4000) && near(rb.h, 30), `a front base row stands on a 4000 × 30 band (${rb.w}×${rb.h})`);
    const rd = rowShapeDims(row).dims;
    assert(rd.depthMm === 2600 && rd.thicknessMm === 30 && rd.plane === "front", "…read as a 2600-high face, 30 thick");
    // A plain row is read exactly as before.
    const plainRow = { ...row, appearance: { shape: "rect", content: "none" } } as Product;
    assert(JSON.stringify(resolveFootprint(plainRow)) === JSON.stringify({ kind: "rect", widthMm: 4000, depthMm: 30 }), "a plan row is untouched");
    assert(hasFront(row) && !hasFront(plainRow) && hasFront({ ...plainRow, appearance: { shape: "rect", content: "none", parts: [panel] } } as Product), "hasFront: the base or a part");
    // ── The room: a panel's points, its cuts, a slab ────────────────────────────────────────────
    const W = 3000;
    assert(near(panelPoint(0, 0, W, 20, 0).x, 0) && near(panelPoint(W / 2, 10, W, 20, 0).y, 10), "flat: u across, w toward the face");
    const mid = panelPoint(0, 0, W, 20, 180);
    const end = panelPoint(W / 2, 0, W, 20, 180);
    assert(end.y > mid.y + 900, "bent + : the ends come toward the front");
    const band = sampledBounds([frontBand(W, 20, 180)]);
    assert(near(Math.abs(end.x) + 10, band.w / 2, 2), `…the bend reaches the band's sides (${end.x} vs ${band.w / 2})`);
    // Every face point of the bent panel lies on its band: the back middle, the face ends.
    const bandPts = frontBand(W, 20, 180).outline;
    const backMid = panelPoint(0, -10, W, 20, 180);
    assert(bandPts.some((v) => near(v.x, backMid.x, 1) && near(v.y, backMid.y, 1)) || near(backMid.y, band.minY, 1), `the back's middle is the band's back (${backMid.y} vs ${band.minY})`);
    const faceEnd = panelPoint(W / 2, 10, W, 20, 180);
    assert(bandPts.some((v) => near(v.x, faceEnd.x, 1) && near(v.y, faceEnd.y, 1)), "the face's end is a corner of the band");
    const convexFace = panelPoint(0, 10, W, 20, -90);
    assert(near(convexFace.y, sampledBounds([frontBand(W, 20, -90)]).maxY, 1), "a − bend's face middle is the band's front-most point");
    assert(bendCuts(W, 0).length === 2 && bendCuts(W, 180).length >= 19, "a cut every 10° of sweep");
    const sq = [{ x: -10, y: -5 }, { x: 10, y: -5 }, { x: 10, y: 5 }, { x: -10, y: 5 }];
    const half = clipSlab(sq, 0, 20);
    assert(near(Math.max(...half.map((p) => p.x)) - Math.min(...half.map((p) => p.x)), 10), "a slab clip keeps x ∈ [a, b]");
    assert(clipSlab(sq, 30, 40).length === 0, "…and nothing outside it");
    assert([300, -300, 1].every((b) => Number.isFinite(panelPoint(W / 2, -10, 100, 5000, b).x) && Number.isFinite(panelPoint(W / 2, -10, 100, 5000, b).y)), "extreme bends are finite");
    // ── The presets ──────────────────────────────────────────────────────────────────────────────
    const wave = waveOutline(3000, 1200, 3);
    const wb = sampledBounds([wave]);
    assert(wb.w === 3000 && near(wb.h, 1200, 1), `a wave fills its box (${wb.w}×${wb.h})`);
    assert(wave.outline.filter((v) => near(v.y, -600, 0.01)).length === 3, "…three crests on top");
    assert(near(Math.max(...wave.outline.map((v) => v.y)), 600, 0.01), "…a flat foot");
    const petal = petalOutline(1600, 2400);
    const peb = sampledBounds([petal]);
    assert(near(peb.w, 1600, 2) && near(peb.h, 2400, 2), `a petal fills its box (${peb.w}×${peb.h})`);
    assert(petal.outline.some((v) => near(v.x, 0, 0.01) && near(v.y, -1200, 0.01)), "…its tip on top in the middle");
    console.log("front self-check passed");
  }
}
