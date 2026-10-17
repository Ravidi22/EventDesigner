"use client";
// "שיתוף עם הלקוח" — who may open this event's sketch from their own phone, and the link that gets
// them there (lib/events/client-actions.ts; the client's side is /client/events/<id>).
//
// No email exists yet, so a new client gets an invitation LINK, shown once, to copy or send over
// WhatsApp — to the event's own phone number when it has one — exactly as a studio member's
// invitation works (app/(app)/settings/team-section.tsx). A client who already has an account just
// gains the event and hears about it on their bell.
//
// Each person is an editor (proposes changes to the sketch) or a viewer (looks only — the parent
// paying for it). Row actions sit behind the card's "…" (components/menu.tsx), and taking access
// back asks first (components/confirm-dialog.tsx), like every other removal.
import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, MessageCircle, Share2, UserMinus } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import {
  fetchEventClients,
  regenerateClientInvite,
  setEventClientRole,
  shareEventWithClient,
  unshareEventClient,
  type EventClientRow,
} from "@/lib/events/client-actions";
import type { ClientRole } from "@/lib/client-portal/types";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { Switch } from "@/components/toggle";
import { Menu } from "@/components/menu";
import { CloseButton } from "@/components/close-button";
import { ConfirmDialog } from "@/components/confirm-dialog";

/** wa.me wants the number in international form, digits only: 050-1234567 → 972501234567. */
function waNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

export function ClientAccessCard({ event }: { event: EventSummary }) {
  const [clients, setClients] = useState<EventClientRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(event.contactName || event.clientName);
  const [email, setEmail] = useState("");
  const [editor, setEditor] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<{ url: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<EventClientRow | null>(null);

  useEffect(() => {
    let live = true;
    fetchEventClients(event.id)
      .then((list) => {
        if (live) setClients(list);
      })
      .catch(() => {
        if (live) setClients([]);
      });
    return () => {
      live = false;
    };
  }, [event.id]);

  const share = async () => {
    setBusy(true);
    setError(null);
    try {
      const role: ClientRole = editor ? "editor" : "viewer";
      const r = await shareEventWithClient(event.id, { name, email, role });
      setClients(r.clients);
      if (r.error) return setError(r.error);
      setAdding(false);
      setEmail("");
      if (r.link) setInvite({ url: `${window.location.origin}${r.link}`, name: name.trim() || email });
    } finally {
      setBusy(false);
    }
  };

  const reissue = async (row: EventClientRow) => {
    const r = await regenerateClientInvite(event.id, row.userId);
    setClients(r.clients);
    if (r.error) setError(r.error);
    else if (r.link) setInvite({ url: `${window.location.origin}${r.link}`, name: row.name || row.email });
  };

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-muted">שיתוף עם הלקוח</h3>
      <div className="rounded-md border border-border bg-surface p-4 text-sm">
        {invite && <InviteLink invite={invite} phone={event.phone} onDone={() => setInvite(null)} />}

        {clients === null ? (
          <p className="text-[13px] text-muted">טוען…</p>
        ) : clients.length === 0 && !adding ? (
          <p className="text-[13px] leading-relaxed text-ink-soft">
            הלקוח יוכל לראות את הסקיצה מהטלפון, להזיז ולהוסיף שולחנות ולשלוח לכם את השינויים לאישור. שום דבר לא משתנה בסקיצה שלכם בלי שתאשרו.
          </p>
        ) : (
          <ul className="flex flex-col">
            {clients.map((c) => (
              <li key={c.userId} className="flex items-center gap-3 border-b border-border-soft py-2.5 first:pt-0 last:border-b-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{c.name || c.email}</span>
                  <span className="block truncate text-xs text-muted">
                    {c.joined ? "נכנס/ה לחשבון" : "הוזמן/ה — עוד לא נכנס/ה"} · {c.role === "editor" ? "יכול/ה להציע שינויים" : "צפייה בלבד"}
                  </span>
                </span>
                <Menu
                  label={`אפשרויות ל${c.name || c.email}`}
                  items={[
                    {
                      label: c.role === "editor" ? "צפייה בלבד" : "לאפשר הצעת שינויים",
                      icon: Share2,
                      onSelect: () => void setEventClientRole(event.id, c.userId, c.role === "editor" ? "viewer" : "editor").then(setClients),
                    },
                    ...(!c.joined ? [{ label: "קישור הזמנה חדש", icon: KeyRound, onSelect: () => void reissue(c) }] : []),
                    { label: "הסרת הגישה", icon: UserMinus, danger: true, onSelect: () => setRemoving(c) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <div className="mt-3 flex flex-col gap-3 border-t border-border-soft pt-3">
            <TextField id="client-share-name" label="שם" value={name} onChange={setName} autoComplete="off" />
            <TextField id="client-share-email" label="אימייל" type="email" dir="ltr" value={email} onChange={setEmail} placeholder="name@example.com" autoComplete="off" />
            <Switch checked={editor} onChange={setEditor} label="יכול/ה להציע שינויים בסקיצה" />
            {error && <p className="text-[13px] font-semibold text-alert-ink">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void share()} disabled={busy || !email.trim()} className="flex-1">
                שיתוף האירוע
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
                ביטול
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="mt-3 w-full">
            {clients && clients.length > 0 ? "+ שיתוף עם עוד מישהו" : "שיתוף הסקיצה עם הלקוח"}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={removing !== null}
        title="להסיר את הגישה?"
        body={removing ? `${removing.name || removing.email} לא יוכל/תוכל יותר לראות את האירוע הזה. החשבון שלהם נשאר.` : undefined}
        confirmLabel="הסרת הגישה"
        onConfirm={() => {
          const row = removing;
          setRemoving(null);
          if (row) void unshareEventClient(event.id, row.userId).then(setClients);
        }}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}

function InviteLink({ invite, phone, onDone }: { invite: { url: string; name: string }; phone: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Refused clipboard (an insecure origin): the field below is selectable for exactly this.
    }
  };
  const to = waNumber(phone);
  const text = `היי ${invite.name}, הסקיצה של האירוע שלכם מחכה לכם — אפשר לראות אותה, להזיז שולחנות ולשלוח לנו שינויים: ${invite.url}`;
  const whatsapp = `https://wa.me/${to ?? ""}?text=${encodeURIComponent(text)}`;
  return (
    <div className="mb-3 rounded-md border border-accent-line bg-accent-tint/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] leading-relaxed text-ink-soft">
          <span className="font-bold text-ink">הקישור מוכן.</span> הוא תקף שבועיים ומוצג פעם אחת — אם יאבד, אפשר להנפיק חדש מה״…״ שבשורה.
        </p>
        <CloseButton label="סגירה" onClick={onDone} />
      </div>
      <input
        readOnly
        dir="ltr"
        value={invite.url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="קישור ההזמנה"
        className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-start text-xs text-ink-soft"
      />
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => void copy()} className="flex-1">
          {copied ? <Check className="h-4 w-4 text-success" strokeWidth={2.5} /> : <Copy className="h-4 w-4" strokeWidth={1.8} />}
          {copied ? "הועתק" : "העתקה"}
        </Button>
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-pill bg-accent px-4 py-2 text-[13px] font-bold text-canvas transition-colors hover:bg-accent-hover"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={1.8} />
          {to ? "לוואטסאפ של הלקוח" : "וואטסאפ"}
        </a>
      </div>
    </div>
  );
}
