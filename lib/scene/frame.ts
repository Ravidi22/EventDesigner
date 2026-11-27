// The one place that knows how the plan's frame becomes three.js's, and how frames nest.
//
// Plan: x right, +y DOWN the plan, angles clockwise, order translate · rotate · mirror · scale —
// the SVG world canvas-stage draws (canvas-stage.tsx:3990). three.js: y up, right-handed. The
// mapping is (x, y, z) → (x, z, y) in metres with the rotation's sign flipped; viewed from above
// with the camera's up = −z it reproduces the plan unmirrored. `check:scene-frame` holds that,
// and holds `compose` to `fromTableFrame` (lib/design-document/dressing.ts), which is the same
// arithmetic the canvas and the printed map place a chip on a table with.
import type { Point } from "@/lib/studio/hall";
import type { Seat } from "@/lib/studio/seating";
import { type Transform, type Vec3, transform, vec3 } from "./types";

export const MM_PER_M = 1000;

export const rad = (deg: number) => (deg * Math.PI) / 180;

/** A table's or placement's transform in the room: `position` is its centre, `rotation` its
 *  clockwise turn, `scale` a placement's drawing scale; `z` the height of its own floor. */
export function roomTransform(p: { position: Point; rotation?: number; mirrored?: boolean; scale?: number }, z = 0): Transform {
  return transform(vec3(p.position.x, p.position.y, z), p.rotation ?? 0, !!p.mirrored, p.scale ?? 1);
}

/** A point in `t`'s own frame, carried into the frame `t` stands in: scale, mirror (x → −x),
 *  spin, lean, rotate, translate. Heights add; nothing scales z. */
export function applyTransform(t: Transform, p: Vec3): Vec3 {
  const s = t.scale ?? 1;
  let x0 = (t.mirrored ? -p.x : p.x) * s;
  let y0 = p.y * s;
  let z0 = p.z;
  if (t.spinDeg) ({ x: x0, y: y0 } = turn({ x: x0, y: y0 }, t.spinDeg));
  if (t.tiltDeg) {
    // About x, the top toward +y: (0, 0, 1) → (0, sin, cos).
    const ct = Math.cos(rad(t.tiltDeg));
    const st = Math.sin(rad(t.tiltDeg));
    [y0, z0] = [y0 * ct + z0 * st, -y0 * st + z0 * ct];
  }
  const c = Math.cos(rad(t.rotationDeg));
  const sn = Math.sin(rad(t.rotationDeg));
  return { x: t.at.x + x0 * c - y0 * sn, y: t.at.y + x0 * sn + y0 * c, z: t.at.z + z0 };
}

/** `inner` expressed in `outer`'s frame → one transform in the frame `outer` stands in. A mirrored
 *  outer turns the inner's rotation the other way (a mirror conjugates a rotation) and two mirrors
 *  cancel — exactly what nesting an SVG <g> inside a mirrored <g> does. An inner lean is carried as
 *  it is (a mirror across x and a turn about z both commute with a lean about x) and its spin turns
 *  the other way under a mirror, like its rotation; the outer is never leaning itself (a head leans
 *  inside an arrangement, an arrangement stands upright on its table). An outer drawing scale is
 *  applied in the leaning head's own frame — exact at 1, the drawing size of a scaled placement
 *  otherwise. */
export function compose(outer: Transform, inner: Transform): Transform {
  const mirrored = !!outer.mirrored !== !!inner.mirrored;
  const rotationDeg = outer.rotationDeg + (outer.mirrored ? -inner.rotationDeg : inner.rotationDeg);
  const out = transform(applyTransform(outer, inner.at), rotationDeg, mirrored, (outer.scale ?? 1) * (inner.scale ?? 1));
  if (inner.tiltDeg) out.tiltDeg = inner.tiltDeg;
  if (inner.spinDeg) out.spinDeg = outer.mirrored ? -inner.spinDeg : inner.spinDeg;
  return out;
}

/** A chair at a seat of the table whose transform is `table`. A `Seat` faces the table along
 *  `facingDeg` (0 = +x) in the table's frame; a chair body is drawn with its back at −y and its
 *  front at +y (lib/catalog/symbols.ts `chair()`), so the chair turns `facingDeg − 90` to put its
 *  front on the seat's facing — the −90 SeatChair applies on the plan. */
export function seatTransform(table: Transform, seat: Pick<Seat, "x" | "y" | "facingDeg">, z = 0): Transform {
  return compose(table, transform(vec3(seat.x, seat.y, z), seat.facingDeg - 90));
}

/** The direction (clockwise degrees, 0 = +x) from `a` to `b` on the plan. */
export function headingDeg(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/** A point turned `deg` clockwise about the origin. */
export function turn(p: Point, deg: number): Point {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

// --- the mapping into three.js --------------------------------------------------------------------

/** Plan mm with z up → three.js metres, y up. The ONLY place this is written. */
export function toWorld(v: Vec3): [number, number, number] {
  return [v.x / MM_PER_M, v.z / MM_PER_M, v.y / MM_PER_M];
}

/** A plan rotation (clockwise on the plan) as a three.js rotation about +y. */
export function worldRotationY(deg: number): number {
  return -rad(deg);
}

/** The inverse of `toWorld`: three.js metres back to plan mm — what a camera's position becomes
 *  when it is saved as a viewpoint. Written beside `toWorld` so the two can only change together. */
export function fromWorld(x: number, y: number, z: number): Vec3 {
  return vec3(x * MM_PER_M, z * MM_PER_M, y * MM_PER_M);
}
