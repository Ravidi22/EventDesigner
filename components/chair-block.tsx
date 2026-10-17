import { memo, useMemo } from "react";
import type { Product } from "@/lib/catalog/types";
import type { ChairRows } from "@/lib/design-document/types";
import { chairRowsLayout } from "@/lib/design-document/chair-rows";
import { footprintBounds, resolveFootprint, type Footprint } from "@/lib/studio/footprint";
import { chairStyleOf, symbolOf, type ChairStyle, type SymbolKind } from "@/lib/catalog/symbols";
import type { StructureFeature } from "@/lib/venues/structure";
import { seatingChair } from "@/lib/venues/seating";
import { FootprintShape } from "@/components/footprint-shape";
import { ItemSymbol } from "@/components/item-symbol";

/** CHAIRS IN ROWS (lib/design-document/chair-rows.ts), in the block's own frame — one chair drawn at
 *  every place chairRowsLayout gives, facing the block's front (+y). The one drawing a sketch's block
 *  of a catalog chair (ChairBlock), the venue's own rows (SeatingGlyph), the rail's card, the hall
 *  editor's add-element card and the printed map all use.
 *
 *  It takes no pointer: the caller lays the block's footprint over it to take the press, as it does
 *  for every picture. Memoised on its props by identity — callers hand it the stored spec and a
 *  memoised chair, so a pan draws none of its chairs again. */
const ChairRowsDrawing = memo(function ChairRowsDrawing({
  spec,
  chair,
  symbol,
  chairStyle,
  tone,
  ink,
  print,
}: {
  spec: ChairRows;
  /** One chair's footprint, centred on its own origin, backrest toward −y. */
  chair: Footprint;
  /** How a chair is drawn — null draws its bare outline (a catalog row with its picture switched off). */
  symbol: SymbolKind | null;
  chairStyle?: ChairStyle;
  /** The chair's colour — its shade's swatch on screen, the sheet's flat grey on the B&W booklet. */
  tone?: string;
  ink?: string;
  print?: boolean;
}) {
  const layout = useMemo(() => {
    const b = footprintBounds(chair);
    return chairRowsLayout(spec, { widthMm: b.w, depthMm: b.h });
  }, [chair, spec]);
  return (
    <g className="pointer-events-none">
      {layout.chairs.map((c, i) => (
        <g key={i} transform={`translate(${c.x} ${c.y})`}>
          {symbol ? (
            <ItemSymbol kind={symbol} footprint={chair} count={1} tone={tone} ink={ink} print={print} chairStyle={chairStyle} />
          ) : (
            <FootprintShape footprint={chair} fill={tone ?? "#ffffff"} stroke={ink ?? "var(--color-ink-soft)"} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
        </g>
      ))}
    </g>
  );
});

/** A sketch's BLOCK of a catalog chair (Placement.rows): every chair drawn as its catalog row draws
 *  that chair — its style, its shade. `product` comes out of the resolver's index and `spec` is the
 *  placement's own stored object, so both hold their identity between renders. */
export const ChairBlock = memo(function ChairBlock({
  product,
  spec,
  tone,
  ink,
  print,
}: {
  product: Product;
  spec: ChairRows;
  tone?: string;
  ink?: string;
  print?: boolean;
}) {
  const chair = useMemo(() => resolveFootprint(product), [product]);
  return <ChairRowsDrawing spec={spec} chair={chair} symbol={symbolOf(product, chair)} chairStyle={chairStyleOf(product)} tone={tone} ink={ink} print={print} />;
});

/** The VENUE'S own chairs in rows (a `seating` feature, lib/venues/seating.ts), in the feature's
 *  own frame: its chair is a style and a size rather than a catalog row. */
export const SeatingGlyph = memo(function SeatingGlyph({
  spec,
  tone,
  ink,
  print,
}: {
  /** The feature's stored `seating` (or the default block) — passed as is, for the memo. */
  spec: NonNullable<StructureFeature["seating"]>;
  tone?: string;
  ink?: string;
  print?: boolean;
}) {
  const chair = useMemo<Footprint>(() => ({ kind: "rect", ...seatingChair(spec) }), [spec]);
  return <ChairRowsDrawing spec={spec} chair={chair} symbol="chair" chairStyle={spec.chairStyle ?? "dining"} tone={tone} ink={ink} print={print} />;
});
