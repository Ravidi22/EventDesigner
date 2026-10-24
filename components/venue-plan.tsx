"use client";

import { outlinePathD, polygonAreaMm2, polygonCentroid, pointAtDistance } from "@/lib/studio/geometry";
import { resolveStyle } from "@/lib/element-style";
import { nodeMap, wallPoints, type StructureFeature, type VenueStructure } from "@/lib/venues/structure";
import { ZONE_KIND_LABEL, type ResolvedZone } from "@/lib/venues/zone";

// World-space layers for the venue plan, meant to be handed to ShapeCanvas as its `backdrop`/`overlay`.
//
// These render no <svg> and own no viewport: ShapeCanvas provides the coordinate space, the pan and
// zoom, the grid and the snapping, and it draws the walls itself from the same graph. That split is
// the point — the zone tints go underneath and the shared walls are stroked once on top, so a wall
// between two zones reads as the single wall it is.
//
// Selection is handled here rather than in the canvas for everything the canvas doesn't draw: these
// are host JSX, so a zone/feature/door owns its own hit area and reports its own id, and the canvas
// stays ignorant of what a "zone" is. Only the walls and corners — geometry it draws itself — go
// through its own graph selection.
//
// Zone kind reads by fill AND label, so nothing depends on colour alone and the plan survives the
// B&W print path.

const ZONE_FILL: Record<string, string> = {
  hall: "var(--color-accent-tint)",
  canopy: "var(--color-indigo-50)",
  open: "var(--color-inset)",
  service: "var(--color-bg)",
};

// Label sizes in *screen pixels*, converted to world units per render via the canvas's `mm()`.
// Sizing them in plan millimetres instead makes them zoom with the drawing: legible at the fitted
// view, then either microscopic or wall-sized two scroll clicks later. A map label is chrome, not
// geometry — it should hold still while the thing it names grows.
const ZONE_NAME_PX = 15;
const ZONE_SUB_PX = 11;
const FEATURE_LABEL_PX = 11;

// These layers deliberately do NOT stop the press from reaching the <svg>: that is what lets a
// marquee drag start on top of a zone tint instead of only in the gaps between them. Clicks still
// work because the canvas no longer captures the pointer until a drag actually begins — a captured
// pointer retargets the click to the capture element, which is what made walls, zones and doors
// read as unclickable in the first place. See shape-canvas's onPointerDown/onPointerMove.

/** Tinted, labelled zone regions. Drawn under the walls. */
export function ZoneRegions({
  zones,
  selectedIds,
  onSelect,
  mm,
}: {
  zones: ResolvedZone[];
  selectedIds?: string[];
  onSelect?: (id: string, additive: boolean) => void;
  /** Screen px → world mm at the current zoom (from ShapeCanvas's layer context). */
  mm: (px: number) => number;
}) {
  return (
    <>
      {zones
        .filter((r) => r.boundary.length >= 3)
        .map((r) => {
          const selected = selectedIds?.includes(r.zone.id) ?? false;
          const centre = polygonCentroid(r.boundary);
          const areaM2 = Math.round(polygonAreaMm2(r.boundary) / 1_000_000);
          // A designer's own tint is an override on top of the kind's default, never instead of it:
          // the label underneath still names the kind, so the plan reads the same in B&W.
          const style = resolveStyle(r.zone.style, "screen", {
            fill: selected ? "var(--color-accent-wash)" : ZONE_FILL[r.zone.kind],
            stroke: selected ? "var(--color-accent)" : "none",
            strokeWidth: selected ? 2.5 : 0,
          });
          return (
            <g
              key={r.zone.id}
              onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(r.zone.id, e.shiftKey); } : undefined}
              className={onSelect ? "cursor-pointer" : undefined}
            >
              <path
                d={outlinePathD(r.boundary)}
                fill={style.fill}
                fillOpacity={style.fillOpacity}
                stroke={selected ? "var(--color-accent)" : style.stroke}
                strokeWidth={selected ? 2.5 : style.strokeWidth}
                strokeDasharray={style.dashArray.length ? style.dashArray.join(" ") : undefined}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={centre.x}
                y={centre.y - mm(ZONE_NAME_PX * 0.35)}
                textAnchor="middle"
                dominantBaseline="central"
                fill={selected ? "var(--color-accent-deep)" : "var(--color-ink)"}
                style={{ fontSize: mm(ZONE_NAME_PX), fontWeight: 700 }}
                className="pointer-events-none"
              >
                {r.zone.name}
              </text>
              <text
                x={centre.x}
                y={centre.y + mm(ZONE_NAME_PX * 0.8)}
                textAnchor="middle"
                dominantBaseline="central"
                fill={selected ? "var(--color-accent)" : "var(--color-muted)"}
                style={{ fontSize: mm(ZONE_SUB_PX) }}
                className="pointer-events-none"
              >
                {ZONE_KIND_LABEL[r.zone.kind]} · {areaM2} מ״ר
              </text>
            </g>
          );
        })}
    </>
  );
}

