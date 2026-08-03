"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import {
  CURRENT_MEMBER_ID,
  ROLE_SUMMARY,
  STUDIO_ROLE_LABEL,
  currentMember,
  updateMember,
  type StudioMember,
} from "@/lib/team/storage";
import { TextField } from "@/components/text-field";
import { StatusChip } from "@/components/status-chip";
import { Avatar, Note, Panel, SavedFlag } from "./ui";

// The signed-in person's own row, editable. Everything here writes through lib/team/storage.ts —
// the same list the צוות section shows, so a rename here is a rename there.
export function AccountSection() {
  const [me, setMe] = useState<StudioMember | null>(null);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => setMe(currentMember()), []);

  if (!me) return null;

  const patch = (p: Partial<StudioMember>) => {
    setMe({ ...me, ...p });
    updateMember(CURRENT_MEMBER_ID, p);
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 1600);
  };

  return (
    <Panel title="החשבון שלי" hint="השם שמופיע לצד פעולות שלכם ובהזמנות שאתם שולחים." action={<SavedFlag shown={saved} />}>
      <div className="flex max-w-3xl flex-col gap-5">
        <div className="flex items-center gap-3.5 rounded-md border border-inset-border bg-inset px-4 py-3.5">
          <Avatar name={me.name} tone="self" className="h-14 w-14 text-[17px]" />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-ink">{me.name}</p>
            <p dir="ltr" className="text-end text-caption text-muted">
              {me.email}
            </p>
          </div>
          {/* Beside the name, not pinned to the card's far edge — on a full-width panel ms-auto
              stranded the chip a screen away from the person it describes. */}
          <StatusChip tone="accent" icon={<ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />} className="ms-2">
            {STUDIO_ROLE_LABEL[me.role]}
          </StatusChip>
          <p className="me-2 ms-auto max-w-xs text-caption leading-relaxed text-muted">{ROLE_SUMMARY[me.role]}</p>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <TextField label="שם מלא" value={me.name} onChange={(v) => patch({ name: v })} />
          <TextField label="אימייל" type="email" dir="ltr" value={me.email} onChange={(v) => patch({ email: v })} className="text-end" />
        </div>

        <Note icon={<Lock className="h-4 w-4" strokeWidth={1.6} />}>
          כניסה עם סיסמה, איפוס סיסמה וניהול מנוי עדיין לא מחוברים — הם נכנסים יחד עם החשבונות
          האמיתיים בשלב ה־SaaS. עד אז ההרשאות שבמסך הזה מתארות מי אמור לראות מה, אבל אינן חוסמות
          אף אחד בפועל.
        </Note>
      </div>
    </Panel>
  );
}
