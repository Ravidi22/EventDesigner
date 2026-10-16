"use client";

import { useRef, useState } from "react";
import type { Point, StageBuild, StageStair } from "@/lib/design-document/types";
import {
  MIN_EDGE_ITEM_MM,
  edgeGaps,
  edgeItemShape,
  freeStretch,
  itemAlong,
  itemEdge,
  itemSidePoint,
  itemSpan,
  stageCorners,
  stageSide,
  toRoom,
  type DeckLookup,
  type EdgeRun,
  type StagePlacement,
  type WallDistance,
} from "@/lib/design-document/stage";
import { startPointerGesture } from "@/lib/studio/gesture";
import { WalkingLine, slopeTextSize } from "@/components/climb-glyph";

// A stage's EDGE ITEMS — its flights of stairs and its ramps — on a plan: how they are drawn, how
// they are taken hold of, and the lines a new one is clicked onto.
//
// ONE implementation for the two canvases that have a stage. The sketch's stage (a Placement with a
// StageBuild) and the venue's built stage (a StructureFeature read as a StageBuild — lib/venues/
// structure.ts featureStage) are the same object to everything in here: the user asked for the
// venue's stairs to be EXACTLY the sketch's — on a round rim, under the pointer, in the panel — and
// the only way two drags are exactly alike is to be one drag. The studio canvas imports these; it
// used to hold them itself.
//
// Drawn and dragged in the stage's own frame carried out to the room by `toRoom` (the placement's
// position, turn and flip), so a turned stage's flights turn with it.

/** The stage's stairs and ramps (and whatever else stands on its edges), drawn in the STAGE'S
 *  frame — the caller puts this inside the stage's own translate/rotate group. */
