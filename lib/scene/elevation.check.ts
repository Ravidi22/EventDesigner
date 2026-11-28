// npm run check:elevation — the self-check of ./elevation.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/studio/hall";
import type { Product } from "@/lib/catalog/types";
import type { DesignDocumentContent, Placement } from "@/lib/design-document/types";
import { rectOutline } from "@/lib/design-document/stage";
import { primeCatalog } from "@/lib/catalog/storage";
import { elevationOf, RUG_MM } from "./elevation";

// ponytail: self-check. Run: npm run check:elevation
const assert = (ok: boolean, msg: string) => {
  if (!ok) {
    console.error("FAIL", msg);
    process.exit(1);
  }
};
const podium: Product = { id: "podium", name: "פודיום עגול", category: "other", layer: "floor", dimensions: { diameterMm: 1500, heightMm: 300 }, categoryFields: {}, styleTags: [], variants: [] };
const rug: Product = { id: "rug", name: "שטיח", category: "rugs", layer: "floor", dimensions: { widthMm: 3000, depthMm: 2000, heightMm: 10 }, categoryFields: {}, styleTags: [], variants: [] };
const partition: Product = { id: "wall", name: "מחיצה", category: "other", layer: "floor", dimensions: { widthMm: 3000, depthMm: 100, heightMm: 2400 }, categoryFields: {}, styleTags: [], variants: [] };
primeCatalog([podium, rug, partition]);
const floor = (id: string, variantId: string, x: number, y: number): Placement => ({ id, variantId, layer: "floor", quantity: 1, position: { x, y }, rotation: 0, scale: 1 });
const stage: Placement = { ...floor("s", "", 0, 0), stage: { outline: rectOutline(6000, 4000), front: 0, heightMm: 500, decks: [] } };
const doc: DesignDocumentContent = {
  calibration: { mmPerUnit: 1 },
  tables: [],
  placements: [stage, floor("pod", "podium", 1500, 0), floor("rug", "rug", -1500, 0), floor("part", "wall", 0, 5000)],
};
const terrace = { id: "terrace", kind: "structure", label: "", x: 20000, y: 0, widthMm: 4000, depthMm: 4000, heightMm: 1000, shape: "rect", rotationDeg: 0 } as const;
const el = elevationOf(doc, { nodes: [], walls: [], entrances: [], features: [terrace, { ...terrace, id: "tower", x: 30000, heightMm: 6000 }] });
const square = (x: number, y: number, s = 400): Point[][] => [[{ x: x - s / 2, y: y - s / 2 }, { x: x + s / 2, y: y - s / 2 }, { x: x + s / 2, y: y + s / 2 }, { x: x - s / 2, y: y + s / 2 }]];
assert(el.floorUnder(square(0, 1000)) === 500, "a thing on a stage stands on its deck");
assert(el.floorUnder(square(0, 3000)) === 0, "…and off it, on the floor");
assert(el.floorUnder(square(1500, 0)) === 800, "a thing on a podium on a stage stands on the podium's top: deck + podium");
assert(el.floorUnder(square(1500, 0, 1500), "pod") === 500, "…and the podium itself stands on the deck, never on its own top");
assert(el.floorUnder(square(-1500, 0)) === 500 + RUG_MM, "a rug on a stage adds its thickness");
assert(el.floorUnder(square(-2950, 1500, 400)) === 500, "more than half on the deck: on it");
assert(el.floorUnder(square(-3100, 1500, 400)) === 0, "a quarter on the deck: on the floor");
assert(el.floorUnder(square(20000, 0)) === 1000 && el.floorUnder(square(30000, 0)) === 0, "a low built terrace is a floor; a tall building is not stood on");
assert(el.floorUnder(square(0, 5000)) === 0, "a tall partition is not a platform");
// A carpet laid to an OUTLINE (lib/studio/cover.ts) — an L over the stage, its notch bare: read by
// the outline, not by its box.
const ell: Placement = {
  ...floor("ell", "rug", 0, 0),
  sizeMm: { widthMm: 6000, depthMm: 4000 },
  outline: [{ x: -3000, y: -2000 }, { x: 3000, y: -2000 }, { x: 3000, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 2000 }, { x: -3000, y: 2000 }],
};
const onEll = elevationOf({ ...doc, placements: [stage, ell] }, { nodes: [], walls: [], entrances: [], features: [] });
assert(onEll.floorUnder(square(-1500, 1000)) === 500 + RUG_MM && onEll.floorUnder(square(1500, 1000)) === 500, "on an outline carpet a thing stands a rug higher; in its notch, on the bare deck");
console.log("scene elevation ok");
