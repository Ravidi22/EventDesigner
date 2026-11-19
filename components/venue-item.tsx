"use client";

import { memo, useMemo } from "react";
import type { Placement } from "@/lib/design-document/types";
import { resolveFootprint, type Footprint } from "@/lib/studio/footprint";
import { symbolOf } from "@/lib/catalog/symbols";
import type { Product } from "@/lib/catalog/types";
import { itemProductOf, itemVariantId } from "@/lib/venues/item";
import type { StructureFeature } from "@/lib/venues/structure";
import { PlacedPiece } from "./placed-piece";

// A CATALOG ITEM IN A VENUE (lib/venues/item.ts) as the plan draws it: its own row's picture — a
// chandelier's arms, a sofa's cushions, a tree's canopy — in its shade, from the copy the feature
// keeps, at the size its box has now. The one drawing /halls, the sketch and both printed looks use.
// In the feature's own frame (the caller's place-and-turn group); takes no pointer.

type ItemDrawing = { product: Product; placement: Placement; footprint: Footprint };

const cache = new WeakMap<StructureFeature, ItemDrawing | null>();

/** The copy as a product, a placement of it at the origin, and its footprint — once per feature
 *  object, so a pan or a drag of something else draws none of it again. */
export function itemDrawingOf(f: StructureFeature): ItemDrawing | null {
  const hit = cache.get(f);
  if (hit !== undefined) return hit;
  const product = itemProductOf(f);
  const out = product
    ? {
        product,
        placement: { id: f.id, variantId: itemVariantId(product), layer: product.layer, quantity: 1, position: { x: 0, y: 0 }, rotation: 0, scale: 1 } satisfies Placement,
        footprint: resolveFootprint(product),
      }
    : null;
  cache.set(f, out);
  return out;
}

/** Whether the item draws a picture of its own (else it is its outline, and the plan names it). */
export function itemHasPicture(f: StructureFeature): boolean {
  const d = itemDrawingOf(f);
  return !!d && !!symbolOf(d.product, d.footprint);
}

export const VenueItemGlyph = memo(function VenueItemGlyph({
  feature,
  tone,
  ink,
  print,
  detail,
}: {
  feature: StructureFeature;
  /** Every part in this tone instead of its shade's — the grey booklet's flat item fill. */
  tone?: string;
  ink?: string;
  print?: boolean;
  detail?: boolean;
}) {
  const d = useMemo(() => itemDrawingOf(feature), [feature]);
  if (!d) return null;
  return (
    <g className="pointer-events-none">
      <PlacedPiece
        placement={d.placement}
        product={d.product}
        at={{ x: 0, y: 0 }}
        rotation={0}
        footprint={d.footprint}
        overhead={d.product.layer === "ceiling"}
        tone={tone ?? feature.style?.fill}
        ink={ink}
        print={print}
        detail={detail}
      />
    </g>
  );
});
