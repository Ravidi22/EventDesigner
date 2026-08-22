// Pure appearance resolver (no window/localStorage) — shared by the Konva map renderer
// and the drawer preview. Absence of `appearance` is derived from `dimensions` so every
// legacy/seed product keeps rendering (name-in-a-shape = today's behavior).
import type { Product } from "@/lib/catalog/types";
import type { Point } from "@/lib/design-document/types";
import type { EdgeCurve } from "@/lib/studio/hall";
import { outlineBounds } from "@/lib/studio/geometry";
import { isMain } from "../self-check";

export const MIN_FOOTPRINT_MM = 600; // floor so missing/zero dims never render at zero size

export type Footprint =
  | { kind: "rect"; widthMm: number; depthMm: number }
  | { kind: "circle"; diameterMm: number }
  | { kind: "ellipse"; widthMm: number; depthMm: number }
  | { kind: "custom"; outline: Point[]; edgeCurves?: (EdgeCurve | null)[] };

export interface ResolvedContent {
  mode: "icon" | "name" | "none";
  icon?: string;
  name: string;
}

export function resolveFootprint(product: Product): Footprint {
  const d = product.dimensions;
  const shape = product.appearance?.shape ?? (d.diameterMm ? "circle" : "rect");
  if (shape === "custom") {
    const outline = product.appearance?.outline;
    const edgeCurves = product.appearance?.edgeCurves;
    if (outline && outline.length >= 3) return { kind: "custom", outline, ...(edgeCurves ? { edgeCurves } : {}) };
    // malformed custom → fall through to a safe rectangle
  }
  if (shape === "circle") return { kind: "circle", diameterMm: d.diameterMm || d.widthMm || d.depthMm || MIN_FOOTPRINT_MM };
  const widthMm = d.widthMm || MIN_FOOTPRINT_MM;
  const depthMm = d.depthMm || MIN_FOOTPRINT_MM;
  return { kind: shape === "ellipse" ? "ellipse" : "rect", widthMm, depthMm };
}

export function resolveContent(product: Product): ResolvedContent {
  const a = product.appearance;
  let mode: ResolvedContent["mode"] = a?.content ?? "name";
  if (mode === "icon" && !a?.icon) mode = "name"; // never render blank
  return { mode, icon: a?.icon, name: product.name };
}

// Bounds of a catalog item's custom shape, in the item's own local space. The min/max itself is
// geometry.outlineBounds — this only adds the centre point the shape editor and previews recentre
// on, and keeps the short w/h names those call sites read. Named for the catalog shape rather than
// "outline" so it can't be confused with the canonical one in ./geometry.
export function customShapeBounds(outline: Point[]) {
  const { minX, maxX, minY, maxY, widthMm, heightMm } = outlineBounds(outline);
  return { minX, maxX, minY, maxY, w: widthMm, h: heightMm, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function footprintBounds(f: Footprint): { w: number; h: number } {
  switch (f.kind) {
    case "circle": return { w: f.diameterMm, h: f.diameterMm };
    case "rect":
    case "ellipse": return { w: f.widthMm, h: f.depthMm };
    case "custom": { const b = customShapeBounds(f.outline); return { w: b.w, h: b.h }; }
  }
}

// ponytail: self-check. Run: node --experimental-strip-types lib/studio/footprint.ts
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error("FAIL: " + m); };
  const base: Product = {
    id: "x", name: "בדיקה", category: "chairs", layer: "floor",
    dimensions: { heightMm: 900 }, categoryFields: {}, styleTags: [], variants: [],
  };
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  assert(eq(resolveFootprint({ ...base, dimensions: { diameterMm: 1800, heightMm: 750 } }), { kind: "circle", diameterMm: 1800 }), "diameter derives circle");
  assert(eq(resolveFootprint({ ...base, dimensions: { widthMm: 420, depthMm: 450, heightMm: 920 } }), { kind: "rect", widthMm: 420, depthMm: 450 }), "w/d derives rect");
  assert(eq(resolveFootprint(base), { kind: "rect", widthMm: 600, depthMm: 600 }), "missing dims → floor default");
  assert(eq(resolveFootprint({ ...base, dimensions: { widthMm: 800, depthMm: 400, heightMm: 100 }, appearance: { shape: "ellipse", content: "none" } }), { kind: "ellipse", widthMm: 800, depthMm: 400 }), "explicit ellipse");
  assert(eq(resolveFootprint({ ...base, dimensions: { widthMm: 120, depthMm: 120, heightMm: 350 }, appearance: { shape: "circle", content: "none" } }), { kind: "circle", diameterMm: 120 }), "circle falls back to width when no diameter");
  const outline = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }];
  assert(eq(resolveFootprint({ ...base, appearance: { shape: "custom", outline, content: "none" } }), { kind: "custom", outline }), "valid custom");
  assert(eq(resolveFootprint({ ...base, dimensions: { widthMm: 200, depthMm: 200, heightMm: 1 }, appearance: { shape: "custom", outline: [{ x: 0, y: 0 }], content: "none" } }), { kind: "rect", widthMm: 200, depthMm: 200 }), "malformed custom → rect fallback");

  assert(resolveContent(base).mode === "name", "content defaults to name");
  assert(resolveContent({ ...base, appearance: { shape: "rect", content: "icon" } }).mode === "name", "icon without icon → name");
  assert(eq(resolveContent({ ...base, appearance: { shape: "rect", content: "icon", icon: "wine" } }), { mode: "icon", icon: "wine", name: "בדיקה" }), "icon with icon");

  assert(eq(footprintBounds({ kind: "circle", diameterMm: 800 }), { w: 800, h: 800 }), "circle bounds");
  assert(eq(footprintBounds({ kind: "custom", outline }), { w: 100, h: 100 }), "custom bounds");
  console.log("footprint self-check passed");
}
