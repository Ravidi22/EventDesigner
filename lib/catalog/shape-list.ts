// THE SHAPE EDITOR'S ONE LIST — every shape of an item as an equal, and the row it is stored as.
//
// A row stores its drawing as a BASE shape (MapAppearance.shape + the product's dimensions, or a
// hand-drawn outline) and the shapes added beside it (MapAppearance.parts, each at an offset from the
// base's centre). The editor does not show that split (2026-11-01, the user: "is main shape / other
// shape separation relevant? why not support adding any shapes"): on the canvas every shape is a
// ShapePart at its place, and any of them is moved, turned, resized, reshaped, made hollow, textured
// or deleted the same way. The FIRST shape in the list is the one stored as the base — it is the
// bottom of the stack, its numbers are the row's dimensions — so deleting it, or sending another one
// to the back, simply makes the next one the base.
//
// The base has no turn of its own (every resolver draws it upright in the item's frame), so a first
// shape that was turned is stood upright on the way out (`upright`): nothing to do for a full circle,
// width and depth swapped for a rectangle or an ellipse at a quarter turn, and anything else baked
// into a hand-drawn outline of exactly what the canvas showed.
import type { MapAppearance, MapShape, Product, ShapePart } from "./types";
import { usesDiameter } from "./types";
import type { Point } from "../studio/hall";
import { customShapeBounds, flattenEdge, placedPartOutline, sampledBounds, placedPartOutlines, resolveFootprint, footprintBounds, type BuiltOutline } from "../studio/footprint";
import { isMain } from "../self-check";

const shapeOfRow = (p: Product): MapShape => p.appearance?.shape ?? (p.dimensions.diameterMm ? "circle" : "rect");

/** Where the base's centre stands on the editor's canvas: a derived shape is centred on (0,0); a
 *  hand-drawn outline is drawn where its points are. */
function baseAt(p: Product): { x: number; y: number } {
  const a = p.appearance;
  if (a?.shape === "custom" && a.outline && a.outline.length >= 3) {
    const b = customShapeBounds(a.outline, a.edgeCurves);
    return { x: b.cx, y: b.cy };
  }
  return { x: 0, y: 0 };
}

const shifted = (p: ShapePart, dx: number, dy: number): ShapePart => ({ ...p, x: Math.round(p.x + dx), y: Math.round(p.y + dy) });

/** Every shape of the row, each at its place on the canvas, the base first. Empty for a hand-drawn
 *  row with nothing drawn yet. */
export function shapesOf(p: Product): ShapePart[] {
  const a = p.appearance;
  const d = p.dimensions;
  const shape = shapeOfRow(p);
  const at = baseAt(p);
  const drawn = shape !== "custom" || (a?.outline?.length ?? 0) >= 3;
  const box = shape === "custom" && drawn ? customShapeBounds(a!.outline!, a!.edgeCurves) : null;
  const base: ShapePart | null = drawn
    ? {
        id: crypto.randomUUID(),
        shape,
        ...(shape === "custom" ? { outline: a!.outline, ...(a!.edgeCurves ? { edgeCurves: a!.edgeCurves } : {}), ...(a!.open ? { open: true } : {}) } : {}),
        ...(box
          ? { widthMm: Math.round(box.w), depthMm: Math.round(box.h) }
          : usesDiameter(shape)
            ? { diameterMm: d.diameterMm }
            : { widthMm: d.widthMm, depthMm: d.depthMm }),
        ...(a?.arc ? { arc: a.arc } : {}),
        ...(a?.ring ? { ring: a.ring } : {}),
        ...(a?.hollow ? { hollow: a.hollow } : {}),
        ...(a?.texture ? { texture: a.texture } : {}),
        ...(a?.textureImage ? { textureImage: a.textureImage } : {}),
        x: Math.round(at.x),
        y: Math.round(at.y),
        rotation: 0,
      }
    : null;
  return [...(base ? [base] : []), ...(a?.parts ?? []).map((q) => shifted(q, at.x, at.y))];
}

const turn = (deg: number) => ((Math.round(deg) % 360) + 360) % 360;

