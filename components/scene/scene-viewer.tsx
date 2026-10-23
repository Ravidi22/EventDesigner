"use client";
// The one viewer: a demand-rendered Canvas with the lights, the nodes and a camera. Loaded only
// through ./lazy.tsx (next/dynamic, ssr: false), so three.js never reaches a server bundle or a
// page that never opens the tab. A still picture costs no frames: fiber renders when something
// calls `invalidate()` — the controls while they move, the nodes when the scene or mood changes,
// the lights and the level of detail when the camera settles.
//
// The device profile (./device.ts) is applied here: the pixel-ratio cap, the shadow map, how many
// emitters get a real light, the LOD scale and the fog. `?perf=1` (read once on mount, client
// only) mounts a small readout fed by refs from fiber's after-render effect — draw calls,
// triangles, the frame's CPU time, the first frame since mount, the body and instance counts —
// for the phone session; nothing in it is React state. While the tab is hidden the frame loop is
// set to "never", and back to "demand" with one invalidate when it shows again.
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, addAfterEffect, useFrame, useThree } from "@react-three/fiber";
import { NeutralToneMapping, SRGBColorSpace } from "three";
import { Box } from "lucide-react";
import type { ResolvedZone } from "@/lib/venues/zone";
import { DEFAULT_FOV_DEG, type EmitterNode, type Scene, type SceneSettings, type Tour, type Viewpoint } from "@/lib/scene/types";
import { type DeviceProfile, resolveDevice } from "./device";
import { type CameraPose, SceneCamera } from "./scene-camera";
import { EmitterLights, SceneLights } from "./scene-lights";
import { SceneNodes } from "./scene-nodes";

export interface SceneViewerProps {
  scene: Scene;
  settings: SceneSettings;
  /** author: the designer's orbit camera (a viewpoint chosen flies it there); curated: the
   *  client's — standing at the active viewpoint, the head turned by a drag, the view zoomed by a
   *  wheel or a pinch, moved only by a viewpoint (./scene-camera.tsx). */
  mode: "author" | "curated";
  /** The designer's view (labels). Never true on a client surface. */
  author: boolean;
  /** From ./device.ts detectDevice(); absent or partial = a capable machine for what is missing. */
  device?: Partial<DeviceProfile>;
  /** What the chips name: the designer's saved list, else the defaults (lib/scene/viewpoints.ts
   *  viewpointsOf). */
  viewpoints: Viewpoint[];
  /** Every zone on the property (EventPlan.all) — a fly between two lifts over the wall. */
  zones: ResolvedZone[];
  /** The viewpoint the camera should be at; changing it flies there (1.2 s). */
  activeId: string | null;
  /** Bump when the active viewpoint is chosen again: the head comes back to centre. */
  recentre?: number;
  /** The guided tour (lib/scene/viewpoints.ts tourOf) and whether it plays. */
  tour: Tour | null;
  playing: boolean;
  /** A tour leg began: `index` into `tour.stops`, and that stop's viewpoint. Once per leg. */
  onTourStep?: (index: number, viewpointId: string) => void;
  /** The tour stopped by itself (a one-way tour ended, or the designer grabbed the camera). */
  onTourEnd?: () => void;
  /** Author: the designer orbited off the active viewpoint. */
  onLeave?: () => void;
  /** The camera's pose in plan mm, at most once per animation frame — what "save the current
   *  view" takes. Both modes. */
  onCamera?: (pose: CameraPose) => void;
  /** Sizing for the viewer's box (the Canvas fills it). */
  className?: string;
}

let webglSupport: boolean | null = null;

/** Asked once per page: three r163+ needs WebGL 2. */
function hasWebGL(): boolean {
  if (webglSupport === null) {
    try {
      webglSupport = typeof document !== "undefined" && !!document.createElement("canvas").getContext("webgl2");
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

/** `?perf=1` on the page that mounts the viewer. Read once, on the client. */
function perfAsked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("perf") === "1";
  } catch {
    return false;
  }
}

function NoWebGL({ className }: { className: string }) {
  return (
    <div dir="rtl" className={"flex items-center justify-center rounded-md border border-border bg-inset p-6 text-center " + className}>
      <div className="max-w-xs">
        <Box className="mx-auto mb-3 h-8 w-8 text-muted" strokeWidth={1.4} aria-hidden />
        <p className="text-sm font-semibold text-ink">הדפדפן הזה לא מציג תלת-ממד</p>
        <p className="mt-1 text-caption text-muted">הסקיצה והפלטים זמינים כרגיל. לצפייה בחלל אפשר לפתוח את הקישור בדפדפן עדכני.</p>
      </div>
    </div>
  );
}

/** Inside the Canvas: stop the loop while the document is hidden, resume with a frame when it
 *  shows. (A playing tour freezes its clock on the same signal — ./scene-camera.tsx.) */
function VisibilityPause() {
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === "hidden") setFrameloop("never");
      else {
        setFrameloop("demand");
        invalidate();
      }
    };
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      document.removeEventListener("visibilitychange", sync);
      setFrameloop("demand");
    };
  }, [setFrameloop, invalidate]);
  return null;
}

