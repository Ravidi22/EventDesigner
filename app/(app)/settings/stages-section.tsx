"use client";

import { useEffect, useRef, useState } from "react";
import { saveStageRules, type StageRules } from "@/lib/settings/actions";
import { RISER_MAX_MM, TREAD_MM } from "@/lib/design-document/stage";
import { NumberField } from "@/components/number-field";
import { SwitchRow } from "@/components/toggle";
import { Panel, SavedFlag } from "./ui";

// How the studio's stages are checked and built.
//
// THE RAILING is a rule, and it is OFF until the studio turns it on: above what height the open
// sides of a stage need a railing. A safety threshold differs by country, venue and insurer, and
// the app does not get to pick one — an invented number is either a nag on every stage or a false
// reassurance on the one that needed a rail. The front, where the performance is, is never railed;
// the stage bar in the studio and the stage plan say where one is needed.
//
// THE STAIR MODULE is a fact about the crew's gear: the step their flights are built from — a crew
// with 20cm units climbs a 60cm stage in three, a 40cm one in two — and how deep each tread is.
// Every stage drawn from here on is built in it (StageBuild.riserMm / treadMm) and keeps it, so a
// plan already handed out never changes because the studio bought other stairs. Blank = the
// comfortable defaults (no riser over 18cm, 28cm treads).
export function StagesSection({ initialRules }: { initialRules: StageRules }) {
  const [rules, setRules] = useState<StageRules>(initialRules);
  // The height last typed, kept while the rule is off so turning it back on restores it.
  const [lastMm, setLastMm] = useState(initialRules.railingAboveMm ?? 500);
  const [saved, setSaved] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // Debounced like every other autosave on this screen (600ms).
  const write = (patch: Partial<StageRules>) => {
    const next = { ...rules, ...patch };
    setRules(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveStageRules(next), 600);
    setSaved(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSaved(false), 1600);
  };

  const on = rules.railingAboveMm !== null;
  const ownStep = rules.stairRiserMm !== null || rules.stairTreadMm !== null;
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

        <div className="border-t border-border pt-3">
          <SwitchRow
            checked={ownStep}
            onChange={(next) => write(next ? { stairRiserMm: RISER_MAX_MM, stairTreadMm: TREAD_MM } : { stairRiserMm: null, stairTreadMm: null })}
            label="מדרגות הבמה בנויות ממודול קבוע"
            hint={`גובה המדרגה ועומקה שהצוות עובד איתם — במה של 60 ס״מ עם מדרגות של 20 ס״מ נבנית בשלוש. כל במה חדשה נבנית לפיהם ושומרת אותם; במה שכבר צוירה לא משתנה. כבוי — ברירת המחדל: עד ${Math.round(RISER_MAX_MM / 10)} ס״מ לרום, ${Math.round(TREAD_MM / 10)} ס״מ לשלח.`}
          />
          {ownStep && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 ps-1">
              <label className="flex items-center gap-2">
                <span className="text-sm text-ink">גובה מדרגה</span>
                <NumberField
                  value={Math.round((rules.stairRiserMm ?? RISER_MAX_MM) / 10)}
                  onChange={(cm) => write({ stairRiserMm: Math.round(cm * 10) })}
                  min={8}
                  max={30}
                  decimals={0}
                  aria-label="גובה מדרגה אחת, בסנטימטרים"
                  wrapperClassName="w-[76px]"
                />
                <span className="text-sm text-muted">ס״מ</span>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-sm text-ink">עומק מדרגה</span>
                <NumberField
                  value={Math.round((rules.stairTreadMm ?? TREAD_MM) / 10)}
                  onChange={(cm) => write({ stairTreadMm: Math.round(cm * 10) })}
                  min={15}
                  max={60}
                  decimals={0}
                  aria-label="עומק מדרגה אחת, בסנטימטרים"
                  wrapperClassName="w-[76px]"
                />
                <span className="text-sm text-muted">ס״מ</span>
              </label>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
