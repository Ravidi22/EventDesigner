"use client";
// THE SIDE VIEWS — the shape editor's חזית and צד (spec docs/superpowers/specs/2026-11-09-backdrops-
// front-drawing-and-text-design.md §4, S1; Ravid: "some of the top view looks nice but sideways it
// looks bad, and then in the 3D it looks bad also"). The item's shapes seen from the front or the
// side as boxes from their bottom to their top (lib/element/elevation.ts): dragged up and down to set
// a shape's height from the floor, its top edge to make it taller — the first shape's top edge is the
// item's height — and across, as on the plan.
//
// THE CANVAS IS THE PLAN'S: a PlanCanvas whose world is (across, −z) — the floor is the line y = 0
// and up is up the screen — with each box a rect feature of the feature layer the plan uses
// (move, resize, snap, band selection), and every edit read back into the shape's own numbers by
// `rectEdit`. Live edits go into the editor's open undo entry (`onEdit` → hist.amend), the gesture's
// end commits it, so a drag is one Ctrl+Z.
//
// THE ROOM UNDER THE DRAWING (DECIDE 4): the item's 3D, built as the 3D pane builds it (itemScene,
// let settle — useSettledScene), drawn by an orthographic camera at exactly the canvas's settled
// view (components/scene/ortho-underlay.tsx through PlanCanvas's `underlay`, carried through a pan
// by CSS). Kept mounted once shown — hidden, never unmounted, so its shaders compile once.
import { useCallback, useMemo, useRef } from "react";
import type { ShapePart } from "@/lib/catalog/types";
import type { ElementStyle } from "@/lib/element-style";
import { boxRect, elevationBoxes, orthoFrame, rectEdit, type ElevationBox, type ElevationRect, type ElevationView } from "@/lib/element/elevation";
import { revolveSilhouette } from "@/lib/element/revolve";
import { PlanCanvas, type HostSnapOptions, type MarqueeMode } from "@/components/plan-canvas";
import { StructureFeatures } from "@/components/venue-plan";
import { Dim } from "@/components/venue-dims";
import { emptyStructure, type StructureFeature } from "@/lib/venues/structure";
import { hitsInBox, mergeSelection } from "@/lib/venues/selection";
import { LazyOrthoUnderlay } from "@/components/scene/lazy";
import { useSettledScene, type SceneSubject } from "./scene-pane";

/** How far the floor line runs either way — past any item and any view of one. */
const FLOOR_REACH_MM = 50_000;
const cm = (mm: number) => Math.round(mm) / 10;

export interface ElevationCanvasProps {
  view: ElevationView;
  shapes: readonly ShapePart[];
  itemHeightMm: number;
  /** The item's own look, under each shape's own colours — the boxes are drawn in it. */
  itemStyle?: ElementStyle;
  selected: readonly string[];
  onSelect: (ids: string[]) => void;
  /** Live, inside the open undo entry (hist.amend): the shapes, and the item's height when the
   *  base's top moved. */
  onEdit: (fn: (list: ShapePart[]) => ShapePart[], itemHeightMm?: number) => void;
  onCommit: () => void;
  history: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void };
  /** The room to draw under the drawing; null while nothing is drawn. */
  room: { subject: SceneSubject; itemAt: { x: number; y: number }; baseZMm: number } | null;
  /** Whether the room shows — off keeps it mounted and held. */
  roomShown: boolean;
  /** The view is the plan: this canvas is kept mounted, its room held. */
  hidden?: boolean;
  /** The editor's canvas frame (padding, the least extent, the grid) — the plan's own. */
  frame: { padMm: number; minExtentMm: { w: number; h: number }; gridMm: number };
}

