"use client";

import { fromLocalFrame, outlinePathD, polygonAreaMm2, polygonCentroid, projectOntoWall, resizeFromEdge, toLocalFrame, wallLengthMm, wallSegmentD } from "@/lib/studio/geometry";
import { resolveStyle } from "@/lib/element-style";
import { isAdditiveClick } from "@/lib/keyboard";
import { featureFootprint, nodeMap, plantSpecies, surfaceMaterial, wallPoints, type StructureFeature, type VenueStructure } from "@/lib/venues/structure";
import { FootprintShape } from "@/components/footprint-shape";
import { PlantGlyph } from "@/components/plant-glyph";
import { SurfaceFill } from "@/components/surface-fill";
import { detectFaces, type Face } from "@/lib/venues/faces";
import { stairsFlights } from "@/lib/venues/stairs";
import { clampOpacity, spanMm, underlayCentre } from "@/lib/venues/underlay";
import type { PlanUnderlay } from "@/lib/venues/types";
import { ZONE_KIND_LABEL, type ResolvedZone } from "@/lib/venues/zone";
import type { Point } from "@/lib/studio/hall";
import { EntranceDoor, RotateHandle } from "@/components/plan-canvas";

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
  selected = false,
  onMove,
  onCommit,
  clientToMm,
}: {
  underlay?: PlanUnderlay;
  /** The designer clicked the plan and its lock chip is open — draw the same solid accent outline
   *  and wash a selected zone or feature wears, so it is obvious WHAT the chip is acting on. */
  selected?: boolean;
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
      {selected && !movable && (
        <>
          {/* A white under-stroke first, so the accent line stays visible over a dark photo. */}
          <rect
            x={underlay.x}
            y={underlay.y}
            width={underlay.widthMm}
            height={underlay.heightMm}
            fill="var(--color-accent)"
            fillOpacity={0.1}
            stroke="var(--color-canvas)"
            strokeWidth={6}
            vectorEffect="non-scaling-stroke"
            className="pointer-events-none"
          />
          <rect
            x={underlay.x}
            y={underlay.y}
            width={underlay.widthMm}
            height={underlay.heightMm}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
            className="pointer-events-none"
          />
        </>
      )}
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
          stroke: "var(--color-canvas)",
          strokeWidth: mm(4),
        }}
      >
        {Math.round(measured).toLocaleString("en-US")} mm
      </text>
    </g>
  );
}

// A finished plan reads its zone kinds by fill, at a glance, before anyone reads a label: a warm
// neutral for the rooms you build (indoor halls), a cool tint for the ones the sky roofs (a חופה
// open to the air, a lawn/plaza/pool deck), and plain grey for the parts nobody designs into.
const ZONE_FILL: Record<string, string> = {
  hall: "var(--color-inset)", // soft off-white — an indoor room
  canopy: "#e8f1fb", // soft pale blue — open to the sky
  open: "var(--color-success-tint)", // soft pale green — outdoor ground
  service: "var(--color-bg)",
};

