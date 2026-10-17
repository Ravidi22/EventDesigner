import { memo, useMemo } from "react";
import type { Product } from "@/lib/catalog/types";
import type { ChairRows } from "@/lib/design-document/types";
import { chairRowsLayout } from "@/lib/design-document/chair-rows";
import { footprintBounds, resolveFootprint } from "@/lib/studio/footprint";
import { chairStyleOf, symbolOf } from "@/lib/catalog/symbols";
import { FootprintShape } from "@/components/footprint-shape";
import { ItemSymbol } from "@/components/item-symbol";

/** A BLOCK OF CHAIRS IN ROWS (Placement.rows, lib/design-document/chair-rows.ts), in the block's own
 *  frame — every chair drawn as its catalog row draws that chair (its style, its shade), where
 *  chairRowsLayout puts it, facing the block's front (+y). The one drawing the canvas, the rail's
 *  card and the printed map all use.
 *
 *  It takes no pointer: the caller lays the block's footprint over it to take the press, as it does
 *  for every picture. Memoised on its props by identity — `product` comes out of the resolver's
 *  index and `spec` is the placement's own stored object, so a pan draws none of its chairs again. */
function ChairBlockView({
  product,
  spec,
  tone,
  ink,
  print,
}: {
  product: Product;
  spec: ChairRows;
  /** The chair's colour — its shade's swatch on screen, the sheet's flat grey on the B&W booklet. */
  tone?: string;
  ink?: string;
  print?: boolean;
}) {
  const chair = useMemo(() => resolveFootprint(product), [product]);
  const layout = useMemo(() => {
    const b = footprintBounds(chair);
    return chairRowsLayout(spec, { widthMm: b.w, depthMm: b.h });
  }, [chair, spec]);
  const symbol = symbolOf(product, chair);
  const style = chairStyleOf(product);
  return (
    <g className="pointer-events-none">
      {layout.chairs.map((c, i) => (
        <g key={i} transform={`translate(${c.x} ${c.y})`}>
          {symbol ? (
            <ItemSymbol kind={symbol} footprint={chair} count={1} tone={tone} ink={ink} print={print} chairStyle={style} />
          ) : (
            <FootprintShape footprint={chair} fill={tone ?? "#ffffff"} stroke={ink ?? "var(--color-ink-soft)"} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
        </g>
      ))}
    </g>
  );
}

export const ChairBlock = memo(ChairBlockView);
