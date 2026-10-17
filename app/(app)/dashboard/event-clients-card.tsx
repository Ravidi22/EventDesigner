"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Mail, MessageCircle, RefreshCw, UserPlus, X } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import {
  emailClientInvite,
  fetchEventClients,
  inviteEventClient,
  regenerateClientInvite,
  removeEventClient,
  type EventClient,
  type ShareResult,
} from "@/lib/client-portal/sharing";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StatusChip } from "@/components/status-chip";
import { TextField } from "@/components/text-field";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Who may see this event in their own portal — the only way an event owner gets an account
// (lib/client-portal/sharing.ts). Mounted with key={event.id} by the drawer.
//
// Crew may not share (the server refuses), so for them the first fetch throws and the card simply
// does not render: they are shown no controls that would answer them with an error.
export function EventClientsCard({ event }: { event: EventSummary }) {
  const [clients, setClients] = useState<EventClient[] | null>(null);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [name, setName] = useState(event.contactName || event.clientName);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The one copy of a just-minted link — the server stored only its hash.
  const [invite, setInvite] = useState<{ userId: string; email: string; url: string } | null>(null);
  const [removing, setRemoving] = useState<EventClient | null>(null);

  useEffect(() => {
    let live = true;
    fetchEventClients(event.id)
      .then((r) => {
        if (!live) return;
        setClients(r.clients);
        setEmailEnabled(r.emailEnabled);
      })
      .catch(() => live && setHidden(true));
    return () => {
      live = false;
    };
  }, [event.id]);

  const show = (result: ShareResult, address: string) => {
    setClients(result.clients);
    if (result.error) return setError(result.error);
    setError(null);
    setInvite(result.link && result.userId ? { userId: result.userId, email: address, url: `${window.location.origin}${result.link}` } : null);
  };

  const submit = async () => {
    const address = email.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) return setError("כתובת אימייל לא תקינה");
    setBusy(true);
    try {
      const result = await inviteEventClient(event.id, name, address);
      show(result, address);
      if (!result.error) {
        setInviting(false);
        setEmail("");
      }
    } catch {
      setError("לא ניתן לשתף כרגע. נסו שוב.");
    }
    setBusy(false);
  };

  const newLink = async (client: EventClient) => {
    show(await regenerateClientInvite(event.id, client.userId), client.email);
  };

  const remove = async () => {
    if (!removing) return;
    setClients(await removeEventClient(event.id, removing.userId));
    if (invite?.userId === removing.userId) setInvite(null);
    setRemoving(null);
  };

  if (hidden || clients === null) return null;

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-muted">גישה לבעלי האירוע</h3>
      <div className="space-y-3 rounded-md border border-border bg-surface p-4 text-sm">
        {clients.length === 0 && !inviting && (
          <p className="text-ink-soft">בעלי האירוע עוד לא קיבלו גישה לראות את הסקיצה והתוכנית.</p>
        )}

        {clients.map((c) => (
          <div key={c.userId} className="flex items-center justify-between gap-2.5">
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{c.name || c.email}</p>
              {c.name && (
                <p className="truncate text-xs text-muted" dir="ltr">
                  {c.email}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <StatusChip tone={c.state === "active" ? "success" : "warn"}>{c.state === "active" ? "נכנסו" : "הוזמנו"}</StatusChip>
              {c.state === "pending" && (
                <Button size="sm" variant="ghost" onClick={() => void newLink(c)} title="קישור חדש (הקודם יפסיק לעבוד)">
                  <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
                  קישור חדש
                </Button>
              )}
              <Button size="sm" variant="danger" onClick={() => setRemoving(c)} aria-label={`הסרת הגישה של ${c.name || c.email}`}>
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </Button>
            </div>
          </div>
        ))}

        {invite && <InviteLinkPanel invite={invite} eventId={event.id} emailEnabled={emailEnabled} onDone={() => setInvite(null)} />}

        {inviting ? (
          <div className="space-y-3 rounded-md border border-inset-border bg-inset p-3">
            <TextField label="שם" value={name} onChange={setName} />
            <TextField
              label="אימייל"
              type="email"
              dir="ltr"
              value={email}
              onChange={(v) => {
                setEmail(v);
                setError(null);
              }}
              placeholder="name@example.com"
              className="text-end"
              error={Boolean(error)}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => void submit()} disabled={busy}>
                <UserPlus className="h-4 w-4" strokeWidth={1.8} />
                {busy ? "משתפים…" : "שיתוף האירוע"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setInviting(false)}>
                ביטול
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setInviting(true)}>
            <UserPlus className="h-4 w-4" strokeWidth={1.8} />
            הזמנת בעלי האירוע
          </Button>
        )}

        {error && <p className="text-xs font-medium text-alert-ink">{error}</p>}
        <p className="text-xs leading-relaxed text-muted">הם רואים את העיצוב בלבד: בלי מחירים, עלויות או נתונים פנימיים של הסטודיו.</p>
      </div>

      <ConfirmDialog
        open={removing !== null}
        title={`להסיר את הגישה של ${removing?.name || removing?.email || ""}?`}
        body="האירוע ייעלם מהאזור האישי שלהם. החשבון שלהם נשאר, ואפשר לשתף שוב בכל רגע."
        confirmLabel="הסרת הגישה"
        onConfirm={() => void remove()}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}

