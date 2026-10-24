"use client";
// Every node of a Scene drawn: a body as one mesh per material group under its instance's
// transform, or as one instanced mesh per group when it stands many times; an emitter as an
// additive halo sprite dimmed by the mood; a label as a floating pill, for the author only.
//
// The viewer never reads the document — only the Scene — and re-renders only when the Scene's
// identity changes. Geometries and materials live in two caches owned by this component for its
// lifetime (built on first use, disposed on unmount; a body whose signature holds across rebuilds
// keeps its geometry). Instance matrices are composed as three's own T·R·S from `toWorld` and
// `worldRotationY`: position = toWorld(at), rotation about +y, and a scale of (mirrored ? −1 : 1)·s
// on x and s on depth — the plan's translate · rotate · mirror · scale, in metres.
//
// LEVEL OF DETAIL is a visibility toggle, never a geometry swap: a body with `lod` (a flower
// fill's `near`/15 m) or a box stand-in (every chair past 25 m, scene-rules.ts) registers its
// world positions and its two groups — the body as built, the far box — in the registry below,
// and `evaluate` runs ONLY when the camera settles (scene-settle.ts) or the scene changes, writing
// `visible` on the groups and invalidating once. The distance read is to the body's NEAREST
// instance: a near body stays while any of it is in range, a far one shows once all of it is past
// the threshold, so a fill head beside the camera is never dropped because its room-wide instanced
// body is centred far away. Nothing is uploaded twice: the far box is a second mesh over the same
// instance matrices, hidden until it is wanted.
//
// COPLANAR FLOORS (the ground a millimetre under the zone floors, surface features a millimetre
// over them) are ranked by `floorRank`: the material takes a polygon offset by rank and the mesh a
// render order, so three planes at the same depth never z-fight at distance.
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferGeometry, Color, type Camera, Float32BufferAttribute, type Group, type InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { fromWorld, toWorld, worldRotationY } from "@/lib/scene/frame";
import type { BodyNode, EmitterNode, LabelNode, Mood, NodeType, Scene, Transform } from "@/lib/scene/types";
import { GeometryCache, geometrySignature } from "./scene-geometry";
import { MaterialCache } from "./scene-materials";
import { HALO_BY_MOOD, floorRank, hasFarBox, lodMatters, lodVisibility, renderOrderOf } from "./scene-rules";
import { useCameraSettle } from "./scene-settle";

/** What a shadow may fall on. Receiving is one lookup per fragment; casting is what costs, and
 *  the builder decides that per body. */
const RECEIVES = new Set<NodeType>(["ground", "floor", "ceiling", "wall", "deck", "stage", "table", "cloth", "feature"]);

const UP = new Vector3(0, 1, 0);
const scratchM = new Matrix4();
const scratchP = new Vector3();
const scratchQ = new Quaternion();
const scratchS = new Vector3();
const scratchC = new Color();

/** A camera distance read in metres, back to plan mm — through the one mapping. */
const lengthMm = (metres: number) => fromWorld(metres, 0, 0).x;

function instanceMatrix(t: Transform, out: Matrix4): Matrix4 {
  const [x, y, z] = toWorld(t.at);
  scratchP.set(x, y, z);
  scratchQ.setFromAxisAngle(UP, worldRotationY(t.rotationDeg));
  const s = t.scale ?? 1;
  scratchS.set(t.mirrored ? -s : s, 1, s);
  return out.compose(scratchP, scratchQ, scratchS);
}

interface Caches {
  geometry: GeometryCache;
  material: MaterialCache;
}

// --- level of detail ------------------------------------------------------------------------------

interface LodEntry {
  /** Every instance's world position, xyz in metres, flat. */
  positions: Float32Array;
  lod: BodyNode["lod"];
  main: Group | null;
  far: Group | null;
}

/** The bodies that take part in the distance evaluation, by id. One per mounted SceneNodes. */
class LodRegistry {
  readonly entries = new Map<string, LodEntry>();

