// Pure appearance resolver (no window/localStorage) — shared by the Konva map renderer
// and the drawer preview. Absence of `appearance` is derived from `dimensions` so every
// legacy/seed product keeps rendering (name-in-a-shape = today's behavior).
import type { MapShape, Product } from "@/lib/catalog/types";
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

// ── The derived shapes ─────────────────────────────────────────────────────────────────────────
//
// A shape that is not one of the three SVG primitives and not a hand-drawn outline is BUILT here,
// out of the item's own width and depth. Nothing about it is stored: `{ shape: "hexagon" }` plus
// two measurements is the whole record, which is what lets the catalog grow a shape vocabulary
// without growing a column, and what makes resizing a חצי עיגול an edit to a number rather than a
// return trip to the outline editor.
//
// TWO RULES, and both are load-bearing:
//
//   1. THE BOUNDING BOX IS width × depth, exactly. The drawer asks for those two numbers and draws
//      the result at true scale; a shape that quietly measured something else would be the original
//      bug in a new costume (see MapShape in lib/catalog/types.ts).
//
//   2. EVERY EXTREME IS A VERTEX. Bounds are read off the points (customShapeBounds → outlineBounds)
//      and no bezier is consulted, so an apex that lives only inside a curve is an apex nothing
//      downstream can see — the preview would scale wrong and the seating would walk a table shorter
//      than it looks. That is why the arcs below are cut into quarters at their apex rather than
//      drawn as one long bow.
//
// K is the standard cubic approximation of a quarter arc (0.5523 × radius) — the constant every
// circle-to-path conversion uses. Control points are offsets from their own edge's endpoints
// (absoluteControlPoints, ./geometry), which is what lets the same numbers survive recentring.
const K = 0.5523;

export interface BuiltOutline {
  outline: Point[];
  edgeCurves?: (EdgeCurve | null)[];
}

/** The outline of a derived shape, centred on (0,0) and measuring exactly `w` × `d`.
 *  Null for the shapes that are not derived: the three primitives and the designer's own "custom". */
