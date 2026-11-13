// Cloth in the air on a plan — a SAIL (מפרש) and a CEILING DRAPE (בד תקרה), spec 2026-11-07 §6.3/§6.4.
// One drawing, shared by the studio canvas (app/(app)/studio/ceiling-cloth-node.tsx), both printed
// looks (app/(app)/outputs/placement-map.tsx) and the catalog card / drag image (ItemSymbol's "sail"
// and "ceiling-drape"), so the three cannot drift. Everything it draws is DERIVED by
// lib/studio/ceiling-cloth.ts from the rail; this file only paints it.
//
// A sail: its polygon in a light fill of its shade, a dashed outline (it is overhead — the plan's
// convention for anything above the cut), a circle at every tie and a filled square at every post of
// its own; each tie's height written beside it when asked (the dims layer, or the sail selected).
// A ceiling drape: each run a band whose edges swell in every scallop and pinch where the cloth is
// gathered, a tick across it at each gather, the curtain's pleats along its middle; a canopy's area
// dashed round its runs.
//
// Sized in the CALLER's mm (`tieMm`, `textMm`): the canvas passes a screen-steady size, print a
// printed one — never a room size that vanishes when zoomed out.
import { memo } from "react";
import type { Point } from "@/lib/studio/hall";
import type { RailSheet } from "@/lib/studio/rail";
import { runGatherTicks, runLights, runOutline, type ClothRun } from "@/lib/studio/ceiling-cloth";
import { DrapePleatsAlong, polygonD } from "./curtain-cloth";

/** The plan's dash for anything overhead, in screen px (non-scaling strokes). */
const OVERHEAD_DASH = "6 4";

/** A tie's height as written beside it: metres, two places ("3.20"). */
export const tieHeightText = (mm: number): string => (mm / 1000).toFixed(2);

function centroid(pts: readonly Point[]): Point {
  return { x: pts.reduce((n, q) => n + q.x, 0) / (pts.length || 1), y: pts.reduce((n, q) => n + q.y, 0) / (pts.length || 1) };
}

function SailClothView({
  sheet,
  fill,
  fillOpacity = 0.28,
  ink,
  inkOpacity = 0.75,
  tieMm,
  textMm,
  textFill,
  halo,
  dash = OVERHEAD_DASH,
  strokeWidth = 1.2,
  postFill,
}: {
  sheet: Pick<RailSheet, "polygon" | "heights" | "posts">;
  fill: string;
  fillOpacity?: number;
  ink: string;
  inkOpacity?: number;
  /** A tie's circle (its diameter) and a post's side, in the caller's mm. */
  tieMm: number;
  /** Write each tie's height beside it at this size. Absent = no heights. */
  textMm?: number;
  textFill?: string;
  /** A halo under the heights so they read over whatever is below (the canvas's own colour). */
  halo?: string;
  dash?: string;
  strokeWidth?: number;
  /** A post's fill. Absent = the ink. */
  postFill?: string;
}) {
  const { polygon, heights, posts } = sheet;
  if (polygon.length < 3) return null;
  const mid = centroid(polygon);
  const r = tieMm / 2;
  const isPost = (q: Point) => posts.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < 1);
  return (
    <g className="pointer-events-none">
      <path d={polygonD(polygon)} fill={fill} fillOpacity={fillOpacity} stroke={ink} strokeOpacity={inkOpacity} strokeWidth={strokeWidth} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />
      {polygon.map((q, i) =>
        isPost(q) ? (
          <rect key={i} x={q.x - r} y={q.y - r} width={tieMm} height={tieMm} fill={postFill ?? ink} />
        ) : (
          <circle key={i} cx={q.x} cy={q.y} r={r} fill="#ffffff" stroke={ink} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        ),
      )}
      {textMm !== undefined &&
        polygon.map((q, i) => {
          // Beside the tie, out of the sail — away from its middle — so the figure never sits on the cloth.
          const dx = q.x - mid.x;
          const dy = q.y - mid.y;
          const l = Math.hypot(dx, dy) || 1;
          const off = tieMm * 1.2 + textMm * 0.9;
          return (
            <text
              key={`h${i}`}
              x={q.x + (dx / l) * off}
              y={q.y + (dy / l) * off}
              fontSize={textMm}
              textAnchor="middle"
              dominantBaseline="central"
              direction="ltr"
              fill={textFill ?? ink}
              style={halo ? { paintOrder: "stroke", stroke: halo, strokeWidth: textMm * 0.25 } : undefined}
            >
              {tieHeightText(heights[i] ?? 0)}
            </text>
          );
        })}
    </g>
  );
}
export const SailCloth = memo(SailClothView);

