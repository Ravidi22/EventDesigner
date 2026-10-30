"use client";

import { doorGeometry, fromLocalFrame, outlinePathD, polygonAreaMm2, polygonCentroid, projectOntoWall, resizeFromEdge, toLocalFrame, wallLengthMm, wallSegmentD } from "@/lib/studio/geometry";
import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { startPointerGesture } from "@/lib/studio/gesture";
import { isDark, resolveStyle } from "@/lib/element-style";
import { usesDiameter } from "@/lib/catalog/types";
import { isAdditiveClick } from "@/lib/keyboard";
import { featureFootprint, isWindow, nodeMap, plantSpecies, surfaceMaterial, wallPoints, type StructureFeature, type VenueStructure, featureEdgeItems, featurePlacement } from "@/lib/venues/structure";
import { DrapePleats, ItemSymbol } from "@/components/item-symbol";
import { CURTAIN_FILL, curtainPieces, type CurtainPiece } from "@/lib/venues/curtain";
import { WindowGlazing } from "@/components/window-glazing";
import { FootprintShape } from "@/components/footprint-shape";
import { PlantGlyph } from "@/components/plant-glyph";
import { SurfaceFill, ZoneSurface } from "@/components/surface-fill";
import { ClimbGlyph } from "@/components/climb-glyph";
import { SeatingGlyph } from "@/components/chair-block";
import { ColumnGlyph } from "@/components/column-glyph";
import { seatingOf } from "@/lib/venues/seating";
import { EdgeItemHandles, EdgeItemsDrawing, EdgePickLines, stageGaps, stagePickLines } from "@/components/stage-edge-handles";
import { NO_DECKS, edgesMatter, takesEdgeItems } from "@/lib/venues/stage-edges";
import { followsWalls } from "@/lib/venues/face-surfaces";
import type { StageEdgeKind, StageStair } from "@/lib/design-document/types";
import type { WallDistance } from "@/lib/design-document/stage";
import { isClimb } from "@/lib/venues/climb";
import { detectFaces, wallInteriorHint } from "@/lib/venues/faces";
import { clampOpacity, spanMm, underlayCentre } from "@/lib/venues/underlay";
import type { PlanUnderlay } from "@/lib/venues/types";
import { ZONE_KIND_LABEL, type ResolvedZone } from "@/lib/venues/zone";
import type { EdgeCurve, Point } from "@/lib/studio/hall";
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
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      const origin = { x: e.clientX, y: e.clientY, ux: u.x, uy: u.y };
      startPointerGesture(e, {
        onMove: (ev) => {
          const from = clientToMm(origin.x, origin.y);
          const to = clientToMm(ev.clientX, ev.clientY);
          onMove({ x: Math.round(origin.ux + to.x - from.x), y: Math.round(origin.uy + to.y - from.y) });
        },
        onEnd: (_ev, moved) => {
          if (moved) onCommit?.();
        },
      });
    },
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

/** Tinted, labelled zone regions. Drawn under the walls. Memoised: the studio hands it identity-
 *  stable lists and the canvas's per-zoom `mm`, so a frame that only moved a table draws no zone. */
export const ZoneRegions = memo(function ZoneRegions({
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

          // A zone laid in a material (Zone.surface) is that material, wall to wall; the tint the
          // designer picked colours it rather than being painted over it. Selected, a light wash on
          // top says so, as on any zone.
          const surface = r.zone.surface;
          return (
            <g
              key={r.zone.id}
              onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(r.zone.id, isAdditiveClick(e)); } : undefined}
              className={onSelect ? "cursor-pointer" : undefined}
            >
              {surface && <ZoneSurface boundary={r.boundary} material={surface} id={r.zone.id} color={hexOf(r.zone.style?.fill)} />}
              <path
                d={outlinePathD(r.boundary)}
                fill={surface ? (selected ? "var(--color-accent-wash)" : "transparent") : style.fill}
                fillOpacity={surface ? (selected ? 0.35 : 1) : style.fillOpacity}
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
                {...halo(mm(3))}
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
                  {...halo(mm(2.5))}
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
});

const hexOf = (c?: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : undefined);

/** A zone's name stands on whatever its floor is — and a hall laid in "אריחים" is near black, where
 *  ink letters disappeared (both of אמרה's halls, 2026-10-17). A canvas-coloured outline painted
 *  under the letters keeps them readable on any floor, and is invisible on a pale tint. */
