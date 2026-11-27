// THE SIDE VIEWS — the item's shapes seen from the front (חזית) and from the side (צד), as boxes a
// designer drags up and down (docs/superpowers/specs/2026-11-09-backdrops-front-drawing-and-text-
// design.md §4, S1). Every shape is a box from its bottom (`zMm`) to its top; a round shape with a
// body (`revolve`) is its silhouette, its profile's points handles on it. The shape editor draws the
// view on a PlanCanvas whose world is (across, −z): the floor is the line y = 0 and up is up the
// screen — so a box here is a canvas rect, and a rect moved or resized there is read back into the
// shape's own numbers (`rectEdit`).
//
// Across is plan x in the FRONT view (looking at the item's front, +y, from in front of it) and plan
// y in the SIDE view (looking along +x from the item's −x end, its front to the right). The room
// drawn under the view is the item's 3D through an orthographic camera framed by `orthoFrame` to the
// canvas's settled view.
//
// The base shape stands on the floor and is the item's height: it is never raised, and its top edge
// IS the item's height. Any other shape stands at its own z with its own height, else on the floor as
// tall as the item (ShapePart.zMm / heightMm) — and a move that does not change its height never
// writes one, so a part that follows the item's height keeps following it.
//
// Pure. Run: npm run check:elevation-view
import { FRONT_THICK_MM, usesDiameter, type MapShape, type RevolvePoint, type ShapePart } from "@/lib/catalog/types";
import { frontFace, placedPartOutline, sampledBounds, type BuiltOutline } from "@/lib/studio/footprint";
import { rescaleOutline } from "@/lib/catalog/shape-list";
import type { EdgeCurve, Point } from "@/lib/studio/hall";
import { cleanRevolve } from "./revolve";

export type ElevationView = "front" | "side";

/** The least height a box takes — a shape is never dragged to nothing. */
export const ELEVATION_MIN_H_MM = 10;

export interface ElevationBox {
  id: string;
  /** In the shape list; 0 = the base. */
  index: number;
  /** Across, mm — plan x in front, plan y from the side. */
  a0: number;
  a1: number;
  /** Bottom above the item's floor, and its rise. */
  z: number;
  h: number;
  /** A round, solid shape's body profile (sound — cleanRevolve), drawn as its silhouette. */
  revolve?: RevolvePoint[];
  /** An outline with no body (ShapePart.body "none") — dashed. */
  outlineOnly: boolean;
  /** Which of the shape's plan numbers an across resize writes; null = none (turned off the square,
   *  hand-drawn, a band or a slice — their across extent is no one number). */
  across: "width" | "depth" | "diameter" | null;
  /** A FRONT shape (ShapePart.plane): its face's outlines in the canvas world about the box's middle,
   *  and whether this view shows it AS ITSELF — the front view, facing the viewer (not turned on the
   *  plan) and flat — when it is drawn and edited as its face; otherwise it is its box. */
  front?: { pieces: BuiltOutline[]; asItself: boolean };
}

/** A rect on the elevation canvas — centre and size in its world (across, −z). */
export interface ElevationRect {
  x: number;
  y: number;
  widthMm: number;
  depthMm: number;
}

/** Shapes whose across extent is no single plan number. */
const NO_ACROSS = new Set<ShapePart["shape"]>(["custom", "arc", "half-circle", "quarter-circle", "crescent", "oval-ring", "horseshoe", "u-shape", "rounded-u"]);

function acrossOf(s: ShapePart, view: ElevationView): ElevationBox["across"] {
  const rot = (((s.rotation || 0) % 360) + 360) % 360;
  if (rot % 90 > 1e-6 && rot % 90 < 90 - 1e-6) return null;
  if (NO_ACROSS.has(s.shape)) return null;
  if (s.shape === "circle") return "diameter";
  const square = Math.round(rot / 90) % 2 === 0;
  return view === "front" ? (square ? "width" : "depth") : square ? "depth" : "width";
}

/** A plan turn of (nearly) nothing — a front shape facing the viewer. */
const facing = (deg: number | undefined) => {
  const r = (((deg || 0) % 360) + 360) % 360;
  return r < 1 || r > 359;
};

