"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, MessageCircle, Trash2 } from "lucide-react";
import { fetchSceneLinks, mintSceneLink, revokeSceneLink, type SceneLinkRow } from "@/lib/scene/actions";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

// The no-login link to the event in 3D (spec §6.4, F-9.2): the designer mints it here, sends it to
// the couple (who forward it to family), sees whether it was opened, and takes it back. One live
// link per event — a new one revokes the last (DECIDE 4), which is also how a link sent to the wrong
// number is taken back. The token is shown ONCE, in the minute after minting; only its hash is kept.

/** wa.me wants the number in international form, digits only: 050-1234567 → 972501234567. */
function waNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

const dateOf = (iso: string) => new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "2-digit" });

export function SharePanel({ eventId, clientName, phone }: { eventId: string; clientName: string; phone: string }) {
  const [links, setLinks] = useState<SceneLinkRow[] | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<SceneLinkRow | null>(null);

  useEffect(() => {
    let live = true;
    setFresh(null);
    fetchSceneLinks(eventId)
      .then((l) => live && setLinks(l))
      .catch(() => live && setError("לא הצלחנו לקרוא את הקישורים"));
    return () => {
      live = false;
    };
  }, [eventId]);

  const current = links?.find((l) => l.live) ?? null;

  const mint = async () => {
    setBusy(true);
    setError(null);
    try {
      const { path, links: next } = await mintSceneLink(eventId);
      setFresh(`${window.location.origin}${path}`);
      setLinks(next);
    } catch {
      setError("הקישור לא נוצר — נסו שוב");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (row: SceneLinkRow) => {
    setRevoking(null);
    setBusy(true);
    try {
      setLinks(await revokeSceneLink(eventId, row.id));
      setFresh(null);
    } catch {
      setError("הקישור לא בוטל — נסו שוב");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // A refused clipboard (an insecure origin): the field is selectable for exactly this.
    }
  };

  const to = waNumber(phone);
  const text = fresh ? `היי ${clientName}, האירוע שלכם בתלת-ממד — אפשר לעבור בין הזוויות ולראות את הסיור: ${fresh}` : "";

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-inset p-[11px]">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
        <Link2 className="h-4 w-4 text-accent" strokeWidth={1.8} />
        שיתוף עם הלקוח
      </h3>

      {fresh ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] leading-relaxed text-ink-soft">
            <span className="font-bold text-ink">הקישור מוכן.</span> תקף 30 יום ומוצג פעם אחת — בלי סיסמה, אפשר להעביר למשפחה.
          </p>
          <input
            readOnly
            dir="ltr"
            value={fresh}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="הקישור לתלת-ממד"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-start text-xs text-ink-soft"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void copy()} className="flex-1">
              {copied ? <Check className="h-4 w-4 text-success" strokeWidth={2.5} /> : <Copy className="h-4 w-4" strokeWidth={1.8} />}
              {copied ? "הועתק" : "העתקה"}
            </Button>
            <a
              href={`https://wa.me/${to ?? ""}?text=${encodeURIComponent(text)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-pill bg-accent px-3 py-1.5 text-[13px] font-bold text-canvas transition-colors hover:bg-accent-hover"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={1.8} />
              וואטסאפ
            </a>
          </div>
        </div>
      ) : current ? (
        <div className="flex items-center justify-between gap-2 text-[13px] text-ink-soft">
          <span>
            קישור פעיל עד {dateOf(current.expiresAt)} · {current.openedCount ? `נפתח ${current.openedCount} פעמים` : "עוד לא נפתח"}
          </span>
          <button
            type="button"
            onClick={() => setRevoking(current)}
            className="rounded-md p-1 text-alert transition-colors hover:bg-surface"
            title="ביטול הקישור"
            aria-label="ביטול הקישור"
            disabled={busy}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-muted">קישור צפייה בלי סיסמה — הלקוח רואה רק את נקודות המבט והסיור שהכנתם, בלי מחירים.</p>
      )}

      <Button size="sm" variant={current && !fresh ? "outline" : "primary"} className="w-full" onClick={() => void mint()} disabled={busy}>
        {current ? "קישור חדש (מבטל את הקודם)" : "יצירת קישור"}
      </Button>
      {error && <p className="text-[13px] text-alert">{error}</p>}

      <ConfirmDialog
        open={!!revoking}
        title="לבטל את הקישור?"
        body="מי שקיבל אותו לא יוכל לפתוח אותו יותר. אפשר ליצור קישור חדש בכל רגע."
        confirmLabel="ביטול הקישור"
        onConfirm={() => revoking && void revoke(revoking)}
        onClose={() => setRevoking(null)}
      />
    </section>
  );
}
