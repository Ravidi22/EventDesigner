"use client";
// A hired LED strip on the sketch (spec 2026-11-07 §7.1): a line of light along its RAIL — a wall at a
// height, the side of a stage or a bar, a run in the air — drawn as its shade's colour over a glow of
// the same colour (components/led-glyph.tsx), never as cloth. canvas-stage's drape pass hands a
// railed placement here when its row is a `led-strips` row; everything else about it (its rail, its
// lines, its selection) is a drape's.
//
// Selected, a grip stands a few px past each end: on a wall or a side the end slides along it (round a
// bow, round a rim), on a run the end point follows the pointer. Every drag through
// startPointerGesture; the node is memoised on stable props, as DrapeNode is.
import { memo } from "react";
import type { Placement } from "@/lib/design-document/types";
import type { Point } from "@/lib/studio/hall";
import type { Rail, RailLine } from "@/lib/studio/rail";
import type { CanvasLayerContext } from "@/components/plan-canvas";
import { resolve } from "@/lib/studio/catalog-resolver";
import { isAdditiveClick } from "@/lib/keyboard";
import { startPointerGesture } from "@/lib/studio/gesture";
import { LedLine } from "@/components/led-glyph";
import { LED_COLOUR, LED_DEPTH_MM, stripEndMoved } from "@/lib/venues/led";
import { railClothLine } from "@/lib/studio/rail";

/** How far past each end its grip stands, screen px — never on the strip itself. */
const GRIP_OUT_PX = 8;

export const LedStripNode = memo(function LedStripNode({
  placement,
  rail,
  lines,
  selected,
  locked,
  ctx,
  onSelect,
  onRail,
  onEndSpan,
}: {
  placement: Placement;
  rail: Rail;
  /** The rail resolved — remembered per rail (lib/studio/rail.ts), so an untouched strip is handed
   *  the same array frame after frame. */
  lines: RailLine[];
  selected: boolean;
  /** Pinned on this plan: selected, but its end grips are not offered. */
  locked?: boolean;
  ctx: CanvasLayerContext;
  onSelect: (id: string, additive: boolean) => void;
  onRail: (id: string, rail: Rail) => void;
  onEndSpan: () => void;
}) {
  // A strip whose wall (or thing) is gone draws nothing — it still lists and prices, and its bar says so.
  const line = lines[0];
  if (!line) return null;
  const r = resolve(placement.variantId);
  const colour = r?.swatch ?? r?.product.appearance?.style?.fill ?? LED_COLOUR;
  // On a wall the light runs on its room face (a hair off the wall's line), on a side just outside the
  // thing; a run is its own line.
  const paths = lines.map((l) => railClothLine(l, LED_DEPTH_MM));
  const first = paths[0];
  const ends: { p: Point; out: Point }[] = (() => {
    const n = first.length;
    const dir = (a: Point, b: Point) => {
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    };
    return n < 2 ? [] : [{ p: first[0], out: dir(first[1], first[0]) }, { p: first[n - 1], out: dir(first[n - 2], first[n - 1]) }];
  })();
  const where = rail.type === "wall" ? "על הקיר" : rail.type === "side" ? "על הצד" : "באוויר";

  const grip = (which: 0 | 1) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      onSelect(placement.id, false);
      startPointerGesture(e, {
        onMove: (ev) => {
          const next = stripEndMoved(rail, line, which, ctx.clientToMm(ev.clientX, ev.clientY));
          if (next) onRail(placement.id, next);
        },
        onEnd: (_ev, moved) => {
          if (moved) onEndSpan();
        },
      });
    },
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  });

  return (
    <g>
      {paths.map((path, i) => (
        <g key={i}>
          {/* What takes the pointer: a finger's width along the light, invisible. */}
          <polyline
            points={path.map((q) => `${q.x},${q.y}`).join(" ")}
            fill="none"
            stroke="transparent"
            strokeWidth={14}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: "stroke" }}
            tabIndex={i === 0 ? 0 : -1}
            role="button"
            aria-label={`${r?.label ?? "פס לד"} — ${(line.lengthMm / 1000).toFixed(1)} מטר ${where}`}
            className="cursor-pointer touch-none focus:outline-none"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(placement.id, isAdditiveClick(e));
            }}
          />
          {/* Selected: the accent under the light, so the light keeps its own colour. */}
          {selected && <polyline className="pointer-events-none" points={path.map((q) => `${q.x},${q.y}`).join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth={9} strokeOpacity={0.35} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          <LedLine path={path} colour={colour} core={2.5} glow={10} nonScaling />
        </g>
      ))}
      {selected &&
        !locked &&
        ends.map(({ p, out }, which) => (
          <circle
            key={which}
            cx={p.x + out.x * ctx.mm(GRIP_OUT_PX)}
            cy={p.y + out.y * ctx.mm(GRIP_OUT_PX)}
            r={ctx.mm(6)}
            fill="var(--color-canvas)"
            stroke="var(--color-accent)"
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
            tabIndex={0}
            role="slider"
            aria-label={which === 0 ? "תחילת פס הלד" : "סוף פס הלד"}
            className={(rail.type === "run" ? "cursor-move" : "cursor-ew-resize") + " touch-none focus:outline-none"}
            {...grip(which as 0 | 1)}
          />
        ))}
    </g>
  );
});
