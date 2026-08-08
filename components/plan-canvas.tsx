"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CircleDot,
  DoorOpen,
  GlassWater,
  Layers,
  Lock,
  Maximize,
  Minus,
  Plus,
  Presentation,
  Redo2,
  Ruler,
  SeparatorHorizontal,
  Trash2,
  Undo2,
  Unlock,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Point, EdgeCurve, Entrance, Fixture, FixtureShape, Column } from "@/lib/studio/hall";
import {
  edgePathD,
  edgeMidpoint,
  absoluteControlPoints,
  doorGeometry,
  wallLengthMm,
  wallAngleDeg,
  bulgeDepthMm,
  maxBulgeDepthMm,
  pointAtDistance,
  wallSegmentD,
  toLocalFrame,
  fromLocalFrame,
  resizeFromEdge,
  polygonAreaMm2,
  polygonCentroid,
  endpointFromLengthAngle,
} from "@/lib/studio/geometry";
import { snapPoint, constrainAngleDeg, type SnapResult } from "@/lib/studio/snap";
import { isTypingTarget } from "@/lib/keyboard";
import { resolveStyle } from "@/lib/element-style";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { NumberField } from "@/components/number-field";
import { StyleFields } from "@/components/style-fields";
import type { SelectedKind, SelectedRef } from "@/lib/studio/use-outline-editor";

export type StructureDragType = "entrance" | "stage" | "bar";

// The selection lives with the state it points into (lib/studio/use-outline-editor) — re-exported
// here because the canvas and its inspector are where callers meet it.
export type { SelectedKind, SelectedRef } from "@/lib/studio/use-outline-editor";

// One entry in the right-click menu. The host builds them (halls: add entrance/stage/bar);
// the canvas just renders + dispatches — so the shape editor stays domain-agnostic.
export interface ContextMenuItem {
  label: string;
  icon?: LucideIcon;
  disabled?: boolean;
  onSelect: () => void;
}

// A connected wall graph the canvas can draw and reshape alongside (or instead of) the single
// `outline`. The outline models ONE closed shape, which cannot express a property where two rooms
// share a wall: the shared wall would have to exist twice, once in each outline, and the two copies
// drift apart the moment either is edited. A graph stores it once — dragging a node moves every
// wall attached to it.
//
// Deliberately structural rather than importing the venue types, so this component keeps knowing
// nothing about venues: anything with ids and coordinates satisfies it.
export interface CanvasGraphNode {
  id: string;
  x: number;
  y: number;
}
export interface CanvasGraphWall {
  id: string;
  a: string; // node id
  b: string; // node id
  kind?: "wall" | "edge"; // built wall vs. a boundary line you can see but not walk into
}
export interface CanvasGraph {
  nodes: CanvasGraphNode[];
  walls: CanvasGraphWall[];
}
/** What the canvas can hand back as "the thing you clicked" in a graph. Kept apart from
 *  SelectedRef: that one's ids are positions in the `outline` array, these are stable graph ids. */
export interface CanvasGraphRef {
  kind: "node" | "wall";
  id: string;
}

/** A world-space box to frame, plus a nonce the host bumps to ask for it again. Without the nonce,
 *  selecting the same zone twice after panning away would be a no-op — the box hasn't changed, but
 *  the request is real. */
export interface CanvasFocus {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  nonce: number;
}

const FOCUS_MS = 300; // long enough to read as travel between two places, short enough not to wait on
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

// What a host-supplied layer needs from the canvas to be interactive rather than decorative: the
// same pointer→world conversion every handle inside the canvas uses, and the current zoom. A layer
// that only draws can stay plain JSX and ignore all of this.
export interface CanvasLayerContext {
  clientToMm: (clientX: number, clientY: number) => Point;
  /** Screen px → world mm at the current zoom, for hit areas that must stay a constant finger-width. */
  mm: (px: number) => number;
}
export type CanvasLayer = ReactNode | ((ctx: CanvasLayerContext) => ReactNode);

const PAD_MM = 1500;
const DEFAULT_EXTENT = { w: 22000, h: 15000 };
const SNAP_PX = 16; // how close a click has to land on the first vertex to close the shape
const SNAP_TOL_PX = 6; // alignment/inference pull radius
const EDGE_MARGIN_PX = 56; // how far inside the frame a freshly drawn point is kept
const MIN_MM_PER_PX = 0.5; // most zoomed-in (1px ≈ 0.5mm)
const MAX_MM_PER_PX = 300; // most zoomed-out
const DRAG_THRESHOLD_PX = 4; // pointer travel before a press turns into a drag
const MIN_FIXTURE_MM = 200; // a stage/bar can't be resized smaller than this

// Keyboard focus has to be *rendered* here: Tailwind's ring/outline utilities don't paint reliably
// on SVG nodes, so every handle suppresses the native outline and carries its own halo shape at
// opacity 0, which this variant reveals when the handle takes focus-visible. Hover, by contrast,
// is just a colour shift, so it stays on the plain `hover:` variant at each shape.
const HANDLE_CLS = "focus:outline-none [&:focus-visible_.halo]:opacity-100";
const HALO = {
  className: "halo pointer-events-none text-accent opacity-0",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  vectorEffect: "non-scaling-stroke",
} as const;

const norm360 = (deg: number) => ((deg % 360) + 360) % 360;

// Frames the closed shape (doors are plain gaps in the wall now, so there's no swing arc to keep
// in view). Only used in edit mode — while drawing we hold a fixed frame instead (see below).
function computeViewBox(outline: Point[], stage: Fixture | undefined, bars: Fixture[], padMm: number, minExtent: { w: number; h: number }, extra: Point[] = []) {
  const points = [...outline, ...(stage ? [stage] : []), ...bars, ...extra];
  if (points.length === 0) return { minX: -padMm, minY: -padMm, w: minExtent.w, h: minExtent.h };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(minExtent.w, Math.max(...xs) - minX + padMm * 2);
  const h = Math.max(minExtent.h, Math.max(...ys) - minY + padMm * 2);
  return { minX: minX - padMm, minY: minY - padMm, w, h };
}

function nudge(e: React.KeyboardEvent, x: number, y: number, onMove: (p: Point) => void) {
  const step = e.shiftKey ? 500 : 100;
  if (e.key === "ArrowLeft") onMove({ x: x - step, y });
  else if (e.key === "ArrowRight") onMove({ x: x + step, y });
  else if (e.key === "ArrowUp") onMove({ x, y: y - step });
  else if (e.key === "ArrowDown") onMove({ x, y: y + step });
  else return;
  e.preventDefault();
}

// Where each live press started, keyed by pointerId. It can't live in the closure below: the first
// onMove re-renders the host, which rebuilds these handlers mid-gesture — the origin has to outlive
// that. Module scope is safe because a pointerId identifies one gesture at a time.
const pressOrigin = new Map<number, { x: number; y: number; dragging: boolean }>();
// Set when a gesture crosses the drag threshold, so the click event that always follows its
// pointerup (browsers fire pointerdown → pointerup → click for one press) can skip re-running
// selection logic. Without this, dragging an already-multi-selected item would re-fire "select just
// me" the instant the drag ends, undoing the very group the drag just moved. Not pointerId-keyed:
// this file only ever has one live drag-then-click sequence in flight at a time (a single pointer),
// the same assumption pan/marquee already make with their own un-keyed refs.
let suppressNextClick = false;

// Pointer-drag in SVG user-space (mm), via getScreenCTM — robust to zoom/resize/RTL, unlike a
// manually-tracked px-per-mm factor, and unaffected by any nested rotate() transform since it
// always resolves through the root <svg>'s own CTM. Shared by every draggable thing on the canvas.
//
// Geometry only starts moving after DRAG_THRESHOLD_PX of travel, so a click meant to select a
// vertex can't silently nudge it by the pixel the pointer drifted under the finger. onDragChange
// reports the crossing, for handles that have to stay mounted for the length of their own drag.
//
// The same crossing is what tells the host's history where one gesture ends: onCommit fires once
// per press that actually moved something, so a drag of fifty onMove calls is one undo step. A
// press that never crossed the threshold changed nothing and stays silent.
//
// onSelect fires twice per plain click — once on pointerdown (so an unselected item you start
// dragging shows as selected immediately, not just once you let go) and once on click (the only
// signal for "this was just a click, no drag") — tagged with which phase it was, so a caller that
// cares (multi-select) can tell them apart; one that doesn't (a plain click-to-select) can ignore it.
function dragHandlers(
  clientToMm: (clientX: number, clientY: number) => Point,
  onMove: (p: Point, mods: { alt: boolean }) => void,
  onSelect?: (mods: { shift: boolean; phase: "press" | "click" }) => void,
  onDragChange?: (dragging: boolean) => void,
  onCommit?: () => void,
) {
  const end = (e: React.PointerEvent) => {
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (pressOrigin.get(e.pointerId)?.dragging) {
      onDragChange?.(false);
      onCommit?.();
      suppressNextClick = true;
    }
    pressOrigin.delete(e.pointerId);
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      pressOrigin.set(e.pointerId, { x: e.clientX, y: e.clientY, dragging: false });
      // A shift-press never selects here — only the click phase toggles (see onClick), so a
      // press+drag combined with shift reads as "drag", not "drag *and* toggle twice".
      if (!e.shiftKey) onSelect?.({ shift: false, phase: "press" });
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.buttons !== 1) return;
      const origin = pressOrigin.get(e.pointerId);
      if (!origin) return;
      if (!origin.dragging) {
        if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < DRAG_THRESHOLD_PX) return;
        origin.dragging = true;
        onDragChange?.(true);
      }
      onMove(clientToMm(e.clientX, e.clientY), { alt: e.altKey });
    },
    onPointerUp: end,
    onPointerCancel: end,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      onSelect?.({ shift: e.shiftKey, phase: "click" });
    },
  };
}

