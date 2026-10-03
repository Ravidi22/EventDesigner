"use client";

import { useEffect, useRef, useState } from "react";
import { saveStageRules, type StageRules } from "@/lib/settings/actions";
import { NumberField } from "@/components/number-field";
import { SwitchRow } from "@/components/toggle";
import { Panel, SavedFlag } from "./ui";

// How the studio's stages are checked. One rule, and it is OFF until the studio turns it on: above
// what height the open sides of a stage need a railing. A safety threshold differs by country, venue
// and insurer, and the app does not get to pick one — an invented number is either a nag on every
// stage or a false reassurance on the one that needed a rail. The front, where the performance is,
// is never railed; the stage bar in the studio and the stage plan say where one is needed.
export function StagesSection({ initialRules }: { initialRules: StageRules }) {
  const [rules, setRules] = useState<StageRules>(initialRules);
  // The height last typed, kept while the rule is off so turning it back on restores it.
  const [lastMm, setLastMm] = useState(initialRules.railingAboveMm ?? 500);
  const [saved, setSaved] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // Debounced like every other autosave on this screen (600ms).
  const write = (next: StageRules) => {
    setRules(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveStageRules(next), 600);
    setSaved(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSaved(false), 1600);
  };

  const on = rules.railingAboveMm !== null;
  return (
    <Panel
      title="במות"
      hint="כללים שנבדקים על כל במה שמסמנים בסטודיו, ומופיעים בסרגל הבמה ובתוכנית הבמה. הכול נשמר אוטומטית."
      action={<SavedFlag shown={saved} />}
    >
      <div className="max-w-xl space-y-3">
        <SwitchRow
          checked={on}
          onChange={(next) => write({ railingAboveMm: next ? lastMm : null })}
          label="לדרוש מעקה בצדדים הפתוחים"
          hint="בצדדים שאינם צמודים לקיר ואינם החזית, כשהבמה (או מפלס עליה) גבוהה מהגובה שנקבע כאן. כבוי — אף במה לא תסומן כדורשת מעקה."
        />
        {on && (
          <div className="flex items-center gap-2 ps-1">
            <span className="text-sm text-ink">מעל גובה</span>
            <NumberField
              value={Math.round((rules.railingAboveMm ?? lastMm) / 10)}
              onChange={(cm) => {
                const mm = Math.round(cm * 10);
                setLastMm(mm);
                write({ railingAboveMm: mm });
              }}
              min={10}
              max={300}
              decimals={0}
              aria-label="גובה שמעליו נדרש מעקה, בסנטימטרים"
              wrapperClassName="w-[76px]"
            />
            <span className="text-sm text-muted">ס״מ</span>
          </div>
        )}
      </div>
    </Panel>
  );
}
