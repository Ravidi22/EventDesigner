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
import type { HollowSpec, MapAppearance, MapShape, Product, ShapePart } from "./types";
import { FRONT_THICK_MM, canHollow, usesDiameter } from "./types";
import type { EdgeCurve, Point } from "../studio/hall";
import { customShapeBounds, flattenEdge, frontFace, hollowOuter, placedPartOutline, roundSizeMm, sampledBounds, placedPartOutlines, repeatCopies, resolveFootprint, type BuiltOutline } from "../studio/footprint";
import { seatSides, type SeatSide } from "../studio/seating";

/** A line's thickness when nothing says otherwise — a rope, a cable, a rail. */
export const LINE_MM = 20;

/** A hollow spec carried to a DIFFERENT outline (another shape picked, or a drawing found where it
 *  was left): the band and the entrance's width and place mean the same on any shape, but open sides
 *  and the entrance's side are edge numbers of the outline they were chosen on — on another one they
 *  would open some other side, so they go. Nothing at all for a shape that cannot be hollow. */
export const hollowAcross = (h: HollowSpec | undefined, next: MapShape): HollowSpec | undefined =>
  h && canHollow(next) ? { bandMm: h.bandMm, ...(h.gapMm ? { gapMm: h.gapMm } : {}), ...(h.gapAt ? { gapAt: h.gapAt } : {}) } : undefined;

type Sized = { widthMm?: number; depthMm?: number; diameterMm?: number };

/** A square's one number, its side, as the engine reads it (lib/studio/footprint.ts solidFootprint:
 *  a diameter first, else the width, else the depth). */
export const squareSide = (d: Sized): number | undefined => d.diameterMm || d.widthMm || d.depthMm || undefined;

/** Only the size numbers a shape of `shape` is drawn from (SH-10, QA 2026-11-20): a round kind its
 *  diameter (a row from before round shapes had one is read through roundSizeMm), a square its side
 *  as width = depth (SH-11 — one number), anything else its width × depth. A number of another kind
 *  left behind is read by whoever asks for it first: a ⌀180 round made a 120 square was saved
 *  {diameterMm 1800, widthMm 1200} and drawn 180×180, and a stale diameter makes a row ROUND to the
 *  utilisation, the venue-table match and the studio. Undefined keys are written, not left out, so
 *  a spread over the old numbers clears them. */
export function sizeFieldsOf(shape: MapShape, d: Sized): Sized {
  if (usesDiameter(shape)) return { diameterMm: roundSizeMm(shape, d), widthMm: undefined, depthMm: undefined };
  if (shape === "square") {
    const side = squareSide(d);
    return { widthMm: side, depthMm: side, diameterMm: undefined };
  }
  return { widthMm: d.widthMm, depthMm: d.depthMm, diameterMm: undefined };
}

/** sizeFieldsOf without its undefined keys — for a shape being opened, which has no old numbers to
 *  clear. */
const definedSizes = (s: Sized): Sized => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined));

/** A shape as the patch would leave it: a hand-drawn one whose size is changed is RESCALED, since its
 *  outline — not its two numbers — is what draws it; a square typed as either number takes it as its
 *  side (SH-11 — before, a square's depth was a field that did nothing). */
export function patchedPart(part: ShapePart, p: Partial<ShapePart>): ShapePart {
  const next = { ...part, ...p };
  if (part.shape === "custom" && !p.outline && (p.widthMm !== undefined || p.depthMm !== undefined)) {
    return { ...next, ...rescaleOutline(part.outline ?? [], part.edgeCurves, p.widthMm ?? part.widthMm ?? 0, p.depthMm ?? part.depthMm ?? 0) };
  }
  if (next.shape === "square" && !p.shape) {
    const side = p.widthMm ?? p.depthMm ?? p.diameterMm ?? squareSide(part);
    return { ...next, widthMm: side, depthMm: side, diameterMm: undefined };
  }
  return next;
}

/** A shape turned into another kind, at the size it already stands at: a 120×60 rectangle becomes a
 *  120×60 ellipse, a ⌀90 circle a 90×90 rectangle. Its band comes across (hollowAcross); a sweep, a
 *  ring and anything else that only one kind reads is the new kind's default. */
