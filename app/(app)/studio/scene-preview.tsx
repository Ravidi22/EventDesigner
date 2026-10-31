"use client";
// The 3D pane beside the sketch — the תלת-ממד tab's picture, built from the drawing AS IT IS BEING
// EDITED (the studio's in-memory document, before any autosave), floating in a corner of the canvas
// or taking half of it, so the room rises while it is laid instead of after a trip to the tab
// (Ravid, 2026-10-30: "see the prototype during my creation").
//
// WHAT IT IS NOT: a second viewer or a second builder. It is lib/scene/build.ts's `buildScene` over
// the same `LazySceneViewer` the tab mounts, in the designer's free camera, and it saves nothing —
// no viewpoints, no tour, no share; the camera work stays on the tab, whose settings (mood, place
// settings) this pane reads so the two pictures agree.
//
// THREE RULES, each learned on the tab:
//  1. THE BUILD IS NOT FREE (plan A: ~340 ms on the main thread), so it never runs per edit: the
//     document is let SETTLE — `SETTLE_MS` after the last change, like the autosave — and never
//     while a pointer button is held anywhere: a drag amends the document every frame, and a build
//     mid-drag would freeze the drag for a third of a second. A hidden pane builds nothing and
//     catches up when shown.
//  2. SHADERS COMPILE ONCE PER GL CONTEXT (a cold open ~2.5 s, warm ~1.1 s — scene-viewer.tsx), so
//     closing the pane HIDES the viewer (invisible, frame loop held at "never" through `hidden`)
//     and never unmounts it. The studio mounts this component on the first open and keeps it for
//     the screen's life; the toggle after that is instant.
//  3. THE CAMERA FOLLOWS THE SELECTION (lib/scene/focus.ts): a table selected on the sketch, the
//     pane stands where the tab's table portrait stands; a chandelier, at its height; several
//     things, back and up enough to frame them. The viewpoint's id is the selection, so a new
//     selection flies; the same thing moved past FOLLOW_MM re-flies; a camera the designer has
//     orbited away by hand is left alone until the selection changes. Nothing selected: the camera
//     stays, and orbit, wheel, double-click and WASD all work as on the tab.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { Product } from "@/lib/catalog/types";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { arrangedStructure } from "@/lib/design-document/features";
import type { EventPlan } from "@/lib/events/plan";
import { buildScene } from "@/lib/scene/build";
import { focusViewpoint } from "@/lib/scene/focus";
import { DEFAULT_SETTINGS, type Scene, type Vec3, type Viewpoint } from "@/lib/scene/types";
import { sightOf } from "@/lib/scene/viewpoints";
import { startPointerGesture } from "@/lib/studio/gesture";
import { SCENE_PREVIEW_MAX_PX, SCENE_PREVIEW_MIN_PX, type ScenePreviewLayout } from "@/lib/studio/storage";
import { LazySceneViewer } from "@/components/scene/lazy";
import type { SceneViewerProps } from "@/components/scene/scene-viewer";
import { detectDevice } from "@/components/scene/device";
import { CloseButton } from "@/components/close-button";
import { IconButton } from "@/components/icon-button";
import { useSceneSettings } from "../scene/use-scene-settings";
import type { SelectionRef } from "./canvas-stage";

/** How long the drawing must hold still before it is built again — the autosave's own pace. */
export const SETTLE_MS = 500;
/** The selected thing moved this far (its look point) and the camera flies after it. */
export const FOLLOW_MM = 300;
/** The corner pane's proportions — a landscape still, like the viewpoints the tab frames. */
export const ASPECT = 10 / 16;

