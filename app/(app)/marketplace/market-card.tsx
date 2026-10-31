"use client";

import Link from "next/link";
import { Check, Palette, Plus } from "lucide-react";
import type { MarketItem } from "@/lib/marketplace/types";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { formatDimensions, formatPrice } from "@/lib/catalog/format";
import { Button } from "@/components/button";
import { ProductImage } from "../catalog/product-image";

// The catalog card's shape, without its menu: a marketplace row is not the designer's to edit,
// duplicate or delete, so the one action is the button at the foot. It stands in its supplier's
// shop, so the supplier is the page's header, not a line on every card; and with a grid of them
// the add button is outline weight — one filled CTA per screen.
export function MarketCard({ item, busy, onAdd }: { item: MarketItem; busy: boolean; onAdd: () => void }) {
  const { product, wholesalePrice, inCatalog } = item;
  const category = CATEGORY_BY_ID[product.category];
  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface p-2 text-right transition duration-150 ease-fluid hover:-translate-y-0.5 hover:shadow-floating">
      <div className="relative mb-2 aspect-[4/3] overflow-hidden rounded-md border border-border">
        <ProductImage product={product} />
        {product.variants.length > 0 && (
          <span className="absolute start-1.5 top-1.5 inline-flex items-center gap-1 rounded-pill border border-canvas/50 bg-canvas/70 px-2 py-0.5 text-xs font-medium text-ink-soft backdrop-blur-sm">
            <Palette className="h-3 w-3" strokeWidth={2} />
            <span className="nums">{product.variants.length}</span> גוונים
          </span>
        )}
      </div>

      <h3 className="font-display text-base leading-tight text-ink">{product.name}</h3>
      <p className="nums mt-1 mb-3 text-sm text-muted">
        {formatDimensions(product.dimensions)} · {category?.label}
      </p>
      <div className="-mx-2 mt-auto flex items-center justify-between gap-2 border-t border-border px-3 pt-2.5">
        <span className="flex flex-col">
          <span className="text-xs text-muted">מחיר ספק</span>
          <span className="nums text-lg font-bold text-ink">{formatPrice(wholesalePrice)}</span>
        </span>
        {inCatalog ? (
          <Link
            href="/catalog"
            className="inline-flex items-center gap-1 rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:text-accent-hover"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            בקטלוג שלי
          </Link>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={onAdd}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            {busy ? "מוסיפים…" : "הוספה לקטלוג"}
          </Button>
        )}
      </div>
    </div>
  );
}
