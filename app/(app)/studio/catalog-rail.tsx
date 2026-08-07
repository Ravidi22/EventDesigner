"use client";

import { useEffect, useMemo, useState } from "react";
import { Heart } from "lucide-react";
import type { Product } from "@/lib/catalog/types";
import { loadProducts } from "@/lib/catalog/storage";
import { CATEGORY_BY_ID, LAYER_LABEL } from "@/lib/catalog/categories";
import { formatDimensions } from "@/lib/catalog/format";
import { loadFolder, likedProductIds, loadImages } from "@/lib/gallery/storage";
import { activeEvent } from "@/lib/events/storage";
import { SearchInput } from "@/components/search-input";
import { ProductImage } from "../catalog/product-image";

// Drag source. Each row carries its product id via dataTransfer; the canvas resolves the drop.
// The products the client liked in the gallery (F-5.4) are pinned to the top ("תיק האירוע") so the
// designer places from the shortlist first — the whole catalog stays available below.
export function CatalogRail() {
  const [q, setQ] = useState("");
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // localStorage is client-only — resolve the catalog + active event's liked products after mount.
  useEffect(() => {
    setProducts(loadProducts().filter((p) => !p.archived)); // F-4.5: archived stay off the rail
    const ev = activeEvent();
    if (ev) setLikedIds(likedProductIds(loadImages(), loadFolder(ev.id)));
  }, []);

  const { liked, rest } = useMemo(() => {
    const s = q.trim().toLowerCase();
    const match = (p: Product) => !s || p.name.toLowerCase().includes(s);
    const byId = new Map(products.map((p) => [p.id, p]));
    const likedSet = new Set(likedIds);
    const liked = likedIds.map((id) => byId.get(id)).filter((p): p is Product => !!p && match(p));
    const rest = products.filter((p) => !likedSet.has(p.id) && match(p));
    return { liked, rest };
  }, [q, likedIds, products]);

  const empty = liked.length === 0 && rest.length === 0;

  return (
    <aside className="flex w-64 shrink-0 flex-col border-s border-border bg-surface">
      <div className="border-b border-border p-3">
        <SearchInput value={q} onChange={setQ} placeholder="חיפוש בקטלוג…" aria-label="חיפוש בקטלוג" />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {liked.length > 0 && (
          <>
            <SectionLabel>
              <Heart className="h-3.5 w-3.5 text-accent" strokeWidth={2} fill="currentColor" />
              בתיק האירוע
              <span className="nums text-muted">{liked.length}</span>
            </SectionLabel>
            <ul className="flex flex-col gap-1">
              {liked.map((p) => (
                <ProductRow key={p.id} product={p} />
              ))}
            </ul>
            <SectionLabel className="mt-4">כל הקטלוג</SectionLabel>
          </>
        )}
        <ul className="flex flex-col gap-1">
          {rest.map((p) => (
            <ProductRow key={p.id} product={p} />
          ))}
        </ul>
        {empty && <p className="p-4 text-center text-sm text-muted">אין תוצאות</p>}
      </div>
      <p className="border-t border-border px-3 py-2 text-xs leading-relaxed text-muted">
        גרור פריט אל האולם. פריטי שולחן — על שולחן; רצפה ותקרה — לכל נקודה.
      </p>
    </aside>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-1.5 pb-1.5 text-xs font-medium text-ink-soft ${className}`}>
      {children}
    </div>
  );
}

function ProductRow({ product: p }: { product: Product }) {
  return (
    <li>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/product", p.id);
          e.dataTransfer.effectAllowed = "copy";
        }}
        className="group flex cursor-grab items-center gap-2.5 rounded-md border border-transparent p-1.5 transition-colors hover:border-border hover:bg-bg active:cursor-grabbing"
      >
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-border">
          <ProductImage imageUrl={p.imageUrl} category={p.category} name={p.name} productId={p.id} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{p.name}</p>
          <p className="nums truncate text-xs text-muted">{formatDimensions(p.dimensions)}</p>
        </div>
        <span className="shrink-0 rounded-sm bg-bg px-1.5 py-0.5 text-xs text-ink-soft">{LAYER_LABEL[p.layer]}</span>
      </div>
    </li>
  );
}

export { CATEGORY_BY_ID };