export interface ScenePreviewProps {
  /** The studio's document, live — every edit, every drag frame. The pane decides when to build. */
  doc: DesignDocumentContent;
  plan: EventPlan;
  /** The catalog's rows: a dependency of the build (a shade or a size edited under the plan). */
  products: readonly Product[];
  selection: readonly SelectionRef[];
  /** The event, for the tab's saved mood; null for the scratch drawing. */
  eventId: string | null;
  /** The designer's view (labels, missing stage pieces). The meeting's passes show the client the
   *  room as the tab's client view does. */
  author: boolean;
  /** The studio's stage railing rule, as the studio already holds it. */
  railingAboveMm: number | null;
  open: boolean;
  layout: ScenePreviewLayout;
  widthPx: number;
  onClose: () => void;
  onLayout: (layout: ScenePreviewLayout) => void;
  onWidth: (px: number) => void;
}

interface Settled {
  doc: DesignDocumentContent;
  plan: EventPlan;
  products: readonly Product[];
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** The viewer behind a memo: this pane re-renders with the studio — every drag frame — while the
 *  viewer's props hold still between settles, so the Canvas and its nodes are not reconciled per
 *  frame of a drag on the sketch. */
const PaneViewer = memo(function PaneViewer(props: SceneViewerProps) {
  return <LazySceneViewer {...props} />;
});

export function ScenePreview({ doc, plan, products, selection, eventId, author, railingAboveMm, open, layout, widthPx, onClose, onLayout, onWidth }: ScenePreviewProps) {
  // --- rule 1: the settled document ---------------------------------------------------------------
  const latest = useRef<Settled>({ doc, plan, products });
  const [settled, setSettled] = useState<Settled | null>(null);
  const dirty = useRef(true);
  const held = useRef(false);
  const shown = useRef(open);
  const timer = useRef<number | undefined>(undefined);

  const commit = useCallback(() => {
    timer.current = undefined;
    // Held or hidden: the release / the show schedules again.
    if (held.current || !shown.current) return;
    dirty.current = false;
    setSettled({ ...latest.current });
  }, []);
  const schedule = useCallback(() => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(commit, SETTLE_MS);
  }, [commit]);
  useEffect(() => {
    latest.current = { doc, plan, products };
    dirty.current = true;
    schedule();
  }, [doc, plan, products, schedule]);
  useEffect(() => {
    shown.current = open;
    if (open && dirty.current) schedule();
  }, [open, schedule]);
  useEffect(() => {
    const down = () => {
      held.current = true;
    };
    const up = (e: PointerEvent) => {
      if (e.buttons !== 0) return;
      held.current = false;
      if (dirty.current) schedule();
    };
    const blur = () => {
      held.current = false;
      if (dirty.current) schedule();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("blur", blur);
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
  }, [schedule]);

  // --- the scene ----------------------------------------------------------------------------------
  const { settings } = useSceneSettings(eventId);
  const [device] = useState(() => (typeof window !== "undefined" ? detectDevice() : { shadows: true, maxDpr: 1.5, touch: false }));
  const structure = useMemo(() => (settled ? arrangedStructure(settled.plan.structure, settled.doc) : null), [settled]);
  const empty = !!settled && settled.doc.tables.length === 0 && settled.doc.placements.length === 0 && settled.plan.structure.walls.length === 0;
  const scene: Scene | null = useMemo(() => {
    if (!settled || !structure || empty) return null;
    // The catalog is primed by the studio (useCatalog), so the builder's synchronous resolves see
    // this studio's rows; `settled.products` is why a row edited under the plan rebuilds it.
    return buildScene({ doc: settled.doc, plan: settled.plan, structure, settings: { ...DEFAULT_SETTINGS, tableware: settings.tableware }, author, railingAboveMm });
  }, [settled, structure, empty, author, railingAboveMm, settings.tableware]);

  // --- rule 3: the camera follows the selection ---------------------------------------------------
  const sight = useMemo(() => (settled && structure ? sightOf(structure, settled.plan.zones, settled.doc) : null), [settled, structure]);
  const focus: Viewpoint | null = useMemo(() => {
    if (!settled || !structure || !scene || !sight || !selection.length) return null;
    // Positions from the SETTLED drawing, so a drag flies the camera once, where the thing landed.
    return focusViewpoint({ doc: settled.doc, structure, zones: settled.plan.zones, bounds: scene.bounds, selection, sight });
  }, [settled, structure, scene, sight, selection]);
  const viewpoints = useMemo(() => (focus ? [focus] : []), [focus]);
  // The designer orbited off the focused thing: leave the camera be until another is selected.
  const [leftId, setLeftId] = useState<string | null>(null);
  const focusRef = useRef(focus);
  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);
  const onLeave = useCallback(() => setLeftId(focusRef.current?.id ?? null), []);
  const activeId = focus && focus.id !== leftId ? focus.id : null;
  // The same selection, moved: fly after it (the viewer re-flies the author camera on `recentre`).
  const [recentre, setRecentre] = useState(0);
  const flown = useRef<{ id: string; look: Vec3 } | null>(null);
  useEffect(() => {
    if (!focus) {
      flown.current = null;
      return;
    }
    const prev = flown.current;
    if (prev && prev.id === focus.id && dist(prev.look, focus.look) >= FOLLOW_MM && focus.id !== leftId) setRecentre((n) => n + 1);
    flown.current = { id: focus.id, look: focus.look };
  }, [focus, leftId]);