/** Every shape as its box in the view, in list order. */
export function elevationBoxes(shapes: readonly ShapePart[], itemHeightMm: number, view: ElevationView): ElevationBox[] {
  return shapes.map((s, index) => {
    const b = sampledBounds([placedPartOutline(s)]);
    const base = index === 0;
    if (s.plane === "front") {
      // Its band is its across extent either way; its rise is its face's, from its own z (a base 0).
      const face = frontFace(s.shape, s);
      const asItself = view === "front" && facing(s.rotation) && Math.abs(s.bendDeg || 0) < 0.5;
      const turned = !facing(s.faceTurnDeg);
      const a0 = view === "front" ? b.minX : b.minY;
      const a1 = view === "front" ? b.maxX : b.maxY;
      const z = base ? 0 : (s.zMm ?? 0);
      const h = Math.max(ELEVATION_MIN_H_MM, face.h);
      const cx = (a0 + a1) / 2;
      const cy = -(z + h / 2);
      const pieces = face.pieces.map((o) => ({ ...o, outline: o.outline.map((v) => ({ x: v.x + cx, y: v.y + cy })) }));
      return {
        id: s.id,
        index,
        a0,
        a1,
        z,
        h,
        outlineOnly: s.body === "none",
        across: asItself && !turned ? (usesDiameter(s.shape) ? "diameter" : "width") : null,
        front: { pieces, asItself },
      };
    }
    const round = (s.shape === "circle" || s.shape === "ellipse") && !s.hollow && !!s.revolve && s.revolve.length >= 2;
    return {
      id: s.id,
      index,
      a0: view === "front" ? b.minX : b.minY,
      a1: view === "front" ? b.maxX : b.maxY,
      z: base ? 0 : (s.zMm ?? 0),
      h: Math.max(ELEVATION_MIN_H_MM, base ? itemHeightMm : (s.heightMm ?? itemHeightMm)),
      ...(round ? { revolve: cleanRevolve(s.revolve!) } : {}),
      outlineOnly: s.body === "none",
      across: acrossOf(s, view),
    };
  });
}

/** The box as a rect on the elevation canvas. */
export function boxRect(b: ElevationBox): ElevationRect {
  return { x: (b.a0 + b.a1) / 2, y: -(b.z + b.h / 2), widthMm: b.a1 - b.a0, depthMm: b.h };
}

/** A rect moved or resized on the canvas, read back: the shape's patch, and — the base's top edge
 *  having moved — the item's new height. Only what changed is written. */
export function rectEdit(shape: ShapePart, b: ElevationBox, rect: ElevationRect, view: ElevationView): { patch: Partial<ShapePart>; itemHeightMm?: number } {
  if (shape.plane === "front") return frontRectEdit(shape, b, rect, view);
  const patch: Partial<ShapePart> = {};
  const dW = rect.widthMm - (b.a1 - b.a0);
  const resizedAcross = Math.abs(dW) > 0.5;
  // A shape with no one across number takes no across resize — and then neither the half-drag its
  // centre made, or it would slide sideways as its edge is pulled.
  if (!resizedAcross || b.across) {
    const dA = rect.x - (b.a0 + b.a1) / 2;
    if (Math.abs(dA) > 0.5) {
      if (view === "front") patch.x = Math.round(shape.x + dA);
      else patch.y = Math.round(shape.y + dA);
    }
    if (resizedAcross && b.across) {
      const w = Math.max(ELEVATION_MIN_H_MM, Math.round(rect.widthMm));
      if (b.across === "width") patch.widthMm = w;
      else if (b.across === "depth") patch.depthMm = w;
      else patch.diameterMm = w;
    }
  }
  // The rect's edges, as heights above the floor: a bottom grip moves only the bottom, a top grip
  // only the top, a move both (its rise unchanged).
  const top = -(rect.y - rect.depthMm / 2);
  const bottom = -(rect.y + rect.depthMm / 2);
  const moved = Math.abs(rect.depthMm - b.h) <= 0.5;
  if (b.index === 0) {
    // The base never leaves the floor: only its TOP edge says anything, and a pure move says nothing.
    if (moved || Math.abs(top - b.h) <= 0.5) return { patch };
    return { patch, itemHeightMm: Math.max(ELEVATION_MIN_H_MM, Math.round(top)) };
  }
  const z = Math.max(0, Math.round(bottom));
  if (Math.abs(z - b.z) > 0.5) patch.zMm = z;
  if (!moved) {
    const h = Math.max(ELEVATION_MIN_H_MM, Math.round(top - z));
    if (Math.abs(h - b.h) > 0.5) patch.heightMm = h;
  }
  return { patch };
}

/** rectEdit for a FRONT shape: what moves is its place and its z, what is resized is its FACE — its
 *  width (a hand-drawn one rescaled, a round one whole) and its height on the face; a front base's
 *  top edge is its face's height and the item's. A face turned within itself takes moves only. */