export function EdgeItemsDrawing({
  stage,
  deckOf,
  rotation,
  mirrored,
  labelMm,
  activeItem,
  gaps,
}: {
  stage: StageBuild;
  deckOf: DeckLookup;
  /** The stage's own turn and flip — so a ramp's slope, written along its walking line, reads
   *  upright on screen. */
  rotation: number;
  mirrored?: boolean;
  /** The size a ramp's slope is written at, in world mm (a fixed size on screen). Absent = not
   *  written: the surface is too far out to read it. */
  labelMm?: number;
  activeItem?: string | null;
  /** What nothing covers yet — an edge somebody can walk off — in red. */
  gaps?: EdgeRun[];
}) {
  return (
    <g>
      {(stage.stairs ?? []).map((st) => {
        const shape = edgeItemShape(stage, st, deckOf);
        if (!shape) return null;
        const on = st.id === activeItem;
        const stroke = on ? "var(--color-accent)" : "var(--color-ink-soft)";
        const fill = shape.kind === "bench" ? "var(--color-accent-tint)" : "var(--color-surface)";
        if (shape.kind === "barrier" || shape.kind === "backdrop") {
          return (
            <polygon
              key={st.id}
              points={shape.polygon.map((q) => `${q.x},${q.y}`).join(" ")}
              fill={on ? "var(--color-accent)" : shape.kind === "backdrop" ? "var(--color-ink)" : "var(--color-ink-soft)"}
              fillOpacity={shape.kind === "backdrop" && !on ? 0.75 : 1}
              stroke={stroke}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        const slope = labelMm !== undefined ? Math.min(labelMm, slopeTextSize(shape.widthMm, shape.depthMm)) : undefined;
        return (
          // Outside the stage's outline, so its own hit area: a click on the stairs is a click on the
          // stage (select it, drag it) — not on the floor behind.
          <g key={st.id} style={{ pointerEvents: "visiblePainted" }}>
            <polygon
              points={shape.polygon.map((q) => `${q.x},${q.y}`).join(" ")}
              fill={fill}
              fillOpacity={1}
              stroke={on ? "var(--color-accent)" : "var(--color-border)"}
              strokeWidth={on ? 2.5 : 1.5}
              vectorEffect="non-scaling-stroke"
            />
            {shape.treads.map(([u, v], k) => (
              <line key={k} x1={u.x} y1={u.y} x2={v.x} y2={v.y} stroke="var(--color-ink-soft)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {/* A flight's or a ramp's walking line — the dot at the foot, the arrowhead onto the deck,
                a ramp's slope on it — the same picture a flight from the catalog is drawn with
                (components/climb-glyph.tsx). The slope is left off once it would be too small. */}
            {shape.climb && (
              <WalkingLine
                arrow={shape.climb.arrow}
                slope={shape.climb.slope}
                ink={stroke}
                lineWidth={1}
                fill={fill}
                textSize={slope !== undefined && labelMm !== undefined && slope >= labelMm * 0.6 ? slope : undefined}
                textFill={stroke}
                alertFill="var(--color-alert-ink)"
                turnDeg={rotation}
                mirrored={mirrored}
              />
            )}
          </g>
        );
      })}
      {/* Corner pieces where two runs of stairs meet outside a corner. */}
      {stageCorners(stage, deckOf).map((c, i) => (
        <g key={`corner-${i}`}>
          <polygon
            points={c.polygon.map((q) => `${q.x},${q.y}`).join(" ")}
            fill={c.kind === "bench" ? "var(--color-accent-tint)" : "var(--color-surface)"}
            fillOpacity={c.kind === "bench" ? 0.7 : 1}
            stroke="var(--color-border)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          {c.treads.map(([u, v], k) => (
            <line key={k} x1={u.x} y1={u.y} x2={v.x} y2={v.y} stroke="var(--color-ink-soft)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      ))}
      {/* What nothing covers yet — an edge somebody can walk off. Only while the stage is selected,
          where the bar offers to finish it. */}
      {(gaps ?? []).map((g, i) => (
        <polyline
          key={`gap-${i}`}
          points={g.path.map((q) => `${q.x},${q.y}`).join(" ")}
          fill="none"
          stroke="var(--color-alert)"
          strokeWidth={3}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
          className="pointer-events-none"
        />
      ))}
    </g>
  );
}

/** The bare stretches of a stage's edges, for EdgeItemsDrawing's `gaps`. */
export function stageGaps(p: StagePlacement, deckOf: DeckLookup, wallDistance?: WallDistance): EdgeRun[] {
  return edgeGaps(p, deckOf, wallDistance);
}

/** The sides a new edge item may be clicked onto, in the room: the stage's own, and each level's. */
export function stagePickLines(p: StagePlacement): { level?: string; edge: number; a: Point; b: Point }[] {
  const out: { level?: string; edge: number; a: Point; b: Point }[] = [];
  const edges = (outline: Point[], level?: string) =>
    outline.forEach((_, i) => out.push({ level, edge: i, a: toRoom(p, outline[i]), b: toRoom(p, outline[(i + 1) % outline.length]) }));
  edges(p.stage.outline);
  for (const l of p.stage.levels ?? []) edges(l.outline, l.id);
  return out;
}

/** The sides of a stage lit up for a new edge item: a click on one reports which edge, and how far
 *  along it. In the room. */
export function EdgePickLines({
  lines,
  clientToMm,
  onPick,
  title = "להציב כאן מדרגות",
}: {
  lines: { level?: string; edge: number; a: Point; b: Point }[];
  clientToMm: (clientX: number, clientY: number) => Point;
  onPick: (level: string | undefined, edge: number, t: number) => void;
  title?: string;
}) {
  return (
    <g>
      {lines.map((e, i) => (
        <g key={i}>
          <line className="pointer-events-none" x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} stroke="var(--color-accent)" strokeWidth={3} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          <line
            x1={e.a.x}
            y1={e.a.y}
            x2={e.b.x}
            y2={e.b.y}
            stroke="transparent"
            strokeWidth={18}
            vectorEffect="non-scaling-stroke"
            className="cursor-pointer"
            style={{ pointerEvents: "stroke" }}
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={(ev) => {
              ev.stopPropagation();
              const p = clientToMm(ev.clientX, ev.clientY);
              const dx = e.b.x - e.a.x;
              const dy = e.b.y - e.a.y;
              const l2 = dx * dx + dy * dy || 1;
              const t = Math.max(0, Math.min(1, ((p.x - e.a.x) * dx + (p.y - e.a.y) * dy) / l2));
              onPick(e.level, e.edge, t);
            }}
          >
            <title>{title}</title>
          </line>
        </g>
      ))}
    </g>
  );
}

/** A selected stage's edge items under the pointer: click one to edit it, drag its body to slide it
 *  along its side (snapping to the ends and the middle, held between its neighbours, round a closed
 *  rim as far as it likes), drag a grip at either end for its width (trimming a neighbour it is pushed
 *  into — against the items as they stood when the press began, so pulling back gives the neighbour
 *  back), and a banquette's foot for its depth. A live readout rides the grip. */
export function EdgeItemHandles({
  p,
  deckOf,
  clientToMm,
  mm,
  active,
  onSelect,
  onChange,
  onEnd,
}: {
  p: StagePlacement;
  deckOf: DeckLookup;
  clientToMm: (clientX: number, clientY: number) => Point;
  /** Screen px → world mm at the current zoom. */
  mm: (px: number) => number;
  active: string | null;
  onSelect: (itemId: string | null) => void;
  /** `from` is the stage's items as they stood when the press began — a grip pushed into a neighbour
   *  trims it against THAT, so pulling back gives the neighbour back (lib/design-document/stage.ts
   *  shareSide). Absent on a slide, which never trims. */
  onChange: (item: StageStair, from?: StageStair[]) => void;
  onEnd: () => void;
}) {
  const start = useRef<{ item: StageStair; grab: number; from: number; to: number; at: Point; moved: boolean; free: { from: number; to: number } | null; items: StageStair[]; last?: number } | null>(null);
  /** The width or depth under the pointer, on a pill beside the grip, while one is being dragged. */
  const [readout, setReadout] = useState<{ at: Point; text: string } | null>(null);
  const SNAP = 150;
  /** Pointer travel before a press is a drag — the canvas's own DRAG_THRESHOLD_PX. */
  const DRAG_PX = 4;
  /** A grip's centre stands GAP_PX past the item and its hit circle reaches HIT_PX: GAP_PX ≥ HIT_PX
   *  is what keeps a press anywhere on the body off the grip. */
  const GAP_PX = 10;
  const HIT_PX = 9;
  const toFrame = (r: Point): Point => {
    const t = ((p.rotation || 0) * Math.PI) / 180;
    const dx = r.x - p.position.x;
    const dy = r.y - p.position.y;
    const x = dx * Math.cos(t) + dy * Math.sin(t);
    const y = -dx * Math.sin(t) + dy * Math.cos(t);
    return { x: p.mirrored ? -x : x, y };
  };
  /** A point under the pointer, as mm along an item's side (and out from it) — round a curve too. */
  const along = (item: StageStair, clientX: number, clientY: number) => itemAlong(p.stage, item, toFrame(clientToMm(clientX, clientY)));
  const snapEnd = (v: number, L: number) => (v < SNAP ? 0 : v > L - SNAP ? L : Math.abs(v - L / 2) < SNAP ? L / 2 : Math.round(v / 50) * 50);
  /** A position on a closed rim, read on the turn nearest `ref` — a pointer just past the seam is
   *  L+10 to a grip at L−100, not 10. */
  const unwrap = (s: number, ref: number, L: number) => s + L * Math.round((ref - s) / L);
  const write = (item: StageStair, from: number, to: number, L: number, closed: boolean, base?: StageStair[]) => {
    const mid = (from + to) / 2;
    const full = closed ? to - from >= L - 1 : from <= 1 && to >= L - 1;
    onChange({ ...item, t: (closed ? ((mid % L) + L) % L : mid) / L, widthMm: Math.round(to - from), full: full || undefined }, base);
  };
  /** Has this press travelled far enough to be a drag (and stays one once it has). */
  const armed = (st: NonNullable<typeof start.current>, ev: { clientX: number; clientY: number }) => {
    if (!st.moved && Math.hypot(ev.clientX - st.at.x, ev.clientY - st.at.y) >= DRAG_PX) st.moved = true;
    return st.moved;
  };
  const unit = (a: Point, b: Point): Point => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  const past = (q: Point, d: Point, k: number): Point => ({ x: q.x + d.x * k, y: q.y + d.y * k });
  const cm = (v: number) => `${Math.round(v / 10)} ס״מ`;
  const release = () => {
    const st = start.current;
    start.current = null;
    setReadout(null);
    // One undo entry per press that moved something — a click opened none.
    if (st?.moved) onEnd();
  };
  /** A grip taking hold; and what each frame of its drag reads — the gesture, once past the
   *  threshold, and the pointer along the item's side. Up here, not in the grips' block below: the
   *  ref is only ever touched from a handler. */
  const hold = (st: NonNullable<typeof start.current>) => {
    start.current = st;
  };
  const pull = (ev: { clientX: number; clientY: number }) => {
    const st = start.current;
    if (!st || !armed(st, ev)) return null;
    const a = along(st.item, ev.clientX, ev.clientY);
    return a && { st, a };
  };
  const items = p.stage.stairs ?? [];
  return (
    <g>
      {items.map((item) => {
        const shape = edgeItemShape(p.stage, item, deckOf);
        const span = itemSpan(p.stage, item);
        const e = itemEdge(p.stage, item);
        if (!shape || !span || !e) return null;
        const room = shape.polygon.map((q) => toRoom(p, q));
        const closed = !!stageSide(p.stage, item.level, item.edge)?.closed;
        const edgePt = (v: number) => toRoom(p, itemSidePoint(p.stage, item, v) ?? e.a);
        // Its stretch of the edge, as a line to hold it by (following a curved side).
        const held = Array.from({ length: 17 }, (_, k) => edgePt(span.from + ((span.to - span.from) * k) / 16));
        const slide = (ev: { clientX: number; clientY: number }) => {
          const st = start.current;
          if (!st || !armed(st, ev)) return;
          const a = along(st.item, ev.clientX, ev.clientY);
          if (!a) return;
          const w = st.to - st.from;
          let from = st.from + a.s - st.grab;
          // Round a closed rim the pointer crosses the seam: read this frame's position on the lap
          // nearest the last one, so a slide may go on round as far as it likes.
          if (closed) {
            from = unwrap(from, st.last ?? st.from, a.L);
            st.last = from;
          }
          if (!closed) {
            // Held between the corners, and pulled to them and to the middle. A closed rim has
            // neither — the item goes round, and `write` wraps it.
            from = Math.max(0, Math.min(a.L - w, from));
            if (from < SNAP) from = 0;
            else if (a.L - (from + w) < SNAP) from = a.L - w;
            else if (Math.abs(from + w / 2 - a.L / 2) < SNAP) from = a.L / 2 - w / 2;
          }
          // …and held between its NEIGHBOURS on the side: a slide stops against the next item and
          // is pulled flush to it, never through it (freeStretch, read when the press began).
          if (st.free) {
            from = Math.max(st.free.from, Math.min(st.free.to - w, from));
            if (from - st.free.from < SNAP) from = st.free.from;
            else if (st.free.to - (from + w) < SNAP) from = st.free.to - w;
          }
          write(st.item, from, from + w, a.L, closed);
        };
        const press = (ev: React.PointerEvent) => {
          ev.stopPropagation();
          onSelect(item.id);
          const a = along(item, ev.clientX, ev.clientY);
          const free = freeStretch(p.stage, item);
          if (a) start.current = { item, grab: a.s, from: span.from, to: span.to, at: { x: ev.clientX, y: ev.clientY }, moved: false, free: free && free.to - free.from < Infinity ? { from: free.from, to: free.to } : null, items: p.stage.stairs ?? [] };
          startPointerGesture(ev, { onMove: slide, onEnd: release });
        };
        return (
          <g key={item.id}>
            {/* The item itself: click to edit, drag to slide along its side. A barrier is too thin to
                hit, so it is held by a fat invisible line instead of its outline. */}
            {shape.kind === "barrier" || shape.kind === "backdrop" ? (
              <polyline
                points={held.map((q) => `${q.x},${q.y}`).join(" ")}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: "stroke" }}
                className="cursor-move touch-none"
                onPointerDown={press}
                onClick={(ev) => ev.stopPropagation()}
              />
            ) : (
              <polygon
                points={room.map((q) => `${q.x},${q.y}`).join(" ")}
                fill="transparent"
                className="cursor-move touch-none"
                onPointerDown={press}
                onClick={(ev) => ev.stopPropagation()}
              />
            )}
          </g>
        );
      })}
      {/* The active item's grips — after every body, so no neighbour covers them. A map, not an
          IIFE: a function called in render may not touch the ref the handlers below write. */}
      {items
        .filter((item) => item.id === active)
        .map((item) => {
          const shape = edgeItemShape(p.stage, item, deckOf);
          const span = itemSpan(p.stage, item);
          const e = itemEdge(p.stage, item);
          if (!shape || !span || !e) return null;
          const closed = !!stageSide(p.stage, item.level, item.edge)?.closed;
          const edgePt = (v: number) => toRoom(p, itemSidePoint(p.stage, item, v) ?? e.a);
          const gap = mm(GAP_PX);
          const hit = mm(HIT_PX);
          const r = mm(6);
          const fromPt = edgePt(span.from);
          const toPt = edgePt(span.to);
          // Out past each end along the side (its tangent there, on a curve) — and past a
          // banquette's foot, out from the edge the way the item stands.
          const fromDir = unit(edgePt(span.from + 20), fromPt);
          const toDir = unit(edgePt(span.to - 20), toPt);
          const base = toRoom(p, shape.base);
          const foot = toRoom(p, shape.foot);
          const outDir = unit(base, foot);
          // The readout stands across the edge from the body, on the side nothing of it is on.
          const beside = (q: Point) => past(q, outDir, -mm(20));
          // What a grip takes hold of.
          const grabbed = (ev: React.PointerEvent) => ({ item, grab: 0, from: span.from, to: span.to, at: { x: ev.clientX, y: ev.clientY }, moved: false, free: null, items: p.stage.stairs ?? [] });
          return (
            <g key={item.id}>
              <EdgeGrip
                at={past(fromPt, fromDir, gap)}
                r={r}
                hit={hit}
                label="קצה — גרירה לשינוי הרוחב"
                cursor="cursor-ew-resize"
                onBegin={(ev) => hold(grabbed(ev))}
                onRelease={release}
                onDrag={(ev) => {
                  const got = pull(ev);
                  if (!got) return;
                  const { st, a } = got;
                  const s = closed ? unwrap(a.s, st.from, a.L) : a.s;
                  const from = Math.min(st.to - MIN_EDGE_ITEM_MM, closed ? Math.max(st.to - a.L, Math.round(s / 50) * 50) : Math.max(0, snapEnd(s, a.L)));
                  write(st.item, from, st.to, a.L, closed, st.items);
                  setReadout({ at: beside(edgePt(from)), text: cm(st.to - from) });
                }}
              />
              <EdgeGrip
                at={past(toPt, toDir, gap)}
                r={r}
                hit={hit}
                label="קצה — גרירה לשינוי הרוחב"
                cursor="cursor-ew-resize"
                onBegin={(ev) => hold(grabbed(ev))}
                onRelease={release}
                onDrag={(ev) => {
                  const got = pull(ev);
                  if (!got) return;
                  const { st, a } = got;
                  const s = closed ? unwrap(a.s, st.to, a.L) : a.s;
                  const to = Math.max(st.from + MIN_EDGE_ITEM_MM, closed ? Math.min(st.from + a.L, Math.round(s / 50) * 50) : Math.min(a.L, snapEnd(s, a.L)));
                  write(st.item, st.from, to, a.L, closed, st.items);
                  setReadout({ at: beside(edgePt(to)), text: cm(to - st.from) });
                }}
              />
              {shape.kind === "bench" && (
                <EdgeGrip
                  at={past(foot, outDir, gap)}
                  r={r}
                  hit={hit}
                  label="עומק הבנקט — גרירה"
                  cursor="cursor-ns-resize"
                  onBegin={(ev) => hold(grabbed(ev))}
                  onRelease={release}
                  onDrag={(ev) => {
                    const got = pull(ev);
                    if (!got) return;
                    const { st, a } = got;
                    // Out from the edge — or, an inner banquette, in from it.
                    const depth = Math.max(250, Math.min(1500, Math.round((shape.inner ? -a.o : a.o) / 50) * 50));
                    onChange({ ...st.item, depthMm: depth });
                    setReadout({ at: past(base, outDir, depth + mm(20)), text: cm(depth) });
                  }}
                />
              )}
            </g>
          );
        })}
      {readout &&
        (() => {
          // The area tool's pill: the one number the designer is dragging TO.
          const font = mm(11);
          const w = font * (readout.text.length * 0.62 + 1.2);
          return (
            <g className="pointer-events-none" transform={`translate(${readout.at.x} ${readout.at.y})`}>
              <rect x={-w / 2} y={-font * 0.85} width={w} height={font * 1.7} rx={font * 0.85} fill="var(--color-accent)" stroke="var(--color-canvas)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <text textAnchor="middle" dominantBaseline="central" fill="var(--color-canvas)" style={{ fontSize: font, fontWeight: 600 }} className="nums">
                {readout.text}
              </text>
            </g>
          );
        })()}
    </g>
  );
}

/** One round grip of an edge item: a puck in accent with a white ring, under a wider invisible circle
 *  that takes the pointer — captures it, reports the drag, lets go. */
function EdgeGrip({
  at,
  r,
  hit,
  label,
  cursor,
  onBegin,
  onDrag,
  onRelease,
}: {
  at: Point;
  r: number;
  hit: number;
  label: string;
  cursor: string;
  onBegin: (e: React.PointerEvent) => void;
  onDrag: (e: PointerEvent) => void;
  onRelease: () => void;
}) {
  return (
    <g>
      <circle cx={at.x} cy={at.y} r={r} fill="var(--color-accent)" stroke="var(--color-canvas)" strokeWidth={2} vectorEffect="non-scaling-stroke" className="pointer-events-none" />
      <circle
        cx={at.x}
        cy={at.y}
        r={hit}
        fill="transparent"
        className={cursor + " touch-none focus:outline-none"}
        role="button"
        tabIndex={0}
        aria-label={label}
        onPointerDown={(e) => {
          e.stopPropagation();
          onBegin(e);
          startPointerGesture(e, { onMove: onDrag, onEnd: onRelease });
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </g>
  );
}
