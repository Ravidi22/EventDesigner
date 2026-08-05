"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Circle, Ellipse, Group, Text, Line, Path } from "react-konva";
import type Konva from "konva";
import { Minus, Plus, Maximize } from "lucide-react";
import type { DesignDocumentContent, DesignTable, Placement, Layer as LayerId } from "@/lib/design-document/types";
import { resolve, tableUtilization } from "@/lib/studio/catalog-resolver";
import { resolveFootprint, resolveContent, footprintBounds, customShapeBounds, type Footprint } from "@/lib/studio/footprint";
import { absoluteControlPoints, outlinePathD, polygonCentroid, wallLengthMm, wallSegmentD } from "@/lib/studio/geometry";
import type { EventPlan } from "@/lib/events/plan";
import { nodeMap, wallPoints } from "@/lib/venues/structure";
import { stairsGeometry } from "@/lib/venues/stairs";
import { resolveStyle } from "@/lib/element-style";
import { IconButton } from "@/components/icon-button";
import { KonvaIcon } from "@/components/konva-icon";

// Design tokens mirrored for the canvas (Konva can't read CSS variables). Keep in sync
// with app/globals.css @theme.
const C = {
  canvas: "#ffffff",
  bg: "#eeedf3",
  wall: "#1b1725",
  column: "#e0ddea",
  ink: "#1b1725",
  inkSoft: "#4a4658",
  muted: "#7c7889",
  border: "#e9e7f0",
  surface: "#ffffff",
  accent: "#6d55bd",
  accentTint: "#efeafb",
  warn: "#a97e1f",
  warnTint: "#f6ecd6",
};

export type Selection = { kind: "table" | "placement"; id: string } | null;

export interface CanvasHandle {
  fit: () => void;
}

