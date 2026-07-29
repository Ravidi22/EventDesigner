"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type BusinessSettings } from "@/lib/settings/storage";
import { TextField } from "@/components/text-field";
import { NumberField } from "@/components/number-field";

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
        <TextField label="שם העסק" value={s.businessName} onChange={(v) => patch({ businessName: v })} />
        <TextField label="שם בעל/ת העסק" value={s.ownerName} onChange={(v) => patch({ ownerName: v })} />
        <div className="grid grid-cols-2 gap-4">
          <TextField label="טלפון" type="tel" dir="ltr" value={s.phone} onChange={(v) => patch({ phone: v })} className="text-end" />
          <TextField label="כתובת" value={s.address} onChange={(v) => patch({ address: v })} />
        </div>
        <TextField
          label="קישור ללוגו"
          dir="ltr"
          value={s.logoUrl ?? ""}
          onChange={(v) => patch({ logoUrl: v || undefined })}
          placeholder="https://…"
        />
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="שיעור מע״מ (%)"
            min={0}
            max={50}
            decimals={0}
            value={Math.round(s.vatRate * 100)}
            onChange={(v) => patch({ vatRate: v / 100 })}
          />
          <TextField label="מטבע" value={s.currency} onChange={() => {}} readOnly className="bg-bg text-muted" />
        </div>
      </div>
    </div>
  );
}
