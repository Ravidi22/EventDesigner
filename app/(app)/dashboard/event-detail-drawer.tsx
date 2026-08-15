"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, Calendar, CalendarClock, CheckCircle2, Clock, MapPin, Phone, Plus, User, Users, X } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import { STATUS_LABEL, STATUS_TONE, eventProgress, eventStatus, formatEventDate, zonesLabelOf } from "@/lib/events/types";
import type { Appointment } from "@/lib/appointments/types";
import { APPOINTMENT_KIND_LABEL, appointmentTimeLabel } from "@/lib/appointments/types";
import { useMeetingFlow } from "@/lib/meeting/use-flow";
import { StatusChip } from "@/components/status-chip";
import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/button";

// Same `.drawer` <dialog> pattern as ProductDrawer (catalog/product-drawer.tsx), but deliberately
// anchored to the LEFT and floated off the viewport edges (rounded-md, like the sidebar) rather
// than the flush right-anchored panel that pattern normally uses elsewhere — an explicit request
// for this one surface, not a new default. `inset-inline-end`/`start` are RTL-logical and would
// resolve to the right here (this codebase's `.drawer` convention), so the left edge is pinned
// with a plain physical `left` inline style to guarantee the side regardless of direction.
// `top`/`bottom` are inline styles too, not Tailwind's `top-*`/`bottom-*` classes — a shown
// <dialog> lives in the top layer, and empirically its height doesn't stretch to fill top+bottom
// offsets the way a normal fixed element's would, so the height is computed explicitly instead.
export function EventDetailDrawer({
  event,
  venueName,
  appointments,
  onClose,
  onContinue,
  onOpenAppointment,
  onCreateAppointment,
}: {
  event: EventSummary | null;
  venueName?: string;
  /** Every meeting booked against this event, soonest first. A list, not a date: an event normally
   *  collects several (docs/01 §מצב פגישה), which is why `meetingDate` stopped being a column. */
  appointments: Appointment[];
  onClose: () => void;
  onContinue: (e: EventSummary) => void;
  onOpenAppointment: (a: Appointment) => void;
  onCreateAppointment: (e: EventSummary) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Every hook stays above the `!event` bail-out below — this component renders with a null event
  // whenever the drawer is closed, so a hook called after the early return would appear and
  // disappear with the selection and trip React's "order of Hooks changed" error.
  const flow = useMeetingFlow();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (event && !d.open) d.showModal();
    if (!event && d.open) d.close();
  }, [event]);

  if (!event) return null;

  const status = eventStatus(event, flow);
  const progress = eventProgress(event, flow);
  // The event's zones under the venue that owns them — "חוות רונית אמארה · אולם גדול · חופה".
  const venueZones = venueName ? `${venueName} · ${zonesLabelOf(event)}` : zonesLabelOf(event);

  const go = () => {
    onContinue(event);
    onClose();
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      style={{ left: "8px", right: "auto", top: "4px", bottom: "4px", height: "calc(100dvh - 8px)" }}
      className="drawer fixed m-0 w-full max-w-md overflow-hidden rounded-md bg-bg text-ink shadow-floating"
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
            <div className="h-1.5 overflow-hidden rounded-full border border-border bg-canvas">
              <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold text-muted">פרטי האירוע</h3>
            <div className="space-y-3 rounded-md border border-border bg-surface p-4 text-sm">
              <div className="flex items-center gap-2.5 text-ink-soft">
                <Calendar className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
                <span className="font-medium text-ink">
                  {formatEventDate(event.date)}
                  {event.time && ` · ${event.time}`}
                </span>
              </div>

              <div className="flex items-center gap-2.5 text-ink-soft">
                <MapPin className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
                <span>{venueZones}</span>
              </div>

              <div className="flex items-center gap-2.5 text-ink-soft">
                <Users className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
                <span className="nums">{event.guests || "—"} אורחים</span>
              </div>

              <div className="flex items-center gap-2.5 text-ink-soft">
                <Clock className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
                <span>נוצר בתאריך: {new Date(event.createdAt).toLocaleDateString("he-IL", { day: "numeric", month: "short" })}</span>
              </div>
            </div>
          </div>

          {/* Where a single "פגישה: 1 ביוני" line used to sit, reading a column nothing wrote. The
              whole diary for this event, plus the way to add to it — a second meeting is part of the
              process, not an exception (docs/01 §מצב פגישה). */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted">פגישות</h3>
              <button
                type="button"
                onClick={() => onCreateAppointment(event)}
                className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                קביעת פגישה
              </button>
            </div>
            <div className="rounded-md border border-border bg-surface text-sm">
              {appointments.length === 0 ? (
                <p className="px-4 py-3.5 text-ink-soft">לא נקבעו פגישות לאירוע הזה.</p>
              ) : (
                appointments.map((a, i) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onOpenAppointment(a)}
                    className={
                      "flex w-full items-center gap-2.5 px-4 py-3 text-start transition-colors hover:bg-accent-tint " +
                      (i > 0 ? "border-t border-border-soft" : "")
                    }
                  >
                    {a.done ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
                    ) : (
                      <CalendarClock className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
                    )}
                    <span className={"min-w-0 flex-1 truncate " + (a.done ? "text-muted" : "text-ink")}>
                      {formatEventDate(a.date)}
                      <span className="text-ink-soft"> · {APPOINTMENT_KIND_LABEL[a.kind]}</span>
                    </span>
                    {a.time && (
                      <span className="nums shrink-0 text-xs font-semibold text-ink-soft" dir="ltr">
                        {appointmentTimeLabel(a)}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold text-muted">פרטים ליצירת קשר</h3>
            <div className="space-y-3 rounded-md border border-border bg-surface p-4 text-sm">
              <div className="flex items-center justify-between gap-2.5 text-ink-soft">
                <span className="flex items-center gap-2.5">
                  <User className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
                  <span className="font-medium text-ink">{event.contactName || event.clientName}</span>
                </span>
                {event.phone && (
                  <span className="nums flex items-center gap-1.5" dir="ltr">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={1.75} />
                    {event.phone}
                  </span>
                )}
              </div>

              {(event.contact2Name || event.contact2Phone) && (
                <div className="flex items-center justify-between gap-2.5 border-t border-border-soft pt-3 text-ink-soft">
                  <span className="flex items-center gap-2.5">
                    <User className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
                    <span className="font-medium text-ink">{event.contact2Name || "איש קשר נוסף"}</span>
                  </span>
                  {event.contact2Phone && (
                    <span className="nums flex items-center gap-1.5" dir="ltr">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={1.75} />
                      {event.contact2Phone}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-surface px-5 py-4">
          <Button className="flex-1" onClick={go}>
            מעבר לסקיצה
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          </Button>
          <Button variant="outline" className="flex-1" onClick={go}>
            פרטי האירוע
          </Button>
        </div>
      </div>
    </dialog>
  );
}