// Label sizes in *screen pixels*, converted to world units per render via the canvas's `mm()`.
// Sizing them in plan millimetres instead makes them zoom with the drawing: legible at the fitted
// view, then either microscopic or wall-sized two scroll clicks later. A map label is chrome, not
// geometry — it should hold still while the thing it names grows.
const ZONE_NAME_PX = 15;
const ZONE_SUB_PX = 11;
const FEATURE_LABEL_PX = 11;
const MIN_FEATURE_MM = 200; // a feature can't be resized smaller than this — same floor the studio's own fixtures use

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
  labels = true,
}: {
  zones: ResolvedZone[];
  selectedIds?: string[];
  onSelect?: (id: string, additive: boolean) => void;
  /** Screen px → world mm at the current zoom (from PlanCanvas's layer context). */
  mm: (px: number) => number;
  /** Whether each region writes its own name and kind across itself. True at /halls, where naming
   *  the regions IS the job. False in the studio: there the tint is context for the drawing on top
   *  of it, and a word the size of the room sitting under the tables reads as part of the design
   *  rather than as the room it names. */
  labels?: boolean;
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

          // How wide this zone reads on SCREEN right now (not in plan mm, which says nothing about
          // whether two neighbouring labels are about to collide at the current zoom) — small or
          // stacked-close zones lose the kind/area line first, and truncate the name itself, rather
          // than spilling text past their own boundary into the zone next door.
          const xs = r.boundary.map((p) => p.x);
          const boxWidthMm = Math.max(...xs) - Math.min(...xs);
          const pxPerMm = 1 / mm(1);
          const screenWidthPx = boxWidthMm * pxPerMm;
          const showSub = screenWidthPx > 90;
          const maxNameChars = Math.max(3, Math.floor((screenWidthPx * 0.88) / (ZONE_NAME_PX * 0.58)));
          const displayName =
            r.zone.name.length > maxNameChars ? `${r.zone.name.slice(0, maxNameChars - 1)}…` : r.zone.name;

          return (
            <g
              key={r.zone.id}
              onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(r.zone.id, isAdditiveClick(e)); } : undefined}
              className={onSelect ? "cursor-pointer" : undefined}
            >
              <path
                d={outlinePathD(r.boundary)}
                fill={style.fill}
                fillOpacity={style.fillOpacity}
                stroke={selected ? "var(--color-accent)" : style.stroke}
                strokeOpacity={style.strokeOpacity}
                strokeWidth={selected ? 2.5 : style.strokeWidth}
                strokeDasharray={style.dashArray.length ? style.dashArray.join(" ") : undefined}
                vectorEffect="non-scaling-stroke"
              />
              {labels && (
              <text
                x={centre.x}
                y={showSub ? centre.y - mm(ZONE_NAME_PX * 0.35) : centre.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={selected ? "var(--color-accent-deep)" : "var(--color-ink)"}
                style={{ fontSize: mm(ZONE_NAME_PX), fontWeight: 700 }}
                className="pointer-events-none"
              >
                <title>{r.zone.name}</title>
                {displayName}
              </text>
              )}
              {labels && showSub && (
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
              )}
            </g>
          );
        })}
    </>
  );
}

// Where each live corner drag started, keyed by pointerId — module scope for the same reason as
// featureDrag below: the first move re-renders the host and rebuilds these handlers mid-gesture.
const regionDrag = new Map<number, { index: number; x: number; y: number; from: Point; dragging: boolean }>();

/** The editable outline of a freehand zone (lib/venues/region-edit.ts): a handle on every corner to
 *  drag, a smaller one mid-edge that becomes a new corner the moment it is dragged, and a
 *  double-click on a corner to take it away. Drawn only for the one selected region zone — a face
 *  zone's outline is its walls, which the canvas already lets you drag. */
