"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { acceptLinkInvite, declineLinkInvite } from "@/lib/event-links/actions";
import type { StudioSideLink } from "@/lib/event-links/types";
import { formatEventDate, type EventSummary } from "@/lib/events/types";
import { Button } from "@/components/button";
import { Select } from "@/components/select";

/** The events an invitation may be linked onto: open ones not already following another hall. */
export function linkCandidates(links: readonly StudioSideLink[], events: readonly EventSummary[]): EventSummary[] {
  const linked = new Set(links.filter((l) => l.state === "active").map((l) => l.studioEventId));
  return events.filter((e) => !e.archived && !linked.has(e.id));
}

/**
 * A venue named this studio the designer of one of its evenings (lib/event-links). Accepting links
 * the evening to an event — a new one opened from the booking, or one the studio already has — and
 * from then on the event follows the hall's date, rooms and head count, and the drawer carries the
 * hall's card. Declining tells the hall.
 *
 * One card per invitation, answered where it is read: it lives in the bell's sheet now (its pinned
 * "דורש פעולה", components/notifications-sheet.tsx) rather than as a strip on the dashboard.
 */
export function InviteCard({
  link,
  candidates,
  ago,
  onAnswered,
}: {
  link: StudioSideLink;
  /** `linkCandidates` — the caller holds the studio's events. */
  candidates: readonly EventSummary[];
  /** When the invitation came — the bell's row knows; the link does not. */
  ago?: string;
  /** After the server has the answer — the caller re-reads what it shows. */
  onAnswered: () => void;
}) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A refusal is thrown (a crew member, an invitation answered on another screen), and production
  // redacts its message — so it is caught and worded here rather than left to the error overlay.
  const answer = async (send: () => Promise<{ error: string } | unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await send();
      if (r && typeof r === "object" && "error" in r) return setError(String(r.error));
      onAnswered();
      router.refresh();
    } catch {
      setError("לא הצלחנו לשמור את התשובה — נסו שוב");
    } finally {
      setBusy(false);
    }
  };
  const accept = () => answer(() => acceptLinkInvite(link.id, target || null));
  const decline = () => answer(() => declineLinkInvite(link.id));

  const host = link.hostName || link.venueName;
  const facts = [
    link.clientName,
    link.date ? formatEventDate(link.date) : "ללא תאריך",
    link.venueName,
    link.guests > 0 ? `${link.guests} איש` : "",
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-accent-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-accent-tint text-accent">
          <Building2 className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          {/* The plural is the neutral form, and it speaks for a business too. */}
          <p className="text-sm font-semibold leading-snug text-ink">{host ? `${host} הזמינו אתכם לעצב אירוע` : "הזמנה לעצב אירוע"}</p>
          <p className="mt-0.5 text-xs text-muted">{facts.join(" · ")}</p>
        </div>
        {ago && <span className="nums whitespace-nowrap text-xs text-muted">{ago}</span>}
      </div>
      <div className="flex flex-col gap-1.5 rounded-sm border border-inset-border bg-inset px-3 py-2.5">
        <span className="text-xs font-medium text-ink-soft" aria-hidden>
          לקשר ל־
        </span>
        <Select
          aria-label="לקשר לאירוע"
          value={target}
          onChange={setTarget}
          options={[
            { value: "", label: "אירוע חדש מהאולם" },
            ...candidates.map((e) => ({ value: e.id, label: `${e.clientName}${e.date ? ` · ${formatEventDate(e.date)}` : ""}` })),
          ]}
          className="w-full"
        />
        <span className="text-xs leading-normal text-muted">מעכשיו האירוע עוקב אחרי התאריך, האזורים והאורחים של האולם.</span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy} onClick={() => void accept()}>
          אישור וקישור
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void decline()}>
          דחייה
        </Button>
      </div>
      {error && <p className="text-xs text-alert-ink">{error}</p>}
    </div>
  );
}

/** The old dashboard strip — every pending invitation as a card. Kept for any caller still on it;
 *  the dashboard itself reads them from the bell now. */
export function VenueInvites({
  links,
  events,
  onChanged,
}: {
  links: StudioSideLink[];
  events: EventSummary[];
  onChanged: () => void;
}) {
  const pending = links.filter((l) => l.state === "pending");
  if (pending.length === 0) return null;
  const candidates = linkCandidates(links, events);
  return (
    <section className="mb-6 space-y-2">
      {pending.map((l) => (
        <InviteCard key={l.id} link={l} candidates={candidates} onAnswered={onChanged} />
      ))}
    </section>
  );
}