const halo = (w: number) => ({ stroke: "var(--color-canvas)", strokeWidth: w, strokeLinejoin: "round" as const, paintOrder: "stroke" as const });

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
  // One gesture per press (lib/studio/gesture.ts): its origin lives in the press's own closure, so
  // the host re-rendering and rebuilding these handlers mid-drag changes nothing.
  const drag = (index: number | null, edge: number | null) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const at = index ?? edge!;
      const d = {
        // A mid-edge handle has no corner yet: -1 until the drag actually starts, so a plain click
        // on it adds nothing.
        index: index ?? -1 - at,
        x: e.clientX,
        y: e.clientY,
        from: index !== null ? boundary[index] : clientToMm(e.clientX, e.clientY),
      };
      startPointerGesture(e, {
        onStart: () => {
          if (d.index < 0) d.index = onInsertPoint(-1 - d.index);
        },
        onMove: (ev) => {
          const start = clientToMm(d.x, d.y);
          const now = clientToMm(ev.clientX, ev.clientY);
          onMovePoint(d.index, { x: d.from.x + now.x - start.x, y: d.from.y + now.y - start.y });
        },
        onEnd: (_ev, moved) => {
          if (moved) onCommit();
        },
      });
    },
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
  onSelect: onSelectAny,
  onMove: onMoveAny,
  onResize,
  onRotate,
  activeEdgeItem,
  onSelectEdgeItem,
  onEdgeItemChange,
  edgePick,
  onPickEdge,
  wallDistance,
  onCommit,
  clientToMm,
  onContextMenu: onContextMenuAny,
  onCurtainEnd,
  interactive,
}: {
  structure: VenueStructure;
  /** One end of a curtain slid along its wall. Same opt-in rule as onResize: absent = no end grips. */
  onCurtainEnd?: (id: string, end: "from" | "to", p: { x: number; y: number }) => void;
  mm: (px: number) => number;
  selectedIds?: string[];
  onSelect?: (id: string, additive: boolean) => void;
  /** Absent = features are fixed in place for this mode (drawing walls, naming zones). */
  onMove?: (id: string, p: { x: number; y: number }, free?: boolean) => void;
  /** Dragging a resize handle. Absent = a selected feature shows no handles at all (mid-draw, or
   *  any mode that doesn't edit the built plan) — same "supplying it is what turns the affordance
   *  on" rule as onMove. */
  onResize?: (id: string, patch: { widthMm: number; depthMm: number; x: number; y: number }) => void;
  /** Dragging the rotate knob. Same opt-in rule as the three above: a host that does not supply it
   *  gets a selected feature with no knob on it, which is what /halls' draw mode and every
   *  read-only surface want. A bar built across the corner of a room is at 30° and there was no way
   *  to put it there but to type the number into the side panel. */
  onRotate?: (id: string, rotationDeg: number) => void;
  /** THE STAGE'S EDGES — the sketch's own stairs and ramps (components/stage-edge-handles.tsx,
   *  lib/venues/stage-edges.ts). The active item on a selected stage, and the host's handlers for
   *  picking one, sliding or resizing it (`from` = the items as they stood when the press began),
   *  and clicking a new one onto a side while `edgePick` names the stage and the kind. */
  activeEdgeItem?: { featureId: string; itemId: string } | null;
  onSelectEdgeItem?: (featureId: string, itemId: string | null) => void;
  onEdgeItemChange?: (featureId: string, item: StageStair, from?: StageStair[]) => void;
  edgePick?: { featureId: string; kind: StageEdgeKind } | null;
  onPickEdge?: (featureId: string, edge: number, t: number) => void;
  /** How far a point is from the nearest wall — what shows a stage's bare edges honestly. */
  wallDistance?: WallDistance;
  onCommit?: () => void;
  clientToMm?: (clientX: number, clientY: number) => { x: number; y: number };
  /** A right-click landed on this feature. Reported, not handled: the event still bubbles on to the
   *  canvas, whose own right-click menu the host fills in knowing which feature it was over. */
  onContextMenu?: (id: string) => void;
  /** Which features take the pointer at all. Absent = every one (the hall editor). The studio passes
   *  featureMovable: a feature an event may not move is drawn as part of the room and lets clicks and
   *  rubber-bands through, like a wall. */
  interactive?: (f: StructureFeature) => boolean;
}) {
  // ONE memoised node per feature, handed callbacks that never change identity. The canvas
  // re-renders its layers on every frame of a pan or a zoom, and a venue like a landscaped
  // courtyard is hundreds of features (500+ in one, 125 of them plants) — re-running every one of
  // them per frame was ~600 component calls and ~2,600 elements diffed for a view that only moved.
  // Now a pan re-renders none of them and a zoom only the few that wear a label or are selected.
  // The callbacks are read through a ref so a node that skipped a render still calls the host's
  // CURRENT handler; whether each is supplied at all (which switches affordances on) is passed as
  // the presence of the stable wrapper, so it still re-renders when that changes.
  const handlers = { onSelect: onSelectAny, onMove: onMoveAny, onResize, onRotate, onCommit, clientToMm, onContextMenu: onContextMenuAny, onCurtainEnd };
  const live = useRef(handlers);
  useLayoutEffect(() => {
    live.current = handlers;
  });
  const stable = useMemo<FeatureHandlers>(
    () => ({
      onSelect: (id, additive) => live.current.onSelect?.(id, additive),
      onMove: (id, p, free) => live.current.onMove?.(id, p, free),
      onResize: (id, patch) => live.current.onResize?.(id, patch),
      onRotate: (id, deg) => live.current.onRotate?.(id, deg),
      onCommit: () => live.current.onCommit?.(),
      clientToMm: (x, y) => live.current.clientToMm?.(x, y) ?? { x: 0, y: 0 },
      onContextMenu: (id) => live.current.onContextMenu?.(id),
      onCurtainEnd: (id, end, p) => live.current.onCurtainEnd?.(id, end, p),
    }),
    [],
  );
  const labelPx = mm(FEATURE_LABEL_PX);
  // Every curtain in the pieces its wall's doors leave it — once per structure, not per frame.
  const piecesOf = useMemo(() => {
    const m = new Map<string, CurtainPiece[]>();
    for (const f of structure.features) if (f.kind === "curtain") m.set(f.id, curtainPieces(structure, f));
    return m;
  }, [structure]);
  // The one selected stage whose edge items take the pointer (its grips are drawn after every
  // feature, so no neighbour covers them), and the stage whose sides are lit for a new item.
  const edging = selectedIds?.length === 1 && onEdgeItemChange && onSelectEdgeItem && clientToMm ? structure.features.find((f) => f.id === selectedIds[0] && !f.locked && takesEdgeItems(f)) : undefined;
  const edgingP = edging && featureEdgeItems(edging).length > 0 ? featurePlacement(edging) : null;
  const picking = edgePick && onPickEdge && clientToMm ? structure.features.find((f) => f.id === edgePick.featureId) : undefined;
  return (
    <>
      {groundFirst(structure.features).map((f) => {
        const live = !interactive || interactive(f);
        const onSelect = live ? onSelectAny : undefined;
        const onMove = live ? onMoveAny : undefined;
        const onContextMenu = live ? onContextMenuAny : undefined;
        const selected = selectedIds?.includes(f.id) ?? false;
        return (
          <FeatureNode
            key={f.id}
            f={f}
            selected={selected}
            labelPx={wantsLabel(f) ? labelPx : undefined}
            mm={selected ? mm : undefined}
            onSelect={onSelect && stable.onSelect}
            onMove={onMove && stable.onMove}
            onResize={onResize && stable.onResize}
            onRotate={onRotate && stable.onRotate}
            onCurtainEnd={onCurtainEnd && stable.onCurtainEnd}
            pieces={piecesOf.get(f.id)}
            activeEdgeItem={activeEdgeItem?.featureId === f.id ? activeEdgeItem.itemId : null}
            wallDistance={selected ? wallDistance : undefined}
            onCommit={onCommit && stable.onCommit}
            clientToMm={clientToMm && stable.clientToMm}
            onContextMenu={onContextMenu && stable.onContextMenu}
          />
        );
      })}
      {edging && edgingP && onEdgeItemChange && onSelectEdgeItem && clientToMm && (
        <EdgeItemHandles
          p={edgingP}
          deckOf={NO_DECKS}
          clientToMm={clientToMm}
          mm={mm}
          active={activeEdgeItem?.featureId === edging.id ? activeEdgeItem.itemId : null}
          onSelect={(itemId) => onSelectEdgeItem(edging.id, itemId)}
          onChange={(item, from) => onEdgeItemChange(edging.id, item, from)}
          onEnd={() => onCommit?.()}
        />
      )}
      {picking && edgePick && onPickEdge && clientToMm && (
        <EdgePickLines
          lines={stagePickLines(featurePlacement(picking))}
          clientToMm={clientToMm}
          onPick={(_level, edge, t) => onPickEdge(picking.id, edge, t)}
          title={edgePick.kind === "ramp" ? "להציב כאן רמפה" : "להציב כאן מדרגות"}
        />
      )}
    </>
  );
}