export function RegionOutlineEditor({
  boundary,
  mm,
  clientToMm,
  onMovePoint,
  onInsertPoint,
  onRemovePoint,
  onCommit,
}: {
  boundary: Point[];
  mm: (px: number) => number;
  clientToMm: (clientX: number, clientY: number) => { x: number; y: number };
  onMovePoint: (index: number, to: Point) => void;
  /** Adds a corner mid-edge `index` and returns the new corner's index, which the drag then moves. */
  onInsertPoint: (index: number) => number;
  onRemovePoint: (index: number) => void;
  onCommit: () => void;
}) {
  const end = (e: React.PointerEvent) => {
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    const d = regionDrag.get(e.pointerId);
    if (d?.dragging) onCommit();
    regionDrag.delete(e.pointerId);
  };
  const drag = (index: number | null, edge: number | null) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      const at = index ?? edge!;
      regionDrag.set(e.pointerId, {
        // A mid-edge handle has no corner yet: -1 until the drag actually starts, so a plain click
        // on it adds nothing.
        index: index ?? -1 - at,
        x: e.clientX,
        y: e.clientY,
        from: index !== null ? boundary[index] : clientToMm(e.clientX, e.clientY),
        dragging: false,
      });
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = regionDrag.get(e.pointerId);
      if (!d || e.buttons !== 1) return;
      if (!d.dragging) {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
        d.dragging = true;
        if (d.index < 0) d.index = onInsertPoint(-1 - d.index);
      }
      const start = clientToMm(d.x, d.y);
      const now = clientToMm(e.clientX, e.clientY);
      onMovePoint(d.index, { x: d.from.x + now.x - start.x, y: d.from.y + now.y - start.y });
    },
    onPointerUp: end,
    onPointerCancel: end,
  });
  const r = mm(6);
  return (
    // A click on a handle is not a click on the empty plan: letting it bubble to the canvas would
    // clear the selection, and with it these handles, before a double-click could land.
    <g onClick={(e) => e.stopPropagation()}>
      {boundary.map((a, i) => {
        const b = boundary[(i + 1) % boundary.length];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        // Too short on screen to fit a third handle between its two corners: offer none.
        if (Math.hypot(b.x - a.x, b.y - a.y) < mm(36)) return null;
        return (
          <g key={`m${i}`} {...drag(null, i)} role="button" aria-label="הוספת פינה — גרירה" className="group cursor-copy touch-none">
            <circle cx={mx} cy={my} r={mm(10)} fill="transparent" />
            <circle
              cx={mx}
              cy={my}
              r={mm(4)}
              fill="var(--color-accent)"
              fillOpacity={0.45}
              className="transition-opacity group-hover:fill-opacity-100"
            />
          </g>
        );
      })}
      {boundary.map((p, i) => (
        <g
          key={`p${i}`}
          {...drag(i, null)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onRemovePoint(i);
          }}
          tabIndex={0}
          role="button"
          aria-label={`פינה ${i + 1} — גרירה להזזה · לחיצה כפולה למחיקה`}
          className="group cursor-move touch-none"
        >
          <title>גררו להזזה · לחיצה כפולה מוחקת את הפינה</title>
          <circle cx={p.x} cy={p.y} r={mm(12)} fill="transparent" />
          <circle
            cx={p.x}
            cy={p.y}
            r={r}
            fill="#ffffff"
            stroke="var(--color-accent)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            className="transition-colors group-hover:fill-accent-tint"
          />
        </g>
      ))}
    </g>
  );
}

/** The drawing order with every surface moved beneath everything else, each group keeping its own
 *  order. A lawn laid after the palms must not bury them: the ground is under what stands on it
 *  whatever order it was added in, and restacking reorders surfaces only among themselves. */
function groundFirst(features: StructureFeature[]): StructureFeature[] {
  return [...features.filter((f) => f.kind === "surface"), ...features.filter((f) => f.kind !== "surface")];
}

