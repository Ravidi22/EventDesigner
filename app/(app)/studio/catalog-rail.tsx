"use client";

import { useEffect, useMemo, useState } from "react";
import { Heart, SlidersHorizontal, X } from "lucide-react";
import type { Product } from "@/lib/catalog/types";
import { CATEGORY_BY_ID, CATEGORY_GROUPS, LAYER_LABEL, STYLE_TAGS, type CategoryGroupId } from "@/lib/catalog/categories";
import { formatDimensions } from "@/lib/catalog/format";
import { fetchFolder, fetchImages } from "@/lib/gallery/actions";
import { likedProductIds } from "@/lib/gallery/folder-logic";
import { activeEvent } from "@/lib/events/storage";
import { EMPTY_FILTERS, hasActiveFilters, matchesFilters, type FilterState } from "../catalog/filters";
import { SearchInput } from "@/components/search-input";
import { Select } from "@/components/select";
import { TagToggle } from "@/components/tag-toggle";
import { ProductImage } from "../catalog/product-image";

// Drag source. Each row carries its product id via dataTransfer; the canvas resolves the drop.
// The products the client liked in the gallery (F-2.3) are pinned to the top ("תיק האירוע") so the
// designer places from the shortlist first — the whole catalog stays available below.
//
// F-5.2 filtering is the same predicate the catalog screen uses (matchesFilters), driven by a much
// smaller set of controls: at this width a permanent filter bar would cost more rows than it saves,
// so category and style tags live behind a disclosure and only the search box is always up.
//
// `groups` narrows the whole rail to a few departments — the meeting's two drawing passes each get
// their own half of the catalog (HALL_PASS_GROUPS / DESIGN_PASS_GROUPS). It's a floor under the
// filters, not one of them: the category dropdown only ever offers what's in scope, and clearing
// the filters cannot widen the rail past it. Absent = the whole catalog, which is /studio.
export function CatalogRail({
  products: all = [],
  groups,
  hint,
}: { products?: Product[]; groups?: CategoryGroupId[]; hint?: string } = {}) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  // The catalog is fetched and cached by the studio above us and handed down, so opening the studio
  // is one request rather than one per panel — and so the canvas's resolver and this rail are
  // looking at the same list by construction.
  const products = useMemo(() => all.filter((p) => !p.archived), [all]); // F-4.5: archived stay off the rail

  // The event, the photo library and the event's folder are all server reads. Until they land the
  // rail shows no hearts, which is what an event with no likes shows anyway.
  //
  // This is the read that the folder's crossing was for: the likes happened on the client's tablet,
  // and this rail is on the designer's laptop.
  useEffect(() => {
    let live = true;
    void (async () => {
      const ev = await activeEvent();
      if (!live || !ev) return;
      const [images, folder] = await Promise.all([fetchImages(), fetchFolder(ev.id)]);
      if (live) setLikedIds(likedProductIds(images, folder));
    })();
    return () => {
      live = false;
    };
  }, []);

  const set = (patch: Partial<FilterState>) => setFilters((f) => ({ ...f, ...patch }));
  const toggleTag = (tag: string) =>
    setFilters((f) => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] }));

  const allowedGroups = useMemo(() => (groups ? new Set(groups) : null), [groups]);

  const { liked, rest } = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const likedSet = new Set(likedIds);
    const inScope = (p: Product) => !allowedGroups || allowedGroups.has(CATEGORY_BY_ID[p.category]?.group);
    const match = (p: Product) => inScope(p) && matchesFilters(p, filters);
    // The event folder is filtered too, not exempted: a search for "פמוט" that still shows six
    // liked chuppah photos above the result is a search that didn't happen.
    const liked = likedIds.map((id) => byId.get(id)).filter((p): p is Product => !!p && match(p));
    const rest = products.filter((p) => !likedSet.has(p.id) && match(p));
    return { liked, rest };
  }, [filters, likedIds, products, allowedGroups]);

  const empty = liked.length === 0 && rest.length === 0;
  const active = hasActiveFilters(filters);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-s border-border bg-surface">
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <div className="flex items-center gap-1.5">
          <SearchInput
            value={filters.search}
            onChange={(v) => set({ search: v })}
            placeholder="חיפוש בקטלוג…"
            aria-label="חיפוש בקטלוג"
            className="min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
            aria-label="סינון לפי קטגוריה וסגנון"
            title="סינון לפי קטגוריה וסגנון"
            className={
              "relative shrink-0 rounded-md border p-2 transition-colors " +
              (showFilters || active
                ? "border-accent-line bg-accent-tint text-accent"
                : "border-border text-muted hover:text-ink")
            }
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} />
            {active && !showFilters && (
              <span className="absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" aria-hidden />
            )}
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-col gap-2">
            {/* Departments, not the fine categories: the same level as the catalog page's first
                dropdown, and at this width one short list beats a thirteen-item one. */}
            <Select
              value={filters.category ?? ""}
              onChange={(v) => set({ category: v || null })}
              aria-label="קטגוריה"
              options={[
                { value: "", label: groups ? "כל הקטגוריות בשלב זה" : "כל הקטגוריות" },
                ...CATEGORY_GROUPS.filter((g) => !groups || groups.includes(g.id)).map((g) => ({ value: g.id, label: g.label })),
              ]}
              className="w-full"
            />
            <div className="flex flex-wrap gap-1">
              {STYLE_TAGS.map((tag) => (
                <TagToggle key={tag} active={filters.tags.includes(tag)} onClick={() => toggleTag(tag)}>
                  {tag}
                </TagToggle>
              ))}
            </div>
            {active && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="inline-flex items-center gap-1 self-start text-xs text-muted transition-colors hover:text-ink"
              >
                <X className="h-3 w-3" strokeWidth={2} />
                ניקוי הסינון
              </button>
            )}
          </div>
        )}
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
        {hint ?? "גרור פריט אל האולם. פריטי שולחן — על שולחן; רצפה ותקרה — לכל נקודה."}
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
