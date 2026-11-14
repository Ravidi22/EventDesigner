"use client";
// Drawing a free-standing ROD for a curtain — "וילון על מוט" (spec 2026-11-07 §6.2): the first click
// puts the first post, each further click a bend (another post), Enter or a double-click ends it.
// The stage area tool's gesture, on purpose: the first side held to the room's 45° grid, every later
// one to that grid and along or square to the first side (lib/studio/stage-draw.ts), whole 10cm,
// Alt frees, digits typed then Enter lay a side of exactly that length in cm. Escape cancels;
// Backspace takes the last post back.
//
// The sketch and /halls both mount it as a layer of their PlanCanvas (the layer's `ctx`), and both
// hand the finished points to their own write — a drape placement's rail, the venue curtain's. The
// line under the pointer is written to the DOM by ref, never by a setState per pointermove (the
// canvas performance rules, CLAUDE.md "The camera is a transform").
//
// The same pane draws the other cloth in the air (spec 2026-11-07 §6.3/§6.4, lib/studio/ceiling-
// cloth.ts), one option at a time rather than a second pane: a ceiling drape's RUN is two clicks
// (`maxPoints: 2`), a CANOPY an area (`closed` — a click on the first point, or Enter with three or
// more, closes it), a SAIL three or four ties (`closed`, `maxPoints: 4`) each landing where `snap`
// puts it — a wall, a thing's corner, a post — instead of on the 45° steps. With none of them it is
// the rod tool it always was.
//
// `drag` (2026-11-13, the user: "drag it from point to point"): a PRESS-DRAG draws a swag in one
// gesture — the press is its first end (or the one already put), the release its last. A press that
// never travels is still the click it was, so two clicks draw it too.
import { useEffect, useRef, useState } from "react";
import type { Point } from "@/lib/studio/hall";
import type { CanvasLayerContext } from "@/components/plan-canvas";
import { constrainNext, firstSideAngles, laterSideAngles } from "@/lib/studio/stage-draw";
import { isTypingTarget } from "@/lib/keyboard";
import { startPointerGesture } from "@/lib/studio/gesture";

/** A rod shorter than this is a slip of the mouse, not a rod. */
const MIN_ROD_MM = 300;
/** …and an area smaller than this (0.1 m²) is a slip, not an area. */
const MIN_AREA_MM2 = 100_000;
/** How close (screen px) a click has to land on the first point to close an area — the canvas's own. */
const CLOSE_PX = 16;

/** Where a point of a cloth lands (a sail's tie): the point, and whether it is TIED to something (a
 *  wall, a thing's corner — drawn as a ring) or stands on a post of its own. */
export interface DrawSnap {
  p: Point;
  tied: boolean;
}

