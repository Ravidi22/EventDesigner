"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import type { DesignDocumentContent, DesignTable, Placement, Layer as LayerId, WallSpan } from "@/lib/design-document/types";
import { resolve, tableUtilization, type Resolved } from "@/lib/studio/catalog-resolver";
import { pointToT, resolveSpan, wallSegment } from "@/lib/studio/anchor";
import { toLocalFrame, fromLocalFrame } from "@/lib/studio/geometry";
import type { VenueStructure } from "@/lib/venues/structure";
import { resolveFootprint, resolveContent, footprintBounds, customShapeBounds, type Footprint } from "@/lib/studio/footprint";
import { outlinePathD } from "@/lib/studio/geometry";
import type { Point } from "@/lib/studio/hall";
import type { EventPlan } from "@/lib/events/plan";
import { resolveStyle } from "@/lib/element-style";
import { ICON_BY_NAME } from "@/lib/catalog/map-icons";
import { PlanCanvas, type CanvasFocus, type CanvasLayerContext } from "@/components/plan-canvas";
import { ZoneRegions, StructureFeatures, StructureDoors } from "@/components/venue-plan";

// The studio's design surface — the app's one canvas (components/plan-canvas.tsx) with the design
// document drawn into its layers.
//
// It owns the viewport, grid, pan/zoom, fit and the wall graph itself; this file supplies the venue
// plan underneath (the same ZoneRegions / StructureFeatures / StructureDoors the hall editor uses,
// so the two screens cannot drift into drawing the same property two different ways) and the
// tables and placements on top.
//
// THE STRUCTURE IS NOT EDITABLE HERE. Walls, corners, doors, zones and fixed features are a
// property of the PROPERTY, drawn once at /halls — an event is designed inside them, never by
// moving them. That is enforced by omission rather than by a flag: the canvas only draws corner
// handles and takes wall clicks when given onMoveGraphNode/onSelectGraph, and the venue layers are
// only interactive when given onSelect/onMove. None of those are passed. A designer who needs the
// bar moved is looking at a different job, on a different screen.
export type Selection = { kind: "table" | "placement"; id: string } | null;

