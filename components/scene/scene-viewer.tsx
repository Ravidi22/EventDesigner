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
//
// SHADERS ARE COMPILED BEFORE THE FIRST FRAME, off the main thread (`FrameGate`). The first render
// of a scene compiles every program it uses, and the browser waits for the driver: on Windows a cold
// compile of plan A froze the page for 7.6 s (2026-10-27 — a freshly installed machine has an empty
// shader cache). `compileAsync` hands the programs to the driver's parallel compiler and polls; the
// loop is held at "never" until they are ready, so the page stays live and shows "מכין את החלל…".
import { type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

/** Inside the Canvas, LAST (its layout effect must run after the lights, the environment and the
 *  nodes have mounted): the frame loop runs only while the document is visible and the scene's
 *  programs are compiled. A new scene holds it at "never" — with the frame already asked for
 *  cleared, or fiber would still draw it — until `compileAsync` resolves; then one frame. A scene
 *  whose programs are all cached resolves on the next poll. (A playing tour freezes its clock on the
 *  visibility signal too — ./scene-camera.tsx.) */
function FrameGate({ scene, onWarm }: { scene: Scene; onWarm: (warm: boolean) => void }) {
  const get = useThree((s) => s.get);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);
  const shown = useRef(true);
  const compiling = useRef(false);
  const sync = useCallback(() => {
    if (shown.current && !compiling.current) {
      setFrameloop("demand");
      invalidate();
    } else {
      setFrameloop("never");
      get().internal.frames = 0;
    }
  }, [get, setFrameloop, invalidate]);

  useEffect(() => {
    const onVisibility = () => {
      shown.current = document.visibilityState !== "hidden";
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      setFrameloop("demand");
    };
  }, [sync, setFrameloop]);

  useLayoutEffect(() => {
    let live = true;
    compiling.current = true;
    sync();
    const slow = window.setTimeout(() => live && onWarm(false), 150);
    const { gl, scene: graph, camera } = get();
    gl.compileAsync(graph, camera)
      .catch(() => undefined)
      .then(() => {
        window.clearTimeout(slow);
        if (!live) return;
        compiling.current = false;
        onWarm(true);
        sync();
      });
    return () => {
      live = false;
      window.clearTimeout(slow);
    };
  }, [scene, get, sync, onWarm]);
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
  // False only while a compile has been running a moment (FrameGate) — the pill, not a blank box.
  const [warm, setWarm] = useState(true);
  const readout = useRef<HTMLSpanElement>(null);
  const emitters = useMemo(() => scene.nodes.filter((n): n is EmitterNode => n.kind === "emitter"), [scene]);
  if (!webgl) return <NoWebGL className={className} />;
  return (
    <div className={"relative overflow-hidden " + className}>
      <Canvas
        frameloop="demand"
        dpr={[1, profile.maxDpr]}
        shadows={profile.shadows}
        // Tone mapping is part of every lit program: set with the renderer, before anything compiles.
        gl={{ antialias: true, powerPreference: "high-performance", toneMapping: NeutralToneMapping, outputColorSpace: SRGBColorSpace }}
        camera={{ fov: DEFAULT_FOV_DEG, near: 0.05, far: 800 }}
        onCreated={({ gl }) => {
          // Neutral (Khronos PBR Neutral) keeps the designer's colours true — ACES shifts a blush cloth
          // toward salmon and crushes a dark one; this is a product shown to a client.
          gl.toneMapping = NeutralToneMapping;
          gl.outputColorSpace = SRGBColorSpace;
          // Each program's first use otherwise reads back its info logs — synchronous round trips
          // to the GPU process, ~320 ms over plan A's programs (profiled 2026-10-27). A broken shader
          // then draws nothing instead of logging; flip this back on to debug one.
          gl.debug.checkShaderErrors = false;
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
        {perf && <PerfProbe target={readout} stats={scene.stats} />}
        <FrameGate scene={scene} onWarm={setWarm} />
      </Canvas>
      {mode === "author" && (
        <div dir="rtl" className="pointer-events-none absolute bottom-3 end-3 rounded-pill bg-surface/85 px-3 py-1 text-[11px] text-muted shadow-lifted">
          גרירה: סיבוב · לחצן ימני: הזזה · גלגלת: זום לנקודה · לחיצה כפולה: מיקוד · <span dir="ltr">W A S D</span>: תנועה
        </div>
      )}
      {!warm && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span dir="rtl" className="rounded-pill bg-surface/90 px-3 py-1 text-xs text-muted shadow-lifted">
            מכין את החלל…
          </span>
        </div>
      )}
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
