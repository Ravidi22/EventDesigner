"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAuditLog } from "@/lib/audit/actions";
import { AUDIT_GROUP_LABEL, type AuditGroup, type AuditRow } from "@/lib/audit/types";
import { FORMER_CLIENT, FORMER_MEMBER } from "@/lib/account/words";
import { segmentClass, segmentFrameClass } from "@/components/segmented";
import { Button } from "@/components/button";
import { Panel } from "./ui";

// יומן פעולות (EVE-52, spec §5.9) — who did what, in the sensitive actions; the owner's alone. Newest
// first, a day at a time, fifty rows a page. A person who has since been erased reads as a former one
// (lib/audit/render.ts), in the muted ink.

const GROUPS: readonly (AuditGroup | "all")[] = ["all", "people", "places", "documents", "deletions", "account"];
const TZ = "Asia/Jerusalem";

const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const time = (iso: string) => new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

/** "היום", "אתמול", else "יום ד׳, 25 בנוב׳". */
function dayLabel(key: string, iso: string): string {
  const now = new Date();
  if (key === dayKey(now)) return "היום";
  if (key === dayKey(new Date(now.getTime() - 86_400_000))) return "אתמול";
  return new Date(iso).toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
}

export function AuditSection() {
  const [group, setGroup] = useState<AuditGroup | "all">("all");
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [more, setMore] = useState(false);
  // Where the next page starts: the server's cursor (the last row's exact time and id), never a row's
  // `at` — rows that share a millisecond were skipped at a page edge (PR #5 review).
  const [next, setNext] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // A page asked for under another filter arrives after this one was picked: drop it.
  const seq = useRef(0);

  const load = useCallback((g: AuditGroup | "all", before?: string) => {
    const mine = ++seq.current;
    fetchAuditLog({ group: g === "all" ? undefined : g, before })
      .then((page) => {
        if (mine !== seq.current) return;
        setRows((r) => (before && r ? [...r, ...page.rows] : page.rows));
        setMore(page.more);
        setNext(page.next);
        setFailed(false);
      })
      .catch(() => mine === seq.current && setFailed(true))
      .finally(() => mine === seq.current && setBusy(false));
  }, []);

  // The first page, and the first page again whenever the filter changes (the click clears the rows).
  useEffect(() => load(group), [group, load]);

  const pick = (g: AuditGroup | "all") => {
    if (g === group) return;
    setRows(null);
    setMore(false);
    setNext(undefined);
    setGroup(g);
  };

  const loadMore = () => {
    setBusy(true);
    load(group, next);
  };

  const days: { key: string; label: string; rows: AuditRow[] }[] = [];
  for (const r of rows ?? []) {
    const key = dayKey(new Date(r.at));
    const last = days[days.length - 1];
    if (last?.key === key) last.rows.push(r);
    else days.push({ key, label: dayLabel(key, r.at), rows: [r] });
  }

  return (
    <Panel title="יומן פעולות" hint="מי עשה מה, בפעולות הרגישות. נראה רק לבעלים.">
      <div className="flex max-w-4xl flex-col gap-4">
        <div role="group" aria-label="סינון לפי סוג" className={`${segmentFrameClass(true)} self-start`}>
          {GROUPS.map((g) => (
            <button key={g} type="button" aria-pressed={group === g} onClick={() => pick(g)} className={segmentClass(group === g, true)}>
              {g === "all" ? "הכל" : AUDIT_GROUP_LABEL[g]}
            </button>
          ))}
        </div>

        {failed && (
          <p role="alert" className="text-[13px] font-medium text-alert-ink">
            לא ניתן לקרוא את היומן כרגע.
          </p>
        )}
        {rows && rows.length === 0 && !failed && (
          <p className="rounded-md border border-inset-border bg-inset px-4 py-3 text-[13px] text-ink-soft">
            {group === "all" ? "עוד אין פעולות ביומן." : "אין פעולות מהסוג הזה."}
          </p>
        )}

        {days.map((d) => (
          <section key={d.key} aria-label={d.label}>
            <h3 className="mb-1.5 text-[13px] font-semibold text-muted">{d.label}</h3>
            <ul className="overflow-hidden rounded-md border border-border">
              {d.rows.map((r) => {
                const gone = r.actor === FORMER_MEMBER || r.actor === FORMER_CLIENT;
                return (
                  <li
                    key={r.id}
                    className="nums grid grid-cols-[56px_140px_minmax(0,1fr)] gap-3 border-b border-border-soft px-3.5 py-2.5 text-sm last:border-0"
                  >
                    <span className="text-ink-soft">{time(r.at)}</span>
                    <span className={`truncate ${gone ? "text-muted" : "font-semibold text-ink"}`}>{r.actor}</span>
                    <span className="min-w-0 text-ink-soft">{r.line}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {more && (
          <div className="flex justify-center">
            <Button size="sm" variant="outline" disabled={busy} onClick={loadMore}>
              {busy ? "טוען…" : "טעינת עוד"}
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}