export function CanvasStage({
  doc,
  plan,
  selection,
  layerVisible,
  addingTable,
  onSelect,
  onMoveTable,
  onMovePlacement,
  onResizePlacement,
  onSpanPlacement,
  onDropProduct,
  onPlaceTable,
}: {
  doc: DesignDocumentContent;
  plan: EventPlan;
  selection: Selection;
  layerVisible: Record<LayerId, boolean>;
  addingTable?: string | null; // table type in click-to-place mode (F-3.3)
  onSelect: (s: Selection) => void;
  onMoveTable: (id: string, pos: Point) => void;
  onMovePlacement: (id: string, pos: Point) => void;
  /** A carpet stretched by its corner: the new size, and the centre it moved to (the opposite
   *  corner stays put, which is what dragging one corner means). */
  onResizePlacement: (id: string, sizeMm: { widthMm: number; depthMm: number }, position: Point) => void;
  /** A drape's run along its wall, after dragging one of its ends. */
  onSpanPlacement: (id: string, span: WallSpan) => void;
  onDropProduct: (productId: string, x: number, y: number) => void;
  onPlaceTable?: (x: number, y: number) => void;
}) {
  // Frame the event's zones once, and only once there is something to frame — the plan resolves
  // from storage after mount, so framing on the first render would spend the one move on an empty
  // box and leave the event off-screen. The nonce never changes after that, so the designer's own
  // panning is never yanked back mid-work.
  const [focus, setFocus] = useState<CanvasFocus | null>(null);
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current || !plan.bounds.widthMm) return;
    framed.current = true;
    setFocus({ ...plan.bounds, nonce: 1 });
  }, [plan.bounds]);

  const eventZoneIds = plan.zones.map((r) => r.zone.id);
  const others = plan.all.filter((r) => !eventZoneIds.includes(r.zone.id));

  // Sort the placements by what they ARE before drawing any of them: a drape hangs on a wall, a
  // cloth is a table's surface, a carpet is a rectangle on the floor, and everything else is an
  // object standing somewhere. Which is which comes from the product's category (CategoryDef
  // anchor/sizing, lifted onto the resolver), never from guessing at whichever fields are set.
  const sorted = useMemo(() => {
    const drapes: Placement[] = [];
    const carpets: Placement[] = [];
    const items: Placement[] = [];
    const coverByTable = new Map<string, Placement>();
    const chipsByTable = new Map<string, Placement[]>();

    for (const p of doc.placements) {
      const r = resolve(p.variantId);
      if (r?.anchor === "wall") {
        drapes.push(p);
      } else if (p.layer === "table" && p.tableId) {
        if (r?.anchor === "table") coverByTable.set(p.tableId, p);
        else chipsByTable.set(p.tableId, [...(chipsByTable.get(p.tableId) ?? []), p]);
      } else if (r?.sizing === "stretch") {
        carpets.push(p);
      } else {
        items.push(p);
      }
    }
    return { drapes, carpets, items, coverByTable, chipsByTable };
  }, [doc.placements]);

  return (
    <PlanCanvas
      mode="edit"
      ariaLabel="סקיצת האירוע — שולחנות ופריטי עיצוב על תוכנית המתחם"
      outline={[]}
      edgeCurves={[]}
      selected={[]}
      onSelect={() => onSelect(null)}
      onAddVertex={() => {}}
      onCloseOutline={() => {}}
      onMoveVertex={() => {}}
      onMoveWallHandle={() => {}}
      graph={plan.structure}
      focus={focus}
      cursor={addingTable ? "crosshair" : "default"}
      onCanvasClick={addingTable && onPlaceTable ? (p) => onPlaceTable(p.x, p.y) : undefined}
      onDropAt={(e, p) => {
        const productId = e.dataTransfer.getData("text/product");
        if (productId) onDropProduct(productId, p.x, p.y);
      }}
      backdrop={({ mm }) => (
        <>
          {/* Zones the event doesn't occupy stay drawn, dimmed: the designer needs to see what the
              חופה opens onto, and placing just outside a zone stays possible. */}
          <g opacity={0.45}>
            <ZoneRegions zones={others} mm={mm} />
          </g>
          <ZoneRegions zones={plan.zones} mm={mm} />
          <StructureFeatures structure={plan.structure} mm={mm} />
        </>
      )}
      overlay={(ctx) => (
        <>
          <StructureDoors structure={plan.structure} />

          {/* Laid on the floor, under everything that stands on it. */}
          {layerVisible.floor &&
            sorted.carpets.map((p) => (
              <CarpetNode
                key={p.id}
                placement={p}
                selected={selection?.kind === "placement" && selection.id === p.id}
                ctx={ctx}
                onSelect={() => onSelect({ kind: "placement", id: p.id })}
                onMove={(pos) => onMovePlacement(p.id, pos)}
                onResize={(sizeMm, position) => onResizePlacement(p.id, sizeMm, position)}
              />
            ))}

          {doc.tables.map((t) => (
            <TableNode
              key={t.id}
              table={t}
              selected={selection?.kind === "table" && selection.id === t.id}
              util={tableUtilization(doc, t)}
              // The cloth IS the table's surface — a table wears one, so it is drawn as the table's
              // own fill rather than as an object sitting on top of it, and is selected from the
              // table's inspector. (catalog-resolver gives tablecloths zero footprint for the same
              // reason: a cover consumes no room on the table it covers.)
              cloth={sorted.coverByTable.get(t.id)}
              ctx={ctx}
              onSelect={() => onSelect({ kind: "table", id: t.id })}
              onMove={(pos) => onMoveTable(t.id, pos)}
            />
          ))}

          {/* Table-layer items — clustered on their table. Covers are excluded: they were drawn as
              the table itself just above. */}
          {layerVisible.table &&
            doc.tables.map((t) => {
              const chips = sorted.chipsByTable.get(t.id) ?? [];
              return chips.map((p, i) => (
                <PlacementNode
                  key={p.id}
                  placement={p}
                  x={t.position.x}
                  y={t.position.y + (i - (chips.length - 1) / 2) * 840}
                  selected={selection?.kind === "placement" && selection.id === p.id}
                  ctx={ctx}
                  onSelect={() => onSelect({ kind: "placement", id: p.id })}
                />
              ));
            })}

          {/* Free placements (floor / ceiling) */}
          {sorted.items
            .filter((p) => layerVisible[p.layer])
            .map((p) => (
              <PlacementNode
                key={p.id}
                placement={p}
                x={p.position.x}
                y={p.position.y}
                selected={selection?.kind === "placement" && selection.id === p.id}
                ctx={ctx}
                onSelect={() => onSelect({ kind: "placement", id: p.id })}
                onMove={(pos) => onMovePlacement(p.id, pos)}
              />
            ))}

          {/* Drapes last, over the wall they hang on — they are overhead (the ceiling layer), and a
              wall drawn on top of a curtain would read as the curtain being behind it. */}
          {layerVisible.ceiling &&
            sorted.drapes.map((p) => (
              <DrapeNode
                key={p.id}
                placement={p}
                structure={plan.structure}
                selected={selection?.kind === "placement" && selection.id === p.id}
                ctx={ctx}
                onSelect={() => onSelect({ kind: "placement", id: p.id })}
                onSpan={(span) => onSpanPlacement(p.id, span)}
              />
            ))}
        </>
      )}
    />
  );
}

