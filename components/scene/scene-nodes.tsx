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
import { AdditiveBlending, type BufferGeometry, type Camera, type Group, type InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { fromWorld, toWorld, worldRotationY } from "@/lib/scene/frame";
import type { BodyNode, EmitterNode, LabelNode, Mood, NodeType, Scene, Transform } from "@/lib/scene/types";
import { GeometryCache } from "./scene-geometry";
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

/** A length in plan mm as metres — through the one mapping, so no second place divides. */
const lengthM = (mm: number) => toWorld({ x: mm, y: 0, z: 0 })[0];
/** …and back, for a camera distance read in metres. */
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
}: {
  geometry: BufferGeometry;
  material: ReturnType<MaterialCache["get"]>;
  instances: Transform[];
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder?: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    instances.forEach((t, i) => mesh.setMatrixAt(i, instanceMatrix(t, scratchM)));
    mesh.count = instances.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [instances, geometry]);
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
              castShadow={castShadow}
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
            castShadow={castShadow}
            receiveShadow={receiveShadow}
            renderOrder={renderOrder}
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

const EmitterView = memo(function EmitterView({ node, mood, caches }: { node: EmitterNode; mood: Mood; caches: Caches }) {
  const opacity = HALO_BY_MOOD[mood] * node.strength;
  const map = caches.material.haloMap();
  if (opacity <= 0 || !map) return null;
  const size = lengthM(2 * node.radiusMm);
  return (
    <sprite position={toWorld(node.at)} scale={[size, size, 1]}>
      <spriteMaterial map={map} color={node.colour} transparent opacity={opacity} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </sprite>
  );
});

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
  useEffect(
    () => () => {
      caches.geometry.dispose();
      caches.material.dispose();
    },
    [caches],
  );
  useEffect(() => {
    const live = new Set<string>();
    for (const node of scene.nodes) if (node.kind === "body") live.add(node.id);
    caches.geometry.sweep(live);
    invalidate();
  }, [scene, caches, invalidate]);
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
      {scene.nodes.map((node) => {
        switch (node.kind) {
          case "body":
            return <BodyView key={`b:${node.id}`} body={node} caches={caches} registry={registry} />;
          case "emitter":
            return <EmitterView key={`e:${node.id}`} node={node} mood={mood} caches={caches} />;
          case "label":
            return author ? <LabelView key={`l:${node.id}`} node={node} /> : null;
        }
      })}
    </>
  );
}