export function RodDrawPane({
  ctx,
  start,
  onFinish,
  onCancel,
  closed,
  maxPoints,
  minPoints,
  snap,
  drag,
}: {
  ctx: CanvasLayerContext;
  /** The first post, when the click that started the tool already put it (/halls' armed tool). */
  start?: Point;
  /** The rod's points, in order (at least two). `keep`: Shift was held on the last of them — the host
   *  may go on to draw another. */
  onFinish: (points: Point[], keep?: boolean) => void;
  onCancel: () => void;
  /** An AREA (a canopy, a sail): closed by a click on its first point or by Enter. */
  closed?: boolean;
  /** Ends by itself on this many points — a run's two, a sail's four. */
  maxPoints?: number;
  /** Fewer is no shape. Absent = two, or three when `closed`. */
  minPoints?: number;
  /** Where a click lands, in place of the 45° steps and typed lengths (`free` = Alt held). */
  snap?: (raw: Point, free: boolean) => DrawSnap;
  /** A press-drag draws it: press = the first point, release = the last. */
  drag?: boolean;
}) {
  const [pts, setPts] = useState<Point[]>(() => (start ? [snap ? snap(start, false).p : { x: Math.round(start.x), y: Math.round(start.y) }] : []));
  const [typed, setTyped] = useState("");
  const pointer = useRef<{ x: number; y: number; alt: boolean } | null>(null);
  const live = useRef<SVGPolylineElement>(null);
  const readout = useRef<SVGTextElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const fewest = minPoints ?? (closed ? 3 : 2);

  /** Where the next post goes from the pointer (or a typed length along its direction). */
  const nextPoint = (clientX: number, clientY: number, free: boolean, typedMm?: number, base: Point[] = pts): Point => {
    const raw = ctx.clientToMm(clientX, clientY);
    if (snap) return snap(raw, free).p;
    const last = base[base.length - 1];
    if (!last) {
      const s = ctx.snap(raw);
      return { x: Math.round(s.x), y: Math.round(s.y) };
    }
    const first = base[0];
    const ref = base.length >= 2 ? laterSideAngles((Math.atan2(base[1].y - first.y, base[1].x - first.x) * 180) / Math.PI) : firstSideAngles(null);
    return constrainNext(last, raw, ref, { free, typedMm, snapLength: (mm) => Math.max(100, Math.round(mm / 100) * 100) });
  };

  const paint = () => {
    const at = pointer.current;
    const el = live.current;
    if (!el) return;
    const last = pts[pts.length - 1];
    if (!at || !last) {
      el.setAttribute("points", "");
      readout.current?.setAttribute("visibility", "hidden");
      return;
    }
    const cm = parseFloat(typed);
    const q = nextPoint(at.x, at.y, at.alt, typed && cm > 0 ? cm * 10 : undefined);
    // An area shows the side that would close it too, back to its first point.
    el.setAttribute("points", closed && pts.length >= 2 ? `${last.x},${last.y} ${q.x},${q.y} ${pts[0].x},${pts[0].y}` : `${last.x},${last.y} ${q.x},${q.y}`);
    // A tie that lands on something wears a ring — a wall, a corner — and a post wears none.
    const mark = ring.current;
    if (mark) {
      const tied = snap ? snap(ctx.clientToMm(at.x, at.y), at.alt).tied : false;
      mark.setAttribute("visibility", tied ? "visible" : "hidden");
      mark.setAttribute("cx", String(q.x));
      mark.setAttribute("cy", String(q.y));
    }
    const t = readout.current;
    if (t) {
      t.setAttribute("visibility", "visible");
      t.setAttribute("x", String(q.x + ctx.mm(10)));
      t.setAttribute("y", String(q.y - ctx.mm(10)));
      t.textContent = typed ? `${typed} ס״מ` : `${(Math.hypot(q.x - last.x, q.y - last.y) / 1000).toFixed(2)} מ׳`;
    }
  };

  const finish = (points: Point[], keep?: boolean) => {
    const clean = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 1);
    const length = clean.slice(1).reduce((n, q, i) => n + Math.hypot(q.x - clean[i].x, q.y - clean[i].y), 0);
    ctx.endSnap();
    setPts([]);
    setTyped("");
    // An area closes on its first point: a last point dropped on it is the closing click, not a corner.
    const shape = closed && clean.length > 3 && Math.hypot(clean[0].x - clean[clean.length - 1].x, clean[0].y - clean[clean.length - 1].y) <= 1 ? clean.slice(0, -1) : clean;
    const big = closed ? Math.abs(shoelace(shape)) >= MIN_AREA_MM2 : length >= MIN_ROD_MM;
    if (shape.length >= fewest && big) onFinish(shape, keep);
    else onCancel();
  };

  /** A point put at the pointer: an area closes on a click by its first point; a shape that takes a
   *  fixed number of points (a run's two, a sail's four) ends on the last of them. */
  const add = (q: Point, clientX: number, clientY: number, keep?: boolean) => {
    const first = pts[0];
    if (closed && first && pts.length >= fewest) {
      const fp = ctx.clientToMm(clientX, clientY);
      if (Math.hypot(fp.x - first.x, fp.y - first.y) <= ctx.mm(CLOSE_PX)) {
        finish(pts);
        return;
      }
    }
    const next = [...pts, q];
    if (maxPoints && next.length >= maxPoints) finish(next, keep);
    else setPts(next);
  };

  // Taken in the CAPTURE phase and stopped there, as the stage tool's keys are: the host's own window
  // listener would otherwise read Backspace as "delete the selection" and Escape as "deselect".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A field has the keys (the drape's ״מסילה״ fields stay up in the end panel while it is drawn)
      // and so does a dialog over the plan. Escape goes on to the host's handler, which only blurs
      // the field (lib/keyboard.ts escapeLeavesField); the next one is the tool's.
      if (isTypingTarget() || (e.target instanceof Element && !!e.target.closest("dialog"))) return;
      // (A snapped tool — a sail's ties — takes no typed lengths: a tie is where it is tied.)
      if (/^[0-9.]$/.test(e.key) && pts.length > 0 && !snap) setTyped((t) => (t.length < 6 ? t + e.key : t));
      else if (e.key === "Enter") {
        const cm = parseFloat(typed);
        const at = pointer.current;
        if (typed && cm > 0 && at) {
          const next = [...pts, nextPoint(at.x, at.y, at.alt, cm * 10)];
          if (maxPoints && next.length >= maxPoints) finish(next);
          else setPts(next);
          setTyped("");
        } else finish(pts);
      } else if (e.key === "Escape") {
        if (typed) setTyped("");
        else {
          ctx.endSnap();
          onCancel();
        }
      } else if (e.key === "Backspace" || e.key === "Delete") {
        if (typed) setTyped((t) => t.slice(0, -1));
        else setPts((cur) => cur.slice(0, -1));
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // nextPoint and finish read pts, which is in the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, typed, onCancel]);
  // A post added or a digit typed: the live line follows at once, not on the next move.
  useEffect(paint);

  const post = ctx.mm(6);
  return (
    <g>
      <rect
        x={-1e7}
        y={-1e7}
        width={2e7}
        height={2e7}
        fill="transparent"
        className={"cursor-crosshair" + (drag ? " touch-none" : "")}
        // The left button draws and nothing else; the middle still pans the canvas mid-rod.
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          if (!drag) return;
          // A press-drag: from the point already put, else from the press itself, to the release.
          const from = pts.length ? pts : [nextPoint(e.clientX, e.clientY, e.altKey, undefined, [])];
          startPointerGesture(e, {
            onStart: () => {
              if (!pts.length) setPts(from);
            },
            // The live line is painted by the pane's own pointermove, with this render's points.
            onMove: (ev) => {
              pointer.current = { x: ev.clientX, y: ev.clientY, alt: ev.altKey };
            },
            onEnd: (ev, moved) => {
              if (moved) finish([...from, nextPoint(ev.clientX, ev.clientY, ev.altKey, undefined, from)], ev.shiftKey);
            },
          });
        }}
        onPointerMove={(e) => {
          pointer.current = { x: e.clientX, y: e.clientY, alt: e.altKey };
          paint();
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.detail > 1) return; // the second click of a double-click ends it, below
          const cm = parseFloat(typed);
          add(nextPoint(e.clientX, e.clientY, e.altKey, typed && cm > 0 ? cm * 10 : undefined), e.clientX, e.clientY, e.shiftKey);
          setTyped("");
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          finish(pts);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          ctx.endSnap();
          onCancel();
        }}
      />
      <g className="pointer-events-none">
        {/* An area so far, faintly filled — what the cloth will cover. */}
        {closed && pts.length > 2 && <polygon points={pts.map((q) => `${q.x},${q.y}`).join(" ")} fill="var(--color-accent)" fillOpacity={0.08} stroke="none" />}
        {pts.length > 1 && <polyline points={pts.map((q) => `${q.x},${q.y}`).join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth={3} vectorEffect="non-scaling-stroke" />}
        <polyline ref={live} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        {pts.map((q, i) => (
          <rect key={i} x={q.x - post / 2} y={q.y - post / 2} width={post} height={post} fill="var(--color-accent)" />
        ))}
        {snap && <circle ref={ring} visibility="hidden" r={ctx.mm(9)} fill="none" stroke="var(--color-accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
        <text ref={readout} visibility="hidden" fontSize={ctx.mm(12)} fill="var(--color-accent)" style={{ paintOrder: "stroke", stroke: "var(--color-canvas)", strokeWidth: ctx.mm(3) }} direction="ltr" />
      </g>
    </g>
  );
}

/** The signed area of a closed polygon, mm² — an area too small to be one is a slip. */
function shoelace(pts: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
