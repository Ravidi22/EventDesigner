"use client";
// THE 3D PANE OF THE CATALOG'S EDITORS — the thing being drawn, standing in a room of its own (the
// element model, docs/superpowers/specs/2026-11-07-element-model-design.md Stage 2; Ravid,
// 2026-11-07: "add an option to see the 3D in the shape editor… also to the multi element product").
// The shape editor shows its one item (lib/scene/item-scene.ts itemScene); the composite editor its
// whole arrangement (compositionScene). A shelf typed a metre up a back-bar is a number on a panel
// and a box on the חזית view; here it is the shelf.
//
// WHAT IT IS: the studio's own picture — lib/scene/build.ts's `buildScene` drawn by the same
// `LazySceneViewer` the /scene tab and the studio's pane mount, in the designer's free camera, framed
// on the subject as the tab's portrait frames a table (lib/scene/focus.ts). The host hands in a
// SUBJECT: a key naming what the room is built from, and the build. A render that changes nothing
// the key names (a selection, a hover) builds nothing.
//
// THE STUDIO PANE'S RULES HOLD (app/(app)/studio/scene-preview.tsx): the build waits for the subject
// to SETTLE (useSettled — after the last edit, never while a button is held: a resize grip drags the
// shape every frame); closing HIDES the viewer and never unmounts it (shaders compile once per GL
// context — the host mounts this on the first open and keeps it); the viewer sits behind a memo so
// the host's own re-renders reconcile nothing in the Canvas.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ITEM_SCENE_SETTINGS } from "@/lib/scene/item-scene";
import type { Scene, Viewpoint } from "@/lib/scene/types";
import { startPointerGesture } from "@/lib/studio/gesture";
import { LazySceneViewer } from "@/components/scene/lazy";
import type { SceneViewerProps } from "@/components/scene/scene-viewer";
import { detectDevice } from "@/components/scene/device";
import { CloseButton } from "@/components/close-button";
import { useSettled } from "../studio/use-settled";

/** How long the subject rests before the room is built again — the studio pane's pace. */
export const SCENE_PANE_SETTLE_MS = 500;
/** The pane's proportions and size range — the studio's corner pane's. */
const ASPECT = 10 / 16;
const MIN_PX = 260;
const MAX_PX = 720;
const DEFAULT_PX = 380;

/** What the pane shows: `key` names everything the room is built from (a change to anything else
 *  builds nothing); `build` makes the room and the place to look at it from. */
export interface SceneSubject {
  key: string;
  /** Null when there turns out to be nothing to stand in the room. */
  build: () => { scene: Scene; focus: Viewpoint | null } | null;
}

const PaneViewer = memo(function PaneViewer(props: SceneViewerProps) {
  return <LazySceneViewer {...props} />;
});

export interface ScenePaneProps {
  /** Null while there is nothing to show (an item with no shape, an empty arrangement). */
  subject: SceneSubject | null;
  open: boolean;
  onClose: () => void;
  /** What the pane says with no subject. */
  emptyText: string;
}

/** The room a subject builds, once it has SETTLED: the subject is held as a snapshot that changes
 *  identity only when its key does (React's own pattern for state derived from a prop — "storing
 *  information from previous renders": adjusted during the render that sees the change, never in an
 *  effect), then let rest `SCENE_PANE_SETTLE_MS` and never built while a button is held (useSettled).
 *  `pending`: a subject is there whose latest key has not been built yet. Shared by this pane and the
 *  shape editor's side views (elevation-canvas.tsx). */
export function useSettledScene(subject: SceneSubject | null): { scene: Scene | null; focus: Viewpoint | null; pending: boolean } {
  const key = subject?.key ?? "";
  const [snap, setSnap] = useState(() => ({ key, subject }));
  if (snap.key !== key) setSnap({ key, subject });
  const settled = useSettled(snap.key === key ? snap : { key, subject }, SCENE_PANE_SETTLE_MS);
  const built = useMemo(() => (settled.subject ? settled.subject.build() : null), [settled]);
  return { scene: built?.scene ?? null, focus: built?.focus ?? null, pending: !!subject && settled.key !== key };
}

