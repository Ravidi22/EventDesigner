"use client";

import { createElement } from "react";
import type { Product } from "@/lib/catalog/types";
import { ICON_BY_NAME } from "@/lib/catalog/map-icons";
import { resolveContent, resolveFootprint, footprintBounds } from "@/lib/studio/footprint";
import { FootprintShape } from "@/components/footprint-shape";

// The thing under the pointer while an item is being dragged off the rail — the same picture that
// lands when it is let go.
//
// PlanGlyph is the shared FootprintShape (components/footprint-shape.tsx) plus the same
// name-or-icon the map puts inside it, so the two cannot drift: a drag that shows a list row and
// drops a 2.44-metre circle is a drag the designer has to do once to find out what it meant.

// A drag image is a picture of the item at the size it will land, which at hall zoom can be four
// pixels (a candlestick) or two thousand (a carpet, zoomed right in). Both are useless to drag, so
// the true scale is kept until the longest side leaves this range and is then scaled to fit it —
// the item stays in proportion either way, which is the part that says what it is.
const MIN_PX = 30;
const MAX_PX = 240;

/** The drag image's size in screen pixels, at the canvas's current zoom. Exported alongside the
 *  component because setDragImage needs the offset — the pointer holds the item by its CENTRE,
 *  which is the point the drop lands on. */
export function glyphSize(product: Product, mmPerPx: number): { w: number; h: number } {
  const b = footprintBounds(resolveFootprint(product));
  let pxPerMm = 1 / Math.max(0.01, mmPerPx);
  const longest = Math.max(b.w, b.h) * pxPerMm;
  if (longest > 0 && longest < MIN_PX) pxPerMm *= MIN_PX / longest;
  else if (longest > MAX_PX) pxPerMm *= MAX_PX / longest;
  return { w: Math.max(8, Math.round(b.w * pxPerMm)), h: Math.max(8, Math.round(b.h * pxPerMm)) };
}

/** The item as the plan draws it — the picture that follows the pointer out of the rail. */
export function PlanGlyph({ product, mmPerPx }: { product: Product; mmPerPx: number }) {
  const footprint = resolveFootprint(product);
  const content = resolveContent(product);
  const b = footprintBounds(footprint);
  const { w, h } = glyphSize(product, mmPerPx);
  const label = content.mode === "name" ? content.name : "";
  const fontSize = Math.max(140, Math.min(b.h * 0.4, b.w * 0.22));
  const maxChars = Math.max(3, Math.floor((b.w * 0.84) / (fontSize * 0.55)));
  const shown = label.length > maxChars ? label.slice(0, maxChars - 1) + "…" : label;
  const Icon = content.mode === "icon" && content.icon ? ICON_BY_NAME[content.icon] : undefined;
  const iconSize = Math.min(b.w, b.h) * 0.6;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`${-b.w / 2} ${-b.h / 2} ${b.w} ${b.h}`}
      xmlns="http://www.w3.org/2000/svg"
      // The plan's own resting look for a placed item, and a shadow so the thing reads as lifted off
      // the page rather than already dropped on it.
      style={{ overflow: "visible", filter: "drop-shadow(0 4px 10px rgb(109 85 189 / 0.35))" }}
      aria-hidden
    >
      <FootprintShape
        footprint={footprint}
        fill="var(--color-surface)"
        stroke="var(--color-accent)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      {content.mode === "name" && (
        <text textAnchor="middle" dominantBaseline="central" fill="var(--color-ink)" style={{ fontSize }}>
          {shown}
        </text>
      )}
      {Icon && (
        <g transform={`translate(${-iconSize / 2} ${-iconSize / 2}) scale(${iconSize / 24})`}>
          {createElement(Icon, { width: 24, height: 24, color: "var(--color-accent)", strokeWidth: 1.5 })}
        </g>
      )}
    </svg>
  );
}
