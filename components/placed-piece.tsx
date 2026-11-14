"use client";

import { memo } from "react";
import type { Placement, Point } from "@/lib/design-document/types";
import type { Footprint } from "@/lib/studio/footprint";
import { aisleOf, chairBlockOf, resolve, type AisleView } from "@/lib/studio/catalog-resolver";
import { chairStyleOf, drawStyleOf, symbolCount, symbolOf } from "@/lib/catalog/symbols";
import { chandelierDrawOf } from "@/lib/catalog/chandelier";
import { chuppahDrawOf } from "@/lib/catalog/chuppah";
import { pergolaPostOf } from "@/lib/venues/pergola";
import { flowerDrawSpecOf } from "@/lib/catalog/flower-spec";
import { climbRise } from "@/lib/studio/climb-item";
import { resolveStyle } from "@/lib/element-style";
import { MIRROR_TRANSFORM } from "@/lib/design-document/mirror";
import { vesselOf } from "@/lib/catalog/vessel";
import { borderOf } from "@/lib/catalog/border";
import { AISLE_GHOST_MM } from "@/lib/catalog/aisle";
import { FootprintShape, placementFootprint, productStyle } from "./footprint-shape";
import { ItemSymbol } from "./item-symbol";
import { ChairBlock } from "./chair-block";
import { VesselMark } from "./vessel-mark";

// ONE PLACED ITEM as the plan draws it at rest — its category's picture in its shade (flowers in
// their vase, a block of chairs as its chairs, an aisle as its lining), else its outline. A still
// picture with no pointer: what a composite's card is drawn with (components/composition-drawing.tsx)
// and what an AISLE draws at every one of its spots (lib/catalog/aisle.ts) — each piece exactly as
// its own row would be drawn standing there.

export function PlacedPiece({
  placement: p,
  at,
  rotation,
  footprint,
  overhead,
  tone: toneOver,
  ink,
  print,
  detail = false,
}: {
  placement: Placement;
  at: Point;
  rotation: number;
  footprint?: Footprint;
  overhead?: boolean;
  /** Draw it in this tone instead of its shade's — the grey booklet's flat fill. */
  tone?: string;
  ink?: string;
  print?: boolean;
  /** Its inner detail (a flower's petals) — off on a card, on where the plan zooms into it. */
  detail?: boolean;
}) {
  const r = resolve(p.variantId);
  const product = r?.product;
  const f = footprint ?? placementFootprint(p);
  const block = chairBlockOf(p);
  const aisle = block ? null : aisleOf(p);
  const symbol = block || aisle || p.stage ? null : symbolOf(product, f);
  const style = resolveStyle(productStyle(product), print ? "monochrome" : "screen", { fill: "var(--color-surface)", stroke: ink ?? "var(--color-border)", strokeWidth: 1.5 });
  const tone = toneOver ?? r?.swatch ?? product?.appearance?.style?.fill;
  const scale = p.scale || 1;
  // The vase an arrangement stands in, drawn with it (lib/catalog/vessel.ts) as the plan will.
  const vessel = symbol === "flowers" || symbol === "centerpiece" ? vesselOf(p, (id) => resolve(id)?.product) : undefined;
  return (
    <g transform={`translate(${at.x} ${at.y})${rotation ? ` rotate(${rotation})` : ""}${p.mirrored ? ` ${MIRROR_TRANSFORM}` : ""}${scale !== 1 ? ` scale(${scale})` : ""}`}>
      {vessel && <VesselMark variantId={vessel} pass="under" holder={f} ink={ink} print={print} tone={print ? toneOver : undefined} />}
      {aisle ? (
        <AisleDrawing view={aisle} tone={toneOver} ink={ink} print={print} detail={detail} />
      ) : block ? (
        <ChairBlock product={block.product} spec={block.spec} tone={tone} ink={ink} print={print} />
      ) : symbol && product ? (
        <ItemSymbol
          kind={symbol}
          footprint={f}
          count={symbolCount(product, symbol)}
          flowers={symbol === "flowers" || symbol === "centerpiece" ? flowerDrawSpecOf(product, f, tone) : undefined}
          tone={tone}
          ink={ink}
          print={print}
          overhead={overhead}
          chairStyle={chairStyleOf(product)}
          drawStyle={drawStyleOf(product)}
          chandelier={chandelierDrawOf(product.appearance, product.variants)}
          chuppah={chuppahDrawOf(product.appearance)}
          postMm={pergolaPostOf(product)}
          rise={symbol === "stairs" || symbol === "ramp" ? climbRise(product, p.climb) : undefined}
          detail={detail}
          border={symbol === "runner" ? borderOf(p, product) : undefined}
        />
      ) : (
        <FootprintShape
          footprint={f}
          overhead={overhead}
          fill={tone ?? style.fill}
          fillOpacity={tone ? 1 : style.fillOpacity}
          stroke={style.stroke}
          strokeOpacity={style.strokeOpacity}
          strokeWidth={style.strokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {vessel && <VesselMark variantId={vessel} pass="over" holder={f} ink={ink} print={print} />}
    </g>
  );
}

/** AN AISLE in its own frame (lib/catalog/aisle.ts): the runner down its walk, then the piece that
 *  lines it at every spot, each drawn as its own row draws it. With no piece chosen yet the spots are
 *  dashed markers, so the aisle still reads as one and says what it is waiting for.
 *
 *  Takes no pointer — the caller lays the aisle's footprint over it. Memoised on the view, which the
 *  resolver keeps per placement object (aisleOf), so a pan draws none of it again. */
export const AisleDrawing = memo(function AisleDrawing({
  view,
  tone,
  runnerTone,
  ink,
  print,
  detail = true,
}: {
  view: AisleView;
  /** Every piece in this tone (the grey booklet's flat item fill) instead of its own shade. */
  tone?: string;
  /** The runner's fill instead of its own colour (the grey booklet's rug tone). */
  runnerTone?: string;
  ink?: string;
  print?: boolean;
  detail?: boolean;
}) {
  const { layout, pieces } = view;
  const r = layout.runner;
  const line = ink ?? "var(--color-ink-soft)";
  const hem = r ? Math.min(90, r.widthMm * 0.08) : 0;
  return (
    <g className="pointer-events-none">
      {r && (
        <>
          <rect
            x={-r.lengthMm / 2}
            y={r.y - r.widthMm / 2}
            width={r.lengthMm}
            height={r.widthMm}
            fill={runnerTone ?? r.colour}
            stroke={line}
            strokeOpacity={print ? 1 : 0.45}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {/* Its two hems, a hand in from each long edge — a strip of cloth, not a painted lane. */}
          {[-1, 1].map((s) => (
            <line
              key={s}
              x1={-r.lengthMm / 2}
              x2={r.lengthMm / 2}
              y1={r.y + s * (r.widthMm / 2 - hem)}
              y2={r.y + s * (r.widthMm / 2 - hem)}
              stroke={line}
              strokeOpacity={print ? 0.6 : 0.22}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </>
      )}
      {pieces.length > 0
        ? pieces.map((p) => <PlacedPiece key={p.id} placement={p} at={p.position} rotation={p.rotation} tone={tone} ink={ink} print={print} detail={detail} />)
        : layout.spots.map((s, i) => (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={AISLE_GHOST_MM.widthMm / 2}
              fill="none"
              stroke={ink ?? "var(--color-accent)"}
              strokeOpacity={0.7}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
    </g>
  );
});
