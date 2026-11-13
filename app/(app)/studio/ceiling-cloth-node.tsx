"use client";
// A SAIL or a CEILING DRAPE on the sketch (spec 2026-11-07 §6.3/§6.4; lib/studio/ceiling-cloth.ts): its
// own memoised node in the ceiling plane, beside the curtains' DrapeNode — canvas-stage.tsx only
// dispatches here. Drawn by components/ceiling-cloth.tsx (the printed map draws the same), dimmed
// and held back with the ceiling plane by the layer it sits in.
//
// Selected, it is edited on the plan: a grip on every tie of a sail (re-tied while it is dragged — to
// a wall, a thing's corner, else a post of its own; Alt frees it), on each end of a run, on each
// corner of a canopy's area; a press on its cloth carries the whole of it (a sail only when nothing
// in the room holds a corner of it). Every drag goes through startPointerGesture; nothing here sets
// state per pointermove — each frame is the host's one `setPlacementRail`, the thing being dragged
// re-rendering and nothing else (CLAUDE.md "Every drag is startPointerGesture").
import { memo, useLayoutEffect, useMemo, useRef } from "react";
import type { DesignDocumentContent, Placement } from "@/lib/design-document/types";
import type { Point } from "@/lib/studio/hall";
import type { CanvasLayerContext } from "@/components/plan-canvas";
import type { VenueStructure } from "@/lib/venues/structure";
import { railMoved, type Rail } from "@/lib/studio/rail";
import {
  canopyCornerMoved,
  clothPolygons,
  runEndMoved,
  sailIsFree,
  sailTieMoved,
  snapTie,
  tieCandidates,
  type ClothView,
  type SnappedTie,
  type TieContext,
} from "@/lib/studio/ceiling-cloth";
import { resolve } from "@/lib/studio/catalog-resolver";
import { startPointerGesture } from "@/lib/studio/gesture";
import { isAdditiveClick } from "@/lib/keyboard";
import { isDark } from "@/lib/element-style";
import { DrapeRuns, SailCloth } from "@/components/ceiling-cloth";
import { polygonD } from "@/components/curtain-cloth";

/** How close (screen px) a dragged tie must come to a wall or a corner to be tied to it. */
export const TIE_SNAP_PX = 14;

/** What a sail's ties are snapped against, read at the moment of the drag — never per render. */
export interface ClothTies {
  snap: (raw: Point, tolMm: number, free: boolean) => SnappedTie;
}

/** The ties' lookup for this sketch: the PROPERTY's walls (no arrangement moves a wall) and the
 *  things a corner may be tied to — the venue's features as this event stood them, and the document's
 *  own tall items. Stable for the screen's life: it reads the latest inputs through a ref, so a node
 *  handed it is never redrawn because the document changed. */
export function useClothTies(
  doc: Pick<DesignDocumentContent, "placements">,
  property: VenueStructure,
  arranged: VenueStructure,
): ClothTies {
  const latest = useRef({ doc, property, arranged });
  useLayoutEffect(() => {
    latest.current = { doc, property, arranged };
  });
  return useMemo(() => {
    const cache: { key: unknown[]; ctx: TieContext | null } = { key: [], ctx: null };
    const ctxNow = (): TieContext => {
      const { doc: d, property: s, arranged: a } = latest.current;
      // One candidate list per (document, property, arrangement) — a drag frame of a tie asks for it
      // sixty times a second, and nothing it lists changes during that drag.
      if (!cache.ctx || cache.key[0] !== d.placements || cache.key[1] !== s || cache.key[2] !== a) {
        cache.ctx = { structure: s, candidates: tieCandidates(a.features, d, (v) => resolve(v)?.product) };
        cache.key = [d.placements, s, a];
      }
      return cache.ctx;
    };
    return { snap: (raw, tolMm, free) => snapTie(raw, ctxNow(), tolMm, free) };
  }, []);
}

const round = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });

