"use client";
// The cameras. AUTHOR: drei's OrbitControls (orbit, pan along the floor, dolly) with the eye held
// above the floor, reporting its pose in PLAN mm through `onCamera` — throttled to one report per
// animation frame, through refs, never a setState. CURATED (phase C fills this in): no controls,
// the overview pose alone.
//
// Damping needs frames only while it damps: drei's control calls `invalidate()` on every `change`
// it dispatches, and its `update()` dispatches `change` only while the camera still moves — so a
// demand-rendered canvas settles by itself and a still view costs nothing. No `useFrame` here.
//
// The overview is the default pose: an elevated 35° view from the plan's −y side, far enough back
// for the bounds' diagonal to fit the vertical field of view. `fromWorld` is derived from `toWorld`
// (the images of the three plan axes, inverted) so the viewer never states the mapping twice.
import { useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef } from "react";
import { Vector3 } from "three";
import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { Bounds } from "@/lib/studio/geometry";
import { MM_PER_M, fromWorld as planFromWorld, toWorld } from "@/lib/scene/frame";
import { DEFAULT_FOV_DEG, vec3, type Vec3 } from "@/lib/scene/types";

/** Where the eye is and what it looks at, in plan mm with z up (a Viewpoint's two points). */
export interface CameraPose {
  eye: Vec3;
  look: Vec3;
}

const MIN_EYE_M = 0.3;
const OVERVIEW_ELEVATION_DEG = 35;
const FIT_MARGIN = 1.12;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** three metres → plan mm: the frame module's inverse of `toWorld` (lib/scene/frame.ts). */
export function fromWorld(p: Vector3): Vec3 {
  return planFromWorld(p.x, p.y, p.z);
}

/** The default view: elevated, from the −y side, framing the bounds. */
export function overviewPose(bounds: Bounds, fovDeg = DEFAULT_FOV_DEG): CameraPose {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const diag = Math.max(4000, Math.hypot(bounds.widthMm, bounds.heightMm));
  const distance = ((diag / 2) / Math.tan(rad(fovDeg) / 2)) * FIT_MARGIN;
  const el = rad(OVERVIEW_ELEVATION_DEG);
  return { look: vec3(cx, cy, 0), eye: vec3(cx, cy - Math.cos(el) * distance, Math.sin(el) * distance) };
}

const boundsKey = (b: Bounds) => `${b.minX},${b.minY},${b.maxX},${b.maxY}`;

export function AuthorCamera({ bounds, roofedMm, onCamera }: { bounds: Bounds; roofedMm: number | null; onCamera?: (pose: CameraPose) => void }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const onCameraRef = useRef(onCamera);
  onCameraRef.current = onCamera;
  const pending = useRef(0);
  const key = boundsKey(bounds);
  const maxDistance = useMemo(() => Math.max(40, (Math.hypot(bounds.widthMm, bounds.heightMm) / MM_PER_M) * 4), [bounds.widthMm, bounds.heightMm]);

  const report = () => {
    pending.current = 0;
    const c = controls.current;
    const cb = onCameraRef.current;
    if (!c || !cb) return;
    cb({ eye: fromWorld(camera.position), look: fromWorld(c.target) });
  };

  const onChange = () => {
    const c = controls.current;
    if (c && c.target.y < 0) c.target.y = 0;
    if (camera.position.y < MIN_EYE_M) camera.position.y = MIN_EYE_M;
    if (!pending.current && onCameraRef.current) pending.current = requestAnimationFrame(report);
  };

  // The overview when the bounds change (another event, a venue with new walls) — not on every
  // rebuild of the same plan, which would throw the designer's camera back on every edit.
  // roofedMm is accepted for the indoor rig phase C adds; the overview may look in from above.
  useLayoutEffect(() => {
    const pose = overviewPose(bounds);
    camera.position.set(...toWorld(pose.eye));
    const c = controls.current;
    if (c) {
      c.target.set(...toWorld(pose.look));
      c.update();
    } else {
      camera.lookAt(...toWorld(pose.look));
    }
    invalidate();
    if (onCameraRef.current && !pending.current) pending.current = requestAnimationFrame(report);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, camera, invalidate, roofedMm]);

  useEffect(
    () => () => {
      if (pending.current) cancelAnimationFrame(pending.current);
      pending.current = 0;
    },
    [],
  );

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      enablePan
      screenSpacePanning={false}
      maxPolarAngle={Math.PI / 2 - 0.03}
      minDistance={0.4}
      maxDistance={maxDistance}
      zoomSpeed={0.8}
      onChange={onChange}
    />
  );
}

/** Curated mode, phase A: the overview pose and nothing to drag. Phase C replaces it with the
 *  viewpoint fly and the head-turn. */
export function OverviewCamera({ bounds }: { bounds: Bounds }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const key = boundsKey(bounds);
  useLayoutEffect(() => {
    const pose = overviewPose(bounds);
    camera.position.set(...toWorld(pose.eye));
    camera.lookAt(...toWorld(pose.look));
    camera.updateProjectionMatrix();
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, camera, invalidate]);
  return null;
}
