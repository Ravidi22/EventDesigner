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
import { useCallback, useMemo, useRef, useState, type ComponentProps, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { RevolvePoint, ShapePart } from "@/lib/catalog/types";
import type { ElementStyle } from "@/lib/element-style";
import { ELEVATION_MIN_H_MM, boxGripSpots, boxRect, elevationBoxes, elevationFrame, handleSpots, orthoFrame, profileHandles, profilePoint, rectEdit, runsClearOf, type ElevationBox, type ElevationRect, type ElevationView } from "@/lib/element/elevation";
import { addedPoint, movedPoint, normalisedRevolve, removedPoint, revolveSilhouette } from "@/lib/element/revolve";
import { startPointerGesture } from "@/lib/studio/gesture";
import { PlanCanvas, type CanvasFocus, type CanvasLayerContext, type HostSnapOptions, type MarqueeMode } from "@/components/plan-canvas";
import { StructureFeatures } from "@/components/venue-plan";
import { Dim } from "@/components/venue-dims";
import { OutlinePath } from "@/components/footprint-shape";
import { emptyStructure, type StructureFeature } from "@/lib/venues/structure";
import { hitsInBox, mergeSelection } from "@/lib/venues/selection";
import { LazyOrthoUnderlay } from "@/components/scene/lazy";
import { useSettledScene, type SceneSubject } from "./scene-pane";

/** While a tile is armed no shape takes the pointer — the click places, whatever it lands on (a wave
 *  laid in front of the wall it covers; /halls' rule). */
const NEVER = () => false;

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
  /** The shapes whose body profile is an ENVELOPE (a chandelier's, an arrangement's, a chuppah's roof
   *  - lib/scene/items.ts PROFILE_IS_PICTURE): the room reads it as shares of its widest ring, so a
   *  profile gesture ends by rescaling it until that ring is 1 (normalisedRevolve). */
  envelopeIds?: readonly string[];
  /** The editor's canvas frame (padding, the least extent, the grid) — the plan's own. */
  frame: { padMm: number; minExtentMm: { w: number; h: number }; gridMm: number };
  /** A tile is armed on the rail (backdrops S2): a click on the canvas places it there. */
  onPlace?: (at: { x: number; y: number }) => void;
  /** A tile dropped from the rail. */
  onDropAt?: (e: ReactDragEvent, at: { x: number; y: number }) => void;
  /** A front shape being drawn (or redrawn) on this canvas: the outline editor's props, laid over the
   *  canvas's own as the plan canvas takes them; the shapes rest meanwhile. */
  drawing?: Partial<ComponentProps<typeof PlanCanvas>>;
}