function frontRectEdit(shape: ShapePart, b: ElevationBox, rect: ElevationRect, view: ElevationView): { patch: Partial<ShapePart>; itemHeightMm?: number } {
  const patch: Partial<ShapePart> = {};
  const curW = b.a1 - b.a0;
  const resizedAcross = Math.abs(rect.widthMm - curW) > 0.5 && !!b.across;
  if (Math.abs(rect.widthMm - curW) <= 0.5 || b.across) {
    const dA = rect.x - (b.a0 + b.a1) / 2;
    if (Math.abs(dA) > 0.5) {
      if (view === "front") patch.x = Math.round(shape.x + dA);
      else patch.y = Math.round(shape.y + dA);
    }
  }
  const top = -(rect.y - rect.depthMm / 2);
  const bottom = -(rect.y + rect.depthMm / 2);
  const moved = Math.abs(rect.depthMm - b.h) <= 0.5;
  const resizable = facing(shape.faceTurnDeg);
  let wantH: number | undefined;
  let itemHeightMm: number | undefined;
  if (b.index === 0) {
    if (!moved && Math.abs(top - b.h) > 0.5 && resizable) {
      wantH = Math.max(ELEVATION_MIN_H_MM, Math.round(top));
      itemHeightMm = wantH;
    }
  } else {
    const z = Math.max(0, Math.round(bottom));
    if (Math.abs(z - b.z) > 0.5) patch.zMm = z;
    if (!moved && resizable) {
      const h = Math.max(ELEVATION_MIN_H_MM, Math.round(top - z));
      if (Math.abs(h - b.h) > 0.5) wantH = h;
    }
  }
  const wantW = resizedAcross ? Math.max(ELEVATION_MIN_H_MM, Math.round(rect.widthMm)) : undefined;
  if (wantW !== undefined || wantH !== undefined) Object.assign(patch, faceResize(shape, curW, b.h, wantW, wantH));
  return { patch, ...(itemHeightMm !== undefined ? { itemHeightMm } : {}) };
}

/** A front shape's face resized to a new width and/or height ON THE FACE, measured off what it is now
 *  — the item's height field and the face's top edge write a front base's face through this. */
export function faceSized(shape: ShapePart, to: { widthMm?: number; heightMm?: number }): Partial<ShapePart> {
  const face = frontFace(shape.shape, { ...shape, faceTurnDeg: undefined });
  return faceResize(shape, face.w, face.h, to.widthMm, to.heightMm);
}

/** The plan's resize grips on a front shape's BAND: a flat one's width is its face's width (unless
 *  the face is turned within itself, when the band's width is no one number of the face) and its
 *  depth its thickness; a BENT band's box is no number of the shape at all, so its grips change
 *  nothing — its width, bend and thickness are typed in its panel. */
export function bandResize(s: ShapePart, before: { widthMm: number; depthMm: number }, next: { x: number; y: number; widthMm: number; depthMm: number }): Partial<ShapePart> {
  if (Math.abs(s.bendDeg || 0) >= 0.5) return {};
  const patch: Partial<ShapePart> = { x: Math.round(next.x), y: Math.round(next.y) };
  if (facing(s.faceTurnDeg) && Math.round(next.widthMm) !== Math.round(before.widthMm)) Object.assign(patch, faceSized(s, { widthMm: Math.max(100, Math.round(next.widthMm)) }));
  if (Math.round(next.depthMm) !== Math.round(before.depthMm)) patch.thicknessMm = Math.max(5, Math.round(next.depthMm));
  return patch;
}

/** A front shape's face made `w` across and `h` high (either absent = as it is): a hand-drawn face
 *  rescaled, a round one resized whole by whichever changed, any other its width and its height on
 *  the face (`depthMm`). */
function faceResize(shape: ShapePart, curW: number, curH: number, w?: number, h?: number): Partial<ShapePart> {
  if (shape.shape === "custom" && shape.outline && shape.outline.length >= 3) {
    return rescaleOutline(shape.outline, shape.edgeCurves, w ?? curW, h ?? curH);
  }
  if (usesDiameter(shape.shape)) {
    const d0 = shape.diameterMm ?? 0;
    const k = w !== undefined ? w / Math.max(1, curW) : (h ?? curH) / Math.max(1, curH);
    return { diameterMm: Math.max(ELEVATION_MIN_H_MM, Math.round(d0 * k)) };
  }
  return { ...(w !== undefined ? { widthMm: w } : {}), ...(h !== undefined ? { depthMm: h } : {}) };
}

/** The face a tile places in the חזית view — 1.2 × 1.2 m, an arch (a half or a quarter circle, an
 *  arc) ⌀ 2.4 m, a line 2 m long. */
