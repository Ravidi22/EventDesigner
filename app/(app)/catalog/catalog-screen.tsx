"use client";

import { useMemo, useRef, useState } from "react";
import { PackagePlus, Plus } from "lucide-react";
import type { Product } from "@/lib/catalog/types";
import { CATEGORIES } from "@/lib/catalog/categories";
import { useCatalog } from "@/lib/catalog/use-catalog";
import {
  CSV_BOM,
  inventoryFileName,
  parseCsvProducts,
  productsToCsv,
  type CsvSupplier,
} from "@/lib/catalog/csv";
import { fetchSuppliers } from "@/lib/suppliers/actions";
import { useHeaderSearch } from "@/components/header-search-context";
import { Button } from "@/components/button";
import { EmptyState, NoResults } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PAGE_GUTTER } from "@/components/page-gutter";
import { ProductCard } from "./product-card";
import { Filters, EMPTY_FILTERS, hasActiveFilters, matchesFilters, type FilterState } from "./filters";
import { ProductDrawer, blankProduct } from "./product-drawer";

export function CatalogScreen({ initialProducts }: { initialProducts: Product[] }) {
  // The catalog comes from page.tsx's server-side read; the hook primes the studio's synchronous
  // cache with it and hands back the list plus the three write paths.
  const { products, ready, error, save, remove, importMany } = useCatalog(initialProducts);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [editing, setEditing] = useState<Product | null>(null);
  // The product the "…" menu has asked to delete. ONE dialog for the whole screen rather than one
  // per card, and it is here because this is where the delete itself already lives.
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The visible search box lives in the top header now (AppShell) — its value flows down
  // through context rather than a second, redundant input inside this page.
  const { value: search, setValue: setSearch } = useHeaderSearch();

  // F-4.5: archived products are hidden from the catalog (placements still resolve them).
  const visible = useMemo(() => products.filter((p) => !p.archived), [products]);
  // `search` is held in the header-search context rather than in `filters`, so it's spliced in
  // here — the predicate itself is the same one the studio's catalog rail runs.
  const filtered = useMemo(
    () => visible.filter((p) => matchesFilters(p, { ...filters, search })),
    [visible, filters, search],
  );

  const saveProduct = (p: Product) => void save(p);
  const deleteProduct = async (id: string) => {
    const { archived } = await remove(id);
    setNotice(archived ? "המוצר משובץ באירועים ולכן הועבר לארכיון — ההצבות נשמרו." : null);
  };
  const confirmDelete = () => {
    // Closed first, and the delete is not awaited: the row is gone from the list the moment the
    // hook's optimistic state updates, and a dialog still sitting over it while that happens reads
    // as a question that was not answered.
    const target = deleting;
    setDeleting(null);
    if (target) void deleteProduct(target.id);
  };
  // Fresh id for the product AND every variant — a duplicate must never alias the original's
  // variant ids, or isPlacedAnywhere (lib/catalog/actions.ts) would treat it as already placed
  // just because the original happens to be.
  const duplicateProduct = (p: Product) => {
    const copy: Product = {
      ...p,
      id: crypto.randomUUID(),
      name: `${p.name} (עותק)`,
      variants: p.variants.map((v) => ({ ...v, id: crypto.randomUUID() })),
    };
    void save(copy);
  };

  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    const added = parseCsvProducts(await file.text(), CATEGORIES, () => crypto.randomUUID());
    if (added.length === 0) {
      setNotice("לא נמצאו שורות תקינות בקובץ. עמודות: שם, קטגוריה, קוטר/רוחב/עומק/גובה (ס״מ), מחיר.");
      return;
    }
    await importMany(added);
    setNotice(`נוספו ${added.length} מוצרים מהקובץ. וריאנטים ושדות מיוחדים מוזנים ידנית.`);
  };

  // The stock sheet: what the studio owns, how much of it, what it costs and who it comes from.
  //
  // It exports `filtered` — the rows on screen, in screen order — because the button sits in the
  // same bar as the "N מוצרים" count, and a file that quietly held 300 rows next to a count saying
  // 12 would make the count the lie. The notice says so when a filter was in fact narrowing it.
  const exportInventory = async () => {
    // A named supplier is a nicety on this sheet, not the point of it, so a supplier list that
    // will not load leaves that one column empty instead of failing the whole export.
    let suppliers: CsvSupplier[] = [];
    try {
      suppliers = await fetchSuppliers();
    } catch {
      // Empty ספק column; the stock counts are what the designer came for.
    }
    const url = URL.createObjectURL(
      new Blob([CSV_BOM + productsToCsv(filtered, CATEGORIES, suppliers)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = inventoryFileName();
    a.click();
    URL.revokeObjectURL(url);
    const scope = hasActiveFilters({ ...filters, search }) ? " (לפי הסינון הפעיל)" : "";
    setNotice(`יוצאו ${filtered.length} מוצרים לקובץ${scope}. הקובץ כולל עלויות — פנימי בלבד.`);
  };

  // "No products yet" and "not loaded yet" look identical in the data and mean opposite things —
  // showing the first-run screen to a designer with 300 products, for the length of one fetch, is
  // the kind of flicker that reads as data loss. `ready` is what separates them.
  if (!ready) {
    return (
      <div className={PAGE_GUTTER} aria-busy="true">
        <p className="py-20 text-center text-sm text-muted">טוען את הקטלוג…</p>
      </div>
    );
  }

  return (
    <div className={PAGE_GUTTER}>
      {error && (
        <p className="mb-4 rounded-md border border-alert bg-alert-tint px-4 py-2.5 text-sm text-ink" role="alert">
          {error}
        </p>
      )}
      {visible.length === 0 ? (
        // First run (F-2.3): an empty catalog is the adoption blocker, so this teaches what the
        // catalog is for and makes adding the first product the obvious next move.
        <EmptyState
          icon={PackagePlus}
          title="הקטלוג עדיין ריק"
          body="הקטלוג הוא מאגר הפריטים שאיתו תלביש כל אירוע — מפות, כיסאות, שנדליירים ועוד. כל פריט שתוסיף כאן יהיה זמין לגרירה על מפת האולם, ויזין אוטומטית את רשימת הציוד ואת הצעת המחיר."
          action={
            <Button onClick={() => setEditing(blankProduct())}>
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              הוסף מוצר ראשון
            </Button>
          }
        />
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
            onExportCsv={() => void exportInventory()}
            searchValue={search}
            onSearchChange={setSearch}
          />

          {filtered.length === 0 ? (
            <NoResults
              title="לא נמצאו מוצרים"
              body="נסה לשנות את החיפוש או להסיר חלק מהסינון."
              onClear={() => {
                setFilters(EMPTY_FILTERS);
                setSearch("");
              }}
            />
          ) : viewMode === "list" ? (
            <div className="mt-6 flex flex-col gap-2">
              {filtered.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  layout="list"
                  onEdit={setEditing}
                  onDuplicate={duplicateProduct}
                  onDelete={setDeleting}
                />
              ))}
            </div>
          ) : (
            <div
              className="mt-6 grid gap-4"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}
            >
              {filtered.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onEdit={setEditing}
                  onDuplicate={duplicateProduct}
                  onDelete={setDeleting}
                />
              ))}
            </div>
          )}
        </>
      )}

      <ProductDrawer
        product={editing}
        onSave={saveProduct}
        // The drawer's מחיקה asks the same question the menu's does — it is the same destructive
        // act, and it was the one path that used to delete with no question at all. The drawer
        // closes itself on the way out, so the two dialogs are never open at once.
        onDelete={(id) => setDeleting(products.find((p) => p.id === id) ?? null)}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={!!deleting}
        title={`למחוק את ${deleting?.name ?? ""}?`}
        body="הפריט יוסר מהקטלוג. אם הוא כבר משובץ באירועים הוא יועבר לארכיון במקום להימחק, וההצבות יישמרו."
        confirmLabel="מחיקה"
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