export function buildShapeOutline(shape: MapShape, w: number, d: number): BuiltOutline | null {
  const hw = w / 2;
  const hh = d / 2;
  switch (shape) {
    // The chord along the bottom, the arc over the top in two quarters so the apex is a vertex.
    case "half-circle":
      return {
        outline: [
          { x: -hw, y: hh },
          { x: hw, y: hh },
          { x: 0, y: -hh },
        ],
        edgeCurves: [
          null, // the chord is the diameter — straight
          { c1: { x: 0, y: -K * d }, c2: { x: K * hw, y: 0 } },
          { c1: { x: -K * hw, y: 0 }, c2: { x: 0, y: -K * d } },
        ],
      };

    // The corner piece: two straight radii meeting at the corner, and one arc between their ends.
    case "quarter-circle":
      return {
        outline: [
          { x: -hw, y: hh }, // the corner — the centre the arc is struck from
          { x: hw, y: hh },
          { x: -hw, y: -hh },
        ],
        edgeCurves: [null, { c1: { x: 0, y: -K * d }, c2: { x: K * w, y: 0 } }, null],
      };

    // A serpentine: an outer arc rising the full depth and an inner one rising half of it, meeting
    // at two tips. The band is d/2 across at its middle, which is the proportion a serpentine table
    // is actually built in.
    case "crescent": {
      const t = hh; // how far the inner arc rises
      return {
        outline: [
          { x: -hw, y: hh }, // start tip
          { x: 0, y: hh - t }, // inner apex
          { x: hw, y: hh }, // end tip
          { x: 0, y: -hh }, // outer apex
        ],
        edgeCurves: [
          { c1: { x: 0, y: -K * t }, c2: { x: -K * hw, y: 0 } },
          { c1: { x: K * hw, y: 0 }, c2: { x: 0, y: -K * t } },
          { c1: { x: 0, y: -K * d }, c2: { x: K * hw, y: 0 } },
          { c1: { x: -K * hw, y: 0 }, c2: { x: 0, y: -K * d } },
        ],
      };
    }

    case "triangle":
      return { outline: [{ x: -hw, y: hh }, { x: hw, y: hh }, { x: 0, y: -hh }] };

    // Top edge half the base — the proportion that lets a run of them bend a head table.
    case "trapezoid":
      return {
        outline: [
          { x: -hw, y: hh },
          { x: hw, y: hh },
          { x: hw / 2, y: -hh },
          { x: -hw / 2, y: -hh },
        ],
      };

    case "hexagon":
      return {
        outline: [
          { x: -hw, y: 0 },
          { x: -hw / 2, y: hh },
          { x: hw / 2, y: hh },
          { x: hw, y: 0 },
          { x: hw / 2, y: -hh },
          { x: -hw / 2, y: -hh },
        ],
      };

    // 0.2071 = (1 − 1/(1+√2))/2, the corner cut that makes a REGULAR octagon out of a square.
    case "octagon": {
      const cx = w * 0.2071;
      const cy = d * 0.2071;
      return {
        outline: [
          { x: -hw, y: hh - cy },
          { x: -hw + cx, y: hh },
          { x: hw - cx, y: hh },
          { x: hw, y: hh - cy },
          { x: hw, y: -hh + cy },
          { x: hw - cx, y: -hh },
          { x: -hw + cx, y: -hh },
          { x: -hw, y: -hh + cy },
        ],
      };
    }

    // A ח: three sides of a rectangle with the fourth left open — how a bar counter is actually
    // built, and how a long run of tables is laid around a dance floor. Eight corners, all straight,
    // and every extreme is one of them: the outer box is the full w × d and both legs reach the open
    // edge, so rule 1 holds with no curve anywhere to hide an apex inside.
    //
    // The counter is a third of the SHORTER side. A share of the depth alone would read right on a
    // wide bar and then swallow its own opening on a ח deeper than it is wide, which is the one way
    // a derived shape can stop being the shape it is named after.
    case "u-shape": {
      const t = Math.min(w, d) / 3;
      return {
        outline: [
          { x: -hw, y: -hh }, // the closed side, along the top
          { x: hw, y: -hh },
          { x: hw, y: hh }, // down the outside of one leg, to the open edge
          { x: hw - t, y: hh },
          { x: hw - t, y: -hh + t }, // back up its inside, and around the inner corner
          { x: -hw + t, y: -hh + t },
          { x: -hw + t, y: hh },
          { x: -hw, y: hh },
        ],
      };
    }

    default:
      return null; // rect / circle / ellipse are primitives, and "custom" is the designer's own
  }
}

/** A shape plus the measurements it is drawn from, resolved to the one footprint every surface in
 *  the app already knows how to draw.
 *
 *  Split out of resolveFootprint because a catalog product is no longer the only thing with a
 *  footprint: a venue's fixed features are placed FROM the catalog now (lib/venues/structure.ts), so
 *  a bar shaped like a ח has to be a ח on the hall plan too rather than the box its two numbers
 *  describe. One resolver, so the two cannot disagree about what a shape means. */
export function shapeFootprint(
  shape: MapShape,
  d: { widthMm?: number; depthMm?: number; diameterMm?: number; outline?: Point[]; edgeCurves?: (EdgeCurve | null)[] },
): Footprint {
  if (shape === "custom") {
    const { outline, edgeCurves } = d;
    if (outline && outline.length >= 3) return { kind: "custom", outline, ...(edgeCurves ? { edgeCurves } : {}) };
    // malformed custom → fall through to a safe rectangle
  }
  if (shape === "circle") return { kind: "circle", diameterMm: d.diameterMm || d.widthMm || d.depthMm || MIN_FOOTPRINT_MM };
  const widthMm = d.widthMm || MIN_FOOTPRINT_MM;
  const depthMm = d.depthMm || MIN_FOOTPRINT_MM;
  // A derived shape resolves to a custom footprint the app draws FOR the designer: the canvas, the
  // printed placement map, the drag image and the seating that walks a table's edges all already
  // know how to render an outline with bowed edges, so a new shape needs nothing new anywhere else.
  const built = buildShapeOutline(shape, widthMm, depthMm);
  if (built) return { kind: "custom", outline: built.outline, ...(built.edgeCurves ? { edgeCurves: built.edgeCurves } : {}) };
  return { kind: shape === "ellipse" ? "ellipse" : "rect", widthMm, depthMm };
}