/** Fixed things a designer plans around and cannot move — the pool, a built stage, a permanent bar. */
export function StructureFeatures({
  structure,
  mm,
  selectedIds,
  onSelect,
  onMove,
  onMoveStairs,
  onResize,
  onRotate,
  onCommit,
  clientToMm,
  onContextMenu,
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
  /** Dragging a resize handle. Absent = a selected feature shows no handles at all (mid-draw, or
   *  any mode that doesn't edit the built plan) — same "supplying it is what turns the affordance
   *  on" rule as onMove/onMoveStairs. */
  onResize?: (id: string, patch: { widthMm: number; depthMm: number; x: number; y: number }) => void;
  /** Dragging the rotate knob. Same opt-in rule as the three above: a host that does not supply it
   *  gets a selected feature with no knob on it, which is what /halls' draw mode and every
   *  read-only surface want. A bar built across the corner of a room is at 30° and there was no way
   *  to put it there but to type the number into the side panel. */
  onRotate?: (id: string, rotationDeg: number) => void;
  onCommit?: () => void;
  clientToMm?: (clientX: number, clientY: number) => { x: number; y: number };
  /** A right-click landed on this feature. Reported, not handled: the event still bubbles on to the
   *  canvas, whose own right-click menu the host fills in knowing which feature it was over. */
  onContextMenu?: (id: string) => void;
}) {
  return (
    <>
      {groundFirst(structure.features).map((f) => {
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
          strokeOpacity: style.strokeOpacity,
          strokeWidth: selected ? 2.5 : style.strokeWidth,
          strokeDasharray: (f.style?.dash ? style.dashArray.join(" ") : "4 3") || undefined,
          vectorEffect: "non-scaling-stroke" as const,
        };
        const drag = draggable(f, onMove, onCommit, clientToMm);
        // The flight comes back already in world millimetres, rotation and all, so it is drawn
        // OUTSIDE the feature's rotated group — inside it, the group's own transform would turn a
        // stage's stairs a second time.
        const flights = stairsFlights(f);
        const stairsDrag = draggableStairs(f, onMoveStairs, onCommit, clientToMm);
        return (
          <g key={f.id}>
            {flights.map((stairs, n) => (
              <g
                key={n}
                {...stairsDrag}
                onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(f.id, isAdditiveClick(e)); } : undefined}
                className={onMoveStairs ? "cursor-move touch-none" : onSelect ? "cursor-pointer" : "pointer-events-none"}
                aria-label={`${f.label} — מדרגות`}
              >
                <path
                  d={outlinePathD(stairs.outline)}
                  fill={selected ? "var(--color-accent-wash)" : (f.stairs?.fill ?? "var(--color-inset)")}
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
            ))}
            <g
              transform={f.rotationDeg ? `rotate(${f.rotationDeg} ${f.x} ${f.y})` : undefined}
              {...drag}
              onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(f.id, isAdditiveClick(e)); } : undefined}
              onContextMenu={onContextMenu ? () => onContextMenu(f.id) : undefined}
              className={onMove ? "cursor-move touch-none" : onSelect ? "cursor-pointer" : "pointer-events-none"}
            >
              {/* One shape resolver for the whole app (components/footprint-shape.tsx): a bar the
                  catalog draws as a ח has to be a ח here and on the printed placement map too, or
                  the plan disagrees with itself in front of the crew setting the room up. The
                  footprint is centred on its own origin, so the position is a translate — the
                  label and the resize handles below keep their absolute coordinates. */}
              <g transform={`translate(${f.x} ${f.y})`}>
                {f.kind === "surface" ? (
                  <>
                    {/* The ground: a real-scale texture filling its own shape, with the same
                        dashed selection outline as a plant rather than a dashed resting border. */}
                    <SurfaceFill
                      material={surfaceMaterial(f)}
                      footprint={featureFootprint(f)}
                      w={f.widthMm}
                      d={f.depthMm}
                      id={f.id}
                      color={f.style?.fill}
                      opacity={f.style?.fillOpacity}
                    />
                    {selected && (
                      <FootprintShape
                        footprint={featureFootprint(f)}
                        fill="none"
                        stroke="var(--color-accent)"
                        strokeWidth={2}
                        strokeDasharray="4 3"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                  </>
                ) : f.kind === "plant" ? (
                  <>
                    {/* A plant is its picture, not a labelled outline: the footprint stays as an
                        invisible hit area (transparent is a paint, so the gaps between the fronds
                        still take the click) and only draws its outline to show it is selected. */}
                    <PlantGlyph species={plantSpecies(f)} w={f.widthMm} d={f.depthMm} id={f.id} color={f.style?.fill} opacity={f.style?.fillOpacity} />
                    <FootprintShape
                      footprint={featureFootprint(f)}
                      fill="transparent"
                      stroke={selected ? "var(--color-accent)" : "none"}
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      vectorEffect="non-scaling-stroke"
                    />
                  </>
                ) : (
                  <FootprintShape footprint={featureFootprint(f)} {...common} />
                )}
              </g>
              {f.kind !== "plant" && f.kind !== "surface" && <text
                x={f.x}
                y={f.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={selected ? "var(--color-accent-deep)" : "var(--color-muted)"}
                style={{ fontSize: mm(FEATURE_LABEL_PX) }}
                className="pointer-events-none"
              >
                {f.label}
              </text>}

              {/* Resize handles — only on a selected feature, and only once a host is actually
                  listening (see onResize's doc). Sit inside this same rotated group so they turn
                  with the shape for free, exactly like the move handle above. A circle gets one
                  corner handle that scales its diameter evenly about its own centre — there's no
                  separate width/depth to keep proportional, so Shift has nothing to do here. A
                  rect/ellipse gets one handle per edge; holding Shift while dragging any of them
                  resizes the perpendicular dimension by the same ratio, matching the Shift-to-
                  constrain convention every design tool gives its resize handles. */}
              {selected && onResize && (
                f.shape === "circle" ? (
                  // Four handles round the rim, on the diagonals where a designer reaches for a
                  // corner — one lone handle was easy to miss, and was often round the far side.
                  ([[1, 1], [-1, 1], [-1, -1], [1, -1]] as const).map(([sx, sy]) => (
                    <ResizeHandle
                      key={`r${sx}${sy}`}
                      {...resizableRadius(f, onResize, onCommit, clientToMm)}
                      cursor={sx === sy ? "cursor-nwse-resize" : "cursor-nesw-resize"}
                      label={`שינוי גודל של ${f.label} — גרירה`}
                      cx={f.x + (sx * f.widthMm * Math.SQRT1_2) / 2}
                      cy={f.y + (sy * f.widthMm * Math.SQRT1_2) / 2}
                      mm={mm}
                    />
                  ))
                ) : (
                  <>
                    {/* A dashed box ties the corner handles to what they scale. */}
                    <rect
                      x={f.x - f.widthMm / 2}
                      y={f.y - f.depthMm / 2}
                      width={f.widthMm}
                      height={f.depthMm}
                      fill="none"
                      stroke="var(--color-accent)"
                      strokeWidth={1}
                      strokeDasharray="4 3"
                      vectorEffect="non-scaling-stroke"
                      className="pointer-events-none"
                    />
                    {([[1, 1], [-1, 1], [-1, -1], [1, -1]] as const).map(([sx, sy]) => (
                      <ResizeHandle
                        key={`c${sx}${sy}`}
                        {...resizableCorner(f, sx, sy, onResize, onCommit, clientToMm)}
                        cursor={sx === sy ? "cursor-nwse-resize" : "cursor-nesw-resize"}
                        label={`שינוי גודל של ${f.label} — גרירה · Shift לשמירה על יחס הממדים`}
                        cx={f.x + (sx * f.widthMm) / 2}
                        cy={f.y + (sy * f.depthMm) / 2}
                        mm={mm}
                      />
                    ))}
                    {([1, -1] as const).map((sign) => (
                      <ResizeHandle
                        key={`w${sign}`}
                        {...resizable(f, "width", sign, onResize, onCommit, clientToMm)}
                        cursor="cursor-ew-resize"
                        label={`שינוי רוחב של ${f.label} — גרירה · Shift לשמירה על יחס הממדים`}
                        cx={f.x + sign * (f.widthMm / 2)}
                        cy={f.y}
                        mm={mm}
                      />
                    ))}
                    {([1, -1] as const).map((sign) => (
                      <ResizeHandle
                        key={`d${sign}`}
                        {...resizable(f, "depth", sign, onResize, onCommit, clientToMm)}
                        cursor="cursor-ns-resize"
                        label={`שינוי עומק של ${f.label} — גרירה · Shift לשמירה על יחס הממדים`}
                        cx={f.x}
                        cy={f.y + sign * (f.depthMm / 2)}
                        mm={mm}
                      />
                    ))}
                  </>
                )
              )}
            </g>
            {/* OUTSIDE the rotated group, like the stairs above and for the same reason: the handle
                works out its own place from the feature's facing (that is what makes it ride round
                with the shape), so leaving it inside would turn it a second time and it would run
                away from the thing it turns as the angle grew. */}
            {selected && onRotate && clientToMm && (
              <RotateHandle
                pivot={{ x: f.x, y: f.y }}
                reachMm={(f.shape === "circle" ? f.widthMm : f.depthMm) / 2}
                rotationDeg={f.rotationDeg ?? 0}
                onRotate={(deg) => onRotate(f.id, deg)}
                onCommit={onCommit}
                clientToMm={clientToMm}
                mm={mm}
                label={`סיבוב ${f.label} — גרירה · Alt לזווית חופשית`}
              />
            )}
          </g>
        );
      })}
    </>
  );
}

