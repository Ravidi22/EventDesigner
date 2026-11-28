"use client";

import { useEffect, useState } from "react";
import { Check, Download, TriangleAlert } from "lucide-react";
import { Button } from "@/components/button";
import { StatusChip } from "@/components/status-chip";
import { progressLabel, sizeLabel, type AccountExport } from "@/components/account-export";
import { fetchLastExport } from "@/lib/account/actions";
import { Panel } from "./ui";

// ייצוא נתונים (EVE-51, spec §5.8) — the whole business in one zip, for the owner. The download
// itself is the screen's hook (components/account-export.tsx), so switching sections does not stop
// it; this section shows where it stands: before, in progress, done, done with photos missing.

const day = (iso: string) => new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "short", timeZone: "Asia/Jerusalem" });

export function ExportSection({ exporter }: { exporter: AccountExport }) {
  const { state, start, cancel, save } = exporter;
  const [last, setLast] = useState<{ at: string; by: string } | null>(null);
  const finished = state.phase === "done";

  // Read again once a download finishes: the route wrote it down when it handed the data over.
  useEffect(() => {
    let live = true;
    fetchLastExport()
      .then((l) => live && setLast(l))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [finished]);

  return (
    <Panel title="ייצוא נתונים" hint="כל העסק בקובץ אחד, לבעלים בלבד.">
      <div className="flex max-w-3xl flex-col gap-3 rounded-md border border-border p-4">
        {state.phase === "running" ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-ink">מכינים את הקובץ…</span>
              <span role="status" className="nums text-[13px] text-ink-soft">
                {progressLabel(state)}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="התקדמות ההורדה"
              aria-valuemin={0}
              aria-valuemax={state.total || 1}
              aria-valuenow={state.done}
              className="h-1.5 overflow-hidden rounded-pill bg-accent-tint"
            >
              <div
                className="h-full rounded-pill bg-accent transition-[width]"
                style={{ width: `${state.total ? Math.round((state.done / state.total) * 100) : 4}%` }}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" variant="ghost" onClick={cancel}>
                ביטול
              </Button>
              <span className="text-[13px] text-ink-soft">אפשר לעבור בין ההגדרות; לא לצאת מהדף ולא לסגור את הלשונית.</span>
            </div>
          </>
        ) : state.phase === "done" ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <StatusChip tone="success" icon={<Check className="h-3.5 w-3.5" strokeWidth={2.5} />}>
                ירד
              </StatusChip>
              <span dir="ltr" className="nums min-w-0 truncate text-sm text-ink">
                {state.fileName}
              </span>
              <span className="nums text-[13px] text-ink-soft">· {sizeLabel(state.bytes)}</span>
              <Button size="sm" variant="ghost" onClick={save} className="ms-auto">
                הורדה שוב
              </Button>
            </div>
            {state.missing > 0 && (
              <div className="flex items-start gap-2 rounded-md bg-warn-tint px-3 py-2.5 text-[13px] leading-relaxed text-warn-ink">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <span>
                  <span className="nums">{state.missing}</span> {state.missing === 1 ? "תמונה לא ירדה" : "תמונות לא ירדו"}; כל השאר בקובץ. הרשימה
                  ב־<span dir="ltr">missing-files.txt</span> שבתוך הקובץ.
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-ink-soft">
              קובץ zip עם כל האירועים והסקיצות, הלקוחות, הקטלוג, מסמכי החיוב והתמונות — וטבלאות שנפתחות ב־Excel. ההורדה נבנית
              בדפדפן; בעסק עם הרבה תמונות היא לוקחת כמה דקות.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="outline" onClick={start} icon={<Download className="h-4 w-4" strokeWidth={1.75} />}>
                הורדת כל הנתונים
              </Button>
              {last && (
                <span className="text-[13px] text-ink-soft">
                  ההורדה האחרונה: <span className="nums">{day(last.at)}</span>, ע״י {last.by}
                </span>
              )}
            </div>
            {state.phase === "failed" && (
              <p role="alert" className="text-[13px] font-medium text-alert-ink">
                {state.message}
              </p>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
