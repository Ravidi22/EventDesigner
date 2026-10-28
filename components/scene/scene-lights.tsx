"use client";
// The three moods as one rig (spec §4): a hemisphere light for the sky's ambient, a sun with one
// shadow map fitted to the plan's bounds, a sky dome, and fog the colour of the horizon starting
// past the bounds. DAY: a high warm sun in a blue sky with fair-weather cloud. EVENING: the sun low
// on the horizon (14°, long shadows) in gold, a sunset sky — orange at the horizon, rose above it,
// violet overhead — its clouds lit from below. NIGHT: the MOON — the same light, cool and dim, so
// the room gets soft moon shadows at no cost — a starfield over a deep-blue sky, a dim ambient.
//
// The dome is ONE shader (SKY_FRAGMENT): a three-stop gradient with a haze band, the sun's glow and
// disc (or the moon's, with its seas) where the light really comes from, clouds as a noise sheet seen
// from below, stars hashed off the view direction. It costs one draw, only where sky shows, and the
// moods are uniforms — a mood switch never recompiles (2026-10-27, the user: "realistic, sun/moon &
// sky — think about performance"; it was a 1×128 gradient texture).
//
// The emitters glow in two layers. Every one wears the additive halo sprite (scene-nodes.tsx,
// dimmed by HALO_BY_MOOD). In the evening and at night the nearest few to the camera also get a
// REAL point light — `EmitterLights` below: a pool of `count` lights (the device profile's; a
// phone's is 0) re-aimed at the camera's every settle (scene-settle.ts), lamps and chandelier
// bulbs before candles, intensity by strength, reach by radius, no shadows. The pool is JSX once;
// the re-pick writes the lights' fields and invalidates — never a render per frame.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BackSide, type Camera, Color, type DirectionalLight, PMREMGenerator, type PointLight, ShaderMaterial, Vector3 } from "three";
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
  /** The directional light: the sun by day and in the evening, the MOON at night. */
  sun: { colour: string; intensity: number; elevationDeg: number };
  dome: Dome;
  /** The fog's colour: the dome's horizon, so the far ground melts into the sky. */
  fog: string;
}

/** The sky dome of one mood (SKY_FRAGMENT's uniforms). Colours are the plan's hex, read linear. */
interface Dome {
  zenith: string;
  /** The band a quarter of the way up — a sunset's rose, a day's mid-blue. */
  mid: string;
  horizon: string;
  /** How much brighter the band hugging the horizon is, 0..1. */
  haze: number;
  /** The disc's angular radius in radians — drawn larger than life, as the eye remembers it. */
  discRad: number;
  /** The glow round the disc, 0..~1.5. */
  glow: number;
  /** A moon (seas, no hot core) instead of a sun. */
  moon: boolean;
  /** Cloud cover 0..1, the side facing the light and the side away. */
  clouds: number;
  cloudLit: string;
  cloudShade: string;
  /** Starlight 0..1. */
  stars: number;
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
    dome: { zenith: "#3f78c9", mid: "#8cb6e6", horizon: "#dfeaf4", haze: 0.55, discRad: 0.011, glow: 0.7, moon: false, clouds: 0.5, cloudLit: "#ffffff", cloudShade: "#c4cfdc", stars: 0 },
    fog: "#dfeaf4",
  },
  evening: {
    sky: "#e6c4a8",
    ground: "#7d6e66",
    hemisphere: 0.35,
    environment: 0.55,
    interior: { colour: "#ffcf98", intensity: 0.6 },
    exposure: 1.1,
    sun: { colour: "#ffb070", intensity: 1.2, elevationDeg: 14 },
    dome: { zenith: "#33366e", mid: "#d98a8c", horizon: "#f7a45c", haze: 0.7, discRad: 0.014, glow: 1.25, moon: false, clouds: 0.35, cloudLit: "#ffc38a", cloudShade: "#7a5878", stars: 0 },
    fog: "#ec9f72",
  },
  night: {
    sky: "#334466",
    ground: "#1a1a2a",
    hemisphere: 0.07,
    environment: 0.16,
    interior: { colour: "#ffb066", intensity: 0.36 },
    exposure: 1.2,
    // Moonlight: cool, dim, high enough that its shadows stay short.
    sun: { colour: "#b4c6ea", intensity: 0.32, elevationDeg: 38 },
    dome: { zenith: "#040819", mid: "#0c1636", horizon: "#232c55", haze: 0.45, discRad: 0.02, glow: 0.35, moon: true, clouds: 0.18, cloudLit: "#3a4670", cloudShade: "#10162e", stars: 1 },
    fog: "#151b3d",
  },
};