/** The rotate knob of every selected, unlocked feature — for a host that paints it in PlanCanvas's
 *  `topmost` layer, above the walls' hit lines, their lengths and every other figure (the hall
 *  editor; a knob near a wall used to sit under that wall and its length label). A host that uses
 *  this passes no `onRotate` to StructureFeatures, so each knob is drawn once. */
export function FeatureRotateHandles({
  structure,
  selectedIds,
  onRotate,
  onCommit,
  clientToMm,
  mm,
}: {
  structure: VenueStructure;
  selectedIds: string[];
  onRotate: (id: string, rotationDeg: number) => void;
  onCommit?: () => void;
  clientToMm: (clientX: number, clientY: number) => { x: number; y: number };
  mm: (px: number) => number;
}) {
  return (
    <>
      {structure.features
        .filter((f) => selectedIds.includes(f.id) && !f.locked && !followsWalls(f))
        .map((f) => (
          <RotateHandle
            key={f.id}
            pivot={{ x: f.x, y: f.y }}
            reachMm={(usesDiameter(f.shape) ? f.widthMm : f.depthMm) / 2}
            rotationDeg={f.rotationDeg ?? 0}
            onRotate={(deg) => onRotate(f.id, deg)}
            onCommit={onCommit}
            clientToMm={clientToMm}
            mm={mm}
            label={`סיבוב ${f.label} — גרירה · Alt לזווית חופשית`}
          />
        ))}
    </>
  );
}