/** Is this shade dark enough that text on it has to go light? Perceived luminance (ITU-R BT.601),
 *  the same rule the catalog swatches read by. Non-hex values (a CSS variable fallback) are treated
 *  as light, which is what the tints in this palette are. */
function isDark(color: string): boolean {
  const hex = color.trim().replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}

/** The colour a placed item is drawn in: the shade the designer picked, or the neutral surface for
 *  a product whose shades carry no colour (or that has none at all). */
function swatchOf(r: Resolved | undefined, fallback = "var(--color-surface)"): string {
  return r?.swatch ?? fallback;
}

// A drape hung on a wall (F: curtains). Drawn as a band lying along the wall's own line, thick
// enough to read at plan scale — a curtain is a surface you see, not a hairline. Selecting it puts
// a handle on each end; dragging one slides that end along the wall, which is the whole vocabulary
// this thing needs (its other dimension is the wall's, and its height is the product's).
const DRAPE_MM = 220; // drawn thickness of the band, in plan millimetres

function DrapeNode({
  placement,
  structure,
  selected,
  ctx,
  onSelect,
  onSpan,
}: {
  placement: Placement;
  structure: VenueStructure;
  selected: boolean;
  ctx: CanvasLayerContext;
  onSelect: () => void;
  onSpan: (span: WallSpan) => void;
}) {
  // A drape whose wall was deleted at the venue draws nothing. It is not lost — it still lists and
  // prices, and the inspector offers it a new wall — but there is no honest place to put it here.
  const span = placement.span;
  const resolved = span ? resolveSpan(structure, span) : null;
  if (!span || !resolved) return null;

  const r = resolve(placement.variantId);
  const colour = swatchOf(r, "var(--color-accent-tint)");
  const { from, to } = resolved;

  const dragEnd = (which: "from" | "to") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      onSelect();
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.buttons !== 1) return;
      const wall = wallSegment(structure, span.wallId);
      if (!wall) return;
      const t = pointToT(wall, ctx.clientToMm(e.clientX, e.clientY));
      onSpan(which === "from" ? { ...span, from: t } : { ...span, to: t });
    },
    onPointerUp: (e: React.PointerEvent) => {
      const el = e.currentTarget as Element;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    },
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  });

  return (
    <g>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={colour}
        strokeWidth={DRAPE_MM}
        strokeLinecap="butt"
        opacity={0.9}
        tabIndex={0}
        role="button"
        aria-label={`${r?.label ?? "וילון"} — ${(resolved.lengthMm / 1000).toFixed(1)} מטר על הקיר`}
        className="cursor-pointer touch-none focus:outline-none"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      />
      {/* The selection outline is a second stroke rather than a colour change: a drape's whole
          point is the colour it is, and highlighting must not repaint it. */}
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={selected ? "var(--color-accent)" : "var(--color-ink-soft)"}
        strokeWidth={selected ? 3 : 1}
        strokeOpacity={selected ? 1 : 0.5}
        vectorEffect="non-scaling-stroke"
        className="pointer-events-none"
      />
      {selected &&
        ([
          ["from", from],
          ["to", to],
        ] as const).map(([which, p]) => (
          <circle
            key={which}
            cx={p.x}
            cy={p.y}
            r={ctx.mm(7)}
            fill="var(--color-canvas)"
            stroke="var(--color-accent)"
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
            tabIndex={0}
            role="slider"
            aria-label={which === "from" ? "תחילת הווילון על הקיר" : "סוף הווילון על הקיר"}
            aria-valuenow={Math.round((which === "from" ? span.from : span.to) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="cursor-ew-resize touch-none focus:outline-none"
            onKeyDown={(e) => {
              const step = (e.shiftKey ? 0.1 : 0.02) * (e.key === "ArrowLeft" ? -1 : 1);
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const at = which === "from" ? span.from : span.to;
              const next = Math.max(0, Math.min(1, at + step));
              onSpan(which === "from" ? { ...span, from: next } : { ...span, to: next });
            }}
            {...dragEnd(which)}
          />
        ))}
    </g>
  );
}

// A carpet laid on the floor: a rectangle in its own colour, sized on the plan rather than in the
// catalog. Dragging a corner stretches it, keeping the opposite corner where it is — which is what
// grabbing a corner of a rug means, and why the resize reports a new centre alongside a new size.
function CarpetNode({
  placement,
  selected,
  ctx,
  onSelect,
  onMove,
  onResize,
}: {
  placement: Placement;
  selected: boolean;
  ctx: CanvasLayerContext;
  onSelect: () => void;
  onMove: (pos: Point) => void;
  onResize: (sizeMm: { widthMm: number; depthMm: number }, position: Point) => void;
}) {
  const r = resolve(placement.variantId);
  const size = placement.sizeMm ?? fallbackSize(r);
  const { x, y } = placement.position;
  const halfW = size.widthMm / 2;
  const halfD = size.depthMm / 2;
  const rot = placement.rotation || 0;

  return (
    <g transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}>
      <rect
        {...draggable(placement.position, ctx.clientToMm, onMove, onSelect)}
        x={x - halfW}
        y={y - halfD}
        width={size.widthMm}
        height={size.depthMm}
        rx={Math.min(size.widthMm, size.depthMm) * 0.03}
        fill={swatchOf(r, "var(--color-inset)")}
        fillOpacity={0.85}
        stroke={selected ? "var(--color-accent)" : "var(--color-border)"}
        strokeWidth={selected ? 3 : 1.5}
        vectorEffect="non-scaling-stroke"
        tabIndex={0}
        role="button"
        aria-label={`${r?.label ?? "שטיח"} — ${(size.widthMm / 1000).toFixed(1)}×${(size.depthMm / 1000).toFixed(1)} מטר`}
        className="cursor-move touch-none focus:outline-none"
      />
      {selected &&
        CORNERS.map(([sx, sy]) => {
          const corner = { x: x + sx * halfW, y: y + sy * halfD };
          return (
            <rect
              key={`${sx},${sy}`}
              x={corner.x - ctx.mm(5)}
              y={corner.y - ctx.mm(5)}
              width={ctx.mm(10)}
              height={ctx.mm(10)}
              fill="var(--color-canvas)"
              stroke="var(--color-accent)"
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
              className={(sx === sy ? "cursor-nwse-resize" : "cursor-nesw-resize") + " touch-none focus:outline-none"}
              tabIndex={0}
              role="button"
              aria-label="פינה — גרירה לשינוי הגודל"
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.currentTarget as Element).setPointerCapture(e.pointerId);
                onSelect();
              }}
              onPointerMove={(e) => {
                if (e.buttons !== 1) return;
                // Work in the carpet's own frame so a rotated one still stretches along its edges
                // rather than along the world axes.
                const world = ctx.clientToMm(e.clientX, e.clientY);
                const local = toLocalFrame(world, { x, y }, rot);
                const fixed = { x: -sx * halfW, y: -sy * halfD }; // the opposite corner, held still
                const widthMm = Math.max(MIN_CARPET_MM, Math.abs(local.x - fixed.x));
                const depthMm = Math.max(MIN_CARPET_MM, Math.abs(local.y - fixed.y));
                const centreLocal = { x: fixed.x + (sx * widthMm) / 2, y: fixed.y + (sy * depthMm) / 2 };
                onResize({ widthMm: Math.round(widthMm), depthMm: Math.round(depthMm) }, fromLocalFrame(centreLocal, { x, y }, rot));
              }}
              onPointerUp={(e) => {
                const el = e.currentTarget as Element;
                if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          );
        })}
    </g>
  );
}