export function reshaped(part: ShapePart, next: Exclude<MapShape, "custom">): ShapePart {
  // A front shape's size is its FACE's, not its band's.
  const b = part.plane === "front" ? frontFace(part.shape, { ...part, hollow: undefined, faceTurnDeg: undefined }) : sampledBounds([hollowOuter(part.shape, part)]);
  const w = Math.round(b.w) || 1200;
  const h = Math.round(b.h) || 600;
  return {
    ...part,
    shape: next,
    // The new kind's numbers and none of the old kind's (sizeFieldsOf).
    ...sizeFieldsOf(
      next,
      usesDiameter(next)
        ? { diameterMm: (next === "quarter-circle" ? 2 : 1) * Math.max(w, h) }
        : next === "line"
          ? { widthMm: Math.max(w, h), depthMm: LINE_MM }
          : next === "square"
            ? { widthMm: Math.max(w, h) }
            : { widthMm: w, depthMm: h },
    ),
    arc: undefined,
    ring: undefined,
    hollow: hollowAcross(part.hollow, next),
    // A body of revolution is a round shape's; a bowl reshaped to a square is a block.
    revolve: next === "circle" || next === "ellipse" ? part.revolve : undefined,
    open: undefined,
  };
}

const shapeOfRow = (p: Product): MapShape => p.appearance?.shape ?? (p.dimensions.diameterMm ? "circle" : "rect");

/** Where the base's centre stands on the editor's canvas: a derived shape is centred on (0,0); a
 *  hand-drawn outline is drawn where its points are. */
function baseAt(p: Product): { x: number; y: number } {
  const a = p.appearance;
  // A front base's outline is its FACE (x across, y = −up): no place on the plan of its own.
  if (a?.plane === "front") return { x: 0, y: 0 };
  if (a?.shape === "custom" && a.outline && a.outline.length >= 3) {
    const b = customShapeBounds(a.outline, a.edgeCurves);
    return { x: b.cx, y: b.cy };
  }
  return { x: 0, y: 0 };
}

const shifted = (p: ShapePart, dx: number, dy: number): ShapePart => ({ ...p, x: Math.round(p.x + dx), y: Math.round(p.y + dy) });

/** A hand-drawn outline stretched to a new box about its own centre — what a hand-drawn shape's
 *  resize handles and size fields do, in the editor and in the product drawer's W/D fields alike
 *  (2026-11-09: the form and the editor edit the SAME numbers). Curves are offsets from their
 *  endpoints, so they scale by the same two factors. A box under 10cm is held at 10cm. */
export function rescaleOutline(
  outline: readonly Point[],
  edgeCurves: readonly (EdgeCurve | null)[] | undefined,
  widthMm: number,
  depthMm: number,
): { outline: Point[]; edgeCurves: (EdgeCurve | null)[] | undefined; widthMm: number; depthMm: number } {
  const b = customShapeBounds([...outline], edgeCurves ? [...edgeCurves] : undefined);
  const sx = b.w > 0 ? Math.max(100, widthMm) / b.w : 1;
  const sy = b.h > 0 ? Math.max(100, depthMm) / b.h : 1;
  return {
    outline: outline.map((v) => ({ x: Math.round(b.cx + (v.x - b.cx) * sx), y: Math.round(b.cy + (v.y - b.cy) * sy) })),
    edgeCurves: edgeCurves?.map((c) => (c ? { c1: { x: c.c1.x * sx, y: c.c1.y * sy }, c2: { x: c.c2.x * sx, y: c.c2.y * sy } } : c)),
    widthMm: Math.round(b.w * sx),
    depthMm: Math.round(b.h * sy),
  };
}

/** Every shape of the row, each at its place on the canvas, the base first. Empty for a hand-drawn
 *  row with nothing drawn yet. */
