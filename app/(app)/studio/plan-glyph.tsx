"use client";

import { createElement } from "react";
import type { Product } from "@/lib/catalog/types";
import { ICON_BY_NAME } from "@/lib/catalog/map-icons";
import { resolveContent, resolveFootprint, footprintBounds } from "@/lib/studio/footprint";
import { labelAnchor } from "@/lib/studio/label-anchor";
import { isDark, resolveStyle } from "@/lib/element-style";
import { FootprintShape, productStyle } from "@/components/footprint-shape";
import { ItemSymbol } from "@/components/item-symbol";
import { ItemSurface } from "@/components/surface-fill";
import { anySurface } from "@/lib/catalog/textures";
import { chairStyleOf, symbolCount, symbolOf } from "@/lib/catalog/symbols";

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
  // The category's picture when it has one (lib/catalog/symbols.ts) — the same one it lands as.
  const symbol = symbolOf(product, footprint);
  const content = symbol ? { mode: "none" as const, name: product.name } : resolveContent(product);
  const b = footprintBounds(footprint);
  const { w, h } = glyphSize(product, mmPerPx);
  const label = content.mode === "name" ? content.name : "";
  const fontSize = Math.max(140, Math.min(b.h * 0.4, b.w * 0.22));
  const maxChars = Math.max(3, Math.floor((b.w * 0.84) / (fontSize * 0.55)));
  const shown = label.length > maxChars ? label.slice(0, maxChars - 1) + "…" : label;
  const Icon = content.mode === "icon" && content.icon ? ICON_BY_NAME[content.icon] : undefined;
  const iconSize = Math.min(b.w, b.h) * 0.6;
  // The name or icon sits where the canvas will put it — the shape's visual centre, not its box's.
  const at = content.mode === "none" ? { x: 0, y: 0 } : labelAnchor(footprint);
  // The row's own look, as the canvas will draw it once it lands: a drag that shows a white box and
  // drops a navy one is the drag image lying about what it carries. The stroke stays the accent when
  // the row sets none of its own — that is what says "being carried" rather than "already down".
  const style = resolveStyle(productStyle(product), "screen", { fill: "var(--color-surface)", stroke: "var(--color-accent)", strokeWidth: 2 });
  const dark = !!product.appearance?.style?.fill && style.fillOpacity > 0.5 && isDark(style.fill);

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
      {symbol && (
        <ItemSymbol
          kind={symbol}
          footprint={footprint}
          count={symbolCount(product, symbol)}
          tone={product.variants.find((v) => !v.archived && v.swatch)?.swatch ?? product.appearance?.style?.fill}
          overhead={product.layer === "ceiling"}
          chairStyle={chairStyleOf(product)}
        />
      )}
      <FootprintShape
        footprint={footprint}
        fill={style.fill}
        fillOpacity={symbol ? 0 : style.fillOpacity}
        stroke={style.stroke}
        strokeOpacity={style.strokeOpacity}
        strokeWidth={style.strokeWidth}
        strokeDasharray={style.dashArray.length ? style.dashArray.join(" ") : undefined}
        vectorEffect="non-scaling-stroke"
      />
      {!symbol && anySurface(product.appearance) && (
        <>
          <ItemSurface
            appearance={product.appearance}
            footprint={footprint}
            color={product.variants.find((v) => !v.archived && v.swatch)?.swatch ?? product.appearance?.style?.fill}
            seed={product.id}
          />
          <FootprintShape footprint={footprint} fill="none" stroke={style.stroke} strokeOpacity={style.strokeOpacity} strokeWidth={style.strokeWidth} vectorEffect="non-scaling-stroke" />
        </>
      )}
      {content.mode === "name" && (
        <text x={at.x} y={at.y} textAnchor="middle" dominantBaseline="central" fill={dark ? "var(--color-canvas)" : "var(--color-ink)"} style={{ fontSize }}>
          {shown}
        </text>
      )}
      {Icon && (
        <g transform={`translate(${at.x - iconSize / 2} ${at.y - iconSize / 2}) scale(${iconSize / 24})`}>
          {createElement(Icon, { width: 24, height: 24, color: dark ? "var(--color-canvas)" : "var(--color-accent)", strokeWidth: 1.5 })}
        </g>
      )}
    </svg>
  );
}
