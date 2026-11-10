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
import { FRONT_THICK_MM, type Product, type ShapePart } from "@/lib/catalog/types";
import { frontBand, frontFace, footprintBounds, placedPartOutline, placedPartOutlines, resolveFootprint, rowShapeDims, sampledBounds } from "@/lib/studio/footprint";
import { isMain } from "../self-check";

/** A shape drawn on the front plane. */
export const isFront = (s: { plane?: string } | undefined): boolean => s?.plane === "front";

/** Whether any shape of the row — its base or an added one — is drawn on the front plane. */
export function hasFront(product: Product): boolean {
  const a = product.appearance;
  if (!a) return false;
  return isFront(a) || (a.parts ?? []).some(isFront);
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
    console.log("front self-check passed");
  }
}
