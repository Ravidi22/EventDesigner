"use client";

// THE HANG POINT, MEASURED — drawn on the sketch while a ceiling item is selected or carried: a tie
// from its hang point square to the nearest wall across and the nearest along, and, over a table or
// an element, the two legs off that thing's middle (or a mark that it is dead on it). The same
// figures the printed ceiling plan carries (lib/outputs/measurements.ts), from the same functions
// (lib/studio/hang.ts), in the tape's own look: accent lines with square end ticks, the number on
// its line in a surface halo, screen-sized at any zoom.
import type { Point } from "@/lib/design-document/types";
import { centreOffset, wallTies, type HangTie } from "@/lib/studio/hang";
import { placeLabels } from "@/lib/outputs/labels";

export function HangTies({ at, walls, over, mm }: { at: Point; walls: [Point, Point][]; over: Point | null; mm: (px: number) => number }) {
  const ties = wallTies(at, walls);
  const legs = over ? centreOffset(at, over) : [];
  const all: (HangTie & { leg: boolean })[] = [...ties.map((t) => ({ ...t, leg: false })), ...legs.map((t) => ({ ...t, leg: true }))];
  const font = mm(11);
  const text = (t: HangTie) => `${(t.mm / 1000).toFixed(2)}`;
  const spots = placeLabels(
    all.map((t) => {
      const w = text(t).length * font * 0.6 + mm(8);
      const h = font * 1.4;
      return { a: t.a, b: t.b, w, h, gap: mm(4), side: 1 as const, inline: true };
    }),
    [],
  );
  const tick = mm(6);
  return (
    <g className="pointer-events-none text-accent">
      {all.map((t, i) => {
        const L = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y) || 1;
        const n = { x: (-(t.b.y - t.a.y) / L) * tick, y: ((t.b.x - t.a.x) / L) * tick };
        return (
          <g key={i}>
            <line x1={t.a.x} y1={t.a.y} x2={t.b.x} y2={t.b.y} stroke="currentColor" strokeWidth={1.5} strokeDasharray={t.leg ? "5 3" : undefined} vectorEffect="non-scaling-stroke" />
            {[t.a, t.b].map((e, k) => (
              <line key={k} x1={e.x - n.x} y1={e.y - n.y} x2={e.x + n.x} y2={e.y + n.y} stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        );
      })}
      {/* The middle of what it hangs over — a reference point the legs run from, and the mark that
          says "dead centre" when there are no legs at all. */}
      {over && (
        <g>
          <circle cx={over.x} cy={over.y} r={mm(5)} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path d={`M ${over.x - mm(8)} ${over.y} L ${over.x + mm(8)} ${over.y} M ${over.x} ${over.y - mm(8)} L ${over.x} ${over.y + mm(8)}`} stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          {legs.length === 0 && (
            <text
              x={over.x}
              y={over.y}
              dy={-mm(14)}
              textAnchor="middle"
              fill="currentColor"
              style={{ fontSize: font, fontWeight: 600, paintOrder: "stroke", stroke: "var(--color-surface)", strokeWidth: mm(3), strokeLinejoin: "round" }}
            >
              במרכז
            </text>
          )}
        </g>
      )}
      {all.map((t, i) => (
        <text
          key={`t${i}`}
          x={spots[i].x}
          y={spots[i].y}
          textAnchor="middle"
          dominantBaseline="central"
          fill="currentColor"
          style={{ fontSize: font, fontWeight: 600, direction: "ltr", paintOrder: "stroke", stroke: "var(--color-surface)", strokeWidth: mm(3), strokeLinejoin: "round" }}
          className="nums"
        >
          {text(t)}
        </text>
      ))}
    </g>
  );
}