export function CanvasStage({
  doc,
  plan,
  selection,
  layerVisible,
  addingTable,
  onSelect,
  onMoveTable,
  onMovePlacement,
  onDropProduct,
  onPlaceTable,
}: {
  doc: DesignDocumentContent;
  plan: EventPlan;
  selection: Selection;
  layerVisible: Record<LayerId, boolean>;
  addingTable?: string | null; // table type in click-to-place mode (F-3.3)
  onSelect: (s: Selection) => void;
  onMoveTable: (id: string, pos: { x: number; y: number }) => void;
  onMovePlacement: (id: string, pos: { x: number; y: number }) => void;
  onDropProduct: (productId: string, x: number, y: number) => void;
  onPlaceTable?: (x: number, y: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ scale: 0.05, x: 0, y: 0 });

  // The event's zones, not the whole property: the studio opens framed on what is being designed,
  // while everything else on the plan stays drawn and reachable one scroll away.
  const box = plan.bounds;
  const nodes = nodeMap(plan.structure);

  // Fit the shape's own box, offsetting by its minX/minY — a zone drawn far out on a venue plane
  // must land centred in the viewport, not off-screen by its distance from the origin.
  const fit = useCallback(() => {
    const { w, h } = { w: wrapRef.current?.clientWidth ?? 0, h: wrapRef.current?.clientHeight ?? 0 };
    if (!w || !h || !box.widthMm || !box.heightMm) return;
    const pad = 0.08;
    const scale = Math.min(w / box.widthMm, h / box.heightMm) * (1 - pad);
    setView({
      scale,
      x: (w - box.widthMm * scale) / 2 - box.minX * scale,
      y: (h - box.heightMm * scale) / 2 - box.minY * scale,
    });
  }, [box.widthMm, box.heightMm, box.minX, box.minY]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Fit once, as soon as there is both a viewport and a plan to frame. The plan resolves after
  // mount (storage is client-only), so this deliberately waits for a non-empty box rather than
  // spending its one fit on the zero-sized placeholder and leaving the event off-screen.
  const fittedRef = useRef(false);
  useEffect(() => {
    if (size.w && size.h && box.widthMm && !fittedRef.current) {
      fit();
      fittedRef.current = true;
    }
  }, [size, fit, box.widthMm]);

  const zoomBy = (factor: number) => {
    const stage = stageRef.current;
    const center = { x: size.w / 2, y: size.h / 2 };
    const scale = Math.max(0.008, Math.min(0.6, view.scale * factor));
    const mx = (center.x - view.x) / view.scale;
    const my = (center.y - view.y) / view.scale;
    setView({ scale, x: center.x - mx * scale, y: center.y - my * scale });
    stage?.batchDraw();
  };

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current!;
    const pointer = stage.getPointerPosition()!;
    const factor = e.evt.deltaY > 0 ? 1 / 1.08 : 1.08;
    const scale = Math.max(0.008, Math.min(0.6, view.scale * factor));
    const mx = (pointer.x - view.x) / view.scale;
    const my = (pointer.y - view.y) / view.scale;
    setView({ scale, x: pointer.x - mx * scale, y: pointer.y - my * scale });
  };

  const toDoc = (clientX: number, clientY: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - view.x) / view.scale, y: (clientY - rect.top - view.y) / view.scale };
  };

  return (
    <div
      ref={wrapRef}
      className={"relative h-full w-full overflow-hidden bg-bg" + (addingTable ? " cursor-crosshair" : "")}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const productId = e.dataTransfer.getData("text/product");
        if (!productId) return;
        const p = toDoc(e.clientX, e.clientY);
        onDropProduct(productId, p.x, p.y);
      }}
    >
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        scaleX={view.scale}
        scaleY={view.scale}
        x={view.x}
        y={view.y}
        draggable
        onWheel={onWheel}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
        }}
        onClick={() => {
          // F-3.3 click-to-place: in add mode a stage click drops a table; otherwise it clears selection.
          if (addingTable && onPlaceTable) {
            const pointer = stageRef.current?.getPointerPosition();
            if (pointer) onPlaceTable((pointer.x - view.x) / view.scale, (pointer.y - view.y) / view.scale);
          } else onSelect(null);
        }}
        onTap={() => onSelect(null)}
      >
        <Layer>
          {/* The venue plan under the design. Zone floors first, then the walls stroked once on top
              — a wall between two zones is one wall, so it must not be painted twice. Zones the
              event doesn't occupy are drawn dimmed rather than omitted: the designer needs to see
              what the חופה opens onto, and placing just outside a zone stays possible. */}
          {plan.all.map((r) => {
            const occupied = plan.zones.some((z) => z.zone.id === r.zone.id);
            if (r.boundary.length < 3) return null;
            const centre = polygonCentroid(r.boundary);
            return (
              <Group key={r.zone.id} listening={false} opacity={occupied ? 1 : 0.45}>
                <Line
                  points={r.boundary.flatMap((p) => [p.x, p.y])}
                  closed
                  fill={occupied ? C.canvas : C.bg}
                />
                {!occupied && (
                  <Text
                    x={centre.x - 4000}
                    y={centre.y}
                    width={8000}
                    text={r.zone.name}
                    align="center"
                    fontSize={480}
                    fontFamily="Assistant, sans-serif"
                    fill={C.muted}
                  />
                )}
              </Group>
            );
          })}

          {plan.structure.walls.map((w) => {
            const pts = wallPoints(plan.structure, w, nodes);
            if (!pts) return null;
            // An "edge" (a terrace lip, the קוליסאום's rim) is a boundary you can see and step over
            // — drawn lighter and dashed so it never reads as something you can't walk through.
            const isEdge = w.kind === "edge";
            const common = {
              stroke: isEdge ? C.muted : C.wall,
              strokeWidth: isEdge ? 1.5 : 3,
              strokeScaleEnabled: false,
              listening: false,
              ...(isEdge ? { dash: [220, 160] } : {}),
            };
            if (w.curve) {
              const { c1, c2 } = absoluteControlPoints(pts.a, pts.b, w.curve);
              return <Path key={w.id} data={`M ${pts.a.x} ${pts.a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${pts.b.x} ${pts.b.y}`} {...common} />;
            }
            return <Line key={w.id} points={[pts.a.x, pts.a.y, pts.b.x, pts.b.y]} {...common} />;
          })}

          {/* Doors, drawn as gaps: a stroke in the floor colour over the wall they cut through
              (ponytail: a rough marker, not the full gap+swing symbol the venue plan editor draws
              — this is a backdrop to place tables against, not a structure to edit). */}
          {plan.structure.entrances.map((e) => {
            const wall = plan.structure.walls.find((w) => w.id === e.wallId);
            const pts = wall ? wallPoints(plan.structure, wall, nodes) : null;
            if (!pts) return null;
            // Cut along the wall as drawn, so the gap stays in the wall when that wall is bowed.
            const len = wallLengthMm(pts.a, pts.b) || 1;
            const half = e.widthMm / 2;
            return (
              <Path
                key={e.id}
                data={wallSegmentD(
                  pts.a,
                  pts.b,
                  wall?.curve ?? null,
                  Math.max(0, (e.distanceMm - half) / len),
                  Math.min(1, (e.distanceMm + half) / len),
                )}
                stroke={C.canvas}
                strokeWidth={5}
                strokeScaleEnabled={false}
                listening={false}
              />
            );
          })}

          {/* Fixed features you plan around and cannot move (F-3.1): the pool, a built stage, a bar */}
          {plan.structure.features.map((f) => {
            const resolved = resolveStyle(f.style, "screen", { fill: C.column, stroke: C.muted, strokeWidth: 1.5 });
            const shape = { fill: resolved.fill, stroke: resolved.stroke, strokeWidth: resolved.strokeWidth, strokeScaleEnabled: false, ...(resolved.dashArray.length ? { dash: resolved.dashArray } : {}) };
            // A stage's stairs are floor a table cannot stand on, so they belong on the backdrop a
            // designer places against. Drawn beside the feature's own group rather than inside it:
            // the flight arrives in world coordinates, already turned with the deck.
            const stairs = stairsGeometry(f);
            return (
              <Group key={f.id} listening={false}>
                {stairs && (
                  <Group listening={false}>
                    <Line points={stairs.outline.flatMap((p) => [p.x, p.y])} closed fill={C.bg} stroke={C.muted} strokeWidth={1.25} strokeScaleEnabled={false} />
                    {stairs.nosings.map(([p, q], i) => (
                      <Line key={i} points={[p.x, p.y, q.x, q.y]} stroke={C.muted} strokeWidth={1} strokeScaleEnabled={false} />
                    ))}
                  </Group>
                )}
                <Group x={f.x} y={f.y} rotation={f.rotationDeg} listening={false}>
                  {f.shape === "circle" ? (
                    <Circle radius={f.widthMm / 2} {...shape} />
                  ) : f.shape === "ellipse" ? (
                    <Ellipse radiusX={f.widthMm / 2} radiusY={f.depthMm / 2} {...shape} />
                  ) : (
                    <Rect x={-f.widthMm / 2} y={-f.depthMm / 2} width={f.widthMm} height={f.depthMm} {...shape} />
                  )}
                  <Text x={-f.widthMm / 2} y={-210} width={f.widthMm} text={f.label} align="center" fontSize={420} fontFamily="Assistant, sans-serif" fill={C.inkSoft} />
                </Group>
              </Group>
            );
          })}

          {/* The event's aligned iPlan sketch (F-3.2) — placeholder frame until real PDF pixels exist */}
          {doc.sketch && (
            <Group x={doc.sketch.x} y={doc.sketch.y} listening={false} opacity={0.55}>
              <Rect width={doc.sketch.widthMm} height={doc.sketch.heightMm} stroke={C.muted} strokeWidth={1.5} strokeScaleEnabled={false} dash={[160, 120]} />
              <Text x={0} y={doc.sketch.heightMm - 560} width={doc.sketch.widthMm} text={`סקיצה: ${doc.sketch.fileName}`} align="center" fontSize={380} fontFamily="Assistant, sans-serif" fill={C.muted} />
            </Group>
          )}

          {/* Tables */}
          {doc.tables.map((t) => (
            <TableNode
              key={t.id}
              table={t}
              selected={selection?.kind === "table" && selection.id === t.id}
              util={tableUtilization(doc, t)}
              onSelect={() => onSelect({ kind: "table", id: t.id })}
              onMove={(pos) => onMoveTable(t.id, pos)}
            />
          ))}

          {/* Table-layer placements — clustered on their table */}
          {layerVisible.table &&
            doc.tables.map((t) => {
              const chips = doc.placements.filter((p) => p.layer === "table" && p.tableId === t.id);
              return chips.map((p, i) => (
                <PlacementNode
                  key={p.id}
                  placement={p}
                  x={t.position.x}
                  y={t.position.y + (i - (chips.length - 1) / 2) * 840}
                  selected={selection?.kind === "placement" && selection.id === p.id}
                  onSelect={() => onSelect({ kind: "placement", id: p.id })}
                />
              ));
            })}

          {/* Free placements (floor / ceiling) */}
          {doc.placements
            .filter((p) => p.layer !== "table" && layerVisible[p.layer])
            .map((p) => (
              <PlacementNode
                key={p.id}
                placement={p}
                x={p.position.x}
                y={p.position.y}
                selected={selection?.kind === "placement" && selection.id === p.id}
                onSelect={() => onSelect({ kind: "placement", id: p.id })}
                draggable
                onMove={(pos) => onMovePlacement(p.id, pos)}
              />
            ))}
        </Layer>
      </Stage>

      {/* View controls — inline-start edge, opposite the inspector (inline-end) so they never overlap in RTL. */}
      <div className="absolute bottom-4 inset-inline-start-4 flex items-center gap-1 rounded-md border border-border bg-surface p-1 shadow-floating">
        <IconButton label="הקטן" size="md" onClick={() => zoomBy(1 / 1.2)}>
          <Minus className="h-4 w-4" strokeWidth={2} />
        </IconButton>
        <IconButton label="התאם למסך" size="md" onClick={fit}>
          <Maximize className="h-4 w-4" strokeWidth={2} />
        </IconButton>
        <IconButton label="הגדל" size="md" onClick={() => zoomBy(1.2)}>
          <Plus className="h-4 w-4" strokeWidth={2} />
        </IconButton>
      </div>
    </div>
  );
}

