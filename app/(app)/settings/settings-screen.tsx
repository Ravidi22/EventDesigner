"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type BusinessSettings } from "@/lib/settings/storage";
import { controlClassName } from "@/components/control";

// F-8.1 minimal business settings: logo + details (for the quote and outputs), VAT rate,
// currency (₪ in phase 1). Autosaves on change — no save button to forget.
export function SettingsScreen() {
  const [s, setS] = useState<BusinessSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => setS(loadSettings()), []);

  const patch = (p: Partial<BusinessSettings>) => {
    const next = { ...s, ...p };
    setS(next);
    saveSettings(next);
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div className="mx-auto max-w-lg px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <p className="max-w-sm text-sm leading-relaxed text-ink-soft">
          הפרטים מופיעים בכותרת הצעת המחיר ובפלטים. הכול נשמר אוטומטית.
        </p>
        <span aria-live="polite" className={"inline-flex items-center gap-1.5 text-xs text-muted transition-opacity " + (saved ? "opacity-100" : "opacity-0")}>
          <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
          נשמר
        </span>
      </div>

      <div className="flex flex-col gap-5">
        <Field label="שם העסק">
          <input value={s.businessName} onChange={(e) => patch({ businessName: e.target.value })} className={`${controlClassName} px-3`} />
        </Field>
        <Field label="שם בעל/ת העסק">
          <input value={s.ownerName} onChange={(e) => patch({ ownerName: e.target.value })} className={`${controlClassName} px-3`} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="טלפון">
            <input type="tel" dir="ltr" value={s.phone} onChange={(e) => patch({ phone: e.target.value })} className={`${controlClassName} px-3 text-end`} />
          </Field>
          <Field label="כתובת">
            <input value={s.address} onChange={(e) => patch({ address: e.target.value })} className={`${controlClassName} px-3`} />
          </Field>
        </div>
        <Field label="קישור ללוגו">
          <input dir="ltr" value={s.logoUrl ?? ""} onChange={(e) => patch({ logoUrl: e.target.value || undefined })} placeholder="https://…" className={`${controlClassName} px-3 text-start`} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="שיעור מע״מ (%)">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={50}
              value={Math.round(s.vatRate * 100)}
              onChange={(e) => patch({ vatRate: (Number(e.target.value) || 0) / 100 })}
              className={`${controlClassName} nums px-3`}
            />
          </Field>
          <Field label="מטבע">
            <input value={s.currency} readOnly aria-readonly className={`${controlClassName} bg-bg px-3 text-muted`} />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}
