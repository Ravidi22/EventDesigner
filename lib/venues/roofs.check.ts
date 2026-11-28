// npm run check:roofs — the self-check of ./roofs.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { Point } from "@/lib/studio/hall";
import type { Placement } from "@/lib/design-document/types";
import type { Product } from "@/lib/catalog/types";
import type { StructureFeature } from "./structure";
import { roofAt, roofHeightAt, sketchPergolas, type RoofZone } from "./roofs";

// ponytail: self-check. Run: npm run check:roofs
const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
// A roofed hall (0..10 m), an open terrace (10..30 m) with a 4 × 4 pergola at 15 m and an office
// block (a face-filling structure) at 25 m; a hired pergola in the sketch at 20 m; a dais inside the
// hall zoned at 3 m.
const zones: RoofZone[] = [
  { boundary: rect(0, 0, 10000, 10000), zone: { id: "hall", ceilingHeightMm: 4000 } },
  { boundary: rect(2000, 2000, 4000, 4000), zone: { id: "dais", ceilingHeightMm: 3000 } },
  { boundary: rect(10000, 0, 30000, 10000), zone: { id: "terrace", ceilingHeightMm: 0 } },
];
const feature = (f: Partial<StructureFeature> & Pick<StructureFeature, "id" | "kind" | "x" | "y">): StructureFeature => ({
  label: "",
  widthMm: 4000,
  depthMm: 4000,
  heightMm: 2600,
  shape: "rect",
  rotationDeg: 0,
  ...f,
});
const structure = {
  features: [
    feature({ id: "perg", kind: "pergola", x: 15000, y: 5000 }),
    feature({ id: "office", kind: "structure", x: 25000, y: 5000, heightMm: 3500, fillsFace: true, shape: "custom", outline: rect(-2000, -2000, 2000, 2000) }),
    feature({ id: "kiosk", kind: "structure", x: 12000, y: 9000, widthMm: 1000, depthMm: 1000, heightMm: 2500 }),
  ],
};
const product: Product = {
  id: "pg",
  name: "פרגולה 4×4",
  category: "pergolas",
  layer: "floor",
  dimensions: { widthMm: 4000, depthMm: 4000, heightMm: 2800 },
  categoryFields: {},
  styleTags: [],
  variants: [],
};
const hired: Placement = { id: "hp", variantId: "pg", layer: "floor", quantity: 1, position: { x: 20000, y: 5000 }, rotation: 45, scale: 1, sizeMm: { widthMm: 6000, depthMm: 3000 } };
const covers = sketchPergolas([hired, { ...hired, id: "ontable", tableId: "t" }], (id) => (id === "pg" ? product : undefined));
assert(covers.length === 1 && covers[0].heightMm === 2800, "a hired pergola on the floor is a cover at its row's height; nothing on a table is");

const at = (x: number, y: number) => roofAt({ x, y }, structure, zones, covers);
assert(at(5000, 8000)?.kind === "zone" && at(5000, 8000)?.heightMm === 4000, "in the roofed hall: its 4 m ceiling");
assert(at(3000, 3000)?.heightMm === 3000 && at(3000, 3000)?.id === "dais", "…and in a smaller roofed zone inside it, that one's");
assert(at(15000, 5000)?.kind === "pergola" && at(15000, 5000)?.id === "perg" && at(15000, 5000)?.heightMm === 2600, "on the open terrace under the venue's pergola: its top");
assert(at(25000, 5000)?.kind === "building" && at(25000, 5000)?.heightMm === 3500, "in the office block: its roof");
assert(at(20000, 5000)?.kind === "pergola" && at(20000, 5000)?.id === "hp", "under the sketch's hired pergola: its");
// The hired one is 6 m long, turned 45°: its far corner is out along the diagonal, not the box.
assert(at(20000 + 2000, 5000 + 2000)?.id === "hp" && at(20000 + 3000, 5000 - 3000) === null, "…by its turned outline, not its box");
assert(at(12000, 9000) === null, "a kiosk is no roof: only a face-filling building is");
assert(at(18000, 1000) === null, "out on the terrace: open sky");
assert(roofAt({ x: 15000, y: 5000 }, structure, [{ boundary: rect(10000, 0, 30000, 10000), zone: { id: "t", ceilingHeightMm: 5000 } }])?.kind === "zone", "a roofed zone wins over a pergola in it");
assert(roofHeightAt(structure, zones, covers)({ x: 15000, y: 5000 }) === 2600 && roofHeightAt(structure, zones)({ x: 18000, y: 1000 }) === null, "the rail hook reads the height, null under the sky");

console.log("roofs: ok");
