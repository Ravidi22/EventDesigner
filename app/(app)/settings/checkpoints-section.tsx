"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  CHECKPOINTS,
  DEFAULT_OFFSETS,
  type CheckpointId,
  type CheckpointOffsets,
} from "@/lib/production/runway";
import { resetCheckpointOffsets, saveCheckpointOffsets } from "@/lib/settings/actions";
import { Button } from "@/components/button";
import { NumberField } from "@/components/number-field";
import { Panel, SavedFlag } from "./ui";

// The studio's backward plan: how long before an event each production checkpoint has to be true.
//
// This is the ONE screen that configures /production, and the numbers here are the whole of what a
// designer can tune about it — everything else on that screen is derived and deliberately not
// settable (lib/production/runway.ts). A studio that books six months out and one that books six
// weeks out do not share a schedule, and a default that suits neither is a screen full of alerts
// nobody believes.
//
// WHY EACH ROW EXPLAINS WHAT MARKS THE CHECKPOINT DONE. A number here has no visible effect until
// an event happens to cross it, which is the classic setting nobody ever sets. Saying "מסומן
// כשיצאה הצעת מחיר" turns "30" from an abstract preference into a sentence about the designer's own
// work — and it also says, without a paragraph about it, that these are not statuses anyone marks
// by hand.
//
// The copy lives HERE rather than on CheckpointDef in runway.ts on purpose. runway.ts is pure and is
// read by /production, by lib/production/actions.ts and by a node self-check; "which fact in the
// app satisfies this" is a question only this settings screen asks, and hanging it off the shared
// definition would carry a settings-screen string into every one of those.
const DONE_WHEN: Record<CheckpointId, string> = {
  zones: "מסומן כשנבחרו אזורי האירוע בטופס הפרטים.",
  gallery: "מסומן אחרי מעבר גלריה — כשיש תמונות בתיק האירוע.",
  design: "מסומן כשיש סקיצה לאירוע בסטודיו.",
  quote: "מסומן כשיצאה ללקוח הצעת מחיר.",
  confirm: "מסומן כשהלקוח אישר. זו הנקודה שבה האירוע עובר מ״בהצעה״ ל״בהפקה״.",
  packing: "מסומן אחרי ייצוא ראשון של רשימת הציוד.",
};

export function CheckpointsSection({ initialOffsets }: { initialOffsets: CheckpointOffsets }) {
  // Seeded by the server read in page.tsx, exactly like the business form — a section that opens on
  // DEFAULT_OFFSETS and corrects itself one round trip later shows the designer a schedule that is
  // not theirs, and this one is a table of numbers, where the correction is very visible.
  const [offsets, setOffsets] = useState<CheckpointOffsets>(initialOffsets);
  const [saved, setSaved] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Typing stays instant and the write follows 600ms later, the same 600ms the business form uses.
  // NumberField reports every valid keystroke, so "45" typed into an empty box is two onChange
  // calls and "120" is three — against Postgres that is a request per digit, for six fields.
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const flash = () => {
    setSaved(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSaved(false), 1600);
  };

  const set = (id: CheckpointId, days: number) => {
    const next = { ...offsets, [id]: days };
    setOffsets(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveCheckpointOffsets(next);
    }, 600);
    flash();
  };

  // ⚠ CANCEL THE PENDING WRITE FIRST. Reset stores NULL, and a debounced save still in the air from
  // the digit typed 300ms ago would land after it and write the old schedule straight back — the
  // reset would appear to work and then silently undo itself. Same reason the studio sequences its
  // autosave rather than firing them independently.
  const reset = () => {
    clearTimeout(saveTimer.current);
    flash();
    void resetCheckpointOffsets().then(setOffsets);
  };

  const isDefault = CHECKPOINTS.every(({ id }) => offsets[id] === DEFAULT_OFFSETS[id]);

  return (
    <Panel
      title="לוח זמנים להפקה"
      hint="כל נקודת בקרה נמדדת אחורה מתאריך האירוע. עבר התאריך והנקודה עדיין לא סומנה — היא נדלקת כהתראה במסך ההפקה, והמוקדמת שבהן היא זו שהאירוע מוצג לפיה. הכול נשמר אוטומטית."
      action={<SavedFlag shown={saved} />}
    >
      {/* In runway order, not alphabetically and not by size: the list is a plan, and reading it
          top to bottom is meant to read as the way the work actually happens. */}
      <ol className="max-w-3xl">
        {CHECKPOINTS.map(({ id, label }, i) => (
          <li key={id} className="flex items-center gap-3 border-b border-border-soft py-3.5 last:border-0">
            <span
              aria-hidden
              className="nums flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-tint text-[13px] font-bold text-accent"
            >
              {i + 1}
            </span>

            <div className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-ink">{label}</span>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">{DONE_WHEN[id]}</p>
            </div>

            {/* The unit is spelled out beside every field rather than once in a column header:
                these rows are read one at a time, when a designer is deciding about ONE checkpoint,
                and "45" with the header scrolled away is a number without a meaning. */}
            <div className="flex shrink-0 items-center gap-2">
              <NumberField
                value={offsets[id]}
                onChange={(days) => set(id, days)}
                min={0}
                max={365}
                decimals={0}
                aria-label={`${label} — ימים לפני האירוע`}
                wrapperClassName="w-[76px]"
              />
              <span className="text-[13px] text-muted">ימים לפני האירוע</span>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-5 flex items-start justify-between gap-4">
        <p className="max-w-xl text-xs leading-relaxed text-muted">
          אף אחת מהנקודות אינה סטטוס שמסמנים ביד — כולן נגזרות ממה שכבר קיים באירוע, ולכן לא יכולות
          להתיישן. 0 פירושו ״ביום האירוע עצמו״. אירוע שכבר עבר לא נדלק בהתראות, ואירוע בלי תאריך אינו
          נמדד כלל: אין ממה לספור אחורה.
        </p>
        <Button variant="ghost" onClick={reset} disabled={isDefault}>
          <RotateCcw className="h-4 w-4" strokeWidth={2} />
          חזרה לברירת המחדל
        </Button>
      </div>
    </Panel>
  );
}