  /** The distance from `eye` (metres) to the nearest instance, in plan mm. */
  static nearestMm(entry: LodEntry, eye: Vector3): number {
    const p = entry.positions;
    let best = Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const dx = p[i] - eye.x;
      const dy = p[i + 1] - eye.y;
      const dz = p[i + 2] - eye.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) best = d;
    }
    return lengthMm(Math.sqrt(best));
  }

  /** Write every entry's visibility for the camera where it stands; true when anything changed. */
  evaluate(camera: Camera, lodScale: number): boolean {
    let changed = false;
    for (const entry of this.entries.values()) {
      const distMm = LodRegistry.nearestMm(entry, camera.position);
      const v = lodVisibility(entry.lod, entry.far !== null, distMm, lodScale);
      if (entry.main && entry.main.visible !== v.main) {
        entry.main.visible = v.main;
        changed = true;
      }
      if (entry.far && entry.far.visible !== v.far) {
        entry.far.visible = v.far;
        changed = true;
      }
    }
    return changed;
  }
}

function instancePositions(instances: Transform[]): Float32Array {
  const out = new Float32Array(instances.length * 3);
  instances.forEach((t, i) => {
    const [x, y, z] = toWorld(t.at);
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  });
  return out;
}

// --- bodies ---------------------------------------------------------------------------------------

