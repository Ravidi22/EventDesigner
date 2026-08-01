"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Plus } from "lucide-react";
import type { Product } from "@/lib/catalog/types";
import { Button } from "@/components/button";
import { CATEGORY_BY_ID, CATEGORIES } from "@/lib/catalog/categories";
import { SAMPLE_PRODUCTS } from "@/lib/catalog/sample-data";
import { loadProducts, upsertProduct, deleteOrArchiveProduct, saveProducts } from "@/lib/catalog/storage";
import { parseCsvProducts } from "@/lib/catalog/csv";
import { ProductCard } from "./product-card";
import { Filters, EMPTY_FILTERS, type FilterState } from "./filters";
import { ProductDrawer, blankProduct } from "./product-drawer";
import { FirstRunEmpty, NoResults } from "./empty-state";

function matches(p: Product, f: FilterState): boolean {
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


export function CatalogScreen() {
  const [products, setProducts] = useState<Product[]>(SAMPLE_PRODUCTS);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [editing, setEditing] = useState<Product | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProducts(loadProducts());
  }, []);

  // F-4.5: archived products are hidden from the catalog (placements still resolve them).
  const visible = useMemo(() => products.filter((p) => !p.archived), [products]);
  const filtered = useMemo(() => visible.filter((p) => matches(p, filters)), [visible, filters]);

  const saveProduct = (p: Product) => setProducts(upsertProduct(p));
  const deleteProduct = (id: string) => {
    const { products: next, archived } = deleteOrArchiveProduct(id);
    setProducts(next);
    setNotice(archived ? "המוצר משובץ באירועים ולכן הועבר לארכיון — ההצבות נשמרו." : null);
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
    <div className="px-8 py-7">
      {visible.length === 0 ? (
        <FirstRunEmpty onAdd={() => setEditing(blankProduct())} />
      ) : (
        <>
          <div className="mb-5 flex items-center justify-end gap-2">
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
            <Button variant="ghost" onClick={() => fileRef.current?.click()}>
              <FileUp className="h-4 w-4" strokeWidth={2} />
              ייבוא CSV
            </Button>
            <Button onClick={() => setEditing(blankProduct())}>
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              מוצר חדש
            </Button>
          </div>

          {notice && (
            <p className="mb-4 rounded-md border border-border bg-surface px-4 py-2.5 text-sm text-ink-soft" role="status">
              {notice}
            </p>
          )}

          <Filters value={filters} onChange={setFilters} resultCount={filtered.length} />

          {filtered.length === 0 ? (
            <NoResults onClear={() => setFilters(EMPTY_FILTERS)} />
          ) : (
            <div
              className="mt-6 grid gap-4"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}
            >
              {filtered.map((p) => (
                <ProductCard key={p.id} product={p} onEdit={setEditing} />
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
