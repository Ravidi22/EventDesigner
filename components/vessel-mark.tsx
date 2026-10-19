import { memo } from "react";
import { resolve } from "@/lib/studio/catalog-resolver";
import { footprintBounds, resolveFootprint, type Footprint } from "@/lib/studio/footprint";
import { symbolOf } from "@/lib/catalog/symbols";
import { ItemSymbol } from "./item-symbol";
import { FootprintShape } from "./footprint-shape";

// The vase or jug an arrangement stands in (lib/catalog/vessel.ts), drawn WITH the arrangement, in
// the arrangement's own frame — two passes, so every surface that draws an arrangement puts the two
// in the same order: `under` before the flowers (a low bowl wider than its flowers shows round
// them), `over` after them (a tall vase the flowers cover entirely is its rim, dashed — the plan's
// hidden-line convention, so the crew still reads that the flowers stand in something). No "use
// client": a pure function of its props.

export const VesselMark = memo(function VesselMark({
  variantId,
  pass,
  holder,
  ink = "var(--color-ink-soft)",
  print,
  tone,
}: {
  variantId: string;
  pass: "under" | "over";
  /** The arrangement's own footprint — what the `over` pass is hidden by. */
  holder: Footprint;
  ink?: string;
  print?: boolean;
  /** Its fill on paper (the booklet's flat grey); on screen its own shade. */
  tone?: string;
}) {
  const r = resolve(variantId);
  if (!r) return null;
  const f = resolveFootprint(r.product);
  const v = footprintBounds(f);
  if (!(v.w > 0 && v.h > 0)) return null;
  if (pass === "over") {
    const h = footprintBounds(holder);
    // As wide as the flowers or wider: it already shows round them.
    if (v.w >= h.w * 0.97 && v.h >= h.h * 0.97) return null;
    return (
      <FootprintShape
        footprint={f}
        fill="none"
        stroke={ink}
        strokeOpacity={print ? 1 : 0.7}
        strokeWidth={1}
        strokeDasharray="3 2"
        vectorEffect="non-scaling-stroke"
        className="pointer-events-none"
      />
    );
  }
  const own = print ? tone : (tone ?? r.swatch ?? r.product.appearance?.style?.fill);
  const symbol = symbolOf(r.product, f);
  return (
    <g className="pointer-events-none">
      {symbol ? (
        <ItemSymbol kind={symbol} footprint={f} count={1} tone={own} ink={ink} print={print} />
      ) : (
        <FootprintShape footprint={f} fill={own ?? "#ffffff"} stroke={ink} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
    </g>
  );
});