const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;
const MIN_CARPET_MM = 300; // a rug you can still grab a corner of

/** The size a stretch item gets before anyone has stretched it: whatever the catalog footprint
 *  says, so a freshly dropped carpet is a real rectangle rather than a point. */
function fallbackSize(r: Resolved | undefined): { widthMm: number; depthMm: number } {
  const b = r ? footprintBounds(resolveFootprint(r.product)) : null;
  return { widthMm: b?.w || 2000, depthMm: b?.h || 1400 };
}

// Where each live drag started, keyed by pointerId. Module scope rather than a closure: the first
// onMove re-renders the host, which rebuilds these handlers mid-gesture, so the origin has to
// outlive that. Same shape and same 4px threshold as venue-plan.tsx's feature drag — a click that
// drifts a pixel under the finger must select, not nudge.
const dragOrigin = new Map<number, { cx: number; cy: number; ox: number; oy: number; moved: boolean }>();
const DRAG_THRESHOLD_PX = 4;

function draggable(
  at: Point,
  clientToMm: (clientX: number, clientY: number) => Point,
  onMove?: (p: Point) => void,
  onSelect?: () => void,
) {
  const end = (e: React.PointerEvent) => {
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    dragOrigin.delete(e.pointerId);
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      dragOrigin.set(e.pointerId, { cx: e.clientX, cy: e.clientY, ox: at.x, oy: at.y, moved: false });
      onSelect?.(); // selecting on press, not on release, so what you are about to drag is already lit
    },
    onPointerMove: (e: React.PointerEvent) => {
      const origin = dragOrigin.get(e.pointerId);
      if (!origin || !onMove || e.buttons !== 1) return;
      if (!origin.moved) {
        if (Math.hypot(e.clientX - origin.cx, e.clientY - origin.cy) < DRAG_THRESHOLD_PX) return;
        origin.moved = true;
      }
      // Off the gesture's own origin each frame, not off the last position — repeated relative
      // nudges drift, and the grab point would slide out from under the pointer.
      const from = clientToMm(origin.cx, origin.cy);
      const to = clientToMm(e.clientX, e.clientY);
      onMove({ x: Math.round(origin.ox + to.x - from.x), y: Math.round(origin.oy + to.y - from.y) });
    },
    onPointerUp: end,
    onPointerCancel: end,
    // The press already selected; this only stops the click reaching the canvas, which would read
    // it as "empty canvas" and clear the selection the press just made.
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  };
}