export function ElevationCanvas({ view, shapes, itemHeightMm, itemStyle, selected, onSelect, onEdit, onCommit, history, room, roomShown, hidden = false, envelopeIds, frame, onPlace, onDropAt, drawing }: ElevationCanvasProps) {
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
        dash: b.outlineOnly || b.front?.asItself ? "dashed" : "solid",
        // Over the room the boxes are its outlines; a body of revolution is drawn as its silhouette,
        // and a front shape facing the viewer as its FACE, over a clear box.
        ...(showRoom || b.revolve || b.front?.asItself ? { fillOpacity: 0 } : {}),
        ...(b.front?.asItself ? { strokeOpacity: 0.35 } : {}),
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
  // The opening frame: every shape, the floor line, and room under it for the quick bar. The same
  // box is the first fit (framePoints) and - once per switch of view - a focus, because PlanCanvas
  // fits only once and a front frame is the wrong frame for the side.
  const viewBox = elevationFrame(boxes, frame.minExtentMm);
  const framePoints = [
    { x: viewBox.minX, y: viewBox.minY },
    { x: viewBox.maxX, y: viewBox.maxY },
  ];
  const [focusAt, setFocusAt] = useState<{ view: ElevationView; nonce: number }>({ view, nonce: 1 });
  if (focusAt.view !== view) setFocusAt({ view, nonce: focusAt.nonce + 1 });
  const focus: CanvasFocus = { minX: viewBox.minX - frame.padMm, minY: viewBox.minY - frame.padMm, maxX: viewBox.maxX + frame.padMm, maxY: viewBox.maxY + frame.padMm, nonce: focusAt.nonce, immediate: true };

  return (
    <PlanCanvas
      lengthUnit="cm"
      drawAngleStepDeg={45}
      drawAngleFromFirstSide
      drawAngleFree
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
      cursor={onPlace ? "crosshair" : "default"}
      onCanvasClick={(p) => (onPlace ? onPlace(p) : onSelect([]))}
      onDropAt={onDropAt}
      onCommit={onCommit}
      canUndo={history.canUndo}
      canRedo={history.canRedo}
      onUndo={history.onUndo}
      onRedo={history.onRedo}
      {...drawing}
      framePoints={framePoints}
      focus={focus}
      defaultDims
      padMm={frame.padMm}
      minExtentMm={frame.minExtentMm}
      gridMm={frame.gridMm}
      underlay={room ? underlay : undefined}
      backdrop={<line className="pointer-events-none" x1={-FLOOR_REACH_MM} x2={FLOOR_REACH_MM} y1={0} y2={0} stroke="var(--color-ink-soft)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
      topmost={(ctx) => (one?.revolve && !drawing ? <ProfileHandles box={one} ctx={ctx} onEdit={onEdit} onCommit={onCommit} envelope={!!envelopeIds?.includes(one.id)} /> : null)}
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
          {/* Front shapes facing the viewer, as their FACES (backdrops S2) — under their clear boxes,
              which take the pointer, the moves and the resizes. A shape being redrawn is left out. */}
          {boxes
            .filter((b) => b.front?.asItself)
            .map((b) => (
              <g key={`face-${b.id}`} className="pointer-events-none">
                {b.front!.pieces.map((o, i) => (
                  <OutlinePath
                    key={i}
                    outline={o.outline}
                    edgeCurves={o.edgeCurves}
                    open={o.open}
                    fill={showRoom ? "none" : (shapes[b.index].style?.fill ?? itemStyle?.fill ?? "var(--color-inset)")}
                    stroke={selected.includes(b.id) ? "var(--color-accent)" : "var(--color-ink-soft)"}
                    strokeWidth={selected.includes(b.id) ? 2 : 1.25}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            ))}
          {!drawing && (
          <StructureFeatures
            structure={{ ...emptyStructure(), features }}
            mm={ctx.mm}
            clientToMm={ctx.clientToMm}
            minSizeMm={ELEVATION_MIN_H_MM}
            interactive={onPlace ? NEVER : undefined}
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
          )}
          {/* THE FIGURES — the selected box's height beside it, and how far its bottom stands off the
              floor beyond that. The plan's own dimension line. */}
          {ctx.dims && one && <BoxFigures box={one} mm={ctx.mm} />}
        </>
      )}
    />
  );
}

/** THE GOF SHAPED ON THE VIEW — the selected box's profile as handles on its silhouette's right
 *  half: dragged (the first and last slide sideways only — movedPoint holds their height), a click on
 *  the outline adds a point, a double-click on a middle one takes it out. Painted in PlanCanvas's
 *  `topmost` layer so nothing covers them; the press stops here, so the box under never starts to
 *  move. A drag is one undo entry (live `onEdit`, `onCommit` at the release); an add or a removal
 *  is its own. */
function ProfileHandles({ box, ctx, onEdit, onCommit, envelope }: { box: ElevationBox; ctx: CanvasLayerContext; onEdit: ElevationCanvasProps["onEdit"]; onCommit: () => void; envelope: boolean }) {
  const points = box.revolve!;
  const handles = profileHandles(box);
  const set = (revolve: RevolvePoint[]) => onEdit((list) => list.map((s) => (s.id === box.id ? { ...s, revolve } : s)));
  // An envelope is stored as the room reads it - its widest ring is 1 (review F3). Shown raw while a
  // handle is dragged; settled in the same undo entry when the gesture, add or removal ends.
  const settle = (revolve: RevolvePoint[]) => set(envelope ? normalisedRevolve(revolve) : revolve);
  const sil = revolveSilhouette(points, (box.a0 + box.a1) / 2, (box.a1 - box.a0) / 2, box.z, box.h);
  const side = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  // The two sides of the body alone — the foot and the top are not the profile.
  // …and only where it stays off the box's own grips (its corners and edge midpoints, which a body
  // as wide as its box — a basin, a ball's widest ring — would otherwise sit under).
  const spots = boxGripSpots(box);
  // A handle on a grip is drawn beside it (QA VS-6); `shown[i]` is where handle i is pressed.
  const shown = handleSpots(handles, spots, ctx.mm(12), (box.a0 + box.a1) / 2);
  const outline = [sil.slice(0, points.length), sil.slice(points.length).reverse()].flatMap((pts) =>
    runsClearOf(
      pts.map((p) => ({ x: p.x, y: -p.y })),
      spots,
      ctx.mm(12),
    ),
  );

  const drag = (e: ReactPointerEvent<SVGElement>, i: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    let latest = points;
    // Drawn beside its point, the handle carries that offset: the point moves with the pointer, it
    // does not jump to it.
    const off = { x: shown[i].x - handles[i].x, y: shown[i].y - handles[i].y };
    startPointerGesture(e, {
      onMove: (m) => {
        const at = ctx.clientToMm(m.clientX, m.clientY);
        const q = profilePoint(box, { x: at.x - off.x, y: at.y - off.y });
        latest = movedPoint(points, i, q.r, q.z);
        set(latest);
      },
      onEnd: (_e, moved) => {
        if (!moved) return;
        if (envelope) settle(latest);
        onCommit();
      },
    });
  };

  return (
    <g>
      {outline.map((pts, k) => (
        <path
          key={k}
          d={side(pts)}
          fill="none"
          stroke="transparent"
          strokeWidth={ctx.mm(8)}
          strokeLinejoin="round"
          pointerEvents="stroke"
          style={{ cursor: "copy" }}
          onPointerDown={(e) => {
            if (e.button === 0) e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (e.detail > 1) return;
            const q = profilePoint(box, ctx.clientToMm(e.clientX, e.clientY));
            settle(addedPoint(points, q.r, q.z));
            onCommit();
          }}
        />
      ))}
      {shown.map((h, i) => {
        const end = i === 0 || i === handles.length - 1;
        return (
          <circle
            key={i}
            cx={h.x}
            cy={h.y}
            r={ctx.mm(5)}
            className="fill-surface stroke-accent hover:fill-accent-wash"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: end ? "ew-resize" : "move" }}
            onPointerDown={(e) => drag(e, i)}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (end) return;
              settle(removedPoint(points, i));
              onCommit();
            }}
            onClick={(e) => e.stopPropagation()}
          />
        );
      })}
    </g>
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
