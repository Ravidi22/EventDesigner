"use client";

import { X } from "lucide-react";
import { CATEGORIES, CATEGORY_BY_ID, LAYERS } from "@/lib/catalog/categories";
import { STYLE_TAGS } from "@/lib/catalog/sample-data";
import type { Layer, Product } from "@/lib/catalog/types";
import { SearchInput } from "@/components/search-input";
import { TagToggle } from "@/components/tag-toggle";
import { Select } from "@/components/select";

export interface FilterState {
  search: string;
  category: string | null;
  layer: Layer | null;
  tags: string[];
}

export const EMPTY_FILTERS: FilterState = { search: "", category: null, layer: null, tags: [] };

export function hasActiveFilters(f: FilterState): boolean {
  return f.search !== "" || f.category !== null || f.layer !== null || f.tags.length > 0;
}

/** The predicate itself, apart from the control bar below — the studio's catalog rail filters the
 *  same products by the same rules from a much narrower strip of UI, and two copies of "does this
 *  product match" is exactly the kind of pair that drifts. */
export function matchesFilters(p: Product, f: FilterState): boolean {
  if (f.category && p.category !== f.category) return false;
  if (f.layer && p.layer !== f.layer) return false;
  if (f.tags.length > 0 && !f.tags.some((t) => p.styleTags.includes(t))) return false; // OR within tags
  if (f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    const hay = `${p.name} ${CATEGORY_BY_ID[p.category]?.label ?? ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function Filters({
  value,
  onChange,
  resultCount,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
  resultCount: number;
}) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const toggleTag = (tag: string) =>
    set({ tags: value.tags.includes(tag) ? value.tags.filter((t) => t !== tag) : [...value.tags, tag] });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          className="min-w-56 flex-1"
          value={value.search}
          onChange={(v) => set({ search: v })}
          placeholder="חיפוש מוצר…"
          aria-label="חיפוש מוצר"
        />

        <Select
          value={value.category ?? ""}
          onChange={(v) => set({ category: v || null })}
          aria-label="קטגוריה"
          options={[{ value: "", label: "כל הקטגוריות" }, ...CATEGORIES.map((c) => ({ value: c.id, label: c.label }))]}
          className="w-40"
        />

        <Select
          value={value.layer ?? ""}
          onChange={(v) => set({ layer: (v as Layer) || null })}
          aria-label="שכבה"
          options={[{ value: "", label: "כל השכבות" }, ...LAYERS.map((l) => ({ value: l.id, label: l.label }))]}
          className="w-36"
        />

        <span className="nums ms-auto text-sm text-muted">{resultCount} מוצרים</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {STYLE_TAGS.map((tag) => (
          <TagToggle key={tag} active={value.tags.includes(tag)} onClick={() => toggleTag(tag)}>
            {tag}
          </TagToggle>
        ))}
        {hasActiveFilters(value) && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-muted transition-colors hover:text-ink"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
            נקה סינון
          </button>
        )}
      </div>
    </div>
  );
}