export function shapesOf(p: Product): ShapePart[] {
  const a = p.appearance;
  const d = p.dimensions;
  const shape = shapeOfRow(p);
  const at = baseAt(p);
  const drawn = shape !== "custom" || (a?.outline?.length ?? 0) >= 3;
  const box = shape === "custom" && drawn ? customShapeBounds(a!.outline!, a!.edgeCurves) : null;
  const front = a?.plane === "front";
  const base: ShapePart | null = drawn && front
    ? {
        id: crypto.randomUUID(),
        plane: "front",
        shape,
        ...(shape === "custom" ? { outline: a!.outline, ...(a!.edgeCurves ? { edgeCurves: a!.edgeCurves } : {}), ...(a!.open ? { open: true } : {}) } : {}),
        // Its FACE: across and up. The row's height is its face's; the row's depth its thickness.
        ...(box
          ? { widthMm: Math.round(box.w), depthMm: Math.round(box.h) }
          : usesDiameter(shape)
            ? { diameterMm: roundSizeMm(shape, { diameterMm: d.diameterMm, widthMm: d.widthMm }) }
            : { widthMm: d.widthMm, depthMm: d.heightMm }),
        thicknessMm: d.depthMm,
        ...(a?.bendDeg ? { bendDeg: a.bendDeg } : {}),
        ...(a?.faceTurnDeg ? { faceTurnDeg: a.faceTurnDeg } : {}),
        ...(a?.arc ? { arc: a.arc } : {}),
        ...(a?.ring ? { ring: a.ring } : {}),
        ...(a?.hollow ? { hollow: a.hollow } : {}),
        ...(a?.body ? { body: a.body } : {}),
        ...(a?.texture ? { texture: a.texture } : {}),
        ...(a?.textureImage ? { textureImage: a.textureImage } : {}),
        ...(a?.baseStyle ? { style: a.baseStyle } : {}),
        ...(a?.baseMaterial ? { material: a.baseMaterial } : {}),
        x: 0,
        y: 0,
        rotation: 0,
      }
    : drawn
    ? {
        id: crypto.randomUUID(),
        shape,
        ...(shape === "custom" ? { outline: a!.outline, ...(a!.edgeCurves ? { edgeCurves: a!.edgeCurves } : {}), ...(a!.open ? { open: true } : {}) } : {}),
        // The numbers the row is DRAWN at: a row from before round shapes had a diameter opens at
        // the size it draws (roundSizeMm), a square at its one side (SH-10/11).
        ...(box ? { widthMm: Math.round(box.w), depthMm: Math.round(box.h) } : definedSizes(sizeFieldsOf(shape, d))),
        ...(a?.arc ? { arc: a.arc } : {}),
        ...(a?.ring ? { ring: a.ring } : {}),
        ...(a?.hollow ? { hollow: a.hollow } : {}),
        ...(a?.revolve ? { revolve: a.revolve } : {}),
        ...(a?.body ? { body: a.body } : {}),
        ...(a?.texture ? { texture: a.texture } : {}),
        ...(a?.textureImage ? { textureImage: a.textureImage } : {}),
        ...(a?.baseStyle ? { style: a.baseStyle } : {}),
        ...(a?.baseMaterial ? { material: a.baseMaterial } : {}),
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
  // A turn the shape is its own image under — anything point-symmetric's half turn, a regular
  // hexagon's 60° — is no turn at all (SH-9): it stays the shape it is, never a free drawing of it.
  if (s.shape !== "custom" && turnsIntoItself(s, r)) return { ...s, rotation: 0 };
  return baked(s, placedPartOutline(s));
}

const symmetryCache = new Map<string, boolean>();
/** Whether the shape turned `r` draws exactly what it draws unturned — measured off its drawing. */
function turnsIntoItself(s: ShapePart, r: number): boolean {
  const at = { ...s, id: "", x: 0, y: 0 };
  const key = JSON.stringify({ ...at, rotation: r });
  const hit = symmetryCache.get(key);
  if (hit !== undefined) return hit;
  const still = placedPartOutlines({ ...at, rotation: 0 });
  const turned = polylines(placedPartOutlines({ ...at, rotation: r }));
  const b = sampledBounds(still);
  const tol = Math.max(1, Math.max(b.w, b.h) * 0.002);
  const same = onLines(turned, polylines(still), tol) && onLines(polylines(still), turned, tol);
  if (symmetryCache.size > 200) symmetryCache.clear();
  symmetryCache.set(key, same);
  return same;
}

/** Whether a first shape stored as the base would be turned into a FREE DRAWING by its turn (the
 *  base has no turn of its own): the editor says so before it is saved (SH-9) — a hexagon turned 45°
 *  comes back "צורה חופשית", and a width typed later stretches its corners. */
export function bakesTurn(s: ShapePart): boolean {
  return s.shape !== "custom" && s.plane !== "front" && turn(s.rotation || 0) !== 0 && upright(s).shape === "custom";
}

/** A FRONT shape as the base can store it: its plan turn is the caller's (lookOf turns the whole
 *  drawing back), and a turn within its face is baked into its face — the same rule `upright` is on
 *  the plan, read in the face's own frame. */
function uprightFace(s: ShapePart): ShapePart {
  if (!turn(s.faceTurnDeg || 0)) return s.faceTurnDeg !== undefined ? { ...s, faceTurnDeg: undefined } : s;
  const face = upright({ ...s, plane: undefined, thicknessMm: undefined, bendDeg: undefined, faceTurnDeg: undefined, x: 0, y: 0, rotation: s.faceTurnDeg || 0 });
  return { ...face, plane: "front", thicknessMm: s.thicknessMm, ...(s.bendDeg ? { bendDeg: s.bendDeg } : {}), x: s.x, y: s.y, rotation: s.rotation };
}

/** Every shape's place turned `deg` about a point, and its own turn with it — the whole drawing
 *  turned as one. */
export function turnedAbout(list: readonly ShapePart[], about: { x: number; y: number }, deg: number): ShapePart[] {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const sn = Math.sin(t);
  return list.map((p) => {
    const dx = p.x - about.x;
    const dy = p.y - about.y;
    const r = (((p.rotation || 0) + deg) % 360 + 360) % 360;
    return { ...p, x: Math.round(about.x + dx * c - dy * sn), y: Math.round(about.y + dx * sn + dy * c), rotation: Math.abs(r - 360) < 1e-9 ? 0 : r };
  });
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
    ...(s.style ? { style: s.style } : {}),
    // A height of its own, a pin, a repeat, a body (the element model) are not geometry on the plan;
    // they come across whole.
    ...(s.zMm !== undefined ? { zMm: s.zMm } : {}),
    ...(s.heightMm !== undefined ? { heightMm: s.heightMm } : {}),
    ...(s.revolve ? { revolve: s.revolve } : {}),
    ...(s.pin ? { pin: s.pin } : {}),
    ...(s.repeat ? { repeat: s.repeat } : {}),
    ...(s.body ? { body: s.body } : {}),
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
export const polylines = (pieces: readonly BuiltOutline[]): Point[][] =>
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
export const onLines = (a: Point[][], b: Point[][], tol: number) =>
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
  // A FRONT first shape cannot be stored turned on the plan (the base has no turn, and its outline is
  // its face, not a plan outline to bake the turn into): the whole drawing is turned back about it,
  // which keeps every shape where it stands relative to it — the item's front is its first face's.
  const lead = shapes[0];
  const list = lead?.plane === "front" && turn(lead.rotation || 0) ? turnedAbout(shapes, { x: lead.x, y: lead.y }, -(lead.rotation || 0)) : shapes;
  const [first, ...rest] = list;
  if (first.plane === "front") return frontLookOf(look, first, rest);
  const s0 = upright(first);
  const a = look.appearance;
  const custom = s0.shape === "custom";
  const box = custom && s0.outline ? customShapeBounds(s0.outline, s0.edgeCurves) : null;
  const d = look.dimensions;
  // The base's own numbers and none of another kind's (SH-10): a hand-drawn base its box, a round one
  // its diameter, a square its side, anything else its width × depth — never the diameter a round row
  // reshaped to a square brought with it.
  const dimensions: Product["dimensions"] = box
    ? { ...d, widthMm: Math.round(box.w), depthMm: Math.round(box.h), diameterMm: undefined }
    : { ...d, ...sizeFieldsOf(s0.shape, s0) };
  const parts = rest.map((q) => shifted(q, -s0.x, -s0.y));
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
      revolve: s0.revolve,
      body: s0.body,
      texture: s0.texture,
      textureImage: s0.textureImage,
      baseStyle: s0.style,
      baseMaterial: s0.material,
      parts: parts.length ? parts : undefined,
      // Kept whatever the first shape's turn (SH-9): the editor draws the seat sides on this very row
      // (its preview is lookOf's), so what it showed blocked is what is saved. They were dropped on
      // every save of a turned first shape, even a half turn, while the editor showed them blocked.
      blockedSides: a?.blockedSides,
      plane: undefined,
      bendDeg: undefined,
      faceTurnDeg: undefined,
    },
  };
}

