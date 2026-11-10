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
import type { RevolvePoint, ShapePart } from "@/lib/catalog/types";
import { placedPartOutline, sampledBounds } from "@/lib/studio/footprint";
import { REVOLVE_PRESETS, cleanRevolve } from "./revolve";
import { isMain } from "../self-check";

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

/** Every shape as its box in the view, in list order. */
export function elevationBoxes(shapes: readonly ShapePart[], itemHeightMm: number, view: ElevationView): ElevationBox[] {
  return shapes.map((s, index) => {
    const b = sampledBounds([placedPartOutline(s)]);
    const base = index === 0;
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

if (isMain(import.meta.url)) {
  const assert = (ok: boolean, what: string) => {
    if (!ok) throw new Error("FAIL: " + what);
    console.log(`  ok   ${what}`);
  };
  // The proving bar (spec 2026-11-07-element-model §13): a counter 300×60, a back-bar 90 cm behind
  // it 2 m tall, a shelf on the back-bar's face at 1 m.
  const bar: ShapePart[] = [
    { id: "counter", shape: "rect", widthMm: 3000, depthMm: 600, x: 0, y: 0, rotation: 0 },
    { id: "back", shape: "rect", widthMm: 3000, depthMm: 400, x: 0, y: -900, rotation: 0, zMm: 0, heightMm: 2000 },
    { id: "shelf", shape: "rect", widthMm: 3000, depthMm: 250, x: 0, y: -600, rotation: 0, zMm: 1000, heightMm: 40 },
  ];
  const fb = elevationBoxes(bar, 1100, "front");
  assert(fb[0].a0 === -1500 && fb[0].a1 === 1500 && fb[0].z === 0 && fb[0].h === 1100, "the base stands on the floor, as tall as the item");
  assert(fb[2].z === 1000 && fb[2].h === 40, "the shelf at its own height");
  const sb = elevationBoxes(bar, 1100, "side");
  assert(sb[1].a0 === -1100 && sb[1].a1 === -700, "seen from the side, across is plan y");
  const up = rectEdit(bar[2], fb[2], { ...boxRect(fb[2]), y: boxRect(fb[2]).y - 200 }, "front");
  assert(up.patch.zMm === 1200 && up.patch.heightMm === undefined && up.patch.x === undefined, "dragged up 20 cm — its height untouched");
  const follows = elevationBoxes([bar[0], { ...bar[1], heightMm: undefined }], 1100, "front")[1];
  const raised = rectEdit({ ...bar[1], heightMm: undefined }, follows, { ...boxRect(follows), y: boxRect(follows).y - 300 }, "front");
  assert(raised.patch.zMm === 300 && !("heightMm" in raised.patch), "a part that follows the item's height is not pinned by a move");
  const r0 = boxRect(fb[0]);
  const taller = rectEdit(bar[0], fb[0], { ...r0, y: r0.y - 150, depthMm: r0.depthMm + 300 }, "front");
  assert(taller.itemHeightMm === 1400 && taller.patch.zMm === undefined, "the base's top edge is the item's height");
  const lifted = rectEdit(bar[0], fb[0], { ...r0, y: r0.y - 500 }, "front");
  assert(lifted.itemHeightMm === undefined && lifted.patch.zMm === undefined, "the base never leaves the floor");
  const sunk = rectEdit(bar[2], fb[2], { ...boxRect(fb[2]), y: 100 }, "front");
  assert(sunk.patch.zMm === 0, "nothing goes under the floor");
  const thin = rectEdit(bar[2], fb[2], { ...boxRect(fb[2]), depthMm: 2 }, "front");
  assert(thin.patch.heightMm === ELEVATION_MIN_H_MM, "a height never goes under 10 mm");
  // A bottom-edge resize keeps the top where it was (review F1).
  const sr = boxRect(fb[2]);
  const underFloor = rectEdit(bar[2], fb[2], { ...sr, y: -470, depthMm: 1140 }, "front");
  assert(underFloor.patch.zMm === 0 && underFloor.patch.heightMm === 1040, "a shelf's bottom pulled under the floor stops at 0 and keeps its top");
  const bottomUp = rectEdit(bar[2], fb[2], { ...sr, y: -1030, depthMm: 20 }, "front");
  assert(bottomUp.patch.zMm === 1020 && bottomUp.patch.heightMm === 20, "a shelf's bottom pulled up 20 mm raises it and shortens it from below");
  const bottomDown = rectEdit(bar[0], fb[0], { ...r0, y: -450, depthMm: 1300 }, "front");
  assert(bottomDown.itemHeightMm === undefined && bottomDown.patch.zMm === undefined, "the base's bottom grip pulled down changes no height");
  const bottomUpBase = rectEdit(bar[0], fb[0], { ...r0, y: -700, depthMm: 800 }, "front");
  assert(bottomUpBase.itemHeightMm === undefined && bottomUpBase.patch.zMm === undefined, "…nor pulled up");
  const topMoved = rectEdit(bar[0], fb[0], { ...r0, y: -700, depthMm: 1400 }, "front");
  assert(topMoved.itemHeightMm === 1400, "the base's top edge moved is the item's new height");
  assert(sunk.patch.heightMm === undefined, "a shelf carried under the floor is not shortened");
  const turned = { ...bar[1], rotation: 45 };
  const tb = elevationBoxes([bar[0], turned], 1100, "front")[1];
  assert(tb.across === null && rectEdit(turned, tb, { ...boxRect(tb), widthMm: boxRect(tb).widthMm + 400 }, "front").patch.widthMm === undefined, "a turned shape's width is not rewritten across");
  const slid = rectEdit(bar[1], sb[1], { ...boxRect(sb[1]), x: boxRect(sb[1]).x + 100 }, "side");
  assert(slid.patch.y === -800 && slid.patch.x === undefined, "slid across in the side view moves plan y");
  assert(fb[1].across === "width" && sb[1].across === "depth", "an unturned rect is resized across by its width in front, its depth from the side");
  const wider = rectEdit(bar[1], fb[1], { ...boxRect(fb[1]), widthMm: 3400 }, "front");
  assert(wider.patch.widthMm === 3400, "…and the width is written");

  // A vase on the plan: a circle with a body; the handles sit on its silhouette's right half.
  const vase: ShapePart = { id: "vase", shape: "circle", diameterMm: 600, x: 0, y: 0, rotation: 0, revolve: REVOLVE_PRESETS.vase };
  const vb = elevationBoxes([vase], 900, "front")[0];
  assert(vb.across === "diameter" && !!vb.revolve, "a round body is a silhouette, resized by its diameter");
  const handles = profileHandles(vb);
  const want = cleanRevolve(REVOLVE_PRESETS.vase)[3];
  const got = profilePoint(vb, handles[3]);
  assert(handles.length === REVOLVE_PRESETS.vase.length &&Math.abs(got.r - want.r) < 1e-3 && Math.abs(got.z - want.z) < 1e-3, "a profile handle reads back to its point");
  assert(profilePoint(vb, { x: -handles[3].x, y: handles[3].y }).r === got.r, "the left half reads the same radius");

  // The click-to-add band is cut round the box's own grips: a basin's right side runs along the
  // box's edge (r = 1), through its edge-midpoint grip and up to the top-right corner.
  const basin = elevationBoxes([{ ...vase, revolve: REVOLVE_PRESETS.basin }], 900, "front")[0];
  const rim = profileHandles(basin);
  const gripRadius = 12;
  const cutRuns = runsClearOf(rim, boxGripSpots(basin), gripRadius);
  const mid = { x: basin.a1, y: -(basin.z + basin.h / 2) };
  const corner = { x: basin.a1, y: -(basin.z + basin.h) };
  const covered = (q: { x: number; y: number }) => cutRuns.some((r) => r.some((m) => Math.hypot(m.x - q.x, m.y - q.y) < 1e-6));
  const nearGrip = cutRuns.flat().some((m) => Math.hypot(m.x - mid.x, m.y - mid.y) < gripRadius || Math.hypot(m.x - corner.x, m.y - corner.y) < gripRadius);
  assert(cutRuns.length >= 2 && !nearGrip && !covered(mid) && !covered(corner), "a basin's right side is cut at the edge-midpoint grip and the top-right corner");
  assert(runsClearOf(rim, [], gripRadius).length === 1, "with no grips near, the side is one run");

  const n = elevationNudge(bar[2], 2, "front", 10, 50);
  assert(n.x === 10 && n.zMm === 1050 && n.y === undefined, "nudged across and up");
  const nb = elevationNudge(bar[0], 0, "front", 0, 50);
  assert(nb.zMm === undefined && nb.x === undefined, "the base is never nudged off the floor");
  assert(elevationNudge(bar[2], 2, "side", 10, 0).y === -590, "a side nudge moves plan y");

  const front = orthoFrame("front", { minX: -2000, minY: -2500, w: 4000, h: 3000 }, { x: 100, y: 0 }, 0);
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  assert(near(front.left, -2.1) && near(front.right, 1.9) && near(front.top, 2.5) && near(front.bottom, -0.5) && front.rotationY === 0 && front.position[2] > 0, "the front camera frames what the canvas shows");
  const hung = orthoFrame("front", { minX: -2000, minY: -2500, w: 4000, h: 3000 }, { x: 100, y: 0 }, 2800);
  assert(near(hung.top, 5.3), "a hung item's floor is its underside");
  const side = orthoFrame("side", { minX: -2000, minY: -2500, w: 4000, h: 3000 }, { x: 0, y: 300 }, 0);
  assert(side.rotationY === -Math.PI / 2 && side.position[0] < 0 && near(side.left, (-2000 - 300) / 1000), "the side camera looks along +x from the item's −x end");
  // The opening frame keeps the floor above the bar and is centred on the shapes (review F4).
  const offCentre = elevationBoxes([{ id: "p", shape: "rect", widthMm: 600, depthMm: 600, x: 3000, y: 0, rotation: 0 }], 750, "front");
  const fr = elevationFrame(offCentre, { w: 2000, h: 2000 });
  assert(fr.minX === 2000 && fr.maxX === 4000 && fr.minY === -2000, "the frame is centred on the shapes' across extent, not on the origin");
  assert(fr.maxY >= FLOOR_CLEARANCE_MM && fr.maxY >= (fr.maxY - fr.minY) * 0.2, "room is kept under the floor line for the bar");
  const wide = elevationFrame(fb, { w: 2000, h: 2000 });
  assert(wide.minX === -1500 && wide.maxX === 1500 && wide.maxY === 600, "a wide item is framed to its own extent");
  console.log("elevation self-check passed");
}
