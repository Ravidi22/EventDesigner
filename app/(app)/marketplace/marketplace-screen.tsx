"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import type { MarketItem } from "@/lib/marketplace/types";
import { addToCatalog } from "@/lib/marketplace/actions";
import { CATEGORIES, CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { useHeaderSearch } from "@/components/header-search-context";
import { EmptyState, NoResults } from "@/components/empty-state";
import { PAGE_GUTTER } from "@/components/page-gutter";
import { Select } from "@/components/select";
import { MarketCard } from "./market-card";

export function MarketplaceScreen({ items }: { items: MarketItem[] }) {
  const router = useRouter();
  const { value: search, setValue: setSearch } = useHeaderSearch();
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Only what is actually on offer: a category nobody publishes in is not a filter option.
  const categories = useMemo(() => {
    const present = new Set(items.map((i) => i.product.category));
    return CATEGORIES.filter((c) => present.has(c.id));
  }, [items]);
  const suppliers = useMemo(() => {
    const byId = new Map(items.map((i) => [i.supplier.orgId, i.supplier.name]));
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1], "he"));
  }, [items]);

  const q = search.trim().toLowerCase();
  const visible = items.filter(
    (i) =>
      (!category || i.product.category === category) &&
      (!supplier || i.supplier.orgId === supplier) &&
      (!q || `${i.product.name} ${i.supplier.name} ${CATEGORY_BY_ID[i.product.category]?.label ?? ""}`.toLowerCase().includes(q)),
  );

  const add = async (item: MarketItem) => {
    setBusy(item.product.id);
    setNotice(null);
    try {
      const result = await addToCatalog(item.product.id);
      if ("error" in result) setNotice(result.error);
      else {
        setNotice(`״${item.product.name}״ נוסף לקטלוג שלכם. המחיר ללקוח עדיין ריק — קבעו אותו במגירת המוצר.`);
        router.refresh();
      }
    } catch {
      setNotice("לא ניתן להוסיף את הפריט כרגע");
    } finally {
      setBusy(null);
    }
  };

  if (items.length === 0) {
    return (
      <div className={PAGE_GUTTER}>
        <EmptyState
          icon={Store}
          title="עדיין אין פריטים בשוק"
          body="ספקים שנרשמים ל-Eve מפרסמים כאן את הקטלוג שלהם. פריט שתוסיפו הופך לשורה בקטלוג שלכם — עם המחיר שלהם כעלות, והמחיר ללקוח שלכם."
        />
      </div>
    );
  }

  return (
    <div className={PAGE_GUTTER}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          aria-label="קטגוריה"
          value={category}
          onChange={setCategory}
          options={[{ value: "", label: "כל הקטגוריות" }, ...categories.map((c) => ({ value: c.id, label: c.label }))]}
          className="w-48"
        />
        <Select
          aria-label="ספק"
          value={supplier}
          onChange={setSupplier}
          options={[{ value: "", label: "כל הספקים" }, ...suppliers.map(([id, name]) => ({ value: id, label: name }))]}
          className="w-48"
        />
        <span className="nums ms-auto text-sm text-muted">{visible.length} פריטים</span>
      </div>

      {notice && (
        <p className="mb-4 rounded-md border border-border bg-surface px-4 py-2.5 text-sm text-ink-soft" role="status">
          {notice}
        </p>
      )}

      {visible.length === 0 ? (
        <NoResults
          title="לא נמצאו פריטים"
          body="נסו חיפוש אחר או הסירו סינון."
          onClear={() => {
            setSearch("");
            setCategory("");
            setSupplier("");
          }}
          clearLabel="נקה סינון"
        />
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {visible.map((item) => (
            <MarketCard key={item.product.id} item={item} busy={busy === item.product.id} onAdd={() => void add(item)} />
          ))}
        </div>
      )}
    </div>
  );
}