/** lookOf for a FRONT first shape: its face's across size and height are the row's width (or
 *  diameter) and height, its thickness the row's depth; the rest are parts about its band's centre. */
function frontLookOf(look: Product, first: ShapePart, rest: readonly ShapePart[]): { dimensions: Product["dimensions"]; appearance: MapAppearance } {
  const s0 = uprightFace({ ...first, rotation: 0 });
  const a = look.appearance;
  const d = look.dimensions;
  const custom = s0.shape === "custom";
  const box = custom && s0.outline ? customShapeBounds(s0.outline, s0.edgeCurves) : null;
  const faceH = Math.round(frontFace(s0.shape, s0).h);
  const thickness = s0.thicknessMm ?? FRONT_THICK_MM;
  // A front base's depth is its THICKNESS, whatever its face is; the rest are its face's own numbers
  // and none of another kind's (SH-10).
  const dimensions: Product["dimensions"] = box
    ? { ...d, widthMm: Math.round(box.w), depthMm: thickness, heightMm: Math.round(box.h), diameterMm: undefined }
    : usesDiameter(s0.shape)
      ? { ...d, diameterMm: roundSizeMm(s0.shape, s0), widthMm: undefined, depthMm: thickness, heightMm: faceH }
      : { ...d, widthMm: s0.widthMm, depthMm: thickness, heightMm: s0.depthMm ?? faceH, diameterMm: undefined };
  const parts = rest.map((q) => shifted(q, -s0.x, -s0.y));
  return {
    dimensions,
    appearance: {
      content: a?.content ?? "none",
      ...a,
      shape: s0.shape,
      plane: "front",
      bendDeg: s0.bendDeg || undefined,
      faceTurnDeg: undefined,
      outline: custom ? s0.outline : a?.outline,
      edgeCurves: custom ? s0.edgeCurves : a?.edgeCurves,
      open: custom && s0.open ? true : undefined,
      arc: s0.arc,
      ring: s0.ring,
      hollow: s0.hollow,
      revolve: undefined,
      body: s0.body,
      texture: s0.texture,
      textureImage: s0.textureImage,
      baseStyle: s0.style,
      baseMaterial: s0.material,
      parts: parts.length ? parts : undefined,
      // A front base has no seats; a row turned from a plan base loses the sides it had.
      blockedSides: undefined,
    },
  };
}