function TableNode({
  table,
  selected,
  util,
  onSelect,
  onMove,
}: {
  table: DesignTable;
  selected: boolean;
  util: number;
  onSelect: () => void;
  onMove: (pos: { x: number; y: number }) => void;
}) {
  const overflow = util > 1;
  // The table's own style sets its "at rest" look; selection and the overflow warning are
  // functional states that must stay legible regardless, so they still override stroke/fill on
  // top of it (mirrors the hall editor's fixtures, whose selection handles work the same way).
  const resolved = resolveStyle(table.style, "screen", { fill: C.surface, stroke: C.ink, strokeWidth: 2.5 });
  const fill = overflow ? C.warnTint : resolved.fill;
  const stroke = selected ? C.accent : overflow ? C.warn : resolved.stroke;
  const strokeWidth = selected ? 4 : resolved.strokeWidth;
  const dash = resolved.dashArray.length ? { dash: resolved.dashArray } : {};
  const common = {
    onClick: (e: Konva.KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      onSelect();
    },
    onTap: (e: Konva.KonvaEventObject<Event>) => {
      e.cancelBubble = true;
      onSelect();
    },
    draggable: true,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => onMove({ x: e.target.x(), y: e.target.y() }),
  };
  return (
    <Group x={table.position.x} y={table.position.y} {...common}>
      {table.diameterMm ? (
        <Circle radius={table.diameterMm / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} {...dash} strokeScaleEnabled={false} />
      ) : (
        <Rect
          x={-(table.widthMm ?? 0) / 2}
          y={-(table.depthMm ?? 0) / 2}
          width={table.widthMm ?? 0}
          height={table.depthMm ?? 0}
          cornerRadius={80}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          {...dash}
          strokeScaleEnabled={false}
        />
      )}
      {table.number > 0 && (
        <Text
          x={-600}
          y={table.diameterMm ? -table.diameterMm / 2 + 90 : -320}
          width={1200}
          text={String(table.number)}
          align="center"
          fontSize={520}
          fontStyle="600"
          fontFamily="Assistant, sans-serif"
          fill={selected ? C.accent : C.muted}
          listening={false}
        />
      )}
    </Group>
  );
}