/** Whether a feature writes anything sized by the zoom: its name — except a plant, a surface and a
 *  flight of stairs, which are their drawings — or a ramp's slope (its own, or a ramp on its edge),
 *  which it writes whatever its name. */
function wantsLabel(f: StructureFeature): boolean {
  if (f.kind === "ramp") return true;
  if (featureEdgeItems(f).some((it) => it.kind === "ramp")) return true;
  return f.kind !== "plant" && f.kind !== "surface" && f.kind !== "stairs" && !!f.label;
}

type FeatureHandlers = {
  onSelect?: (id: string, additive: boolean) => void;
  onMove?: (id: string, p: { x: number; y: number }, free?: boolean) => void;
  onResize?: (id: string, patch: { widthMm: number; depthMm: number; x: number; y: number }) => void;
  onRotate?: (id: string, rotationDeg: number) => void;
  /** One end of a curtain dragged along its wall (lib/venues/curtain.ts curtainEndT). */
  onCurtainEnd?: (id: string, end: "from" | "to", p: { x: number; y: number }) => void;
  onCommit?: () => void;
  clientToMm?: (clientX: number, clientY: number) => { x: number; y: number };
  onContextMenu?: (id: string) => void;
};

const unscaled = (px: number) => px;

/** One fixed feature. Memoised on plain props — see StructureFeatures. `mm` is supplied only to a
 *  selected feature (its handles are the only thing sized by the live zoom besides the label, which
 *  comes in as `labelPx`), so an unselected, unlabelled feature compares equal across a zoom. */
