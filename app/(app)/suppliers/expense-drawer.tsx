"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { Expense } from "@/lib/suppliers/types";
import type { SupplierSummary } from "@/lib/suppliers/types";
import type { Product } from "@/lib/catalog/types";
import type { EventSummary } from "@/lib/events/types";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { Select } from "@/components/select";
import { SwitchRow } from "@/components/toggle";
import { TextField } from "@/components/text-field";
import { NumberField } from "@/components/number-field";
import { DateField } from "@/components/date-field";
import { fieldLabelClassName } from "@/components/control";

/** Today as the SERVER's calendar day would write it. `toISOString().slice(0,10)` is the UTC day,
 *  which is yesterday for anyone working after 9pm in Israel — the same trap lib/venues/actions.ts
 *  names. An expense typed at 23:00 must not be filed to the previous day. */
export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function blankExpense(supplierId = ""): Expense {
  return { id: "", supplierId, description: "", amount: 0, spentAt: today(), paid: false };
}

export function ExpenseDrawer({
  expense,
  suppliers,
  events,
  products,
  onSave,
  onDelete,
  onClose,
}: {
  expense: Expense | null;
  suppliers: SupplierSummary[];
  events: EventSummary[];
  products: Product[];
  onSave: (e: Expense) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Expense>(blankExpense);
  const [submitted, setSubmitted] = useState(false);
  const [seeded, setSeeded] = useState<Expense | null>(null);

  // Seeded during render, not in an effect — see the note in supplier-drawer.tsx.
  if (expense !== seeded) {
    setSeeded(expense);
    if (expense) {
      setDraft(expense);
      setSubmitted(false);
    }
  }

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (expense && !d.open) d.showModal();
    if (!expense && d.open) d.close();
  }, [expense]);

  // Every variant AND every product id, because a placement — and therefore an expense against a
  // catalog line — references a variant, except when the product has no variants and its own id
  // stands in. Same resolution rule as everywhere else.
  const itemOptions = useMemo(
    () => [
      { value: "", label: "לא משויך למוצר" },
      ...products
        .filter((p) => !p.archived)
        .flatMap((p) =>
          p.variants.filter((v) => !v.archived).length === 0
            ? [{ value: p.id, label: p.name }]
            : p.variants
                .filter((v) => !v.archived)
                .map((v) => ({ value: v.id, label: `${p.name} · ${v.name}` })),
        ),
    ],
    [products],
  );

  const eventOptions = useMemo(
    () => [
      { value: "", label: "לא משויך לאירוע" },
      ...events
        .filter((e) => !e.archived)
        .map((e) => ({ value: e.id, label: e.date ? `${e.clientName} · ${e.date}` : e.clientName })),
    ],
    [events],
  );

  if (!expense) return null;

  const isEdit = draft.id !== "";
  const supplierError = submitted && draft.supplierId === "";
  const amountError = submitted && !(draft.amount > 0);
  const patch = (p: Partial<Expense>) => setDraft((d) => ({ ...d, ...p }));

  const save = () => {
    setSubmitted(true);
    if (draft.supplierId === "" || !(draft.amount > 0) || draft.spentAt === "") return;
    onSave({ ...draft, id: draft.id || crypto.randomUUID(), description: draft.description.trim() });
    onClose();
  };

  // Archived suppliers stay selectable while editing an expense that already names one — otherwise
  // opening an old row would silently blank its supplier and re-saving would move the money.
  const supplierOptions = [
    { value: "", label: "בחר ספק" },
    ...suppliers
      .filter((s) => !s.archived || s.id === draft.supplierId)
      .map((s) => ({ value: s.id, label: s.archived ? `${s.name} (בארכיון)` : s.name })),
  ];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="drawer fixed inset-y-0 inset-inline-end-0 m-0 h-dvh w-full max-w-md bg-bg text-ink shadow-[-24px_0_60px_-30px_rgba(70,40,130,0.4)]"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex h-full flex-col"
      >
        <header className="flex items-center justify-between border-b border-border bg-surface px-5 py-3.5">
          <h2 className="font-display text-base">{isEdit ? "עריכת הוצאה" : "הוצאה חדשה"}</h2>
          <IconButton label="סגור" onClick={onClose}>
            <X className="h-5 w-5" strokeWidth={2} />
          </IconButton>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <label htmlFor="e-supplier" className={fieldLabelClassName}>
              ספק <span className="text-alert">*</span>
            </label>
            <Select
              id="e-supplier"
              value={draft.supplierId}
              onChange={(v) => patch({ supplierId: v })}
              options={supplierOptions}
              className="w-full"
            />
            {supplierError && <p className="mt-1 text-xs text-alert">יש לבחור ספק.</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumberField
              id="e-amount"
              label="סכום (₪)"
              required
              hideZero
              min={0}
              value={draft.amount}
              onChange={(v) => patch({ amount: v })}
              error={amountError}
              errorMessage="יש להזין סכום."
            />
            <DateField
              id="e-date"
              label="תאריך ההוצאה"
              required
              value={draft.spentAt}
              onChange={(v) => patch({ spentAt: v })}
            />
          </div>

          <TextField
            id="e-desc"
            label="על מה"
            value={draft.description}
            onChange={(v) => patch({ description: v })}
            placeholder="לדוגמה: 300 גבעולי ורד לבן"
          />

          <div>
            <label htmlFor="e-event" className={fieldLabelClassName}>
              אירוע
            </label>
            <Select
              id="e-event"
              value={draft.eventId ?? ""}
              onChange={(v) => patch({ eventId: v || undefined })}
              options={eventOptions}
              className="w-full"
            />
            <p className="mt-1 text-xs text-muted">
              משייכים לאירוע כדי לראות כמה הוא באמת הכניס. קנייה כללית למחסן — משאירים ריק.
            </p>
          </div>

          <div>
            <label htmlFor="e-item" className={fieldLabelClassName}>
              מוצר בקטלוג
            </label>
            <Select
              id="e-item"
              value={draft.variantId ?? ""}
              onChange={(v) => patch({ variantId: v || undefined })}
              options={itemOptions}
              className="w-full"
            />
          </div>

          <SwitchRow
            checked={draft.paid}
            onChange={(on) => patch({ paid: on })}
            label="שולם"
            hint={draft.paid ? "הכסף יצא." : "עדיין פתוח — יופיע כחוב בכרטיס הספק."}
          />
        </div>

        <footer className="flex items-center gap-2 border-t border-border bg-surface px-5 py-3.5">
          <Button type="submit">שמירה</Button>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          {isEdit && (
            <Button
              variant="danger"
              className="ms-auto"
              onClick={() => {
                onDelete(draft.id);
                onClose();
              }}
            >
              <Trash2 className="h-4 w-4" strokeWidth={2} />
              מחיקה
            </Button>
          )}
        </footer>
      </form>
    </dialog>
  );
}