/** The shape as the base can store it: with no turn. See the file's note. */
export function upright(s: ShapePart): ShapePart {
  const r = turn(s.rotation || 0);
  if (r === 0) return s.rotation ? { ...s, rotation: 0 } : s;
  const plainHollow = !s.hollow || (!s.hollow.openSides?.length && s.hollow.gapSide === undefined && !s.hollow.gapMm);
  if (s.shape === "circle" && !s.arc && plainHollow) return { ...s, rotation: 0 };
  if ((s.shape === "rect" || s.shape === "square" || s.shape === "ellipse") && !s.hollow && r % 90 === 0) {
    return r % 180 === 0 ? { ...s, rotation: 0 } : { ...s, rotation: 0, widthMm: s.depthMm, depthMm: s.widthMm };
  }
  return baked(s, placedPartOutline(s));
}

/** The shape as a hand-drawn one of outline `o` (on the canvas, turn included), its box's centre its
 *  place. A hollow spec comes across whole — the outline's edges are the same edges, in the same order. */
function baked(s: ShapePart, o: BuiltOutline): ShapePart {
  const b = customShapeBounds(o.outline, o.edgeCurves);
  return {
    id: s.id,
    shape: "custom",
    outline: o.outline.map((v) => ({ x: Math.round(v.x), y: Math.round(v.y) })),
    ...(o.edgeCurves ? { edgeCurves: o.edgeCurves } : {}),
    ...(s.open ? { open: true } : {}),
    widthMm: Math.round(b.w),
    depthMm: Math.round(b.h),
    ...(s.hollow ? { hollow: s.hollow } : {}),
    ...(s.texture ? { texture: s.texture } : {}),
    ...(s.textureImage ? { textureImage: s.textureImage } : {}),
    x: Math.round(b.cx),
    y: Math.round(b.cy),
    rotation: 0,
  };
}

// ── Flip ──────────────────────────────────────────────────────────────────────────────────────────
// A shape has no mirror of its own (2026-11-01, the user: "the flip action is missing"), so a flip is
// either a TURN or a redraw. A shape that is its own mirror image about some line through its centre
// (a rectangle, a half-circle, a ח, a quarter-circle about its diagonal) mirrored is the same shape
// turned: reflecting across the world's line at β a shape turned θ, symmetric about its own line at
// α, gives that shape turned 2β − θ − 2α. Which lines a shape is symmetric about is MEASURED off its
// drawing, so an arc's sweep, a ring's gap and a hollow's open side all count without a table of
// kinds. Anything else is mirrored point by point into a hand-drawn shape.

export type FlipAxis = "horizontal" | "vertical";

/** Reflection across the line at `deg` through the origin. */
const reflect = (deg: number) => {
  const t = (2 * deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return (p: Point): Point => ({ x: p.x * c + p.y * s, y: p.x * s - p.y * c });
};

/** Every side a shape DRAWS, each as a polyline, curves sampled finely (a point halfway along one
 *  drawing's chord must lie on the other's). Left out: a lines-only shape's undrawn side — a |_| is
 *  not the box it closes into — and a closed band's seam, a straight side walked once each way where
 *  the keyhole meets itself (outlineStrokeD draws no line there either; where it falls depends on
 *  which side is lowest, not on the shape). */
const polylines = (pieces: readonly BuiltOutline[]): Point[][] =>
  pieces.flatMap(({ outline, edgeCurves, open }) => {
    const n = outline.length;
    const near = (a: Point, b: Point) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
    const end = (i: number) => outline[(i + 1) % n];
    const seam = (i: number) =>
      !edgeCurves?.[i] && outline.some((v, j) => j !== i && !edgeCurves?.[j] && near(v, end(i)) && near(end(j), outline[i]));
    return outline.flatMap((a, i) => ((open && i === n - 1) || seam(i) ? [] : [flattenEdge(a, end(i), edgeCurves?.[i], 64)]));
  });

const segDist = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};

/** Whether `a`'s lines lie on `b`'s, within `tol` — tried at every point and along every segment (a
 *  |_|'s four corners all lie on its mirror ‾|‾|; the middle of its bottom does not). A polyline is
 *  read as drawn, its last point not joined back to its first (a closed one repeats its first). */
const onLines = (a: Point[][], b: Point[][], tol: number) =>
  a.every((line) =>
    line.every((p, j) =>
      [0, 0.25, 0.5, 0.75].every((t) => {
        const r = line[j + 1] && t ? { x: p.x + (line[j + 1].x - p.x) * t, y: p.y + (line[j + 1].y - p.y) * t } : p;
        return b.some((q) => q.some((v, i) => i < q.length - 1 && segDist(r, v, q[i + 1]) <= tol));
      }),
    ),
  );