/** The box of everything drawn, on the editor's canvas — where the item's footprint is centred. */
export function drawnBounds(shapes: readonly ShapePart[]) {
  return sampledBounds(drawnPieces(shapes));
}

/** Every outline the canvas draws of the shapes: each shape where it stands — a repeated one as the
 *  copies it lays against the first shape (lib/studio/footprint.ts repeatCopies), which is what the
 *  plan draws of it, so the item's box on the canvas is the plan's box. */
export function drawnPieces(shapes: readonly ShapePart[]): BuiltOutline[] {
  const base = shapes[0] ? placedPartOutline(shapes[0]) : null;
  return shapes.flatMap((s, i) => (i > 0 && s.repeat && s.plane !== "front" && base ? repeatCopies(s, base) : placedPartOutlines(s)));
}

// ── The stack and the base ────────────────────────────────────────────────────────────────────────

export type StackMove = "front" | "back" | "forward" | "backward";

/** The list with `ids` moved in the stack — the list IS the stack, the last drawn on top — with the
 *  FIRST shape left first. It is the item's base (the row's dimensions, on the floor, as tall as the
 *  item), and "to the back" used to make whatever was sent there the base: a shelf a metre up became
 *  a block on the floor as tall as the item, its height and its place thrown away (SH-8). Now "to the
 *  back" is just above the base, and the base moves only by being deleted (promotionLoss says what
 *  the next one loses then). */
