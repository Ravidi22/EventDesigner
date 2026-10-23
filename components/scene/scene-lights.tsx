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
import { BackSide, type Camera, CanvasTexture, type DirectionalLight, PMREMGenerator, type PointLight, SRGBColorSpace, Vector3 } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
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
  /** The image-based light every material reflects (a soft studio room, RoomEnvironment) — what
   *  makes gold read as gold, glass as glass and a polished floor as polished. */
  environment: number;
  /** A warm fill standing for the room's own lighting where it is roofed (the sun never reaches
   *  inside a hall): chandeliers, uplights, the house lights an event is held under. */
  interior: { colour: string; intensity: number };
  /** The renderer's exposure under neutral tone mapping. */
  exposure: number;
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
    environment: 0.9,
    interior: { colour: "#fff4e6", intensity: 0.55 },
    exposure: 1.0,
    sun: { colour: "#fff2dd", intensity: 2.2, elevationDeg: 52 },
    zenith: "#8fb4e0",
    horizon: "#e8eef5",
    fog: "#e8eef5",
  },
  evening: {
    sky: "#e6c4a8",
    ground: "#7d6e66",
    hemisphere: 0.35,
    environment: 0.55,
    interior: { colour: "#ffcf98", intensity: 0.6 },
    exposure: 1.1,
    sun: { colour: "#ffb070", intensity: 1.2, elevationDeg: 14 },
    zenith: "#7a6aa8",
    horizon: "#f0a070",
    fog: "#e9a27c",
  },
  night: {
    sky: "#334466",
    ground: "#1a1a2a",
    hemisphere: 0.07,
    environment: 0.16,
    interior: { colour: "#ffb066", intensity: 0.36 },
    exposure: 1.2,
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
  // The sun is always mounted (a night without one keeps it at intensity 0) for the light-count
  // reason EmitterLights gives; at night it stands where the evening's did.
  const sunSpec = rig.sun ?? { colour: "#000000", intensity: 0, elevationDeg: RIGS.evening.sun!.elevationDeg };
  const sun = useMemo(() => {
    const el = (sunSpec.elevationDeg * Math.PI) / 180;
    const distance = diag + 10;
    const flat = (distance * Math.cos(el)) / Math.SQRT2;
    return { position: [cx - flat, distance * Math.sin(el), cz + flat] as [number, number, number], distance };
  }, [sunSpec.elevationDeg, cx, cz, diag]);

  useLayoutEffect(() => {
    const light = sunRef.current;
    if (!light) return;
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

  // Exposure per mood: an evening hall is bright where the candles are, not dimmer overall.
  const gl = useThree((st) => st.gl);
  useEffect(() => {
    gl.toneMappingExposure = rig.exposure;
    invalidate();
  }, [gl, rig.exposure, invalidate]);

  const scale = Math.max(0.2, fogScale);
  const fogNear = (diag + 10) * scale;
  const fogFar = fogNear + Math.max(80, diag * 4) * scale;

  return (
    <>
      <StudioEnvironment intensity={rig.environment} />
      <hemisphereLight color={rig.sky} groundColor={rig.ground} intensity={rig.hemisphere} />
      {roofedMm !== null && <hemisphereLight color={rig.interior.colour} groundColor="#2a2018" intensity={rig.interior.intensity} />}
      <directionalLight ref={sunRef} position={sun.position} color={sunSpec.colour} intensity={sunSpec.intensity} castShadow={shadows} />
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
  // The pool is mounted whatever the mood and lights go DARK rather than invisible: three counts the
  // visible lights into every material's shader, so a mood switch that changed the count recompiled
  // the whole room (seen headless on 2026-10-23: a 30 s frame) and hitches on a real GPU.
  const n = Math.max(0, Math.min(count, emitters.length));

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
        if (light.intensity !== 0) changed = true;
        light.intensity = 0;
        continue;
      }
      const intensity = intensityOf(pick.node.strength) * factor;
      if (!light.position.equals(pick.position) || light.intensity !== intensity) changed = true;
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

/** The image-based light: three's RoomEnvironment (a neutral studio box with soft area lights)
 *  pre-filtered once into a PMREM and set as the scene's environment. No HDR file to fetch — it is
 *  built from geometry on the client. Every MeshStandard/Physical material reflects it: metal
 *  candlesticks catch highlights, glass gets an edge, the black tile floor its polish. */
function StudioEnvironment({ intensity }: { intensity: number }) {
  const gl = useThree((st) => st.gl);
  const scene = useThree((st) => st.scene);
  const invalidate = useThree((st) => st.invalidate);
  const env = useMemo(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    return target;
  }, [gl]);
  useEffect(() => {
    scene.environment = env.texture;
    invalidate();
    return () => {
      if (scene.environment === env.texture) scene.environment = null;
      env.dispose();
    };
  }, [env, scene, invalidate]);
  useEffect(() => {
    scene.environmentIntensity = intensity;
    invalidate();
  }, [scene, intensity, invalidate]);
  return null;
}
