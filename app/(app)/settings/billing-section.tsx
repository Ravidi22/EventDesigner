"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { saveSettings } from "@/lib/settings/actions";
import type { BusinessSettings } from "@/lib/settings/types";
import { setCounterStart, type SeriesCounter } from "@/lib/billing/actions";
import { KIND_LABEL, VAT_STATUS_LABEL, type DocumentKind, type VatStatus } from "@/lib/billing/types";
import { kindsFor } from "@/lib/billing/rules";
import { Segmented } from "@/components/segmented";
import { TextField } from "@/components/text-field";
import { NumberField } from "@/components/number-field";
import { Button } from "@/components/button";
import { Note, Panel, Row, SavedFlag } from "./ui";

// חיוב ומסמכים — what the billing documents (lib/billing) read off the studio, and nothing else:
//
//   מעמד מע״מ   which documents the studio may issue at all. A עוסק פטור never prints "חשבונית מס".
//   פרטי בנק    printed on a payment request, so the client can transfer.
//   מספור        where each series starts — typed ONCE, while the series is still empty. After the
//                first document the counter is the law's (no gaps, no reuse) and the field locks.
//
// The letterhead, ע.מ/ח.פ and the VAT rate stay in העסק: a document prints the same letterhead the
// quote does.
const STATUSES: readonly (readonly [VatStatus, string])[] = (["exempt", "licensed", "company"] as const).map((s) => [s, VAT_STATUS_LABEL[s]] as const);

export function BillingSection({ initialSettings, initialCounters }: { initialSettings: BusinessSettings; initialCounters: SeriesCounter[] }) {
  const [s, setS] = useState<BusinessSettings>(initialSettings);
  const [counters, setCounters] = useState<SeriesCounter[]>(initialCounters);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // The same autosave the business section has: typing is instant, the write follows 600ms later.
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

  const allowed = new Set(kindsFor(s.vatStatus));

  return (
    <div className="space-y-4">
      <Panel
        title="חיוב ומסמכים"
        hint="מעמד העסק מול מע״מ קובע אילו מסמכים אפשר להפיק. הכותרת, ע.מ/ח.פ ושיעור המע״מ נלקחים מפרטי העסק."
        action={<SavedFlag shown={saved} />}
      >
        <div className="grid max-w-3xl grid-cols-2 gap-x-4 gap-y-5">
          <div className="col-span-2">
            <Segmented<VatStatus> label="מעמד מול מע״מ" value={s.vatStatus} options={STATUSES} onChange={(vatStatus) => patch({ vatStatus })} />
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
              {s.vatStatus === "exempt"
                ? "עוסק פטור אינו גובה מע״מ ואינו מפיק חשבונית מס — על כל תשלום מופקת קבלה."
                : "על כל תשלום מופקת חשבונית מס / קבלה; ללקוח עסקי שמשלם בתנאי אשראי — חשבונית מס ואחריה קבלה."}
            </p>
          </div>
          <TextField
            label="פרטי חשבון בנק"
            multiline
            rows={2}
            value={s.bankDetails}
            onChange={(v) => patch({ bankDetails: v })}
            placeholder="בנק · סניף · מספר חשבון · שם המוטב"
            wrapperClassName="col-span-2"
          />
        </div>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-soft">מודפס על דרישת תשלום, כדי שהלקוח יוכל להעביר. לא מופיע על חשבונית או קבלה.</p>
      </Panel>

      <Panel title="מספור המסמכים" hint="לכל סוג מסמך סדרה משלו, רצופה וללא דילוגים. אפשר לקבוע מאיפה היא מתחילה רק כל עוד לא הופק בה מסמך — סטודיו שעבר מתוכנה אחרת ממשיך את המספור שלו.">
        <div className="max-w-3xl">
          {counters
            .filter((c) => allowed.has(c.series))
            .map((c) => (
              <CounterRow
                key={c.series}
                counter={c}
                onSave={async (next) => {
                  setError(null);
                  const out = await setCounterStart(c.series, next);
                  if ("error" in out) setError(out.error);
                  else setCounters(out);
                }}
              />
            ))}
          {error && (
            <p role="status" className="mt-3 text-xs font-medium text-alert-ink">
              {error}
            </p>
          )}
        </div>
      </Panel>

      <Panel title="מה החוק מבקש" hint="הכללים שהמסמכים כבר מקיימים, כדי שתדעו למה המסך מתנהג כך.">
        <div className="max-w-3xl space-y-3">
          <Note icon={<Info className="h-4 w-4" strokeWidth={1.75} />}>
            <strong>מסמך שהופק אינו ניתן לעריכה.</strong> טעות מתקנים במסמך חדש: חשבונית זיכוי מול חשבונית, הזמנה מתוקנת מול הזמנה. ביטול במקום אפשרי רק למסמך שהמקור שלו עוד לא הופק ולא נשלח, בתוך החודש שבו הופק.
          </Note>
          <Note icon={<Info className="h-4 w-4" strokeWidth={1.75} />}>
            <strong>מקור והעתק.</strong> חשבונית, קבלה וזיכוי מודפסים פעם אחת כ״מקור״ — זה העותק שנמסר ללקוח. כל הדפסה נוספת היא ״העתק״. קובץ PDF שנשלח בלי חתימה אלקטרונית מאושרת הוא העתק, לא מקור.
          </Note>
          <Note icon={<Info className="h-4 w-4" strokeWidth={1.75} />}>
            <strong>מספר הקצאה.</strong> חשבונית מס מעל 5,000 ₪ לפני מע״מ צריכה מספר הקצאה מרשות המסים (״חשבוניות ישראל״). עד שהחיבור האוטומטי יוקם, מקלידים אותו על המסמך מתוך האזור האישי ברשות.
          </Note>
          <Note icon={<Info className="h-4 w-4" strokeWidth={1.75} />}>
            <strong>מזומן.</strong> עד 6,000 ₪ לעסקה, ומעל 6,000 ₪ — הנמוך מבין 6,000 ₪ ו-10% מסכום העסקה. קבלה על שיק מציינת את מספרו; על כרטיס — את ארבע הספרות האחרונות.
          </Note>
          <Note icon={<Info className="h-4 w-4" strokeWidth={1.75} />}>
            <strong>שמירה.</strong> המסמכים נשמרים שבע שנים ואינם נמחקים לעולם; אירוע שיש לו מסמכים עובר לארכיון ולא נמחק.
          </Note>
        </div>
      </Panel>
    </div>
  );
}

function CounterRow({ counter, onSave }: { counter: SeriesCounter; onSave: (next: number) => Promise<void> }) {
  const [next, setNext] = useState(counter.next);
  const [busy, setBusy] = useState(false);
  const dirty = next !== counter.next;
  return (
    <Row>
      <span className="min-w-0 flex-1 font-medium text-ink">{KIND_LABEL[counter.series as DocumentKind]}</span>
      {counter.used ? (
        <span className="nums text-sm text-muted">המספר הבא: {counter.next}</span>
      ) : (
        <>
          <NumberField aria-label={`המספר הראשון — ${KIND_LABEL[counter.series as DocumentKind]}`} min={1} decimals={0} value={next} onChange={setNext} className="w-28" />
          <Button
            variant="outline"
            size="sm"
            disabled={!dirty || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(next);
              } finally {
                setBusy(false);
              }
            }}
          >
            קביעה
          </Button>
        </>
      )}
    </Row>
  );
}