export function restackShapes(list: readonly ShapePart[], ids: readonly string[], how: StackMove): ShapePart[] {
  if (list.length < 2) return [...list];
  const [base, ...out] = list;
  const moved = out.filter((s) => ids.includes(s.id));
  const rest = out.filter((s) => !ids.includes(s.id));
  if (how === "front") return [base, ...rest, ...moved];
  if (how === "back") return [base, ...moved, ...rest];
  const step = how === "forward" ? 1 : -1;
  const order = how === "forward" ? [...out.keys()].reverse() : [...out.keys()];
  for (const i of order) {
    const j = i + step;
    if (!ids.includes(out[i].id) || j < 0 || j >= out.length || ids.includes(out[j].id)) continue;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return [base, ...out];
}

/** What a shape loses by becoming the base (the first shape deleted): the base stands on the floor,
 *  as tall as the item, laid once — so its own height from the floor, its own height, its pin and its
 *  repeat go. Empty when it loses nothing. In the words the editor's warning uses. */
export function promotionLoss(s: ShapePart): string[] {
  const out: string[] = [];
  if (s.zMm) out.push(`גובה מהרצפה ${Math.round(s.zMm / 10)} ס״מ`);
  if (s.heightMm !== undefined && s.plane !== "front") out.push(`גובה ${Math.round(s.heightMm / 10)} ס״מ`);
  if (s.pin) out.push("העיגון");
  if (s.repeat) out.push("החזרה");
  return out;
}

// ── Seat sides that follow their shape ────────────────────────────────────────────────────────────

/** The pieces a shape adds to the item's footprint, where the canvas stands them: the first as it is
 *  STORED (upright — a turned base is numbered as the row will number it), a repeated one as its
 *  copies (drawnPieces). */
function seatPiecesOf(list: readonly ShapePart[], i: number): BuiltOutline[] {
  const s = list[i];
  if (i === 0) return placedPartOutlines(upright(s));
  const base = placedPartOutline(list[0]);
  return s.repeat && s.plane !== "front" ? repeatCopies(s, base) : placedPartOutlines(s);
}

/** Every shape's seat sides, in list order, where the canvas stands them — blockedSides number them
 *  base first, then each shape (lib/studio/seating.ts seatSides over the composed footprint). Null
 *  when they do not add up to the item's own count (a shape too unusual to tell apart). */
function sidesByShape(look: Product, list: readonly ShapePart[]): SeatSide[][] | null {
  if (!list.length) return [];
  const sides = list.map((_, i) => seatSides({ kind: "multi", parts: seatPiecesOf(list, i) }));
  const total = seatSides(resolveFootprint({ ...look, ...lookOf(look, list) })).length;
  return sides.reduce((n, s) => n + s.length, 0) === total ? sides : null;
}

const SIDE_TOL_MM = 2;

/** Whether seat side `s` lies along polyline `on` — its middle on it, within a hair. */
function liesOn(s: SeatSide, on: readonly Point[]): boolean {
  let walked = 0;
  let mid = s.pts[0];
  for (let k = 0; k < s.pts.length - 1; k++) {
    if (walked + s.lengths[k] >= s.len / 2) {
      const t = s.lengths[k] ? (s.len / 2 - walked) / s.lengths[k] : 0;
      mid = { x: s.pts[k].x + (s.pts[k + 1].x - s.pts[k].x) * t, y: s.pts[k].y + (s.pts[k + 1].y - s.pts[k].y) * t };
      break;
    }
    walked += s.lengths[k];
  }
  return on.some((v, i) => i < on.length - 1 && segDist(mid, v, on[i + 1]) <= SIDE_TOL_MM);
}

/** The item's blocked seat sides when its list of shapes changes, each following ITS shape (SH-13,
 *  QA 2026-11-20): a shape deleted takes its blocks with it and the shapes after it shift down, a
 *  shape made the base or moved in the stack takes them where it goes. Before, an index past the end
 *  was dropped and every other kept its number — a head table's blocked front became its side, chairs
 *  on the front. A shape REDRAWN point by point (`redrawn`, its id) — or any whose sides changed in
 *  number — is read by where its sides are: a new side is blocked where it lies on one that was (a
 *  point added on a straight side changes no seat side; one pulled out of the line splits it, and
 *  neither half is where the side was). */
export function remapBlockedSides(look: Product, before: readonly ShapePart[], after: readonly ShapePart[], blocked: readonly number[], redrawn?: string): number[] {
  if (!blocked.length || !after.length) return [];
  const was = sidesByShape(look, before);
  const now = sidesByShape(look, after);
  if (!was || !now) {
    const total = seatSides(resolveFootprint({ ...look, ...lookOf(look, after) })).length;
    return blocked.filter((i) => i < total);
  }
  const start = (sides: SeatSide[][]) => sides.map((_, i) => sides.slice(0, i).reduce((n, s) => n + s.length, 0));
  const wasAt = start(was);
  const nowAt = start(now);
  const out: number[] = [];
  after.forEach((s, i) => {
    const k = before.findIndex((q) => q.id === s.id);
    if (k < 0) return;
    const local = blocked.filter((b) => b >= wasAt[k] && b < wasAt[k] + was[k].length).map((b) => b - wasAt[k]);
    if (!local.length) return;
    if (s.id !== redrawn && was[k].length === now[i].length) {
      out.push(...local.map((l) => nowAt[i] + l));
      return;
    }
    now[i].forEach((side, j) => {
      if (local.some((l) => liesOn(side, was[k][l].pts))) out.push(nowAt[i] + j);
    });
  });
  return [...new Set(out)].sort((a, b) => a - b);
}