function tileFace(shape: MapShape): Partial<ShapePart> {
  if (shape === "line") return { widthMm: 2000, depthMm: 20 };
  if (usesDiameter(shape)) return { diameterMm: shape === "circle" ? 1200 : 2400 };
  return { widthMm: 1200, depthMm: 1200 };
}

/** A tile clicked on the חזית canvas: a front shape of its kind, its face centred on the click but
 *  never under the floor, standing at plan depth `planY` (from the side, the click's across is its
 *  plan depth and it stands at plan x 0). */
export function placedFront(shape: MapShape, at: { x: number; y: number }, view: ElevationView, planY: number): ShapePart {
  const face = tileFace(shape);
  const h = frontFace(shape, face).h;
  return {
    id: crypto.randomUUID(),
    plane: "front",
    shape,
    ...face,
    thicknessMm: FRONT_THICK_MM,
    x: view === "front" ? Math.round(at.x) : 0,
    y: view === "front" ? Math.round(planY) : Math.round(at.x),
    rotation: 0,
    zMm: Math.max(0, Math.round(-at.y - h / 2)),
  };
}

/** An outline drawn on the חזית canvas (its world: across, −z) as a front shape: drawn by hand, kept
 *  as drawn, its box's middle its place across, its bottom its z (never under the floor), standing at
 *  plan depth `planY`. Null under three points or a box under 10 mm. */
export function drawnFront(outline: readonly Point[], edgeCurves: readonly (EdgeCurve | null)[] | undefined, planY: number, open?: boolean): ShapePart | null {
  if (outline.length < 3) return null;
  const b = sampledBounds([{ outline: [...outline], ...(edgeCurves ? { edgeCurves: [...edgeCurves] } : {}) }]);
  if (b.w < 10 || b.h < 10) return null;
  return {
    id: crypto.randomUUID(),
    plane: "front",
    shape: "custom",
    outline: outline.map((v) => ({ x: Math.round(v.x), y: Math.round(v.y) })),
    ...(edgeCurves ? { edgeCurves: [...edgeCurves] } : {}),
    ...(open ? { open: true } : {}),
    widthMm: Math.round(b.w),
    depthMm: Math.round(b.h),
    thicknessMm: FRONT_THICK_MM,
    x: Math.round(b.cx),
    y: Math.round(planY),
    rotation: 0,
    zMm: Math.max(0, Math.round(-b.maxY)),
  };
}

/** An arrow key in the view: across (→ positive) and up, as the shape's NEW values. The base is
 *  never raised; a zero component is left out. */
export function elevationNudge(shape: ShapePart, index: number, view: ElevationView, dAcrossMm: number, dUpMm: number): Partial<ShapePart> {
  const out: Partial<ShapePart> = {};
  if (dAcrossMm) {
    if (view === "front") out.x = shape.x + dAcrossMm;
    else out.y = shape.y + dAcrossMm;
  }
  if (dUpMm && index > 0) out.zMm = Math.max(0, (shape.zMm ?? 0) + dUpMm);
  return out;
}

/** A body's profile points as handles on the canvas — on its silhouette's right half. */
export function profileHandles(b: ElevationBox): { x: number; y: number }[] {
  const cx = (b.a0 + b.a1) / 2;
  const R = (b.a1 - b.a0) / 2;
  return (b.revolve ?? []).map((p) => ({ x: cx + p.r * R, y: -(b.z + p.z * b.h) }));
}

/** A canvas point as a profile point — its radius off the axis on either side, its height a share
 *  of the box's. Unclamped: movedPoint / addedPoint make it sound. */
export function profilePoint(b: ElevationBox, p: { x: number; y: number }): RevolvePoint {
  const cx = (b.a0 + b.a1) / 2;
  const R = Math.max(1e-9, (b.a1 - b.a0) / 2);
  return { r: Math.abs(p.x - cx) / R, z: (-p.y - b.z) / Math.max(1e-9, b.h) };
}

/** Where a box's own grips stand, in canvas world: its four corners and four edge midpoints. */
export function boxGripSpots(b: ElevationBox): { x: number; y: number }[] {
  const mx = (b.a0 + b.a1) / 2;
  const lo = -b.z;
  const hi = -(b.z + b.h);
  const mid = -(b.z + b.h / 2);
  return [
    { x: b.a0, y: lo }, { x: b.a1, y: lo }, { x: b.a0, y: hi }, { x: b.a1, y: hi },
    { x: mx, y: lo }, { x: mx, y: hi }, { x: b.a0, y: mid }, { x: b.a1, y: mid },
  ];
};

