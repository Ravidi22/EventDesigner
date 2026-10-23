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
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { AdditiveBlending, type InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { toWorld, worldRotationY } from "@/lib/scene/frame";
import type { BodyNode, EmitterNode, LabelNode, Mood, NodeType, Scene, Transform } from "@/lib/scene/types";
import { GeometryCache } from "./scene-geometry";
import { MaterialCache } from "./scene-materials";

/** What a shadow may fall on. Receiving is one lookup per fragment; casting is what costs, and
 *  the builder decides that per body. */
const RECEIVES = new Set<NodeType>(["ground", "floor", "ceiling", "wall", "deck", "stage", "table", "cloth", "feature"]);

/** How much of an emitter's halo shows: nothing by day, half in the evening, all at night. */
const HALO_BY_MOOD: Record<Mood, number> = { day: 0, evening: 0.5, night: 1 };

const UP = new Vector3(0, 1, 0);
const scratchM = new Matrix4();
const scratchP = new Vector3();
const scratchQ = new Quaternion();
const scratchS = new Vector3();

/** A length in plan mm as metres — through the one mapping, so no second place divides. */
const lengthM = (mm: number) => toWorld({ x: mm, y: 0, z: 0 })[0];

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

function Instanced({
  geometry,
  material,
  instances,
  castShadow,
  receiveShadow,
}: {
  geometry: ReturnType<GeometryCache["get"]>[number]["geometry"];
  material: ReturnType<MaterialCache["get"]>;
  instances: Transform[];
  castShadow: boolean;
  receiveShadow: boolean;
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
  return <instancedMesh ref={ref} args={[geometry, material, instances.length]} castShadow={castShadow} receiveShadow={receiveShadow} />;
}

const BodyView = memo(function BodyView({ body, caches }: { body: BodyNode; caches: Caches }) {
  const built = caches.geometry.get(body);
  const n = body.instances.length;
  if (n === 0 || built.length === 0) return null;
  const castShadow = body.castShadow ?? true;
  const receiveShadow = RECEIVES.has(body.tag.type);
  if (n === 1) {
    const t = body.instances[0];
    const s = t.scale ?? 1;
    return (
      <group position={toWorld(t.at)} rotation={[0, worldRotationY(t.rotationDeg), 0]} scale={[t.mirrored ? -s : s, 1, s]}>
        {built.map((b, i) => (
          <mesh key={i} geometry={b.geometry} material={caches.material.get(b.material, !!t.mirrored)} castShadow={castShadow} receiveShadow={receiveShadow} />
        ))}
      </group>
    );
  }
  const anyMirrored = body.instances.some((t) => t.mirrored);
  return (
    <>
      {built.map((b, i) => (
        <Instanced
          key={i}
          geometry={b.geometry}
          material={caches.material.get(b.material, anyMirrored)}
          instances={body.instances}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        />
      ))}
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

export function SceneNodes({ scene, mood, author }: { scene: Scene; mood: Mood; author: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  // Created once per mount; disposed on unmount. A disposed geometry or texture is re-uploaded by
  // three on its next draw, so a StrictMode double-mount costs an upload, never a blank frame.
  const caches = useMemo<Caches>(() => ({ geometry: new GeometryCache(), material: new MaterialCache(invalidate) }), [invalidate]);
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

  return (
    <>
      {scene.nodes.map((node) => {
        switch (node.kind) {
          case "body":
            return <BodyView key={`b:${node.id}`} body={node} caches={caches} />;
          case "emitter":
            return <EmitterView key={`e:${node.id}`} node={node} mood={mood} caches={caches} />;
          case "label":
            return author ? <LabelView key={`l:${node.id}`} node={node} /> : null;
        }
      })}
    </>
  );
}