// Draws a footprint shape centered on (0,0). Custom outlines are translated so their
// bounding-box center sits at (0,0), so all four kinds share one local frame.
function FootprintShape({ footprint, fill, stroke, strokeWidth }: {
  footprint: Footprint;
  fill: string;
  stroke: string;
  strokeWidth: number;
}) {
  const common = { fill, stroke, strokeWidth, strokeScaleEnabled: false, listening: false } as const;
  if (footprint.kind === "circle") return <Circle radius={footprint.diameterMm / 2} {...common} />;
  if (footprint.kind === "ellipse") return <Ellipse radiusX={footprint.widthMm / 2} radiusY={footprint.depthMm / 2} {...common} />;
  if (footprint.kind === "custom") {
    const b = customShapeBounds(footprint.outline);
    const centered = footprint.outline.map((p) => ({ x: p.x - b.cx, y: p.y - b.cy }));
    if (footprint.edgeCurves?.some(Boolean)) return <Path data={outlinePathD(centered, footprint.edgeCurves)} {...common} />;
    return <Line points={centered.flatMap((p) => [p.x, p.y])} closed {...common} />;
  }
  const { widthMm: w, depthMm: d } = footprint;
  return <Rect x={-w / 2} y={-d / 2} width={w} height={d} cornerRadius={Math.min(w, d) * 0.06} {...common} />;
}