// One resize handle: the square, its hit area and its cursor. The drag props are spread in by the
// caller (resizable/resizableRadius below), which owns all the maths — this only draws.
function ResizeHandle({
  label,
  cursor,
  cx,
  cy,
  mm,
  ...drag
}: ReturnType<typeof resizable> & { label: string; cursor: string; cx: number; cy: number; mm: (px: number) => number }) {
  const size = mm(11);
  // White with an accent ring, the handle every design tool draws: it reads against a dark canopy
  // and a pale floor alike, where a solid violet square vanished into the palms.
  return (
    <g {...drag} tabIndex={0} role="button" aria-label={label} className={`group ${cursor} touch-none`}>
      <circle cx={cx} cy={cy} r={mm(12)} fill="transparent" />
      <rect
        x={cx - size / 2}
        y={cy - size / 2}
        width={size}
        height={size}
        rx={mm(2.5)}
        fill="#ffffff"
        stroke="var(--color-accent)"
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
        className="transition-colors group-hover:fill-accent-tint"
      />
    </g>
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

// Where each live resize-handle drag started, keyed by pointerId — same shape and reasoning as
// featureDrag above, plus the feature's own width:depth ratio at the moment the drag began. Read
// once (on the first move past the threshold) rather than recomputed every move, so the lock is a
// property of *this* gesture and immune to any rounding repeated division could accumulate.
const featureResize = new Map<number, { x: number; y: number; dragging: boolean; ratio: number }>();

// One edge of one feature. `axis`/`sign` pick which edge, same convention as plan-canvas.tsx's own
// resizeEdgeDrag (which this mirrors) — that one lives inside the canvas for its stage/bar fixtures;
// this is the equivalent for a host-drawn layer's features, sharing the same resizeFromEdge maths so
// "drag the opposite edge stays put" behaves identically everywhere on the app's one canvas.
function resizable(
  f: StructureFeature,
  axis: "width" | "depth",
  sign: 1 | -1,
  onResize?: (id: string, patch: { widthMm: number; depthMm: number; x: number; y: number }) => void,
  onCommit?: () => void,
  clientToMm?: (clientX: number, clientY: number) => { x: number; y: number },
) {
  if (!onResize || !clientToMm) return {};
  const end = (e: React.PointerEvent) => {
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (featureResize.get(e.pointerId)?.dragging) onCommit?.();
    featureResize.delete(e.pointerId);
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      featureResize.set(e.pointerId, { x: e.clientX, y: e.clientY, dragging: false, ratio: f.widthMm / f.depthMm });
    },
    onPointerMove: (e: React.PointerEvent) => {
      const origin = featureResize.get(e.pointerId);
      if (!origin || e.buttons !== 1) return;
      if (!origin.dragging) {
        if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < 4) return;
        origin.dragging = true;
      }
      const { sizeMm, center } = resizeFromEdge(f, axis, sign, clientToMm(e.clientX, e.clientY), MIN_FEATURE_MM);
      let widthMm = f.widthMm;
      let depthMm = f.depthMm;
      if (axis === "width") widthMm = sizeMm; else depthMm = sizeMm;
      // Shift locks proportions: the perpendicular dimension follows the dragged one by the ratio
      // captured at drag-start. Its own centre coordinate is untouched, which is enough to keep it
      // centred — a feature is stored as centre+size, so growing depthMm without moving y already
      // expands it evenly on both sides for free.
      if (e.shiftKey) {
        const other = Math.max(MIN_FEATURE_MM, Math.round(axis === "width" ? sizeMm / origin.ratio : sizeMm * origin.ratio));
        if (axis === "width") depthMm = other; else widthMm = other;
      }
      onResize(f.id, { widthMm, depthMm, x: center.x, y: center.y });
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
}

// One corner of one feature — both measurements at once, the way every design tool scales a box.
// The OPPOSITE corner stays put (in the feature's own turned frame), so dragging a hedge's end out
// grows it away from the corner it was already lined up against. Shift keeps the proportions, which
// on a plant is the difference between a bigger palm and an oval one.
function resizableCorner(
  f: StructureFeature,
  sx: 1 | -1,
  sy: 1 | -1,
  onResize?: (id: string, patch: { widthMm: number; depthMm: number; x: number; y: number }) => void,
  onCommit?: () => void,
  clientToMm?: (clientX: number, clientY: number) => { x: number; y: number },
) {
  if (!onResize || !clientToMm) return {};
  const end = (e: React.PointerEvent) => {
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (featureResize.get(e.pointerId)?.dragging) onCommit?.();
    featureResize.delete(e.pointerId);
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      featureResize.set(e.pointerId, { x: e.clientX, y: e.clientY, dragging: false, ratio: f.widthMm / f.depthMm });
    },
    onPointerMove: (e: React.PointerEvent) => {
      const origin = featureResize.get(e.pointerId);
      if (!origin || e.buttons !== 1) return;
      if (!origin.dragging) {
        if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < 4) return;
        origin.dragging = true;
      }
      const rot = f.rotationDeg ?? 0;
      const centre = { x: f.x, y: f.y };
      const p = toLocalFrame(clientToMm(e.clientX, e.clientY), centre, rot);
      const anchor = { x: (-sx * f.widthMm) / 2, y: (-sy * f.depthMm) / 2 };
      let widthMm = Math.max(MIN_FEATURE_MM, Math.round(sx * (p.x - anchor.x)));
      let depthMm = Math.max(MIN_FEATURE_MM, Math.round(sy * (p.y - anchor.y)));
      if (e.shiftKey) {
        // The larger of the two stretches wins, so the corner still tracks the pointer on one axis.
        if (widthMm / origin.ratio > depthMm) depthMm = Math.max(MIN_FEATURE_MM, Math.round(widthMm / origin.ratio));
        else widthMm = Math.max(MIN_FEATURE_MM, Math.round(depthMm * origin.ratio));
      }
      const c = fromLocalFrame({ x: anchor.x + (sx * widthMm) / 2, y: anchor.y + (sy * depthMm) / 2 }, centre, rot);
      onResize(f.id, { widthMm, depthMm, x: Math.round(c.x), y: Math.round(c.y) });
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
}

// A circle's handle is a radius, not an edge: it stays centre-anchored so a round pool/table grows
// evenly about the spot it was placed on instead of walking sideways as it's resized.
function resizableRadius(
  f: StructureFeature,
  onResize?: (id: string, patch: { widthMm: number; depthMm: number; x: number; y: number }) => void,
  onCommit?: () => void,
  clientToMm?: (clientX: number, clientY: number) => { x: number; y: number },
) {
  if (!onResize || !clientToMm) return {};
  const end = (e: React.PointerEvent) => {
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (featureResize.get(e.pointerId)?.dragging) onCommit?.();
    featureResize.delete(e.pointerId);
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      featureResize.set(e.pointerId, { x: e.clientX, y: e.clientY, dragging: false, ratio: 1 });
    },
    onPointerMove: (e: React.PointerEvent) => {
      const origin = featureResize.get(e.pointerId);
      if (!origin || e.buttons !== 1) return;
      if (!origin.dragging) {
        if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < 4) return;
        origin.dragging = true;
      }
      const p = clientToMm(e.clientX, e.clientY);
      const d = Math.max(MIN_FEATURE_MM, Math.round(Math.hypot(p.x - f.x, p.y - f.y) * 2));
      onResize(f.id, { widthMm: d, depthMm: d, x: f.x, y: f.y });
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
}

// Which side of a wall reads as "inward" for a door hung on it — the centroid of whichever
// enclosed face that wall directly borders (its two nodes appear adjacent in the face's own
// cycle), the graph-structure counterpart to the outline system's one whole-shape centroid: this
// plan can have several rooms, so there is no single interior to point at. A wall with no face on
// either side (open to nothing yet) has no interior to reference at all, so it falls back to an
// arbitrary but consistent perpendicular offset — doorGeometry only reads the SIGN of which side
// that point is on, and a door hung on an open wall has no "correct" side for that to disagree with.
function wallInteriorHint(faces: Face[], a: Point, b: Point, aId: string, bId: string): Point {
  for (const f of faces) {
    const n = f.nodeIds.length;
    for (let i = 0; i < n; i++) {
      const x = f.nodeIds[i];
      const y = f.nodeIds[(i + 1) % n];
      if ((x === aId && y === bId) || (x === bId && y === aId)) return polygonCentroid(f.boundary);
    }
  }
  return { x: (a.x + b.x) / 2 - (b.y - a.y), y: (a.y + b.y) / 2 + (b.x - a.x) };
}

/** Door openings: the gap is painted over the wall the canvas already stroked so it reads as a
 *  hole (unconditional, purely visual), and — when a wall lookup is available — the actual door
 *  leaf(es) + swing arc on top of it (EntranceDoor, shared with the outline system's own doors;
 *  see plan-canvas.tsx), draggable along the wall when `onMove` is supplied. Drawn as part of the
 *  overlay layer that sits *above* the walls. */
export function StructureDoors({
  structure,
  selectedIds,
  onSelect,
  onMove,
  onCommit,
  clientToMm,
  mm,
}: {
  structure: VenueStructure;
  selectedIds?: string[];
  onSelect?: (id: string, additive: boolean) => void;
  /** Absent = the door leaf/arc still shows, but has no drag handle (mid-draw, or any mode that
   *  doesn't edit the built plan) — same "supplying it is what turns the affordance on" rule as
   *  every other draggable layer here (see StructureFeatures). */
  onMove?: (id: string, distanceMm: number) => void;
  onCommit?: () => void;
  clientToMm?: (clientX: number, clientY: number) => Point;
  mm?: (px: number) => number;
}) {
  const nodes = nodeMap(structure);
  const faces = detectFaces(structure);
  return (
    <>
      {structure.entrances.map((e) => {
        const w = structure.walls.find((x) => x.id === e.wallId);
        const pts = w ? wallPoints(structure, w, nodes) : null;
        if (!w || !pts) return null;
        const selected = selectedIds?.includes(e.id) ?? false;
        // The gap is cut along the wall as drawn, bow and all — a straight strike across a curved
        // wall would leave the opening floating beside the wall it is supposed to be a hole in.
        // The t-range is the door's chord distance over the chord length, the same approximation
        // the door's placement already uses (see geometry.ts's note on doors and curves).
        const len = wallLengthMm(pts.a, pts.b) || 1;
        const half = e.widthMm / 2;
        const t0 = Math.max(0, (e.distanceMm - half) / len);
        const t1 = Math.min(1, (e.distanceMm + half) / len);
        const d = wallSegmentD(pts.a, pts.b, w.curve ?? null, t0, t1);
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
            {clientToMm && mm && (
              <EntranceDoor
                entrance={e}
                a={pts.a}
                b={pts.b}
                curve={w.curve ?? null}
                interiorHint={wallInteriorHint(faces, pts.a, pts.b, w.a, w.b)}
                selected={selected}
                // Click phase only — pick() (halls-screen.tsx) toggles a solo selection off on a
                // repeat click, unlike the outline system's plain onSelect(ref) that EntranceDoor
                // was built for; also firing on the press phase would select-then-instantly-
                // deselect an already-selected door on a plain re-click. StructureFeatures' own
                // onSelect (above) makes the same call by using a plain onClick in the first place.
                onSelect={(mods) => mods.phase === "click" && onSelect?.(e.id, mods.shift)}
                onMove={(p) => onMove?.(e.id, projectOntoWall(pts.a, pts.b, p))}
                onCommit={onCommit}
                clientToMm={clientToMm}
                mm={mm}
              />
            )}
          </g>
        );
      })}
    </>
  );
}
