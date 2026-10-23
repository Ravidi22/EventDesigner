"use client";
// The one viewer: a demand-rendered Canvas with the lights, the nodes and a camera. Loaded only
// through ./lazy.tsx (next/dynamic, ssr: false), so three.js never reaches a server bundle or a
// page that never opens the tab. A still picture costs no frames: fiber renders when something
// calls `invalidate()` — the controls while they move, the nodes when the scene or mood changes.
import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { Box } from "lucide-react";
import { DEFAULT_FOV_DEG, type Scene, type SceneSettings } from "@/lib/scene/types";
import { AuthorCamera, OverviewCamera, type CameraPose } from "./scene-camera";
import { SceneLights } from "./scene-lights";
import { SceneNodes } from "./scene-nodes";

export interface SceneViewerProps {
  scene: Scene;
  settings: SceneSettings;
  /** author: a free camera for setting viewpoints; curated: no controls (phase C adds the fly). */
  mode: "author" | "curated";
  /** The designer's view (labels). Never true on a client surface. */
  author: boolean;
  /** From ./device.ts detectDevice(); absent = a capable machine. */
  device?: { shadows: boolean; maxDpr: number };
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

export default function SceneViewer({ scene, settings, mode, author, device, onCamera, className = "" }: SceneViewerProps) {
  const webgl = useMemo(hasWebGL, []);
  const shadows = device?.shadows ?? true;
  if (!webgl) return <NoWebGL className={className} />;
  return (
    <div className={"relative overflow-hidden " + className}>
      <Canvas
        frameloop="demand"
        dpr={[1, device?.maxDpr ?? 1.5]}
        shadows={shadows}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: DEFAULT_FOV_DEG, near: 0.05, far: 800 }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.outputColorSpace = SRGBColorSpace;
        }}
      >
        <SceneLights mood={settings.mood} bounds={scene.bounds} roofedMm={scene.roofedMm} shadows={shadows} />
        <SceneNodes scene={scene} mood={settings.mood} author={author} />
        {mode === "author" ? <AuthorCamera bounds={scene.bounds} roofedMm={scene.roofedMm} onCamera={onCamera} /> : <OverviewCamera bounds={scene.bounds} />}
      </Canvas>
    </div>
  );
}
