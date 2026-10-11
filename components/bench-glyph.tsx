import type { Point } from "@/lib/design-document/types";
import type { BenchLayout } from "@/lib/design-document/bench";
import { CHAIR_BACK_MM, CHAIR_D_MM, CHAIR_W_MM, type Seat } from "@/lib/studio/seating";

// A banquette drawn as what it is — the one picture of its sides that the studio canvas, the printed
// map, the drag image leaving the rail and the catalog's preview all share (lib/design-document/
// bench.ts lays it; this draws what was laid). The strip itself is the caller's footprint; this adds
// what sits at it: the chairs along a chairs side, and along a sofa side the row of cushions inside
// the strip with the backrest line toward its other half.
//
// In the banquette's OWN frame (centred, −y back, +y front), so the caller's <g> carries position,
// turn and mirror — the same contract FootprintShape keeps. A stage's edge banquette is laid in the
// stage's frame instead and draws its own chairs; it borrows only `SofaGlyph` for its sofa side.
//
// No "use client": pure props, no hooks, so it renders on the printed sheet as well as the canvas.

/** Screen inks are the plan's tokens; print collapses to the sheet's ink on white, like every other
 *  furniture glyph on the placement map. */
const inks = (print: boolean) =>
  print
    ? { fill: "#ffffff", stroke: "#1b1725", soft: "#4a4658", strokeWidth: 0.5 }
    : { fill: "var(--color-tray)", stroke: "var(--color-muted)", soft: "var(--color-muted)", strokeWidth: 1 };

/** A banquet chair, as the studio canvas draws one at a table — the seat's own rotation points +x
 *  at the thing it is pulled up to, so this needs no further geometry. */
export function BenchChair({ seat, print = false }: { seat: Seat; print?: boolean }) {
  const ink = inks(print);
  const halfD = CHAIR_D_MM / 2;
  const halfW = CHAIR_W_MM / 2;
  return (
    <g transform={`translate(${seat.x} ${seat.y}) rotate(${seat.facingDeg})`}>
      <rect
        x={-halfD}
        y={-halfW}
        width={CHAIR_D_MM}
        height={CHAIR_W_MM}
        rx={95}
        fill={ink.fill}
        stroke={ink.stroke}
        strokeOpacity={print ? 1 : 0.4}
        strokeWidth={ink.strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
      <rect x={-halfD} y={-halfW} width={CHAIR_BACK_MM} height={CHAIR_W_MM} rx={CHAIR_BACK_MM / 2} fill={ink.soft} fillOpacity={print ? 0.35 : 0.5} />
    </g>
  );
}

/** A sofa side: one cushion per seat inside the strip, and the backrest line. Any frame — the
 *  points are wherever the caller laid them (a standalone banquette's own frame, or the stage's). */
export function SofaGlyph({ cushions, backs, print = false }: { cushions: Point[][]; backs: [Point, Point][]; print?: boolean }) {
  if (cushions.length === 0 && backs.length === 0) return null;
  const ink = inks(print);
  return (
    <g className="pointer-events-none">
      {cushions.map((q, i) => (
        <polygon
          key={`c-${i}`}
          points={q.map((p) => `${p.x},${p.y}`).join(" ")}
          fill={print ? "#ffffff" : "var(--color-accent-tint)"}
          fillOpacity={print ? 1 : 0.9}
          stroke={print ? ink.stroke : "var(--color-accent)"}
          strokeOpacity={print ? 1 : 0.5}
          strokeWidth={ink.strokeWidth}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {backs.map(([a, b], i) => (
        <line
          key={`b-${i}`}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={print ? ink.stroke : "var(--color-ink-soft)"}
          strokeWidth={print ? 1 : 2}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}

/** Everything that sits at a standalone banquette, in its own frame: its chairs and its sofa side.
 *  `chairs={false}` leaves the chairs off (a sheet that hides every chair hides these too). */
export function BenchGlyph({ layout, print = false, chairs = true }: { layout: BenchLayout; print?: boolean; chairs?: boolean }) {
  return (
    <g className="pointer-events-none">
      {chairs && layout.chairs.map((seat, i) => <BenchChair key={`chair-${i}`} seat={seat} print={print} />)}
      <SofaGlyph cushions={layout.cushions} backs={layout.backs} print={print} />
    </g>
  );
}
