"use client";

import { FileUp, Grid3x3, List, Plus } from "lucide-react";
import { CATEGORIES, CATEGORY_BY_ID, CATEGORY_GROUPS, LAYERS } from "@/lib/catalog/categories";
import { STYLE_TAGS } from "@/lib/catalog/categories";
import type { Layer, Product } from "@/lib/catalog/types";
import { TagToggle } from "@/components/tag-toggle";
import { Select } from "@/components/select";
import { IconButton } from "@/components/icon-button";
import { SearchInput } from "@/components/search-input";

export interface FilterState {
  search: string;
  category: string | null; // a CategoryGroupId (lib/catalog/categories.ts) — "הקטגוריות" in the UI
  subcategory: string | null; // a CategoryDef id — "המוצרים" in the UI, scoped to the chosen category
  layer: Layer | null; // where the product sits — "השכבות" in the UI; orthogonal to the two above
  tags: string[];
}

export const EMPTY_FILTERS: FilterState = { search: "", category: null, subcategory: null, layer: null, tags: [] };

export function hasActiveFilters(f: FilterState): boolean {
  return f.search !== "" || f.category !== null || f.subcategory !== null || f.layer !== null || f.tags.length > 0;
}

/** The predicate itself, apart from the control bar below — the studio's catalog rail filters the
 *  same products by the same rules from a much narrower strip of UI, and two copies of "does this
 *  product match" is exactly the kind of pair that drifts.
 *
 *  `category` is a department (CategoryGroupId) and `subcategory` the fine CategoryDef under it, so
 *  the two narrow together rather than competing; `layer` cuts across both. */
export function matchesFilters(p: Product, f: FilterState): boolean {
  if (f.category && CATEGORY_BY_ID[p.category]?.group !== f.category) return false;
  if (f.subcategory && p.category !== f.subcategory) return false;
  if (f.layer && p.layer !== f.layer) return false;
  if (f.tags.length > 0 && !f.tags.some((t) => p.styleTags.includes(t))) return false; // OR within tags
  if (f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    const hay = `${p.name} ${CATEGORY_BY_ID[p.category]?.label ?? ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

// The bordered white bar holds count → category dropdown → product dropdown → layer dropdown →
// search → the page actions (add/import) → view mode at the far end (`ms-auto`) — the top header's
// own search box is hidden on this page (AppShell), so this is still the only search box, just
// moved down here. Style pills sit outside that white frame, as their own plain row underneath.
export function Filters({
  value,
  onChange,
  resultCount,
  viewMode,
  onViewModeChange,
  onAddProduct,
  onImportCsv,
  searchValue,
  onSearchChange,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
  resultCount: number;
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  onAddProduct: () => void;
  onImportCsv: () => void;
  searchValue: string;
  onSearchChange: (v: string) => void;
}) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const toggleTag = (tag: string) =>
    set({ tags: value.tags.includes(tag) ? value.tags.filter((t) => t !== tag) : [...value.tags, tag] });

  // The product dropdown cascades from the category: once a category is picked, only its own
  // products make sense to offer (picking one from a different category would just zero out the
  // results). Changing the category clears whatever product was picked, since it may no longer
  // belong to the new one.
  const subcategoryOptions = value.category ? CATEGORIES.filter((c) => c.group === value.category) : CATEGORIES;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5">
        <span className="nums shrink-0 text-sm text-muted">{resultCount} מוצרים</span>

        <Select
          value={value.category ?? ""}
          onChange={(v) => set({ category: v || null, subcategory: null })}
          aria-label="קטגוריה"
          options={[{ value: "", label: "כל הקטגוריות" }, ...CATEGORY_GROUPS.map((g) => ({ value: g.id, label: g.label }))]}
          className="w-40 shrink-0"
        />

        <Select
          value={value.subcategory ?? ""}
          onChange={(v) => set({ subcategory: v || null })}
          aria-label="מוצר"
          options={[{ value: "", label: "כל המוצרים" }, ...subcategoryOptions.map((c) => ({ value: c.id, label: c.label }))]}
          className="w-40 shrink-0"
        />

        <Select
          value={value.layer ?? ""}
          onChange={(v) => set({ layer: (v as Layer) || null })}
          aria-label="שכבה"
          options={[{ value: "", label: "כל השכבות" }, ...LAYERS.map((l) => ({ value: l.id, label: l.label }))]}
          className="w-32 shrink-0"
        />

        <SearchInput
          value={searchValue}
          onChange={onSearchChange}
          placeholder="חיפוש מוצר..."
          aria-label="חיפוש מוצר"
          className="w-48 shrink-0"
        />

        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="ייבוא מוצרים מקובץ CSV" onClick={onImportCsv}>
            <FileUp className="h-4 w-4" strokeWidth={2} />
          </IconButton>
          <IconButton label="הוספת מוצר חדש" onClick={onAddProduct}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
          </IconButton>
        </div>

        <div className="ms-auto flex shrink-0 gap-1 rounded-pill bg-bg p-1">
          {([
            ["grid", Grid3x3, "תצוגת רשת"],
            ["list", List, "תצוגת רשימה"],
          ] as const).map(([m, Icon, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => onViewModeChange(m)}
              aria-pressed={viewMode === m}
              aria-label={label}
              title={label}
              className={
                "rounded-pill p-1.5 transition-colors " +
                (viewMode === m ? "bg-surface text-accent-hover shadow-floating" : "text-ink-soft hover:text-accent-hover")
              }
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-1">
        <TagToggle active={value.tags.length === 0} onClick={() => set({ tags: [] })}>
          הכל
        </TagToggle>
        {STYLE_TAGS.map((tag) => (
          <TagToggle key={tag} active={value.tags.includes(tag)} onClick={() => toggleTag(tag)}>
            {tag}
          </TagToggle>
        ))}
      </div>
    </div>
  );
}