/** The just-minted link and the three ways it actually gets sent. Shown once: it stays until dismissed. */
function InviteLinkPanel({
  invite,
  eventId,
  emailEnabled,
  onDone,
}: {
  invite: { userId: string; email: string; url: string };
  eventId: string;
  emailEnabled: boolean;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [mail, setMail] = useState<"idle" | "sending" | "sent">("idle");
  const [mailError, setMailError] = useState<string | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // The field is selectable text for exactly this case.
    }
  };

  const sendByEmail = async () => {
    setMail("sending");
    setMailError(null);
    const token = new URL(invite.url).pathname.split("/").pop() ?? "";
    const result = await emailClientInvite(eventId, invite.userId, token);
    if ("error" in result) {
      setMail("idle");
      setMailError(result.error);
    } else setMail("sent");
  };

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`פתחנו לכם גישה לסקיצה ולתוכנית של האירוע ב-Eve: ${invite.url}`)}`;

  return (
    <div className="rounded-md border border-accent-line bg-accent-tint/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs leading-relaxed text-ink-soft">
          הקישור מוכן. שלחו אותו ל־<span dir="ltr" className="font-semibold">{invite.email}</span>. הוא תקף שבועיים ומוצג פעם
          אחת בלבד.
        </p>
        <button type="button" onClick={onDone} aria-label="סגירה" className="rounded-pill p-1 text-muted hover:bg-accent-wash hover:text-accent">
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
      <input
        readOnly
        dir="ltr"
        value={invite.url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="קישור ההזמנה"
        className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-start text-xs text-ink-soft"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? <Check className="h-4 w-4 text-success" strokeWidth={2.5} /> : <Copy className="h-4 w-4" strokeWidth={1.8} />}
          {copied ? "הועתק" : "העתקה"}
        </Button>
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-pill bg-accent px-4 text-[13px] font-bold text-canvas transition-colors hover:bg-accent-hover"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={1.8} />
          וואטסאפ
        </a>
        {emailEnabled && (
          <Button
            size="sm"
            variant="outline"
            disabled={mail !== "idle"}
            onClick={() => void sendByEmail()}
            className={mail === "sent" ? "bg-accent-tint" : ""}
          >
            {mail === "sent" ? <Check className="h-4 w-4 text-success" strokeWidth={2.5} /> : <Mail className="h-4 w-4" strokeWidth={1.8} />}
            {mail === "sent" ? "נשלח במייל" : mail === "sending" ? "שולח…" : "שליחה במייל"}
          </Button>
        )}
      </div>
      {mailError && <p className="mt-2 text-xs font-medium text-alert-ink">{mailError}</p>}
    </div>
  );
}
