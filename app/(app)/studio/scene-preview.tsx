"use client";
// The 3D card on the sketch — the תלת-ממד tab's picture, built from the drawing AS IT IS BEING
// EDITED (the studio's in-memory document, before any autosave), floating as a card over the canvas
// and the end panel (2026-11-09, the studio shell: no split layout), so the room rises while it is laid instead
// of after a trip to the tab (Ravid, 2026-10-30: "see the prototype during my creation").
//
// WHERE IT SITS (the user, 2026-11-10: "draggable, and position it on the bottom left — it can be
// over the in-plan list but not on the catalog list; the resize grip on the other side, angled
// correctly"): in the canvas card's AREA — the canvas column and the end panel beside it, never the
// catalog rail — anchored by its end-bottom corner (bottom-left on a Hebrew screen, over the end
// panel's foot). Its header drags it anywhere in that area; the grip on its TOP-START corner, the far
// corner from the anchor, grows it up and toward the start. Both are held inside the area as drawn
// (lib/studio/scene-card.ts, `check:scene-card`), and both run on the card's own state while the hand
// moves and write the studio's preference once, on release — a drag never re-renders the studio.
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
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { Box } from "lucide-react";
import type { Product } from "@/lib/catalog/types";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { arrangedStructure } from "@/lib/design-document/features";
import type { EventPlan } from "@/lib/events/plan";
import { buildScene } from "@/lib/scene/build";
import { focusViewpoint } from "@/lib/scene/focus";
import { DEFAULT_SETTINGS, type Scene, type Vec3, type Viewpoint } from "@/lib/scene/types";
import { sightOf } from "@/lib/scene/viewpoints";
import { startPointerGesture } from "@/lib/studio/gesture";
import { ASPECT, DEFAULT_CARD_POS, grownWidth, movedCard, placeCard, type CardPlace, type CardRoom } from "@/lib/studio/scene-card";
import type { SceneCardPos } from "@/lib/studio/storage";
import { LazySceneViewer } from "@/components/scene/lazy";
import type { SceneViewerProps } from "@/components/scene/scene-viewer";
import { detectDevice } from "@/components/scene/device";
import { CloseButton } from "@/components/close-button";
import { useSceneSettings } from "../scene/use-scene-settings";
import type { SelectionRef } from "./canvas-stage";

/** How long the drawing must hold still before it is built again — the autosave's own pace. */
export const SETTLE_MS = 500;
/** The selected thing moved this far (its look point) and the camera flies after it. */
export const FOLLOW_MM = 300;
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
  /** The stored width and corner; the card draws them held inside its area (`placeCard`). */
  widthPx: number;
  pos?: SceneCardPos;
  /** The canvas column: the card's area runs from the canvas card's end edge to this column's start
   *  edge — where the catalog rail begins. The card is a child of the canvas card itself. */
  column: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** The card let go after a drag or a resize — written once, on release. */
  onPlace: (place: { widthPx: number; pos: SceneCardPos }) => void;
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

