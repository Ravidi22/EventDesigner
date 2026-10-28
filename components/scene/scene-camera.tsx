"use client";
// The camera, both modes, and everything that moves it: the fly to a viewpoint, the guided tour,
// and the client's head-turn.
//
// AUTHOR (the designer's tab): drei's OrbitControls (orbit, pan along the floor, dolly) with the
// eye held above the floor. Choosing a viewpoint FLIES the orbit camera there — position, look
// point and field of view — with the controls switched off for the flight and handed back at the
// end, their target on the look point. A press or a wheel on the canvas mid-flight (or mid-tour)
// lets go at once: the controls take the very press that interrupted it. When the designer moves
// the camera off a viewpoint by hand, `onLeave` says so, so the same row can be chosen again.
//
// The designer is never tied to the middle of the venue (2026-10-27, the user: "not stuck to the
// center — I want to move and focus"): the wheel zooms toward the point under the cursor, a DOUBLE-
// CLICK flies to whatever was clicked (a table, a corner of the lawn) and orbits it from there, and
// WASD / the arrows walk the camera and its orbit point together along the floor (Q/E down/up,
// Shift faster) — physical keys, so a Hebrew layout walks too, and never while a field has focus.
//
// CURATED (the meeting, the client): no controls. The camera stands at the active viewpoint; a drag
// turns the head about the eye (yaw ±35°, pitch ±20°, ./camera-rules.ts), a wheel or a two-finger
// pinch zooms the field of view between 40° and 70°, and nothing moves the eye but a viewpoint.
// Released, the head stays turned; it eases back to centre over 600 ms only when a new viewpoint
// is chosen (a chip, a tour leg, or `recentre` — the active chip tapped again).
//
// THE FLY is lib/scene/viewpoints.ts's `flyPose(from, to, t, crossesZones(from, to, zones))`, from
// the camera's pose when the fly began (built from the camera through `fromWorld`; in curated mode
// the pose WITHOUT the head, which eases out on its own clock), over the leg's travel time — 1.2 s
// for a chip. THE TOUR is `tourAt(tour, elapsed)` on a clock started when ▶ is pressed, flying
// from wherever the camera is into the first stop played, then leg to leg; ⏸ leaves the camera
// where it is, and ▶ again carries on from the next stop (`resumeStop`). A hidden tab freezes the
// clock and the clock is moved on by the time it was hidden, so the tour resumes where it was.
//
// NOTHING HERE IS REACT STATE. The pose, the head, the fly and the tour clock live in refs; a frame
// is requested (`invalidate()`) every frame ONLY while something is in motion — flying, easing the
// head back, or a tour leg in the air. A tour's dwell sleeps on a timer and wakes the canvas when
// the next leg is due, so a resting tour draws nothing. The one callback per leg is `onTourStep`.
// Every pose is in plan mm (lib/scene/types.ts) and enters three through `toWorld` alone.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { type Camera, type Object3D, type PerspectiveCamera, Plane, Raycaster, type Scene as ThreeScene, Vector2, Vector3 } from "three";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { Bounds } from "@/lib/studio/geometry";
import type { ResolvedZone } from "@/lib/venues/zone";
import { startPointerGesture } from "@/lib/studio/gesture";
import { MM_PER_M, fromWorld as planFromWorld, toWorld } from "@/lib/scene/frame";
import { DEFAULT_FOV_DEG, type Tour, type Vec3, type Viewpoint } from "@/lib/scene/types";
import { crossesZones, flyPose, overview, tourAt, tourSchedule } from "@/lib/scene/viewpoints";
import {
  CENTRED,
  CHIP_TRAVEL_MS,
  COMPOSED_ASPECT,
  type CameraPose,
  type Head,
  type TourPlace,
  dragHead,
  easedHead,
  isCentred,
  pinchHead,
  resumeStop,
  samePose,
  tourFrom,
  turnedLook,
  fitFov,
  wheelHead,
  zoomedFov,
} from "./camera-rules";

export type { CameraPose } from "./camera-rules";