/** Inside the Canvas: the numbers for the readout, written into its element after every frame.
 *  `useFrame` marks the frame's start (it runs before the render); the global after-effect reads
 *  `renderer.info` once the frame is drawn. No state, no re-render. */
function PerfProbe({ target, stats }: { target: RefObject<HTMLElement | null>; stats: Scene["stats"] }) {
  const gl = useThree((s) => s.gl);
  const mountedAt = useRef(performance.now());
  const frameStart = useRef(0);
  const firstFrameMs = useRef<number | null>(null);
  const frames = useRef(0);
  useFrame(() => {
    frameStart.current = performance.now();
  });
  useEffect(
    () =>
      addAfterEffect(() => {
        const now = performance.now();
        if (firstFrameMs.current === null) firstFrameMs.current = now - mountedAt.current;
        frames.current++;
        const r = gl.info.render;
        const el = target.current;
        if (!el) return;
        el.textContent =
          `${r.calls} calls · ${r.triangles.toLocaleString("en-US")} tris · ` +
          `${(now - frameStart.current).toFixed(1)} ms · first ${firstFrameMs.current.toFixed(0)} ms · ` +
          `${stats.bodies} bodies / ${stats.instances} inst · #${frames.current}`;
      }),
    [gl, target, stats],
  );
  return null;
}

export default function SceneViewer({
  scene,
  settings,
  mode,
  author,
  device,
  viewpoints,
  zones,
  activeId,
  recentre,
  tour,
  playing,
  onTourStep,
  onTourEnd,
  onLeave,
  onCamera,
  className = "",
}: SceneViewerProps) {
  const webgl = useMemo(() => hasWebGL(), []);
  const profile = useMemo(() => resolveDevice(device), [device]);
  const [perf] = useState(perfAsked);
  const readout = useRef<HTMLSpanElement>(null);
  const emitters = useMemo(() => scene.nodes.filter((n): n is EmitterNode => n.kind === "emitter"), [scene]);
  if (!webgl) return <NoWebGL className={className} />;
  return (
    <div className={"relative overflow-hidden " + className}>
      <Canvas
        frameloop="demand"
        dpr={[1, profile.maxDpr]}
        shadows={profile.shadows}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: DEFAULT_FOV_DEG, near: 0.05, far: 800 }}
        onCreated={({ gl }) => {
          // Neutral (Khronos PBR Neutral) keeps the designer's colours true — ACES shifts a blush cloth
          // toward salmon and crushes a dark one; this is a product shown to a client.
          gl.toneMapping = NeutralToneMapping;
          gl.outputColorSpace = SRGBColorSpace;
        }}
      >
        <SceneLights mood={settings.mood} bounds={scene.bounds} roofedMm={scene.roofedMm} shadows={profile.shadows} fogScale={profile.fogScale} />
        <EmitterLights emitters={emitters} mood={settings.mood} count={profile.pointLights} />
        <SceneNodes scene={scene} mood={settings.mood} author={author} lodScale={profile.lodScale} />
        <SceneCamera
          mode={mode}
          bounds={scene.bounds}
          roofedMm={scene.roofedMm}
          viewpoints={viewpoints}
          zones={zones}
          activeId={activeId}
          recentre={recentre}
          tour={tour}
          playing={playing}
          onTourStep={onTourStep}
          onTourEnd={onTourEnd}
          onLeave={onLeave}
          onCamera={onCamera}
        />
        <VisibilityPause />
        {perf && <PerfProbe target={readout} stats={scene.stats} />}
      </Canvas>
      {perf && (
        <div dir="ltr" className="pointer-events-none absolute bottom-3 start-3 rounded-md bg-surface/90 px-2.5 py-1 text-xs text-muted shadow-floating">
          <span ref={readout} className="whitespace-nowrap tabular-nums">
            perf…
          </span>
        </div>
      )}
    </div>
  );
}
