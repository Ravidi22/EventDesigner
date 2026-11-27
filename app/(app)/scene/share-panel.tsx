"use client";

import { useEffect, useState } from "react";
import { Check, Copy, MessageCircle, Trash2 } from "lucide-react";
import { fetchSceneLinks, mintSceneLink, revokeSceneLink, type SceneLinkRow } from "@/lib/scene/actions";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

// The no-login link to the event in 3D (spec §6.4, F-9.2): the designer mints it, sends it to the
// couple (who forward it to family), sees whether it was opened, and takes it back. One live link
// per event — a new one revokes the last (DECIDE 4), which is also how a link sent to the wrong
// number is taken back. The token is shown ONCE, in the minute after minting; only its hash is kept.
//
// Since the "Outputs and 3D Drawers" board (2026-11-11) the link is read by two places at once: the
// end panel's "קישור ללקוח" group and the panel's FOOT (its status line and the CTA, kept when the
// panel is put away) — so the state is a hook the screen holds, and the group is drawn from it.

/** wa.me wants the number in international form, digits only: 050-1234567 → 972501234567. */
function waNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

export const dateOf = (iso: string) => new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "2-digit" });

export function useSceneLink(eventId: string | null) {
  const [links, setLinks] = useState<SceneLinkRow[] | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linksOf, setLinksOf] = useState(eventId);
  if (linksOf !== eventId) {
    setLinksOf(eventId);
    setLinks(null);
    setFresh(null);
  }

  useEffect(() => {
    if (!eventId) return;
    let live = true;
    fetchSceneLinks(eventId)
      .then((l) => live && setLinks(l))
      .catch(() => live && setError("לא הצלחנו לקרוא את הקישורים"));
    return () => {
      live = false;
    };
  }, [eventId]);

  const mint = async () => {
    if (!eventId) return;
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
    if (!eventId) return;
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

  const current = links?.find((l) => l.live) ?? null;
  return { links, current, fresh, busy, error, mint, revoke, ready: links !== null };
}
export type SceneLink = ReturnType<typeof useSceneLink>;

/** What the link's group summary and the foot's line say. */
export function linkStatus(link: SceneLink): string {
  if (!link.ready) return "…";
  if (link.fresh) return "קישור חדש מוכן";
  if (!link.current) return "אין קישור פעיל";
  const opened = link.current.openedCount ? `נפתח ${link.current.openedCount} פעמים` : "עוד לא נפתח";
  return `קישור פעיל · ${opened}`;
}

/** The "קישור ללקוח" group's body. */
export function ShareLink({ link, clientName, phone }: { link: SceneLink; clientName: string; phone: string }) {
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<SceneLinkRow | null>(null);
  const { fresh, current, busy, error } = link;

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
    <div className="flex flex-col gap-2.5">
      {fresh ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] leading-relaxed text-ink-soft">
            <span className="font-bold text-ink">הקישור מוכן.</span> מוצג פעם אחת — העתיקו או שלחו עכשיו.
          </p>
          <input
            readOnly
            dir="ltr"
            value={fresh}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="הקישור לתלת-ממד"
            className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-start text-xs text-ink-soft"
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
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-pill border-[1.5px] border-accent-line text-[13px] font-bold text-accent transition-colors hover:bg-accent-tint"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={1.8} />
              וואטסאפ
            </a>
          </div>
        </div>
      ) : current ? (
        <div className="flex items-center gap-2 rounded-md border border-inset-border bg-inset px-2.5 py-2">
          <span className="min-w-0 flex-1 leading-snug">
            <span className="nums block text-[13px] font-semibold text-ink">פעיל עד {dateOf(current.expiresAt)}</span>
            <span className="nums block text-xs text-muted">{current.openedCount ? `נפתח ${current.openedCount} פעמים` : "עוד לא נפתח"}</span>
          </span>
          <button
            type="button"
            onClick={() => setRevoking(current)}
            className="rounded-sm p-1 text-alert-ink transition-colors hover:bg-alert-tint"
            title="ביטול הקישור"
            aria-label="ביטול הקישור"
            disabled={busy}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
      ) : null}
      <p className="text-xs leading-relaxed text-muted">קישור צפייה בלי סיסמה, תקף 30 יום — הלקוח רואה רק את נקודות המבט והסיור שהכנתם, בלי מחירים. קישור חדש מבטל את הקודם.</p>
      {current && !fresh && (
        <Button size="sm" variant="outline" className="w-full" onClick={() => void link.mint()} disabled={busy}>
          קישור חדש (מבטל את הקודם)
        </Button>
      )}
      {error && <p className="text-[13px] text-alert-ink">{error}</p>}

      <ConfirmDialog
        open={!!revoking}
        title="לבטל את הקישור?"
        body="מי שקיבל אותו לא יוכל לפתוח אותו יותר. אפשר ליצור קישור חדש בכל רגע."
        confirmLabel="ביטול הקישור"
        onConfirm={() => {
          if (revoking) void link.revoke(revoking);
          setRevoking(null);
        }}
        onClose={() => setRevoking(null)}
      />
    </div>
  );
}