export function ScenePreview({ doc, plan, products, selection, eventId, author, railingAboveMm, open, widthPx, pos, column, onClose, onPlace }: ScenePreviewProps) {
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

  // --- where the card stands: the area it is held inside ------------------------------------------
  // Measured by ResizeObserver — the canvas card when the window changes it, the column when the end
  // panel folds — so a state write happens only when one of them actually changes size.
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<CardRoom | null>(null);
  const rtl = useRef(true);
  useLayoutEffect(() => {
    const area = box.current?.parentElement;
    const col = column.current;
    if (!area || !col) return;
    rtl.current = getComputedStyle(area).direction === "rtl";
    const measure = () => {
      const a = area.getBoundingClientRect();
      const c = col.getBoundingClientRect();
      // From the area's end edge to the column's start edge: the end panel and the canvas, not the rail.
      const w = Math.round(rtl.current ? c.right - a.left : a.right - c.left);
      const next = { w, h: Math.round(a.height) };
      setRoom((cur) => (cur && cur.w === next.w && cur.h === next.h ? cur : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    ro.observe(col);
    return () => ro.disconnect();
  }, [column]);
  // While a hand moves it, the card's own state; otherwise the stored preference, held to the area.
  const [live, setLive] = useState<CardPlace | null>(null);
  const drawn = live ?? placeCard(widthPx, pos ?? DEFAULT_CARD_POS, room);

  // --- the header drags it; the top-start grip sizes it -------------------------------------------
  const gesture = useCallback(
    (e: ReactPointerEvent<HTMLElement>, step: (from: CardPlace, dx: number, dy: number) => CardPlace) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const from = drawn;
      const x0 = e.clientX;
      const y0 = e.clientY;
      let last = from;
      startPointerGesture(e, {
        onMove: (m) => {
          last = step(from, m.clientX - x0, m.clientY - y0);
          setLive(last);
        },
        onEnd: () => {
          setLive(null);
          if (last !== from) onPlace({ widthPx: last.width, pos: { end: last.end, bottom: last.bottom } });
        },
      });
    },
    [drawn, onPlace],
  );
  const drag = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      // The ✕ is a button of its own; a press on it is a click, not a drag.
      if ((e.target as HTMLElement).closest("button")) return;
      gesture(e, (from, dx, dy) => movedCard(from, dx, dy, rtl.current, room));
    },
    [gesture, room],
  );
  const resize = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => gesture(e, (from, dx, dy) => ({ ...from, width: grownWidth(from, dx, dy, rtl.current, room) })),
    [gesture, room],
  );

  return (
    <div
      ref={box}
      className={
        "absolute z-30 flex flex-col overflow-hidden rounded-md border border-border bg-surface shadow-floating " +
        (open ? "" : "invisible pointer-events-none")
      }
      style={{ width: drawn.width, insetInlineEnd: drawn.end, bottom: drawn.bottom }}
      aria-hidden={!open}
      data-scene-preview={open ? "card" : "hidden"}
    >
      {/* The card's header: what it is, the way out (every popup's ✕) — and the handle it is dragged
          by. Kept clear of the grip in the top-start corner. */}
      <div
        onPointerDown={drag}
        title="גרירה מזיזה את התלת־ממד"
        className={"flex touch-none select-none items-center gap-2 border-b border-border-soft py-1.5 ps-7 pe-3 " + (live ? "cursor-grabbing" : "cursor-grab")}
      >
        <Box className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.6} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">תלת־ממד</span>
        <CloseButton label="סגירת התלת-ממד" onClick={onClose} tabIndex={open ? 0 : -1} />
      </div>
      {/* The grip, in the corner FARTHEST from the anchor — top-start, top-right on a Hebrew screen —
          so pulling it out grows the card into open room. Its lines run across the pull (↗), tucked
          into that corner; the cursor is the same diagonal. Mirrored whole on a left-to-right screen. */}
      <button
        type="button"
        aria-label="שינוי גודל התלת-ממד"
        title="גרירה משנה את הגודל"
        onPointerDown={resize}
        tabIndex={-1}
        className="absolute start-0 top-0 z-10 flex h-6 w-6 cursor-nesw-resize touch-none items-start justify-start p-[3px] text-muted hover:text-accent ltr:cursor-nwse-resize"
      >
        <svg viewBox="0 0 12 12" className="h-3 w-3 ltr:-scale-x-100" aria-hidden>
          <path d="M5 1 L11 7 M1 1 L11 11" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      <div className="relative" style={{ height: Math.round(drawn.width * ASPECT) }}>
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
            compact
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-inset px-4 text-center text-caption text-muted">
            {empty ? "אין עדיין מה להציג — הניחו שולחן או פריט על התוכנית" : "בונה את החלל…"}
          </div>
        )}
      </div>
    </div>
  );
}
