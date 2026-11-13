// PARITY — the element model draws every row's plan to the pixel (docs/superpowers/specs/
// 2026-11-07-element-model-design.md §9, Stage 1's Definition of Done).
//
// Nothing in lib/element is drawn by hand, so nothing can be judged by eye in a check; what CAN be
// held mechanically is that the geometry read off a row through ./adapter.ts + ./geometry.ts is the
// footprint `sizedFootprint` gives that row — the same kind, the same points, the same curves, the
// same SVG path strings — at the catalog's size and stretched. Over the base library (every table,
// deck, bar and built-in the app ships) and over a matrix of every shape × solid/hollow/lines ×
// alone/with parts × three sizes, so a shape the catalog happens not to ship today is held too.
//
// The parity SHEET (scripts/parity-sheet.ts) is the half for the eye: the same rows drawn side by
// side, current and new, as one HTML page. Run: npm run check:element-parity
import { MAP_SHAPES, usesDiameter, type Product, type ShapePart } from "@/lib/catalog/types";
import { STANDARD_ITEMS, standardProduct } from "@/lib/catalog/standard/items";
import { footprintOutlines, resizeSpecOf, sizedFootprint, type Footprint } from "@/lib/studio/footprint";
import { outlinePathD } from "@/lib/studio/geometry";
import { isMain } from "../self-check";
import { definitionOf, elementSizeOf } from "./adapter";
import { elementGeometry, flat, sameFootprint } from "./geometry";

/** Every outline of a footprint as the path string the plan draws it with. */
export const pathsOf = (f: Footprint): string[] => footprintOutlines(f).map((o) => outlinePathD(o.outline, o.edgeCurves, o.open));

/** Where the row and the element disagree, in words; empty when they agree. */
export function disagreements(product: Product, sizeMm?: { widthMm: number; depthMm: number }): string[] {
  const out: string[] = [];
  const old = sizedFootprint(product, sizeMm);
  const g = elementGeometry(definitionOf(product), elementSizeOf(product, sizeMm));
  if (!sameFootprint(old, g.footprint)) out.push(`footprint differs (${old.kind} vs ${g.footprint.kind})`);
  const a = pathsOf(old);
  const b = g.plan.map((p) => p.d);
  if (a.length !== b.length || a.some((d, i) => d !== b[i])) out.push(`plan paths differ (${a.length} vs ${b.length})`);
  const parts = (product.appearance?.parts?.length ?? 0) + 1;
  if (g.parts.length !== parts) out.push(`${g.parts.length} parts for ${parts} shapes`);
  // A repeated part may lay no copy at all in a base too small for one (a grid in a 70 cm box).
  if (g.parts.some((p) => p.pieces.length === 0 && !p.part.repeat)) out.push("a part with no piece");
  if (!flat(g)) out.push("a row with no heights of its own is not flat");
  return out;
}

const SIZES: ({ widthMm: number; depthMm: number } | undefined)[] = [undefined, { widthMm: 1800, depthMm: 900 }, { widthMm: 700, depthMm: 1100 }];

const HAND = [
  { x: 0, y: 0 },
  { x: 1400, y: 100 },
  { x: 1200, y: 900 },
  { x: 300, y: 700 },
];
const BOW = [null, { c1: { x: 0, y: -200 }, c2: { x: 0, y: -200 } }, null, null];

/** A row of every shape in every drawing it may have: solid, hollow (a band 150 deep, one side
 *  open), a closed band with an entrance, a partial arc, textured — alone and with a round part and
 *  a turned hollow rectangular part; hand-drawn outlines solid, bowed, hollow and lines only; a row
 *  with no appearance at all; a round row; a row of one size. */