export function ScenePane({ subject, open, onClose, emptyText }: ScenePaneProps) {
  const { scene, focus, pending } = useSettledScene(subject);
  const [device] = useState(() => (typeof window !== "undefined" ? detectDevice() : undefined));
  const viewpoints = useMemo(() => (focus ? [focus] : []), [focus]);
  // The designer orbited away: the camera is theirs until the subject is another.
  const [leftId, setLeftId] = useState<string | null>(null);
  const focusRef = useRef(focus);
  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);
  const onLeave = useCallback(() => setLeftId(focusRef.current?.id ?? null), []);
  const activeId = focus && focus.id !== leftId ? focus.id : null;
  // The subject grew or shrank under a camera nobody has moved: the frame follows (the eye re-flies
  // on `recentre`; the focus id itself names the subject and rarely changes).
  const [recentre, setRecentre] = useState(0);
  const flown = useRef<Viewpoint | null>(null);
  useEffect(() => {
    if (!focus) {
      flown.current = null;
      return;
    }
    const prev = flown.current;
    if (prev && prev.id === focus.id && leftId !== focus.id && Math.hypot(prev.eye.x - focus.eye.x, prev.eye.y - focus.eye.y, prev.eye.z - focus.eye.z) >= 300) setRecentre((n) => n + 1);
    flown.current = focus;
  }, [focus, leftId]);

  // The pane's size — this editing session's only.
  const [widthPx, setWidthPx] = useState(DEFAULT_PX);
  const box = useRef<HTMLDivElement>(null);
  const resize = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const start = widthPx;
      const x0 = e.clientX;
      const rtl = (box.current && getComputedStyle(box.current).direction === "rtl") || document.dir === "rtl";
      const room = box.current?.parentElement?.clientWidth ?? MAX_PX;
      const cap = Math.min(MAX_PX, Math.max(MIN_PX, Math.round(room * 0.6)));
      startPointerGesture(e, {
        onMove: (m) => {
          // The grip is on the pane's START edge; pulled toward the start (right in RTL) it grows.
          const dx = (m.clientX - x0) * (rtl ? 1 : -1);
          setWidthPx(Math.min(cap, Math.max(MIN_PX, Math.round(start + dx))));
        },
      });
    },
    [widthPx],
  );

  return (
    <div
      ref={box}
      className={"absolute bottom-16 end-3 z-30 overflow-hidden rounded-md border border-border bg-surface shadow-floating " + (open ? "" : "invisible pointer-events-none")}
      style={{ width: widthPx, height: Math.round(widthPx * ASPECT) }}
      aria-hidden={!open}
      data-scene-pane={open ? "open" : "hidden"}
    >
      {scene ? (
        <PaneViewer
          scene={scene}
          settings={ITEM_SCENE_SETTINGS}
          mode="author"
          author
          device={device}
          viewpoints={viewpoints}
          zones={[]}
          activeId={activeId}
          recentre={recentre}
          tour={null}
          playing={false}
          onLeave={onLeave}
          hidden={!open}
          compact
          className="h-full w-full"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-inset px-4 text-center text-caption text-muted">
          {pending ? "בונה את החלל…" : emptyText}
        </div>
      )}
      <div className="absolute top-2 end-2 rounded-pill bg-surface/90 p-0.5 shadow-lifted">
        <CloseButton label="סגירת התלת-ממד" onClick={onClose} tabIndex={open ? 0 : -1} />
      </div>
      <button
        type="button"
        aria-label="שינוי גודל התלת-ממד"
        title="גרירה משנה את הגודל"
        onPointerDown={resize}
        tabIndex={-1}
        className="absolute start-0 top-0 h-5 w-5 cursor-nesw-resize touch-none text-muted/70 hover:text-accent"
      >
        <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden>
          <path d="M3 9 L9 3 M3 15 L15 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
