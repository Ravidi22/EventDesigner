"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Images, PenTool, ReceiptText, Trash2, UserMinus, type LucideIcon } from "lucide-react";
import type { EventFootprint, EventSummary } from "@/lib/events/types";
import { STATUS_LABEL, eventStatus, formatEventDate } from "@/lib/events/types";
import { fetchEventFootprint } from "@/lib/events/actions";
import { useMeetingFlow } from "@/lib/meeting/use-flow";
import { ConfirmDialog } from "@/components/confirm-dialog";

/** The question asked before an event is deleted (2026-11-10, the "Modals & popups" board, 4c).
 *
 *  It used to recite a paragraph of everything that MIGHT go. It counts what THIS event actually
 *  holds instead — "3 פגישות", "14 תמונות שסומנו", whose access to the sketch ends — read off the
 *  server when the question opens (fetchEventFootprint), and it says what survives (expenses,
 *  unlinked).
 *
 *  And it offers the way out that keeps everything: most deletes are a lost client, not a mistake,
 *  and "לא נסגר" (`lostAt`) is that outcome recorded rather than the record destroyed. An event with
 *  billing documents cannot be deleted at all — they are the studio's books (lib/events/actions.ts
 *  deleteEvent refuses it) — so the question says so instead of offering a delete that will fail. */
export function EventDeleteDialog({
  event,
  onConfirm,
  onMarkLost,
  onClose,
}: {
  event: EventSummary | null;
  onConfirm: () => void;
  onMarkLost: () => Promise<void>;
  onClose: () => void;
}) {
  const flow = useMeetingFlow();
  // Keyed on the event it was read for, so a second question never shows the first one's counts
  // while its own are in the air.
  const [read, setRead] = useState<{ id: string; footprint: EventFootprint | null } | null>(null);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<{ id: string; text: string } | null>(null);
  const id = event?.id;

  useEffect(() => {
    if (!id) return;
    let live = true;
    fetchEventFootprint(id)
      .then((footprint) => live && setRead({ id, footprint }))
      // A read that failed is SAID (null), never left as a skeleton with the delete on offer.
      .catch(() => live && setRead({ id, footprint: null }));
    return () => {
      live = false;
    };
  }, [id]);

  const settled = !!read && read.id === id;
  const footprint = settled ? read.footprint : null;
  const failed = settled && !footprint;
  const refused = !!footprint && footprint.billingDocuments > 0;
  const offerLost = !!event && !event.lostAt && !event.archived;

  const facts = event
    ? [event.eventType, event.date ? formatEventDate(event.date) : "", STATUS_LABEL[eventStatus(event, flow)]].filter(Boolean).join(" · ")
    : undefined;

  const markLost = async () => {
    if (marking) return;
    setMarking(true);
    setMarkError(null);
    try {
      await onMarkLost();
    } catch {
      if (id) setMarkError({ id, text: "לא ניתן לסמן כרגע — נסו שוב." });
    } finally {
      setMarking(false);
    }
  };

  return (
    <ConfirmDialog
      open={!!event}
      wide
      title={`למחוק את האירוע של ${event?.clientName ?? ""}?`}
      facts={facts}
      confirmLabel="מחיקה לצמיתות"
      confirmIcon={Trash2}
      // Not offered until the counts are in: an event with billing documents cannot be deleted, and
      // the question must not offer what the server will refuse (or what nobody has read yet).
      hideConfirm={!footprint || refused}
      onConfirm={onConfirm}
      onClose={onClose}
      body={
        <>
          {refused ? (
            <p className="rounded-md border border-alert bg-alert-tint px-3.5 py-3 text-[13px] font-medium leading-relaxed text-alert-ink">
              לאירוע הופקו מסמכי חיוב והם נשמרים בספרים — אי אפשר למחוק אותו.
            </p>
          ) : (
            <div className="flex flex-col gap-2 rounded-md border border-inset-border bg-inset px-3.5 py-3 text-[13px]">
              <span className="text-xs font-semibold text-alert-ink">נמחק לצמיתות</span>
              {footprint ? (
                <Gone footprint={footprint} />
              ) : failed ? (
                <span className="text-ink-soft">לא ניתן לבדוק כרגע מה שמור באירוע — סגרו ונסו שוב.</span>
              ) : (
                <Loading />
              )}
              {footprint && footprint.expenses > 0 && (
                <span className="nums mt-1 border-t border-inset-border pt-2 text-xs text-ink-soft">
                  נשמרות: {footprint.expenses === 1 ? "הוצאה אחת שנרשמה" : `${footprint.expenses} הוצאות שנרשמו`}, בלי שיוך לאירוע.
                </span>
              )}
            </div>
          )}
          {offerLost && (
            <div className="flex items-center gap-2.5 rounded-md border border-border px-3.5 py-2.5">
              <span className="flex-1 text-[13px] leading-normal text-ink-soft">האירוע לא נסגר? אפשר לסמן ״לא נסגר״ ולשמור את הכל.</span>
              <button
                type="button"
                onClick={() => void markLost()}
                disabled={marking}
                className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-pill border-[1.5px] border-accent-line px-3 text-xs font-bold text-accent transition-colors hover:bg-accent-tint disabled:opacity-50"
              >
                {marking ? "מסמן…" : "סימון כלא נסגר"}
              </button>
            </div>
          )}
          {markError && markError.id === id && (
            <p role="alert" className="text-xs font-medium text-alert-ink">
              {markError.text}
            </p>
          )}
        </>
      }
    />
  );
}

/** What the event holds that goes with it — only what it actually holds. */
function Gone({ footprint: f }: { footprint: EventFootprint }) {
  const rows: { icon: LucideIcon; text: string }[] = [];
  if (f.drawing) rows.push({ icon: PenTool, text: "הסקיצה" });
  if (f.quotes) rows.push({ icon: ReceiptText, text: f.quotes === 1 ? "הצעת מחיר אחת" : `${f.quotes} הצעות מחיר` });
  if (f.appointments) rows.push({ icon: CalendarDays, text: f.appointments === 1 ? "פגישה אחת" : `${f.appointments} פגישות` });
  if (f.likedImages) rows.push({ icon: Images, text: f.likedImages === 1 ? "תמונה אחת שסומנה" : `${f.likedImages} תמונות שסומנו` });
  for (const name of f.clients) rows.push({ icon: UserMinus, text: `הגישה של ${name}` });

  if (!rows.length) return <span className="text-ink-soft">אין לאירוע סקיצה, פגישות או תמונות.</span>;
  return (
    <div className="nums grid grid-cols-2 gap-x-3 gap-y-1.5 text-ink">
      {rows.map(({ icon: Icon, text }) => (
        <span key={text} className="flex min-w-0 items-center gap-2">
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={1.75} />
          <span className="truncate">{text}</span>
        </span>
      ))}
    </div>
  );
}

function Loading() {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 py-0.5" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="h-3.5 animate-pulse rounded-pill bg-border" />
      ))}
    </div>
  );
}