const FeatureNode = memo(function FeatureNode({
  f,
  selected,
  labelPx,
  mm = unscaled,
  onSelect,
  onMove: onMoveProp,
  onResize: onResizeProp,
  onRotate: onRotateProp,
  onCurtainEnd,
  pieces,
  activeEdgeItem,
  wallDistance,
  onCommit,
  clientToMm,
  onContextMenu,
}: FeatureHandlers & { f: StructureFeature; selected: boolean; labelPx?: number; mm?: (px: number) => number; activeEdgeItem?: string | null; wallDistance?: WallDistance; pieces?: CurtainPiece[] }) {
        // A locked feature (StructureFeature.locked) keeps its click and its right-click — that is how
        // it gets unlocked — and loses every gesture that would change it. The GROUND does one more
        // thing: a surface moves only once it is already selected. It is the biggest thing on the
        // plan and under everything else, so a press that missed a table by a pixel used to pick up
        // the whole lawn; now that press selects it, and the next one moves it.
        // A surface laid wall to wall in a closed shape (lib/venues/face-surfaces.ts) is the walls'
        // shape: it follows them, and has no drag, size or turn of its own.
        // A curtain hangs on its wall (lib/venues/curtain.ts): its stretch is typed in the bar,
        // never dragged, and a sketch takes it down rather than moving it.
        const pinned = !!f.locked || followsWalls(f) || f.kind === "curtain";
        const onMove = pinned || (f.kind === "surface" && !selected) ? undefined : onMoveProp;
        // Chairs in rows are resized by their rows (the bar's "שורות"), never by a handle that
        // would stretch the box away from the chairs in it (lib/venues/seating.ts).
        const onResize = pinned || f.kind === "seating" ? undefined : onResizeProp;
        const onRotate = pinned ? undefined : onRotateProp;
        // The stage's edges (its flights and ramps), as the sketch draws a stage's: in the feature's
        // own frame, inside its turned group — null for anything with none. A selected STAGE with no
        // flights at all still draws its bare edges in red: the bar says they are marked on the plan,
        // and with no items there was nothing drawing them.
        const edgeItems = featureEdgeItems(f);
        const stageP = edgeItems.length > 0 || (selected && edgesMatter(f)) ? featurePlacement(f) : null;
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
        const drag = draggable(f, onMove, onCommit, clientToMm, selected, onSelect);
        return (
          <g key={f.id}>
            <g
              transform={f.rotationDeg ? `rotate(${f.rotationDeg} ${f.x} ${f.y})` : undefined}
              {...drag}
              onClick={onSelect ? (e) => { e.stopPropagation(); if (pressSelected.delete(f.id)) return; onSelect(f.id, isAdditiveClick(e)); } : undefined}
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
                ) : f.kind === "pool" ? (
                  <>
                    {/* Water, at real scale (components/surface-fill.tsx) — the pool used to be a
                        white outline with its name in it, next to a lawn drawn blade by blade. The
                        designer's own fill tints the water; the outline on top is the coping, in the
                        feature's own stroke, so a selected pool still lights up like the others. */}
                    <SurfaceFill
                      material="water"
                      footprint={featureFootprint(f)}
                      w={f.widthMm}
                      d={f.depthMm}
                      id={f.id}
                      color={f.style?.fill}
                      opacity={f.style?.fillOpacity}
                    />
                    <FootprintShape footprint={featureFootprint(f)} {...common} fill="none" />
                  </>
                ) : f.kind === "seating" ? (
                  <>
                    {/* The venue's own chairs in rows: the chairs are the picture, the block's box
                        an invisible hit area (the gaps between chairs still take the click),
                        outlined only when selected — as a plant is. */}
                    <SeatingGlyph spec={seatingOf(f)} tone={f.style?.fill} />
                    <FootprintShape
                      footprint={featureFootprint(f)}
                      fill="transparent"
                      stroke={selected ? "var(--color-accent)" : "none"}
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      vectorEffect="non-scaling-stroke"
                    />
                  </>
                ) : f.kind === "curtain" ? (
                  // The band in its cloth, pleated along it — the sketch's own drape drawing — in
                  // the pieces its doors leave it (lib/venues/curtain.ts curtainPieces); selected,
                  // its whole stretch is outlined so the bare doorway still reads as part of it.
                  <>
                    {(pieces ?? [{ dx: 0, widthMm: f.widthMm, t0: 0, t1: 1 }]).map((pc, i) => (
                      <g key={i} transform={`translate(${pc.dx} 0)`}>
                        <rect x={-pc.widthMm / 2} y={-f.depthMm / 2} width={pc.widthMm} height={f.depthMm} fill={f.style?.fill ?? CURTAIN_FILL} fillOpacity={f.style?.fillOpacity} />
                        <DrapePleats lengthMm={pc.widthMm} depthMm={f.depthMm} ink={isDark(f.style?.fill ?? CURTAIN_FILL) ? "#ffffff" : "var(--color-ink)"} opacity={isDark(f.style?.fill ?? CURTAIN_FILL) ? 0.45 : 0.35} />
                      </g>
                    ))}
                    <FootprintShape footprint={featureFootprint(f)} fill="transparent" stroke={selected ? "var(--color-accent)" : "none"} strokeWidth={selected ? 2 : 0} strokeDasharray={selected ? "4 3" : undefined} vectorEffect="non-scaling-stroke" />
                  </>
                ) : f.kind === "fountain" ? (
                  // A fountain: the catalog's own picture (components/item-symbol.tsx) — the basin
                  // in the pool's water, the bowl and the spout — tinted by the feature's fill, with
                  // the same dashed selection outline a plant gets and no name.
                  <>
                    <ItemSymbol kind="fountain" footprint={featureFootprint(f)} count={1} tone={f.style?.fill} ink={selected ? "var(--color-accent)" : undefined} />
                    {selected && <FootprintShape footprint={featureFootprint(f)} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
                  </>
                ) : f.kind === "column" ? (
                  // A column: its plinth, base ring and shaft (lib/venues/column.ts) — drawn solid,
                  // not in the dashed line a feature's outline rests in, and with no name: the
                  // drawing says what it is, and a colonnade of 24 named "עמוד" is a grey smudge.
                  <ColumnGlyph
                    f={f}
                    fill={common.fill}
                    fillOpacity={common.fillOpacity}
                    stroke={common.stroke}
                    strokeWidth={common.strokeWidth}
                    dash={f.style?.dash ? common.strokeDasharray : undefined}
                  />
                ) : isClimb(f.kind) ? (
                  // Stairs or a ramp: the step edges and the walking line say what it is, so it
                  // carries no name — only a ramp's slope. The same tread-coloured well and muted
                  // edge as a stage's own flight above, so a step reads as a step wherever it is.
                  <ClimbGlyph
                    f={f}
                    turnDeg={f.rotationDeg}
                    fill={selected ? "var(--color-accent-wash)" : (f.style?.fill ?? "var(--color-inset)")}
                    stroke={selected ? "var(--color-accent)" : (f.style?.stroke ?? "var(--color-muted)")}
                    strokeWidth={selected ? 2.5 : 1.25}
                    lineWidth={1}
                    ink={selected ? "var(--color-accent)" : "var(--color-ink-soft)"}
                    textSize={labelPx}
                    textFill="var(--color-ink-soft)"
                    alertFill="var(--color-alert-ink)"
                  />
                ) : (
                  <FootprintShape footprint={featureFootprint(f)} {...common} />
                )}
                {stageP && (
                  <EdgeItemsDrawing
                    stage={stageP.stage}
                    deckOf={NO_DECKS}
                    rotation={f.rotationDeg ?? 0}
                    labelMm={labelPx}
                    activeItem={activeEdgeItem}
                    gaps={selected && wallDistance && edgesMatter(f) ? stageGaps(stageP, NO_DECKS, wallDistance) : undefined}
                  />
                )}
              </g>
              {/* The padlock on a locked feature, once it is selected and someone is looking for
                  the handles that are not there. Drawn, not an icon component: this is inside the
                  plan's SVG, sized by the zoom like a handle. */}
              {selected && f.locked && mm !== unscaled && (
                <g className="pointer-events-none" transform={`translate(${f.x} ${f.y - (usesDiameter(f.shape) ? f.widthMm : f.depthMm) / 2 - mm(16)})`}>
                  <circle r={mm(11)} fill="#ffffff" stroke="var(--color-accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  <rect x={-mm(4.5)} y={-mm(1)} width={mm(9)} height={mm(6.5)} rx={mm(1.2)} fill="var(--color-accent)" />
                  <path d={`M ${-mm(2.8)} ${-mm(1)} v ${-mm(1.6)} a ${mm(2.8)} ${mm(2.8)} 0 0 1 ${mm(5.6)} 0 v ${mm(1.6)}`} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                </g>
              )}
              {f.kind !== "plant" && f.kind !== "surface" && f.kind !== "seating" && f.kind !== "column" && f.kind !== "fountain" && f.kind !== "curtain" && !isClimb(f.kind) && <text
                x={f.x}
                y={f.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={selected ? "var(--color-accent-deep)" : "var(--color-muted)"}
                style={{ fontSize: labelPx }}
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
              {/* A curtain's two ends, slid along its wall — the sketch's own drape ends. In the
                  feature's frame: −x is the wall's node a (`from`), +x node b (`to`). */}
              {selected && onCurtainEnd && f.kind === "curtain" && clientToMm && (
                <g transform={`translate(${f.x} ${f.y}) rotate(${f.rotationDeg ?? 0})`}>
                  {(["from", "to"] as const).map((end) => (
                    <ResizeHandle
                      key={end}
                      label={end === "from" ? "קצה הווילון — גרירה לאורך הקיר" : "קצה הווילון השני — גרירה לאורך הקיר"}
                      cursor="cursor-ew-resize"
                      cx={(end === "from" ? -1 : 1) * (f.widthMm / 2 + mm(6))}
                      cy={0}
                      mm={mm}
                      {...curtainEndDrag(f, end, onCurtainEnd, onCommit, clientToMm)}
                    />
                  ))}
                </g>
              )}
              {selected && onResize && f.kind !== "curtain" && (
                usesDiameter(f.shape) ? (
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
                    <ResizeHandle
                      {...resizableRadius(f, onResize, onCommit, clientToMm)}
                      cursor="cursor-nesw-resize"
                      label={`שינוי קוטר של ${f.label} — גרירה`}
                      cx={f.x + f.widthMm / 2}
                      cy={f.y}
                      mm={mm}
                    />
                  )
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
                reachMm={(usesDiameter(f.shape) ? f.widthMm : f.depthMm) / 2}
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
});

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

// Every drag on this layer is one gesture from lib/studio/gesture.ts: the press keeps its own origin
// and drives the move from window listeners, so the host re-rendering (and rebuilding these
// handlers) mid-drag, or reordering the node, changes nothing. Same 4px threshold everywhere, so a
// click still can't nudge. A feature drags this way rather than through PlanCanvas's dragHandlers:
// that helper carries the canvas's whole selection protocol, which a host-drawn layer has no
// business in.
// The PRESS selects, as it does in the sketch — so a drag on an unselected feature moves that one
// feature alone, and the designer sees what they have hold of before it moves. The click that
// follows a plain press is then told to stand down (it would read the press's own selection as
// "click the one selected thing" and clear it); the click after a real drag is swallowed by the
// gesture itself, so the flag is dropped at the end of a drag too.
const pressSelected = new Set<string>();

function draggable(
  f: StructureFeature,
  onMove?: (id: string, p: { x: number; y: number }, free?: boolean) => void,
  onCommit?: () => void,
  clientToMm?: (clientX: number, clientY: number) => { x: number; y: number },
  selected = false,
  onSelect?: (id: string, additive: boolean) => void,
) {
  if (!onMove || !clientToMm) return {};
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      if (onSelect && !selected && !isAdditiveClick(e)) {
        onSelect(f.id, false);
        pressSelected.add(f.id);
      }
      const origin = { x: e.clientX, y: e.clientY, fx: f.x, fy: f.y };
      startPointerGesture(e, {
        onMove: (ev) => {
          const from = clientToMm(origin.x, origin.y);
          const to = clientToMm(ev.clientX, ev.clientY);
          // Alt frees the drag of every pull the host would otherwise give it (the sketch's rule).
          onMove(f.id, { x: Math.round(origin.fx + to.x - from.x), y: Math.round(origin.fy + to.y - from.y) }, ev.altKey);
        },
        onEnd: (_ev, moved) => {
          if (moved) {
            onCommit?.();
            pressSelected.delete(f.id);
          }
        },
      });
    },
  };
}

// One edge of one feature. `axis`/`sign` pick which edge, same convention as plan-canvas.tsx's own
// resizeEdgeDrag (which this mirrors) — that one lives inside the canvas for its stage/bar fixtures;
// this is the equivalent for a host-drawn layer's features, sharing the same resizeFromEdge maths so
// "drag the opposite edge stays put" behaves identically everywhere on the app's one canvas. The
// feature's width:depth ratio is read once, at the press, so the Shift lock is a property of THIS
// gesture and immune to any rounding repeated division could accumulate.
function resizable(
  f: StructureFeature,
  axis: "width" | "depth",
  sign: 1 | -1,
  onResize?: (id: string, patch: { widthMm: number; depthMm: number; x: number; y: number }) => void,
  onCommit?: () => void,
  clientToMm?: (clientX: number, clientY: number) => { x: number; y: number },
) {
  if (!onResize || !clientToMm) return {};
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      const ratio = f.widthMm / f.depthMm;
      startPointerGesture(e, {
        onMove: (ev) => {
          const { sizeMm, center } = resizeFromEdge(f, axis, sign, clientToMm(ev.clientX, ev.clientY), MIN_FEATURE_MM);
          let widthMm = f.widthMm;
          let depthMm = f.depthMm;
          if (axis === "width") widthMm = sizeMm; else depthMm = sizeMm;
          // Shift locks proportions: the perpendicular dimension follows the dragged one by the ratio
          // captured at drag-start. Its own centre coordinate is untouched, which is enough to keep it
          // centred — a feature is stored as centre+size, so growing depthMm without moving y already
          // expands it evenly on both sides for free.
          if (ev.shiftKey) {
            const other = Math.max(MIN_FEATURE_MM, Math.round(axis === "width" ? sizeMm / ratio : sizeMm * ratio));
            if (axis === "width") depthMm = other; else widthMm = other;
          }
          onResize(f.id, { widthMm, depthMm, x: center.x, y: center.y });
        },
        onEnd: (_ev, moved) => {
          if (moved) onCommit?.();
        },
      });
    },
  };
}

