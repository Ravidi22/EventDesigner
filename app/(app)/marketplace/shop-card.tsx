import Link from "next/link";
import { Check, MapPin } from "lucide-react";
import type { MarketShop } from "@/lib/marketplace/types";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { ShopAvatar, ShopCover } from "./shop-face";

/** How many of a shop's categories the card names before folding the rest into "+N". */
const SHOWN_CATEGORIES = 3;

// A supplier on the marketplace's first page, the way a page or a shop is shown on a social
// marketplace: a cover of what they sell, their logo on its edge, their name, what they sell in,
// and how much of it is already in this studio's catalog. The whole card opens their shop.
export function ShopCard({ shop, href, matches }: { shop: MarketShop; href: string; matches?: number }) {
  const { supplier, count, categories, preview, inCatalog } = shop;
  const shown = categories.slice(0, SHOWN_CATEGORIES);
  return (
    <Link
      href={href}
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface text-right transition duration-150 ease-fluid hover:-translate-y-0.5 hover:shadow-floating focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <ShopCover products={preview} className="aspect-[16/9]" />
      <div className="flex flex-1 flex-col px-4 pb-4">
        <ShopAvatar supplier={supplier} className="-mt-8 h-16 w-16" />
        <h3 className="mt-2 font-display text-lg leading-tight text-ink">{supplier.name}</h3>
        {supplier.address && (
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            <span className="truncate">{supplier.address}</span>
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {shown.map((c) => (
            <span key={c.id} className="rounded-pill border border-border bg-inset px-2.5 py-0.5 text-xs font-medium text-ink-soft">
              {CATEGORY_BY_ID[c.id]?.label ?? c.id}
            </span>
          ))}
          {categories.length > shown.length && (
            <span className="nums rounded-pill px-1.5 py-0.5 text-xs text-muted">+{categories.length - shown.length}</span>
          )}
        </div>
        <div className="mt-auto flex items-center gap-3 pt-3 text-sm">
          <span className="nums text-ink-soft">
            <span className="font-bold text-ink">{count}</span> פריטים
          </span>
          {matches !== undefined && (
            <span className="nums font-semibold text-accent">{matches} תואמים לחיפוש</span>
          )}
          {inCatalog > 0 && (
            <span className="nums ms-auto inline-flex items-center gap-1 text-xs text-muted">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              {inCatalog} בקטלוג שלי
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
