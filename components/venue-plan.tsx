"use client";

import { outlinePathD, polygonAreaMm2, polygonCentroid, wallLengthMm, wallSegmentD } from "@/lib/studio/geometry";
import { resolveStyle } from "@/lib/element-style";
import { nodeMap, wallPoints, type StructureFeature, type VenueStructure } from "@/lib/venues/structure";
import { stairsGeometry } from "@/lib/venues/stairs";
import { clampOpacity, spanMm, underlayCentre } from "@/lib/venues/underlay";
import type { PlanUnderlay } from "@/lib/venues/types";
import { ZONE_KIND_LABEL, type ResolvedZone } from "@/lib/venues/zone";
import type { Point } from "@/lib/studio/hall";

// World-space layers for the venue plan, meant to be handed to PlanCanvas as its `backdrop`/`overlay`.
//
// These render no <svg> and own no viewport: PlanCanvas provides the coordinate space, the pan and
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

// ── The traced-over floor plan (F-3.5) ─────────────────────────────────────────────────────────

// The photograph or scan the walls are drawn on top of. FIRST in the backdrop, so everything else
// on the plan — zone tints, features, doors, and the canvas's own walls — sits above it.
//
// ⚠ `preserveAspectRatio="none"` is REQUIRED, not a style choice. SVG's default letterboxes the
// image inside the rectangle, so the pixels would stop spanning `widthMm` and every calibration
// measured against them would be wrong by the size of the letterbox. The rectangle is kept at the
// image's own ratio by placeUnderlay/scaleUnderlayAbout, so "none" distorts nothing — it just makes
// the rectangle mean what the maths in lib/venues/underlay.ts assumes it means.
//
// Not interactive unless `onMove` is supplied. That default matters: while tracing, a stray drag
// that shifted the plan under the walls already drawn on it would silently invalidate all of them,
// so /halls keeps the image locked and asks for it to be unlocked on purpose.
export function PlanUnderlayLayer({
  underlay,
  onMove,
  onCommit,
  clientToMm,
}: {
  underlay?: PlanUnderlay;
  onMove?: (p: Point) => void;
  onCommit?: () => void;
  clientToMm?: (clientX: number, clientY: number) => Point;
}) {
  // A row written before file storage existed carries a fileName and no url; there is nothing to
  // draw for it, and an <image> with an empty href renders a broken-image glyph on the plan.
  if (!underlay?.url) return null;

  const c = underlayCentre(underlay);
  const movable = Boolean(onMove && clientToMm);
  const drag = movable ? draggableUnderlay(underlay, onMove, onCommit, clientToMm) : {};

  return (
    <g transform={`rotate(${underlay.rotationDeg} ${c.x} ${c.y})`}>
      <image
        href={underlay.url}
        x={underlay.x}
        y={underlay.y}
        width={underlay.widthMm}
        height={underlay.heightMm}
        opacity={clampOpacity(underlay.opacity)}
        preserveAspectRatio="none"
        className={movable ? "cursor-move" : "pointer-events-none"}
        {...drag}
      />
      {/* While unlocked, the outline says where the image's edges are — a pale scan can otherwise
          fade into the plane, leaving nothing to aim a drag at. */}
      {movable && (
        <rect
          x={underlay.x}
          y={underlay.y}
          width={underlay.widthMm}
          height={underlay.heightMm}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeDasharray="8 6"
          vectorEffect="non-scaling-stroke"
          className="pointer-events-none"
        />
      )}
    </g>
  );
}

const underlayDrag = new Map<number, { x: number; y: number; ux: number; uy: number; dragging: boolean }>();

