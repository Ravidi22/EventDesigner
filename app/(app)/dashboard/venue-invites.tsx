"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { acceptLinkInvite, declineLinkInvite } from "@/lib/event-links/actions";
import type { StudioSideLink } from "@/lib/event-links/types";
import { formatEventDate, type EventSummary } from "@/lib/events/types";
import { Button } from "@/components/button";
import { Select } from "@/components/select";

/**
 * A venue named this studio the designer of one of its evenings (lib/event-links). Accepting links
 * the evening to an event — a new one opened from the booking, or one the studio already has — and
 * from then on the event follows the hall's date, rooms and head count, and the drawer carries the
 * hall's card. Declining tells the hall.
 */
export function VenueInvites({
  links,
  events,
  onChanged,
}: {
  links: StudioSideLink[];
  events: EventSummary[];
  onChanged: () => void;
}) {
  const router = useRouter();
  const pending = links.filter((l) => l.state === "pending");
  const linked = new Set(links.filter((l) => l.state === "active").map((l) => l.studioEventId));
  const [target, setTarget] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (pending.length === 0) return null;

  const candidates = events.filter((e) => !e.archived && !linked.has(e.id));

  const accept = async (l: StudioSideLink) => {
    setBusy(l.id);
    setError(null);
    try {
      const r = await acceptLinkInvite(l.id, target[l.id] || null);
      if ("error" in r) return setError(r.error);
      onChanged();
      router.refresh();
    } finally {
      setBusy(null);
    }
  };
  const decline = async (l: StudioSideLink) => {
    setBusy(l.id);
    try {
      await declineLinkInvite(l.id);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mb-6 space-y-2">
      {pending.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-md border border-accent-line bg-accent-tint px-4 py-3">
          <Building2 className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.6} />
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink">
            <span className="font-bold">{l.hostName || l.venueName}</span> הזמין אתכם לעצב את האירוע של{" "}
            <span className="font-bold">{l.clientName}</span>
            <span className="text-ink-soft">
              {" · "}
              {l.date ? formatEventDate(l.date) : "ללא תאריך"}
              {l.venueName && ` · ${l.venueName}`}
              {l.zonesLabel && ` · ${l.zonesLabel}`}
              {l.guests > 0 && ` · ${l.guests} איש`}
            </span>
          </p>
          <Select
            value={target[l.id] ?? ""}
            onChange={(v) => setTarget((t) => ({ ...t, [l.id]: v }))}
            options={[{ value: "", label: "אירוע חדש מהאולם" }, ...candidates.map((e) => ({ value: e.id, label: `${e.clientName}${e.date ? ` · ${formatEventDate(e.date)}` : ""}` }))]}
            className="w-56"
          />
          <Button size="sm" disabled={busy === l.id} onClick={() => void accept(l)}>
            אישור וקישור
          </Button>
          <Button size="sm" variant="ghost" disabled={busy === l.id} onClick={() => void decline(l)}>
            דחייה
          </Button>
        </div>
      ))}
      {error && <p className="text-sm text-alert">{error}</p>}
    </section>
  );
}
