"use client";

import { useRef, useState } from "react";
import type { Point } from "@/lib/design-document/types";
import { outlineBounds } from "@/lib/studio/footprint";

const WORK_MM = 3000; // default working extent when there's nothing drawn yet
const SNAP_PX = 14;

export function PolygonEditor({ outline, onChange }: { outline: Point[]; onChange: (o: Point[]) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const closed = outline.length >= 3; // in this editor a closed polygon = "edit"; open = "draw"

  const b = closed ? outlineBounds(outline) : { cx: WORK_MM / 2, cy: WORK_MM / 2, w: WORK_MM, h: WORK_MM };
  const pad = Math.max(b.w, b.h) * 0.15 + 150;
  const vb = `${b.cx - b.w / 2 - pad} ${b.cy - b.h / 2 - pad} ${b.w + pad * 2} ${b.h + pad * 2}`;

  const clientToMm = (clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const loc = pt.matrixTransform(ctm.inverse());
    return { x: Math.round(loc.x), y: Math.round(loc.y) };
  };
  const mmToClient = (p: Point): Point => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = p.x; pt.y = p.y;
    const s = pt.matrixTransform(ctm);
    return { x: s.x, y: s.y };
  };

  const onCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (closed) return; // editing: canvas clicks do nothing
    if (outline.length >= 3) {
      const first = mmToClient(outline[0]);
      if (Math.hypot(e.clientX - first.x, e.clientY - first.y) < SNAP_PX) return; // already ≥3 → treat as done (no-op; button closes)
    }
    onChange([...outline, clientToMm(e.clientX, e.clientY)]);
  };

  const moveVertex = (i: number, p: Point) => onChange(outline.map((v, j) => (j === i ? p : v)));

  const vertexDrag = (i: number) => ({
    onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); (e.currentTarget as Element).setPointerCapture(e.pointerId); },
    onPointerMove: (e: React.PointerEvent) => { if (e.buttons === 1) moveVertex(i, clientToMm(e.clientX, e.clientY)); },
    onPointerUp: (e: React.PointerEvent) => (e.currentTarget as Element).releasePointerCapture(e.pointerId),
  });

  const r = Math.max(b.w, b.h) * 0.02 + 30;
  return (
    <svg
      ref={svgRef}
      viewBox={vb}
      className={"h-full w-full text-ink-soft " + (closed ? "cursor-default" : "cursor-crosshair")}
      role="img"
      aria-label="עורך צורת הפריט — לחיצה להוספת נקודה, גרירה לשינוי"
      onClick={onCanvasClick}
      onPointerMove={(e) => !closed && setCursor(clientToMm(e.clientX, e.clientY))}
    >
      {closed && <polygon points={outline.map((p) => `${p.x},${p.y}`).join(" ")} fill="currentColor" fillOpacity={0.1} stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
      {!closed && outline.length > 1 && (
        <polyline points={outline.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      )}
      {!closed && outline.length > 0 && cursor && (
        <line x1={outline[outline.length - 1].x} y1={outline[outline.length - 1].y} x2={cursor.x} y2={cursor.y}
          className="text-muted" stroke="currentColor" strokeWidth={1.5} strokeDasharray={6} vectorEffect="non-scaling-stroke" />
      )}
      {outline.map((v, i) => (
        <circle
          key={i}
          {...(closed ? vertexDrag(i) : {})}
          cx={v.x} cy={v.y} r={r}
          className={!closed && i === 0 && outline.length >= 2 ? "text-accent" : "text-ink-soft"}
          fill="currentColor"
          style={{ cursor: closed ? "move" : "pointer", touchAction: "none" }}
        />
      ))}
    </svg>
  );
}
