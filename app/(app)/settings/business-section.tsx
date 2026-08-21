"use client";

import { useEffect, useRef, useState } from "react";
import { fetchSettings, saveSettings } from "@/lib/settings/actions";
import { DEFAULT_SETTINGS, SUGGESTED_QUOTE_TERMS, type BusinessSettings } from "@/lib/settings/types";
import { TextField } from "@/components/text-field";
import { NumberField } from "@/components/number-field";
import { ImageField } from "@/components/image-field";
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
        <TextField label="דוא״ל" type="email" dir="ltr" value={s.email} onChange={(v) => patch({ email: v })} className="text-end" />
        <TextField label="כתובת" value={s.address} onChange={(v) => patch({ address: v })} />
        {/* The field a client's accountant looks for first, and the one an Instagram-era quote
            almost always leaves off. */}
        <TextField
          label="ע.מ / ח.פ"
          dir="ltr"
          value={s.businessNumber}
          onChange={(v) => patch({ businessNumber: v })}
          className="text-end"
        />
        {/* Was a "קישור ללוגו" text field. Wider than square on purpose — a letterhead is a
            wordmark far more often than it is a badge. */}
        <ImageField
          label="לוגו"
          hint="מופיע בכותרת הצעת המחיר ובפלטים המודפסים."
          value={s.logoUrl}
          onChange={(logoUrl) => patch({ logoUrl })}
          kind="logo"
          className="h-20 w-36"
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
        <NumberField
          label="תוקף ההצעה (ימים)"
          min={0}
          max={365}
          decimals={0}
          value={s.quoteValidityDays}
          onChange={(v) => patch({ quoteValidityDays: v })}
        />
        {/* Placeholder, never a stored default — a studio that skipped this screen must not send a
            client clauses it never agreed to. Editing a sensible draft is the point. */}
        <TextField
          label="תנאי ההצעה"
          multiline
          rows={6}
          value={s.quoteTerms}
          onChange={(v) => patch({ quoteTerms: v })}
          placeholder={SUGGESTED_QUOTE_TERMS}
          wrapperClassName="col-span-2"
        />
      </div>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-soft">
        שורה אחת לכל סעיף. הסעיפים מודפסים בתחתית כל הצעת מחיר, מעל שורת האישור והחתימה. השאירו ריק
        ולא יודפס דבר — הצעה בלי לוח תשלומים ובלי סעיף ביטול היא הצעה שאי אפשר להישען עליה.
      </p>
    </Panel>
  );
}
