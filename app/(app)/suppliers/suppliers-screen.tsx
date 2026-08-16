"use client";

import { useMemo, useState } from "react";
import { Plus, Truck } from "lucide-react";
import type { Expense, Supplier } from "@/lib/suppliers/types";
import { useSuppliers } from "@/lib/suppliers/use-suppliers";
import { useCatalog } from "@/lib/catalog/use-catalog";
import { useEvents } from "@/lib/events/use-events";
import { useHeaderSearch } from "@/components/header-search-context";
import { Button } from "@/components/button";
import { EmptyState, NoResults } from "@/components/empty-state";
import { SupplierCard } from "./supplier-card";
import { SupplierDrawer, blankSupplier } from "./supplier-drawer";
import { ExpensesTab } from "./expenses-tab";
import { ExpenseDrawer, blankExpense } from "./expense-drawer";
import { ProcurementTab } from "./procurement-tab";

type Tab = "suppliers" | "expenses" | "procurement";

const TABS: { id: Tab; label: string }[] = [
  { id: "suppliers", label: "ספקים" },
  { id: "expenses", label: "הוצאות" },
  { id: "procurement", label: "רכש" },
];

const isTab = (v: string | undefined): v is Tab => TABS.some((t) => t.id === v);

export function SuppliersScreen({
  initialTab,
  initialEventId = "",
}: {
  /** From `?tab=` — an unknown value falls back to the default rather than showing nothing. */
  initialTab?: string;
  /** From `?event=` — pre-filters the ledger when arriving from one event's margin card. */
  initialEventId?: string;
}) {
  const { suppliers, expenses, ready, error, saveSupplier, removeSupplier, saveExpense, removeExpense } =
    useSuppliers();
  // The catalog and the events are read-only here — the expense form needs their names, and the
  // ledger needs them to render what a row was for.
  const { products } = useCatalog();
  const { events } = useEvents();

  const [tab, setTab] = useState<Tab>(isTab(initialTab) ? initialTab : "suppliers");
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const { value: search, setValue: setSearch } = useHeaderSearch();

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (s.archived && !showArchived) return false;
      if (!q) return true;
      return `${s.name} ${s.supplies ?? ""} ${s.contactName ?? ""}`.toLowerCase().includes(q);
    });
  }, [suppliers, search, showArchived]);

  const live = suppliers.filter((s) => !s.archived);
  const archivedCount = suppliers.length - live.length;

  const deleteSupplier = async (id: string) => {
    const { archived } = await removeSupplier(id);
    setNotice(
      archived
        ? "לספק הזה יש הוצאות או מוצרים משויכים, ולכן הוא הועבר לארכיון — ההיסטוריה נשמרה."
        : null,
    );
  };

  // "No suppliers" and "not loaded yet" look identical in the data and mean opposite things.
  if (!ready) {
    return (
      <div className="px-8 pb-7 pt-3" aria-busy="true">
        <p className="py-20 text-center text-sm text-muted">טוען את הספקים…</p>
      </div>
    );
  }

  return (
    <div className="px-8 pb-7 pt-3">
      {error && (
        <p className="mb-4 rounded-md border border-alert bg-alert-tint px-4 py-2.5 text-sm text-ink" role="alert">
          {error}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex shrink-0 gap-1 rounded-pill bg-bg p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={
                "rounded-pill px-4 py-1.5 text-sm transition-colors " +
                (tab === t.id
                  ? "bg-surface font-bold text-accent shadow-floating"
                  : "font-semibold text-muted hover:text-accent-hover")
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "suppliers" && archivedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="text-sm font-medium text-accent transition-colors hover:text-accent-hover"
          >
            {showArchived ? "הסתר ארכיון" : `הצג ארכיון (${archivedCount})`}
          </button>
        )}

        {tab === "suppliers" && live.length > 0 && (
          <Button size="sm" className="ms-auto" onClick={() => setEditingSupplier(blankSupplier())}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            ספק חדש
          </Button>
        )}
      </div>

      {notice && (
        <p className="mb-4 rounded-md border border-border bg-surface px-4 py-2.5 text-sm text-ink-soft" role="status">
          {notice}
        </p>
      )}

      {tab === "suppliers" &&
        (live.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="עדיין אין ספקים"
            body="ספק הוא מי שאתה קונה או שוכר ממנו — פרחים, בדים, כיסאות. אחרי שתוסיף אותו תוכל לשייך אליו מוצרים בקטלוג, לרשום מה שילמת, ולראות במסך הרכש מה בדיוק צריך להזמין ממנו לשבועות הקרובים."
            action={
              <Button onClick={() => setEditingSupplier(blankSupplier())}>
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                הוסף ספק ראשון
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <NoResults
            title="לא נמצאו ספקים"
            body="נסה חיפוש אחר."
            onClear={search ? () => setSearch("") : undefined}
          />
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {visible.map((s) => (
              <SupplierCard key={s.id} supplier={s} onEdit={setEditingSupplier} />
            ))}
          </div>
        ))}

      {tab === "expenses" &&
        (suppliers.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="קודם ספק, אחר כך הוצאה"
            body="כל הוצאה נרשמת על שם ספק, כדי שיהיה אפשר לדעת מול מי אתה עומד. הוסף ספק אחד ואפשר להתחיל לרשום."
            action={
              <Button
                onClick={() => {
                  setTab("suppliers");
                  setEditingSupplier(blankSupplier());
                }}
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                הוסף ספק
              </Button>
            }
          />
        ) : (
          <ExpensesTab
            expenses={expenses}
            suppliers={suppliers}
            events={events}
            products={products}
            initialEventId={initialEventId}
            onAdd={() =>
              setEditingExpense({
                ...blankExpense(suppliers.find((s) => !s.archived)?.id ?? ""),
                // Arriving from an event's margin card, the expense being added is that event's.
                eventId: initialEventId || undefined,
              })
            }
            onEdit={setEditingExpense}
          />
        ))}

      {tab === "procurement" && <ProcurementTab />}

      <SupplierDrawer
        supplier={editingSupplier}
        onSave={(s) => void saveSupplier(s)}
        onDelete={deleteSupplier}
        onClose={() => setEditingSupplier(null)}
      />

      <ExpenseDrawer
        expense={editingExpense}
        suppliers={suppliers}
        events={events}
        products={products}
        onSave={(e) => void saveExpense(e)}
        onDelete={(id) => void removeExpense(id)}
        onClose={() => setEditingExpense(null)}
      />
    </div>
  );
}
