"use client";

import { useRef } from "react";
import type { Point } from "@/lib/design-document/types";
import { outlineBounds } from "@/lib/studio/footprint";

const WORK_MM = 3000; // default working extent when nothing is drawn yet

// Modeless polygon editor: click empty canvas to append a vertex, drag a vertex to move it,
// double-click a vertex to delete it (keeping at least a triangle). The footprint renders as
// a closed polygon whenever there are ≥3 points, so any vertex count is reachable by clicking
// — no draw/edit modes and no explicit "close" gesture. Pointer math borrows the getScreenCTM
// approach from halls/wall-canvas.tsx (robust to zoom/RTL) but shares no component with it.
export function PolygonEditor({ outline, onChange }: { outline: Point[]; onChange: (o: Point[]) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const closed = outline.length >= 3;

  const b = closed ? outlineBounds(outline) : { cx: WORK_MM / 2, cy: WORK_MM / 2, w: WORK_MM, h: WORK_MM };
  const pad = Math.max(b.w, b.h) * 0.15 + 150;
  const vb = `${b.cx - b.w / 2 - pad} ${b.cy - b.h / 2 - pad} ${b.w + pad * 2} ${b.h + pad * 2}`;

  const clientToMm = (clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const loc = pt.matrixTransform(ctm.inverse());
    return { x: Math.round(loc.x), y: Math.round(loc.y) };
  };

  // Empty-canvas click appends a vertex. Vertex handlers stopPropagation so their own
  // clicks/drags never also add a point.
  const onCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => onChange([...outline, clientToMm(e.clientX, e.clientY)]);

  const moveVertex = (i: number, p: Point) => onChange(outline.map((v, j) => (j === i ? p : v)));
  const removeVertex = (i: number) => { if (outline.length > 3) onChange(outline.filter((_, j) => j !== i)); };

  const vertexHandlers = (i: number) => ({
    onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); (e.currentTarget as Element).setPointerCapture(e.pointerId); },
    onPointerMove: (e: React.PointerEvent) => { if (e.buttons === 1) moveVertex(i, clientToMm(e.clientX, e.clientY)); },
    onPointerUp: (e: React.PointerEvent) => (e.currentTarget as Element).releasePointerCapture(e.pointerId),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onDoubleClick: (e: React.MouseEvent) => { e.stopPropagation(); removeVertex(i); },
  });

  const r = Math.max(b.w, b.h) * 0.02 + 30;
  return (
    <svg
      ref={svgRef}
      viewBox={vb}
      className="h-full w-full cursor-crosshair text-ink-soft"
      role="img"
      aria-label="עורך צורת הפריט — לחיצה להוספת נקודה, גרירה להזזה, לחיצה כפולה למחיקה"
      onClick={onCanvasClick}
    >
      {closed ? (
        <polygon points={outline.map((p) => `${p.x},${p.y}`).join(" ")} fill="currentColor" fillOpacity={0.1} stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      ) : outline.length > 1 ? (
        <polyline points={outline.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      ) : null}
      {outline.length === 0 && (
        <text x={b.cx} y={b.cy} textAnchor="middle" dominantBaseline="central" className="text-muted" fill="currentColor" style={{ pointerEvents: "none", fontSize: 180 }}>
          לחצו לשרטוט הצורה
        </text>
      )}
      {outline.map((v, i) => (
        <circle
          key={i}
          {...vertexHandlers(i)}
          cx={v.x}
          cy={v.y}
          r={r}
          className="text-ink-soft"
          fill="currentColor"
          style={{ cursor: "move", touchAction: "none" }}
        />
      ))}
    </svg>
  );
}
