"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize, Minus, Plus, Ruler, Trash2, X, type LucideIcon } from "lucide-react";
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
} from "@/lib/studio/geometry";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { controlClassName } from "@/components/control";

export type StructureDragType = "entrance" | "stage" | "bar";

export type SelectedKind = "vertex" | "wall" | "entrance" | "stage" | "bar";
export interface SelectedRef {
  kind: SelectedKind;
  id: string;
}

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
const SNAP_PX = 16;
const MIN_MM_PER_PX = 0.5; // most zoomed-in (1px ≈ 0.5mm)
const MAX_MM_PER_PX = 300; // most zoomed-out

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

// Pointer-drag in SVG user-space (mm), via getScreenCTM — robust to zoom/resize/RTL, unlike a
// manually-tracked px-per-mm factor, and unaffected by any nested rotate() transform since it
// always resolves through the root <svg>'s own CTM. Shared by every draggable thing on the canvas.
function dragHandlers(clientToMm: (clientX: number, clientY: number) => Point, onMove: (p: Point) => void, onSelect?: () => void) {
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      onSelect?.();
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.buttons !== 1) return;
      onMove(clientToMm(e.clientX, e.clientY));
    },
    onPointerUp: (e: React.PointerEvent) => {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    },
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
  onMoveVertex,
  onMoveWallHandle,
  onMoveEntrance,
  onMoveStage,
  onMoveBar,
  onUpdateStage,
  onUpdateBar,
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
  onMoveVertex: (idx: number, p: Point) => void;
  onMoveWallHandle: (edgeIdx: number, which: "bulge" | "c1" | "c2", p: Point) => void;
  onMoveEntrance?: (id: string, p: Point) => void;
  onMoveStage?: (p: Point) => void;
  onMoveBar?: (id: string, p: Point) => void;
  onUpdateStage?: (patch: Partial<Fixture>) => void;
  onUpdateBar?: (id: string, patch: Partial<Fixture>) => void;
  // Right-click builds its menu from these (e.g. the hall's add entrance/stage/bar). No items → no menu.
  contextMenuItems?: (point: Point) => ContextMenuItem[];
  padMm?: number; // frame padding + minimum extent + grid spacing — hall-scale by default, smaller for
  minExtentMm?: { w: number; h: number }; // product footprints (cm-scale) so a small shape isn't tiny
  gridMm?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursorMm, setCursorMm] = useState<Point | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [rect, setRect] = useState({ w: 0, h: 0 });
  const [center, setCenter] = useState<Point>({ x: DEFAULT_EXTENT.w / 2, y: DEFAULT_EXTENT.h / 2 });
  const [mmPerPx, setMmPerPx] = useState(20); // world mm per screen px — the zoom level
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [showDims, setShowDims] = useState(false);
  const didInit = useRef(false);
  const pan = useRef<{ x: number; y: number; moved: boolean } | null>(null);

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

  // Figma-style snapping: pull a dragged point onto a nearby reference (the hall's bbox edges/centre,
  // any vertex, any other fixture's centre) and remember the matched x/y so we can draw a guide line.
  const snapPoint = (p: Point, opts?: { fixtureId?: string; vertexIdx?: number }): Point => {
    const th = 6 * mmPerPx; // 6px snap radius, in world units
    const xs: number[] = [];
    const ys: number[] = [];
    if (outline.length >= 2) {
      const oxs = outline.map((v) => v.x);
      const oys = outline.map((v) => v.y);
      const minX = Math.min(...oxs), maxX = Math.max(...oxs), minY = Math.min(...oys), maxY = Math.max(...oys);
      xs.push(minX, (minX + maxX) / 2, maxX);
      ys.push(minY, (minY + maxY) / 2, maxY);
      outline.forEach((v, i) => { if (i !== opts?.vertexIdx) { xs.push(v.x); ys.push(v.y); } });
    }
    [stage, ...bars].forEach((f) => { if (f && f.id !== opts?.fixtureId) { xs.push(f.x); ys.push(f.y); } });
    let sx = p.x, gx: number | null = null, bx = th;
    for (const x of xs) { const d = Math.abs(p.x - x); if (d < bx) { bx = d; sx = x; gx = x; } }
    let sy = p.y, gy: number | null = null, by = th;
    for (const y of ys) { const d = Math.abs(p.y - y); if (d < by) { by = d; sy = y; gy = y; } }
    setGuides({ x: gx, y: gy });
    return { x: sx, y: sy };
  };

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (spaceHeld) return; // space is the pan modifier — never draw/select while it's down
    if (mode !== "draw") {
      onSelect(null);
      return;
    }
    if (outline.length >= 3) {
      const first = mmToClient(outline[0]);
      if (Math.hypot(e.clientX - first.x, e.clientY - first.y) < SNAP_PX) {
        onCloseOutline();
        return;
      }
    }
    onAddVertex(clientToMm(e.clientX, e.clientY));
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
    const typing = () => {
      const el = document.activeElement;
      return el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (typing()) return;
      if (e.code === "Space") { e.preventDefault(); setSpaceHeld(true); }
      else if (e.key === "+" || e.key === "=") zoomByCenter(1 / 1.2);
      else if (e.key === "-" || e.key === "_") zoomByCenter(1.2);
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpaceHeld(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
    <svg
      ref={svgRef}
      viewBox={`${vb.minX} ${vb.minY} ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMid meet"
      className={"h-full w-full touch-none " + (spaceHeld ? "cursor-grab" : mode === "draw" ? "cursor-crosshair" : "cursor-default")}
      role="img"
      aria-label="תרשים האולם — עריכה"
      onClick={handleCanvasClick}
      onPointerDown={(e) => {
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
        if (mode === "draw") setCursorMm(clientToMm(e.clientX, e.clientY));
      }}
      onPointerUp={(e) => {
        if (pan.current) (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        pan.current = null;
        setGuides({ x: null, y: null });
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
              <path key={si} d={wallSegmentD(a, b, curve, t0, t1)} fill="none" className="text-ink" stroke="currentColor" strokeWidth={isSelected ? 3 : 2} vectorEffect="non-scaling-stroke" />
            ))}
            {mode === "edit" && (
              <path
                d={edgePathD(a, b, edgeCurves[i] ?? null)}
                fill="none"
                stroke="transparent"
                strokeWidth={mm(16)}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect({ kind: "wall", id: String(i) });
                }}
              />
            )}
          </g>
        );
      })}

      {/* Rubber-band preview of the next wall while drawing */}
      {mode === "draw" && outline.length > 0 && cursorMm && (
        <line
          x1={outline[outline.length - 1].x}
          y1={outline[outline.length - 1].y}
          x2={cursorMm.x}
          y2={cursorMm.y}
          className="text-muted"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray={6}
          vectorEffect="non-scaling-stroke"
        />
      )}

      {columns.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={c.rMm} className="text-muted" fill="currentColor" fillOpacity={0.35} />
      ))}

      {/* Wall bulge handles, and the selected wall's bezier control points */}
      {mode === "edit" &&
        outline.map((a, i) => {
          const b = outline[(i + 1) % outline.length];
          const curve = edgeCurves[i] ?? null;
          const mid = edgeMidpoint(a, b, curve);
          const isSelectedWall = selected?.kind === "wall" && selected.id === String(i);
          const bulgeDrag = dragHandlers(clientToMm, (p) => onMoveWallHandle(i, "bulge", p), () => onSelect({ kind: "wall", id: String(i) }));
          return (
            <g key={i}>
              <g {...bulgeDrag} tabIndex={0} role="button" aria-label="עיקום הקיר — גרירה" className="cursor-move touch-none focus:outline-none">
                <rect
                  x={mid.x - mm(5)}
                  y={mid.y - mm(5)}
                  width={mm(10)}
                  height={mm(10)}
                  transform={`rotate(45 ${mid.x} ${mid.y})`}
                  className={isSelectedWall ? "text-accent" : "text-ink-soft/60"}
                  fill="currentColor"
                />
              </g>
              {isSelectedWall && curve && (
                <BezierHandles a={a} b={b} curve={curve} mm={mm} clientToMm={clientToMm} onMoveHandle={(which, p) => onMoveWallHandle(i, which, p)} />
              )}
            </g>
          );
        })}

      {/* Vertices */}
      {outline.map((v, i) => {
        const closable = mode === "draw" && i === 0 && outline.length >= 3;
        const interactive = mode === "edit";
        const selectedVertex = selected?.kind === "vertex" && selected.id === String(i);
        const drag = dragHandlers(clientToMm, (p) => onMoveVertex(i, snapPoint(p, { vertexIdx: i })), () => onSelect({ kind: "vertex", id: String(i) }));
        return (
          <g
            key={i}
            {...(interactive ? drag : {})}
            tabIndex={interactive ? 0 : undefined}
            role={interactive ? "button" : undefined}
            aria-label={interactive ? `נקודה ${i + 1} — גרירה לשינוי צורה` : undefined}
            onKeyDown={interactive ? (e) => nudge(e, v.x, v.y, (p) => onMoveVertex(i, p)) : undefined}
            className={interactive ? "cursor-move touch-none focus:outline-none" : undefined}
          >
            <circle
              cx={v.x}
              cy={v.y}
              r={mm(closable ? 8 : selectedVertex ? 7 : 5)}
              className={selectedVertex || closable ? "text-accent" : "text-ink-soft"}
              fill="currentColor"
            />
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
          onMove={(p) => onMoveStage?.(snapPoint(p, { fixtureId: stage.id }))}
          onUpdate={(patch) => onUpdateStage?.(patch)}
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
          onMove={(p) => onMoveBar?.(b.id, snapPoint(p, { fixtureId: b.id }))}
          onUpdate={(patch) => onUpdateBar?.(b.id, patch)}
          clientToMm={clientToMm}
          mm={mm}
        />
      ))}

      {/* Smart-alignment guides — the accent lines that appear while a drag snaps to an edge/centre */}
      {guides.x !== null && (
        <line x1={guides.x} y1={vb.minY} x2={guides.x} y2={vb.minY + vb.h} className="text-accent" stroke="currentColor" strokeWidth={1} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
      )}
      {guides.y !== null && (
        <line x1={vb.minX} y1={guides.y} x2={vb.minX + vb.w} y2={guides.y} className="text-accent" stroke="currentColor" strokeWidth={1} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
      )}

      {/* Measure overlay — each wall's length in metres at its midpoint */}
      {showDims && mode === "edit" &&
        outline.map((a, i) => {
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
    <div className="absolute bottom-4 start-4 flex items-center gap-0.5 rounded-md border border-border bg-surface p-1 shadow-floating">
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
      <IconButton label={showDims ? "הסתרת מידות" : "הצגת מידות"} onClick={() => setShowDims((v) => !v)} className={showDims ? "text-accent" : undefined}>
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
}: {
  a: Point;
  b: Point;
  curve: EdgeCurve;
  mm: (px: number) => number;
  clientToMm: (clientX: number, clientY: number) => Point;
  onMoveHandle: (which: "c1" | "c2", p: Point) => void;
}) {
  const { c1, c2 } = absoluteControlPoints(a, b, curve);
  const drag1 = dragHandlers(clientToMm, (p) => onMoveHandle("c1", p));
  const drag2 = dragHandlers(clientToMm, (p) => onMoveHandle("c2", p));
  const r = mm(4);
  return (
    <>
      <line x1={a.x} y1={a.y} x2={c1.x} y2={c1.y} className="text-accent/40" stroke="currentColor" strokeWidth={1} strokeDasharray={4} vectorEffect="non-scaling-stroke" />
      <line x1={b.x} y1={b.y} x2={c2.x} y2={c2.y} className="text-accent/40" stroke="currentColor" strokeWidth={1} strokeDasharray={4} vectorEffect="non-scaling-stroke" />
      <g {...drag1} tabIndex={0} role="button" aria-label="נקודת בקרה 1 — גרירה לעיצוב הקיר" className="cursor-move touch-none focus:outline-none">
        <circle cx={c1.x} cy={c1.y} r={r} className="text-accent" fill="currentColor" />
      </g>
      <g {...drag2} tabIndex={0} role="button" aria-label="נקודת בקרה 2 — גרירה לעיצוב הקיר" className="cursor-move touch-none focus:outline-none">
        <circle cx={c2.x} cy={c2.y} r={r} className="text-accent" fill="currentColor" />
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
  clientToMm,
  mm,
}: {
  entrance: Entrance;
  a: Point;
  b: Point;
  selected: boolean;
  onSelect: () => void;
  onMove: (p: Point) => void;
  clientToMm: (clientX: number, clientY: number) => Point;
  mm: (px: number) => number;
}) {
  const half = entrance.widthMm / 2;
  const gapStart = pointAtDistance(a, b, entrance.distanceMm - half);
  const gapEnd = pointAtDistance(a, b, entrance.distanceMm + half);
  const drag = dragHandlers(clientToMm, onMove, onSelect);

  const nudgeAlongWall = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 200 : 50;
    let delta = 0;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -step;
    else return;
    e.preventDefault();
    const len = wallLengthMm(a, b) || 1;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const center = pointAtDistance(a, b, entrance.distanceMm);
    onMove({ x: center.x + ux * delta, y: center.y + uy * delta });
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
      className="cursor-move touch-none focus:outline-none"
    >
      <line x1={gapStart.x} y1={gapStart.y} x2={gapEnd.x} y2={gapEnd.y} stroke="transparent" strokeWidth={mm(14)} />
      {selected && (
        <line x1={gapStart.x} y1={gapStart.y} x2={gapEnd.x} y2={gapEnd.y} className="text-accent" stroke="currentColor" strokeWidth={3} vectorEffect="non-scaling-stroke" />
      )}
    </g>
  );
}

// Stage/bar: draggable to move, plus (when selected) a rotate handle above and one or two resize
// handles on its edges. Handles sit inside the same rotated group so they turn with the shape for
// free; their drag math always works in world mm (via clientToMm) and converts through
// toLocalFrame using the fixture's own rotation, so resizing along "its" width/depth is correct
// at any angle.
function FixtureMarker({
  fixture,
  selected,
  onSelect,
  onMove,
  onUpdate,
  clientToMm,
  mm,
}: {
  fixture: Fixture;
  selected: boolean;
  onSelect: () => void;
  onMove: (p: Point) => void;
  onUpdate: (patch: Partial<Fixture>) => void;
  clientToMm: (clientX: number, clientY: number) => Point;
  mm: (px: number) => number;
}) {
  const drag = dragHandlers(clientToMm, onMove, onSelect);
  const shape = fixture.shape ?? "rect";
  const rot = fixture.rotationDeg ?? 0;
  const center = { x: fixture.x, y: fixture.y };
  const halfW = fixture.widthMm / 2;
  const halfD = fixture.depthMm / 2;
  const colorClass = selected ? "text-accent" : "text-ink-soft";
  const shared = {
    className: colorClass,
    fill: "currentColor",
    fillOpacity: selected ? 0.22 : 0.1,
    stroke: "currentColor",
    strokeWidth: 1.5,
    vectorEffect: "non-scaling-stroke" as const,
  };

  const rotateDrag = dragHandlers(clientToMm, (p) => {
    const deg = (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI + 90;
    onUpdate({ rotationDeg: ((deg % 360) + 360) % 360 });
  });
  const resizeWidthDrag = dragHandlers(clientToMm, (p) => {
    const local = toLocalFrame(p, center, rot);
    onUpdate({ widthMm: Math.max(200, Math.abs(local.x) * 2) });
  });
  const resizeDepthDrag = dragHandlers(clientToMm, (p) => {
    const local = toLocalFrame(p, center, rot);
    onUpdate({ depthMm: Math.max(200, Math.abs(local.y) * 2) });
  });
  const resizeRadiusDrag = dragHandlers(clientToMm, (p) => {
    const local = toLocalFrame(p, center, rot);
    const d = Math.max(200, Math.hypot(local.x, local.y) * 2);
    onUpdate({ widthMm: d, depthMm: d });
  });

  const handleGap = mm(20);
  const handleSize = mm(10);

  return (
    <g transform={`rotate(${rot} ${fixture.x} ${fixture.y})`}>
      <g
        {...drag}
        tabIndex={0}
        role="button"
        aria-label={`${fixture.label} — גרירה למיקום`}
        aria-pressed={selected}
        onKeyDown={(e) => nudge(e, fixture.x, fixture.y, onMove)}
        className="cursor-move touch-none focus:outline-none"
      >
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
            y1={fixture.y - halfD}
            x2={fixture.x}
            y2={fixture.y - halfD - handleGap}
            className="text-accent/50"
            stroke="currentColor"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <g {...rotateDrag} tabIndex={0} role="button" aria-label="סיבוב — גרירה" className="cursor-alias touch-none focus:outline-none">
            <circle cx={fixture.x} cy={fixture.y - halfD - handleGap} r={mm(6)} className="text-accent" fill="currentColor" />
          </g>

          {shape === "circle" ? (
            <g {...resizeRadiusDrag} tabIndex={0} role="button" aria-label="שינוי קוטר — גרירה" className="cursor-nesw-resize touch-none focus:outline-none">
              <rect x={fixture.x + halfW - handleSize / 2} y={fixture.y - handleSize / 2} width={handleSize} height={handleSize} className="text-accent" fill="currentColor" />
            </g>
          ) : (
            <>
              <g {...resizeWidthDrag} tabIndex={0} role="button" aria-label="שינוי רוחב — גרירה" className="cursor-ew-resize touch-none focus:outline-none">
                <rect x={fixture.x + halfW - handleSize / 2} y={fixture.y - handleSize / 2} width={handleSize} height={handleSize} className="text-accent" fill="currentColor" />
              </g>
              <g {...resizeDepthDrag} tabIndex={0} role="button" aria-label="שינוי עומק — גרירה" className="cursor-ns-resize touch-none focus:outline-none">
                <rect x={fixture.x - handleSize / 2} y={fixture.y + halfD - handleSize / 2} width={handleSize} height={handleSize} className="text-accent" fill="currentColor" />
              </g>
            </>
          )}
        </>
      )}
    </g>
  );
}

const smallInput = `${controlClassName} nums px-2 w-24`;

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
  const mmToCm = (mm: number) => String(Math.round(mm / 10));
  const cmToMm = (v: string) => Math.round((Number(v) || 0) * 10);
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
    <label className="flex items-center gap-1.5 text-xs text-ink-soft">
      זווית (°)
      <input
        type="number"
        inputMode="decimal"
        value={Math.round(rotationDeg)}
        onChange={(ev) => onChange(((Number(ev.target.value) || 0) % 360 + 360) % 360)}
        className={smallInput}
      />
    </label>
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
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          מרחק מקצה הקיר (מ׳)
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={(wallLen / 1000).toFixed(2)}
            value={(e.distanceMm / 1000).toFixed(2)}
            onChange={(ev) => onUpdateEntrance(e.id, { distanceMm: Math.max(0, Math.min(wallLen, (Number(ev.target.value) || 0) * 1000)) })}
            className={smallInput}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          רוחב (ס״מ)
          <input type="number" inputMode="decimal" min={40} value={mmToCm(e.widthMm)} onChange={(ev) => onUpdateEntrance(e.id, { widthMm: Math.max(400, cmToMm(ev.target.value)) })} className={smallInput} />
        </label>
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
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          רוחב (ס״מ)
          <input type="number" inputMode="decimal" value={mmToCm(stage.widthMm)} onChange={(ev) => onUpdateStage({ widthMm: cmToMm(ev.target.value) })} className={smallInput} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          עומק (ס״מ)
          <input type="number" inputMode="decimal" value={mmToCm(stage.depthMm)} onChange={(ev) => onUpdateStage({ depthMm: cmToMm(ev.target.value) })} className={smallInput} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          גובה במה (ס״מ)
          <input type="number" inputMode="decimal" value={mmToCm(stage.heightMm)} onChange={(ev) => onUpdateStage({ heightMm: cmToMm(ev.target.value) })} className={smallInput} />
        </label>
        {rotationField(stage.rotationDeg ?? 0, (deg) => onUpdateStage({ rotationDeg: deg }))}
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
          <label className="flex items-center gap-1.5 text-xs text-ink-soft">
            קוטר (ס״מ)
            <input
              type="number"
              inputMode="decimal"
              value={mmToCm(b.widthMm)}
              onChange={(ev) => onUpdateBar(b.id, { widthMm: cmToMm(ev.target.value), depthMm: cmToMm(ev.target.value) })}
              className={smallInput}
            />
          </label>
        ) : (
          <>
            <label className="flex items-center gap-1.5 text-xs text-ink-soft">
              רוחב (ס״מ)
              <input type="number" inputMode="decimal" value={mmToCm(b.widthMm)} onChange={(ev) => onUpdateBar(b.id, { widthMm: cmToMm(ev.target.value) })} className={smallInput} />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-ink-soft">
              עומק (ס״מ)
              <input type="number" inputMode="decimal" value={mmToCm(b.depthMm)} onChange={(ev) => onUpdateBar(b.id, { depthMm: cmToMm(ev.target.value) })} className={smallInput} />
            </label>
          </>
        )}
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          גובה (ס״מ)
          <input type="number" inputMode="decimal" value={mmToCm(b.heightMm)} onChange={(ev) => onUpdateBar(b.id, { heightMm: cmToMm(ev.target.value) })} className={smallInput} />
        </label>
        {rotationField(b.rotationDeg ?? 0, (deg) => onUpdateBar(b.id, { rotationDeg: deg }))}
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
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          אורך (מ׳)
          <input
            type="number"
            inputMode="decimal"
            value={(wallLengthMm(a, b) / 1000).toFixed(2)}
            onChange={(ev) => onSetWallLength(idx, Number(ev.target.value) || 0)}
            className={smallInput}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          זווית (°)
          <input
            type="number"
            inputMode="decimal"
            value={wallAngleDeg(a, b).toFixed(1)}
            onChange={(ev) => onSetWallAngle(idx, Number(ev.target.value) || 0)}
            className={smallInput}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          עיקום (ס״מ, עד {maxBulgeCm})
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={maxBulgeCm}
            value={mmToCm(bulgeDepthMm(a, b, curve))}
            onChange={(ev) => onSetWallBulgeDepth(idx, cmToMm(ev.target.value))}
            className={smallInput}
          />
        </label>
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
