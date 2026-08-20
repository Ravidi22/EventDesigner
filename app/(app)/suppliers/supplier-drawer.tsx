"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { Supplier } from "@/lib/suppliers/types";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { TextField } from "@/components/text-field";

export function blankSupplier(): Supplier {
  return { id: "", name: "" };
}

export function SupplierDrawer({
  supplier,
  onSave,
  onDelete,
  onClose,
}: {
  supplier: Supplier | null;
  onSave: (s: Supplier) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Supplier>(blankSupplier);
  const [submitted, setSubmitted] = useState(false);
  const [seeded, setSeeded] = useState<Supplier | null>(null);

  // Seeding the draft from the prop is React's "adjusting state when a prop changes" — done during
  // render rather than in an effect, which is both what the docs prescribe and what keeps this off
  // the set-state-in-effect list. An effect would render the drawer once with the PREVIOUS
  // supplier's values before correcting itself, which on a drawer that slides in is visible.
  if (supplier !== seeded) {
    setSeeded(supplier);
    if (supplier) {
      setDraft(supplier);
      setSubmitted(false);
    }
  }

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (supplier && !d.open) d.showModal();
    if (!supplier && d.open) d.close();
  }, [supplier]);

  if (!supplier) return null;

  const isEdit = draft.id !== "";
  const nameError = submitted && draft.name.trim() === "";
  const patch = (p: Partial<Supplier>) => setDraft((d) => ({ ...d, ...p }));

  const save = () => {
    setSubmitted(true);
    if (draft.name.trim() === "") return;
    onSave({ ...draft, id: draft.id || crypto.randomUUID(), name: draft.name.trim() });
    onClose();
  };

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
          <h2 className="font-display text-base">{isEdit ? "עריכת ספק" : "ספק חדש"}</h2>
          <IconButton label="סגור" onClick={onClose}>
            <X className="h-5 w-5" strokeWidth={2} />
          </IconButton>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <TextField
            id="s-name"
            label="שם הספק"
            value={draft.name}
            onChange={(v) => patch({ name: v })}
            placeholder="לדוגמה: פרחי השרון"
            error={nameError}
            errorMessage="יש להזין שם ספק."
            autoFocus
          />

          <div className="grid grid-cols-2 gap-3">
            <TextField
              id="s-contact"
              label="איש קשר"
              value={draft.contactName ?? ""}
              onChange={(v) => patch({ contactName: v || undefined })}
              placeholder="השם שמדברים איתו"
            />
            <TextField
              id="s-phone"
              label="טלפון"
              type="tel"
              dir="ltr"
              value={draft.phone ?? ""}
              onChange={(v) => patch({ phone: v || undefined })}
              placeholder="050-0000000"
            />
          </div>

          <TextField
            id="s-supplies"
            label="מה הוא מספק"
            multiline
            rows={2}
            value={draft.supplies ?? ""}
            onChange={(v) => patch({ supplies: v || undefined })}
            placeholder="פרחים, ירק, אגרטלים…"
          />

          <TextField
            id="s-note"
            label="הערה"
            multiline
            rows={2}
            value={draft.note ?? ""}
            onChange={(v) => patch({ note: v || undefined })}
            placeholder="תנאי תשלום, זמן אספקה, כל דבר שכדאי לזכור לפני שמתקשרים"
          />

          <p className="rounded-md border border-inset-border bg-inset px-3 py-2 text-xs leading-relaxed text-ink-soft">
            הקישור בין ספק למוצר נעשה בכרטיס המוצר בקטלוג — שם גם נרשמת העלות שלך. כאן נשמר רק מי
            הספק ומה קונים ממנו.
          </p>
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
