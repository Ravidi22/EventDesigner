"use client";

import { useEffect, useRef } from "react";
import { Building2 } from "lucide-react";
import { saveSettings } from "@/lib/settings/actions";
import type { BusinessSettings } from "@/lib/settings/types";
import { Popover } from "@/components/popover";
import { TextField } from "@/components/text-field";
import { ImageField } from "@/components/image-field";
import { SwitchRow } from "@/components/toggle";

// The studio's own details AS THE QUOTE PRINTS THEM — logo, phone, email, Instagram, the owner's
// name and signature, בס״ד — editable from the quote screen itself. They are the studio's settings
// (the same row /settings edits), so a designer who notices on the quote that the phone number is
// missing fixes it once, here, for every quote after this one.

/** Which of the details a client would miss on the quote. */
export function missingDetails(s: BusinessSettings | null): string[] {
  if (!s) return [];
  return [
    !s.logoUrl && "לוגו",
    !s.phone && "טלפון",
    !s.email && "דוא״ל",
    !s.instagram && "אינסטגרם",
    !s.ownerName && "שם לחתימה",
    !s.signatureUrl && "חתימה",
  ].filter((x): x is string => !!x);
}

export function QuoteStudioDetails({ settings, onChange }: { settings: BusinessSettings; onChange: (next: BusinessSettings) => void }) {
  // Debounced like the settings screen: every field here autosaves (lib/settings/actions.ts).
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef<BusinessSettings | null>(null);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (latest.current) void saveSettings(latest.current);
    },
    [],
  );
  const patch = (p: Partial<BusinessSettings>) => {
    const next = { ...settings, ...p };
    onChange(next);
    latest.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      latest.current = null;
      void saveSettings(next);
    }, 600);
  };
  const missing = missingDetails(settings);

  return (
    <Popover
      label="פרטי הסטודיו בהצעה"
      icon={Building2}
      value={missing.length ? `חסרים ${missing.length}` : "מלאים"}
      tone={missing.length ? "warn" : "default"}
      side="bottom"
      panelClassName="w-[420px]"
    >
      <div className="space-y-3">
        <p className="text-[13px] text-muted">נשמרים בהגדרות הסטודיו ומופיעים בכל הצעה: הלוגו בראש, פרטי הקשר בתחתית כל עמוד, החתימה בסוף.</p>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="טלפון" type="tel" dir="ltr" value={settings.phone} onChange={(phone) => patch({ phone })} className="text-end" />
          <TextField label="דוא״ל" type="email" dir="ltr" value={settings.email} onChange={(email) => patch({ email })} className="text-end" />
          <TextField label="אינסטגרם" dir="ltr" value={settings.instagram} onChange={(instagram) => patch({ instagram })} placeholder="iritdesign" className="text-end" />
          <TextField label="שם לחתימה" value={settings.ownerName} onChange={(ownerName) => patch({ ownerName })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ImageField label="לוגו" value={settings.logoUrl} onChange={(logoUrl) => patch({ logoUrl })} kind="logo" className="h-20 w-36" />
          <ImageField label="חתימה" value={settings.signatureUrl} onChange={(signatureUrl) => patch({ signatureUrl })} kind="signature" className="h-20 w-36" />
        </div>
        <SwitchRow checked={settings.showBsd} onChange={(showBsd) => patch({ showBsd })} label="בס״ד בראש כל עמוד" />
      </div>
    </Popover>
  );
}