function TableNode({
  table,
  selected,
  util,
  cloth,
  ctx,
  onSelect,
  onMove,
}: {
  table: DesignTable;
  selected: boolean;
  util: number;
  /** The cover this table wears, if any — drawn as the table's own fill. */
  cloth?: Placement;
  ctx: CanvasLayerContext;
  onSelect: () => void;
  onMove: (pos: Point) => void;
}) {
  const overflow = util > 1;
  const clothColour = cloth ? (resolve(cloth.variantId)?.swatch ?? "var(--color-accent-tint)") : undefined;
  // The table's own style sets its "at rest" look; selection and the overflow warning are
  // functional states that must stay legible regardless, so they still override stroke/fill on top
  // of it (mirrors the hall editor's fixtures, whose selection works the same way).
  const style = resolveStyle(table.style, "screen", {
    fill: "var(--color-surface)",
    stroke: "var(--color-ink)",
    strokeWidth: 2.5,
  });
  const shape = {
    // A dressed table shows its cloth. The overflow warning still wins over it: that one is a
    // problem to notice, not a colour choice, and it has to stay legible whatever is on the table.
    fill: overflow ? "var(--color-warn-tint)" : (clothColour ?? style.fill),
    fillOpacity: overflow || !clothColour ? style.fillOpacity : 1,
    stroke: selected ? "var(--color-accent)" : overflow ? "var(--color-warn)" : style.stroke,
    strokeWidth: selected ? 4 : style.strokeWidth,
    strokeDasharray: style.dashArray.length ? style.dashArray.join(" ") : undefined,
    vectorEffect: "non-scaling-stroke" as const,
  };
  const w = table.widthMm ?? 0;
  const d = table.depthMm ?? 0;
  // The number has to stay readable on whatever colour the cloth is, so it goes dark on a light
  // cloth and light on a dark one rather than trusting one fixed grey.
  const numberInk = selected
    ? "var(--color-accent)"
    : clothColour && isDark(clothColour)
      ? "var(--color-canvas)"
      : "var(--color-muted)";

  return (
    <g
      {...draggable(table.position, ctx.clientToMm, onMove, onSelect)}
      transform={table.rotation ? `rotate(${table.rotation} ${table.position.x} ${table.position.y})` : undefined}
      tabIndex={0}
      role="button"
      aria-label={`שולחן ${table.number || ""} — גרירה להזזה`}
      className="cursor-move touch-none focus:outline-none"
      onKeyDown={(e) => {
        const step = e.shiftKey ? 500 : 100;
        if (e.key === "ArrowLeft") onMove({ x: table.position.x - step, y: table.position.y });
        else if (e.key === "ArrowRight") onMove({ x: table.position.x + step, y: table.position.y });
        else if (e.key === "ArrowUp") onMove({ x: table.position.x, y: table.position.y - step });
        else if (e.key === "ArrowDown") onMove({ x: table.position.x, y: table.position.y + step });
        else return;
        e.preventDefault();
      }}
    >
      {table.diameterMm ? (
        <circle cx={table.position.x} cy={table.position.y} r={table.diameterMm / 2} {...shape} />
      ) : (
        <rect x={table.position.x - w / 2} y={table.position.y - d / 2} width={w} height={d} rx={80} {...shape} />
      )}
      {table.number > 0 && (
        <text
          x={table.position.x}
          y={table.diameterMm ? table.position.y - table.diameterMm / 2 + 350 : table.position.y}
          textAnchor="middle"
          dominantBaseline="central"
          fill={numberInk}
          style={{ fontSize: 520, fontWeight: 600 }}
          className="pointer-events-none"
        >
          {table.number}
        </text>
      )}
    </g>
  );
}

