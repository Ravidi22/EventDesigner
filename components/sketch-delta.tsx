"use client";
// What changed on a sketch, drawn ON the sketch: the layer the designer reviews a client's proposal
// through, and the client's own "show what I changed" (docs/superpowers/specs/2026-10-16-client-
// side-design.md §2.7).
//
//   moved    a dashed ghost where the table was, an arrow to where it is now;
//   added    a halo round the new table and a "חדש" tag;
//   removed  a dashed alert ghost with a cross through it;
//   edited   a ring round the table and what changed on a tag ("12 מקומות (היו 10)").
//
// A change the designer has NOT ticked is drawn faint, the other way round: the table stays where the
// preview has it, and the ghost is where the client wanted it to go — so unticking a move shows the
// room both ways. A conflict wears the warning ink.
//
// Pure drawing in world millimetres, inside the canvas's own overlay (CanvasStage `extraOverlay`):
// pointer-events none throughout, sized through the canvas's `mm` so it reads the same at any zoom.
import { memo } from "react";
import type { DesignTable, Point } from "@/lib/design-document/types";
import { FootprintShape, tableFootprint } from "@/components/footprint-shape";
import type { DeltaMark } from "@/lib/proposals/marks";

export type { DeltaMark } from "@/lib/proposals/marks";

const INK = {
  add: "var(--color-success)",
  remove: "var(--color-alert)",
  move: "var(--color-accent)",
  edit: "var(--color-accent)",
} as const;

function Placed({ t, children }: { t: DesignTable; children: React.ReactNode }) {
  return (
    <g transform={`translate(${t.position.x} ${t.position.y}) rotate(${t.rotation})${t.mirrored ? " scale(-1 1)" : ""}`}>{children}</g>
  );
}

function Arrow({ from, to, ink, width, head }: { from: Point; to: Point; ink: string; width: number; head: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < head * 1.5) return null;
  const ux = dx / len;
  const uy = dy / len;
  // Stop short of the centre so the head lands on the table, not under its number.
  const tip = { x: to.x - ux * head * 0.6, y: to.y - uy * head * 0.6 };
  const base = { x: tip.x - ux * head, y: tip.y - uy * head };
  const nx = -uy * head * 0.55;
  const ny = ux * head * 0.55;
  return (
    <g>
      <line x1={from.x} y1={from.y} x2={base.x} y2={base.y} stroke={ink} strokeWidth={width} strokeLinecap="round" />
      <polygon points={`${tip.x},${tip.y} ${base.x + nx},${base.y + ny} ${base.x - nx},${base.y - ny}`} fill={ink} />
    </g>
  );
}

function Tag({ at, text, ink, mm }: { at: Point; text: string; ink: string; mm: (px: number) => number }) {
  const size = mm(11);
  // Wide enough for the text at this size — a rough measure; the pill only has to cover it.
  const w = Math.max(size * 2.6, text.length * size * 0.58 + size * 1.2);
  const h = size * 1.7;
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill="var(--color-surface)" stroke={ink} strokeWidth={mm(1.25)} />
      <text textAnchor="middle" dominantBaseline="central" fill={ink} style={{ fontSize: size, fontWeight: 700 }} direction="rtl">
        {text}
      </text>
    </g>
  );
}

/** Where a tag goes: above the table's box, in the room's frame. */
function above(t: DesignTable, mm: (px: number) => number): Point {
  const f = tableFootprint(t);
  const r =
    f.kind === "circle"
      ? f.diameterMm / 2
      : f.kind === "rect" || f.kind === "ellipse"
        ? Math.hypot(f.widthMm, f.depthMm) / 2
        : 900;
  return { x: t.position.x, y: t.position.y - r - mm(16) };
}

export const SketchDelta = memo(function SketchDelta({ marks, mm }: { marks: DeltaMark[]; mm: (px: number) => number }) {
  return (
    <g className="pointer-events-none" aria-hidden>
      {marks.map((m) => {
        const ink = m.state === "conflict" ? "var(--color-warn)" : INK[m.kind];
        const faint = m.state === "held";
        const stroke = mm(m.focused ? 3 : 2);
        return (
          <g key={m.key} opacity={faint ? 0.55 : 1}>
            {m.ghost && (
              <Placed t={m.ghost}>
                <FootprintShape
                  footprint={tableFootprint(m.ghost)}
                  fill={m.kind === "remove" ? "var(--color-alert-tint)" : "none"}
                  fillOpacity={m.kind === "remove" ? 0.6 : undefined}
                  stroke={ink}
                  strokeWidth={stroke}
                  strokeDasharray={`${mm(7)} ${mm(5)}`}
                />
                {m.kind === "remove" && (
                  <g stroke={ink} strokeWidth={stroke} strokeLinecap="round">
                    <line x1={-mm(14)} y1={-mm(14)} x2={mm(14)} y2={mm(14)} />
                    <line x1={mm(14)} y1={-mm(14)} x2={-mm(14)} y2={mm(14)} />
                  </g>
                )}
              </Placed>
            )}
            {m.at && m.kind !== "remove" && (
              <Placed t={m.at}>
                <FootprintShape
                  footprint={tableFootprint(m.at)}
                  fill="none"
                  stroke={ink}
                  strokeOpacity={m.kind === "add" ? 0.45 : 0.35}
                  strokeWidth={mm(m.kind === "add" ? 9 : 6)}
                  strokeLinejoin="round"
                />
              </Placed>
            )}
            {m.from && m.to && (
              <g strokeDasharray={faint ? `${mm(6)} ${mm(4)}` : undefined}>
                <Arrow from={m.from} to={m.to} ink={ink} width={stroke} head={mm(14)} />
              </g>
            )}
            {m.tag && (m.at ?? m.ghost) && <Tag at={above((m.at ?? m.ghost)!, mm)} text={m.tag} ink={ink} mm={mm} />}
          </g>
        );
      })}
    </g>
  );
});
