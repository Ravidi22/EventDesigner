"use client";

import { useMemo, useState } from "react";
import { Store } from "lucide-react";
import type { MarketShop } from "@/lib/marketplace/types";
import { CATEGORIES, CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { useHeaderSearch } from "@/components/header-search-context";
import { EmptyState, NoResults } from "@/components/empty-state";
import { PAGE_GUTTER } from "@/components/page-gutter";
import { TagToggle } from "@/components/tag-toggle";
import { ShopCard } from "./shop-card";

// The marketplace's first page is the SUPPLIERS, not a wall of every row they publish: a designer
// buys from a supplier, so the supplier is what they choose first, then what that supplier has
// (./[supplierId]). The search and the category chip still look inside the shops — typing "ורד"
// keeps the suppliers who sell roses and says how many — and both are carried into the shop opened.
export function MarketplaceScreen({ shops }: { shops: MarketShop[] }) {
  const { value: search, setValue: setSearch } = useHeaderSearch();
  const [category, setCategory] = useState("");

  // Only what is actually on offer, the most widely supplied first.
  const categories = useMemo(() => {
    const suppliers = new Map<string, number>();
    for (const s of shops) for (const c of s.categories) suppliers.set(c.id, (suppliers.get(c.id) ?? 0) + 1);
    return CATEGORIES.filter((c) => suppliers.has(c.id)).sort((a, b) => suppliers.get(b.id)! - suppliers.get(a.id)!);
  }, [shops]);

  const q = search.trim().toLowerCase();
  const visible = shops
    .filter((s) => !category || s.categories.some((c) => c.id === category))
    .map((shop) => {
      if (!q) return { shop };
      const own = `${shop.supplier.name} ${shop.supplier.address ?? ""} ${shop.categories.map((c) => CATEGORY_BY_ID[c.id]?.label ?? "").join(" ")}`;
      if (own.toLowerCase().includes(q)) return { shop };
      const matches = shop.names.filter((n) => n.toLowerCase().includes(q)).length;
      return matches > 0 ? { shop, matches } : null;
    })
    .filter((x): x is { shop: MarketShop; matches?: number } => x !== null);

  const hrefOf = (shop: MarketShop, matched: boolean) => {
    const params = new URLSearchParams();
    if (matched) params.set("q", search.trim());
    if (category) params.set("category", category);
    const query = params.toString();
    return `/marketplace/${shop.supplier.orgId}${query ? `?${query}` : ""}`;
  };

  if (shops.length === 0) {
    return (
      <div className={PAGE_GUTTER}>
        <EmptyState
          icon={Store}
          title="עדיין אין ספקים בשוק"
          body="ספקים שנרשמים ל-Eve מפרסמים כאן את הקטלוג שלהם. פריט שתוסיפו הופך לשורה בקטלוג שלכם — עם המחיר שלהם כעלות, והמחיר ללקוח שלכם."
        />
      </div>
    );
  }

  return (
    <div className={PAGE_GUTTER}>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <TagToggle active={!category} onClick={() => setCategory("")}>
          כל הספקים
        </TagToggle>
        {categories.map((c) => (
          <TagToggle key={c.id} active={category === c.id} onClick={() => setCategory(category === c.id ? "" : c.id)}>
            {c.label}
          </TagToggle>
        ))}
        <span className="nums ms-auto text-sm text-muted">{visible.length} ספקים</span>
      </div>

      {visible.length === 0 ? (
        <NoResults
          title="לא נמצאו ספקים"
          body="נסו חיפוש אחר או הסירו סינון."
          onClear={() => {
            setSearch("");
            setCategory("");
          }}
        />
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {visible.map(({ shop, matches }) => (
            <ShopCard key={shop.supplier.orgId} shop={shop} matches={matches} href={hrefOf(shop, matches !== undefined)} />
          ))}
        </div>
      )}
    </div>
  );
}