/** A footprint centred on (0,0) in its own local frame — the parent <g> carries the position,
 *  rotation and scale. Custom outlines are translated so their bounding-box centre sits at (0,0),
 *  so all four kinds share that frame. */
function FootprintShape({
  footprint,
  fill,
  stroke,
  strokeWidth,
}: {
  footprint: Footprint;
  fill: string;
  stroke: string;
  strokeWidth: number;
}) {
  const common = { fill, stroke, strokeWidth, vectorEffect: "non-scaling-stroke" as const };
  if (footprint.kind === "circle") return <circle r={footprint.diameterMm / 2} {...common} />;
  if (footprint.kind === "ellipse") return <ellipse rx={footprint.widthMm / 2} ry={footprint.depthMm / 2} {...common} />;
  if (footprint.kind === "custom") {
    const b = customShapeBounds(footprint.outline);
    const centered = footprint.outline.map((p) => ({ x: p.x - b.cx, y: p.y - b.cy }));
    return <path d={outlinePathD(centered, footprint.edgeCurves)} {...common} />;
  }
  const { widthMm: w, depthMm: d } = footprint;
  return <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={Math.min(w, d) * 0.06} {...common} />;
}

function PlacementNode({
  placement,
  x,
  y,
  selected,
  ctx,
  onSelect,
  onMove,
}: {
  placement: Placement;
  x: number;
  y: number;
  selected: boolean;
  ctx: CanvasLayerContext;
  onSelect: () => void;
  /** Absent for table-layer items: those are clustered onto their table and follow it. */
  onMove?: (pos: Point) => void;
}) {
  const r = resolve(placement.variantId);
  const product = r?.product;
  const footprint: Footprint = product ? resolveFootprint(product) : { kind: "rect", widthMm: 600, depthMm: 600 };
  const content = product ? resolveContent(product) : { mode: "name" as const, name: r?.label ?? "פריט" };
  const bounds = footprintBounds(footprint);
  const scale = placement.scale || 1;
  const label = content.mode === "name" ? content.name : "";
  // No ellipsis in SVG text: size the type to the footprint the way Konva did, then clip the string
  // to what that box can hold rather than letting it run out past the shape's edge.
  const fontSize = Math.max(140, Math.min(bounds.h * 0.4, bounds.w * 0.22));
  const maxChars = Math.max(3, Math.floor((bounds.w * 0.84) / (fontSize * 0.55)));
  const shown = label.length > maxChars ? label.slice(0, maxChars - 1) + "…" : label;
  const Icon = content.mode === "icon" && content.icon ? ICON_BY_NAME[content.icon] : undefined;
  const iconSize = Math.min(bounds.w, bounds.h) * 0.6;
  const badge = 340;

  return (
    <g
      {...draggable({ x, y }, ctx.clientToMm, onMove, onSelect)}
      transform={`translate(${x} ${y})${placement.rotation ? ` rotate(${placement.rotation})` : ""}${scale !== 1 ? ` scale(${scale})` : ""}`}
      tabIndex={0}
      role="button"
      aria-label={`${r?.label ?? "פריט"}${onMove ? " — גרירה להזזה" : ""}`}
      className={(onMove ? "cursor-move" : "cursor-pointer") + " touch-none focus:outline-none"}
    >
      <FootprintShape
        footprint={footprint}
        fill={selected ? "var(--color-accent-tint)" : "var(--color-surface)"}
        stroke={selected ? "var(--color-accent)" : "var(--color-border)"}
        strokeWidth={selected ? 4 : 2}
      />

      {content.mode === "name" && (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--color-ink)"
          style={{ fontSize }}
          className="pointer-events-none"
        >
          {shown}
        </text>
      )}

      {/* The same lucide glyph the catalog picker shows, drawn straight into the plan — its 24-unit
          viewBox scaled to the footprint and re-centred. */}
      {Icon && (
        <g
          transform={`translate(${-iconSize / 2} ${-iconSize / 2}) scale(${iconSize / 24})`}
          className="pointer-events-none"
        >
          {createElement(Icon, {
            width: 24,
            height: 24,
            color: selected ? "var(--color-accent)" : "var(--color-ink-soft)",
            strokeWidth: 1.5,
          })}
        </g>
      )}
      {/* content.mode "none" renders nothing */}

      {placement.quantity > 1 && (
        <g className="pointer-events-none">
          <rect
            x={-bounds.w / 2 + 40}
            y={bounds.h / 2 - badge - 40}
            width={badge}
            height={badge}
            rx={70}
            fill="var(--color-accent)"
          />
          <text
            x={-bounds.w / 2 + 40 + badge / 2}
            y={bounds.h / 2 - badge / 2 - 40}
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--color-canvas)"
            style={{ fontSize: 220, fontWeight: 600 }}
          >
            ×{placement.quantity}
          </text>
        </g>
      )}
    </g>
  );
}
