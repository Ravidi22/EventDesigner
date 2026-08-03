"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize, Minus, Plus, Redo2, Ruler, Trash2, Undo2, X, type LucideIcon } from "lucide-react";
import type { Point, EdgeCurve, Entrance, Fixture, FixtureShape, Column } from "@/lib/studio/hall";
import {
  edgePathD,
  edgeMidpoint,
  absoluteControlPoints,
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
import type { SelectedRef } from "@/lib/studio/use-outline-editor";

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
function computeViewBox(outline: Point[], stage: Fixture | undefined, bars: Fixture[], padMm: number, minExtent: { w: number; h: number }) {
  const points = [...outline, ...(stage ? [stage] : []), ...bars];
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
function dragHandlers(
  clientToMm: (clientX: number, clientY: number) => Point,
  onMove: (p: Point, mods: { alt: boolean }) => void,
  onSelect?: () => void,
  onDragChange?: (dragging: boolean) => void,
  onCommit?: () => void,
) {
  const end = (e: React.PointerEvent) => {
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (pressOrigin.get(e.pointerId)?.dragging) {
      onDragChange?.(false);
      onCommit?.();
    }
    pressOrigin.delete(e.pointerId);
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      pressOrigin.set(e.pointerId, { x: e.clientX, y: e.clientY, dragging: false });
      onSelect?.();
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
      onSelect?.();
    },
  };
}

// Direct-manipulation hall shape editor: click to draw walls one at a time (mode "draw"), then
// drag vertices/wall-midpoints/bezier handles once the shape is closed (mode "edit"). Stage/bar
// drop in from the StructureRail and can be dragged, rotated and resized in place; entrances drop
// onto the nearest wall and slide along it, rendered as a real door gap + swing symbol.
export function ShapeCanvas({
  mode,
  outline,
  edgeCurves,
  columns = [],
  entrances = [],
  stage,
  bars = [],
  selected,
  onSelect,
  onAddVertex,
  onCloseOutline,
  onCancelDraw,
  onMoveVertex,
  onMoveWallHandle,
  onMoveEntrance,
  onMoveStage,
  onMoveBar,
  onUpdateStage,
  onUpdateBar,
  onCommit,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  contextMenuItems,
  padMm = PAD_MM,
  minExtentMm = DEFAULT_EXTENT,
  gridMm = 1000,
}: {
  mode: "draw" | "edit";
  outline: Point[];
  edgeCurves: (EdgeCurve | null)[];
  columns?: Column[];
  entrances?: Entrance[];
  stage?: Fixture | undefined;
  bars?: Fixture[];
  selected: SelectedRef | null;
  onSelect: (ref: SelectedRef | null) => void;
  onAddVertex: (p: Point) => void;
  onCloseOutline: () => void;
  onCancelDraw?: () => void; // Escape while drawing — the host throws the in-progress outline away
  onMoveVertex: (idx: number, p: Point) => void;
  onMoveWallHandle: (edgeIdx: number, which: "bulge" | "c1" | "c2", p: Point) => void;
  onMoveEntrance?: (id: string, p: Point) => void;
  onMoveStage?: (p: Point) => void;
  onMoveBar?: (id: string, p: Point) => void;
  onUpdateStage?: (patch: Partial<Fixture>) => void;
  onUpdateBar?: (id: string, patch: Partial<Fixture>) => void;
  // End of a gesture — one drag, however many onMove calls it made. The host closes its history
  // entry here; discrete edits (a placed vertex, a deleted door) need no such marker.
  onCommit?: () => void;
  canUndo?: boolean; // the undo/redo pair only renders when the host offers a history
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  // Right-click builds its menu from these (e.g. the hall's add entrance/stage/bar). No items → no menu.
  contextMenuItems?: (point: Point) => ContextMenuItem[];
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
  const pan = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const panMoved = useRef(false); // outlives the pan itself, so the click that ends one can't also drop a vertex

  const showDims = dimsOverride ?? mode === "draw";

  // Where the view should sit when fitted: hug the shape, or hold a fixed frame while first drawing
  // (recomputing to hug a single point would fling it into the corner).
  const contentBox =
    mode === "draw" && outline.length < 3
      ? { minX: -padMm, minY: -padMm, w: minExtentMm.w, h: minExtentMm.h }
      : computeViewBox(outline, stage, bars, padMm, minExtentMm);

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
  const zoomByCenter = (factor: number) => setMmPerPx((m) => clampZoom(m * factor));
  const zoomAround = (clientX: number, clientY: number, factor: number) => {
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

  // Dragging: alignment pull only (see lib/studio/snap.ts), and remember the matched x/y so the
  // accent guide lines can be drawn.
  const snapDrag = (p: Point, opts?: { fixtureId?: string; vertexIdx?: number }): Point => {
    const r = snapPoint(p, {
      toleranceMm: SNAP_TOL_PX * mmPerPx,
      outline,
      fixtures: fixtureRefs(opts?.fixtureId),
      gridMm,
      excludeVertexIdx: opts?.vertexIdx,
    });
    setGuides(r.guides);
    return r.point;
  };

  // Drawing: the same references plus the 15°/ortho lock off the previous vertex. Kept pure and
  // re-derived every render (rather than stored) so pressing Alt updates the preview immediately.
  const drawAnchor = mode === "draw" && outline.length > 0 ? outline[outline.length - 1] : null;
  const snapDraw = (p: Point, releaseAngle: boolean): SnapResult =>
    snapPoint(p, {
      toleranceMm: SNAP_TOL_PX * mmPerPx,
      outline,
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
    if (mode !== "draw") {
      onSelect(null);
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
      // Alt is tracked in both modes — it releases the angle lock while drawing and the 15°
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

  const entryOpen = entry !== null;
  useEffect(() => {
    if (entryOpen) entryRef.current?.focus();
  }, [entryOpen]);

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
        "h-full w-full touch-none focus:outline-none " +
        (spaceHeld ? "cursor-grab" : hoverClose && closable ? "cursor-pointer" : mode === "draw" ? "cursor-crosshair" : "cursor-default")
      }
      role="img"
      aria-label="תרשים האולם — עריכה"
      onClick={handleCanvasClick}
      onPointerDown={(e) => {
        panMoved.current = false;
        if (spaceHeld || e.button === 1) {
          e.preventDefault();
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          pan.current = { x: e.clientX, y: e.clientY, moved: false };
        }
      }}
      onPointerMove={(e) => {
        if (pan.current) {
          const dx = e.clientX - pan.current.x;
          const dy = e.clientY - pan.current.y;
          pan.current = { x: e.clientX, y: e.clientY, moved: true };
          setCenter((c) => ({ x: c.x - dx * mmPerPx, y: c.y - dy * mmPerPx }));
          return;
        }
        if (e.altKey !== altHeld) setAltHeld(e.altKey); // the modifier can be pressed while the window was unfocused
        if (mode === "draw") setCursorRaw(clientToMm(e.clientX, e.clientY));
      }}
      onPointerUp={(e) => {
        if (pan.current) {
          (e.currentTarget as Element).releasePointerCapture(e.pointerId);
          panMoved.current = pan.current.moved;
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
    >
      <defs>
        <pattern id="shape-grid" width={gridMm} height={gridMm} patternUnits="userSpaceOnUse">
          <path d={`M ${gridMm} 0 L 0 0 0 ${gridMm}`} fill="none" className="text-border" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </pattern>
      </defs>
      <rect x={vb.minX} y={vb.minY} width={vb.w} height={vb.h} fill="url(#shape-grid)" />

      {/* Walls — solid stubs on either side of each door gap. The wall keeps its curve: the gap is
          cut along the bezier (via wallSegmentD), so a door on a bowed wall no longer flattens it.
          ponytail: the gap's t-range is the door's chord-distance / chord-length — the same chord
          approximation doors already use for placement, fine for a gentle bow. */}
      {outline.map((a, i) => {
        if (mode === "draw" && i === outline.length - 1) return null; // no closing edge until the shape is closed
        const b = outline[(i + 1) % outline.length];
        const curve = edgeCurves[i] ?? null;
        const isSelected = selected?.kind === "wall" && selected.id === String(i);
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
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect({ kind: "wall", id: String(i) });
                }}
              />
            )}
          </g>
        );
      })}

      {/* Rubber-band preview of the next wall — drawn to the *snapped* point, so the committed wall
          is exactly the one on screen. It goes accent while the angle is locked to a 15° multiple. */}
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
          const isSelectedWall = selected?.kind === "wall" && selected.id === String(i);
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
        const selectedVertex = selected?.kind === "vertex" && selected.id === String(i);
        const drag = dragHandlers(clientToMm, (p) => onMoveVertex(i, snapDrag(p, { vertexIdx: i })), () => onSelect({ kind: "vertex", id: String(i) }), undefined, onCommit);
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

      {/* Entrances — a plain opening: the gap is already the absence of wall above; this just adds
          the drag handle (slide along the wall) and the selection highlight. */}
      {entrances.map((en) => {
        const a = outline[en.wallIndex];
        const b = outline[(en.wallIndex + 1) % outline.length];
        if (!a || !b) return null;
        return (
          <EntranceDoor
            key={en.id}
            entrance={en}
            a={a}
            b={b}
            selected={selected?.kind === "entrance" && selected.id === en.id}
            onSelect={() => onSelect({ kind: "entrance", id: en.id })}
            onMove={(p) => onMoveEntrance?.(en.id, p)}
            onCommit={onCommit}
            clientToMm={clientToMm}
            mm={mm}
          />
        );
      })}
      {stage && (
        <FixtureMarker
          fixture={stage}
          selected={selected?.kind === "stage"}
          onSelect={() => onSelect({ kind: "stage", id: stage.id })}
          onMove={(p) => onMoveStage?.(snapDrag(p, { fixtureId: stage.id }))}
          onUpdate={(patch) => onUpdateStage?.(patch)}
          onCommit={onCommit}
          onRotating={setRotating}
          altHeld={altHeld}
          clientToMm={clientToMm}
          mm={mm}
        />
      )}
      {bars.map((b) => (
        <FixtureMarker
          key={b.id}
          fixture={b}
          selected={selected?.kind === "bar" && selected.id === b.id}
          onSelect={() => onSelect({ kind: "bar", id: b.id })}
          onMove={(p) => onMoveBar?.(b.id, snapDrag(p, { fixtureId: b.id }))}
          onUpdate={(patch) => onUpdateBar?.(b.id, patch)}
          onCommit={onCommit}
          onRotating={setRotating}
          altHeld={altHeld}
          clientToMm={clientToMm}
          mm={mm}
        />
      ))}

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
        to a 15° step, ink once Alt has released it. */}
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
      <IconButton label="התאמת התצוגה לאולם" onClick={() => fitTo(contentBox, rect.w, rect.h)}>
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
// draws the leaf + swing arc and gives the door a drag handle that slides it along its wall
// (world-space drag points get projected back onto the wall's chord by the caller).
function EntranceDoor({
  entrance,
  a,
  b,
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
  selected: boolean;
  onSelect: () => void;
  onMove: (p: Point) => void;
  onCommit?: () => void;
  clientToMm: (clientX: number, clientY: number) => Point;
  mm: (px: number) => number;
}) {
  const half = entrance.widthMm / 2;
  const gapStart = pointAtDistance(a, b, entrance.distanceMm - half);
  const gapEnd = pointAtDistance(a, b, entrance.distanceMm + half);
  const mid = pointAtDistance(a, b, entrance.distanceMm);
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
      {/* Hover previews the selection highlight at half weight, so the gap announces itself as a
          handle before it's picked up. */}
      <line
        x1={gapStart.x}
        y1={gapStart.y}
        x2={gapEnd.x}
        y2={gapEnd.y}
        className={selected ? "text-accent" : "text-accent opacity-0 group-hover:opacity-50"}
        stroke="currentColor"
        strokeWidth={selected ? 3 : 2}
        vectorEffect="non-scaling-stroke"
      />
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
  onSelect: () => void;
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

export function SelectionInspector({
  selected,
  outline,
  edgeCurves,
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
  onInsertVertexOnWall,
  onSetWallLength,
  onSetWallAngle,
  onSetWallBulgeDepth,
  onClose,
  edgeNoun = "קיר",
}: {
  selected: SelectedRef;
  outline: Point[];
  edgeCurves: (EdgeCurve | null)[];
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
  onInsertVertexOnWall: (edgeIdx: number) => void;
  onSetWallLength: (edgeIdx: number, meters: number) => void;
  onSetWallAngle: (edgeIdx: number, degrees: number) => void;
  onSetWallBulgeDepth: (edgeIdx: number, depthMm: number) => void;
  onClose: () => void;
}) {
  const wrap = "flex max-w-2xl flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 shadow-floating";
  const mmToCm = (mm: number) => mm / 10;
  const closeBtn = (
    <IconButton label="סגירת בחירה" className="ms-auto" onClick={onClose}>
      <X className="h-4 w-4" strokeWidth={2} />
    </IconButton>
  );
  const shapeToggle = (shape: FixtureShape, onPick: (s: FixtureShape) => void) => (
    <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
      {(Object.keys(SHAPE_LABEL) as FixtureShape[]).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className={`rounded px-2 py-1 text-xs transition-colors ${s === shape ? "bg-accent text-canvas" : "text-ink-soft hover:bg-bg"}`}
        >
          {SHAPE_LABEL[s]}
        </button>
      ))}
    </div>
  );
  const rotationField = (rotationDeg: number, onChange: (deg: number) => void) => (
    <NumberField layout="inline" label="זווית (°)" decimals={0} min={0} max={360} value={rotationDeg} onChange={onChange} className="w-24" />
  );

  if (selected.kind === "entrance") {
    const e = entrances.find((x) => x.id === selected.id);
    if (!e) return null;
    const a = outline[e.wallIndex];
    const b = outline[(e.wallIndex + 1) % outline.length];
    const wallLen = a && b ? wallLengthMm(a, b) : 0;
    return (
      <div className={wrap}>
        <span className="text-sm font-medium text-ink">כניסה</span>
        <NumberField
          layout="inline"
          label="מרחק מקצה הקיר (מ׳)"
          decimals={2}
          min={0}
          max={wallLen / 1000}
          value={e.distanceMm / 1000}
          onChange={(m) => onUpdateEntrance(e.id, { distanceMm: m * 1000 })}
          className="w-24"
        />
        <NumberField
          layout="inline"
          label="רוחב (ס״מ)"
          decimals={0}
          min={40}
          value={mmToCm(e.widthMm)}
          onChange={(cm) => onUpdateEntrance(e.id, { widthMm: cm * 10 })}
          className="w-24"
        />
        <Button variant="danger" onClick={() => onRemoveEntrance(e.id)}>
          <Trash2 className="h-4 w-4" strokeWidth={2} />
          מחיקה
        </Button>
        {closeBtn}
      </div>
    );
  }

  if (selected.kind === "stage") {
    if (!stage) return null;
    return (
      <div className={wrap}>
        <span className="text-sm font-medium text-ink">במה</span>
        <NumberField layout="inline" label="רוחב (ס״מ)" decimals={0} min={0} value={mmToCm(stage.widthMm)} onChange={(cm) => onUpdateStage({ widthMm: cm * 10 })} className="w-24" />
        <NumberField layout="inline" label="עומק (ס״מ)" decimals={0} min={0} value={mmToCm(stage.depthMm)} onChange={(cm) => onUpdateStage({ depthMm: cm * 10 })} className="w-24" />
        <NumberField layout="inline" label="גובה במה (ס״מ)" decimals={0} min={0} value={mmToCm(stage.heightMm)} onChange={(cm) => onUpdateStage({ heightMm: cm * 10 })} className="w-24" />
        {rotationField(stage.rotationDeg ?? 0, (deg) => onUpdateStage({ rotationDeg: deg }))}
        <StyleFields style={stage.style} onChange={(style) => onUpdateStage({ style })} strokeWidthDefault={1.5} />
        <Button variant="danger" onClick={onRemoveStage}>
          <Trash2 className="h-4 w-4" strokeWidth={2} />
          הסרה
        </Button>
        {closeBtn}
      </div>
    );
  }

  if (selected.kind === "bar") {
    const b = bars.find((x) => x.id === selected.id);
    if (!b) return null;
    const shape = b.shape ?? "rect";
    return (
      <div className={wrap}>
        <span className="text-sm font-medium text-ink">עמדת בר</span>
        {shapeToggle(shape, (s) => onUpdateBar(b.id, { shape: s }))}
        {shape === "circle" ? (
          <NumberField
            layout="inline"
            label="קוטר (ס״מ)"
            decimals={0}
            min={0}
            value={mmToCm(b.widthMm)}
            onChange={(cm) => onUpdateBar(b.id, { widthMm: cm * 10, depthMm: cm * 10 })}
            className="w-24"
          />
        ) : (
          <>
            <NumberField layout="inline" label="רוחב (ס״מ)" decimals={0} min={0} value={mmToCm(b.widthMm)} onChange={(cm) => onUpdateBar(b.id, { widthMm: cm * 10 })} className="w-24" />
            <NumberField layout="inline" label="עומק (ס״מ)" decimals={0} min={0} value={mmToCm(b.depthMm)} onChange={(cm) => onUpdateBar(b.id, { depthMm: cm * 10 })} className="w-24" />
          </>
        )}
        <NumberField layout="inline" label="גובה (ס״מ)" decimals={0} min={0} value={mmToCm(b.heightMm)} onChange={(cm) => onUpdateBar(b.id, { heightMm: cm * 10 })} className="w-24" />
        {rotationField(b.rotationDeg ?? 0, (deg) => onUpdateBar(b.id, { rotationDeg: deg }))}
        <StyleFields style={b.style} onChange={(style) => onUpdateBar(b.id, { style })} strokeWidthDefault={1.5} />
        <Button variant="danger" onClick={() => onRemoveBar(b.id)}>
          <Trash2 className="h-4 w-4" strokeWidth={2} />
          מחיקה
        </Button>
        {closeBtn}
      </div>
    );
  }

  if (selected.kind === "wall") {
    const idx = Number(selected.id);
    if (idx < 0 || idx >= outline.length) return null;
    const n = outline.length;
    const a = outline[idx];
    const b = outline[(idx + 1) % n];
    const curve = edgeCurves[idx] ?? null;
    const maxBulgeCm = Math.round(maxBulgeDepthMm(wallLengthMm(a, b)) / 10);
    return (
      <div className={wrap}>
        <span className="text-sm font-medium text-ink">{edgeNoun} {idx + 1}</span>
        <NumberField
          layout="inline"
          label="אורך (מ׳)"
          decimals={2}
          min={0.001}
          value={wallLengthMm(a, b) / 1000}
          onChange={(m) => onSetWallLength(idx, m)}
          className="w-24"
        />
        <NumberField
          layout="inline"
          label="זווית (°)"
          decimals={1}
          value={wallAngleDeg(a, b)}
          onChange={(deg) => onSetWallAngle(idx, deg)}
          className="w-24"
        />
        <NumberField
          layout="inline"
          label={`עיקום (ס״מ, עד ${maxBulgeCm})`}
          decimals={0}
          min={0}
          max={maxBulgeCm}
          value={mmToCm(bulgeDepthMm(a, b, curve))}
          onChange={(cm) => onSetWallBulgeDepth(idx, cm * 10)}
          className="w-24"
        />
        <Button variant="ghost" onClick={() => onInsertVertexOnWall(idx)}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          הוספת נקודה
        </Button>
        {closeBtn}
      </div>
    );
  }

  const idx = Number(selected.id);
  const v = outline[idx];
  if (!v) return null;
  return (
    <div className={wrap}>
      <span className="text-sm font-medium text-ink">נקודה {idx + 1}</span>
      <Button variant="danger" disabled={outline.length <= 3} onClick={() => onRemoveVertex(idx)}>
        <Trash2 className="h-4 w-4" strokeWidth={2} />
        מחיקה
      </Button>
      {closeBtn}
    </div>
  );
}