// One corner of one feature — both measurements at once, the way every design tool scales a box.
// The OPPOSITE corner stays put (in the feature's own turned frame), so dragging a hedge's end out
// grows it away from the corner it was already lined up against. Shift keeps the proportions, which
// on a plant is the difference between a bigger palm and an oval one.
/** Dragging one end of a curtain: the point goes to the host, which slides that end to where it
 *  falls along the wall (lib/venues/curtain.ts curtainEndT) — never a resize of the box. */
function curtainEndDrag(
  f: StructureFeature,
  end: "from" | "to",
  onEnd?: (id: string, end: "from" | "to", p: { x: number; y: number }) => void,
  onCommit?: () => void,
  clientToMm?: (clientX: number, clientY: number) => { x: number; y: number },
) {
  if (!onEnd || !clientToMm) return {};
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      startPointerGesture(e, {
        onMove: (ev) => onEnd(f.id, end, clientToMm(ev.clientX, ev.clientY)),
        onEnd: (_ev, moved) => {
          if (moved) onCommit?.();
        },
      });
    },
  };
}

function resizableCorner(
  f: StructureFeature,
  sx: 1 | -1,
  sy: 1 | -1,
  onResize?: (id: string, patch: { widthMm: number; depthMm: number; x: number; y: number }) => void,
  onCommit?: () => void,
  clientToMm?: (clientX: number, clientY: number) => { x: number; y: number },
) {
  if (!onResize || !clientToMm) return {};
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      const ratio = f.widthMm / f.depthMm;
      startPointerGesture(e, {
        onMove: (ev) => {
          const rot = f.rotationDeg ?? 0;
          const centre = { x: f.x, y: f.y };
          const p = toLocalFrame(clientToMm(ev.clientX, ev.clientY), centre, rot);
          const anchor = { x: (-sx * f.widthMm) / 2, y: (-sy * f.depthMm) / 2 };
          let widthMm = Math.max(MIN_FEATURE_MM, Math.round(sx * (p.x - anchor.x)));
          let depthMm = Math.max(MIN_FEATURE_MM, Math.round(sy * (p.y - anchor.y)));
          if (ev.shiftKey) {
            // The larger of the two stretches wins, so the corner still tracks the pointer on one axis.
            if (widthMm / ratio > depthMm) depthMm = Math.max(MIN_FEATURE_MM, Math.round(widthMm / ratio));
            else widthMm = Math.max(MIN_FEATURE_MM, Math.round(depthMm * ratio));
          }
          const c = fromLocalFrame({ x: anchor.x + (sx * widthMm) / 2, y: anchor.y + (sy * depthMm) / 2 }, centre, rot);
          onResize(f.id, { widthMm, depthMm, x: Math.round(c.x), y: Math.round(c.y) });
        },
        onEnd: (_ev, moved) => {
          if (moved) onCommit?.();
        },
      });
    },
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
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      startPointerGesture(e, {
        onMove: (ev) => {
          const p = clientToMm(ev.clientX, ev.clientY);
          const d = Math.max(MIN_FEATURE_MM, Math.round(Math.hypot(p.x - f.x, p.y - f.y) * 2));
          onResize(f.id, { widthMm: d, depthMm: d, x: f.x, y: f.y });
        },
        onEnd: (_ev, moved) => {
          if (moved) onCommit?.();
        },
      });
    },
  };
}

