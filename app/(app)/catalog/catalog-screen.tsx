"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@/lib/catalog/types";
import { CATEGORIES } from "@/lib/catalog/categories";
import { SAMPLE_PRODUCTS } from "@/lib/catalog/sample-data";
import { loadProducts, upsertProduct, deleteOrArchiveProduct, saveProducts } from "@/lib/catalog/storage";
import { parseCsvProducts } from "@/lib/catalog/csv";
import { useHeaderSearch } from "@/components/header-search-context";
import { ProductCard } from "./product-card";
import { Filters, EMPTY_FILTERS, matchesFilters, type FilterState } from "./filters";
import { ProductDrawer, blankProduct } from "./product-drawer";
import { FirstRunEmpty, NoResults } from "./empty-state";

export function CatalogScreen() {
  const [products, setProducts] = useState<Product[]>(SAMPLE_PRODUCTS);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [editing, setEditing] = useState<Product | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The visible search box lives in the top header now (AppShell) — its value flows down
  // through context rather than a second, redundant input inside this page.
  const { value: search, setValue: setSearch } = useHeaderSearch();

  useEffect(() => {
    setProducts(loadProducts());
  }, []);

  // F-4.5: archived products are hidden from the catalog (placements still resolve them).
  const visible = useMemo(() => products.filter((p) => !p.archived), [products]);
  // `search` is held in the header-search context rather than in `filters`, so it's spliced in
  // here — the predicate itself is the same one the studio's catalog rail runs.
  const filtered = useMemo(
    () => visible.filter((p) => matchesFilters(p, { ...filters, search })),
    [visible, filters, search],
  );

  const saveProduct = (p: Product) => setProducts(upsertProduct(p));
  const deleteProduct = (id: string) => {
    const { products: next, archived } = deleteOrArchiveProduct(id);
    setProducts(next);
    setNotice(archived ? "המוצר משובץ באירועים ולכן הועבר לארכיון — ההצבות נשמרו." : null);
  };
  // Fresh id for the product AND every variant — a duplicate must never alias the original's
  // variant ids, or isPlacedAnywhere (lib/catalog/storage.ts) would treat it as already placed
  // just because the original happens to be.
  const duplicateProduct = (p: Product) => {
    const copy: Product = {
      ...p,
      id: crypto.randomUUID(),
      name: `${p.name} (עותק)`,
      variants: p.variants.map((v) => ({ ...v, id: crypto.randomUUID() })),
    };
    setProducts(upsertProduct(copy));
  };

  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    const added = parseCsvProducts(await file.text(), CATEGORIES, () => crypto.randomUUID());
    if (added.length === 0) {
      setNotice("לא נמצאו שורות תקינות בקובץ. עמודות: שם, קטגוריה, קוטר/רוחב/עומק/גובה (ס״מ), מחיר.");
      return;
    }
    const next = [...added, ...loadProducts()];
    saveProducts(next);
    setProducts(next);
    setNotice(`נוספו ${added.length} מוצרים מהקובץ. וריאנטים ושדות מיוחדים מוזנים ידנית.`);
  };

  return (
    <div className="px-8 pb-7 pt-3">
      {visible.length === 0 ? (
        <FirstRunEmpty onAdd={() => setEditing(blankProduct())} />
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              importCsv(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          {notice && (
            <p className="mb-4 rounded-md border border-border bg-surface px-4 py-2.5 text-sm text-ink-soft" role="status">
              {notice}
            </p>
          )}

          <Filters
            value={filters}
            onChange={setFilters}
            resultCount={filtered.length}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onAddProduct={() => setEditing(blankProduct())}
            onImportCsv={() => fileRef.current?.click()}
            searchValue={search}
            onSearchChange={setSearch}
          />

          {filtered.length === 0 ? (
            <NoResults
              onClear={() => {
                setFilters(EMPTY_FILTERS);
                setSearch("");
              }}
            />
          ) : viewMode === "list" ? (
            <div className="mt-6 flex flex-col gap-2">
              {filtered.map((p) => (
                <ProductCard key={p.id} product={p} layout="list" onEdit={setEditing} onDuplicate={duplicateProduct} />
              ))}
            </div>
          ) : (
            <div
              className="mt-6 grid gap-4"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}
            >
              {filtered.map((p) => (
                <ProductCard key={p.id} product={p} onEdit={setEditing} onDuplicate={duplicateProduct} />
              ))}
            </div>
          )}
        </>
      )}

      <ProductDrawer
        product={editing}
        onSave={saveProduct}
        onDelete={deleteProduct}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
