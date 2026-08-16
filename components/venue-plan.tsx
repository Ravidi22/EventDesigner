"use client";

import { outlinePathD, polygonAreaMm2, polygonCentroid, resizeFromEdge, wallLengthMm, wallSegmentD } from "@/lib/studio/geometry";
import { resolveStyle } from "@/lib/element-style";
import { isAdditiveClick } from "@/lib/keyboard";
import { nodeMap, wallPoints, type StructureFeature, type VenueStructure } from "@/lib/venues/structure";
import { stairsGeometry } from "@/lib/venues/stairs";
import { ZONE_KIND_LABEL, type ResolvedZone } from "@/lib/venues/zone";

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
              {showSub && (
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

/** Fixed things a designer plans around and cannot move — the pool, a built stage, a permanent bar. */
export function StructureFeatures({
  structure,
  mm,
  selectedIds,
  onSelect,
  onMove,
  onMoveStairs,
  onResize,
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
  /** Dragging a resize handle. Absent = a selected feature shows no handles at all (mid-draw, or
   *  any mode that doesn't edit the built plan) — same "supplying it is what turns the affordance
   *  on" rule as onMove/onMoveStairs. */
  onResize?: (id: string, patch: { widthMm: number; depthMm: number; x: number; y: number }) => void;
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
          strokeOpacity: style.strokeOpacity,
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
                onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(f.id, isAdditiveClick(e)); } : undefined}
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
              onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(f.id, isAdditiveClick(e)); } : undefined}
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
                  <ResizeHandle
                    {...resizableRadius(f, onResize, onCommit, clientToMm)}
                    cursor="cursor-nesw-resize"
                    label={`שינוי קוטר של ${f.label} — גרירה`}
                    cx={f.x + f.widthMm / 2}
                    cy={f.y}
                    mm={mm}
                  />
                ) : (
                  <>
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
  const size = mm(10);
  return (
    <g {...drag} tabIndex={0} role="button" aria-label={label} className={`${cursor} touch-none`}>
      <circle cx={cx} cy={cy} r={mm(11)} fill="transparent" />
      <rect
        x={cx - size / 2}
        y={cy - size / 2}
        width={size}
        height={size}
        className="text-accent hover:text-accent-deep"
        fill="currentColor"
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
                  onSelect(e.id, isAdditiveClick(ev));
                }}
              />
            )}
          </g>
        );
      })}
    </>
  );
}