export function matrix(): Product[] {
  const base = (name: string, dimensions: Product["dimensions"], appearance?: Product["appearance"]): Product => ({
    id: name,
    name,
    category: "other",
    layer: "floor",
    dimensions,
    categoryFields: {},
    styleTags: [],
    variants: [],
    resize: { stepMm: 100, width: { minMm: 100, maxMm: 20000 }, depth: { minMm: 100, maxMm: 20000 } },
    ...(appearance ? { appearance } : {}),
  });
  const parts: ShapePart[] = [
    { id: "p1", shape: "circle", diameterMm: 500, x: 900, y: 0, rotation: 0, texture: "marble" },
    { id: "p2", shape: "rect", widthMm: 600, depthMm: 200, x: -700, y: 300, rotation: 30, hollow: { bandMm: 60 } },
  ];
  const out: Product[] = [];
  for (const shape of MAP_SHAPES) {
    if (shape === "custom") continue;
    const dims = usesDiameter(shape) ? { diameterMm: 1200, heightMm: 750 } : { widthMm: 1200, depthMm: 600, heightMm: 750 };
    const variants: { tag: string; a: NonNullable<Product["appearance"]> }[] = [
      { tag: "solid", a: { shape, content: "none" } },
      { tag: "hollow", a: { shape, content: "none", hollow: { bandMm: 150, openSides: [0] } } },
      { tag: "ring", a: { shape, content: "none", hollow: { bandMm: 150, gapMm: 300, gapSide: 1 } } },
      { tag: "arc", a: { shape, content: "none", arc: { sweepDeg: 200, bandMm: 300 } } },
      { tag: "textured", a: { shape, content: "none", texture: "wood" } },
    ];
    for (const v of variants) {
      out.push(base(`${shape}/${v.tag}`, dims, v.a));
      out.push(base(`${shape}/${v.tag}+parts`, dims, { ...v.a, parts }));
    }
  }
  const hand = { widthMm: 1400, depthMm: 900, heightMm: 900 };
  out.push(base("custom/solid", hand, { shape: "custom", content: "none", outline: HAND }));
  out.push(base("custom/bowed", hand, { shape: "custom", content: "none", outline: HAND, edgeCurves: BOW }));
  out.push(base("custom/hollow", hand, { shape: "custom", content: "none", outline: HAND, edgeCurves: BOW, hollow: { bandMm: 120, openSides: [2] } }));
  out.push(base("custom/lines", hand, { shape: "custom", content: "none", outline: HAND, open: true }));
  out.push(base("custom/solid+parts", hand, { shape: "custom", content: "none", outline: HAND, parts }));
  out.push(base("custom/lines+parts", hand, { shape: "custom", content: "none", outline: HAND, open: true, parts }));
  // Stage 3: pinned and repeated parts, and an outline-only base — laid by the one engine, so the
  // adapter must hand them over whole.
  const pinned: ShapePart[] = [
    { id: "a", shape: "rect", widthMm: 600, depthMm: 200, x: 500, y: -500, rotation: 0, pin: { x: "end", y: "start" } },
    { id: "b", shape: "circle", diameterMm: 300, x: -400, y: 0, rotation: 0, pin: { x: "start", y: "center" } },
    { id: "c", shape: "stadium", widthMm: 900, depthMm: 120, x: 0, y: 400, rotation: 0, pin: { x: "stretch" } },
  ];
  out.push(base("rect/pinned", { widthMm: 1600, depthMm: 800, heightMm: 750 }, { shape: "rect", content: "none", parts: pinned }));
  out.push(base("hexagon/pinned", { widthMm: 1600, depthMm: 800, heightMm: 750 }, { shape: "hexagon", content: "none", parts: pinned }));
  const repeated: ShapePart[] = [
    { id: "post", shape: "rect", widthMm: 120, depthMm: 120, x: 0, y: 0, rotation: 0, repeat: { along: "corners" } },
    { id: "beam", shape: "rect", widthMm: 1000, depthMm: 150, x: 0, y: 0, rotation: 0, repeat: { along: "edges" } },
    { id: "slat", shape: "rect", widthMm: 50, depthMm: 1000, x: 0, y: 0, rotation: 0, repeat: { along: "row", spacingMm: 300, marginMm: 150 } },
    { id: "bal", shape: "circle", diameterMm: 80, x: 0, y: 0, rotation: 0, repeat: { along: "grid", spacingMm: 500 } },
  ];
  out.push(base("rect/repeated", { widthMm: 4000, depthMm: 3000, heightMm: 2500 }, { shape: "rect", content: "none", body: "none", parts: repeated }));
  out.push(base("hexagon/repeated", { widthMm: 4000, depthMm: 3464, heightMm: 2500 }, { shape: "hexagon", content: "none", parts: repeated }));
  out.push(base("custom/repeated", hand, { shape: "custom", content: "none", outline: HAND, parts: repeated }));
  out.push(base("bare", { heightMm: 750 }));
  out.push(base("round-dims", { diameterMm: 1800, heightMm: 750 }));
  const fixed = base("fixed-size", { widthMm: 1200, depthMm: 600, heightMm: 750 }, { shape: "hexagon", content: "none" });
  delete fixed.resize;
  out.push(fixed);
  return out;
}

/** Every row and size checked; the failures as "name @ size: why". */
export function parityFailures(products: readonly Product[]): string[] {
  const out: string[] = [];
  for (const p of products) {
    for (const size of SIZES) {
      if (size && !resizeSpecOf(p)) continue;
      for (const why of disagreements(p, size)) out.push(`${p.name} @ ${size ? `${size.widthMm}×${size.depthMm}` : "catalog"}: ${why}`);
    }
  }
  return out;
}

if (isMain(import.meta.url)) {
  const library = STANDARD_ITEMS.map((i) => standardProduct(i, `id-${i.key}`));
  const rows = [...library, ...matrix()];
  const failures = parityFailures(rows);
  for (const f of failures) console.error("  FAIL " + f);
  if (failures.length) {
    console.error(`element parity: ${failures.length} disagreement(s) over ${rows.length} rows`);
    process.exit(1);
  }
  console.log(`element parity: ${rows.length} rows (${library.length} of the base library, ${rows.length - library.length} of the matrix) × ${SIZES.length} sizes agree to the path string`);
}
