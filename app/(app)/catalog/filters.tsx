"use client";

import { X } from "lucide-react";
import { CATEGORIES, LAYERS } from "@/lib/catalog/categories";
import { STYLE_TAGS } from "@/lib/catalog/sample-data";
import type { Layer } from "@/lib/catalog/types";
import { SearchInput } from "@/components/search-input";
import { TagToggle } from "@/components/tag-toggle";
import { controlClassName } from "@/components/control";

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

const selectClass = `${controlClassName} px-2.5`;

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

        <select
          value={value.category ?? ""}
          onChange={(e) => set({ category: e.target.value || null })}
          aria-label="קטגוריה"
          className={selectClass}
        >
          <option value="">כל הקטגוריות</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          value={value.layer ?? ""}
          onChange={(e) => set({ layer: (e.target.value as Layer) || null })}
          aria-label="שכבה"
          className={selectClass}
        >
          <option value="">כל השכבות</option>
          {LAYERS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>

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