/** The angles of the lines through the shape's own centre it is symmetric about — none, one, or
 *  (a rectangle) two. */
function mirrorLines(s: ShapePart): number[] {
  const pieces = placedPartOutlines({ ...s, x: 0, y: 0, rotation: 0 });
  const own = polylines(pieces);
  const b = sampledBounds(pieces);
  const tol = Math.max(1, Math.max(b.w, b.h) * 0.002);
  return [90, 0, 45, 135].filter((deg) => {
    const m = reflect(deg);
    const mirrored = own.map((line) => line.map(m));
    return onLines(own, mirrored, tol) && onLines(mirrored, own, tol);
  });
}

const norm = (deg: number) => Math.round((((deg % 360) + 360) % 360) * 100) / 100;
/** How far a turn is from none, either way round. */
const off = (deg: number) => Math.min(norm(deg), 360 - norm(deg));

/** The shapes with `ids` flipped as one — about the middle of the box they stand in together, so a
 *  shape flipped alone stays where it is. */
export function flipShapes(shapes: readonly ShapePart[], ids: readonly string[], axis: FlipAxis): ShapePart[] {
  const picked = shapes.filter((s) => ids.includes(s.id));
  if (!picked.length) return [...shapes];
  const c = drawnBounds(picked);
  // Side to side reflects across a vertical line (β 90°), top to bottom across a horizontal one (β 0°).
  const beta = axis === "horizontal" ? 90 : 0;
  const across = (p: Point): Point => (axis === "horizontal" ? { x: 2 * c.cx - p.x, y: p.y } : { x: p.x, y: 2 * c.cy - p.y });
  return shapes.map((s) => {
    if (!ids.includes(s.id)) return s;
    // Of the turns a symmetric shape could take, the least: a rectangle flipped top to bottom stays
    // at 0°, not 180°.
    const turns = mirrorLines(s).map((alpha) => norm(2 * beta - (s.rotation || 0) - 2 * alpha));
    if (turns.length) {
      const at = across({ x: s.x, y: s.y });
      return { ...s, x: Math.round(at.x), y: Math.round(at.y), rotation: turns.reduce((a, b) => (off(b) < off(a) ? b : a)) };
    }
    // Point by point. The order stays, so every side keeps its number (a hollow's open side, its
    // entrance); the winding turns over, which the band and the seating read off the points. A bow's
    // handles are offsets from its ends and turn over with them.
    const o = placedPartOutline(s);
    const flip = (p: Point): Point => (axis === "horizontal" ? { x: -p.x, y: p.y } : { x: p.x, y: -p.y });
    return baked(s, {
      outline: o.outline.map(across),
      ...(o.edgeCurves ? { edgeCurves: o.edgeCurves.map((k) => (k ? { c1: flip(k.c1), c2: flip(k.c2) } : null)) } : {}),
    });
  });
}

/** The row's dimensions and appearance for a list of shapes — what is saved, and what every preview
 *  of the editor draws. `look` carries everything that is not geometry (content, style, picture…).
 *  The list must not be empty. */
export function lookOf(look: Product, shapes: readonly ShapePart[]): { dimensions: Product["dimensions"]; appearance: MapAppearance } {
  const [first, ...rest] = shapes;
  const s0 = upright(first);
  const a = look.appearance;
  const custom = s0.shape === "custom";
  const box = custom && s0.outline ? customShapeBounds(s0.outline, s0.edgeCurves) : null;
  const d = look.dimensions;
  const dimensions: Product["dimensions"] = box
    ? { ...d, widthMm: Math.round(box.w), depthMm: Math.round(box.h) }
    : usesDiameter(s0.shape)
      ? { ...d, diameterMm: s0.diameterMm }
      : { ...d, widthMm: s0.widthMm, depthMm: s0.depthMm };
  const parts = rest.map((q) => shifted(q, -s0.x, -s0.y));
  // The turned base moved the seat sides under the chairs; they are picked again.
  const moved = s0 !== first && turn(first.rotation || 0) !== 0;
  return {
    dimensions,
    appearance: {
      content: a?.content ?? "none",
      ...a,
      shape: s0.shape,
      // A hand-drawn outline is the base's only while it is drawn by hand; another shape keeps the
      // last one it had, as before (resolveFootprint reads it only for `custom`).
      outline: custom ? s0.outline : a?.outline,
      edgeCurves: custom ? s0.edgeCurves : a?.edgeCurves,
      open: custom && s0.open ? true : undefined,
      arc: s0.arc,
      ring: s0.ring,
      hollow: s0.hollow,
      texture: s0.texture,
      textureImage: s0.textureImage,
      parts: parts.length ? parts : undefined,
      blockedSides: moved ? undefined : a?.blockedSides,
    },
  };
}