/** Door openings: the gap is painted over the wall the canvas already stroked so it reads as a
 *  hole (unconditional, purely visual), and the door leaf(es) + swing arc on top of it — on EVERY
 *  surface that draws the property, not only the hall editor. A designer laying tables reads the
 *  swing to keep the arc clear, and a gap alone says nothing about which way the door opens or how
 *  far into the room it comes. With `clientToMm`/`mm` the symbol is the hall editor's interactive
 *  EntranceDoor (shared with the outline system's own doors; see plan-canvas.tsx), draggable along
 *  the wall when `onMove` is supplied; without them it is the same geometry drawn still, taking no
 *  pointer at all — the studio's case. Drawn as part of the overlay layer that sits *above* the
 *  walls. */
export const StructureDoors = memo(function StructureDoors({
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
  // Face detection walks the whole wall graph — once per structure, not once per render: this layer
  // used to run it on every frame of a pan and every frame of a drag on the studio's sketch.
  const nodes = useMemo(() => nodeMap(structure), [structure]);
  const faces = useMemo(() => detectFaces(structure), [structure]);
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
            {clientToMm && mm ? (
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
            ) : isWindow(e) ? (
              <WindowMark entrance={e} a={pts.a} b={pts.b} curve={w.curve ?? null} interiorHint={wallInteriorHint(faces, pts.a, pts.b, w.a, w.b)} />
            ) : (
              <DoorLeaves entrance={e} a={pts.a} b={pts.b} curve={w.curve ?? null} interiorHint={wallInteriorHint(faces, pts.a, pts.b, w.a, w.b)} />
            )}
          </g>
        );
      })}
    </>
  );
});

