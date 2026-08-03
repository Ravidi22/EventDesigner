"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, Calendar, CalendarClock, MapPin, Phone, Users, X } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import { STATUS_LABEL, STATUS_TONE, eventProgress, eventStatus, formatEventDate } from "@/lib/events/types";
import { StatusChip } from "@/components/status-chip";
import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/button";

// Same `.drawer` <dialog> pattern as ProductDrawer (catalog/product-drawer.tsx), but deliberately
// anchored to the LEFT and floated off the viewport edges (rounded-md, like the sidebar) rather
// than the flush right-anchored panel that pattern normally uses elsewhere — an explicit request
// for this one surface, not a new default. `inset-inline-end`/`start` are RTL-logical and would
// resolve to the right here (this codebase's `.drawer` convention), so the left edge is pinned
// with a plain physical `left` inline style to guarantee the side regardless of direction.
// "המשך פגישה" is the one path onward, into the real guided flow.
export function EventDetailDrawer({
  event,
  onClose,
  onContinue,
}: {
  event: EventSummary | null;
  onClose: () => void;
  onContinue: (e: EventSummary) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (event && !d.open) d.showModal();
    if (!event && d.open) d.close();
  }, [event]);

  if (!event) return null;

  const status = eventStatus(event);
  const progress = eventProgress(event);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      style={{ left: "12px", right: "auto" }}
      className="drawer fixed top-3 bottom-3 m-0 w-full max-w-md overflow-hidden rounded-md bg-bg text-ink shadow-floating"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-border bg-surface px-5 py-3.5">
          <h2 className="text-base font-semibold">{event.clientName}</h2>
          <IconButton label="סגירה" onClick={onClose}>
            <X className="h-5 w-5" strokeWidth={2} />
          </IconButton>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="flex items-center justify-between">
            <StatusChip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusChip>
            <span className="nums text-sm font-semibold text-ink-soft">{progress}%</span>
          </div>

          <div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border-soft">
              <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-border bg-surface p-4 text-sm">
            <div className="flex items-center gap-2.5 text-ink-soft">
              <MapPin className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
              <span className="font-medium text-ink">{event.hallName}</span>
            </div>

            <div className="flex items-center gap-2.5 text-ink-soft">
              <Calendar className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
              <span>
                {formatEventDate(event.date)}
                {event.time && ` · ${event.time}`}
              </span>
            </div>

            {event.meetingDate && (
              <div className="flex items-center gap-2.5 text-ink-soft">
                <CalendarClock className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
                <span>פגישה: {formatEventDate(event.meetingDate)}</span>
              </div>
            )}

            <div className="flex items-center gap-2.5 text-ink-soft">
              <Users className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
              <span className="nums">{event.guests || "—"} אורחים</span>
            </div>

            {event.phone && (
              <div className="flex items-center gap-2.5 text-ink-soft">
                <Phone className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
                <span className="nums" dir="ltr">
                  {event.phone}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border bg-surface px-5 py-4">
          <Button
            className="w-full"
            onClick={() => {
              onContinue(event);
              onClose();
            }}
          >
            המשך פגישה
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          </Button>
        </div>
      </div>
    </dialog>
  );
}