function DrapeRunsView({
  runs,
  area,
  fill,
  fillOpacity = 0.5,
  ink,
  inkOpacity = 0.6,
  pleats = true,
  dash = OVERHEAD_DASH,
}: {
  runs: readonly ClothRun[];
  /** A canopy's area, drawn dashed round its runs. */
  area?: readonly Point[];
  fill: string;
  fillOpacity?: number;
  ink: string;
  inkOpacity?: number;
  /** The curtain's pleats along each run's middle — off where the band is too small to hold them. */
  pleats?: boolean;
  dash?: string;
}) {
  return (
    <g className="pointer-events-none">
      {area && area.length >= 3 && <path d={polygonD([...area])} fill="none" stroke={ink} strokeOpacity={inkOpacity} strokeWidth={1} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />}
      {runs.map((run, i) => (
        <g key={i}>
          <path d={polygonD(runOutline(run))} fill={fill} fillOpacity={fillOpacity} stroke={ink} strokeOpacity={inkOpacity} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {runGatherTicks(run).map(([u, v], k) => (
            <line key={k} x1={u.x} y1={u.y} x2={v.x} y2={v.y} stroke={ink} strokeOpacity={inkOpacity} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {pleats && <DrapePleatsAlong line={[run.a, run.b]} depthMm={run.widthMm * 0.35} ink={ink} opacity={inkOpacity * 0.55} />}
          {/* Fairy lights woven in (ClothRun.lights): a warm point at each, where the room hangs it;
              hidden at hall zoom like every other detail. */}
          {run.lights && (
            <g className="fl-d">
              {runLights(run).map((q, k) => (
                <circle key={`l${k}`} cx={q.x} cy={q.y} r={Math.max(20, run.widthMm * 0.03)} fill="#FFE9A8" fillOpacity={0.95} stroke={ink} strokeOpacity={inkOpacity * 0.7} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          )}
        </g>
      ))}
    </g>
  );
}
export const DrapeRuns = memo(DrapeRunsView);

// ── The catalog card and the drag image (ItemSymbol "sail" / "ceiling-drape") ─────────────────────

/** A sail in a box w × h: four ties out near the corners, never quite square — a sail is cut to the
 *  points it is tied to, not to a rectangle. */
export function SailSymbol({ w, h, tone, ink, print }: { w: number; h: number; tone: string; ink: string; print?: boolean }) {
  const polygon: Point[] = [
    { x: -0.46 * w, y: -0.36 * h },
    { x: 0.44 * w, y: -0.46 * h },
    { x: 0.4 * w, y: 0.44 * h },
    { x: -0.4 * w, y: 0.34 * h },
  ];
  return (
    <SailCloth
      sheet={{ polygon, heights: [], posts: [polygon[3]] }}
      fill={tone}
      fillOpacity={print ? 1 : 0.4}
      ink={ink}
      inkOpacity={print ? 1 : 0.7}
      tieMm={Math.min(w, h) * 0.07}
    />
  );
}

/** A ceiling drape in a box L × D (its long side along x): one swag the length of the box, a
 *  scallop per ~1.4 widths of it. */
export function CeilingDrapeSymbol({ L, D, tone, ink, print }: { L: number; D: number; tone: string; ink: string; print?: boolean }) {
  const widthMm = D * 0.8;
  const lengthMm = L * 0.94;
  const run: ClothRun = { a: { x: -lengthMm / 2, y: 0 }, b: { x: lengthMm / 2, y: 0 }, heightMm: 0, sagMm: 0, widthMm, waves: Math.max(2, Math.round(lengthMm / Math.max(1, widthMm * 1.4))), lengthMm, lights: false };
  return <DrapeRuns runs={[run]} fill={tone} fillOpacity={print ? 1 : 0.6} ink={ink} inkOpacity={print ? 1 : 0.6} />;
}
