"use client";
// The only way a screen mounts the viewer: `next/dynamic` with `ssr: false`, called from a client
// component (Next 16: `ssr: false` is refused inside a server component), so three.js is its own
// chunk, fetched when the scene first renders and never part of /studio's first paint.
import dynamic from "next/dynamic";
import type { SceneViewerProps } from "./scene-viewer";

/** What stands in the viewer's box while its chunk loads. The loading render gets no props from
 *  the caller, so it fills whatever box it is given. */
export function SceneSkeleton({ className = "h-full w-full" }: { className?: string }) {
  return (
    <div dir="rtl" className={"flex items-center justify-center rounded-md bg-inset " + className} aria-busy>
      <span className="text-caption text-muted">טוען תלת-ממד…</span>
    </div>
  );
}

export const LazySceneViewer = dynamic<SceneViewerProps>(() => import("./scene-viewer"), {
  ssr: false,
  loading: () => <SceneSkeleton />,
});
