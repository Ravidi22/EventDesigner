// The curated camera's arithmetic, kept out of the React/three file (./scene-camera.tsx) so
// `check:scene-viewer` (./smoke.ts) can hold it under Node: the head-turn about a fixed eye, the
// field-of-view zoom, the ease back to centre, whether a fly is worth flying, and where a paused
// tour picks up. Plan mm with z up (lib/scene/types.ts), the frame every viewpoint is stored in.
// No three here, no DOM.
//
// THE HEAD. A client never walks (spec §5.1, DECIDE 1): between flights they may turn their head
// ±35° and tilt it ±20° from the viewpoint's own look direction, and zoom the field of view a
// little. A drag is "grab the room": the room follows the finger, so dragging right turns the head
// LEFT — a pixel of drag is a pixel of the room, at the current field of view. Released, the head
// stays where it was left; it eases back to centre only when a new viewpoint is chosen.
import type { Tour, Vec3, Viewpoint } from "@/lib/scene/types";
import { DEFAULT_FOV_DEG, vec3 } from "@/lib/scene/types";

export const HEAD_YAW_MAX_DEG = 35;
export const HEAD_PITCH_MAX_DEG = 20;
/** The zoom's range. A viewpoint saved outside it keeps its own field of view; the zoom never
 *  takes it further out of the range than it already is. */
export const FOV_MIN_DEG = 40;
export const FOV_MAX_DEG = 70;
/** How long the head takes to come back to centre when a new viewpoint is chosen. */
export const RECENTRE_MS = 600;
/** A tap on a chip: the fly's length. (A tour leg flies its own `travelMs`.) */
export const CHIP_TRAVEL_MS = 1200;
/** Field of view per wheel pixel. A notch of a mouse wheel (~100 px) is 3°. */
export const WHEEL_DEG_PER_PX = 0.03;
/** The elevation a look direction is kept inside, so a tilt never flips the view over the pole. */
const MAX_ELEVATION_DEG = 85;

const rad = (deg: number) => (deg * Math.PI) / 180;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Where the eye is, what it looks at (plan mm, z up) and the vertical field of view on screen —
 *  everything a Viewpoint saves. What the viewer reports through `onCamera`. Here, in the pure
 *  file, so a screen can name it without importing a three module. */
export interface CameraPose {
  eye: Vec3;
  look: Vec3;
  fovDeg: number;
}

/** The head's offset from the viewpoint it stands at. Yaw: + turns LEFT as the viewer sees it.
 *  Pitch: + looks UP. Fov: added to the viewpoint's own field of view. */
export interface Head {
  yawDeg: number;
  pitchDeg: number;
  fovDeltaDeg: number;
}

export const CENTRED: Head = { yawDeg: 0, pitchDeg: 0, fovDeltaDeg: 0 };

export const isCentred = (h: Head) => h.yawDeg === 0 && h.pitchDeg === 0 && h.fovDeltaDeg === 0;

/** The field of view the zoom gives over a viewpoint's own `baseFov`: inside [40°, 70°], widened
 *  to include `baseFov` itself when the viewpoint was saved outside it. */
export function zoomedFov(baseFov: number, deltaDeg: number): number {
  return clamp(baseFov + deltaDeg, Math.min(FOV_MIN_DEG, baseFov), Math.max(FOV_MAX_DEG, baseFov));
}

/** The aspect a viewpoint is composed for — a laptop's canvas. */
export const COMPOSED_ASPECT = 16 / 10;
const FIT_FOV_MAX_DEG = 100;

/** A viewpoint's vertical field of view on a canvas of `aspect`: unchanged on one as wide as the
 *  view was composed for, widened on a narrower one so the same breadth of room is in frame. On a
 *  phone held upright the composed 55° showed a slice of the hall (seen headless, 2026-10-23). */
export function fitFov(verticalDeg: number, aspect: number): number {
  if (!(aspect > 0) || aspect >= COMPOSED_ASPECT) return verticalDeg;
  const rad = (d: number) => (d * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(rad(verticalDeg) / 2) * COMPOSED_ASPECT);
  const fitted = (2 * Math.atan(Math.tan(horizontal / 2) / aspect) * 180) / Math.PI;
  return Math.min(FIT_FOV_MAX_DEG, Math.max(verticalDeg, fitted));
}

/** The head held to its limits: yaw ±35°, pitch ±20°, and a zoom inside its range. */
export function clampHead(h: Head, baseFov: number): Head {
  return {
    yawDeg: clamp(h.yawDeg, -HEAD_YAW_MAX_DEG, HEAD_YAW_MAX_DEG),
    pitchDeg: clamp(h.pitchDeg, -HEAD_PITCH_MAX_DEG, HEAD_PITCH_MAX_DEG),
    fovDeltaDeg: zoomedFov(baseFov, h.fovDeltaDeg) - baseFov,
  };
}

/** The look point after turning the head about the eye: the base direction's plan heading turned
 *  by the yaw, its elevation tilted by the pitch, at the same distance. A LEFT turn is a smaller
 *  plan angle — plan angles run clockwise as drawn (lib/scene/frame.ts), and toWorld's (x, y, z) →
 *  (x, z, y) makes that three's counter-clockwise about +y, which is a left turn for a camera. */
