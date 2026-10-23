"use client";
// The three moods as one rig (spec §4): a hemisphere light for the sky's ambient, a sun with one
// shadow map fitted to the plan's bounds, a gradient dome, and fog the colour of the horizon
// starting past the bounds. DAY: a high warm sun, a blue-white dome. EVENING: the sun low on the
// horizon (14°, long shadows) in gold, an orange-to-violet dome, the ambient down to a third.
// NIGHT: no sun, a deep-blue dome with a faint horizon, a dim bluish ambient, the fog darker.
//
// The emitters glow in two layers. Every one wears the additive halo sprite (scene-nodes.tsx,
// dimmed by HALO_BY_MOOD). In the evening and at night the nearest few to the camera also get a
// REAL point light — `EmitterLights` below: a pool of `count` lights (the device profile's; a
// phone's is 0) re-aimed at the camera's every settle (scene-settle.ts), lamps and chandelier
// bulbs before candles, intensity by strength, reach by radius, no shadows. The pool is JSX once;
// the re-pick writes the lights' fields and invalidates — never a render per frame.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BackSide, type Camera, CanvasTexture, type DirectionalLight, type PointLight, SRGBColorSpace, Vector3 } from "three";
import { useThree } from "@react-three/fiber";
import type { Bounds } from "@/lib/studio/geometry";
import { toWorld } from "@/lib/scene/frame";
import type { EmitterNode, Mood } from "@/lib/scene/types";
import { LAMP_CLASS, LIGHT_BY_MOOD, intensityOf, lightDistanceM, pickLit } from "./scene-rules";
import { useCameraSettle } from "./scene-settle";

interface Rig {
  sky: string;
  ground: string;
  hemisphere: number;
  sun: { colour: string; intensity: number; elevationDeg: number } | null;
  zenith: string;
  horizon: string;
  fog: string;
}

const RIGS: Record<Mood, Rig> = {
  day: {
    sky: "#dfe8f3",
    ground: "#b9b3a6",
    hemisphere: 0.6,
    sun: { colour: "#fff2dd", intensity: 2.2, elevationDeg: 52 },
    zenith: "#8fb4e0",
    horizon: "#e8eef5",
    fog: "#e8eef5",
  },
  evening: {
    sky: "#e6c4a8",
    ground: "#7d6e66",
    hemisphere: 0.35,
    sun: { colour: "#ffb070", intensity: 1.2, elevationDeg: 14 },
    zenith: "#7a6aa8",
    horizon: "#f0a070",
    fog: "#e9a27c",
  },
  night: {
    sky: "#334466",
    ground: "#1a1a2a",
    hemisphere: 0.12,
    sun: null,
    zenith: "#0b1230",
    horizon: "#27305a",
    fog: "#151b3d",
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

export function SceneLights({
  mood,
  bounds,
  roofedMm,
  shadows,
  fogScale = 1,
}: {
  mood: Mood;
  bounds: Bounds;
  roofedMm: number | null;
  shadows: boolean;
  /** Under 1 the fog closes in (a phone hides the far venue sooner). */
  fogScale?: number;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const rig = RIGS[mood];
  const { cx, cz, diag } = frameOf(bounds);
  const sunRef = useRef<DirectionalLight>(null);
  const boundsKey = `${bounds.minX},${bounds.minY},${bounds.maxX},${bounds.maxY}`;

  // The sun stands off the south-west corner (plan: −x, +y → three: −x, +z), `distance` out and
  // `elevation` up, looking at the plan's centre. Low in the evening, so the shadows run long.
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
  }, [mood, fogScale, invalidate]);

  const scale = Math.max(0.2, fogScale);
  const fogNear = (diag + 10) * scale;
  const fogFar = fogNear + Math.max(80, diag * 4) * scale;

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
      <fog attach="fog" args={[rig.fog, fogNear, fogFar]} />
    </>
  );
}

// --- the emitters' real lights --------------------------------------------------------------------

interface Placed {
  node: EmitterNode;
  /** World metres. */
  position: Vector3;
  radiusM: number;
  lamp: boolean;
}

/** `count` point lights for the nearest emitters (lamps and bulbs before candles), re-picked at
 *  every camera settle; none by day, and none at all when `count` is 0 (a phone). */
export function EmitterLights({ emitters, mood, count }: { emitters: EmitterNode[]; mood: Mood; count: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const get = useThree((s) => s.get);
  const lights = useRef<(PointLight | null)[]>([]);
  const factor = LIGHT_BY_MOOD[mood];
  const n = factor > 0 ? Math.max(0, Math.min(count, emitters.length)) : 0;

  const placed = useMemo<Placed[]>(
    () =>
      emitters.map((node) => {
        const [x, y, z] = toWorld(node.at);
        const [radiusM] = toWorld({ x: node.radiusMm, y: 0, z: 0 });
        return { node, position: new Vector3(x, y, z), radiusM, lamp: node.strength >= LAMP_CLASS };
      }),
    [emitters],
  );

  const assign = (camera: Camera) => {
    if (n === 0) return;
    const eye = camera.position;
    const chosen = pickLit(
      placed.map((p, index) => ({ index, lamp: p.lamp, distance: p.position.distanceToSquared(eye) })),
      n,
    );
    let changed = false;
    for (let i = 0; i < n; i++) {
      const light = lights.current[i];
      if (!light) continue;
      const pick = chosen[i] === undefined ? null : placed[chosen[i]];
      if (!pick) {
        if (light.visible) changed = true;
        light.visible = false;
        continue;
      }
      const intensity = intensityOf(pick.node.strength) * factor;
      if (!light.visible || !light.position.equals(pick.position) || light.intensity !== intensity) changed = true;
      light.visible = true;
      light.position.copy(pick.position);
      light.color.set(pick.node.colour);
      light.intensity = intensity;
      light.distance = lightDistanceM(pick.radiusM);
    }
    if (changed) invalidate();
  };
  const assignRef = useRef(assign);
  assignRef.current = assign;

  useCameraSettle((camera) => assignRef.current(camera));
  // A new emitter list, mood or pool: re-aim against the camera where it stands.
  useLayoutEffect(() => {
    assignRef.current(get().camera);
  }, [placed, factor, n, get]);

  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <pointLight
          key={i}
          ref={(light) => {
            lights.current[i] = light;
          }}
          decay={2}
          castShadow={false}
        />
      ))}
    </>
  );
}