function Instanced({
  geometry,
  material,
  instances,
  castShadow,
  receiveShadow,
  renderOrder,
  vary = false,
}: {
  geometry: BufferGeometry;
  material: ReturnType<MaterialCache["get"]>;
  instances: Transform[];
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder?: number;
  /** Shade each instance a little differently (flower heads, the venue's plants): no two blooms of
   *  one variety are the same colour, no two trees of one size the same green, and identical heads
   *  read as plastic. Deterministic by index. */
  vary?: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    instances.forEach((t, i) => mesh.setMatrixAt(i, instanceMatrix(t, scratchM)));
    if (vary) {
      instances.forEach((_, i) => {
        // A hash of the index → lightness 0.82–1.06, and a faint warm/cool lean per head.
        const h = Math.sin((i + 1) * 12.9898) * 43758.5453;
        const f = 0.82 + 0.24 * (h - Math.floor(h));
        const g = Math.sin((i + 1) * 78.233) * 12345.678;
        const lean = ((g - Math.floor(g)) - 0.5) * 0.06;
        mesh.setColorAt(i, scratchC.setRGB(f * (1 + lean), f, f * (1 - lean)));
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    mesh.count = instances.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [instances, geometry, vary]);
  return (
    <instancedMesh ref={ref} args={[geometry, material, instances.length]} castShadow={castShadow} receiveShadow={receiveShadow} renderOrder={renderOrder} />
  );
}

const BodyView = memo(function BodyView({ body, caches, registry }: { body: BodyNode; caches: Caches; registry: LodRegistry }) {
  const built = caches.geometry.get(body);
  const n = body.instances.length;
  const castShadow = body.castShadow ?? true;
  const receiveShadow = RECEIVES.has(body.tag.type);
  const rank = floorRank(body);
  const renderOrder = rank === null ? undefined : renderOrderOf(rank);
  const offsetRank = rank ?? 0;
  const anyMirrored = body.instances.some((t) => t.mirrored);
  const proxy = n > 0 && built.length > 0 && hasFarBox(body) ? caches.geometry.proxy(body) : null;
  const tracked = n > 0 && built.length > 0 && lodMatters(body);
  const mainRef = useRef<Group>(null);
  const farRef = useRef<Group>(null);

  useLayoutEffect(() => {
    if (!tracked) return;
    const far = farRef.current;
    if (far) far.visible = false;
    registry.entries.set(body.id, { positions: instancePositions(body.instances), lod: body.lod, main: mainRef.current, far });
    return () => {
      registry.entries.delete(body.id);
    };
  }, [body, registry, tracked]);

  if (n === 0 || built.length === 0) return null;
  if (n === 1) {
    const t = body.instances[0];
    const s = t.scale ?? 1;
    return (
      <group position={toWorld(t.at)} rotation={[0, worldRotationY(t.rotationDeg), 0]} scale={[t.mirrored ? -s : s, 1, s]}>
        <group ref={mainRef}>
          {built.map((b, i) => (
            <mesh
              key={i}
              geometry={b.geometry}
              material={caches.material.get(b.material, !!t.mirrored, offsetRank)}
              castShadow={castShadow && b.material.kind !== "leaves"}
              receiveShadow={receiveShadow}
              renderOrder={renderOrder}
            />
          ))}
        </group>
        {proxy && (
          <group ref={farRef}>
            <mesh geometry={proxy} material={caches.material.get(body.material, !!t.mirrored)} castShadow={castShadow} receiveShadow={receiveShadow} />
          </group>
        )}
      </group>
    );
  }
  return (
    <>
      <group ref={mainRef}>
        {built.map((b, i) => (
          <Instanced
            key={i}
            geometry={b.geometry}
            material={caches.material.get(b.material, anyMirrored, offsetRank)}
            instances={body.instances}
            // A leaf card's shadow is its square: the crown's clumps under the cards cast the tree's.
            castShadow={castShadow && b.material.kind !== "leaves"}
            receiveShadow={receiveShadow}
            renderOrder={renderOrder}
            vary={body.tag.type === "flowers" || body.id.includes(":flower:") || (body.tag.type === "feature" && body.material.kind === "foliage")}
          />
        ))}
      </group>
      {proxy && (
        <group ref={farRef}>
          <Instanced geometry={proxy} material={caches.material.get(body.material, anyMirrored)} instances={body.instances} castShadow={castShadow} receiveShadow={receiveShadow} />
        </group>
      )}
    </>
  );
});

/** Every emitter halo of one colour, size and strength as ONE point cloud — a room of five hundred
 *  candles is a handful of draw calls, not five hundred sprites (it was 1,364 calls on reference
 *  plan A before this). Each point is the halo texture at the emitter's size in metres, attenuated
 *  by distance like the sprite was; additive, so overlapping halos brighten as glow does. */
interface Cloud {
  key: string;
  colour: string;
  sizeM: number;
  strength: number;
  positions: Float32Array;
}

export function emitterClouds(nodes: readonly EmitterNode[]): Cloud[] {
  const groups = new Map<string, { colour: string; sizeM: number; strength: number; pts: number[] }>();
  for (const e of nodes) {
    const sizeM = Math.max(0.02, Math.round((2 * e.radiusMm) / 10) / 100);
    const strength = Math.round(e.strength * 10) / 10;
    const key = `${e.colour}|${sizeM}|${strength}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { colour: e.colour, sizeM, strength, pts: [] }));
    g.pts.push(...toWorld(e.at));
  }
  return [...groups.entries()].map(([key, g]) => ({ key, colour: g.colour, sizeM: g.sizeM, strength: g.strength, positions: new Float32Array(g.pts) }));
}

/** A halo never grows past HALO_MAX_PX on screen: attenuated by distance alone, a candle a metre
 *  from the camera became a white blob a fifth of the frame wide (seen headless, 2026-10-23). */
const HALO_MAX_PX = 44;
const clampHalo = (shader: { vertexShader: string }) => {
  shader.vertexShader = shader.vertexShader.replace("#include <fog_vertex>", `gl_PointSize = min( gl_PointSize, ${HALO_MAX_PX.toFixed(1)} );
#include <fog_vertex>`);
};

const EmitterCloudView = memo(function EmitterCloudView({ cloud, mood, caches }: { cloud: Cloud; mood: Mood; caches: Caches }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(cloud.positions, 3));
    g.computeBoundingSphere();
    return g;
  }, [cloud.positions]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const opacity = Math.min(1, HALO_BY_MOOD[mood] * cloud.strength * 1.4);
  const map = caches.material.haloMap();
  if (opacity <= 0 || !map) return null;
  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={10}>
      <pointsMaterial map={map} color={cloud.colour} size={cloud.sizeM * 2.2} sizeAttenuation transparent opacity={opacity} blending={AdditiveBlending} depthWrite={false} toneMapped={false} onBeforeCompile={clampHalo} />
    </points>
  );
});

/** Bodies that would draw the same geometry in the same material with the same shadow and level-of-
 *  detail behaviour are drawn as ONE instanced mesh: forty identical candlesticks, thirty tables of
 *  one type. The builder keeps them apart (each has its own tag for the checks and the author's
 *  hover name); the viewer is where the draw calls are counted. */
export function mergeBodies(nodes: readonly BodyNode[]): BodyNode[] {
  const out = new Map<string, BodyNode>();
  for (const b of nodes) {
    // A body that hides past a distance was cut by REGION on purpose (lib/scene/tableware.ts: the
    // settings of each part of the room): merged, its nearest instance would always be close.
    const key = `${geometrySignature(b)}|${b.tag.type}|${b.castShadow ?? true}|${b.lod ? `${b.lod.tier}:${b.lod.beyondMm}${b.lod.tier === "near" ? `|${b.id}` : ""}` : ""}`;
    const have = out.get(key);
    if (have) {
      have.instances.push(...b.instances);
      continue;
    }
    out.set(key, { ...b, id: `m:${key}`, instances: [...b.instances] });
  }
  return [...out.values()];
}

const LabelView = memo(function LabelView({ node }: { node: LabelNode }) {
  return (
    <Html center position={toWorld(node.at)} zIndexRange={[20, 0]}>
      <span dir="rtl" className="pointer-events-none select-none whitespace-nowrap rounded-pill bg-surface px-2 py-0.5 text-caption text-ink shadow-floating">
        {node.text}
      </span>
    </Html>
  );
});

export function SceneNodes({ scene, mood, author, lodScale = 1 }: { scene: Scene; mood: Mood; author: boolean; lodScale?: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const get = useThree((s) => s.get);
  // Created once per mount; disposed on unmount. A disposed geometry or texture is re-uploaded by
  // three on its next draw, so a StrictMode double-mount costs an upload, never a blank frame.
  const caches = useMemo<Caches>(() => ({ geometry: new GeometryCache(), material: new MaterialCache(invalidate) }), [invalidate]);
  const registry = useMemo(() => new LodRegistry(), []);
  const bodies = useMemo(() => mergeBodies(scene.nodes.filter((n): n is BodyNode => n.kind === "body")), [scene]);
  const clouds = useMemo(() => emitterClouds(scene.nodes.filter((n): n is EmitterNode => n.kind === "emitter")), [scene]);
  useEffect(
    () => () => {
      caches.geometry.dispose();
      caches.material.dispose();
    },
    [caches],
  );
  useEffect(() => {
    caches.geometry.sweep(new Set(bodies.map((b) => b.id)));
    invalidate();
  }, [bodies, caches, invalidate]);
  useEffect(() => {
    invalidate();
  }, [mood, author, invalidate]);

  // The bodies register in their own layout effects, which run before this one: a new scene is
  // evaluated against the camera where it stands before its first frame.
  useLayoutEffect(() => {
    registry.evaluate(get().camera, lodScale);
    invalidate();
  }, [scene, lodScale, registry, get, invalidate]);
  useCameraSettle((camera) => {
    if (registry.evaluate(camera, lodScale)) invalidate();
  });

  return (
    <>
      {bodies.map((body) => (
        <BodyView key={`b:${body.id}`} body={body} caches={caches} registry={registry} />
      ))}
      {clouds.map((cloud) => (
        <EmitterCloudView key={`c:${cloud.key}`} cloud={cloud} mood={mood} caches={caches} />
      ))}
      {author && scene.nodes.map((node) => (node.kind === "label" ? <LabelView key={`l:${node.id}`} node={node} /> : null))}
    </>
  );
}