export function turnedLook(eye: Vec3, look: Vec3, yawDeg: number, pitchDeg: number): Vec3 {
  if (yawDeg === 0 && pitchDeg === 0) return look;
  const dx = look.x - eye.x;
  const dy = look.y - eye.y;
  const dz = look.z - eye.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-6) return look;
  const heading = Math.atan2(dy, dx) - rad(yawDeg);
  const elevation = clamp(Math.atan2(dz, Math.hypot(dx, dy)) + rad(pitchDeg), -rad(MAX_ELEVATION_DEG), rad(MAX_ELEVATION_DEG));
  const flat = Math.cos(elevation) * dist;
  return vec3(eye.x + Math.cos(heading) * flat, eye.y + Math.sin(heading) * flat, eye.z + Math.sin(elevation) * dist);
}

/** The head a drag leaves: the room follows the finger. `start` is the head at the press, `dx`/`dy`
 *  the pointer's travel in screen px, `heightPx` the viewer's height and `fovDeg` the vertical
 *  field of view on screen — so a pixel of drag turns the head by a pixel's worth of the view. */
export function dragHead(start: Head, dxPx: number, dyPx: number, heightPx: number, fovDeg: number, baseFov: number): Head {
  const k = fovDeg / Math.max(1, heightPx);
  return clampHead({ yawDeg: start.yawDeg + dxPx * k, pitchDeg: start.pitchDeg + dyPx * k, fovDeltaDeg: start.fovDeltaDeg }, baseFov);
}

/** The head a wheel step leaves: scrolling down (deltaY > 0) widens the view, up narrows it. */
export function wheelHead(h: Head, deltaY: number, baseFov: number): Head {
  return clampHead({ ...h, fovDeltaDeg: h.fovDeltaDeg + deltaY * WHEEL_DEG_PER_PX }, baseFov);
}

/** The head a two-finger pinch leaves: fingers apart narrow the view (closer), together widen it,
 *  in proportion to the distance between them since the pinch began. */
export function pinchHead(start: Head, startDistPx: number, distPx: number, baseFov: number): Head {
  if (startDistPx <= 0 || distPx <= 0) return start;
  const startFov = zoomedFov(baseFov, start.fovDeltaDeg);
  return clampHead({ ...start, fovDeltaDeg: (startFov * startDistPx) / distPx - baseFov }, baseFov);
}

/** Ease in and out (smoothstep), as lib/scene/viewpoints.ts eases a fly. */
const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/** The head `elapsedMs` into its return to centre from `from`; CENTRED from RECENTRE_MS on. */
export function easedHead(from: Head, elapsedMs: number): Head {
  const k = 1 - smooth(elapsedMs / RECENTRE_MS);
  if (k <= 0) return CENTRED;
  return { yawDeg: from.yawDeg * k, pitchDeg: from.pitchDeg * k, fovDeltaDeg: from.fovDeltaDeg * k };
}

/** Two poses the eye could not tell apart — a fly between them is skipped (saving the view the
 *  camera stands at lights its row without a 1.2 s fly that goes nowhere). */
export function samePose(a: Viewpoint, b: Viewpoint, epsMm = 1): boolean {
  const near = (p: Vec3, q: Vec3) => Math.abs(p.x - q.x) < epsMm && Math.abs(p.y - q.y) < epsMm && Math.abs(p.z - q.z) < epsMm;
  return near(a.eye, b.eye) && near(a.look, b.look) && Math.abs((a.fovDeg ?? DEFAULT_FOV_DEG) - (b.fovDeg ?? DEFAULT_FOV_DEG)) < 0.05;
}

/** Where the camera stands relative to the tour when ▶ is pressed. */
export interface TourPlace {
  /** The tour stop last flown to by the tour itself (index into tour.stops), or null when a chip
   *  or the designer's camera moved it since. */
  stop: number | null;
  /** The viewpoint the camera stands at or is flying to. */
  viewpointId: string | null;
  /** Whether it got there. */
  arrived: boolean;
}

/** The stop ▶ starts from: the one after the stop the camera is resting at, or the one it was
 *  flying to when ⏸ stopped it mid-air, or — when the camera stands somewhere the tour does not —
 *  the first. A finished one-way tour starts again from the first. */
export function resumeStop(tour: Tour, at: TourPlace): number {
  const n = tour.stops.length;
  if (!n) return 0;
  let i = at.stop !== null && at.stop < n && tour.stops[at.stop].viewpointId === at.viewpointId ? at.stop : -1;
  if (i < 0 && at.viewpointId) i = tour.stops.findIndex((s) => s.viewpointId === at.viewpointId);
  if (i < 0) return 0;
  if (!at.arrived) return i;
  // Resting on the last stop: a loop goes round to the first, and so does a finished one-way tour.
  return i + 1 < n ? i + 1 : 0;
}

/** The tour played from stop `start`: a looping tour turned round so `start` comes first (and the
 *  stops before it follow); a one-way tour cut to `start` onwards. `indexOf` maps a played stop
 *  back to its index in the designer's tour — what lights the chip. */
export function tourFrom(tour: Tour, start: number): { tour: Tour; indexOf: (played: number) => number } {
  const n = tour.stops.length;
  const s = n ? ((start % n) + n) % n : 0;
  if (!s) return { tour, indexOf: (k) => k };
  const stops = tour.loop ? [...tour.stops.slice(s), ...tour.stops.slice(0, s)] : tour.stops.slice(s);
  return { tour: { stops, loop: tour.loop }, indexOf: (k) => (tour.loop ? (k + s) % n : k + s) };
}