// Same 4px threshold as every other draggable thing here, so a click meant to select can't nudge
// the plan. Reports a DELTA from where the press began rather than the pointer's position, so the
// image doesn't jump its own centre to the cursor on the first move.
function draggableUnderlay(
  u: PlanUnderlay,
  onMove?: (p: Point) => void,
  onCommit?: () => void,
  clientToMm?: (clientX: number, clientY: number) => Point,
) {
  if (!onMove || !clientToMm) return {};
  const end = (e: React.PointerEvent) => {
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (underlayDrag.get(e.pointerId)?.dragging) onCommit?.();
    underlayDrag.delete(e.pointerId);
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      underlayDrag.set(e.pointerId, { x: e.clientX, y: e.clientY, ux: u.x, uy: u.y, dragging: false });
    },
    onPointerMove: (e: React.PointerEvent) => {
      const origin = underlayDrag.get(e.pointerId);
      if (!origin || e.buttons !== 1) return;
      if (!origin.dragging) {
        if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < 4) return;
        origin.dragging = true;
      }
      const from = clientToMm(origin.x, origin.y);
      const to = clientToMm(e.clientX, e.clientY);
      onMove({ x: Math.round(origin.ux + to.x - from.x), y: Math.round(origin.uy + to.y - from.y) });
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
}

/**
 * The two points being marked for calibration (F-3.4), with what they currently measure.
 *
 * Drawn in the OVERLAY rather than the backdrop: it has to be readable over the photograph it is
 * measuring, and a scan is often darkest exactly where a wall is.
 *
 * The readout shows the length *as currently placed* — the number the designer is about to correct.
 * Seeing "1,340 מ״מ" over a wall they know is 12 metres is what makes the next step obvious.
 */
export function CalibrationOverlay({
  from,
  to,
  mm,
}: {
  from: Point | null;
  to: Point | null;
  mm: (px: number) => number;
}) {
  if (!from) return null;
  const dot = mm(5);
  if (!to) return <circle cx={from.x} cy={from.y} r={dot} fill="var(--color-accent)" className="pointer-events-none" />;

  const measured = spanMm(from, to);
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  return (
    <g className="pointer-events-none">
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="var(--color-accent)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={from.x} cy={from.y} r={dot} fill="var(--color-accent)" />
      <circle cx={to.x} cy={to.y} r={dot} fill="var(--color-accent)" />
      {/* direction:ltr — a measurement is a number with a unit, and it reads left-to-right even on
          an RTL screen. As a style rather than the `dir` attribute, which SVG text does not take. */}
      <text
        x={midX}
        y={midY - mm(10)}
        textAnchor="middle"
        fontSize={mm(13)}
        fill="var(--color-accent)"
        className="font-semibold"
        style={{
          direction: "ltr",
          paintOrder: "stroke",
          stroke: "var(--color-card)",
          strokeWidth: mm(4),
        }}
      >
        {Math.round(measured).toLocaleString("en-US")} mm
      </text>
    </g>
  );
}

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
// read as unclickable in the first place. See plan-canvas's onPointerDown/onPointerMove.

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
  /** Screen px → world mm at the current zoom (from PlanCanvas's layer context). */
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
  onMoveStairs,
  onCommit,
  clientToMm,
}: {
  structure: VenueStructure;
  mm: (px: number) => number;
  selectedIds?: string[];
  onSelect?: (id: string, additive: boolean) => void;
  /** Absent = features are fixed in place for this mode (drawing walls, naming zones). */
  onMove?: (id: string, p: { x: number; y: number }) => void;
  /** Dragging a flight of stairs — reported as the raw world point it was dropped on, since which
   *  edge of the deck that means (and how far along it) is the model's call, not the layer's.
   *  See lib/venues/stairs.ts's stairsPlacementAt. */
  onMoveStairs?: (id: string, p: { x: number; y: number }) => void;
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
        // The flight comes back already in world millimetres, rotation and all, so it is drawn
        // OUTSIDE the feature's rotated group — inside it, the group's own transform would turn a
        // stage's stairs a second time.
        const stairs = stairsGeometry(f);
        const stairsDrag = draggableStairs(f, onMoveStairs, onCommit, clientToMm);
        return (
          <g key={f.id}>
            {stairs && (
              <g
                {...stairsDrag}
                onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(f.id, e.shiftKey); } : undefined}
                className={onMoveStairs ? "cursor-move touch-none" : onSelect ? "cursor-pointer" : "pointer-events-none"}
                aria-label={`${f.label} — מדרגות`}
              >
                <path
                  d={outlinePathD(stairs.outline)}
                  fill={selected ? "var(--color-accent-wash)" : "var(--color-inset)"}
                  stroke={selected ? "var(--color-accent)" : "var(--color-muted)"}
                  strokeWidth={selected ? 2.5 : 1.25}
                  vectorEffect="non-scaling-stroke"
                />
                {/* One line per step edge. With the footprint's own two ends, the count of lines is
                    the count of risers — which is how a plan says "four steps" without a label. */}
                {stairs.nosings.map(([p, q], i) => (
                  <line
                    key={i}
                    x1={p.x}
                    y1={p.y}
                    x2={q.x}
                    y2={q.y}
                    stroke={selected ? "var(--color-accent)" : "var(--color-muted)"}
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            )}
            <g
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
          </g>
        );
      })}
    </>
  );
}

