"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { ROLE_SUMMARY, STUDIO_ROLE_LABEL, type StudioMember } from "@/lib/team/types";
import { fetchCurrentMember, updateMyName } from "@/lib/team/actions";
import { TextField } from "@/components/text-field";
import { StatusChip } from "@/components/status-chip";
import { Avatar, Note, Panel, SavedFlag } from "./ui";

// The signed-in person's own row — the real one.
//
// This screen used to read a fixture called `member-daniel` out of localStorage and write back to
// it. That was harmless while nobody could sign in, and wrong the moment they could: a designer
// with a real account was editing an invented person, and nothing they typed here had anything to
// do with the row their session names. `fetchCurrentMember()` is that row.
//
// The email is READ-ONLY now, and that is not a limitation to fix later — it is the address the
// account signs in with, so changing it is an identity change that needs the new address verified
// before the old one stops working. A text field that silently swaps your login is worse than no
// field at all.
export function AccountSection() {
  const [me, setMe] = useState<StudioMember | null>(null);
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    void fetchCurrentMember().then(setMe);
    return () => {
      clearTimeout(saveTimer.current);
      clearTimeout(flashTimer.current);
    };
  }, []);

  if (!me) return null;

  // Optimistic and debounced, like every other autosaving field in settings: typing must not wait
  // on a round trip, and a rename is one write per pause rather than one per keystroke.
  const rename = (name: string) => {
    setMe({ ...me, name });
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void updateMyName(name)
        .then(() => {
          setSaved(true);
          clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setSaved(false), 1600);
        })
        // An empty name is the only rejection here, and the field still shows what they typed —
        // re-fetching to "correct" them mid-word is worse than letting the next pause save it.
        .catch(() => {});
    }, 500);
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
          <TextField label="שם מלא" value={me.name} onChange={rename} />
          <TextField
            label="אימייל — כתובת הכניסה"
            type="email"
            dir="ltr"
            value={me.email}
            onChange={() => {}}
            readOnly
            className="text-end"
          />
        </div>

        <Note icon={<Lock className="h-4 w-4" strokeWidth={1.6} />}>
          התפקיד שלכם נקבע על ידי בעלי הסטודיו, ולכן אינו נערך מכאן. שינוי כתובת הכניסה ואיפוס סיסמה
          במייל עדיין לא מחוברים — כתובת שמתחלפת בלי אימות היא דרך לאבד גישה לחשבון.
        </Note>
      </div>
    </Panel>
  );
}
