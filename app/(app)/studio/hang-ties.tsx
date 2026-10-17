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

/** The two axes of what a ceiling item is being pulled onto, drawn through its middle while the
 *  drag holds the hang point on one of them — the table's own centre lines, in the table's frame,
 *  so a turned table shows turned guides. Solid where the plan's alignment guides are dashed: this
 *  is "on the table's axis", the same thing the dressing overlay's centre lines say. */
export interface HangAxisGuide {
  position: Point;
  rotation?: number;
  mirrored?: boolean;
  widthMm: number;
  depthMm: number;
  /** On the across line (x = 0 in the frame) / the along line (y = 0). */
  x: boolean;
  y: boolean;
}

export function HangAxes({ guide, mm }: { guide: HangAxisGuide; mm: (px: number) => number }) {
  const ext = mm(36);
  const w = guide.widthMm / 2 + ext;
  const d = guide.depthMm / 2 + ext;
  const transform = `translate(${guide.position.x} ${guide.position.y})${guide.rotation ? ` rotate(${guide.rotation})` : ""}${guide.mirrored ? " scale(-1 1)" : ""}`;
  return (
    <g className="pointer-events-none text-accent" transform={transform} stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke">
      {guide.x && <line x1={0} y1={-d} x2={0} y2={d} vectorEffect="non-scaling-stroke" />}
      {guide.y && <line x1={-w} y1={0} x2={w} y2={0} vectorEffect="non-scaling-stroke" />}
      {guide.x && guide.y && <circle r={mm(4)} fill="none" vectorEffect="non-scaling-stroke" />}
    </g>
  );
}

export function HangTies({
  at,
  walls,
  over,
  mm,
  avoid = [],
}: {
  at: Point;
  walls: [Point, Point][];
  over: Point | null;
  mm: (px: number) => number;
  /** Points a figure must keep off — the rotate knob, which hangs right on the tie to the wall
   *  above and used to wear its number. Each is a knob-sized box. */
  avoid?: Point[];
}) {
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
    avoid.map((p) => ({ minX: p.x - mm(14), minY: p.y - mm(14), maxX: p.x + mm(14), maxY: p.y + mm(14) })),
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
