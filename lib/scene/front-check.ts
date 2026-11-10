// THE FRONT SHAPE IN THE ROOM — a front shape's panel stands on the band the plan draws (docs/
// superpowers/specs/2026-11-09-backdrops-front-drawing-and-text-design.md §2, S2).
//
// Pure. Run: npm run check:scene-front
import type { Product, ShapePart } from "@/lib/catalog/types";
import { sizedFootprint } from "@/lib/studio/footprint";
import { panelPoint } from "@/lib/element/front";
import { symbolOf } from "@/lib/catalog/symbols";
import { isMain } from "../self-check";
import { elementBody, elementOf, ownBodyParts } from "./element-body";
import type { MaterialRef, Part } from "./types";

type Panel = Extract<Part, { shape: "panel" }>;

if (isMain(import.meta.url)) {
  const assert = (ok: boolean, what: string) => {
    if (!ok) throw new Error("FAIL: " + what);
    console.log(`  ok   ${what}`);
  };
  const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
  const body: MaterialRef = { colour: "#ffffff", kind: "matte" };
  const row = (over: Partial<Product>): Product =>
    ({ id: "w", name: "קיר", category: "other", layer: "floor", dimensions: { widthMm: 4000, depthMm: 30, heightMm: 2600 }, categoryFields: {}, styleTags: [], variants: [], unitPrice: 999, ...over }) as Product;
  const panels = (p: Product) => elementBody(p, sizedFootprint(p), body)!.parts.filter((q): q is Panel => q.shape === "panel");

  // A backdrop row: its first shape a panel 4 × 2.6 m, 3 cm thick.
  const wall = row({ appearance: { shape: "rect", content: "none", plane: "front" } });
  assert(elementOf(wall, sizedFootprint(wall)) !== null, "the room and the plan agree on a front row's footprint");
  const built = elementBody(wall, sizedFootprint(wall), body)!;
  assert(built.parts.length === 1 && built.parts[0].shape === "panel", "a backdrop row is one panel");
  const wp = built.parts[0] as Panel;
  assert(wp.at.z === 0 && near(wp.at.x, 0) && near(wp.at.y, 0) && wp.widthMm === 4000 && wp.faceHeightMm === 2600 && wp.thicknessMm === 30, "…on the floor at its middle, 4000 × 2600, 30 thick");

  // Picture 5: three wave layers at three depths, the front ones lower and raised off the floor.
  const layer = (id: string, y: number, w: number, h: number, z: number): ShapePart => ({ id, plane: "front", shape: "rect", widthMm: w, depthMm: h, thicknessMm: 30, x: 0, y, rotation: 0, zMm: z });
  const layered = row({ appearance: { shape: "rect", content: "none", plane: "front", parts: [layer("b", 300, 3600, 2000, 100), layer("c", 600, 3200, 1600, 200)] } });
  const lp = panels(layered);
  assert(lp.length === 3, "three layers are three panels");
  assert(near(lp[1].at.y - lp[0].at.y, 300) && near(lp[2].at.y - lp[0].at.y, 600), "…at their depths");
  assert(lp[1].at.z === 100 && lp[2].at.z === 200 && lp[2].faceHeightMm === 1600, "…at their heights");

  // Bent and turned: the panel's face end stands on a corner of its plan band.
  const turned = row({ appearance: { shape: "rect", content: "none", plane: "front", parts: [{ ...layer("t", -800, 2400, 1800, 0), bendDeg: 120, rotation: 30 }] } });
  const el = elementOf(turned, sizedFootprint(turned))!;
  const piece = el.geometry.parts[1].pieces[0];
  const tp = panels(turned)[1];
  assert(tp.bendDeg === 120 && tp.rotDeg === 30, "a bent, turned part keeps its bend and its turn");
  const rad = (30 * Math.PI) / 180;
  const end = panelPoint(1200, 15, 2400, 30, 120);
  const world = { x: tp.at.x + end.x * Math.cos(rad) - end.y * Math.sin(rad), y: tp.at.y + end.x * Math.sin(rad) + end.y * Math.cos(rad) };
  assert(piece.outline.some((v) => near(v.x, world.x) && near(v.y, world.y)), `…its face end is a corner of the plan band (${world.x.toFixed(1)}, ${world.y.toFixed(1)})`);

  // A plan row with a front panel added (a bar's back panel): the panel is the element model's, the
  // counter is left for the recipe.
  const bar = row({ dimensions: { widthMm: 3000, depthMm: 600, heightMm: 1100 }, appearance: { shape: "rect", content: "none", parts: [layer("p", -500, 3000, 900, 1100)] } });
  const split = ownBodyParts(bar, sizedFootprint(bar), body)!;
  assert(split !== null && split.parts.length === 1 && split.parts[0].shape === "panel" && split.parts[0].at.z === 1100, "a bar's front panel is the model's, at 1.1 m");
  assert(split.rest.kind === "multi" && split.rest.parts.length === 1, "…the counter the recipe's");

  // Arches, gates and chuppahs drawn from the front stand AS DRAWN: their category's picture gives
  // way, on the plan and in the room (FRONT_REPLACES_PICTURE).
  const chuppahFront = row({ category: "chuppahs", dimensions: { widthMm: 3000, depthMm: 40, heightMm: 2600 }, appearance: { shape: "rect", content: "none", plane: "front" } });
  assert(symbolOf(chuppahFront, sizedFootprint(chuppahFront)) === null, "a chuppah drawn from the front is not the chuppah picture");
  const archFront = row({ category: "arches", dimensions: { diameterMm: 2400, depthMm: 40, heightMm: 1200 }, appearance: { shape: "half-circle", content: "none", plane: "front" } });
  assert(symbolOf(archFront, sizedFootprint(archFront)) === null && panels(archFront).length === 1, "an arch drawn from the front is one panel, no picture");
  const chuppahPlan = row({ category: "chuppahs", dimensions: { widthMm: 3000, depthMm: 3000, heightMm: 2600 }, appearance: { shape: "rect", content: "none" } });
  assert(symbolOf(chuppahPlan, sizedFootprint(chuppahPlan)) === "chuppah", "…a chuppah drawn on the plan keeps its picture");
  const barPanel = row({ category: "bars", dimensions: { widthMm: 3000, depthMm: 600, heightMm: 1100 }, appearance: { shape: "rect", content: "none", parts: [layer("p", -500, 3000, 900, 1100)] } });
  assert(symbolOf(barPanel, sizedFootprint(barPanel)) === "bar", "a bar with a front panel keeps its bar picture (the panel is added)");

  // No price reaches the room.
  const text = JSON.stringify([built, lp, split]);
  assert(!text.includes("999"), "no price reaches the room");
  console.log("scene front self-check passed");
}