/** Where each silhouette handle is DRAWN: a handle within `radius` of one of the box's own grips (a
 *  cone's floor point at r = 1 sits on the bottom corner, a basin's rim on the top one) is drawn
 *  `radius × 1.6` in toward the axis at `axisX`, beside the grip instead of on it — so the corner
 *  still resizes the box (QA VS-6). The drag reads the press as an offset from where the handle is
 *  shown, so moving it is exact. Every other handle stands on its point. */
export function handleSpots(handles: readonly { x: number; y: number }[], grips: readonly { x: number; y: number }[], radius: number, axisX: number): { x: number; y: number }[] {
  return handles.map((h) => {
    if (!grips.some((g) => Math.hypot(h.x - g.x, h.y - g.y) < radius)) return h;
    const towardAxis = Math.sign(axisX - h.x) || -1;
    return { x: h.x + towardAxis * radius * 1.6, y: h.y };
  });
}

/** A polyline (canvas world) cut into the runs that stand farther than `radius` from every spot —
 *  what a click-to-add band may cover without taking a press from a grip. Sampled finely (every
 *  half radius, so a straight side crossing a grip is cut, not skipped whole). */
export function runsClearOf(line: readonly { x: number; y: number }[], spots: readonly { x: number; y: number }[], radius: number): { x: number; y: number }[][] {
  const step = Math.max(1e-6, radius / 2);
  const samples: { x: number; y: number }[] = [];
  for (let i = 0; i < line.length; i++) {
    samples.push(line[i]);
    if (i === line.length - 1) break;
    const a = line[i];
    const b = line[i + 1];
    const n = Math.min(400, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 1; k < n; k++) samples.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  const runs: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];
  for (const q of samples) {
    if (spots.some((g) => Math.hypot(q.x - g.x, q.y - g.y) < radius)) {
      if (run.length > 1) runs.push(run);
      run = [];
    } else run.push(q);
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

/** The least room kept under the floor line, mm — the quick bar stands over the canvas's foot, and the
 *  floor, the base's bottom grips and the floor figure open above it, not under it. */
export const FLOOR_CLEARANCE_MM = 600;

/** The box the elevation canvas opens on, in its world (across, −z): every shape, the least extent
 *  (centred on the shapes, not on the origin), the floor line, and clearance below the floor for the
 *  bar (a quarter of the frame's height, at least `FLOOR_CLEARANCE_MM`). Y grows down: the top is
 *  negative, the clearance below y = 0 positive. */
export function elevationFrame(boxes: readonly ElevationBox[], minExtentMm: { w: number; h: number }): { minX: number; maxX: number; minY: number; maxY: number } {
  const a0 = boxes.length ? Math.min(...boxes.map((b) => b.a0)) : 0;
  const a1 = boxes.length ? Math.max(...boxes.map((b) => b.a1)) : 0;
  const mid = (a0 + a1) / 2;
  const half = Math.max(minExtentMm.w, a1 - a0) / 2;
  const up = Math.max(minExtentMm.h, ...boxes.map((b) => b.z + b.h));
  const below = Math.max(FLOOR_CLEARANCE_MM, up * 0.25);
  return { minX: mid - half, maxX: mid + half, minY: -up, maxY: below };
}

/** The orthographic camera that draws the item's room under the view, in three's world metres
 *  (lib/scene/frame.ts: plan (x, y, z) mm → (x, z, y) m). */
export interface OrthoFrame {
  position: [number, number, number];
  rotationY: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
}

/** How far the camera stands off the item — inside the scene's near level of detail (22 m). */
const CAMERA_OUT_M = 15;

/** The camera that shows exactly what the canvas shows: `visible` is the canvas's settled world box
 *  (across, −z); the item's room (lib/scene/item-scene.ts) is built about the plan's origin, which on
 *  the canvas is `itemAt`, with the item's own floor `baseZMm` up (a hung item's underside). */
export function orthoFrame(view: ElevationView, visible: { minX: number; minY: number; w: number; h: number }, itemAt: { x: number; y: number }, baseZMm: number): OrthoFrame {
  const off = view === "front" ? itemAt.x : itemAt.y;
  return {
    position: view === "front" ? [0, 0, CAMERA_OUT_M] : [-CAMERA_OUT_M, 0, 0],
    rotationY: view === "front" ? 0 : -Math.PI / 2,
    left: (visible.minX - off) / 1000,
    right: (visible.minX + visible.w - off) / 1000,
    top: (-visible.minY + baseZMm) / 1000,
    bottom: (-(visible.minY + visible.h) + baseZMm) / 1000,
    near: 0.1,
    far: 60,
  };
}
