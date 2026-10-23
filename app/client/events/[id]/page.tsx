import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Box } from "lucide-react";
import { requireClient } from "@/lib/auth/guard";
import { fetchClientSketch } from "@/lib/client-portal/actions";
import { formatEventDate } from "@/lib/events/types";
import { Wordmark } from "@/components/wordmark";
import { NotificationBell } from "@/components/notification-bell";
import { BackToEvents, ClientSketchView } from "./client-sketch";

export const metadata: Metadata = { title: "הסקיצה שלי · Eve" };

// One event, as its client sees it: the facts, the studio, and the sketch they can play with.
//
// Read on the SERVER in one action (fetchClientSketch — the event_clients join is the permission
// check; an event that is not shared with this person is a 404, not an error page that admits it
// exists). The sketch itself is a client component: it is a canvas.
export default async function ClientEventPage({ params }: { params: Promise<{ id: string }> }) {
  await requireClient();
  const { id } = await params;
  const sketch = await fetchClientSketch(id).catch(() => null);
  if (!sketch) notFound();
  const { event, outcome, proposal } = sketch;
  const studio = event.studio;

  return (
    <div dir="rtl" className="flex min-h-dvh flex-col gap-3 bg-bg p-3">
      <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 rounded-md bg-surface px-4 py-2 shadow-floating">
        <BackToEvents />
        <Wordmark tone="mono" className="hidden text-[22px] sm:block" />
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="truncate text-base font-bold text-ink">{event.venueName ?? "האירוע שלכם"}</h1>
          <p className="truncate text-[13px] text-muted">
            {formatEventDate(event.date)}
            {event.time ? ` · ${event.time}` : ""}
            {event.where ? ` · ${event.where}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-end leading-tight md:block">
            <span className="block text-[13px] font-semibold text-ink">{studio.name}</span>
            {studio.phone && (
              <a href={`tel:${studio.phone}`} dir="ltr" className="block text-xs text-muted hover:text-accent">
                {studio.phone}
              </a>
            )}
          </span>
          <Link
            href={`/client/events/${event.id}/scene`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-accent-tint px-3 py-1.5 text-[13px] font-bold text-accent transition-colors hover:bg-accent-wash"
          >
            <Box className="h-4 w-4" strokeWidth={1.75} />
            לראות בתלת-ממד
          </Link>
          <NotificationBell />
        </div>
      </header>

      {/* The designer's last answer — shown while nothing new is open, so it is the first thing a
          client sees after the bell sent them here, and gone once they start the next round. */}
      {outcome && !proposal && (
        <div className="rounded-md bg-success-tint px-4 py-3 text-[13px] leading-relaxed text-ink">
          <span className="font-bold text-success-ink">
            {outcome.accepted === 0
              ? "המעצב השיב על השינויים שהצעתם"
              : outcome.accepted === outcome.total
                ? "המעצב אישר את השינויים שהצעתם"
                : `המעצב אישר ${outcome.accepted} מתוך ${outcome.total} שינויים`}
          </span>
          {outcome.reply && <span className="text-ink-soft"> — {outcome.reply}</span>}
        </div>
      )}

      <ClientSketchView sketch={sketch} />
    </div>
  );
}