export interface SceneCameraProps {
  mode: "author" | "curated";
  bounds: Bounds;
  /** Accepted for an indoor rig; nothing reads it yet. */
  roofedMm?: number | null;
  viewpoints: Viewpoint[];
  /** Every zone on the property (EventPlan.all): a fly between two of them lifts over the wall. */
  zones: ResolvedZone[];
  /** The viewpoint the camera should be at. Changing it flies there (unless a tour is playing —
   *  the tour drives, and the screen echoes its steps back into this). */
  activeId: string | null;
  /** Bumped when the active viewpoint is chosen again: the head comes back to centre (curated), or
   *  the camera flies back onto it (author). */
  recentre?: number;
  tour: Tour | null;
  playing: boolean;
  /** The tour reached a new leg: `index` is into `tour.stops` as it was when ▶ was pressed, and
   *  `viewpointId` is the stop's viewpoint (so a tour edited mid-play still lights the right chip).
   *  Once per leg, never per frame. */
  onTourStep?: (index: number, viewpointId: string) => void;
  /** The tour stopped by itself — a one-way tour finished, its viewpoint vanished, or the
   *  designer grabbed the camera. The screen flips ▶ back. */
  onTourEnd?: () => void;
  /** Author: the designer moved the camera off the active viewpoint by hand. */
  onLeave?: () => void;
  /** The pose, at most once per animation frame, through refs. Both modes: the meeting saves a
   *  view from the curated camera, head-turn and zoom included. */
  onCamera?: (pose: CameraPose) => void;
}

interface Pose {
  eye: Vec3;
  look: Vec3;
  fovDeg: number;
}

interface Fly {
  from: Viewpoint;
  to: Viewpoint;
  start: number;
  ms: number;
  cross: boolean;
}

interface TourRun {
  tour: Tour;
  indexOf: (played: number) => number;
  legs: ReturnType<typeof tourSchedule>["legs"];
  totalMs: number;
  start: number;
  /** The played leg and loop cycle last seen, to tell a new leg from the same one. */
  leg: number;
  cycle: number;
  legFrom: Viewpoint;
  cross: boolean;
  hiddenAt: number | null;
}

const MIN_EYE_M = 0.3;
/** A double-click's fly: how far from the clicked point the eye lands (a share of where it was,
 *  within these metres), the slope it looks down at, and how long it takes. */
const FOCUS_SHARE = 0.4;
const FOCUS_MIN_M = 2.5;
const FOCUS_MAX_M = 10;
const FOCUS_PITCH_MIN_DEG = 18;
const FOCUS_PITCH_MAX_DEG = 60;
const FOCUS_MS = 800;
/** Walking: metres a second for each metre the eye stands from its orbit point (so a step from far
 *  away crosses the venue and a step at a table is a step), within these, and Shift's multiple. */
const WALK_PER_M = 0.9;
const WALK_MIN_M_S = 1.5;
const WALK_MAX_M_S = 30;
const WALK_FAST = 2.5;
/** A walking key → (forward, right, up). */
const WALK_KEYS: Record<string, readonly [number, number, number]> = {
  KeyW: [1, 0, 0],
  ArrowUp: [1, 0, 0],
  KeyS: [-1, 0, 0],
  ArrowDown: [-1, 0, 0],
  KeyA: [0, -1, 0],
  ArrowLeft: [0, -1, 0],
  KeyD: [0, 1, 0],
  ArrowRight: [0, 1, 0],
  KeyQ: [0, 0, -1],
  KeyE: [0, 0, 1],
};

/** Whether a key went to something that types or picks — a field, a select, a menu row. */
function typingInto(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || el === document.body) return false;
  return !!el.closest?.("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='listbox'], [role='menu'], [role='radiogroup'], dialog");
}

/** Where a ray from the eye first meets something real: a drawn mesh (not a hidden far box, not a
 *  halo, not the sky), else the floor plane. World metres; null when the ray points at the sky. */
function pickPoint(raycaster: Raycaster, scene: ThreeScene): Vector3 | null {
  const shown = (o: Object3D | null): boolean => {
    for (let p = o; p; p = p.parent) if (!p.visible || p.userData.noPick) return false;
    return true;
  };
  for (const hit of raycaster.intersectObject(scene, true)) {
    if ((hit.object as { isMesh?: boolean }).isMesh && shown(hit.object)) return hit.point.clone();
  }
  const floor = new Vector3();
  return raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), floor) && raycaster.ray.direction.y < 0 ? floor : null;
}
/** The smallest plan the opening view frames, so an empty or one-table plan is not seen from
 *  a hand's breadth away. */
const MIN_FRAME_MM = 4000;

