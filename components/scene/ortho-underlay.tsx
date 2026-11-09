"use client";
// THE ROOM UNDER THE DRAWING — the shape editor's side views (חזית · צד, app/(app)/catalog/
// elevation-canvas.tsx; spec docs/superpowers/specs/2026-11-09-backdrops-front-drawing-and-text-
// design.md §4, DECIDE 4): the item's 3D drawn by an ORTHOGRAPHIC camera at exactly the scale the
// canvas draws its boxes at, behind them. Orthographic because the view is a drawing — a shelf a
// metre up is a metre up the paper wherever it stands, and a box drawn over it lines up with it.
//
// WHAT IT IS: the viewer's own parts (SceneLights, EmitterLights, SceneNodes, FrameGate — ./scene-
// viewer.tsx) under a camera this component places from an `OrthoFrame` (lib/element/elevation.ts
// orthoFrame — the canvas's SETTLED view; PlanCanvas carries the whole layer through a pan with the
// HUD's CSS transform, so nothing here renders per frame). Daylight, no sky dome and no fog: the
// canvas's own colour and grid show through a transparent background.
//
// THE VIEWER'S RULES HOLD: demand-rendered; the programs are compiled before the first frame
// (FrameGate); the point-light pool is the profile's full size, never sized by the content; the
// host mounts this on the first visit to a side view and then HIDES it (`hidden` holds the frame
// loop at "never") — never unmounts it, so its shaders compile once per editing session.
import { useLayoutEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { NeutralToneMapping, SRGBColorSpace, type OrthographicCamera } from "three";
import type { OrthoFrame } from "@/lib/element/elevation";
import type { EmitterNode, Scene } from "@/lib/scene/types";
import { resolveDevice } from "./device";
import { EmitterLights, SceneLights } from "./scene-lights";
import { SceneNodes } from "./scene-nodes";
import { FrameGate, hasWebGL } from "./scene-viewer";

export interface OrthoUnderlayProps {
  scene: Scene;
  frame: OrthoFrame;
  /** The view is the plan: kept mounted, its frame loop held. */
  hidden?: boolean;
  className?: string;
}

/** Puts the frame on fiber's orthographic camera — before the nodes' level of detail is judged
 *  against it (this sits ahead of them in the tree, so its layout effect runs first). `manual`
 *  keeps fiber from re-deriving the frustum from the canvas's pixel size on a resize. */
function OrthoCamera({ frame }: { frame: OrthoFrame }) {
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const { left, right, top, bottom, near, far, rotationY } = frame;
  const [px, py, pz] = frame.position;
  useLayoutEffect(() => {
    const camera = get().camera as OrthographicCamera & { manual?: boolean };
    camera.manual = true;
    camera.left = left;
    camera.right = right;
    camera.top = top;
    camera.bottom = bottom;
    camera.near = near;
    camera.far = far;
    camera.zoom = 1;
    camera.position.set(px, py, pz);
    camera.rotation.set(0, rotationY, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    invalidate();
  }, [get, left, right, top, bottom, near, far, px, py, pz, rotationY, invalidate]);
  return null;
}

const noop = () => {};

export default function OrthoUnderlay({ scene, frame, hidden = false, className = "" }: OrthoUnderlayProps) {
  if (!hasWebGL()) return null;
  const profile = resolveDevice(undefined);
  const emitters = scene.nodes.filter((n): n is EmitterNode => n.kind === "emitter");
  return (
    <div className={"relative overflow-hidden " + className}>
      <Canvas
        orthographic
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true, toneMapping: NeutralToneMapping, outputColorSpace: SRGBColorSpace }}
        camera={{ manual: true, near: frame.near, far: frame.far, position: frame.position }}
        onCreated={({ gl }) => {
          gl.toneMapping = NeutralToneMapping;
          gl.outputColorSpace = SRGBColorSpace;
          gl.setClearColor(0x000000, 0);
          gl.debug.checkShaderErrors = false;
        }}
      >
        <OrthoCamera frame={frame} />
        <SceneLights mood="day" bounds={scene.bounds} roofedMm={scene.roofedMm} shadows={false} sky={false} fog={false} />
        <EmitterLights emitters={emitters} mood="day" count={profile.pointLights} />
        <SceneNodes scene={scene} mood="day" author={false} lodScale={1} />
        <FrameGate scene={scene} hidden={hidden} onWarm={noop} />
      </Canvas>
    </div>
  );
}