export function ElevationCanvas({ view, shapes, itemHeightMm, itemStyle, selected, onSelect, onEdit, onCommit, history, room, roomShown, hidden = false, frame }: ElevationCanvasProps) {
  const boxes = useMemo(() => elevationBoxes(shapes, itemHeightMm, view), [shapes, itemHeightMm, view]);
  const rects = useMemo(() => boxes.map(boxRect), [boxes]);
  const showRoom = !!room && roomShown;

  const features: StructureFeature[] = boxes.map((b, i) => {
    const s = shapes[i];
    const r = rects[i];
    return {
      id: b.id,
      kind: "other",
      label: "",
      x: r.x,
      y: r.y,
      widthMm: Math.max(1, r.widthMm),
      depthMm: Math.max(1, r.depthMm),
      heightMm: 0,
      shape: "rect",
      rotationDeg: 0,
      style: {
        ...itemStyle,
        ...s.style,
        dash: b.outlineOnly ? "dashed" : "solid",
        // Over the room the boxes are its outlines; a body of revolution is drawn as its silhouette
        // over a clear box.
        ...(showRoom || b.revolve ? { fillOpacity: 0 } : {}),
      },
    };
  });

  // One live group drag: every selected box's rect frozen when the gesture starts, so the lot moves
  // by one shared delta rather than drifting.
  const groupDrag = useRef<{ from: { x: number; y: number }; origins: Map<string, ElevationRect> } | null>(null);
  const snapOpts = (moving: readonly string[], self?: { widthMm: number; depthMm: number }): HostSnapOptions => ({
    boxes: rects.filter((_, i) => !moving.includes(boxes[i].id)),
    ...(self ? { self } : {}),
  });

  /** The rects edited, read back into the shapes — one `onEdit`, the item's height with it. */
  const apply = (edits: Map<string, ElevationRect>) => {
    let height: number | undefined;
    const patches = new Map<string, Partial<ShapePart>>();
    boxes.forEach((b, i) => {
      const rect = edits.get(b.id);
      if (!rect) return;
      const { patch, itemHeightMm: h } = rectEdit(shapes[i], b, rect, view);
      if (Object.keys(patch).length) patches.set(b.id, patch);
      if (h !== undefined) height = h;
    });
    if (!patches.size && height === undefined) return;
    onEdit((list) => list.map((s) => (patches.has(s.id) ? { ...s, ...patches.get(s.id) } : s)), height);
  };

  const { scene } = useSettledScene(room?.subject ?? null);
  const ax = room?.itemAt.x ?? 0;
  const ay = room?.itemAt.y ?? 0;
  const baseZ = room?.baseZMm ?? 0;
  const roomHeld = hidden || !showRoom;
  const underlay = useCallback(
    (vb: { minX: number; minY: number; w: number; h: number }) =>
      scene ? <LazyOrthoUnderlay scene={scene} frame={orthoFrame(view, vb, { x: ax, y: ay }, baseZ)} hidden={roomHeld} className={"h-full w-full" + (roomHeld ? " invisible" : "")} /> : null,
    [scene, view, ax, ay, baseZ, roomHeld],
  );

  const marquee = (box: { minX: number; minY: number; maxX: number; maxY: number }, _additive: boolean, mode: MarqueeMode) => {
    const hits = hitsInBox({ ...emptyStructure(), features }, [], box);
    onSelect(mergeSelection(selected.map((id) => ({ kind: "feature" as const, id })), hits, mode).map((r) => r.id));
  };

  const one = selected.length === 1 ? boxes.find((b) => b.id === selected[0]) : undefined;
  const framePoints = [
    { x: -frame.minExtentMm.w / 2, y: 0 },
    { x: frame.minExtentMm.w / 2, y: -frame.minExtentMm.h },
    ...rects.flatMap((r) => [
      { x: r.x - r.widthMm / 2, y: r.y - r.depthMm / 2 },
      { x: r.x + r.widthMm / 2, y: r.y + r.depthMm / 2 },
    ]),
  ];

  return (
    <PlanCanvas
      lengthUnit="cm"
      mode="edit"
      outline={[]}
      edgeCurves={[]}
      selected={[]}
      onSelect={() => {}}
      onAddVertex={() => {}}
      onCloseOutline={() => {}}
      onMoveVertex={() => {}}
      onMoveWallHandle={() => {}}
      onMarquee={marquee}
      cursor="default"
      onCanvasClick={() => onSelect([])}
      onCommit={onCommit}
      canUndo={history.canUndo}
      canRedo={history.canRedo}
      onUndo={history.onUndo}
      onRedo={history.onRedo}
      framePoints={framePoints}
      defaultDims
      padMm={frame.padMm}
      minExtentMm={frame.minExtentMm}
      gridMm={frame.gridMm}
      underlay={room ? underlay : undefined}
      backdrop={<line className="pointer-events-none" x1={-FLOOR_REACH_MM} x2={FLOOR_REACH_MM} y1={0} y2={0} stroke="var(--color-ink-soft)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
      overlay={(ctx) => (
        <>
          {/* Bodies of revolution, as their silhouettes, under their (clear) boxes. */}
          {boxes
            .filter((b) => b.revolve)
            .map((b) => (
              <polygon
                key={`sil-${b.id}`}
                className="pointer-events-none"
                points={revolveSilhouette(b.revolve!, (b.a0 + b.a1) / 2, (b.a1 - b.a0) / 2, b.z, b.h)
                  .map((p) => `${p.x},${-p.y}`)
                  .join(" ")}
                fill={showRoom ? "none" : (shapes[b.index].style?.fill ?? itemStyle?.fill ?? "var(--color-inset)")}
                stroke={selected.includes(b.id) ? "var(--color-accent)" : "var(--color-ink-soft)"}
                strokeWidth={selected.includes(b.id) ? 2 : 1.25}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          <StructureFeatures
            structure={{ ...emptyStructure(), features }}
            mm={ctx.mm}
            clientToMm={ctx.clientToMm}
            selectedIds={[...selected]}
            onSelect={(id, additive) => onSelect(additive ? (selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]) : selected.includes(id) ? [...selected] : [id])}
            onMove={(id, p) => {
              const i = boxes.findIndex((b) => b.id === id);
              if (i < 0) return;
              const r = rects[i];
              const group = selected.length > 1 && selected.includes(id);
              const at = ctx.snap(p, snapOpts(group ? selected : [id], { widthMm: r.widthMm, depthMm: r.depthMm }));
              if (!group) {
                apply(new Map([[id, { ...r, x: at.x, y: at.y }]]));
                return;
              }
              if (!groupDrag.current) groupDrag.current = { from: { x: r.x, y: r.y }, origins: new Map(boxes.filter((b) => selected.includes(b.id)).map((b) => [b.id, rects[b.index]])) };
              const g = groupDrag.current;
              const dx = at.x - g.from.x;
              const dy = at.y - g.from.y;
              apply(new Map([...g.origins].map(([k, o]) => [k, { ...o, x: o.x + dx, y: o.y + dy }])));
            }}
            onResize={(id, next) => {
              const i = boxes.findIndex((b) => b.id === id);
              if (i < 0) return;
              const before = rects[i];
              let { x, y, widthMm, depthMm } = next;
              // The edge being dragged is pulled onto the guides — a shelf's top to the counter's top;
              // the opposite edge stays where it was.
              if (Math.abs(depthMm - before.depthMm) > 0.5) {
                const down = Math.abs(y + depthMm / 2 - (before.y + before.depthMm / 2)) > Math.abs(y - depthMm / 2 - (before.y - before.depthMm / 2));
                const fixed = down ? y - depthMm / 2 : y + depthMm / 2;
                const moved = ctx.snap({ x, y: down ? y + depthMm / 2 : y - depthMm / 2 }, snapOpts([id])).y;
                depthMm = Math.abs(moved - fixed);
                y = (moved + fixed) / 2;
              }
              if (Math.abs(widthMm - before.widthMm) > 0.5) {
                const right = Math.abs(x + widthMm / 2 - (before.x + before.widthMm / 2)) > Math.abs(x - widthMm / 2 - (before.x - before.widthMm / 2));
                const fixed = right ? x - widthMm / 2 : x + widthMm / 2;
                const moved = ctx.snap({ x: right ? x + widthMm / 2 : x - widthMm / 2, y }, snapOpts([id])).x;
                widthMm = Math.abs(moved - fixed);
                x = (moved + fixed) / 2;
              }
              apply(new Map([[id, { x, y, widthMm, depthMm }]]));
            }}
            onCommit={() => {
              ctx.endSnap();
              groupDrag.current = null;
              onCommit();
            }}
          />
          {/* THE FIGURES — the selected box's height beside it, and how far its bottom stands off the
              floor beyond that. The plan's own dimension line. */}
          {ctx.dims && one && <BoxFigures box={one} mm={ctx.mm} />}
        </>
      )}
    />
  );
}

function BoxFigures({ box, mm }: { box: ElevationBox; mm: (px: number) => number }) {
  const gap = mm(14);
  const x = box.a1 + gap;
  return (
    <>
      <Dim a={{ x, y: -box.z }} b={{ x, y: -(box.z + box.h) }} text={`${cm(box.h)} ס״מ`} mm={mm} tone="accent" rtl />
      {box.z > 0 && <Dim a={{ x: x + 2 * gap, y: 0 }} b={{ x: x + 2 * gap, y: -box.z }} text={`${cm(box.z)} ס״מ`} mm={mm} tone="ink" rtl />}
    </>
  );
}
