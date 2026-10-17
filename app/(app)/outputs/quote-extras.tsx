"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { MAX_EXTRAS, type QuoteExtra } from "@/lib/quotes/layout";
import { TextField } from "@/components/text-field";
import { NumberField } from "@/components/number-field";
import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { fieldLabelClassName } from "@/components/control";

// "תוספות" — the lines the drawing cannot know about: transport, set-up and strike, a lighting
// rental. Both studios' own quotes carry them (הובלה 4,800 · פיזור ואיסוף 3,800), and a quote that
// cannot is a quote the designer finishes in Word. Each is a label and a price; the quote lists them
// as a section of their own and adds them to the sum (lib/quotes/layout.ts, extrasSection).

const SUGGESTIONS = ["הובלה", "פיזור ואיסוף ציוד", "הקמה ופירוק", "השכרת תאורה"];

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : String(Date.now()));

export function QuoteExtras({ extras, onChange }: { extras: QuoteExtra[]; onChange: (extras: QuoteExtra[]) => void }) {
  const [removing, setRemoving] = useState<QuoteExtra | null>(null);
  const set = (id: string, patch: Partial<QuoteExtra>) => onChange(extras.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const add = (label = "") => extras.length < MAX_EXTRAS && onChange([...extras, { id: newId(), label, price: 0 }]);
  const remove = (e: QuoteExtra) => (e.label.trim() || e.price ? setRemoving(e) : onChange(extras.filter((x) => x.id !== e.id)));
  const unused = SUGGESTIONS.filter((s) => !extras.some((e) => e.label.trim() === s));

  return (
    <div>
      <span className={fieldLabelClassName}>תוספות (שאינן בשרטוט)</span>
      <div className="space-y-2">
        {extras.map((e) => (
          <div key={e.id} className="flex items-center gap-2">
            <TextField value={e.label} onChange={(label) => set(e.id, { label })} placeholder="למשל: הובלה" aria-label="תיאור התוספת" wrapperClassName="min-w-0 flex-1" />
            <NumberField value={e.price} onChange={(price) => set(e.id, { price })} min={0} decimals={0} hideZero placeholder="מחיר" aria-label="מחיר התוספת" className="w-28" />
            <IconButton label={`הסרת "${e.label || "שורה"}"`} onClick={() => remove(e)}>
              <Trash2 className="h-4 w-4" strokeWidth={1.8} />
            </IconButton>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => add()} disabled={extras.length >= MAX_EXTRAS}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          שורה
        </Button>
        {unused.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => add(s)}
            className="rounded-pill border border-border px-3 py-1 text-caption text-ink-soft transition-colors hover:border-accent-line hover:text-accent"
          >
            + {s}
          </button>
        ))}
      </div>
      <ConfirmDialog
        open={!!removing}
        title={`להסיר את "${removing?.label || "השורה"}" מההצעה?`}
        confirmLabel="הסרה"
        onConfirm={() => {
          if (removing) onChange(extras.filter((x) => x.id !== removing.id));
          setRemoving(null);
        }}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
