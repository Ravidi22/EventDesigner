"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
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
  doorGeometry,
  toLocalFrame,
} from "@/lib/studio/geometry";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { controlClassName } from "@/components/control";
import type { StructureDragType } from "./structure-rail";

export type SelectedKind = "vertex" | "wall" | "entrance" | "stage" | "bar";
export interface SelectedRef {
  kind: SelectedKind;
  id: string;
}

const PAD_MM = 1500;
const DEFAULT_EXTENT = { w: 22000, h: 15000 };
const SNAP_PX = 16;

function outlineCentroid(outline: Point[]): Point {
  if (outline.length === 0) return { x: 0, y: 0 };
  return {
    x: outline.reduce((s, p) => s + p.x, 0) / outline.length,
    y: outline.reduce((s, p) => s + p.y, 0) / outline.length,
  };
}

// A door's open leaf can swing further out than the wall it's cut into (especially "outward" on
// an outer wall) — include its extent or the swing arc gets clipped by the viewBox padding.
function computeViewBox(outline: Point[], entrances: Entrance[], stage: Fixture | undefined, bars: Fixture[]) {
  const interiorHint = outlineCentroid(outline);
  const doorPoints = entrances.flatMap((e) => {
    const a = outline[e.wallIndex];
    const b = outline[(e.wallIndex + 1) % outline.length];
    if (!a || !b) return [];
    return doorGeometry(a, b, e.distanceMm, e.widthMm, e.swingInward, interiorHint, e.doubleDoor).leaves.map((l) => l.tip);
  });
  const points = [...outline, ...doorPoints, ...(stage ? [stage] : []), ...bars];
  if (points.length === 0) return { minX: -PAD_MM, minY: -PAD_MM, w: DEFAULT_EXTENT.w, h: DEFAULT_EXTENT.h };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(DEFAULT_EXTENT.w, Math.max(...xs) - minX + PAD_MM * 2);
  const h = Math.max(DEFAULT_EXTENT.h, Math.max(...ys) - minY + PAD_MM * 2);
  return { minX: minX - PAD_MM, minY: minY - PAD_MM, w, h };
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
export function WallCanvas({
  mode,
  outline,
  edgeCurves,
  columns,
  entrances,
  stage,
  bars,
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
  onDropStructure,
}: {
  mode: "draw" | "edit";
  outline: Point[];
  edgeCurves: (EdgeCurve | null)[];
  columns: Column[];
  entrances: Entrance[];
  stage: Fixture | undefined;
  bars: Fixture[];
  selected: SelectedRef | null;
  onSelect: (ref: SelectedRef | null) => void;
  onAddVertex: (p: Point) => void;
  onCloseOutline: () => void;
  onMoveVertex: (idx: number, p: Point) => void;
  onMoveWallHandle: (edgeIdx: number, which: "bulge" | "c1" | "c2", p: Point) => void;
  onMoveEntrance: (id: string, p: Point) => void;
  onMoveStage: (p: Point) => void;
  onMoveBar: (id: string, p: Point) => void;
  onUpdateStage: (patch: Partial<Fixture>) => void;
  onUpdateBar: (id: string, patch: Partial<Fixture>) => void;
  onDropStructure: (type: StructureDragType, p: Point) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursorMm, setCursorMm] = useState<Point | null>(null);
  const [k, setK] = useState(0.05); // px per mm at current render size

  const vb = computeViewBox(outline, entrances, stage, bars);
  const interiorHint = outlineCentroid(outline);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const update = () => {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setK(Math.min(rect.width / vb.w, rect.height / vb.h));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [vb.w, vb.h]);

  const mm = (px: number) => px / k; // screen px → mm, for marker sizing that must stay a fixed screen size

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

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
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

  return (
    <svg
      ref={svgRef}
      viewBox={`${vb.minX} ${vb.minY} ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMid meet"
      className={"h-full w-full " + (mode === "draw" ? "cursor-crosshair" : "cursor-default")}
      role="img"
      aria-label="תרשים האולם — עריכה"
      onClick={handleCanvasClick}
      onPointerMove={(e) => mode === "draw" && setCursorMm(clientToMm(e.clientX, e.clientY))}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const type = e.dataTransfer.getData("text/structure") as StructureDragType | "";
        if (type) onDropStructure(type, clientToMm(e.clientX, e.clientY));
      }}
    >
      <defs>
        <pattern id="hall-grid" width={1000} height={1000} patternUnits="userSpaceOnUse">
          <path d="M 1000 0 L 0 0 0 1000" fill="none" className="text-border" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </pattern>
      </defs>
      <rect x={vb.minX} y={vb.minY} width={vb.w} height={vb.h} fill="url(#hall-grid)" />

      {/* Walls — cut into stub segments around any door(s) on that wall. A wall carrying a door
          renders straight (doors don't currently support a curved host wall). */}
      {outline.map((a, i) => {
        if (mode === "draw" && i === outline.length - 1) return null; // no closing edge until the shape is closed
        const b = outline[(i + 1) % outline.length];
        const doorsOnWall = entrances.filter((e) => e.wallIndex === i).sort((x, y) => x.distanceMm - y.distanceMm);
        const curve = doorsOnWall.length > 0 ? null : (edgeCurves[i] ?? null);
        const isSelected = selected?.kind === "wall" && selected.id === String(i);
        const segments: [Point, Point][] = [];
        let cursor = a;
        for (const door of doorsOnWall) {
          const half = door.widthMm / 2;
          segments.push([cursor, pointAtDistance(a, b, door.distanceMm - half)]);
          cursor = pointAtDistance(a, b, door.distanceMm + half);
        }
        segments.push([cursor, b]);
        return (
          <g key={i}>
            {segments.map(([sa, sb], si) => (
              <path key={si} d={edgePathD(sa, sb, curve)} fill="none" className="text-ink" stroke="currentColor" strokeWidth={isSelected ? 3 : 2} vectorEffect="non-scaling-stroke" />
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
        const drag = dragHandlers(clientToMm, (p) => onMoveVertex(i, p), () => onSelect({ kind: "vertex", id: String(i) }));
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

      {/* Entrances — a real door: a gap cut in the wall above, a leaf, and a swing arc */}
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
            interiorHint={interiorHint}
            selected={selected?.kind === "entrance" && selected.id === en.id}
            onSelect={() => onSelect({ kind: "entrance", id: en.id })}
            onMove={(p) => onMoveEntrance(en.id, p)}
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
          onMove={onMoveStage}
          onUpdate={onUpdateStage}
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
          onMove={(p) => onMoveBar(b.id, p)}
          onUpdate={(patch) => onUpdateBar(b.id, patch)}
          clientToMm={clientToMm}
          mm={mm}
        />
      ))}
    </svg>
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
  interiorHint,
  selected,
  onSelect,
  onMove,
  clientToMm,
  mm,
}: {
  entrance: Entrance;
  a: Point;
  b: Point;
  interiorHint: Point;
  selected: boolean;
  onSelect: () => void;
  onMove: (p: Point) => void;
  clientToMm: (clientX: number, clientY: number) => Point;
  mm: (px: number) => number;
}) {
  const door = doorGeometry(a, b, entrance.distanceMm, entrance.widthMm, entrance.swingInward, interiorHint, entrance.doubleDoor);
  const drag = dragHandlers(clientToMm, onMove, onSelect);
  const cls = selected ? "text-accent" : "text-ink-soft";

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

  return (
    <g>
      {door.leaves.map((leaf, i) => (
        <g key={i}>
          <line x1={leaf.hinge.x} y1={leaf.hinge.y} x2={leaf.tip.x} y2={leaf.tip.y} className={cls} stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path
            d={`M ${leaf.tip.x} ${leaf.tip.y} A ${leaf.lenMm} ${leaf.lenMm} 0 0 ${leaf.sweepFlag} ${leaf.arcTo.x} ${leaf.arcTo.y}`}
            fill="none"
            className={cls}
            stroke="currentColor"
            strokeWidth={1.25}
            strokeDasharray={3}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
      <g
        {...drag}
        tabIndex={0}
        role="button"
        aria-label="כניסה — גרירה לאורך הקיר"
        aria-pressed={selected}
        onKeyDown={nudgeAlongWall}
        className="cursor-move touch-none focus:outline-none"
      >
        <line x1={door.gapStart.x} y1={door.gapStart.y} x2={door.gapEnd.x} y2={door.gapEnd.y} stroke="transparent" strokeWidth={mm(14)} />
        {selected && (
          <line x1={door.gapStart.x} y1={door.gapStart.y} x2={door.gapEnd.x} y2={door.gapEnd.y} className="text-accent" stroke="currentColor" strokeWidth={3} vectorEffect="non-scaling-stroke" />
        )}
      </g>
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
  entrances,
  stage,
  bars,
  onUpdateEntrance,
  onUpdateStage,
  onUpdateBar,
  onRemoveEntrance,
  onRemoveStage,
  onRemoveBar,
  onRemoveVertex,
  onInsertVertexOnWall,
  onSetWallLength,
  onSetWallAngle,
  onSetWallBulgeDepth,
  onClose,
}: {
  selected: SelectedRef;
  outline: Point[];
  edgeCurves: (EdgeCurve | null)[];
  entrances: Entrance[];
  stage: Fixture | undefined;
  bars: Fixture[];
  onUpdateEntrance: (id: string, patch: Partial<Entrance>) => void;
  onUpdateStage: (patch: Partial<Fixture>) => void;
  onUpdateBar: (id: string, patch: Partial<Fixture>) => void;
  onRemoveEntrance: (id: string) => void;
  onRemoveStage: () => void;
  onRemoveBar: (id: string) => void;
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
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {([true, false] as const).map((inward) => (
            <button
              key={String(inward)}
              type="button"
              onClick={() => onUpdateEntrance(e.id, { swingInward: inward })}
              className={`rounded px-2 py-1 text-xs transition-colors ${e.swingInward === inward ? "bg-accent text-canvas" : "text-ink-soft hover:bg-bg"}`}
            >
              {inward ? "פתיחה פנימה" : "פתיחה החוצה"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {([true, false] as const).map((double) => (
            <button
              key={String(double)}
              type="button"
              onClick={() => onUpdateEntrance(e.id, { doubleDoor: double })}
              className={`rounded px-2 py-1 text-xs transition-colors ${e.doubleDoor === double ? "bg-accent text-canvas" : "text-ink-soft hover:bg-bg"}`}
            >
              {double ? "דלת כפולה" : "דלת יחידה"}
            </button>
          ))}
        </div>
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
        <span className="text-sm font-medium text-ink">קיר {idx + 1}</span>
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
