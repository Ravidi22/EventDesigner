"use client";

import { useEffect, useRef, useState } from "react";
import { fetchSettings, saveSettings } from "@/lib/settings/actions";
import { DEFAULT_SETTINGS, type BusinessSettings } from "@/lib/settings/types";
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
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let live = true;
    void fetchSettings().then((loaded) => {
      if (live) setS(loaded);
    });
    return () => {
      live = false;
    };
  }, []);

  // Typing stays instant and the write follows 600ms later. Every field here autosaves on change,
  // which against localStorage was free; against a database, "שם העסק" would be one request per
  // character. The pending write is cancelled and rescheduled on each keystroke, and the timer is
  // cleared on unmount so navigating away mid-word does not fire a stale save.
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const patch = (p: Partial<BusinessSettings>) => {
    const next = { ...s, ...p };
    setS(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveSettings(next);
    }, 600);
    setSaved(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSaved(false), 1600);
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