// Where each live feature drag started, keyed by pointerId. Module scope, not a closure variable:
// the first onMove re-renders the host, which rebuilds these handlers mid-gesture, so the origin has
// to outlive that. (Same reason — and same shape — as plan-canvas.tsx's own pressOrigin map.)
const featureDrag = new Map<number, { x: number; y: number; fx: number; fy: number; dragging: boolean }>();

// A feature drags with the plain pointer-capture idiom rather than PlanCanvas's dragHandlers: that
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

// Dragging a flight of stairs. Unlike a feature, this reports where the pointer *is* rather than how
// far it has travelled: a flight has only two degrees of freedom (which edge, how far along it), so
// the honest gesture is "put them here" — the model then lands them on the nearest edge rather than
// letting a raw delta walk them off the deck. Same 4px threshold, so a click still can't nudge.
const stairsDrag = new Map<number, { x: number; y: number; dragging: boolean }>();

function draggableStairs(
  f: StructureFeature,
  onMoveStairs?: (id: string, p: { x: number; y: number }) => void,
  onCommit?: () => void,
  clientToMm?: (clientX: number, clientY: number) => { x: number; y: number },
) {
  if (!onMoveStairs || !clientToMm) return {};
  const end = (e: React.PointerEvent) => {
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (stairsDrag.get(e.pointerId)?.dragging) onCommit?.();
    stairsDrag.delete(e.pointerId);
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      stairsDrag.set(e.pointerId, { x: e.clientX, y: e.clientY, dragging: false });
    },
    onPointerMove: (e: React.PointerEvent) => {
      const origin = stairsDrag.get(e.pointerId);
      if (!origin || e.buttons !== 1) return;
      if (!origin.dragging) {
        if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < 4) return;
        origin.dragging = true;
      }
      onMoveStairs(f.id, clientToMm(e.clientX, e.clientY));
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
        // The gap is cut along the wall as drawn, bow and all — a straight strike across a curved
        // wall would leave the opening floating beside the wall it is supposed to be a hole in.
        // The t-range is the door's chord distance over the chord length, the same approximation
        // the door's placement already uses (see geometry.ts's note on doors and curves).
        const len = wallLengthMm(pts.a, pts.b) || 1;
        const half = e.widthMm / 2;
        const t0 = Math.max(0, (e.distanceMm - half) / len);
        const t1 = Math.min(1, (e.distanceMm + half) / len);
        const d = wallSegmentD(pts.a, pts.b, w?.curve ?? null, t0, t1);
        return (
          <g key={e.id}>
            <path
              d={d}
              fill="none"
              stroke={selected ? "var(--color-accent)" : "var(--color-canvas)"}
              strokeWidth={selected ? 5 : 4.5}
              vectorEffect="non-scaling-stroke"
              className="pointer-events-none"
            />
            {onSelect && (
              <path
                d={d}
                fill="none"
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
