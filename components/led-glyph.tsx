// LED on a plan (spec 2026-11-07 §7): a STRIP is a line of light along its rail — a thin solid line
// in its colour over a wider translucent one of the same colour (the glow), on every canvas and the
// colour print; the crew's print draws it as an ink dash-dot line, "LED" in the key. A SCREEN is a
// thick dark bar with a fine pixel grid, its name written behind it and its FRONT (+y) marked — the
// face the room looks at.
//
// Every surface draws through here: the sketch's hired strip (app/(app)/studio/led-strip-node.tsx),
// the venue's own (components/venue-plan.tsx), both printed looks (app/(app)/outputs/placement-map.tsx),
// and the catalog card / drag image through ItemSymbol's `led` and `screen` kinds. No hooks and no
// handlers, so it renders on the server too.
import { memo, type ReactNode } from "react";
import type { Point } from "@/lib/studio/hall";
import { isDark } from "@/lib/element-style";
import { LED_COLOUR } from "@/lib/venues/led";

const pointsOf = (path: readonly Point[]) => path.map((q) => `${q.x},${q.y}`).join(" ");

/** A strip's light along `path`. Widths in the drawing's own units — screen px when `nonScaling`
 *  (the canvas: a light reads the same at every zoom), else the caller's mm (paper). `mono` draws the
 *  crew's dash-dot line in `ink` instead; `dash` is its pattern in the same units. */
function LedLineView({
  path,
  colour = LED_COLOUR,
  core,
  glow,
  nonScaling = false,
  mono = false,
  ink = "#1b1725",
  dash,
  opacity = 1,
}: {
  path: readonly Point[];
  colour?: string;
  core: number;
  glow: number;
  nonScaling?: boolean;
  mono?: boolean;
  ink?: string;
  dash?: string;
  opacity?: number;
}) {
  if (path.length < 2) return null;
  const pts = pointsOf(path);
  const ve = nonScaling ? ("non-scaling-stroke" as const) : undefined;
  if (mono) {
    return <polyline className="pointer-events-none" points={pts} fill="none" stroke={ink} strokeWidth={core} strokeDasharray={dash} strokeLinecap="butt" strokeLinejoin="round" vectorEffect={ve} />;
  }
  // A pale strip (a warm white on a white plan) would vanish: a quiet casing under the light gives it
  // an edge; a saturated one needs only a hint of it.
  const casing = isDark(colour) ? 0.12 : 0.32;
  return (
    <g className="pointer-events-none" opacity={opacity}>
      <polyline points={pts} fill="none" stroke={colour} strokeOpacity={0.3} strokeWidth={glow} strokeLinecap="round" strokeLinejoin="round" vectorEffect={ve} />
      <polyline points={pts} fill="none" stroke="#1b1725" strokeOpacity={casing} strokeWidth={core * 1.9} strokeLinecap="round" strokeLinejoin="round" vectorEffect={ve} />
      <polyline points={pts} fill="none" stroke={colour} strokeWidth={core} strokeLinecap="round" strokeLinejoin="round" vectorEffect={ve} />
    </g>
  );
}
export const LedLine = memo(LedLineView);

/** The card's and the drag image's picture of a strip: a short glowing line down the middle of its
 *  box, along its longer side. */
export function ledSymbol(w: number, h: number, tone: string | undefined, print: boolean, ink: string): ReactNode {
  const long = w >= h;
  const L = long ? w : h;
  const D = long ? h : w;
  const path = long ? [{ x: -L * 0.42, y: 0 }, { x: L * 0.42, y: 0 }] : [{ x: 0, y: -L * 0.42 }, { x: 0, y: L * 0.42 }];
  const core = Math.max(4, Math.min(D * 0.12, 40));
  if (print) return <LedLine path={path} core={core} glow={core} mono ink={ink} dash={`${core * 6} ${core * 1.5} ${core} ${core * 1.5}`} />;
  return <LedLine path={path} colour={tone ?? LED_COLOUR} core={core} glow={Math.max(core * 4, Math.min(D * 0.7, 180))} />;
}

/** A screen's dark body — and the cool face that lights. */
export const SCREEN_BODY = "#23262e";
const SCREEN_FACE = "#8fa7cf";
const SCREEN_GRID = "#7f8aa3";

/** A screen seen from above: a thick dark bar `w` × `h` with a fine pixel grid across it, its FRONT
 *  (+y) a lit line with a small chevron out of its middle, and its name behind it (−y). `textMm` sizes
 *  the name in the drawing's units (absent = off the screen's own width). In print the bar is the
 *  sheet's tone (or a dark grey) and every line ink. */
export function screenSymbol(w: number, h: number, label: string | undefined, opts: { tone?: string; print?: boolean; ink?: string; textMm?: number } = {}): ReactNode {
  if (w <= 0 || h <= 0) return null;
  const { print = false, ink = "#1b1725" } = opts;
  const body = print ? (opts.tone && opts.tone !== "#ffffff" ? opts.tone : "#4a4658") : (opts.tone ?? SCREEN_BODY);
  // The pixel grid: a cell about half the panel's depth, never finer than 2.5cm or coarser than 25cm,
  // drawn as one path — a hall of screens is a handful of elements, not thousands.
  const cell = Math.max(25, Math.min(250, h * 0.5));
  let grid = "";
  for (let x = -w / 2 + cell; x < w / 2 - 1; x += cell) grid += `M ${x.toFixed(1)} ${-h / 2} V ${h / 2} `;
  for (let y = -h / 2 + cell; y < h / 2 - 1; y += cell) grid += `M ${-w / 2} ${y.toFixed(1)} H ${w / 2} `;
  const chevron = Math.max(h * 0.9, Math.min(w * 0.04, 160));
  const fontSize = opts.textMm ?? Math.max(80, Math.min(w * 0.045, 260));
  return (
    <g className="pointer-events-none">
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill={body} stroke={print ? ink : "#14161b"} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {grid && <path d={grid} fill="none" stroke={print ? "#ffffff" : SCREEN_GRID} strokeOpacity={print ? 0.6 : 0.45} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />}
      {/* The front: the face that lights, and a chevron pointing the way it looks. */}
      <line x1={-w / 2} y1={h / 2} x2={w / 2} y2={h / 2} stroke={print ? ink : SCREEN_FACE} strokeWidth={print ? 1.5 : 2.5} vectorEffect="non-scaling-stroke" />
      <path d={`M ${-chevron} ${h / 2 + chevron * 0.15} L 0 ${h / 2 + chevron * 0.85} L ${chevron} ${h / 2 + chevron * 0.15}`} fill="none" stroke={print ? ink : SCREEN_FACE} strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {label && (
        <text x={0} y={-h / 2 - fontSize * 0.45} textAnchor="middle" fill={print ? ink : "var(--color-ink-soft)"} style={{ fontSize }}>
          {label}
        </text>
      )}
    </g>
  );
}

/** A screen as a component — the venue's own (components/venue-plan.tsx) and the printed map's. */
export const ScreenGlyph = memo(function ScreenGlyph({ w, h, label, tone, print, ink, textMm }: { w: number; h: number; label?: string; tone?: string; print?: boolean; ink?: string; textMm?: number }) {
  return <>{screenSymbol(w, h, label, { tone, print, ink, textMm })}</>;
});
