"use client";

import { useEffect, useRef, useState } from "react";
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type BusinessSettings } from "@/lib/settings/storage";
import { TextField } from "@/components/text-field";
import { NumberField } from "@/components/number-field";
import { Panel, SavedFlag } from "./ui";

// F-8.1 business settings: logo + details (for the quote and outputs), VAT rate, currency (₪ in
// phase 1). Autosaves on change — no save button to forget.
//
// Studio-level, not venue-level: a designer working three properties still has one VAT rate and
// one letterhead. The things that vary per property live in the מתחמים ושיתוף section.
export function BusinessSection() {
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
    <Panel
      title="פרטי העסק"
      hint="הפרטים מופיעים בכותרת הצעת המחיר ובפלטים. הכול נשמר אוטומטית."
      action={<SavedFlag shown={saved} />}
    >
      {/* Two columns across the card rather than one narrow stack hugging its start edge — the
          panel is full width now. Capped so a phone number never gets a 700px-wide input. */}
      <div className="grid max-w-3xl grid-cols-2 gap-x-4 gap-y-5">
        <TextField label="שם העסק" value={s.businessName} onChange={(v) => patch({ businessName: v })} />
        <TextField label="שם בעל/ת העסק" value={s.ownerName} onChange={(v) => patch({ ownerName: v })} />
        <TextField label="טלפון" type="tel" dir="ltr" value={s.phone} onChange={(v) => patch({ phone: v })} className="text-end" />
        <TextField label="כתובת" value={s.address} onChange={(v) => patch({ address: v })} />
        <TextField
          label="קישור ללוגו"
          dir="ltr"
          value={s.logoUrl ?? ""}
          onChange={(v) => patch({ logoUrl: v || undefined })}
          placeholder="https://…"
          className="text-end"
          wrapperClassName="col-span-2"
        />
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
    </Panel>
  );
}
