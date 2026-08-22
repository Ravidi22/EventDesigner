"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, ReceiptText } from "lucide-react";
import type { Expense, SupplierSummary } from "@/lib/suppliers/types";
import type { EventSummary } from "@/lib/events/types";
import type { Product } from "@/lib/catalog/types";
import { formatPrice } from "@/lib/catalog/format";
import { Button } from "@/components/button";
import { Select } from "@/components/select";
import { EmptyState, NoResults } from "@/components/empty-state";

type PaidFilter = "" | "paid" | "open";

export function ExpensesTab({
  expenses,
  suppliers,
  events,
  products,
  initialEventId = "",
  onAdd,
  onEdit,
}: {
  expenses: Expense[];
  suppliers: SupplierSummary[];
  events: EventSummary[];
  products: Product[];
  /** Pre-filter, for the "רישום הוצאה" link on an event — arriving from one event and being shown
   *  every studio expense would be the wrong answer to the question that was asked. */
  initialEventId?: string;
  onAdd: () => void;
  onEdit: (e: Expense) => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [eventId, setEventId] = useState(initialEventId);
  const [paid, setPaid] = useState<PaidFilter>("");

  const supplierName = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const eventName = useMemo(() => new Map(events.map((e) => [e.id, e.clientName])), [events]);
  // A product with no variants places (and is billed) under its own id — both keys resolve.
  const itemName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) {
      m.set(p.id, p.name);
      for (const v of p.variants) m.set(v.id, `${p.name} · ${v.name}`);
    }
    return m;
  }, [products]);

  const filtered = useMemo(
    () =>
      expenses.filter(
        (e) =>
          (!supplierId || e.supplierId === supplierId) &&
          (!eventId || e.eventId === eventId) &&
          (!paid || (paid === "paid" ? e.paid : !e.paid)),
      ),
    [expenses, supplierId, eventId, paid],
  );

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const outstanding = filtered.filter((e) => !e.paid).reduce((s, e) => s + e.amount, 0);

  if (expenses.length === 0) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="עדיין לא נרשמו הוצאות"
        body="כאן נרשם מה שילמת ולמי. הוצאה שמשויכת לאירוע מצטרפת לחישוב הרווח שלו, והוצאה שלא — נשארת בסיכום הכללי של הספק. זו לא הנהלת חשבונות: רק מה שצריך כדי לדעת כמה אירוע באמת הכניס ומה עוד פתוח מול ספק."
        action={
          <Button onClick={onAdd}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            רישום הוצאה ראשונה
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5">
        <span className="nums shrink-0 text-sm text-muted">{filtered.length} הוצאות</span>

        <Select
          value={supplierId}
          onChange={setSupplierId}
          aria-label="ספק"
          options={[{ value: "", label: "כל הספקים" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
          className="w-44 shrink-0"
        />
        <Select
          value={eventId}
          onChange={setEventId}
          aria-label="אירוע"
          options={[
            { value: "", label: "כל האירועים" },
            ...events.filter((e) => !e.archived).map((e) => ({ value: e.id, label: e.clientName })),
          ]}
          className="w-44 shrink-0"
        />
        <Select
          value={paid}
          onChange={(v) => setPaid(v as PaidFilter)}
          aria-label="מצב תשלום"
          options={[
            { value: "", label: "שולם ולא שולם" },
            { value: "open", label: "לא שולם" },
            { value: "paid", label: "שולם" },
          ]}
          className="w-36 shrink-0"
        />

        <div className="ms-auto flex shrink-0 items-center gap-3">
          {outstanding > 0 && (
            <span className="text-sm text-muted">
              פתוח: <span className="nums font-semibold text-alert">{formatPrice(outstanding)}</span>
            </span>
          )}
          <span className="text-sm text-muted">
            סה״כ: <span className="nums font-bold text-ink">{formatPrice(total)}</span>
          </span>
          <Button size="sm" onClick={onAdd}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            הוצאה
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <NoResults
          title="אין הוצאות בסינון הזה"
          body="נסה לשנות את הספק, האירוע או מצב התשלום."
          onClear={() => {
            setSupplierId("");
            setEventId("");
            setPaid("");
          }}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-4 py-2.5 text-start font-medium">תאריך</th>
                <th className="px-4 py-2.5 text-start font-medium">ספק</th>
                <th className="px-4 py-2.5 text-start font-medium">על מה</th>
                <th className="px-4 py-2.5 text-start font-medium">אירוע</th>
                <th className="px-4 py-2.5 text-start font-medium">סכום</th>
                <th className="px-4 py-2.5 text-start font-medium">מצב</th>
                <th className="w-10 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="group border-b border-border-soft last:border-0 hover:bg-bg">
                  <td className="nums px-4 py-2.5 text-ink-soft" dir="ltr">
                    {e.spentAt}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-ink">{supplierName.get(e.supplierId) ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-soft">
                    {e.description || (e.variantId && itemName.get(e.variantId)) || "—"}
                    {e.description && e.variantId && itemName.get(e.variantId) && (
                      <span className="text-muted"> · {itemName.get(e.variantId)}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">
                    {e.eventId ? (eventName.get(e.eventId) ?? "—") : <span className="text-muted">כללי</span>}
                  </td>
                  <td className="nums px-4 py-2.5 font-semibold text-ink">{formatPrice(e.amount)}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        "inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-medium " +
                        (e.paid ? "bg-inset text-ink-soft" : "bg-alert-tint text-alert")
                      }
                    >
                      {e.paid ? "שולם" : "פתוח"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => onEdit(e)}
                      aria-label={`עריכת הוצאה מ־${e.spentAt}`}
                      className="rounded-md p-1.5 text-muted opacity-0 transition-opacity hover:bg-accent-tint hover:text-accent group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