/** The window symbol with no handle on it: the glazing across the opening, in room mm — a 6cm band
 *  either side of the wall's line, one ink line from afar and a window up close — between the same
 *  two jambs the door geometry cuts (doorGeometry, bow and all). Takes no pointer, as a door's leaves. */
function WindowMark({
  entrance,
  a,
  b,
  curve,
  interiorHint,
}: {
  entrance: { distanceMm: number; widthMm: number };
  a: Point;
  b: Point;
  curve: EdgeCurve | null;
  interiorHint: Point;
}) {
  const geo = doorGeometry(a, b, entrance.distanceMm, entrance.widthMm, false, interiorHint, false, curve);
  return <WindowGlazing a={geo.gapStart} b={geo.gapEnd} offsetMm={60} stroke="var(--color-ink-soft)" strokeWidth={1.2} glassWidth={0.8} className="pointer-events-none" />;
}

/** The door symbol with no handle on it: leaf from hinge to tip, and the quarter-circle it sweeps —
 *  the exact geometry EntranceDoor draws (doorGeometry), so the sketch shows the door the hall
 *  editor drew and not a second opinion of it. Takes no pointer: on the sketch a door is the
 *  property's, something to design around rather than to move. */
function DoorLeaves({
  entrance,
  a,
  b,
  curve,
  interiorHint,
}: {
  entrance: { distanceMm: number; widthMm: number; swingInward: boolean; doubleDoor: boolean };
  a: Point;
  b: Point;
  curve: EdgeCurve | null;
  interiorHint: Point;
}) {
  const door = doorGeometry(a, b, entrance.distanceMm, entrance.widthMm, entrance.swingInward, interiorHint, entrance.doubleDoor, curve);
  return (
    <g className="pointer-events-none text-ink-soft">
      {door.leaves.map((leaf, i) => (
        <g key={i}>
          <line x1={leaf.hinge.x} y1={leaf.hinge.y} x2={leaf.tip.x} y2={leaf.tip.y} stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path
            d={`M ${leaf.tip.x} ${leaf.tip.y} A ${leaf.lenMm} ${leaf.lenMm} 0 0 ${leaf.sweepFlag} ${leaf.arcTo.x} ${leaf.arcTo.y}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray={3}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
    </g>
  );
}