/** three metres → plan mm: the frame module's inverse of `toWorld` (lib/scene/frame.ts). */

/** The camera's frame callback runs first (negative: fiber sorts ascending, and only a positive
 *  priority takes the render over). */
const CAMERA_FIRST = -1;
export function fromWorld(p: Vector3): Vec3 {
  return planFromWorld(p.x, p.y, p.z);
}

const asPerspective = (c: Camera): PerspectiveCamera | null => ((c as PerspectiveCamera).isPerspectiveCamera ? (c as PerspectiveCamera) : null);

/** The opening view when no viewpoint is chosen: the defaults' own "מבט על" (lib/scene/viewpoints.ts
 *  `overview`) — from the plan's +y side, so the room reads the way the plan is drawn — over a
 *  frame of at least MIN_FRAME_MM. */
export function overviewPose(bounds: Bounds): CameraPose {
  const grow = (min: number, max: number, size: number) => {
    if (size >= MIN_FRAME_MM) return [min, max, size] as const;
    const mid = (min + max) / 2;
    return [mid - MIN_FRAME_MM / 2, mid + MIN_FRAME_MM / 2, MIN_FRAME_MM] as const;
  };
  const [minX, maxX, widthMm] = grow(bounds.minX, bounds.maxX, bounds.widthMm);
  const [minY, maxY, heightMm] = grow(bounds.minY, bounds.maxY, bounds.heightMm);
  const v = overview({ minX, maxX, minY, maxY, widthMm, heightMm });
  return { eye: v.eye, look: v.look, fovDeg: v.fovDeg ?? DEFAULT_FOV_DEG };
}

const boundsKey = (b: Bounds) => `${b.minX},${b.minY},${b.maxX},${b.maxY}`;
const poseOf = (v: Viewpoint): Pose => ({ eye: v.eye, look: v.look, fovDeg: v.fovDeg ?? DEFAULT_FOV_DEG });
const asViewpoint = (p: Pose, id = ""): Viewpoint => ({ id, name: "", eye: p.eye, look: p.look, fovDeg: p.fovDeg });