function PlacementNode({
  placement, x, y, selected, onSelect, draggable, onMove,
}: {
  placement: Placement;
  x: number;
  y: number;
  selected: boolean;
  onSelect: () => void;
  draggable?: boolean;
  onMove?: (pos: { x: number; y: number }) => void;
}) {
  const r = resolve(placement.variantId);
  const product = r?.product;
  const footprint: Footprint = product ? resolveFootprint(product) : { kind: "rect", widthMm: 600, depthMm: 600 };
  const content = product ? resolveContent(product) : { mode: "name" as const, name: r?.label ?? "פריט" };
  const bounds = footprintBounds(footprint);
  const stroke = selected ? C.accent : C.border;
  const fill = selected ? C.accentTint : C.surface;

  return (
    <Group
      x={x}
      y={y}
      rotation={placement.rotation || 0}
      scaleX={placement.scale || 1}
      scaleY={placement.scale || 1}
      draggable={draggable}
      onDragEnd={draggable && onMove ? (e) => onMove({ x: e.target.x(), y: e.target.y() }) : undefined}
      onClick={(e) => { e.cancelBubble = true; onSelect(); }}
      onTap={(e) => { e.cancelBubble = true; onSelect(); }}
    >
      <FootprintShape footprint={footprint} fill={fill} stroke={stroke} strokeWidth={selected ? 4 : 2} />

      {content.mode === "name" && (
        <Text
          x={-bounds.w / 2}
          y={-bounds.h / 2}
          width={bounds.w}
          height={bounds.h}
          text={content.name}
          align="center"
          verticalAlign="middle"
          fontSize={Math.max(140, Math.min(bounds.h * 0.4, bounds.w * 0.22))}
          fontFamily="Assistant, sans-serif"
          fill={C.ink}
          padding={Math.min(bounds.w, bounds.h) * 0.08}
          ellipsis
          wrap="none"
          listening={false}
        />
      )}
      {content.mode === "icon" && content.icon && (
        <KonvaIcon
          name={content.icon}
          color={selected ? C.accent : C.inkSoft}
          x={0}
          y={0}
          size={Math.min(bounds.w, bounds.h) * 0.6}
        />
      )}
      {/* "none" renders nothing */}

      {placement.quantity > 1 && (
        <Group listening={false}>
          <Rect x={-bounds.w / 2 + 40} y={bounds.h / 2 - 380} width={340} height={340} cornerRadius={70} fill={C.accent} />
          <Text
            x={-bounds.w / 2 + 40}
            y={bounds.h / 2 - 380}
            width={340}
            height={340}
            text={`×${placement.quantity}`}
            align="center"
            verticalAlign="middle"
            fontSize={220}
            fontStyle="600"
            fontFamily="Assistant, sans-serif"
            fill="#ffffff"
          />
        </Group>
      )}
    </Group>
  );
}