// THE canvas. Every plan, map and footprint surface in the app is this component with different
// layers hung off it — the hall editor, the studio's design surface, the catalog's shape editor —
// so pan, zoom, fit, the grid, snapping and the millimetre world space are written once and behave
// the same everywhere. Extend it; never hand-roll a second SVG next to it.
//
// Direct manipulation: click to draw walls one at a time (mode "draw"), then drag
// vertices/wall-midpoints/bezier handles once the shape is closed (mode "edit"). Stage/bar drop in
// from the StructureRail and can be dragged, rotated and resized in place; entrances drop onto the
// nearest wall and slide along it, rendered as a real door gap + swing symbol.
//
// Everything editable is opt-in, and a host that omits a handler gets a surface that draws but does
// not yield: leave out onSelectGraph/onMoveGraphNode and the walls have no corner handles and take
// no clicks. That is exactly how the studio keeps a venue's structure fixed while an event is
// designed inside it — by asking for less, not by passing a "readOnly" flag.
export function PlanCanvas({
  mode,
  outline,
  edgeCurves,
  lockedEdges = [],
  columns = [],
  entrances = [],
  stage,
  bars = [],
  selected,
  onSelect,
  onToggleSelect,
  onSelectMany,
  onAddVertex,
  onCloseOutline,
  onCancelDraw,
  onMoveVertex,
  onMoveWallHandle,
  onMoveSelection,
  onRotateFixtureGroup,
  onMoveEntrance,
  onMoveStage,
  onMoveBar,
  onUpdateStage,
  onUpdateBar,
  onToggleWallLock,
  onCommit,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  contextMenuItems,
  backdrop,
  overlay,
  graph,
  onMoveGraphNode,
  graphSelection = [],
  onSelectGraph,
  onMarquee,
  onCanvasClick,
  onDropAt,
  cursor = "default",
  ariaLabel = "תרשים האולם — עריכה",
  drawFrom,
  focus,
  padMm = PAD_MM,
  minExtentMm = DEFAULT_EXTENT,
  gridMm = 1000,
}: {
  mode: "draw" | "edit";
  outline: Point[];
  edgeCurves: (EdgeCurve | null)[];
  lockedEdges?: boolean[]; // per-wall length lock, aligned to outline — see lib/studio/geometry's constrainVertexToLocks
  columns?: Column[];
  entrances?: Entrance[];
  stage?: Fixture | undefined;
  bars?: Fixture[];
  // A plain click replaces the selection (or clears it with null); shift-click toggles one ref via
  // onToggleSelect, and a marquee drag reports every ref it caught via onSelectMany. Walls sit
  // outside all of this — they stay single-select only (see the group-drag/rotate notes below).
  selected: SelectedRef[];
  onSelect: (ref: SelectedRef | null) => void;
  onToggleSelect?: (ref: SelectedRef) => void;
  onSelectMany?: (refs: SelectedRef[], additive: boolean) => void;
  onAddVertex: (p: Point) => void;
  onCloseOutline: () => void;
  onCancelDraw?: () => void; // Escape while drawing — the host throws the in-progress outline away
  onMoveVertex: (idx: number, p: Point) => void;
  onMoveWallHandle: (edgeIdx: number, which: "bulge" | "c1" | "c2", p: Point) => void;
  // Fires once per pointermove during a group drag/rotate — every selected ref's next absolute
  // point (or, for rotate, position+facing), batched so the host coalesces it into one undo entry.
  onMoveSelection?: (moves: { ref: SelectedRef; point: Point }[]) => void;
  onRotateFixtureGroup?: (updates: { id: string; x: number; y: number; rotationDeg: number }[]) => void;
  onMoveEntrance?: (id: string, p: Point) => void;
  onMoveStage?: (p: Point) => void;
  onMoveBar?: (id: string, p: Point) => void;
  onUpdateStage?: (patch: Partial<Fixture>) => void;
  onUpdateBar?: (id: string, patch: Partial<Fixture>) => void;
  onToggleWallLock?: (edgeIdx: number) => void;
  // End of a gesture — one drag, however many onMove calls it made. The host closes its history
  // entry here; discrete edits (a placed vertex, a deleted door) need no such marker.
  onCommit?: () => void;
  canUndo?: boolean; // the undo/redo pair only renders when the host offers a history
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  // Right-click builds its menu from these (e.g. the hall's add entrance/stage/bar). No items → no menu.
  contextMenuItems?: (point: Point) => ContextMenuItem[];
  // World-space content painted under everything the canvas owns (below the walls, above the grid).
  // The venue plan puts its zone tints and fixed features here, so a wall shared by two zones is
  // still drawn once, by the canvas, on top of both — rather than each zone painting its own copy.
  // Either plain JSX, or a function given the canvas's own pointer→world transform — which is what
  // lets a host layer drag something without reimplementing (or mis-implementing) the conversion.
  backdrop?: CanvasLayer;
  // World-space content painted directly ABOVE the walls but below every handle — door openings,
  // which only read as gaps if they overpaint the wall they cut through.
  overlay?: CanvasLayer;
  // A connected wall graph, drawn and reshaped alongside `outline`. Its nodes join the snap
  // references, so tracing a new wing aligns to the walls already on the plan.
  graph?: CanvasGraph;
  onMoveGraphNode?: (nodeId: string, p: Point) => void;
  // Graph selection. Supplying onSelectGraph is what makes walls clickable at all — a host that is
  // mid-draw leaves it off, so a click meant to place a corner can't be swallowed by the wall it
  // lands on. Node handles are drawn whenever either this or onMoveGraphNode is present.
  // `additive` is the shift modifier: the host toggles rather than replaces.
  graphSelection?: CanvasGraphRef[];
  onSelectGraph?: (ref: CanvasGraphRef | null, additive: boolean) => void;
  // A marquee drag finished. The canvas reports the box rather than the hits, because everything
  // selectable here belongs to the host — the graph is its data, and so is whatever it drew into
  // backdrop/overlay. Hit-testing it here would mean teaching the canvas what a zone is.
  onMarquee?: (box: { minX: number; minY: number; maxX: number; maxY: number }, additive: boolean) => void;
  // A click on empty canvas in edit mode, in world mm — for a host whose current tool means "put one
  // here" (the studio's click-to-place tables). It fires alongside the selection-clearing onSelect
  // (null), not instead of it: what the click MEANS is the host's business, and a host with no tool
  // armed simply ignores the point.
  onCanvasClick?: (p: Point) => void;
  // Something was dragged onto the canvas from outside it (the studio's catalog rail), reported at
  // the world point it landed on. Supplying this is what turns on dragover/drop handling at all —
  // the canvas never claims a drop a host isn't listening for.
  onDropAt?: (e: React.DragEvent, p: Point) => void;
  // Edit-mode cursor. A host holding an armed tool says so here rather than reaching over the
  // canvas with a wrapper class, which the svg's own cursor would win against anyway.
  cursor?: "default" | "crosshair";
  /** What this surface IS, for screen readers — the same canvas is a hall plan on one screen and an
   *  event's design on the next. */
  ariaLabel?: string;
  // Where the rubber-band starts when there is no `outline` to hang it off — a graph host passes
  // the corner its current run reached. Ignored while an outline is being drawn.
  drawFrom?: Point | null;
  // Frame this world-space box. Re-fits every time `nonce` changes, so "show me this zone" works
  // twice in a row. The move is animated: on a property with five zones an instant jump to a
  // different corner of the plan reads as a redraw, not as travel.
  focus?: CanvasFocus | null;
  padMm?: number; // frame padding + minimum extent + grid spacing — hall-scale by default, smaller for
  minExtentMm?: { w: number; h: number }; // product footprints (cm-scale) so a small shape isn't tiny
  gridMm?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursorRaw, setCursorRaw] = useState<Point | null>(null); // unsnapped pointer, in mm — the snap is re-derived per render
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [rect, setRect] = useState({ w: 0, h: 0 });
  const [center, setCenter] = useState<Point>({ x: DEFAULT_EXTENT.w / 2, y: DEFAULT_EXTENT.h / 2 });
  const [mmPerPx, setMmPerPx] = useState(20); // world mm per screen px — the zoom level
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [altHeld, setAltHeld] = useState(false); // Alt releases the angle lock (Shift is already the big-step modifier)
  const [hoverClose, setHoverClose] = useState(false);
  // Which wall is live: hovered, or mid-drag on its own bulge handle. Pointer capture swallows the
  // wall's hover events for the length of a drag, so the drag flag is what keeps the handle from
  // disappearing out from under the pointer that is holding it.
  const [hoverWall, setHoverWall] = useState<number | null>(null);
  const [dragWall, setDragWall] = useState<number | null>(null);
  // A fixture's live rotation, for the angle pill — the fixture lives in SVG, the pill is an HTML
  // overlay, so the marker reports the angle up rather than drawing it itself.
  const [rotating, setRotating] = useState<{ deg: number; locked: boolean; at: Point } | null>(null);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  // Measurements default on while drawing (that's when they're the point) and off once the shape is
  // closed — until the ruler button is pressed, after which the choice is the user's and sticks.
  const [dimsOverride, setDimsOverride] = useState<boolean | null>(null);
  // The SketchUp value-control-box: type a length (Tab switches to the angle) and Enter commits the
  // next corner at exactly that dimension instead of wherever the cursor happened to be.
  const [entry, setEntry] = useState<{ field: "length" | "angle"; length: string; angle: string } | null>(null);
  const entryRef = useRef<HTMLInputElement>(null);
  const didInit = useRef(false);
  const followed = useRef(0); // outline length the view last chased, so a point is only followed once
  // `deferred` marks a pan that started as a plain drag on empty canvas rather than with the space
  // key: it holds its anchor and takes no pointer capture until the drag threshold is crossed, so
  // the click that ends a press-without-movement still reaches whatever is underneath.
  const pan = useRef<{ x: number; y: number; moved: boolean; deferred?: boolean; ax: number; ay: number } | null>(null);
  const panMoved = useRef(false); // outlives the pan itself, so the click that ends one can't also drop a vertex
  // Marquee (rubber-band) select: a drag started on empty canvas in edit mode. Corners are tracked
  // in mm (via clientToMm) so the live rectangle renders directly in SVG user space; the client-px
  // anchor is kept alongside just to gate the same DRAG_THRESHOLD_PX a click needs to become a drag.
  const marquee = useRef<{ anchorClientX: number; anchorClientY: number; x0: number; y0: number; x1: number; y1: number; moved: boolean } | null>(null);
  const marqueeMoved = useRef(false); // mirrors panMoved — the click that ends a marquee drag mustn't also clear the selection
  const [marqueeBox, setMarqueeBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // One live group-drag gesture: every selected ref's drag-start position, snapshotted the moment
  // the drag crosses the threshold, so the whole group is re-derived each frame from one shared
  // delta off a fixed origin rather than drifting from repeated relative nudges.
  const groupDrag = useRef<{ start: Point; snapshot: { ref: SelectedRef; origin: Point }[] } | null>(null);
  // A live group-rotate gesture: the pivot and every member's starting position/facing, frozen at
  // the moment the drag crosses the threshold — the angle lock snaps the *sweep* (how far the
  // pointer has turned since then) to a step, not each member's absolute final facing, so a locked
  // group rotation is a clean shared turn rather than each fixture landing on its own nearest step.
  const groupRotate = useRef<{ pivot: Point; startDeg: number; snapshot: { id: string; origin: Point; rotationDeg: number }[] } | null>(null);

  const showDims = dimsOverride ?? mode === "draw";
  // Whether a rubber-band drag has anywhere to report to. A host that takes no multi-selection gets
  // drag-to-pan on empty canvas instead of a selection box that selects nothing.
  const canMarquee = !!onSelectMany || !!onMarquee;

  // Where the view should sit when fitted: hug the shape, or hold a fixed frame while first drawing
  // (recomputing to hug a single point would fling it into the corner).
  // A graph host has no outline to hug, so an empty outline is not the same as an empty canvas —
  // fall back to the fixed frame only when there is genuinely nothing drawn yet.
  const graphFramePoints: Point[] = graph ? graph.nodes.map((n) => ({ x: n.x, y: n.y })) : [];
  const contentBox =
    mode === "draw" && outline.length < 3 && graphFramePoints.length === 0
      ? { minX: -padMm, minY: -padMm, w: minExtentMm.w, h: minExtentMm.h }
      : computeViewBox(outline, stage, bars, padMm, minExtentMm, graphFramePoints);

  // The viewBox is derived from center+zoom with the container's own aspect ratio, so there's no
  // letterbox and 1 screen px == mmPerPx world units everywhere. Pan moves center; zoom changes
  // mmPerPx about the cursor. Until we've measured the container, fall back to the fitted box.
  const hasRect = rect.w > 0 && rect.h > 0;
  const vb = hasRect
    ? { minX: center.x - (rect.w * mmPerPx) / 2, minY: center.y - (rect.h * mmPerPx) / 2, w: rect.w * mmPerPx, h: rect.h * mmPerPx }
    : contentBox;

  const fitTo = (box: { minX: number; minY: number; w: number; h: number }, rw: number, rh: number) => {
    if (rw === 0 || rh === 0) return;
    setMmPerPx(Math.max(box.w / rw, box.h / rh) * 1.06);
    setCenter({ x: box.minX + box.w / 2, y: box.minY + box.h / 2 });
  };

  // The live view, mirrored into a ref so the focus tween can read where it is starting from
  // without re-subscribing every time the user pans a pixel. Synced from an effect rather than
  // during render — and it stays correct for the tween because the effect that starts one is
  // declared below this and so runs after it in the same commit.
  const viewRef = useRef({ center, mmPerPx });
  useEffect(() => {
    viewRef.current = { center, mmPerPx };
  }, [center, mmPerPx]);
  const focusAnim = useRef<number | null>(null);
  const cancelFocus = () => {
    if (focusAnim.current !== null) cancelAnimationFrame(focusAnim.current);
    focusAnim.current = null;
  };
  // Eased travel to a box, rather than a cut. Any pan or zoom the user starts mid-flight cancels it
  // — the view is theirs the moment they touch it.
  const animateTo = (box: { minX: number; minY: number; w: number; h: number }, rw: number, rh: number) => {
    cancelFocus();
    if (rw === 0 || rh === 0 || box.w <= 0 || box.h <= 0) return;
    const from = { ...viewRef.current.center, mmPerPx: viewRef.current.mmPerPx };
    const to = {
      x: box.minX + box.w / 2,
      y: box.minY + box.h / 2,
      mmPerPx: Math.min(MAX_MM_PER_PX, Math.max(MIN_MM_PER_PX, Math.max(box.w / rw, box.h / rh) * 1.18)),
    };
    const t0 = performance.now();
    const step = (now: number) => {
      const k = easeOutCubic(Math.min(1, (now - t0) / FOCUS_MS));
      setCenter({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
      setMmPerPx(from.mmPerPx + (to.mmPerPx - from.mmPerPx) * k);
      focusAnim.current = k < 1 ? requestAnimationFrame(step) : null;
    };
    focusAnim.current = requestAnimationFrame(step);
  };
  useEffect(() => cancelFocus, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const update = () => {
      const r = svg.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setRect({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  // Fit once, as soon as the container has been measured.
  useEffect(() => {
    if (!didInit.current && rect.w > 0 && rect.h > 0) {
      didInit.current = true;
      fitTo(contentBox, rect.w, rect.h);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect.w, rect.h]);

  const mm = (px: number) => px * mmPerPx; // screen px → world mm, for markers that stay a fixed screen size

  const clientToMm = (clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const loc = pt.matrixTransform(ctm.inverse());
    return { x: loc.x, y: loc.y };
  };
  const mmToClient = (p: Point): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = p.x;
    pt.y = p.y;
    const screen = pt.matrixTransform(ctm);
    return { x: screen.x, y: screen.y };
  };

  const clampZoom = (m: number) => Math.min(MAX_MM_PER_PX, Math.max(MIN_MM_PER_PX, m));
  const zoomByCenter = (factor: number) => {
    cancelFocus();
    setMmPerPx((m) => clampZoom(m * factor));
  };
  const zoomAround = (clientX: number, clientY: number, factor: number) => {
    cancelFocus();
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const world = clientToMm(clientX, clientY);
    const next = clampZoom(mmPerPx * factor);
    const sx = clientX - (r.left + r.width / 2); // cursor offset from viewport centre, px
    const sy = clientY - (r.top + r.height / 2);
    setCenter({ x: world.x - sx * next, y: world.y - sy * next }); // keep the cursor's world point put
    setMmPerPx(next);
  };

  // World mm → container px. The viewBox matches the container's aspect ratio exactly (see vb), so
  // this is a plain affine map — no CTM needed, which lets the HTML overlays position during render.
  const worldToPx = (p: Point) => ({ x: (p.x - vb.minX) / mmPerPx, y: (p.y - vb.minY) / mmPerPx });

  const fixtureRefs = (excludeId?: string): Point[] =>
    [stage, ...bars].filter((f): f is Fixture => !!f && f.id !== excludeId).map((f) => ({ x: f.x, y: f.y }));

  // --- multi-select -----------------------------------------------------------------------------
  const isSel = (kind: SelectedKind, id: string) => selected.some((r) => r.kind === kind && r.id === id);
  // Every selectable ref's current world position — used to snapshot a group drag's origin and to
  // hit-test a marquee rectangle. Walls are excluded (see the props doc): they have no single point
  // to test, and take no part in group drag/rotate/delete.
  const posOf = (ref: SelectedRef): Point | null => {
    if (ref.kind === "vertex") return outline[Number(ref.id)] ?? null;
    if (ref.kind === "entrance") {
      const en = entrances.find((e) => e.id === ref.id);
      if (!en) return null;
      const a = outline[en.wallIndex];
      const b = outline[(en.wallIndex + 1) % outline.length];
      return a && b ? pointAtDistance(a, b, en.distanceMm) : null;
    }
    if (ref.kind === "stage") return stage ? { x: stage.x, y: stage.y } : null;
    if (ref.kind === "bar") {
      const b = bars.find((x) => x.id === ref.id);
      return b ? { x: b.x, y: b.y } : null;
    }
    return null;
  };
  // A ref's full extent, not just its centre — the group selection outline sizes itself off this,
  // so it actually surrounds a rotated fixture's corners instead of shrinking to the single point
  // posOf tracks (which is all a group *drag* needs, since every member just carries the same delta).
  const boundsOf = (ref: SelectedRef): Point[] => {
    if (ref.kind === "vertex") {
      const p = outline[Number(ref.id)];
      return p ? [p] : [];
    }
    if (ref.kind === "entrance") {
      const en = entrances.find((e) => e.id === ref.id);
      if (!en) return [];
      const a = outline[en.wallIndex];
      const b = outline[(en.wallIndex + 1) % outline.length];
      if (!a || !b) return [];
      const half = en.widthMm / 2;
      return [pointAtDistance(a, b, en.distanceMm - half), pointAtDistance(a, b, en.distanceMm + half)];
    }
    const f = ref.kind === "stage" ? stage : bars.find((x) => x.id === ref.id);
    if (!f) return [];
    const halfW = f.widthMm / 2;
    const halfD = (f.shape === "circle" ? f.widthMm : f.depthMm) / 2;
    const rot = f.rotationDeg ?? 0;
    const center = { x: f.x, y: f.y };
    return [
      { x: -halfW, y: -halfD },
      { x: halfW, y: -halfD },
      { x: halfW, y: halfD },
      { x: -halfW, y: halfD },
    ].map((c) => fromLocalFrame(c, center, rot));
  };
  const collectMarqueeHits = (box: { minX: number; minY: number; maxX: number; maxY: number }): SelectedRef[] => {
    const inBox = (p: Point) => p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
    const hits: SelectedRef[] = [];
    outline.forEach((v, i) => {
      if (inBox(v)) hits.push({ kind: "vertex", id: String(i) });
    });
    entrances.forEach((en) => {
      const p = posOf({ kind: "entrance", id: en.id });
      if (p && inBox(p)) hits.push({ kind: "entrance", id: en.id });
    });
    if (stage && inBox({ x: stage.x, y: stage.y })) hits.push({ kind: "stage", id: stage.id });
    bars.forEach((b) => {
      if (inBox({ x: b.x, y: b.y })) hits.push({ kind: "bar", id: b.id });
    });
    return hits;
  };
  // When the item a drag started on is part of a live multi-selection, every member translates
  // together by the same raw delta off its own drag-start position — no smart alignment guides
  // during a group drag, just a plain shared offset — instead of only the one item under the
  // pointer. Falls back to the ordinary single-item move (with its own snapping) the rest of the
  // time, which is also what keeps a lone selection's drag exactly as precise as it always was.
  const makeGroupAwareMove = (ref: SelectedRef, singleMove: (p: Point) => void): ((p: Point) => void) => {
    if (selected.length <= 1 || !isSel(ref.kind, ref.id) || !onMoveSelection) return singleMove;
    return (p) => {
      if (!groupDrag.current) {
        const snapshot = selected
          .map((r) => ({ ref: r, origin: posOf(r) }))
          .filter((s): s is { ref: SelectedRef; origin: Point } => !!s.origin);
        groupDrag.current = { start: p, snapshot };
      }
      const { start, snapshot } = groupDrag.current;
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      onMoveSelection(snapshot.map((s) => ({ ref: s.ref, point: { x: s.origin.x + dx, y: s.origin.y + dy } })));
    };
  };
  const endGroupDrag = () => {
    groupDrag.current = null;
    onCommit?.();
  };
  // Shift always toggles. A plain press on an item that's already part of a live multi-selection
  // is left alone — dragHandlers' "press" phase would otherwise collapse the group to just this
  // one item before a group-drag even gets a chance to start (see makeGroupAwareMove, which needs
  // selected.length > 1 to still be true once the drag begins). The *click* phase (a press that
  // never turned into a drag) isn't given the same pass, so clicking — not dragging — one member of
  // a selection still does the ordinary thing and collapses down to just that item.
  const selectOrPreserveGroup = (ref: SelectedRef) => (mods: { shift: boolean; phase: "press" | "click" }) => {
    if (mods.shift) { onToggleSelect?.(ref); return; }
    if (mods.phase === "press" && selected.length > 1 && isSel(ref.kind, ref.id)) return;
    onSelect(ref);
  };

  // Dragging: alignment pull only (see lib/studio/snap.ts), and remember the matched x/y so the
  // accent guide lines can be drawn.
  const graphPoints: Point[] = graph ? graph.nodes.map((n) => ({ x: n.x, y: n.y })) : [];
  const graphNodeAt = (id: string) => graph?.nodes.find((n) => n.id === id) ?? null;

  const snapDrag = (p: Point, opts?: { fixtureId?: string; vertexIdx?: number; graphNodeId?: string }): Point => {
    const r = snapPoint(p, {
      toleranceMm: SNAP_TOL_PX * mmPerPx,
      // The dragged corner is dropped from its own reference list — otherwise it aligns to where it
      // already is and can never be pulled off that line.
      outline: [
        ...outline,
        ...(graph ? graph.nodes.filter((n) => n.id !== opts?.graphNodeId).map((n) => ({ x: n.x, y: n.y })) : []),
      ],
      fixtures: fixtureRefs(opts?.fixtureId),
      gridMm,
      excludeVertexIdx: opts?.vertexIdx,
    });
    setGuides(r.guides);
    return r.point;
  };

  // Drawing: the same references plus the 5°/ortho lock off the previous vertex. Kept pure and
  // re-derived every render (rather than stored) so pressing Alt updates the preview immediately.

  const drawAnchor =
    mode === "draw" ? (outline.length > 0 ? outline[outline.length - 1] : (drawFrom ?? null)) : null;
  const snapDraw = (p: Point, releaseAngle: boolean): SnapResult =>
    snapPoint(p, {
      toleranceMm: SNAP_TOL_PX * mmPerPx,
      // Existing graph corners are snap references too — that is what lets a new wing land flush on
      // the wing already drawn, and what makes two runs actually meet at one node instead of at two
      // that merely look coincident (and so enclose nothing).
      outline: [...outline, ...graphPoints],
      fixtures: fixtureRefs(),
      gridMm,
      anchor: drawAnchor ?? undefined,
      constrainAngle: !releaseAngle,
    });

  const pending = mode === "draw" && cursorRaw ? snapDraw(cursorRaw, altHeld) : null;
  const pendingLenMm = pending && drawAnchor ? wallLengthMm(drawAnchor, pending.point) : 0;
  const pendingAngleDeg = pending && drawAnchor ? wallAngleDeg(drawAnchor, pending.point) : 0;
  const closable = mode === "draw" && outline.length >= 3;
  const shownGuides = mode === "draw" ? (pending?.guides ?? { x: null, y: null }) : guides;
  // Which side of a wall reads as "inward", for a door's swing direction — the outline's own
  // centroid, same reference point the old (and now-restored) doorGeometry always used.
  const interiorHint = outline.length >= 3 ? polygonCentroid(outline) : { x: 0, y: 0 };

  // Commits the typed segment: exact length along the typed (or currently inferred) direction.
  const commitEntry = () => {
    if (!entry || !drawAnchor) return;
    const typedLen = parseFloat(entry.length);
    const typedAngle = parseFloat(entry.angle);
    const lengthMm = Number.isFinite(typedLen) && typedLen > 0 ? typedLen * 1000 : pendingLenMm;
    const angleDeg = Number.isFinite(typedAngle) ? typedAngle : pendingAngleDeg;
    setEntry(null);
    if (!(lengthMm > 0)) return;
    const p = endpointFromLengthAngle(drawAnchor, lengthMm, angleDeg);
    onAddVertex({ x: Math.round(p.x), y: Math.round(p.y) });
    svgRef.current?.focus();
  };

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (spaceHeld) return; // space is the pan modifier — never draw/select while it's down
    if (panMoved.current) return; // …nor on the click that closes a pan the user let go of space during
    if (marqueeMoved.current) { marqueeMoved.current = false; return; } // …nor on the click that ends a marquee drag
    if (mode !== "draw") {
      onSelect(null);
      onSelectGraph?.(null, false); // empty canvas clears the graph selection too, not just the outline's
      onCanvasClick?.(clientToMm(e.clientX, e.clientY));
      return;
    }
    svgRef.current?.focus(); // typed lengths and Enter-to-close belong to the canvas from here on
    if (outline.length >= 3) {
      const first = mmToClient(outline[0]);
      // Either the first vertex, or a double-click anywhere. Reading e.detail instead of binding
      // onDoubleClick means the closing click never also drops a stray vertex.
      if (e.detail >= 2 || Math.hypot(e.clientX - first.x, e.clientY - first.y) < SNAP_PX) {
        onCloseOutline();
        return;
      }
    }
    onAddVertex(snapDraw(clientToMm(e.clientX, e.clientY), e.altKey).point);
  };

  // Wheel-zoom (non-passive so we can preventDefault the page scroll) + space-to-pan modifier key.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAround(e.clientX, e.clientY, e.deltaY > 0 ? 1.1 : 1 / 1.1);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mmPerPx]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget()) return; // the value box owns its own keys — Backspace there must not eat a vertex
      if (e.code === "Space") { e.preventDefault(); setSpaceHeld(true); return; }
      // Alt is tracked in both modes — it releases the angle lock while drawing and the 5°
      // rotation lock while editing. preventDefault keeps Chrome's menu bar out of it.
      if (e.key === "Alt") { e.preventDefault(); setAltHeld(true); return; }
      if (e.key === "+" || e.key === "=") { zoomByCenter(1 / 1.2); return; }
      if (e.key === "-" || e.key === "_") { zoomByCenter(1.2); return; }
      if (mode !== "draw") return;
      if (e.key === "Enter") {
        if (outline.length >= 3) { e.preventDefault(); onCloseOutline(); }
        return;
      }
      if (e.key === "Escape") {
        // Takes precedence over the hosts' own Escape (clear selection / close the modal) — while a
        // shape is half-drawn, Escape means "throw this away", nothing else.
        if (outline.length > 0 && onCancelDraw) { e.preventDefault(); onCancelDraw(); }
        return;
      }
      if (outline.length === 0 || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Tab" || /^[0-9.]$/.test(e.key)) {
        e.preventDefault();
        setEntry({ field: "length", length: e.key === "Tab" ? "" : e.key, angle: "" });
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
      else if (e.key === "Alt") setAltHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, outline.length, onCloseOutline, onCancelDraw]);

  const layerCtx: CanvasLayerContext = { clientToMm, mm };

  const entryOpen = entry !== null;
  useEffect(() => {
    if (entryOpen) entryRef.current?.focus();
  }, [entryOpen]);

  // "Show me this" — the host bumps focus.nonce, the view travels there. Keyed on the nonce alone
  // so a re-render that happens to carry the same box doesn't yank the view back mid-pan.
  const focusNonce = focus?.nonce ?? 0;
  useEffect(() => {
    if (!focus || focusNonce === 0 || !hasRect) return;
    const w = focus.maxX - focus.minX;
    const h = focus.maxY - focus.minY;
    if (w <= 0 || h <= 0) return;
    animateTo({ minX: focus.minX, minY: focus.minY, w, h }, rect.w, rect.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce, rect.w, rect.h]);

  // The view follows the drawing: nudge the centre when a fresh point lands near the frame's edge,
  // and only re-fit (which changes zoom) once the whole outline no longer fits at all. Draw mode
  // only — in edit mode the frame is the user's to pan and zoom as they like. The ref guard keeps
  // this to one adjustment per committed point, never per render.
  useEffect(() => {
    if (followed.current === outline.length) return;
    followed.current = outline.length;
    if (mode !== "draw" || !hasRect || outline.length === 0) return;
    const p = outline[outline.length - 1];
    const viewW = rect.w * mmPerPx;
    const viewH = rect.h * mmPerPx;
    const drawn = computeViewBox(outline, stage, bars, padMm, { w: 0, h: 0 });
    // The outline is the host's state, so a committed point only reaches us as a prop — following it
    // has to happen from an effect.
    if (drawn.w > viewW || drawn.h > viewH) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fitTo(contentBox, rect.w, rect.h);
      return;
    }
    const m = EDGE_MARGIN_PX * mmPerPx;
    setCenter((c) => {
      let { x, y } = c;
      if (p.x < c.x - viewW / 2 + m) x += p.x - (c.x - viewW / 2 + m);
      else if (p.x > c.x + viewW / 2 - m) x += p.x - (c.x + viewW / 2 - m);
      if (p.y < c.y - viewH / 2 + m) y += p.y - (c.y - viewH / 2 + m);
      else if (p.y > c.y + viewH / 2 - m) y += p.y - (c.y + viewH / 2 - m);
      return x === c.x && y === c.y ? c : { x, y };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, outline.length]);

  return (
    <>
    <svg
      ref={svgRef}
      viewBox={`${vb.minX} ${vb.minY} ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMid meet"
      tabIndex={-1}
      className={
        // select-none on the root, not on each <text>: it inherits, so it also covers whatever a
        // host draws into backdrop/overlay. A drawing surface has nothing worth text-selecting, and
        // a drag across a label that highlights it instead of moving the plan reads as broken.
        "h-full w-full touch-none select-none focus:outline-none " +
        (spaceHeld
          ? "cursor-grab"
          : hoverClose && closable
            ? "cursor-pointer"
            : mode === "draw" || cursor === "crosshair"
              ? "cursor-crosshair"
              : "cursor-default")
      }
      role="img"
      aria-label={ariaLabel}
      onClick={handleCanvasClick}
      onPointerDown={(e) => {
        panMoved.current = false;
        if (spaceHeld || e.button === 1) {
          e.preventDefault();
          cancelFocus(); // the view is the user's again the instant they grab it
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          pan.current = { x: e.clientX, y: e.clientY, moved: false, ax: e.clientX, ay: e.clientY };
        } else if (mode === "edit" && canMarquee) {
          // A press that reached the svg missed every *draggable* handle (those stopPropagation),
          // but it may still be a plain click on something selectable in a host layer — a zone
          // tint, a wall, a door — since those have to let the press through or a marquee could
          // never be started over them.
          //
          // Which is why capture is NOT taken here, only once the drag threshold is crossed (see
          // onPointerMove). A captured pointer retargets the click that follows to the capture
          // element, so capturing every press would silently eat the click on everything underneath
          // — the exact reason walls and zones read as unclickable.
          const p = clientToMm(e.clientX, e.clientY);
          marquee.current = { anchorClientX: e.clientX, anchorClientY: e.clientY, x0: p.x, y0: p.y, x1: p.x, y1: p.y, moved: false };
        } else if (mode === "edit") {
          // No marquee to draw here (the host takes no multi-selection), so a drag on empty canvas
          // means the only other thing it could mean: move the view. Same deferred capture as the
          // marquee, for the same reason — a press that never travels is still a click.
          pan.current = { x: e.clientX, y: e.clientY, moved: false, deferred: true, ax: e.clientX, ay: e.clientY };
        }
      }}
      onPointerMove={(e) => {
        if (pan.current) {
          const p = pan.current;
          if (p.deferred) {
            // A press released off-canvas never reaches our onPointerUp while uncaptured — seeing
            // the button already up is how that stranded gesture gets dropped.
            if (e.buttons !== 1) { pan.current = null; return; }
            if (!p.moved && Math.hypot(e.clientX - p.ax, e.clientY - p.ay) < DRAG_THRESHOLD_PX) return;
            if (!p.moved) {
              cancelFocus();
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
            }
          }
          const dx = e.clientX - p.x;
          const dy = e.clientY - p.y;
          pan.current = { ...p, x: e.clientX, y: e.clientY, moved: true };
          setCenter((c) => ({ x: c.x - dx * mmPerPx, y: c.y - dy * mmPerPx }));
          return;
        }
        if (marquee.current) {
          // Nothing captures the pointer below the drag threshold, so a press that wandered off the
          // canvas and was released there never reaches our onPointerUp. Seeing the button already
          // up is how that stranded gesture gets cleaned up, instead of a ghost box appearing the
          // next time the pointer crosses back in.
          if (e.buttons !== 1) {
            marquee.current = null;
            setMarqueeBox(null);
            return;
          }
          const p = clientToMm(e.clientX, e.clientY);
          const moved = marquee.current.moved || Math.hypot(e.clientX - marquee.current.anchorClientX, e.clientY - marquee.current.anchorClientY) >= DRAG_THRESHOLD_PX;
          // Capture at the threshold, not at the press: now that this really is a drag, the box
          // should keep tracking past the canvas edge, and swallowing the trailing click is correct
          // rather than destructive.
          if (moved && !marquee.current.moved) (e.currentTarget as Element).setPointerCapture(e.pointerId);
          marquee.current = { ...marquee.current, x1: p.x, y1: p.y, moved };
          setMarqueeBox(moved ? { x0: marquee.current.x0, y0: marquee.current.y0, x1: p.x, y1: p.y } : null);
          return;
        }
        if (e.altKey !== altHeld) setAltHeld(e.altKey); // the modifier can be pressed while the window was unfocused
        if (mode === "draw") setCursorRaw(clientToMm(e.clientX, e.clientY));
      }}
      onPointerUp={(e) => {
        if (pan.current) {
          const el = e.currentTarget as Element;
          if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); // a deferred pan may never have taken one
          panMoved.current = pan.current.moved;
        } else if (marquee.current) {
          const el = e.currentTarget as Element;
          if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); // only taken if it became a drag
          if (marquee.current.moved) {
            marqueeMoved.current = true;
            const { x0, y0, x1, y1 } = marquee.current;
            const box = { minX: Math.min(x0, x1), minY: Math.min(y0, y1), maxX: Math.max(x0, x1), maxY: Math.max(y0, y1) };
            onSelectMany?.(collectMarqueeHits(box), e.shiftKey);
            onMarquee?.(box, e.shiftKey);
          }
          marquee.current = null;
          setMarqueeBox(null);
        }
        pan.current = null;
        setGuides({ x: null, y: null });
      }}
      onPointerLeave={() => {
        if (mode === "draw" && !entry) setCursorRaw(null); // keep the band alive while a length is being typed
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        const items = contextMenuItems?.(clientToMm(e.clientX, e.clientY)) ?? [];
        if (items.length) setMenu({ x: e.clientX, y: e.clientY, items });
      }}
      onDragOver={
        onDropAt
          ? (e) => {
              e.preventDefault(); // without this the browser refuses the drop outright
              e.dataTransfer.dropEffect = "copy";
            }
          : undefined
      }
      onDrop={
        onDropAt
          ? (e) => {
              e.preventDefault();
              onDropAt(e, clientToMm(e.clientX, e.clientY));
            }
          : undefined
      }
    >
      <defs>
        <pattern id="plan-canvas-grid" width={gridMm} height={gridMm} patternUnits="userSpaceOnUse">
          <path d={`M ${gridMm} 0 L 0 0 0 ${gridMm}`} fill="none" className="text-border" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </pattern>
      </defs>
      <rect x={vb.minX} y={vb.minY} width={vb.w} height={vb.h} fill="url(#plan-canvas-grid)" />

      {/* Host-supplied world-space layers (the venue plan's zone tints and fixed features), under
          everything the canvas draws itself. */}
      {typeof backdrop === "function" ? backdrop(layerCtx) : backdrop}

      {/* The wall graph. Drawn after the backdrop and before the outline, so a wall shared by two
          tinted zones is one stroke lying over both — the visual form of it being stored once. */}
      {graph?.walls.map((w) => {
        const a = graphNodeAt(w.a);
        const b = graphNodeAt(w.b);
        if (!a || !b) return null; // wall left dangling by a deleted node
        const isEdge = w.kind === "edge";
        const isSelected = graphSelection.some((r) => r.kind === "wall" && r.id === w.id);
        return (
          <g key={w.id}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={isSelected ? "text-accent" : isEdge ? "text-muted" : "text-ink"}
              stroke="currentColor"
              strokeWidth={isSelected ? 4 : isEdge ? 1.5 : 2.5}
              strokeDasharray={isEdge ? "5 4" : undefined}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {/* A wall is a hairline; the thing you aim at has to be finger-width. Transparent, in
                world units so it stays the same size on screen at any zoom, and only mounted when
                the host is actually taking selections (see onSelectGraph's note). */}
            {onSelectGraph && (
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth={mm(11)}
                strokeLinecap="round"
                tabIndex={0}
                role="button"
                aria-label={`${isEdge ? "גבול שטח" : "קיר"} — בחירה לעריכה`}
                className={`cursor-pointer touch-none ${HANDLE_CLS}`}
                // No stopPropagation on the press: a wall is selectable but not draggable, so the
                // press has to reach the <svg> for a marquee to be able to start on top of one.
                // The click below survives that only because the svg defers its pointer capture
                // until a drag really begins — see its onPointerDown.
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectGraph(isSelected && !e.shiftKey ? null : { kind: "wall", id: w.id }, e.shiftKey);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectGraph({ kind: "wall", id: w.id }, e.shiftKey);
                  }
                }}
              />
            )}
          </g>
        );
      })}

      {/* Above the walls, below the handles — door gaps overpainting the wall they cut. */}
      {typeof overlay === "function" ? overlay(layerCtx) : overlay}

      {/* Graph corners. One handle can be shared by several walls, so dragging it reshapes every
          room that meets there at once — the whole reason the structure is a graph. */}
      {graph &&
        (onMoveGraphNode || onSelectGraph) &&
        graph.nodes.map((n) => {
          const isSelected = graphSelection.some((r) => r.kind === "node" && r.id === n.id);
          // A plain press on a corner that is already part of a multi-selection leaves the group
          // alone, so a group drag has something left to drag — the same rule the outline's own
          // handles follow (see selectOrPreserveGroup).
          const select = onSelectGraph
            ? (mods: { shift: boolean; phase: "press" | "click" }) => {
                if (mods.phase === "press" && graphSelection.length > 1 && isSelected) return;
                onSelectGraph({ kind: "node", id: n.id }, mods.shift);
              }
            : undefined;
          // Without onMoveGraphNode the corner is still clickable (to inspect its coordinates), it
          // just doesn't move — dragHandlers with a no-op mover would swallow the press.
          const drag = onMoveGraphNode
            ? dragHandlers(
                clientToMm,
                (p) => onMoveGraphNode(n.id, snapDrag(p, { graphNodeId: n.id })),
                select,
                undefined,
                onCommit,
              )
            : {
                onClick: (e: React.MouseEvent) => {
                  e.stopPropagation();
                  select?.({ shift: e.shiftKey, phase: "click" });
                },
              };
          return (
            <g
              key={n.id}
              {...drag}
              tabIndex={0}
              role="button"
              aria-label={onMoveGraphNode ? "פינה — גרירה לשינוי המבנה" : "פינה"}
              onKeyDown={(e) => onMoveGraphNode && nudge(e, n.x, n.y, (p) => onMoveGraphNode(n.id, p))}
              className={`${onMoveGraphNode ? "cursor-move" : "cursor-pointer"} touch-none ${HANDLE_CLS}`}
            >
              <circle {...HALO} cx={n.x} cy={n.y} r={mm(10)} />
              <circle
                cx={n.x}
                cy={n.y}
                r={mm(isSelected ? 6.5 : 5)}
                className={isSelected ? "text-accent" : "text-ink-soft hover:text-accent"}
                fill="currentColor"
              />
            </g>
          );
        })}

      {/* Walls — solid stubs on either side of each door gap. The wall keeps its curve: the gap is
          cut along the bezier (via wallSegmentD), so a door on a bowed wall no longer flattens it.
          ponytail: the gap's t-range is the door's chord-distance / chord-length — the same chord
          approximation doors already use for placement, fine for a gentle bow. */}
      {outline.map((a, i) => {
        if (mode === "draw" && i === outline.length - 1) return null; // no closing edge until the shape is closed
        const b = outline[(i + 1) % outline.length];
        const curve = edgeCurves[i] ?? null;
        const isSelected = isSel("wall", String(i));
        const isHovered = hoverWall === i;
        const len = wallLengthMm(a, b) || 1;
        const doorsOnWall = entrances.filter((e) => e.wallIndex === i).sort((x, y) => x.distanceMm - y.distanceMm);
        const solids: [number, number][] = []; // solid-wall t-intervals between the door gaps
        let cursor = 0;
        for (const door of doorsOnWall) {
          const gs = Math.max(0, (door.distanceMm - door.widthMm / 2) / len);
          const ge = Math.min(1, (door.distanceMm + door.widthMm / 2) / len);
          if (gs > cursor) solids.push([cursor, gs]);
          cursor = Math.max(cursor, ge);
        }
        if (cursor < 1) solids.push([cursor, 1]);
        return (
          <g key={i}>
            {solids.map(([t0, t1], si) => (
              <path
                key={si}
                d={wallSegmentD(a, b, curve, t0, t1)}
                fill="none"
                className={isSelected || isHovered ? "text-accent" : "text-ink"}
                stroke="currentColor"
                strokeWidth={isSelected ? 3 : 2}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {mode === "edit" && (
              <path
                d={edgePathD(a, b, edgeCurves[i] ?? null)}
                fill="none"
                stroke="transparent"
                strokeWidth={mm(16)}
                className="cursor-pointer"
                onPointerEnter={() => setHoverWall(i)}
                onPointerLeave={() => setHoverWall((h) => (h === i ? null : h))}
                // Without this, the press bubbles past this path (it has no drag of its own) up to
                // the svg's onPointerDown, which reads an untouched pointerdown as the start of a
                // marquee — capturing the pointer there and leaving the wall's own click to fire
                // (if at all) against the canvas background instead of this wall.
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect({ kind: "wall", id: String(i) });
                }}
              />
            )}
          </g>
        );
      })}

      {/* Locked-wall badge — a small padlock below the wall's midpoint, so a locked length reads at
          a glance without selecting the wall to check the inspector. Drawn as plain SVG primitives
          rather than a nested icon component, matching how everything else on this canvas (doors,
          vertices, handles) is built from basic shapes. */}
      {mode === "edit" &&
        outline.map((a, i) => {
          if (!lockedEdges[i]) return null;
          const b = outline[(i + 1) % outline.length];
          const mid = edgeMidpoint(a, b, edgeCurves[i] ?? null);
          const r = mm(6);
          return (
            <g key={i} transform={`translate(${mid.x} ${mid.y + mm(16)})`} className={isSel("wall", String(i)) ? "text-accent" : "text-ink-soft"}>
              <rect x={-r} y={-r * 0.15} width={r * 2} height={r * 1.5} rx={r * 0.3} fill="currentColor" />
              <path
                d={`M ${-r * 0.55} ${-r * 0.15} V ${-r * 0.9} A ${r * 0.55} ${r * 0.55} 0 0 1 ${r * 0.55} ${-r * 0.9} V ${-r * 0.15}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={r * 0.35}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}

      {/* Rubber-band preview of the next wall — drawn to the *snapped* point, so the committed wall
          is exactly the one on screen. It goes accent while the angle is locked to a 5° multiple. */}
      {drawAnchor && pending && (
        <>
          <line
            x1={drawAnchor.x}
            y1={drawAnchor.y}
            x2={pending.point.x}
            y2={pending.point.y}
            className={pending.angleLocked ? "text-accent" : "text-muted"}
            stroke="currentColor"
            strokeWidth={1.5}
            strokeDasharray={6}
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={pending.point.x} cy={pending.point.y} r={mm(3.5)} className="text-accent" fill="currentColor" />
        </>
      )}

      {columns.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={c.rMm} className="text-muted" fill="currentColor" fillOpacity={0.35} />
      ))}

      {/* Wall bulge handles, and the selected wall's bezier control points. A diamond per wall, on
          screen at all times, is ten handles competing with ten vertices — so a wall only surfaces
          its curve handle once it's live (hovered, selected, or holding a drag), the way Figma and
          Illustrator scope a segment's handles. */}
      {mode === "edit" &&
        outline.map((a, i) => {
          const isSelectedWall = isSel("wall", String(i));
          if (!isSelectedWall && hoverWall !== i && dragWall !== i) return null;
          const b = outline[(i + 1) % outline.length];
          const curve = edgeCurves[i] ?? null;
          const mid = edgeMidpoint(a, b, curve);
          const bulgeDrag = dragHandlers(
            clientToMm,
            (p) => onMoveWallHandle(i, "bulge", p),
            () => onSelect({ kind: "wall", id: String(i) }),
            (dragging) => setDragWall(dragging ? i : null),
            onCommit,
          );
          return (
            <g key={i}>
              <g
                {...bulgeDrag}
                tabIndex={0}
                role="button"
                aria-label="עיקום הקיר — גרירה"
                // The diamond sits on top of the wall's hit stroke, so entering it reads as leaving
                // the wall — it has to hold the hover open itself or it would vanish on approach.
                onPointerEnter={() => setHoverWall(i)}
                onPointerLeave={() => setHoverWall((h) => (h === i ? null : h))}
                className={`cursor-move touch-none ${HANDLE_CLS}`}
              >
                <circle {...HALO} cx={mid.x} cy={mid.y} r={mm(11)} />
                <rect
                  x={mid.x - mm(5)}
                  y={mid.y - mm(5)}
                  width={mm(10)}
                  height={mm(10)}
                  transform={`rotate(45 ${mid.x} ${mid.y})`}
                  className={`hover:text-accent ${isSelectedWall ? "text-accent" : "text-ink-soft/60"}`}
                  fill="currentColor"
                />
              </g>
              {isSelectedWall && curve && (
                <BezierHandles a={a} b={b} curve={curve} mm={mm} clientToMm={clientToMm} onMoveHandle={(which, p) => onMoveWallHandle(i, which, p)} onCommit={onCommit} />
              )}
            </g>
          );
        })}

      {/* Vertices. The first one becomes the closing target once the shape can close: it carries an
          SNAP_PX-wide invisible hit area (matching the click radius handleCanvasClick tests, so the
          target is exactly as big as it behaves) and grows with a ring on hover, rather than sitting
          permanently enlarged and hoping the user guesses. */}
      {outline.map((v, i) => {
        const closeTarget = closable && i === 0;
        const hot = closeTarget && hoverClose;
        const interactive = mode === "edit";
        const ref: SelectedRef = { kind: "vertex", id: String(i) };
        const selectedVertex = isSel("vertex", String(i));
        const drag = dragHandlers(
          clientToMm,
          makeGroupAwareMove(ref, (p) => onMoveVertex(i, snapDrag(p, { vertexIdx: i }))),
          selectOrPreserveGroup(ref),
          undefined,
          endGroupDrag,
        );
        return (
          <g
            key={i}
            {...(interactive ? drag : {})}
            tabIndex={interactive ? 0 : undefined}
            role={interactive ? "button" : undefined}
            aria-label={interactive ? `נקודה ${i + 1} — גרירה לשינוי צורה` : undefined}
            onKeyDown={interactive ? (e) => nudge(e, v.x, v.y, (p) => onMoveVertex(i, p)) : undefined}
            className={interactive ? `cursor-move touch-none ${HANDLE_CLS}` : closeTarget ? "cursor-pointer" : undefined}
          >
            {interactive && <circle {...HALO} cx={v.x} cy={v.y} r={mm(10)} />}
            <circle
              cx={v.x}
              cy={v.y}
              r={mm(hot ? 10 : closeTarget ? 7 : selectedVertex ? 7 : 5)}
              className={
                (selectedVertex || closeTarget ? "text-accent" : "text-ink-soft") + (interactive ? " hover:text-accent" : "")
              }
              fill="currentColor"
            />
            {hot && (
              <circle cx={v.x} cy={v.y} r={mm(15)} className="text-accent" fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            )}
            {closeTarget && (
              <circle
                cx={v.x}
                cy={v.y}
                r={mm(SNAP_PX)}
                fill="transparent"
                onPointerEnter={() => setHoverClose(true)}
                onPointerLeave={() => setHoverClose(false)}
              />
            )}
          </g>
        );
      })}

      {/* Entrances — the gap is already the absence of wall above; this adds the door leaf(s) +
          swing arc (single/double, in/out — see doorGeometry), the drag handle to slide it along
          the wall, and the selection highlight. */}
      {entrances.map((en) => {
        const a = outline[en.wallIndex];
        const b = outline[(en.wallIndex + 1) % outline.length];
        if (!a || !b) return null;
        const ref: SelectedRef = { kind: "entrance", id: en.id };
        return (
          <EntranceDoor
            key={en.id}
            entrance={en}
            a={a}
            b={b}
            interiorHint={interiorHint}
            selected={isSel("entrance", en.id)}
            onSelect={selectOrPreserveGroup(ref)}
            onMove={makeGroupAwareMove(ref, (p) => onMoveEntrance?.(en.id, p))}
            onCommit={endGroupDrag}
            clientToMm={clientToMm}
            mm={mm}
          />
        );
      })}
      {stage && (() => {
        const ref: SelectedRef = { kind: "stage", id: stage.id };
        return (
          <FixtureMarker
            fixture={stage}
            selected={isSel("stage", stage.id)}
            onSelect={selectOrPreserveGroup(ref)}
            onMove={makeGroupAwareMove(ref, (p) => onMoveStage?.(snapDrag(p, { fixtureId: stage.id })))}
            onUpdate={(patch) => onUpdateStage?.(patch)}
            onCommit={endGroupDrag}
            onRotating={setRotating}
            altHeld={altHeld}
            clientToMm={clientToMm}
            mm={mm}
          />
        );
      })()}
      {bars.map((b) => {
        const ref: SelectedRef = { kind: "bar", id: b.id };
        return (
          <FixtureMarker
            key={b.id}
            fixture={b}
            selected={isSel("bar", b.id)}
            onSelect={selectOrPreserveGroup(ref)}
            onMove={makeGroupAwareMove(ref, (p) => onMoveBar?.(b.id, snapDrag(p, { fixtureId: b.id })))}
            onUpdate={(patch) => onUpdateBar?.(b.id, patch)}
            onCommit={endGroupDrag}
            onRotating={setRotating}
            altHeld={altHeld}
            clientToMm={clientToMm}
            mm={mm}
          />
        );
      })}

      {/* Group selection — a dashed bbox around every selected ref's point, plus (fixtures-only) a
          rotate handle above it so a homogeneous group of stage/bars can be spun together the same
          way one fixture already can. Mixed selections (vertices/entrances in the mix) still get
          the bbox, for visual feedback, but no rotate handle — a polygon vertex has no "facing" to
          spin, so rotating a mixed group has no well-defined meaning. */}
      {selected.length > 1 &&
        (() => {
          const points = selected.flatMap(boundsOf);
          if (points.length === 0) return null;
          const minX = Math.min(...points.map((p) => p.x));
          const maxX = Math.max(...points.map((p) => p.x));
          const minY = Math.min(...points.map((p) => p.y));
          const maxY = Math.max(...points.map((p) => p.y));
          const padPx = 14;
          const pad = mm(padPx);
          const fixturesOnly = selected.every((r) => r.kind === "stage" || r.kind === "bar");
          const pivot = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
          const handleGap = mm(20);
          const handleY = minY - pad - handleGap;
          const rotateDrag = fixturesOnly
            ? dragHandlers(
                clientToMm,
                (p, mods) => {
                  if (!groupRotate.current) {
                    const snapshot = selected
                      .map((r) => {
                        const f = r.kind === "stage" ? stage : bars.find((x) => x.id === r.id);
                        return f ? { id: f.id, origin: { x: f.x, y: f.y }, rotationDeg: f.rotationDeg ?? 0 } : null;
                      })
                      .filter((s): s is { id: string; origin: Point; rotationDeg: number } => !!s);
                    const startDeg = (Math.atan2(p.y - pivot.y, p.x - pivot.x) * 180) / Math.PI + 90;
                    groupRotate.current = { pivot, startDeg, snapshot };
                  }
                  const { pivot: fixedPivot, startDeg, snapshot } = groupRotate.current;
                  const raw = (Math.atan2(p.y - fixedPivot.y, p.x - fixedPivot.x) * 180) / Math.PI + 90;
                  const free = mods.alt || !!altHeld;
                  const rawDelta = raw - startDeg;
                  const deltaDeg = free ? rawDelta : constrainAngleDeg(rawDelta);
                  const updates = snapshot.map((s) => {
                    const moved = fromLocalFrame(toLocalFrame(s.origin, fixedPivot, 0), fixedPivot, deltaDeg);
                    return { id: s.id, x: moved.x, y: moved.y, rotationDeg: norm360(s.rotationDeg + deltaDeg) };
                  });
                  onRotateFixtureGroup?.(updates);
                  setRotating({ deg: norm360(deltaDeg), locked: !free, at: { x: fixedPivot.x, y: handleY } });
                },
                undefined,
                (dragging) => { if (!dragging) { groupRotate.current = null; setRotating(null); } },
                onCommit,
              )
            : null;
          return (
            <g>
              <rect
                x={minX - pad}
                y={minY - pad}
                width={maxX - minX + pad * 2}
                height={maxY - minY + pad * 2}
                fill="none"
                className="text-accent"
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="5 3"
                vectorEffect="non-scaling-stroke"
              />
              {rotateDrag && (
                <>
                  <line x1={pivot.x} y1={minY - pad} x2={pivot.x} y2={handleY} className="text-accent/50" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  <g {...rotateDrag} tabIndex={0} role="button" aria-label="סיבוב הקבוצה — גרירה" className={`cursor-alias touch-none ${HANDLE_CLS}`}>
                    <circle {...HALO} cx={pivot.x} cy={handleY} r={mm(11)} />
                    <circle cx={pivot.x} cy={handleY} r={mm(6)} className="text-accent hover:text-accent-deep" fill="currentColor" />
                  </g>
                </>
              )}
            </g>
          );
        })()}

      {/* Marquee (rubber-band) select — a translucent rectangle while the drag is live; the hit
          test itself runs once, on release (see collectMarqueeHits). */}
      {marqueeBox && (
        <rect
          x={Math.min(marqueeBox.x0, marqueeBox.x1)}
          y={Math.min(marqueeBox.y0, marqueeBox.y1)}
          width={Math.abs(marqueeBox.x1 - marqueeBox.x0)}
          height={Math.abs(marqueeBox.y1 - marqueeBox.y0)}
          className="text-accent"
          fill="currentColor"
          fillOpacity={0.08}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* Smart-alignment guides — the accent lines that appear when a drag, or the pending wall,
          lines up with an existing edge/vertex/centre */}
      {shownGuides.x !== null && (
        <line x1={shownGuides.x} y1={vb.minY} x2={shownGuides.x} y2={vb.minY + vb.h} className="text-accent" stroke="currentColor" strokeWidth={1} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
      )}
      {shownGuides.y !== null && (
        <line x1={vb.minX} y1={shownGuides.y} x2={vb.minX + vb.w} y2={shownGuides.y} className="text-accent" stroke="currentColor" strokeWidth={1} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
      )}

      {/* Measure overlay — each wall's length in metres at its midpoint. Live while drawing too;
          the not-yet-drawn closing edge is skipped, exactly as the wall render skips it. */}
      {showDims &&
        outline.map((a, i) => {
          if (mode === "draw" && i === outline.length - 1) return null;
          const b = outline[(i + 1) % outline.length];
          const curve = edgeCurves[i] ?? null;
          const mid = edgeMidpoint(a, b, curve);
          return (
            <text key={i} x={mid.x} y={mid.y} dy={-mm(7)} textAnchor="middle" className="text-accent" fill="currentColor" style={{ fontSize: mm(12), fontWeight: 600 }}>
              {(wallLengthMm(a, b) / 1000).toFixed(2)}
            </text>
          );
        })}
    </svg>

    {/* HTML overlays rather than SVG text: they stay a fixed screen size for free and carry a real
        surface scrim, so nothing sits unbacked on the grid. Positioned with physical left/top —
        these are canvas coordinates, not flow, and SVG user space runs left-to-right whatever the
        document direction is. */}
    {hasRect && showDims && outline.length >= 3 && (() => {
      const c = worldToPx(polygonCentroid(outline));
      const m2 = polygonAreaMm2(outline) / 1e6;
      return (
        <div
          className="pointer-events-none absolute rounded-full border border-border bg-surface/90 px-2.5 py-1 text-xs font-medium text-ink-soft shadow-floating nums"
          style={{ left: c.x, top: c.y, transform: "translate(-50%, -50%)" }}
        >
          {m2 < 10 ? m2.toFixed(2) : m2.toFixed(1)} מ״ר
        </div>
      );
    })()}

    {/* The live rotation angle, in the same pill as the drawing readout — accent while it's locked
        to a 5° step, ink once Alt has released it. Doubles as the group-rotate readout. */}
    {hasRect && rotating && (() => {
      const at = worldToPx(rotating.at);
      return (
        <div
          className="pointer-events-none absolute rounded-full border border-border bg-surface/90 px-2.5 py-1 text-xs font-medium shadow-floating nums"
          style={{ left: at.x, top: at.y, transform: "translate(-50%, -170%)" }}
        >
          <span className={rotating.locked ? "text-accent" : "text-ink"}>{Math.round(rotating.deg)}°</span>
        </div>
      );
    })()}

    {/* The pending wall's readout, and the value box it turns into once a digit is typed. */}
    {hasRect && drawAnchor && (pending || entry) && (() => {
      const at = worldToPx(pending ? edgeMidpoint(drawAnchor, pending.point) : drawAnchor);
      const lenText = `${(pendingLenMm / 1000).toFixed(2)} מ׳`;
      const angText = `${Math.round(pendingAngleDeg)}°`;
      return (
        <div className="absolute" style={{ left: at.x, top: at.y, transform: "translate(-50%, -170%)" }}>
          {entry ? (
            <div className="flex items-center gap-1.5 rounded-full border border-accent bg-surface px-2.5 py-1 text-xs shadow-floating">
              <input
                ref={entryRef}
                dir="ltr"
                inputMode="decimal"
                value={entry.field === "length" ? entry.length : entry.angle}
                aria-label={entry.field === "length" ? "אורך הקטע במטרים" : "זווית הקטע במעלות"}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (!/^-?\d*\.?\d*$/.test(raw)) return;
                  setEntry((s) => (s ? (s.field === "length" ? { ...s, length: raw } : { ...s, angle: raw }) : s));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitEntry(); }
                  else if (e.key === "Escape") { e.preventDefault(); setEntry(null); svgRef.current?.focus(); }
                  else if (e.key === "Tab") { e.preventDefault(); setEntry((s) => (s ? { ...s, field: s.field === "length" ? "angle" : "length" } : s)); }
                }}
                onBlur={() => setEntry(null)}
                className="w-16 rounded-full bg-transparent text-center font-medium text-ink focus:outline-none nums"
              />
              <span className="text-muted">{entry.field === "length" ? "מ׳" : "°"}</span>
              <div className="h-3.5 w-px bg-border" />
              {/* the other half of the pair, so Tab has something to aim at */}
              <span className="text-muted nums">{entry.field === "length" ? angText : lenText}</span>
            </div>
          ) : (
            <div className="pointer-events-none flex items-center gap-1.5 rounded-full border border-border bg-surface/90 px-2.5 py-1 text-xs font-medium text-ink shadow-floating nums">
              <span>{lenText}</span>
              <span className="text-muted">·</span>
              <span className={pending?.angleLocked ? "text-accent" : "text-muted"}>{angText}</span>
            </div>
          )}
        </div>
      );
    })()}

    <div className="absolute bottom-4 start-4 flex items-center gap-0.5 rounded-md border border-border bg-surface p-1 shadow-floating">
      {onUndo && onRedo && (
        <>
          <IconButton label="ביטול פעולה" onClick={onUndo} disabled={!canUndo}>
            <Undo2 className="h-4 w-4" strokeWidth={2} />
          </IconButton>
          <IconButton label="ביצוע חוזר" onClick={onRedo} disabled={!canRedo}>
            <Redo2 className="h-4 w-4" strokeWidth={2} />
          </IconButton>
          <div className="mx-0.5 h-5 w-px bg-border" />
        </>
      )}
      <IconButton label="התרחקות" onClick={() => zoomByCenter(1.2)}>
        <Minus className="h-4 w-4" strokeWidth={2} />
      </IconButton>
      <IconButton label="התקרבות" onClick={() => zoomByCenter(1 / 1.2)}>
        <Plus className="h-4 w-4" strokeWidth={2} />
      </IconButton>
      <IconButton label="התאמת התצוגה לתרשים" onClick={() => { cancelFocus(); fitTo(contentBox, rect.w, rect.h); }}>
        <Maximize className="h-4 w-4" strokeWidth={2} />
      </IconButton>
      <div className="mx-0.5 h-5 w-px bg-border" />
      <IconButton label={showDims ? "הסתרת מידות" : "הצגת מידות"} onClick={() => setDimsOverride(!showDims)} className={showDims ? "text-accent" : undefined}>
        <Ruler className="h-4 w-4" strokeWidth={2} />
      </IconButton>
    </div>
    {menu && (
      <CanvasMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
    )}
    </>
  );
}

// Generic right-click menu, fixed-positioned at the pointer; a full-screen backdrop closes it on any
// outside click or right-click. Items are supplied by the host (see contextMenuItems).
function CanvasMenu({ x, y, items, onClose }: { x: number; y: number; items: ContextMenuItem[]; onClose: () => void }) {
  const cls = "flex w-full items-center gap-2.5 px-3 py-2 text-sm text-ink transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-transparent";
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div role="menu" className="fixed z-50 min-w-44 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-floating" style={{ top: y, left: x }}>
        {items.map((it, i) => (
          <button key={i} type="button" role="menuitem" className={cls} disabled={it.disabled} onClick={() => { it.onSelect(); onClose(); }}>
            {it.icon && <it.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />}
            {it.label}
          </button>
        ))}
      </div>
    </>
  );
}

function BezierHandles({
  a,
  b,
  curve,
  mm,
  clientToMm,
  onMoveHandle,
  onCommit,
}: {
  a: Point;
  b: Point;
  curve: EdgeCurve;
  mm: (px: number) => number;
  clientToMm: (clientX: number, clientY: number) => Point;
  onMoveHandle: (which: "c1" | "c2", p: Point) => void;
  onCommit?: () => void;
}) {
  const { c1, c2 } = absoluteControlPoints(a, b, curve);
  const drag1 = dragHandlers(clientToMm, (p) => onMoveHandle("c1", p), undefined, undefined, onCommit);
  const drag2 = dragHandlers(clientToMm, (p) => onMoveHandle("c2", p), undefined, undefined, onCommit);
  const r = mm(4);
  return (
    <>
      <line x1={a.x} y1={a.y} x2={c1.x} y2={c1.y} className="text-accent/40" stroke="currentColor" strokeWidth={1} strokeDasharray={4} vectorEffect="non-scaling-stroke" />
      <line x1={b.x} y1={b.y} x2={c2.x} y2={c2.y} className="text-accent/40" stroke="currentColor" strokeWidth={1} strokeDasharray={4} vectorEffect="non-scaling-stroke" />
      <g {...drag1} tabIndex={0} role="button" aria-label="נקודת בקרה 1 — גרירה לעיצוב הקיר" className={`cursor-move touch-none ${HANDLE_CLS}`}>
        <circle {...HALO} cx={c1.x} cy={c1.y} r={r + mm(5)} />
        <circle cx={c1.x} cy={c1.y} r={r} className="text-accent hover:text-accent-deep" fill="currentColor" />
      </g>
      <g {...drag2} tabIndex={0} role="button" aria-label="נקודת בקרה 2 — גרירה לעיצוב הקיר" className={`cursor-move touch-none ${HANDLE_CLS}`}>
        <circle {...HALO} cx={c2.x} cy={c2.y} r={r + mm(5)} />
        <circle cx={c2.x} cy={c2.y} r={r} className="text-accent hover:text-accent-deep" fill="currentColor" />
      </g>
    </>
  );
}

// A door cut into a wall: the gap itself is rendered by the wall above (stub segments); this
// draws the leaf(es) + swing arc — single or double, swinging in or out per entrance.swingInward/
// doubleDoor (see doorGeometry) — and gives the door a drag handle that slides it along its wall
// (world-space drag points get projected back onto the wall's chord by the caller).
function EntranceDoor({
  entrance,
  a,
  b,
  interiorHint,
  selected,
  onSelect,
  onMove,
  onCommit,
  clientToMm,
  mm,
}: {
  entrance: Entrance;
  a: Point;
  b: Point;
  interiorHint: Point; // which side of the wall reads as "inward" — see doorGeometry
  selected: boolean;
  onSelect: (mods: { shift: boolean; phase: "press" | "click" }) => void;
  onMove: (p: Point) => void;
  onCommit?: () => void;
  clientToMm: (clientX: number, clientY: number) => Point;
  mm: (px: number) => number;
}) {
  const half = entrance.widthMm / 2;
  const gapStart = pointAtDistance(a, b, entrance.distanceMm - half);
  const gapEnd = pointAtDistance(a, b, entrance.distanceMm + half);
  const mid = pointAtDistance(a, b, entrance.distanceMm);
  const door = doorGeometry(a, b, entrance.distanceMm, entrance.widthMm, entrance.swingInward, interiorHint, entrance.doubleDoor);
  const drag = dragHandlers(clientToMm, onMove, onSelect, undefined, onCommit);

  // The door slides along its wall, but the wall's own direction can run either way — so an arrow
  // key names a *screen* direction, which gets projected onto the wall to pick the sign. (SVG y
  // grows downward, so ↑ is -y.) A wall square to the pressed key has no direction to offer and
  // the key does nothing, rather than sliding the door the way the user didn't point.
  const nudgeAlongWall = (e: React.KeyboardEvent) => {
    const pressed: Record<string, Point> = {
      ArrowRight: { x: 1, y: 0 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const dir = pressed[e.key];
    if (!dir) return;
    e.preventDefault();
    const len = wallLengthMm(a, b) || 1;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const along = dir.x * ux + dir.y * uy;
    if (Math.abs(along) < 1e-6) return;
    const delta = (e.shiftKey ? 200 : 50) * Math.sign(along);
    onMove({ x: mid.x + ux * delta, y: mid.y + uy * delta });
  };

  // The opening itself is just the missing stretch of wall; this handle sits over the gap to slide
  // it along the wall and show a selection highlight.
  return (
    <g
      {...drag}
      tabIndex={0}
      role="button"
      aria-label="פתח — גרירה לאורך הקיר"
      aria-pressed={selected}
      onKeyDown={nudgeAlongWall}
      className={`group cursor-move touch-none ${HANDLE_CLS}`}
    >
      <rect
        {...HALO}
        x={mid.x - half - mm(4)}
        y={mid.y - mm(9)}
        width={entrance.widthMm + mm(8)}
        height={mm(18)}
        rx={mm(5)}
        transform={`rotate(${wallAngleDeg(a, b)} ${mid.x} ${mid.y})`}
      />
      <line x1={gapStart.x} y1={gapStart.y} x2={gapEnd.x} y2={gapEnd.y} stroke="transparent" strokeWidth={mm(14)} />
      {/* The door leaf(es) — a straight line from hinge to the open tip — and the quarter-circle
          swing arc from that tip back to the wall (or, on a double door, to the opening's centre).
          Ink by default, same as a wall; accent on hover/selection, same as everything else here. */}
      <g className={selected ? "text-accent" : "text-ink-soft group-hover:text-accent"}>
        {door.leaves.map((leaf, i) => (
          <g key={i}>
            <line x1={leaf.hinge.x} y1={leaf.hinge.y} x2={leaf.tip.x} y2={leaf.tip.y} stroke="currentColor" strokeWidth={selected ? 2 : 1.5} vectorEffect="non-scaling-stroke" />
            <path
              d={`M ${leaf.tip.x} ${leaf.tip.y} A ${leaf.lenMm} ${leaf.lenMm} 0 0 ${leaf.sweepFlag} ${leaf.arcTo.x} ${leaf.arcTo.y}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={selected ? 1.4 : 1}
              strokeDasharray={3}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
      </g>
    </g>
  );
}

// Stage/bar: draggable to move, plus (when selected) a rotate handle above and a resize handle on
// each edge. Handles sit inside the same rotated group so they turn with the shape for free; their
// drag math always works in world mm (via clientToMm) and converts through the fixture's own
// rotation, so resizing along "its" width/depth is correct at any angle. Every edge handle anchors
// the edge opposite it (see resizeFromEdge) — grabbing one side must never push the other out.
function FixtureMarker({
  fixture,
  selected,
  onSelect,
  onMove,
  onUpdate,
  onCommit,
  onRotating,
  altHeld,
  clientToMm,
  mm,
}: {
  fixture: Fixture;
  selected: boolean;
  onSelect: (mods: { shift: boolean; phase: "press" | "click" }) => void;
  onMove: (p: Point) => void;
  onUpdate: (patch: Partial<Fixture>) => void;
  onCommit?: () => void;
  onRotating?: (state: { deg: number; locked: boolean; at: Point } | null) => void;
  altHeld?: boolean;
  clientToMm: (clientX: number, clientY: number) => Point;
  mm: (px: number) => number;
}) {
  const drag = dragHandlers(clientToMm, onMove, onSelect, undefined, onCommit);
  const shape = fixture.shape ?? "rect";
  const rot = fixture.rotationDeg ?? 0;
  const center = { x: fixture.x, y: fixture.y };
  const halfW = fixture.widthMm / 2;
  const halfD = fixture.depthMm / 2;
  // A circle is drawn from widthMm alone, so that's its vertical extent as well — its depthMm can
  // be left over from whatever shape it was toggled out of. Anything hanging off the top edge (the
  // rotate handle, the focus halo) measures from here rather than from depthMm.
  const halfV = shape === "circle" ? halfW : halfD;
  const colorClass = selected ? "text-accent" : "text-ink-soft";
  // "currentColor" as the default fill/stroke is the pass-through case: with no style set,
  // resolveStyle hands it straight back and colorClass still drives it exactly as before.
  // Selection is also shown by the separate rotate/resize handles below, so a custom colour is
  // free to fully override the body without losing the selected affordance.
  const resolved = resolveStyle(fixture.style, "screen", {
    fill: "currentColor",
    fillOpacity: selected ? 0.22 : 0.1,
    stroke: "currentColor",
    strokeWidth: 1.5,
  });
  const shared = {
    className: colorClass,
    fill: resolved.fill,
    fillOpacity: resolved.fillOpacity,
    stroke: resolved.stroke,
    strokeWidth: resolved.strokeWidth,
    strokeDasharray: resolved.dashArray.length ? resolved.dashArray.join(" ") : undefined,
    vectorEffect: "non-scaling-stroke" as const,
  };

  const handleGap = mm(20);
  const handleSize = mm(10);

  // Rotation lands on 15° steps by default — a stage is almost never at 37.4°, and the same lock
  // (and the same Alt release) already governs drawing a wall. The angle rides up to the canvas so
  // it can be read out in a pill beside the handle.
  const rotateDrag = dragHandlers(
    clientToMm,
    (p, mods) => {
      const raw = (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI + 90;
      const free = mods.alt || !!altHeld;
      const deg = free ? norm360(raw) : constrainAngleDeg(raw);
      onUpdate({ rotationDeg: deg });
      onRotating?.({ deg, locked: !free, at: fromLocalFrame({ x: 0, y: -halfV - handleGap }, center, deg) });
    },
    undefined,
    (dragging) => { if (!dragging) onRotating?.(null); },
    onCommit,
  );
  // sign is which of the two opposing edges this handle sits on, in the fixture's own frame.
  const resizeEdgeDrag = (axis: "width" | "depth", sign: 1 | -1) =>
    dragHandlers(
      clientToMm,
      (p) => {
        const { sizeMm, center: next } = resizeFromEdge(fixture, axis, sign, p, MIN_FIXTURE_MM);
        const size = axis === "width" ? { widthMm: sizeMm } : { depthMm: sizeMm };
        onUpdate({ ...size, x: next.x, y: next.y }); // one patch: the new size and the centre it implies
      },
      undefined,
      undefined,
      onCommit,
    );
  const resizeRadiusDrag = dragHandlers(
    clientToMm,
    (p) => {
      // A circle's handle is a radius, not an edge: it stays centre-anchored so a round bar grows
      // evenly about the spot it was placed on instead of walking sideways as it's resized.
      const local = toLocalFrame(p, center, rot);
      const d = Math.max(MIN_FIXTURE_MM, Math.round(Math.hypot(local.x, local.y) * 2));
      onUpdate({ widthMm: d, depthMm: d });
    },
    undefined,
    undefined,
    onCommit,
  );

  return (
    <g transform={`rotate(${rot} ${fixture.x} ${fixture.y})`}>
      <g
        {...drag}
        tabIndex={0}
        role="button"
        aria-label={`${fixture.label} — גרירה למיקום`}
        aria-pressed={selected}
        onKeyDown={(e) => nudge(e, fixture.x, fixture.y, onMove)}
        className={`cursor-move touch-none ${HANDLE_CLS}`}
      >
        <rect
          {...HALO}
          x={fixture.x - halfW - mm(5)}
          y={fixture.y - halfV - mm(5)}
          width={fixture.widthMm + mm(10)}
          height={halfV * 2 + mm(10)}
          rx={mm(5)}
        />
        {shape === "circle" ? (
          <circle cx={fixture.x} cy={fixture.y} r={halfW} {...shared} />
        ) : shape === "ellipse" ? (
          <ellipse cx={fixture.x} cy={fixture.y} rx={halfW} ry={halfD} {...shared} />
        ) : (
          <rect x={fixture.x - halfW} y={fixture.y - halfD} width={fixture.widthMm} height={fixture.depthMm} {...shared} />
        )}
        <text x={fixture.x} y={fixture.y} textAnchor="middle" dominantBaseline="central" className="text-ink-soft" fill="currentColor" style={{ fontSize: mm(12) }}>
          {fixture.label}
        </text>
      </g>

      {selected && (
        <>
          <line
            x1={fixture.x}
            y1={fixture.y - halfV}
            x2={fixture.x}
            y2={fixture.y - halfV - handleGap}
            className="text-accent/50"
            stroke="currentColor"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <g {...rotateDrag} tabIndex={0} role="button" aria-label="סיבוב — גרירה" className={`cursor-alias touch-none ${HANDLE_CLS}`}>
            <circle {...HALO} cx={fixture.x} cy={fixture.y - halfV - handleGap} r={mm(11)} />
            <circle cx={fixture.x} cy={fixture.y - halfV - handleGap} r={mm(6)} className="text-accent hover:text-accent-deep" fill="currentColor" />
          </g>

          {shape === "circle" ? (
            <ResizeHandle
              {...resizeRadiusDrag}
              label="שינוי קוטר — גרירה"
              cursor="cursor-nesw-resize"
              cx={fixture.x + halfW}
              cy={fixture.y}
              size={handleSize}
              mm={mm}
            />
          ) : (
            // Both edges of each axis, so either side can be pulled — each anchors the one opposite.
            <>
              {([1, -1] as const).map((sign) => (
                <ResizeHandle
                  key={`w${sign}`}
                  {...resizeEdgeDrag("width", sign)}
                  label="שינוי רוחב — גרירה"
                  cursor="cursor-ew-resize"
                  cx={fixture.x + sign * halfW}
                  cy={fixture.y}
                  size={handleSize}
                  mm={mm}
                />
              ))}
              {([1, -1] as const).map((sign) => (
                <ResizeHandle
                  key={`d${sign}`}
                  {...resizeEdgeDrag("depth", sign)}
                  label="שינוי עומק — גרירה"
                  cursor="cursor-ns-resize"
                  cx={fixture.x}
                  cy={fixture.y + sign * halfD}
                  size={handleSize}
                  mm={mm}
                />
              ))}
            </>
          )}
        </>
      )}
    </g>
  );
}

// One resize handle — the square, its focus halo and its hit area — since a fixture now carries up
// to four of them. The drag props are spread in by the caller, which owns the maths.
function ResizeHandle({
  label,
  cursor,
  cx,
  cy,
  size,
  mm,
  ...drag
}: ReturnType<typeof dragHandlers> & {
  label: string;
  cursor: string;
  cx: number;
  cy: number;
  size: number;
  mm: (px: number) => number;
}) {
  return (
    <g {...drag} tabIndex={0} role="button" aria-label={label} className={`${cursor} touch-none ${HANDLE_CLS}`}>
      <circle {...HALO} cx={cx} cy={cy} r={mm(10)} />
      <rect x={cx - size / 2} y={cy - size / 2} width={size} height={size} className="text-accent hover:text-accent-deep" fill="currentColor" />
    </g>
  );
}

const SHAPE_LABEL: Record<FixtureShape, string> = { rect: "מלבן", circle: "עיגול", ellipse: "אליפסה" };

// The floating inspector's shell. Exported so a second inspector over the same canvas (the venue
// plan's walls/doors/features) is the same object, not a lookalike that drifts.
export const INSPECTOR_WRAP =
  "flex max-w-4xl flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-2 shadow-floating";

// A cluster of related fields (dimensions, transform, style...) — kept as one flex item so the
// wrap's flex-wrap breaks between groups, never in the middle of one.
export function InspectorGroup({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex shrink-0 items-center gap-2 ${className}`}>{children}</div>;
}

export function InspectorDivider() {
  return <div aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-border" />;
}

// The identity chip every inspector opens with — an icon so the selected kind reads at a glance,
// matching the object-inspector convention of other plan/design tools.
export function InspectorHeader({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 ps-0.5">
      <Icon className="h-4 w-4 text-accent" strokeWidth={1.75} />
      <span className="text-sm font-semibold text-ink nums">{label}</span>
    </div>
  );
}

// One segmented control, sized to the fields' own h-10 so a toggle beside a NumberField lands on
// the same baseline instead of reading a size smaller.
export function SegmentedToggle<T extends string | number | boolean>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex h-10 shrink-0 items-center gap-1 rounded-md border border-border p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`flex h-full items-center rounded-sm px-2.5 text-xs font-semibold transition-colors ${
            o.value === value ? "bg-accent text-canvas" : "text-ink-soft hover:bg-bg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SelectionInspector({
  selected,
  outline,
  edgeCurves,
  lockedEdges = [],
  entrances = [],
  stage,
  bars = [],
  onUpdateEntrance = () => {},
  onUpdateStage = () => {},
  onUpdateBar = () => {},
  onRemoveEntrance = () => {},
  onRemoveStage = () => {},
  onRemoveBar = () => {},
  onRemoveVertex,
  onRemoveSelection = () => {},
  onInsertVertexOnWall,
  onSetWallLength,
  onSetWallAngle,
  onSetWallBulgeDepth,
  onToggleWallLock = () => {},
  onClose,
  edgeNoun = "קיר",
}: {
  selected: SelectedRef[];
  outline: Point[];
  edgeCurves: (EdgeCurve | null)[];
  lockedEdges?: boolean[];
  edgeNoun?: string; // what an outline edge is called — "קיר" in a hall, "צלע" for a product footprint
  entrances?: Entrance[];
  stage?: Fixture | undefined;
  bars?: Fixture[];
  onUpdateEntrance?: (id: string, patch: Partial<Entrance>) => void;
  onUpdateStage?: (patch: Partial<Fixture>) => void;
  onUpdateBar?: (id: string, patch: Partial<Fixture>) => void;
  onRemoveEntrance?: (id: string) => void;
  onRemoveStage?: () => void;
  onRemoveBar?: (id: string) => void;
  onRemoveVertex: (idx: number) => void;
  onRemoveSelection?: (refs: SelectedRef[]) => void;
  onInsertVertexOnWall: (edgeIdx: number) => void;
  onSetWallLength: (edgeIdx: number, meters: number) => void;
  onSetWallAngle: (edgeIdx: number, degrees: number) => void;
  onSetWallBulgeDepth: (edgeIdx: number, depthMm: number) => void;
  onToggleWallLock?: (edgeIdx: number) => void;
  onClose: () => void;
}) {
  const wrap = INSPECTOR_WRAP;
  const mmToCm = (mm: number) => mm / 10;
  const closeBtn = (
    <IconButton label="סגירת בחירה" className="ms-auto" onClick={onClose}>
      <X className="h-4 w-4" strokeWidth={2} />
    </IconButton>
  );
  const shapeToggle = (shape: FixtureShape, onPick: (s: FixtureShape) => void) => (
    <SegmentedToggle
      value={shape}
      options={(Object.keys(SHAPE_LABEL) as FixtureShape[]).map((s) => ({ value: s, label: SHAPE_LABEL[s] }))}
      onChange={onPick}
      ariaLabel="צורה"
    />
  );
  // A plain two-way segmented control — door direction/leaf-count, either boolean.
  const boolToggle = (value: boolean, onLabel: string, offLabel: string, onPick: (v: boolean) => void) => (
    <SegmentedToggle
      value={value}
      options={[
        { value: true, label: onLabel },
        { value: false, label: offLabel },
      ]}
      onChange={onPick}
    />
  );
  const rotationField = (rotationDeg: number, onChange: (deg: number) => void) => (
    <NumberField layout="inline" label="זווית (°)" decimals={0} min={0} max={360} value={rotationDeg} onChange={onChange} className="w-20" />
  );

  if (selected.length === 0) return null;
  // A multi-select gets its own compact panel — the individual fields below only make sense for
  // one kind of thing at a time, so a mixed (or same-kind) group just gets a count and a delete.
  if (selected.length > 1) {
    return (
      <div className={wrap}>
        <InspectorHeader icon={Layers} label={`${selected.length} נבחרו`} />
        <InspectorDivider />
        <Button variant="danger" size="sm" onClick={() => onRemoveSelection(selected)}>
          <Trash2 className="h-4 w-4" strokeWidth={2} />
          מחיקה
        </Button>
        {closeBtn}
      </div>
    );
  }
  const selectedOne = selected[0];

  if (selectedOne.kind === "entrance") {
    const e = entrances.find((x) => x.id === selectedOne.id);
    if (!e) return null;
    const a = outline[e.wallIndex];
    const b = outline[(e.wallIndex + 1) % outline.length];
    const wallLen = a && b ? wallLengthMm(a, b) : 0;
    return (
      <div className={wrap}>
        <InspectorHeader icon={DoorOpen} label="כניסה" />
        <InspectorDivider />
        <InspectorGroup>
          <NumberField
            layout="inline"
            label="מרחק מקצה הקיר (מ׳)"
            decimals={2}
            min={0}
            max={wallLen / 1000}
            value={e.distanceMm / 1000}
            onChange={(m) => onUpdateEntrance(e.id, { distanceMm: m * 1000 })}
            className="w-20"
          />
          <NumberField
            layout="inline"
            label="רוחב (ס״מ)"
            decimals={0}
            min={40}
            value={mmToCm(e.widthMm)}
            onChange={(cm) => onUpdateEntrance(e.id, { widthMm: cm * 10 })}
            className="w-20"
          />
        </InspectorGroup>
        <InspectorDivider />
        <InspectorGroup>
          {boolToggle(e.doubleDoor, "כפולה", "יחידה", (v) => onUpdateEntrance(e.id, { doubleDoor: v }))}
          {boolToggle(e.swingInward, "פנימה", "החוצה", (v) => onUpdateEntrance(e.id, { swingInward: v }))}
        </InspectorGroup>
        <InspectorDivider />
        <Button variant="danger" size="sm" onClick={() => onRemoveEntrance(e.id)}>
          <Trash2 className="h-4 w-4" strokeWidth={2} />
          מחיקה
        </Button>
        {closeBtn}
      </div>
    );
  }

  if (selectedOne.kind === "stage") {
    if (!stage) return null;
    return (
      <div className={wrap}>
        <InspectorHeader icon={Presentation} label="במה" />
        <InspectorDivider />
        <InspectorGroup>
          <NumberField layout="inline" label="רוחב (ס״מ)" decimals={0} min={0} value={mmToCm(stage.widthMm)} onChange={(cm) => onUpdateStage({ widthMm: cm * 10 })} className="w-20" />
          <NumberField layout="inline" label="עומק (ס״מ)" decimals={0} min={0} value={mmToCm(stage.depthMm)} onChange={(cm) => onUpdateStage({ depthMm: cm * 10 })} className="w-20" />
          <NumberField layout="inline" label="גובה במה (ס״מ)" decimals={0} min={0} value={mmToCm(stage.heightMm)} onChange={(cm) => onUpdateStage({ heightMm: cm * 10 })} className="w-20" />
        </InspectorGroup>
        <InspectorDivider />
        <InspectorGroup>{rotationField(stage.rotationDeg ?? 0, (deg) => onUpdateStage({ rotationDeg: deg }))}</InspectorGroup>
        <InspectorDivider />
        <InspectorGroup>
          <StyleFields style={stage.style} onChange={(style) => onUpdateStage({ style })} strokeWidthDefault={1.5} />
        </InspectorGroup>
        <InspectorDivider />
        <Button variant="danger" size="sm" onClick={onRemoveStage}>
          <Trash2 className="h-4 w-4" strokeWidth={2} />
          הסרה
        </Button>
        {closeBtn}
      </div>
    );
  }

  if (selectedOne.kind === "bar") {
    const b = bars.find((x) => x.id === selectedOne.id);
    if (!b) return null;
    const shape = b.shape ?? "rect";
    return (
      <div className={wrap}>
        <InspectorHeader icon={GlassWater} label="עמדת בר" />
        <InspectorDivider />
        <InspectorGroup>{shapeToggle(shape, (s) => onUpdateBar(b.id, { shape: s }))}</InspectorGroup>
        <InspectorDivider />
        <InspectorGroup>
          {shape === "circle" ? (
            <NumberField
              layout="inline"
              label="קוטר (ס״מ)"
              decimals={0}
              min={0}
              value={mmToCm(b.widthMm)}
              onChange={(cm) => onUpdateBar(b.id, { widthMm: cm * 10, depthMm: cm * 10 })}
              className="w-20"
            />
          ) : (
            <>
              <NumberField layout="inline" label="רוחב (ס״מ)" decimals={0} min={0} value={mmToCm(b.widthMm)} onChange={(cm) => onUpdateBar(b.id, { widthMm: cm * 10 })} className="w-20" />
              <NumberField layout="inline" label="עומק (ס״מ)" decimals={0} min={0} value={mmToCm(b.depthMm)} onChange={(cm) => onUpdateBar(b.id, { depthMm: cm * 10 })} className="w-20" />
            </>
          )}
          <NumberField layout="inline" label="גובה (ס״מ)" decimals={0} min={0} value={mmToCm(b.heightMm)} onChange={(cm) => onUpdateBar(b.id, { heightMm: cm * 10 })} className="w-20" />
        </InspectorGroup>
        <InspectorDivider />
        <InspectorGroup>{rotationField(b.rotationDeg ?? 0, (deg) => onUpdateBar(b.id, { rotationDeg: deg }))}</InspectorGroup>
        <InspectorDivider />
        <InspectorGroup>
          <StyleFields style={b.style} onChange={(style) => onUpdateBar(b.id, { style })} strokeWidthDefault={1.5} />
        </InspectorGroup>
        <InspectorDivider />
        <Button variant="danger" size="sm" onClick={() => onRemoveBar(b.id)}>
          <Trash2 className="h-4 w-4" strokeWidth={2} />
          מחיקה
        </Button>
        {closeBtn}
      </div>
    );
  }

  if (selectedOne.kind === "wall") {
    const idx = Number(selectedOne.id);
    if (idx < 0 || idx >= outline.length) return null;
    const n = outline.length;
    const a = outline[idx];
    const b = outline[(idx + 1) % n];
    const curve = edgeCurves[idx] ?? null;
    const maxBulgeCm = Math.round(maxBulgeDepthMm(wallLengthMm(a, b)) / 10);
    const locked = !!lockedEdges[idx];
    return (
      <div className={wrap}>
        <InspectorHeader icon={SeparatorHorizontal} label={`${edgeNoun} ${idx + 1}`} />
        <InspectorDivider />
        <InspectorGroup>
          <IconButton
            label={locked ? "שחרור נעילת האורך" : "נעילת האורך"}
            onClick={() => onToggleWallLock(idx)}
            className={locked ? "text-accent" : undefined}
          >
            {locked ? <Lock className="h-4 w-4" strokeWidth={2} /> : <Unlock className="h-4 w-4" strokeWidth={2} />}
          </IconButton>
          <NumberField
            layout="inline"
            label="אורך (מ׳)"
            decimals={2}
            min={0.001}
            disabled={locked}
            value={wallLengthMm(a, b) / 1000}
            onChange={(m) => onSetWallLength(idx, m)}
            className="w-20"
          />
        </InspectorGroup>
        <InspectorDivider />
        <InspectorGroup>
          <NumberField
            layout="inline"
            label="זווית (°)"
            decimals={1}
            value={wallAngleDeg(a, b)}
            onChange={(deg) => onSetWallAngle(idx, deg)}
            className="w-20"
          />
        </InspectorGroup>
        <InspectorDivider />
        <InspectorGroup>
          <NumberField
            layout="inline"
            label={`עיקום (ס״מ, עד ${maxBulgeCm})`}
            decimals={0}
            min={0}
            max={maxBulgeCm}
            value={mmToCm(bulgeDepthMm(a, b, curve))}
            onChange={(cm) => onSetWallBulgeDepth(idx, cm * 10)}
            className="w-20"
          />
        </InspectorGroup>
        <InspectorDivider />
        <Button variant="ghost" size="sm" onClick={() => onInsertVertexOnWall(idx)}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          הוספת נקודה
        </Button>
        {closeBtn}
      </div>
    );
  }

  const idx = Number(selectedOne.id);
  const v = outline[idx];
  if (!v) return null;
  return (
    <div className={wrap}>
      <InspectorHeader icon={CircleDot} label={`נקודה ${idx + 1}`} />
      <InspectorDivider />
      <Button variant="danger" size="sm" disabled={outline.length <= 3} onClick={() => onRemoveVertex(idx)}>
        <Trash2 className="h-4 w-4" strokeWidth={2} />
        מחיקה
      </Button>
      {closeBtn}
    </div>
  );
}