export function SceneCamera(props: SceneCameraProps) {
  const { mode, bounds, activeId, recentre, viewpoints, playing } = props;
  // The camera and the renderer are read through `get()` inside the callbacks that move them — the
  // three objects are mutated every frame, which is what they are for, and never during render.
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const key = boundsKey(bounds);
  const maxDistance = useMemo(() => Math.max(40, (Math.hypot(bounds.widthMm, bounds.heightMm) / MM_PER_M) * 4), [bounds.widthMm, bounds.heightMm]);

  // The latest props, for the frame loop and the DOM listeners — written after each render, read
  // only from callbacks.
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  const [opening] = useState(() => overviewPose(bounds));
  const base = useRef<Pose>(opening);
  const head = useRef<Head>(CENTRED);
  const recentring = useRef<{ from: Head; start: number } | null>(null);
  const fly = useRef<Fly | null>(null);
  const tour = useRef<TourRun | null>(null);
  const place = useRef<TourPlace>({ stop: null, viewpointId: null, arrived: true });
  /** The look point last put on the camera (plan mm) — what `onCamera` reports. */
  const lookNow = useRef<Vec3>(opening.look);
  const dirty = useRef(false);
  const dwellTimer = useRef(0);
  const reportFrame = useRef(0);
  const tmp = useRef(new Vector3());
  /** The walking keys held down (KeyboardEvent.code), whether Shift is, and the last walked frame. */
  const held = useRef(new Set<string>());
  const fast = useRef(false);
  const walkedAt = useRef(0);
  const walkTmp = useRef({ forward: new Vector3(), right: new Vector3(), step: new Vector3() });

  // --- the small verbs, all on refs -------------------------------------------------------------

  const report = () => {
    if (reportFrame.current || !latest.current.onCamera) return;
    reportFrame.current = requestAnimationFrame(() => {
      reportFrame.current = 0;
      const cb = latest.current.onCamera;
      const camera = get().camera;
      const cam = asPerspective(camera);
      if (cb) cb({ eye: fromWorld(camera.position), look: lookNow.current, fovDeg: cam?.fov ?? DEFAULT_FOV_DEG });
    });
  };

  /** The pose the camera shows now, from the camera itself: the eye and (author) the orbit
   *  target or (curated) the base look — the head is not part of a fly's start. */
  const cameraPose = (): Pose => {
    if (latest.current.mode === "curated") return { ...base.current };
    const c = controls.current;
    const camera = get().camera;
    const cam = asPerspective(camera);
    return { eye: fromWorld(camera.position), look: c ? fromWorld(c.target) : lookNow.current, fovDeg: cam?.fov ?? base.current.fovDeg };
  };

  /** Put `base` + the head on the camera. In author mode the orbit target follows, so handing the
   *  controls back finds them where the camera is. */
  const apply = () => {
    const b = base.current;
    const curated = latest.current.mode === "curated";
    const h = curated ? head.current : CENTRED;
    const look = turnedLook(b.eye, b.look, h.yawDeg, h.pitchDeg);
    const camera = get().camera;
    const cam = asPerspective(camera);
    // Widened on a canvas narrower than the view was composed for (a phone held upright).
    const fov = fitFov(zoomedFov(b.fovDeg, h.fovDeltaDeg), cam?.aspect ?? COMPOSED_ASPECT);
    camera.position.set(...toWorld(b.eye));
    tmp.current.set(...toWorld(look));
    camera.lookAt(tmp.current);
    if (cam && Math.abs(cam.fov - fov) > 1e-6) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    if (!curated) controls.current?.target.copy(tmp.current);
    lookNow.current = look;
    report();
  };

  // A canvas resized (a phone turned, a panel collapsed): the field of view is re-fitted to the new
  // aspect — never the pose, which in author mode is wherever the designer orbited to.
  const size = useThree((st) => st.size);
  useEffect(() => {
    const cam = asPerspective(get().camera);
    if (!cam) return;
    const h = latest.current.mode === "curated" ? head.current : CENTRED;
    const fov = fitFov(zoomedFov(base.current.fovDeg, h.fovDeltaDeg), size.width / Math.max(1, size.height));
    if (Math.abs(cam.fov - fov) > 1e-6) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
      invalidate();
    }
    // Only a size change re-fits; the refs are read as they stand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height]);

  const holdControls = () => {
    const c = controls.current;
    if (c) c.enabled = false;
  };

  /** Author: give the camera back to the orbit controls, their target on the look point. */
  const handBack = () => {
    if (latest.current.mode !== "author") return;
    const c = controls.current;
    if (!c) return;
    c.target.set(...toWorld(base.current.look));
    c.enabled = true;
    c.update();
    invalidate();
  };

  const clearDwell = () => {
    if (dwellTimer.current) window.clearTimeout(dwellTimer.current);
    dwellTimer.current = 0;
  };

  /** Start the head's way back to centre (curated). */
  const recentreHead = (now: number) => {
    if (isCentred(head.current)) return;
    recentring.current = { from: { ...head.current }, start: now };
  };

  /** Freeze an easing head where it shows now, so a grab or a zoom starts from what is seen. */
  const settleHead = (now: number) => {
    const r = recentring.current;
    if (!r) return;
    head.current = easedHead(r.from, now - r.start);
    recentring.current = null;
  };

  /** The pose on screen: the base with the head's turn and zoom (curated), the base itself (author). */
  const shownPose = (): Pose => {
    const b = base.current;
    const h = head.current;
    if (latest.current.mode !== "curated" || isCentred(h)) return b;
    return { eye: b.eye, look: turnedLook(b.eye, b.look, h.yawDeg, h.pitchDeg), fovDeg: zoomedFov(b.fovDeg, h.fovDeltaDeg) };
  };

  const beginFly = (to: Viewpoint, ms: number) => {
    const now = performance.now();
    const from = cameraPose();
    base.current = from;
    place.current = { stop: null, viewpointId: to.id, arrived: false };
    // Already showing it — the designer saved or re-shot the view the camera stands at: light it
    // without a fly that goes nowhere (and, curated, without unwinding a head that is already it).
    const shown = latest.current.mode === "curated" ? shownPose() : from;
    if (samePose(asViewpoint(shown), to) || ms <= 0) {
      fly.current = null;
      base.current = poseOf(to);
      head.current = CENTRED;
      recentring.current = null;
      place.current.arrived = true;
      dirty.current = true;
      handBack();
      invalidate();
      return;
    }
    if (latest.current.mode === "curated") recentreHead(now);
    holdControls();
    fly.current = { from: asViewpoint(from), to, start: now, ms, cross: crossesZones(asViewpoint(from), to, latest.current.zones) };
    invalidate();
  };

  /** Jump without flying — the first frame, another plan, a mode switch with nothing to fly to. */
  const jumpTo = (pose: Pose, id: string | null) => {
    fly.current = null;
    head.current = CENTRED;
    recentring.current = null;
    base.current = pose;
    place.current = { stop: null, viewpointId: id, arrived: true };
    apply();
    const c = controls.current;
    if (c && latest.current.mode === "author") {
      c.enabled = true;
      c.update();
    }
    invalidate();
  };

  const endTour = (tellScreen: boolean) => {
    if (!tour.current) return;
    tour.current = null;
    clearDwell();
    handBack();
    if (tellScreen) latest.current.onTourEnd?.();
  };

  const startTour = () => {
    const t = latest.current.tour;
    if (!t || !t.stops.length) {
      latest.current.onTourEnd?.();
      return;
    }
    const played = tourFrom(t, resumeStop(t, place.current));
    const { legs, totalMs } = tourSchedule(played.tour);
    const from = cameraPose();
    base.current = from;
    fly.current = null;
    holdControls();
    tour.current = { tour: played.tour, indexOf: played.indexOf, legs, totalMs, start: performance.now(), leg: -1, cycle: -1, legFrom: asViewpoint(from), cross: false, hiddenAt: null };
    invalidate();
  };

  const viewpointById = (id: string) => latest.current.viewpoints.find((v) => v.id === id) ?? null;

  /** Author: the camera is leaving whatever viewpoint it stood at (the controls' own onStart). */
  const leave = () => {
    if (place.current.viewpointId === null) return;
    place.current = { stop: null, viewpointId: null, arrived: true };
    latest.current.onLeave?.();
  };

  /** Author: one frame of walking — the eye and its orbit point carried together along the floor
   *  by the held keys, at a speed that grows with how far the eye stands from what it orbits. */
  const walk = (now: number): boolean => {
    const c = controls.current;
    if (!c || !c.enabled) return false;
    const dt = walkedAt.current ? Math.min(0.05, (now - walkedAt.current) / 1000) : 1 / 60;
    walkedAt.current = now;
    let f = 0;
    let r = 0;
    let u = 0;
    for (const code of held.current) {
      const k = WALK_KEYS[code];
      if (!k) continue;
      f += k[0];
      r += k[1];
      u += k[2];
    }
    const camera = get().camera;
    const { forward, right, step } = walkTmp.current;
    forward.set(c.target.x - camera.position.x, 0, c.target.z - camera.position.z);
    if (forward.lengthSq() < 1e-8) camera.getWorldDirection(forward).setY(0);
    forward.normalize();
    // three is y-up: the right of a heading (x, z) is (−z, x).
    right.set(-forward.z, 0, forward.x);
    const speed = Math.min(WALK_MAX_M_S, Math.max(WALK_MIN_M_S, camera.position.distanceTo(c.target) * WALK_PER_M)) * (fast.current ? WALK_FAST : 1);
    step.set(0, 0, 0).addScaledVector(forward, f).addScaledVector(right, r);
    if (step.lengthSq() > 1) step.normalize();
    step.multiplyScalar(speed * dt);
    step.y = Math.max(u * speed * dt, -c.target.y);
    camera.position.add(step);
    c.target.add(step);
    c.update();
    return true;
  };

  // --- the frame: only while something moves ----------------------------------------------------

  // CAMERA_FIRST: this runs before every other frame callback, so the pose a frame is drawn with is
  // the pose they all see. At priority 0 it ran after "the camera settled"'s watcher
  // (scene-settle.ts): on a fly's last frame the camera landed after the watcher had looked, no
  // frame followed, and the level of detail and the real lights stayed as the fly's first frames
  // left them — the overview's chair boxes standing round the stage's tables (2026-10-24).
  useFrame(() => {
    const now = performance.now();
    let moving = false;
    let changed = dirty.current;
    dirty.current = false;

    if (held.current.size && latest.current.mode === "author" && walk(now)) moving = true;

    const run = tour.current;
    if (run) {
      if (run.hiddenAt !== null) return; // frozen while the tab is away
      const elapsed = now - run.start;
      const at = tourAt(run.tour, elapsed);
      const stop = at.index >= 0 ? run.tour.stops[at.index] : null;
      const to = stop ? viewpointById(stop.viewpointId) : null;
      if (!to || run.totalMs <= 0) {
        if (to) {
          base.current = poseOf(to);
          place.current = { stop: run.indexOf(at.index), viewpointId: to.id, arrived: true };
          changed = true;
        }
        endTour(true);
      } else {
        const cycle = run.tour.loop ? Math.floor(elapsed / run.totalMs) : 0;
        if (at.index !== run.leg || cycle !== run.cycle) {
          run.leg = at.index;
          run.cycle = cycle;
          run.legFrom = asViewpoint(base.current);
          run.cross = crossesZones(run.legFrom, to, latest.current.zones);
          recentreHead(now);
          const index = run.indexOf(at.index);
          place.current = { stop: index, viewpointId: to.id, arrived: false };
          latest.current.onTourStep?.(index, to.id);
        }
        const p = flyPose(run.legFrom, to, at.flyT, run.cross);
        base.current = { eye: p.eye, look: p.look, fovDeg: p.fovDeg };
        changed = true;
        if (at.flyT >= 1) place.current.arrived = true;
        if (at.done) endTour(true);
        else if (at.flyT < 1) moving = true;
        else if (!dwellTimer.current) {
          // Resting: sleep until this stop's dwell ends, then wake the canvas for the next leg.
          const inCycle = elapsed - cycle * run.totalMs;
          const wait = Math.max(16, run.legs[at.index].leaveAt - inCycle + 4);
          dwellTimer.current = window.setTimeout(() => {
            dwellTimer.current = 0;
            invalidate();
          }, wait);
        }
      }
    } else if (fly.current) {
      const f = fly.current;
      const t = (now - f.start) / f.ms;
      const p = flyPose(f.from, f.to, Math.min(1, t), f.cross);
      base.current = { eye: p.eye, look: p.look, fovDeg: p.fovDeg };
      changed = true;
      if (t >= 1) {
        fly.current = null;
        base.current = poseOf(f.to);
        place.current.arrived = true;
        apply();
        handBack();
        changed = false;
      } else moving = true;
    }

    const r = recentring.current;
    if (r) {
      head.current = easedHead(r.from, now - r.start);
      changed = true;
      if (isCentred(head.current)) recentring.current = null;
      else moving = true;
    }

    if (changed) apply();
    if (moving) invalidate();
  }, CAMERA_FIRST);

  // --- placement: the first frame, another plan, a mode switch ----------------------------------

  const placedKey = useRef<string | null>(null);
  const placedMode = useRef(mode);
  useLayoutEffect(() => {
    const active = activeId ? viewpointById(activeId) : null;
    if (placedKey.current !== key) {
      // The first frame, or another plan (another event, a venue with new walls) — not every
      // rebuild of the same plan, which would throw the camera back on every edit.
      placedKey.current = key;
      placedMode.current = mode;
      if (tour.current) endTour(true);
      jumpTo(active ? poseOf(active) : overviewPose(bounds), active?.id ?? null);
      return;
    }
    if (placedMode.current === mode) return;
    placedMode.current = mode;
    // A mode switch keeps the view where it is. Into curated: the author camera's pose becomes the
    // base and the head starts centred (the active-viewpoint effect below then flies on if the
    // screen chose another viewpoint). Into author: the head's turn and zoom are baked into the
    // pose the orbit controls take over.
    const b = base.current;
    const h = head.current;
    const baked: Pose = { eye: b.eye, look: turnedLook(b.eye, b.look, h.yawDeg, h.pitchDeg), fovDeg: zoomedFov(b.fovDeg, h.fovDeltaDeg) };
    if (mode === "curated") {
      const c = controls.current;
      const camera = get().camera;
      const cam = asPerspective(camera);
      base.current = { eye: fromWorld(camera.position), look: c ? fromWorld(c.target) : lookNow.current, fovDeg: cam?.fov ?? b.fovDeg };
    } else base.current = baked;
    head.current = CENTRED;
    recentring.current = null;
    if (fly.current || tour.current) holdControls();
    else {
      apply();
      handBack();
    }
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mode]);

  // --- the tour: ▶ and ⏸ (before the active viewpoint, so a chip tapped mid-tour stops it first)

  useEffect(() => {
    if (playing && !tour.current) startTour();
    else if (!playing && tour.current) endTour(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // --- the active viewpoint ---------------------------------------------------------------------

  useEffect(() => {
    if (playing || !activeId) return;
    const to = viewpointById(activeId);
    if (!to) return;
    if (activeId !== place.current.viewpointId) {
      beginFly(to, CHIP_TRAVEL_MS);
      return;
    }
    // Already there (or on the way). Curated: if the viewpoint itself changed under the camera —
    // re-shot, or a default re-derived from an edited plan — stand on its new pose, head centred.
    // (A re-shoot takes the very pose on screen, so this is invisible.)
    if (mode === "curated" && !fly.current && place.current.arrived && !samePose(to, asViewpoint(base.current))) {
      jumpTo(poseOf(to), to.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, playing, viewpoints, mode]);

  // The active chip tapped again: the head comes home (curated), the camera flies back (author).
  const firstRecentre = useRef(recentre);
  useEffect(() => {
    if (firstRecentre.current === recentre) return;
    firstRecentre.current = recentre;
    if (latest.current.playing) return;
    const to = activeId ? viewpointById(activeId) : null;
    // Stopped mid-air (⏸ during a leg, then its chip tapped) or the designer's camera: fly on to it.
    if (to && (mode === "author" || (!place.current.arrived && !fly.current))) {
      beginFly(to, CHIP_TRAVEL_MS);
      return;
    }
    if (mode === "curated") {
      recentreHead(performance.now());
      invalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentre]);

  // --- the canvas: the client's head (curated), letting go of a fly (author) ---------------------

  useEffect(() => {
    const el = get().gl.domElement;
    if (mode === "author") {
      // Capture phase: this runs before OrbitControls' own listener on the same element, so the
      // press that interrupts a fly or a tour is the press that starts the orbit.
      const interrupt = () => {
        if (tour.current) {
          endTour(true);
        } else if (fly.current) {
          fly.current = null;
          apply();
          handBack();
        }
      };
      el.addEventListener("pointerdown", interrupt, true);
      el.addEventListener("wheel", interrupt, true);
      return () => {
        el.removeEventListener("pointerdown", interrupt, true);
        el.removeEventListener("wheel", interrupt, true);
      };
    }

    // Curated. touch-action none, or a phone scrolls the page under a drag and zooms it on a pinch.
    const touchAction = el.style.touchAction;
    el.style.touchAction = "none";
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { id: number; x: number; y: number; from: Head } | null = null;
    let pinch: { dist: number; from: Head } | null = null;
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const baseFov = () => base.current.fovDeg;
    const restartDrag = () => {
      const [first] = [...pointers.entries()];
      drag = first ? { id: first[0], x: first[1].x, y: first[1].y, from: { ...head.current } } : null;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      settleHead(performance.now());
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        drag = null;
        pinch = { dist: spread(), from: { ...head.current } };
      } else if (pointers.size === 1) restartDrag();
      const id = e.pointerId;
      startPointerGesture(
        e,
        {
          onMove: (m) => {
            pointers.set(id, { x: m.clientX, y: m.clientY });
            if (pinch && pointers.size >= 2) {
              head.current = pinchHead(pinch.from, pinch.dist, spread(), baseFov());
            } else if (drag && drag.id === id) {
              const cam = asPerspective(get().camera);
              const fov = cam?.fov ?? baseFov();
              head.current = dragHead(drag.from, m.clientX - drag.x, m.clientY - drag.y, el.clientHeight, fov, baseFov());
            } else return;
            recentring.current = null;
            dirty.current = true;
            invalidate();
          },
          onEnd: () => {
            pointers.delete(id);
            if (pointers.size < 2) pinch = null;
            // A pinch that lifts one finger goes on as a drag from where that finger is now.
            if (pointers.size === 1) restartDrag();
            else drag = null;
          },
        },
        { thresholdPx: 2, capture: el },
      );
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      settleHead(performance.now());
      const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * el.clientHeight : e.deltaY;
      head.current = wheelHead(head.current, px, baseFov());
      dirty.current = true;
      invalidate();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("wheel", wheel);
      el.style.touchAction = touchAction;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, get, invalidate]);

  // --- the designer's freedom (author): a double-click focuses, the keys walk ---------------------

  useEffect(() => {
    if (mode !== "author") return;
    const el = get().gl.domElement;
    const raycaster = new Raycaster();
    const ndc = new Vector2();

    // Fly to what was double-clicked and orbit it from there: the eye keeps the side it looks from,
    // comes in to a share of its distance, and looks down at a comfortable slope.
    const focus = (e: MouseEvent) => {
      e.preventDefault();
      const { camera, scene } = get();
      const rect = el.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const at = pickPoint(raycaster, scene);
      if (!at) return;
      const c = controls.current;
      const off = new Vector3().subVectors(camera.position, c ? c.target : at);
      const flat = Math.hypot(off.x, off.z);
      const az = flat > 1e-6 ? Math.atan2(off.z, off.x) : Math.atan2(camera.position.z - at.z, camera.position.x - at.x);
      const clampDeg = Math.min(FOCUS_PITCH_MAX_DEG, Math.max(FOCUS_PITCH_MIN_DEG, (Math.atan2(off.y, flat) * 180) / Math.PI));
      const pitch = (clampDeg * Math.PI) / 180;
      const dist = Math.min(FOCUS_MAX_M, Math.max(FOCUS_MIN_M, off.length() * FOCUS_SHARE));
      const eye = new Vector3(at.x + Math.cos(az) * Math.cos(pitch) * dist, Math.max(MIN_EYE_M, at.y + Math.sin(pitch) * dist), at.z + Math.sin(az) * Math.cos(pitch) * dist);
      if (tour.current) endTour(true);
      leave();
      beginFly({ id: "", name: "", eye: fromWorld(eye), look: fromWorld(at), fovDeg: asPerspective(camera)?.fov ?? DEFAULT_FOV_DEG }, FOCUS_MS);
      // Standing on no viewpoint: the chip the designer chose last can be chosen again.
      place.current.viewpointId = null;
    };

    const down = (e: KeyboardEvent) => {
      fast.current = e.shiftKey;
      if (!WALK_KEYS[e.code] || e.ctrlKey || e.metaKey || e.altKey || typingInto(e.target)) return;
      e.preventDefault();
      if (tour.current) endTour(true);
      else if (fly.current) {
        fly.current = null;
        apply();
        handBack();
      }
      if (!held.current.size) leave();
      held.current.add(e.code);
      invalidate();
    };
    const up = (e: KeyboardEvent) => {
      fast.current = e.shiftKey;
      held.current.delete(e.code);
      if (!held.current.size) walkedAt.current = 0;
    };
    const letGo = () => {
      held.current.clear();
      walkedAt.current = 0;
    };
    el.addEventListener("dblclick", focus);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", letGo);
    return () => {
      el.removeEventListener("dblclick", focus);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", letGo);
      letGo();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, get, invalidate]);

  // A hidden tab: the tour's clock stops, and is moved on by the time away when it comes back.
  useEffect(() => {
    const sync = () => {
      const run = tour.current;
      if (!run) return;
      const now = performance.now();
      if (document.visibilityState === "hidden") {
        if (run.hiddenAt === null) run.hiddenAt = now;
        clearDwell();
      } else if (run.hiddenAt !== null) {
        run.start += now - run.hiddenAt;
        run.hiddenAt = null;
        invalidate();
      }
    };
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [invalidate]);

  useEffect(
    () => () => {
      clearDwell();
      if (reportFrame.current) cancelAnimationFrame(reportFrame.current);
      reportFrame.current = 0;
    },
    [],
  );

  if (mode !== "author") return null;

  // The designer's own camera. `change` fires while the controls move (damping included) and stops
  // when they settle, so a still view costs nothing; the eye is held above the floor.
  const onChange = () => {
    const c = controls.current;
    const camera = get().camera;
    if (c && c.target.y < 0) c.target.y = 0;
    if (camera.position.y < MIN_EYE_M) camera.position.y = MIN_EYE_M;
    if (c && c.enabled) {
      lookNow.current = fromWorld(c.target);
      base.current = cameraPose();
    }
    report();
  };
  // A press or a wheel the controls take: the camera is leaving whatever viewpoint it stood at.
  const onStart = leave;

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      enablePan
      // The wheel zooms toward what is under the cursor, carrying the orbit point with it — so the
      // designer can close in on any table, not only on the middle of the venue.
      zoomToCursor
      screenSpacePanning={false}
      maxPolarAngle={Math.PI / 2 - 0.03}
      minDistance={0.4}
      maxDistance={maxDistance}
      zoomSpeed={0.8}
      onChange={onChange}
      onStart={onStart}
    />
  );
}