const SKY_RADIUS_M = 400;
const SHADOW_MAP = 2048;

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  // On the far plane, behind everything, whatever the dome's radius.
  gl_Position.z = gl_Position.w;
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uLightDir;
uniform vec3 uLightColour;
uniform float uDisc;
uniform float uGlow;
uniform float uMoon;
uniform float uHaze;
uniform float uClouds;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uStars;
varying vec3 vDir;

float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float up = clamp(h, 0.0, 1.0);
  // The gradient: horizon → the band above it → the zenith, a brighter haze hugging the horizon.
  vec3 col = mix(mix(uHorizon, uMid, smoothstep(0.0, 0.3, up)), uZenith, smoothstep(0.18, 0.95, up));
  col = mix(col, uHorizon, exp(-up * 14.0) * uHaze);
  col = mix(col, uGround, smoothstep(0.0, -0.06, h));

  // The light's glow: wide and faint, then tight and bright round the disc.
  float c = dot(d, uLightDir);
  float toward = max(c, 0.0);
  col += uLightColour * (pow(toward, 6.0) * 0.16 + pow(toward, 48.0) * 0.4 + pow(toward, 700.0) * 0.7) * uGlow;

  // Clouds: a sheet of noise seen from below, thinning to the horizon, lit on the side facing the light.
  if (uClouds > 0.0 && h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.6;
    float n = fbm(uv + vec2(3.7, 1.3));
    float dense = smoothstep(0.62 - 0.22 * uClouds, 0.9, n) * smoothstep(0.0, 0.2, h);
    vec3 cloud = mix(uCloudShade, uCloudLit, clamp(0.5 + 0.4 * c + 0.6 * (n - 0.6), 0.0, 1.0));
    col = mix(col, cloud, dense * min(1.0, uClouds * 1.6));
  }

  // The disc, in front of the clouds: the sun white-hot, the moon pale with its seas.
  float ang = acos(clamp(c, -1.0, 1.0));
  float disc = 1.0 - smoothstep(uDisc * 0.86, uDisc, ang);
  if (uMoon > 0.5) {
    vec3 t1 = normalize(cross(uLightDir, vec3(0.0, 1.0, 0.0)));
    vec3 t2 = cross(t1, uLightDir);
    vec2 q = vec2(dot(d, t1), dot(d, t2)) / uDisc;
    float seas = smoothstep(0.42, 0.72, noise(q * 2.3 + 5.0));
    col = mix(col, vec3(0.86, 0.88, 0.92) * (1.0 - 0.3 * seas) * (1.0 - 0.2 * dot(q, q)), disc);
  } else {
    col = mix(col, uLightColour * 1.8 + 0.2, disc);
  }

  // Stars: one in a few hundred cells of a fine grid on the sphere, fading toward the horizon.
  if (uStars > 0.0 && h > 0.0) {
    vec3 g = d * 260.0;
    vec3 cell = floor(g);
    if (hash13(cell) > 0.991) {
      vec3 o = vec3(hash13(cell + 1.7), hash13(cell + 3.1), hash13(cell + 5.3)) - 0.5;
      float s = 1.0 - smoothstep(0.0, 0.22, length(fract(g) - 0.5 - o * 0.5));
      col += vec3(0.9, 0.93, 1.0) * s * uStars * (0.3 + 0.7 * hash13(cell + 9.1)) * smoothstep(0.03, 0.3, h) * (1.0 - disc);
    }
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** The sky dome's material: built once, its uniforms written per mood. */
function skyMaterial(): ShaderMaterial {
  const v3 = () => ({ value: new Color() });
  return new ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: {
      uZenith: v3(),
      uMid: v3(),
      uHorizon: v3(),
      uGround: v3(),
      uLightDir: { value: new Vector3(0, 1, 0) },
      uLightColour: v3(),
      uDisc: { value: 0.01 },
      uGlow: { value: 1 },
      uMoon: { value: 0 },
      uHaze: { value: 0.5 },
      uClouds: { value: 0 },
      uCloudLit: v3(),
      uCloudShade: v3(),
      uStars: { value: 0 },
    },
    side: BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
}

/** One mood's dome into the material, the disc where the light stands (`toLight`, world, unit). */
function paintSky(m: ShaderMaterial, rig: Rig, toLight: Vector3): void {
  const { dome, sun: light } = rig;
  const u = m.uniforms;
  (u.uZenith.value as Color).set(dome.zenith);
  (u.uMid.value as Color).set(dome.mid);
  (u.uHorizon.value as Color).set(dome.horizon);
  // Under the horizon the dome is the fog's colour, so the far ground fades into the sky unbroken.
  (u.uGround.value as Color).set(rig.fog);
  (u.uLightColour.value as Color).set(dome.moon ? "#dfe6f2" : light.colour);
  (u.uLightDir.value as Vector3).copy(toLight);
  u.uDisc.value = dome.discRad;
  u.uGlow.value = dome.glow;
  u.uMoon.value = dome.moon ? 1 : 0;
  u.uHaze.value = dome.haze;
  u.uClouds.value = dome.clouds;
  (u.uCloudLit.value as Color).set(dome.cloudLit);
  (u.uCloudShade.value as Color).set(dome.cloudShade);
  u.uStars.value = dome.stars;
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
  // `elevation` up, looking at the plan's centre. Low in the evening, so the shadows run long. At
  // night the same light is the moon, so the light count never changes (the reason EmitterLights
  // gives) and the dome's disc is always where the shadows come from.
  const sunSpec = rig.sun;
  const sun = useMemo(() => {
    const el = (sunSpec.elevationDeg * Math.PI) / 180;
    const distance = diag + 10;
    const flat = (distance * Math.cos(el)) / Math.SQRT2;
    const toLight = new Vector3(-Math.cos(el) / Math.SQRT2, Math.sin(el), Math.cos(el) / Math.SQRT2).normalize();
    return { position: [cx - flat, distance * Math.sin(el), cz + flat] as [number, number, number], distance, toLight };
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

  const sky = useMemo(skyMaterial, []);
  useEffect(() => () => sky.dispose(), [sky]);
  // Before the frame (layout): a mood switch repaints the dome in the same frame as the lights.
  useLayoutEffect(() => {
    paintSky(sky, rig, sun.toLight);
    invalidate();
  }, [sky, rig, sun, invalidate]);
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
      {/* Last of the opaque pass, on the far plane: only the pixels nothing else covered run the sky
          shader. noPick: a double-click focus (scene-camera.tsx) looks through it to the floor. */}
      <mesh position={[cx, 0, cz]} frustumCulled={false} material={sky} userData={{ noPick: true }} renderOrder={1000}>
        <sphereGeometry args={[SKY_RADIUS_M, 24, 12]} />
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
  // For the same reason the pool is the profile's FULL size whenever there is anything to light —
  // never one light per candle: sized `min(count, candles)`, every event with its own candle count
  // compiled the whole room afresh (plan A at 9 lights: 5.3 s frozen; at 11: 6.0 s; 2026-10-27). So
  // a machine compiles two sets at most — with the pool and without — and keeps them in its cache.
  const n = emitters.length > 0 ? Math.max(0, count) : 0;

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
  // A layout effect: the environment is part of every lit program, so it must be on the scene before
  // the viewer's FrameGate compiles them (its layout effect runs after this one), or the first frame
  // recompiles the room.
  useLayoutEffect(() => {
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