export function resolveFootprint(product: Product): Footprint {
  const d = product.dimensions;
  const shape = product.appearance?.shape ?? (d.diameterMm ? "circle" : "rect");
  return shapeFootprint(shape, { ...d, outline: product.appearance?.outline, edgeCurves: product.appearance?.edgeCurves });
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

  // ── The derived shapes ───────────────────────────────────────────────────────────────────────
  // Rule 1 (the bounding box IS width × depth) and rule 2 (every extreme is a vertex, which is what
  // makes rule 1 measurable at all), for every shape in the vocabulary — at a size whose width and
  // depth differ, so a shape that quietly squared itself cannot pass.
  const derived: MapShape[] = ["half-circle", "quarter-circle", "crescent", "triangle", "trapezoid", "hexagon", "octagon", "u-shape"];
  for (const shape of derived) {
    const built = buildShapeOutline(shape, 1200, 600);
    if (!built) throw new Error(`FAIL: ${shape} is not built — it would fall back to a rectangle`);
    assert(built.outline.length >= 3, `${shape}: is a closed shape`);
    assert(
      built.edgeCurves === undefined || built.edgeCurves.length === built.outline.length,
      `${shape}: one curve slot per edge, or no curves at all`,
    );
    const b = customShapeBounds(built.outline);
    assert(b.w === 1200 && b.h === 600, `${shape}: measures exactly what the drawer asked for`);
    assert(Math.abs(b.cx) < 1e-9 && Math.abs(b.cy) < 1e-9, `${shape}: is centred on its own origin`);

    const item: Product = {
      ...base,
      dimensions: { widthMm: 1200, depthMm: 600, heightMm: 750 },
      appearance: { shape, content: "none" },
    };
    const f = resolveFootprint(item);
    assert(f.kind === "custom", `${shape}: resolves to an outline the whole app already draws`);
    assert(eq(footprintBounds(f), { w: 1200, h: 600 }), `${shape}: keeps its size through the resolver`);
  }

  // A derived shape with no measurements is floored like a rectangle — never drawn at zero.
  assert(
    eq(footprintBounds(resolveFootprint({ ...base, appearance: { shape: "hexagon", content: "none" } })), { w: MIN_FOOTPRINT_MM, h: MIN_FOOTPRINT_MM }),
    "a derived shape with no dimensions gets the same floor a rectangle does",
  );

  // The base library's חצי עיגול 120×60 (lib/catalog/standard/items.ts) is a half-circle of exactly
  // these two numbers: the built arc is the one that file used to spell out by hand, to the
  // millimetre. This is the assertion that keeps the two from drifting apart.
  const half = buildShapeOutline("half-circle", 1200, 600);
  const arc = half?.edgeCurves?.[1];
  assert(!!arc && Math.abs(arc.c1.y + 331) < 1 && Math.abs(arc.c2.x - 331) < 1, "the built חצי עיגול is the table the base library drew by hand");

  // The ח is the one derived shape with a HOLE in it — an outline that measured 1200×600 and still
  // filled the whole box would be a rectangle wearing the name. Shoelace area, against the counter
  // the shape claims to be: w·d minus the opening, which is (w − 2t) × (d − t) at t = min(w,d)/3.
  const u = buildShapeOutline("u-shape", 1200, 600)!;
  const area = (pts: Point[]) =>
    Math.abs(pts.reduce((sum, p, i) => {
      const q = pts[(i + 1) % pts.length];
      return sum + (p.x * q.y - q.x * p.y);
    }, 0)) / 2;
  const t = 200; // min(1200, 600) / 3
  assert(u.outline.length === 8, "the ח has eight corners — three sides and an open fourth");
  assert(!u.edgeCurves, "…and not one of them is curved");
  assert(
    Math.abs(area(u.outline) - (1200 * 600 - (1200 - 2 * t) * (600 - t))) < 1e-6,
    `the ח is a ${t}mm counter around an open middle, not a filled box (${area(u.outline)})`,
  );
  // Deeper than it is wide: the band comes off the short side, so the opening survives.
  const tall = buildShapeOutline("u-shape", 900, 3000)!;
  assert(area(tall.outline) < 900 * 3000, "a ח deeper than it is wide is still open, not a solid slab");

  assert(buildShapeOutline("rect", 100, 100) === null, "a primitive is not built");
  assert(buildShapeOutline("custom", 100, 100) === null, "a drawn outline is not built");

  console.log("footprint self-check passed");
}
