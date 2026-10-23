"use client";
// The three moods as one rig (spec §4): a hemisphere light for the sky's ambient, a sun from the
// south-west with one shadow map fitted to the plan's bounds, a gradient dome, and fog the colour
// of the horizon starting past the bounds. Only DAY is finished in phase A; evening and night map
// onto the same rig dimmed and recoloured so the mood switch is visibly wired — the emitters do
// the glowing, and B7 refines them.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BackSide, CanvasTexture, type DirectionalLight, SRGBColorSpace } from "three";
import { useThree } from "@react-three/fiber";
import type { Bounds } from "@/lib/studio/geometry";
import { toWorld } from "@/lib/scene/frame";
import type { Mood } from "@/lib/scene/types";

interface Rig {
  sky: string;
  ground: string;
  hemisphere: number;
  sun: { colour: string; intensity: number; elevationDeg: number } | null;
  zenith: string;
  horizon: string;
}

const RIGS: Record<Mood, Rig> = {
  day: {
    sky: "#dfe8f3",
    ground: "#b9b3a6",
    hemisphere: 0.6,
    sun: { colour: "#fff2dd", intensity: 2.2, elevationDeg: 52 },
    zenith: "#8fb4e0",
    horizon: "#e8eef5",
  },
  evening: {
    sky: "#e6c4a8",
    ground: "#7d6e66",
    hemisphere: 0.35,
    sun: { colour: "#ffb070", intensity: 1.2, elevationDeg: 14 },
    zenith: "#7a6aa8",
    horizon: "#f0a070",
  },
  night: {
    sky: "#3b4a78",
    ground: "#12182a",
    hemisphere: 0.15,
    sun: null,
    zenith: "#0b1230",
    horizon: "#27305a",
  },
};

const SKY_RADIUS_M = 400;
const SHADOW_MAP = 2048;

/** A 1×128 vertical gradient: the zenith at the top, the horizon at the middle, a little darker
 *  below it (the dome continues under the ground plane, where fog and the ground hide it). */
function skyTexture(zenith: string, horizon: string): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, zenith);
  g.addColorStop(0.5, horizon);
  g.addColorStop(1, horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, 128);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** The plan's frame in metres: its centre on the floor and its diagonal. */
function frameOf(bounds: Bounds) {
  const [cx, , cz] = toWorld({ x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2, z: 0 });
  const [w] = toWorld({ x: bounds.widthMm, y: 0, z: 0 });
  const [d] = toWorld({ x: bounds.heightMm, y: 0, z: 0 });
  const diag = Math.max(4, Math.hypot(w, d));
  return { cx, cz, diag };
}

export function SceneLights({ mood, bounds, roofedMm, shadows }: { mood: Mood; bounds: Bounds; roofedMm: number | null; shadows: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const rig = RIGS[mood];
  const { cx, cz, diag } = frameOf(bounds);
  const sunRef = useRef<DirectionalLight>(null);
  const boundsKey = `${bounds.minX},${bounds.minY},${bounds.maxX},${bounds.maxY}`;

  // The sun stands off the south-west corner (plan: −x, +y → three: −x, +z), `distance` out and
  // `elevation` up, looking at the plan's centre.
  const sun = useMemo(() => {
    if (!rig.sun) return null;
    const el = (rig.sun.elevationDeg * Math.PI) / 180;
    const distance = diag + 10;
    const flat = (distance * Math.cos(el)) / Math.SQRT2;
    return { position: [cx - flat, distance * Math.sin(el), cz + flat] as [number, number, number], distance };
  }, [rig.sun, cx, cz, diag]);

  useLayoutEffect(() => {
    const light = sunRef.current;
    if (!light || !sun) return;
    const cam = light.shadow.camera;
    const half = diag / 2 + 1;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 0.1;
    cam.far = sun.distance * 2 + diag;
    cam.updateProjectionMatrix();
    light.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    light.shadow.bias = -0.0005;
    light.shadow.normalBias = 0.02;
    light.target.position.set(cx, 0, cz);
    light.target.updateMatrixWorld();
    light.shadow.needsUpdate = true;
    invalidate();
    // boundsKey stands in for the four numbers; roofedMm is accepted for the phase-C indoor rig.
  }, [sun, diag, cx, cz, boundsKey, shadows, invalidate, roofedMm]);

  const sky = useMemo(() => skyTexture(rig.zenith, rig.horizon), [rig.zenith, rig.horizon]);
  useEffect(() => () => sky?.dispose(), [sky]);
  useEffect(() => {
    invalidate();
  }, [mood, invalidate]);

  const fogNear = diag + 10;
  const fogFar = fogNear + Math.max(80, diag * 4);

  return (
    <>
      <hemisphereLight color={rig.sky} groundColor={rig.ground} intensity={rig.hemisphere} />
      {sun && rig.sun && (
        <directionalLight ref={sunRef} position={sun.position} color={rig.sun.colour} intensity={rig.sun.intensity} castShadow={shadows} />
      )}
      <mesh position={[cx, 0, cz]} frustumCulled={false}>
        <sphereGeometry args={[SKY_RADIUS_M, 24, 12]} />
        {sky ? (
          <meshBasicMaterial map={sky} side={BackSide} depthWrite={false} fog={false} toneMapped={false} />
        ) : (
          <meshBasicMaterial color={rig.horizon} side={BackSide} depthWrite={false} fog={false} toneMapped={false} />
        )}
      </mesh>
      <fog attach="fog" args={[rig.horizon, fogNear, fogFar]} />
    </>
  );
}
