"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, AtSign, MapPin, MessageCircle, Phone } from "lucide-react";
import type { MarketItem, MarketSupplier } from "@/lib/marketplace/types";
import { addToCatalog } from "@/lib/marketplace/actions";
import { CATEGORY_BY_ID } from "@/lib/catalog/categories";
import { useHeaderSearch } from "@/components/header-search-context";
import { NoResults } from "@/components/empty-state";
import { PAGE_GUTTER } from "@/components/page-gutter";
import { Select } from "@/components/select";
import { TagToggle } from "@/components/tag-toggle";
import { MarketCard } from "../market-card";
import { ShopAvatar, ShopCover } from "../shop-face";

type Sort = "name" | "price-asc" | "price-desc";

/** wa.me wants the number in international form, digits only: 050-1234567 → 972501234567. */
function waNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

const contactClass =
  "inline-flex h-9 items-center gap-2 rounded-pill border-[1.5px] border-accent-line px-4 text-[13px] font-bold text-accent transition-colors hover:bg-accent-tint";

// A supplier's shop, the way a business page is: a cover of what they sell, their logo and how to
// reach them, then their rows in sections by category. The search and category the designer came
// in with (from the first page) are where it opens.
export function SupplierShop({
  supplier,
  items,
  initialQuery,
  initialCategory,
}: {
  supplier: MarketSupplier;
  items: MarketItem[];
  initialQuery: string;
  initialCategory: string;
}) {
  const router = useRouter();
  const { value: search, setValue: setSearch } = useHeaderSearch();
  const [category, setCategory] = useState(initialCategory);
  const [sort, setSort] = useState<Sort>("name");
  const [notMine, setNotMine] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The header's search is per page (AppShell keys it by pathname), so what was typed on the first
  // page is handed over in the URL and put back once.
  useEffect(() => {
    if (initialQuery) setSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) counts.set(i.product.category, (counts.get(i.product.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);
  const cover = useMemo(
    () => [...items.filter((i) => i.product.imageUrl), ...items.filter((i) => !i.product.imageUrl)].slice(0, 3).map((i) => i.product),
    [items],
  );
  const inCatalog = items.filter((i) => i.inCatalog).length;

  const q = search.trim().toLowerCase();
  const visible = items
    .filter(
      (i) =>
        (!category || i.product.category === category) &&
        (!notMine || !i.inCatalog) &&
        (!q || `${i.product.name} ${CATEGORY_BY_ID[i.product.category]?.label ?? ""}`.toLowerCase().includes(q)),
    )
    .sort((a, b) => {
      if (sort === "name") return 0; // the server's order is by name
      // A row with no price goes last either way — it is not the cheapest.
      const pa = a.wholesalePrice ?? Infinity;
      const pb = b.wholesalePrice ?? Infinity;
      if (pa === pb) return 0;
      if (pa === Infinity) return 1;
      if (pb === Infinity) return -1;
      return sort === "price-asc" ? pa - pb : pb - pa;
    });

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

  const wa = supplier.phone ? waNumber(supplier.phone) : null;

  return (
    <div className={PAGE_GUTTER}>
      <Link href="/marketplace" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-accent">
        <ArrowRight className="h-4 w-4" strokeWidth={2} />
        כל הספקים
      </Link>

      <header className="mb-6 overflow-hidden rounded-lg border border-border bg-surface">
        <ShopCover products={cover} className="h-36" />
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 px-5 pb-5">
          <ShopAvatar supplier={supplier} className="-mt-10 h-24 w-24" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl leading-tight text-ink">{supplier.name}</h2>
            <p className="nums mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {supplier.address && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" strokeWidth={2} />
                  {supplier.address}
                </span>
              )}
              <span>{items.length} פריטים</span>
              <span>{categories.length} קטגוריות</span>
              {inCatalog > 0 && <span>{inCatalog} כבר בקטלוג שלי</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {supplier.phone && (
              <a href={`tel:${supplier.phone}`} className={contactClass}>
                <Phone className="h-4 w-4" strokeWidth={2} />
                <span className="nums" dir="ltr">
                  {supplier.phone}
                </span>
              </a>
            )}
            {wa && (
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className={contactClass}>
                <MessageCircle className="h-4 w-4" strokeWidth={2} />
                וואטסאפ
              </a>
            )}
            {supplier.instagram && (
              <a
                href={`https://instagram.com/${encodeURIComponent(supplier.instagram)}`}
                target="_blank"
                rel="noreferrer"
                className={contactClass}
              >
                <AtSign className="h-4 w-4" strokeWidth={2} />
                <span dir="ltr">{supplier.instagram}</span>
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TagToggle active={!category} onClick={() => setCategory("")}>
          הכל <span className="nums opacity-70">{items.length}</span>
        </TagToggle>
        {categories.map(([id, count]) => (
          <TagToggle key={id} active={category === id} onClick={() => setCategory(category === id ? "" : id)}>
            {CATEGORY_BY_ID[id]?.label ?? id} <span className="nums opacity-70">{count}</span>
          </TagToggle>
        ))}
        <div className="ms-auto flex items-center gap-2">
          {inCatalog > 0 && (
            <TagToggle active={notMine} onClick={() => setNotMine(!notMine)}>
              רק מה שאין לי
            </TagToggle>
          )}
          <Select
            aria-label="מיון"
            value={sort}
            onChange={(v) => setSort(v as Sort)}
            options={[
              { value: "name", label: "לפי שם" },
              { value: "price-asc", label: "מחיר: מהנמוך" },
              { value: "price-desc", label: "מחיר: מהגבוה" },
            ]}
            className="w-40"
          />
        </div>
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
            setNotMine(false);
          }}
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
