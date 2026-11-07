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
import { useEffect, useRef, useState } from "react";
import type { Point } from "@/lib/studio/hall";
import type { CanvasLayerContext } from "@/components/plan-canvas";
import { constrainNext, firstSideAngles, laterSideAngles } from "@/lib/studio/stage-draw";

/** A rod shorter than this is a slip of the mouse, not a rod. */
const MIN_ROD_MM = 300;

export function RodDrawPane({
  ctx,
  start,
  onFinish,
  onCancel,
}: {
  ctx: CanvasLayerContext;
  /** The first post, when the click that started the tool already put it (/halls' armed tool). */
  start?: Point;
  /** The rod's points, in order (at least two). */
  onFinish: (points: Point[]) => void;
  onCancel: () => void;
}) {
  const [pts, setPts] = useState<Point[]>(() => (start ? [{ x: Math.round(start.x), y: Math.round(start.y) }] : []));
  const [typed, setTyped] = useState("");
  const pointer = useRef<{ x: number; y: number; alt: boolean } | null>(null);
  const live = useRef<SVGPolylineElement>(null);
  const readout = useRef<SVGTextElement>(null);

  /** Where the next post goes from the pointer (or a typed length along its direction). */
  const nextPoint = (clientX: number, clientY: number, free: boolean, typedMm?: number): Point => {
    const raw = ctx.clientToMm(clientX, clientY);
    const last = pts[pts.length - 1];
    if (!last) {
      const s = ctx.snap(raw);
      return { x: Math.round(s.x), y: Math.round(s.y) };
    }
    const first = pts[0];
    const ref = pts.length >= 2 ? laterSideAngles((Math.atan2(pts[1].y - first.y, pts[1].x - first.x) * 180) / Math.PI) : firstSideAngles(null);
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
    el.setAttribute("points", `${last.x},${last.y} ${q.x},${q.y}`);
    const t = readout.current;
    if (t) {
      t.setAttribute("visibility", "visible");
      t.setAttribute("x", String(q.x + ctx.mm(10)));
      t.setAttribute("y", String(q.y - ctx.mm(10)));
      t.textContent = typed ? `${typed} ס״מ` : `${(Math.hypot(q.x - last.x, q.y - last.y) / 1000).toFixed(2)} מ׳`;
    }
  };

  const finish = (points: Point[]) => {
    const clean = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 1);
    const length = clean.slice(1).reduce((n, q, i) => n + Math.hypot(q.x - clean[i].x, q.y - clean[i].y), 0);
    ctx.endSnap();
    setPts([]);
    setTyped("");
    if (clean.length >= 2 && length >= MIN_ROD_MM) onFinish(clean);
    else onCancel();
  };

  // Taken in the CAPTURE phase and stopped there, as the stage tool's keys are: the host's own window
  // listener would otherwise read Backspace as "delete the selection" and Escape as "deselect".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9.]$/.test(e.key) && pts.length > 0) setTyped((t) => (t.length < 6 ? t + e.key : t));
      else if (e.key === "Enter") {
        const cm = parseFloat(typed);
        const at = pointer.current;
        if (typed && cm > 0 && at) {
          setPts((cur) => [...cur, nextPoint(at.x, at.y, at.alt, cm * 10)]);
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
        className="cursor-crosshair"
        // The left button draws and nothing else; the middle still pans the canvas mid-rod.
        onPointerDown={(e) => {
          if (e.button === 0) e.stopPropagation();
        }}
        onPointerMove={(e) => {
          pointer.current = { x: e.clientX, y: e.clientY, alt: e.altKey };
          paint();
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.detail > 1) return; // the second click of a double-click ends it, below
          const cm = parseFloat(typed);
          setPts((cur) => [...cur, nextPoint(e.clientX, e.clientY, e.altKey, typed && cm > 0 ? cm * 10 : undefined)]);
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
        {pts.length > 1 && <polyline points={pts.map((q) => `${q.x},${q.y}`).join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth={3} vectorEffect="non-scaling-stroke" />}
        <polyline ref={live} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        {pts.map((q, i) => (
          <rect key={i} x={q.x - post / 2} y={q.y - post / 2} width={post} height={post} fill="var(--color-accent)" />
        ))}
        <text ref={readout} visibility="hidden" fontSize={ctx.mm(12)} fill="var(--color-accent)" style={{ paintOrder: "stroke", stroke: "var(--color-canvas)", strokeWidth: ctx.mm(3) }} direction="ltr" />
      </g>
    </g>
  );
}