  // --- the grip: the corner pane's size -----------------------------------------------------------
  const box = useRef<HTMLDivElement>(null);
  const resize = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const start = widthPx;
      const x0 = e.clientX;
      const rtl = (box.current && getComputedStyle(box.current).direction === "rtl") || document.dir === "rtl";
      const room = box.current?.parentElement?.clientWidth ?? SCENE_PREVIEW_MAX_PX;
      const cap = Math.min(SCENE_PREVIEW_MAX_PX, Math.max(SCENE_PREVIEW_MIN_PX, Math.round(room * 0.6)));
      startPointerGesture(e, {
        onMove: (m) => {
          // The grip is on the pane's START edge; pulled toward the start (right in RTL) it grows.
          const dx = (m.clientX - x0) * (rtl ? 1 : -1);
          onWidth(Math.min(cap, Math.max(SCENE_PREVIEW_MIN_PX, Math.round(start + dx))));
        },
      });
    },
    [widthPx, onWidth],
  );

  const corner = layout === "corner" || !open;
  const split = layout === "split";
  const shell = corner
    ? "absolute bottom-16 end-3 z-30 rounded-md border border-border bg-surface shadow-floating"
    : "relative min-w-0 flex-1 border-s border-border bg-surface";
  return (
    <div
      ref={box}
      className={shell + " overflow-hidden " + (open ? "" : "invisible pointer-events-none")}
      style={corner ? { width: widthPx, height: Math.round(widthPx * ASPECT) } : undefined}
      aria-hidden={!open}
      data-scene-preview={open ? layout : "hidden"}
    >
      {scene ? (
        <PaneViewer
          scene={scene}
          settings={settings}
          mode="author"
          author={author}
          device={device}
          viewpoints={viewpoints}
          zones={plan.all}
          activeId={activeId}
          recentre={recentre}
          tour={null}
          playing={false}
          onLeave={onLeave}
          hidden={!open}
          compact={!split}
          className="h-full w-full"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-inset px-4 text-center text-caption text-muted">
          {empty ? "אין עדיין מה להציג — הניחו שולחן או פריט על התוכנית" : "בונה את החלל…"}
        </div>
      )}
      {/* The pane's own chrome, over the picture: the way out, and the one size question. */}
      <div className="absolute top-2 end-2 flex items-center gap-1 rounded-pill bg-surface/90 p-0.5 shadow-lifted">
        <IconButton
          label={split ? "חזרה לפינת הסקיצה" : "הרחבה לחצי מהסקיצה"}
          onClick={() => onLayout(split ? "corner" : "split")}
          tabIndex={open ? 0 : -1}
        >
          {split ? <Minimize2 className="h-4 w-4" strokeWidth={2} /> : <Maximize2 className="h-4 w-4" strokeWidth={2} />}
        </IconButton>
        <CloseButton label="סגירת התלת-ממד" onClick={onClose} tabIndex={open ? 0 : -1} />
      </div>
      {corner && (
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
      )}
    </div>
  );
}