export const CeilingClothNode = memo(function CeilingClothNode({
  placement,
  rail,
  cloth,
  selected,
  grabbable,
  locked,
  ctx,
  ties,
  onSelect,
  onRail,
  onEnd,
}: {
  placement: Placement;
  rail: Rail;
  /** The cloth as drawn (lib/studio/ceiling-cloth.ts clothView) — the same object while nothing moved. */
  cloth: ClothView;
  selected: boolean;
  /** Its whole cloth takes the pointer — the ceiling plane is the one being worked in. Otherwise only
   *  its outline and its ties do, or a canopy over the tables would swallow every press on them (the
   *  chandelier's rule). */
  grabbable: boolean;
  /** Pinned (Placement.locked), or a host that writes no rail: selected, but no grips and no carry. */
  locked?: boolean;
  ctx: CanvasLayerContext;
  ties: ClothTies;
  onSelect: (id: string, additive: boolean) => void;
  onRail: (id: string, rail: Rail) => void;
  /** The end of one drag — the host closes its history entry here. */
  onEnd: () => void;
}) {
  const r = resolve(placement.variantId);
  const colour = r?.swatch ?? r?.product.appearance?.style?.fill ?? (cloth.kind === "sail" ? "#F4F1EA" : "#F3EDE2");
  const ink = isDark(colour) ? "var(--color-ink)" : "var(--color-ink-soft)";
  // Its outline(s): what takes the pointer and what the selection is drawn round.
  const polys = clothPolygons(cloth);
  // Nothing to draw: a sail whose wall or thing is gone. It still lists and prices; the bar says why.
  if (cloth.kind === "sail" && !cloth.sheet) return null;

  // Carrying the whole cloth: a run, a canopy, a sail standing on its own posts.
  const carries = !locked && (rail.type !== "sail" || sailIsFree(rail));
  const pressBody = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!carries || e.button !== 0) return;
    const from = rail;
    const start = ctx.clientToMm(e.clientX, e.clientY);
    startPointerGesture(e, {
      onStart: () => onSelect(placement.id, false),
      onMove: (ev) => {
        const at = ctx.clientToMm(ev.clientX, ev.clientY);
        onRail(placement.id, railMoved(from, Math.round(at.x - start.x), Math.round(at.y - start.y)));
      },
      onEnd: (_ev, moved) => {
        if (moved) onEnd();
      },
    });
  };
  const click = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(placement.id, isAdditiveClick(e));
  };

  // The grips: every tie of a sail, the two ends of a run, every corner of a canopy.
  const grips: Point[] = rail.type === "sail" ? (cloth.sheet?.polygon ?? []) : rail.type === "run" ? [rail.a, rail.b] : rail.type === "canopy" ? rail.outline : [];
  const moveGrip = (i: number, raw: Point, free: boolean, from: Rail): Rail | null => {
    if (from.type === "sail") return sailTieMoved(from, i, ties.snap(raw, ctx.mm(TIE_SNAP_PX), free));
    const p = free ? round(raw) : ctx.snap(raw);
    if (from.type === "run") return runEndMoved(from, i === 0 ? 0 : 1, p);
    if (from.type === "canopy") return canopyCornerMoved(from, i, p);
    return null;
  };
  const pressGrip = (i: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const from = rail;
    startPointerGesture(e, {
      onMove: (ev) => {
        const next = moveGrip(i, ctx.clientToMm(ev.clientX, ev.clientY), ev.altKey, from);
        if (next) onRail(placement.id, next);
      },
      onEnd: (_ev, moved) => {
        ctx.endSnap();
        if (moved) onEnd();
      },
    });
  };

  const showHeights = selected || ctx.dims;
  const hit = grabbable || selected;
  const label = cloth.kind === "sail" ? `${r?.label ?? "מפרש"} — מפרש` : `${r?.label ?? "בד תקרה"} — בד תקרה`;
  return (
    <g>
      {cloth.kind === "sail" && cloth.sheet ? (
        <SailCloth
          sheet={cloth.sheet}
          fill={colour}
          ink={ink}
          tieMm={ctx.mm(9)}
          textMm={showHeights ? ctx.mm(11) : undefined}
          halo="var(--color-canvas)"
          postFill="var(--color-ink-soft)"
        />
      ) : (
        <DrapeRuns runs={cloth.runs} area={cloth.area} fill={colour} ink={ink} />
      )}
      {/* What takes the pointer: the whole cloth while it is being worked on, else its outline. */}
      {polys.map((poly, i) => (
        <path
          key={i}
          d={polygonD(poly)}
          fill={hit ? "transparent" : "none"}
          stroke="transparent"
          strokeWidth={12}
          vectorEffect="non-scaling-stroke"
          tabIndex={i === 0 ? 0 : -1}
          role="button"
          aria-label={label}
          className={(carries && selected ? "cursor-move" : "cursor-pointer") + " touch-none focus:outline-none"}
          onPointerDown={pressBody}
          onClick={click}
        />
      ))}
      {/* Selected: a second stroke round it, never a repaint of its cloth. */}
      {selected &&
        polys.map((poly, i) => (
          <path
            key={`sel${i}`}
            d={polygonD(poly)}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            className="pointer-events-none"
          />
        ))}
      {selected &&
        !locked &&
        grips.map((p, i) => (
          <circle
            key={`g${i}`}
            cx={p.x}
            cy={p.y}
            r={ctx.mm(7)}
            fill="var(--color-canvas)"
            stroke="var(--color-accent)"
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
            role="slider"
            aria-label={rail.type === "sail" ? `קשירה ${i + 1} של המפרש` : rail.type === "run" ? (i === 0 ? "תחילת הבד" : "סוף הבד") : `פינה ${i + 1} של השטח`}
            className="cursor-grab touch-none focus:outline-none"
            onPointerDown={pressGrip(i)}
            onClick={(e) => e.stopPropagation()}
          />
        ))}
    </g>
  );
});
