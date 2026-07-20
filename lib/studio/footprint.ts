// Pure appearance resolver (no window/localStorage) — shared by the Konva map renderer
// and the drawer preview. Absence of `appearance` is derived from `dimensions` so every
// legacy/seed product keeps rendering (name-in-a-shape = today's behavior).
import type { Product } from "@/lib/catalog/types";
import type { Point } from "@/lib/design-document/types";

export const MIN_FOOTPRINT_MM = 600; // floor so missing/zero dims never render at zero size

export type Footprint =
  | { kind: "rect"; widthMm: number; depthMm: number }
  | { kind: "circle"; diameterMm: number }
  | { kind: "ellipse"; widthMm: number; depthMm: number }
  | { kind: "custom"; outline: Point[] };

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
    if (outline && outline.length >= 3) return { kind: "custom", outline };
    // malformed custom → fall through to a safe rectangle
  }
  if (shape === "circle") return { kind: "circle", diameterMm: d.diameterMm || MIN_FOOTPRINT_MM };
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

export function outlineBounds(outline: Point[]) {
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function footprintBounds(f: Footprint): { w: number; h: number } {
  switch (f.kind) {
    case "circle": return { w: f.diameterMm, h: f.diameterMm };
    case "rect":
    case "ellipse": return { w: f.widthMm, h: f.depthMm };
    case "custom": { const b = outlineBounds(f.outline); return { w: b.w, h: b.h }; }
  }
}

// ponytail: self-check. Run: node --experimental-strip-types lib/studio/footprint.ts
if ((import.meta as { main?: boolean }).main) {
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