/** The box of everything drawn, on the editor's canvas — where the item's footprint is centred. */
export function drawnBounds(shapes: readonly ShapePart[]) {
  return sampledBounds(shapes.flatMap(placedPartOutlines));
}

// ponytail: self-check. Run: npm run check:shape-list
if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const near = (a: number, b: number, m: string) => assert(Math.abs(a - b) < 2, `${m}: ${a} vs ${b}`);
  const row = (appearance: Partial<MapAppearance>, dimensions: Product["dimensions"] = { widthMm: 1600, depthMm: 900, heightMm: 750 }): Product =>
    ({ id: "p", name: "t", category: "tables", dimensions, variants: [], appearance: { shape: "rect", content: "none", ...appearance } }) as unknown as Product;
  const box = (p: Product) => footprintBounds(resolveFootprint(p));
  const roundTrip = (p: Product) => ({ ...p, ...lookOf(p, shapesOf(p)) });

  // A rectangle with a round end comes back as it went in.
  const withPart = row({ parts: [{ id: "q", shape: "circle", diameterMm: 900, x: 800, y: 0, rotation: 0 }] });
  const back = roundTrip(withPart);
  near(box(back).w, box(withPart).w, "round trip width");
  near(box(back).h, box(withPart).h, "round trip depth");
  assert(back.appearance?.parts?.[0].x === 800, "part offset kept");

  // A hand-drawn base comes back where it was drawn relative to its part.
  const drawn = row({ shape: "custom", outline: [{ x: 5000, y: 5000 }, { x: 6000, y: 5000 }, { x: 6000, y: 5500 }], parts: [{ id: "q", shape: "rect", widthMm: 400, depthMm: 400, x: 700, y: 0, rotation: 0 }] });
  const drawnBack = roundTrip(drawn);
  near(box(drawnBack).w, box(drawn).w, "custom base round trip");

  // Deleting the base makes the next shape the base, at its own size.
  const list = shapesOf(withPart);
  const promoted = lookOf(withPart, list.slice(1));
  assert(promoted.appearance.shape === "circle" && promoted.dimensions.diameterMm === 900 && !promoted.appearance.parts, "next shape promoted");

  // A quarter-turned rectangle is the same rectangle, width and depth swapped — no outline needed.
  const q = upright({ ...shapesOf(row({}))[0], rotation: 90 });
  assert(q.shape === "rect" && q.widthMm === 900 && q.depthMm === 1600 && q.rotation === 0, "quarter turn swaps");

  // Turned 30°, it is baked into the outline the canvas showed.
  const t = shapesOf(row({}))[0];
  const baked = upright({ ...t, rotation: 30 });
  const shown = sampledBounds([placedPartOutline({ ...t, rotation: 30 })]);
  assert(baked.shape === "custom" && baked.rotation === 0, "turned base baked");
  near(baked.widthMm ?? 0, shown.w, "baked width");
  near(baked.depthMm ?? 0, shown.h, "baked depth");
  const bakedRow = { ...row({}), ...lookOf(row({}), [{ ...t, rotation: 30 }]) };
  near(box(bakedRow).w, shown.w, "baked row draws what was shown");

  // A full circle has no turn to bake.
  const c = upright({ id: "c", shape: "circle", diameterMm: 1000, x: 0, y: 0, rotation: 45 });
  assert(c.shape === "circle" && c.rotation === 0, "circle stays a circle");

  // Flips, judged by what is DRAWN: the flipped shapes' lines are the originals' mirrored.
  const drawnLines = (list: ShapePart[]) => polylines(list.flatMap(placedPartOutlines));
  const flipBoth = (list: ShapePart[], m: string) => {
    for (const axis of ["horizontal", "vertical"] as const) {
      const c = drawnBounds(list);
      const across = (p: Point): Point => (axis === "horizontal" ? { x: 2 * c.cx - p.x, y: p.y } : { x: p.x, y: 2 * c.cy - p.y });
      const want = drawnLines(list).map((l) => l.map(across));
      const got = drawnLines(flipShapes(list, list.map((x) => x.id), axis));
      assert(onLines(got, want, 3) && onLines(want, got, 3), `${m} flips (${axis})`);
    }
  };
  const quarter: ShapePart = { id: "q", shape: "quarter-circle", diameterMm: 2000, x: 300, y: -200, rotation: 0 };
  const flippedQ = flipShapes([quarter], ["q"], "horizontal")[0];
  assert(flippedQ.shape === "quarter-circle", "a quarter-circle flips as a turn — it is symmetric about its diagonal");
  assert(flippedQ.x === 300 && flippedQ.y === -200, "a shape flipped alone stays where it is");
  flipBoth([quarter], "a quarter-circle");
  const rect: ShapePart = { id: "r", shape: "rect", widthMm: 1600, depthMm: 900, x: 0, y: 0, rotation: 30 };
  const flippedR = flipShapes([rect], ["r"], "horizontal")[0];
  assert(flippedR.shape === "rect" && flippedR.rotation === 330, `a turned rectangle flips to the opposite turn (${flippedR.rotation})`);
  assert(flipShapes([{ ...rect, rotation: 0 }], ["r"], "vertical")[0].rotation === 0, "a square-standing rectangle flipped stays at 0°");
  assert(flipShapes([{ id: "h", shape: "half-circle", diameterMm: 2000, x: 0, y: 0, rotation: 0 }], ["h"], "vertical")[0].rotation === 180, "a half-circle flipped top to bottom faces the other way");
  flipBoth([rect], "a turned rectangle");
  flipBoth([{ id: "h", shape: "half-circle", diameterMm: 2000, x: 0, y: 0, rotation: 20 }], "a turned half-circle");
  const tri: ShapePart = { id: "t", shape: "custom", outline: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 600 }], widthMm: 1000, depthMm: 600, x: 500, y: 300, rotation: 0 };
  assert(flipShapes([tri], ["t"], "vertical")[0].shape === "custom", "a lopsided hand-drawn shape is redrawn");
  flipBoth([tri], "a right triangle");
  flipBoth([{ ...tri, id: "b", edgeCurves: [{ c1: { x: 300, y: -200 }, c2: { x: -300, y: -200 } }, null, null] }], "a bowed side");
  flipBoth([{ id: "s", shape: "circle", diameterMm: 3000, arc: { sweepDeg: 120, bandMm: 0 }, hollow: { bandMm: 600 }, x: 0, y: 0, rotation: 40 }], "a turned hollow slice");
  flipBoth([{ id: "u", shape: "rect", widthMm: 2400, depthMm: 1200, hollow: { bandMm: 600, openSides: [1] }, x: 0, y: 0, rotation: 15 }], "a rectangle open on one side");
  flipBoth([quarter, rect, tri], "three together");
  flipBoth([{ id: "l", shape: "line", widthMm: 2000, depthMm: 20, x: 300, y: -200, rotation: 30 }], "a turned line");
  // Lines only: a |_| flipped top to bottom is open at the BOTTOM — not the box it would close into,
  // which is its own mirror image either way.
  const cup: ShapePart = { id: "c", shape: "custom", open: true, outline: [{ x: 0, y: 0 }, { x: 0, y: 1000 }, { x: 2000, y: 1000 }, { x: 2000, y: 0 }], widthMm: 2000, depthMm: 1000, x: 0, y: 0, rotation: 0 };
  const cupDown = flipShapes([cup], ["c"], "vertical")[0];
  assert(cupDown.open === true, "a lines-only shape stays lines only when flipped");
  assert(cupDown.shape === "custom" && (cupDown.rotation === 180 || cupDown.outline!.some((v) => v.y < cupDown.y)), "the open side goes to the bottom");
  flipBoth([cup], "a lines-only |_|");
  flipBoth([{ ...tri, id: "o", open: true }], "a lines-only lopsided shape");
  const openBack = roundTrip(row({ shape: "custom", open: true, outline: cup.outline }));
  assert(openBack.appearance?.open === true && resolveFootprint(openBack).kind === "custom", "lines only survives the round trip");
  assert((resolveFootprint(openBack) as { open?: boolean }).open === true, "…and reaches the footprint every surface draws");

  console.log("shape-list: ok");
}