/** Fixed things a designer plans around and cannot move — the pool, a built stage, a permanent bar. */
export function StructureFeatures({
  structure,
  mm,
  selectedIds,
  onSelect,
  onMove,
  onCommit,
  clientToMm,
}: {
  structure: VenueStructure;
  mm: (px: number) => number;
  selectedIds?: string[];
  onSelect?: (id: string, additive: boolean) => void;
  /** Absent = features are fixed in place for this mode (drawing walls, naming zones). */
  onMove?: (id: string, p: { x: number; y: number }) => void;
  onCommit?: () => void;
  clientToMm?: (clientX: number, clientY: number) => { x: number; y: number };
}) {
  return (
    <>
      {structure.features.map((f) => {
        const selected = selectedIds?.includes(f.id) ?? false;
        const style = resolveStyle(f.style, "screen", {
          fill: "var(--color-canvas)",
          stroke: selected ? "var(--color-accent)" : "var(--color-muted)",
          strokeWidth: selected ? 2.5 : 1.25,
        });
        const common = {
          fill: style.fill,
          fillOpacity: style.fillOpacity,
          stroke: selected ? "var(--color-accent)" : style.stroke,
          strokeWidth: selected ? 2.5 : style.strokeWidth,
          strokeDasharray: (f.style?.dash ? style.dashArray.join(" ") : "4 3") || undefined,
          vectorEffect: "non-scaling-stroke" as const,
        };
        const drag = draggable(f, onMove, onCommit, clientToMm);
        return (
          <g
            key={f.id}
            transform={f.rotationDeg ? `rotate(${f.rotationDeg} ${f.x} ${f.y})` : undefined}
            {...drag}
            onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(f.id, e.shiftKey); } : undefined}
            className={onMove ? "cursor-move touch-none" : onSelect ? "cursor-pointer" : "pointer-events-none"}
          >
            {f.shape === "circle" ? (
              <circle cx={f.x} cy={f.y} r={f.widthMm / 2} {...common} />
            ) : f.shape === "ellipse" ? (
              <ellipse cx={f.x} cy={f.y} rx={f.widthMm / 2} ry={f.depthMm / 2} {...common} />
            ) : (
              <rect x={f.x - f.widthMm / 2} y={f.y - f.depthMm / 2} width={f.widthMm} height={f.depthMm} {...common} />
            )}
            <text
              x={f.x}
              y={f.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill={selected ? "var(--color-accent-deep)" : "var(--color-muted)"}
              style={{ fontSize: mm(FEATURE_LABEL_PX) }}
              className="pointer-events-none"
            >
              {f.label}
            </text>
          </g>
        );
      })}
    </>
  );
}

// Where each live feature drag started, keyed by pointerId. Module scope, not a closure variable:
// the first onMove re-renders the host, which rebuilds these handlers mid-gesture, so the origin has
// to outlive that. (Same reason — and same shape — as shape-canvas.tsx's own pressOrigin map.)
const featureDrag = new Map<number, { x: number; y: number; fx: number; fy: number; dragging: boolean }>();

// A feature drags with the plain pointer-capture idiom rather than ShapeCanvas's dragHandlers: that
// helper lives inside the canvas and carries its whole selection protocol, which a host-drawn layer
// has no business in. The threshold is the same 4px, so a click still can't nudge.
function draggable(
  f: StructureFeature,
  onMove?: (id: string, p: { x: number; y: number }) => void,
  onCommit?: () => void,
  clientToMm?: (clientX: number, clientY: number) => { x: number; y: number },
) {
  if (!onMove || !clientToMm) return {};
  const end = (e: React.PointerEvent) => {
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (featureDrag.get(e.pointerId)?.dragging) onCommit?.();
    featureDrag.delete(e.pointerId);
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      featureDrag.set(e.pointerId, { x: e.clientX, y: e.clientY, fx: f.x, fy: f.y, dragging: false });
    },
    onPointerMove: (e: React.PointerEvent) => {
      const origin = featureDrag.get(e.pointerId);
      if (!origin || e.buttons !== 1) return;
      if (!origin.dragging) {
        if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < 4) return;
        origin.dragging = true;
      }
      const from = clientToMm(origin.x, origin.y);
      const to = clientToMm(e.clientX, e.clientY);
      onMove(f.id, { x: Math.round(origin.fx + to.x - from.x), y: Math.round(origin.fy + to.y - from.y) });
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
}

/** Door openings, painted over the wall the canvas already stroked so they read as gaps. Drawn as
 *  part of the overlay layer that sits *above* the walls. */
export function StructureDoors({
  structure,
  selectedIds,
  onSelect,
}: {
  structure: VenueStructure;
  selectedIds?: string[];
  onSelect?: (id: string, additive: boolean) => void;
}) {
  const nodes = nodeMap(structure);
  return (
    <>
      {structure.entrances.map((e) => {
        const w = structure.walls.find((x) => x.id === e.wallId);
        const pts = w ? wallPoints(structure, w, nodes) : null;
        if (!pts) return null;
        const selected = selectedIds?.includes(e.id) ?? false;
        const half = e.widthMm / 2;
        const from = pointAtDistance(pts.a, pts.b, e.distanceMm - half);
        const to = pointAtDistance(pts.a, pts.b, e.distanceMm + half);
        return (
          <g key={e.id}>
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={selected ? "var(--color-accent)" : "var(--color-canvas)"}
              strokeWidth={selected ? 5 : 4.5}
              vectorEffect="non-scaling-stroke"
              className="pointer-events-none"
            />
            {onSelect && (
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="transparent"
                strokeWidth={Math.max(e.widthMm * 0.7, 600)}
                strokeLinecap="butt"
                className="cursor-pointer"
                aria-label="כניסה — בחירה לעריכה"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onSelect(e.id, ev.shiftKey);
                }}
              />
            )}
          </g>
        );
      })}
    </>
  );
}
