"use client";

import { ArrowLeft, Calendar, CheckCircle2, Clock, MapPin, PenTool, Phone, Plus, Printer, Trash2, User, Users } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import { STATUS_LABEL, STATUS_TONE, eventProgress, eventStatus, formatEventDate, zonesLabelOf } from "@/lib/events/types";
import { stepAt } from "@/lib/meeting/steps";
import type { Appointment } from "@/lib/appointments/types";
import { APPOINTMENT_KIND_LABEL, appointmentTimeLabel } from "@/lib/appointments/types";
import { useMeetingFlow } from "@/lib/meeting/use-flow";
import { StatusChip } from "@/components/status-chip";
import { Drawer } from "@/components/drawer";
import { Button } from "@/components/button";
import { Menu } from "@/components/menu";
import { KIND_ICON, kindTheme } from "./dashboard-view-utils";
import { EventBookingCard } from "./event-booking-card";

// The shell — the floating left-anchored <dialog>, its header and its one scrollbar — is
// components/drawer.tsx now, shared with the catalog's product form. The geometry notes that used
// to sit here live in that file; what stays here is what this drawer is ABOUT.
export function EventDetailDrawer({
  event,
  venueName,
  appointments,
  onClose,
  onContinue,
  onOpenAppointment,
  onCreateAppointment,
  onDelete,
  onEventChanged,
}: {
  event: EventSummary | null;
  venueName?: string;
  /** Every meeting booked against this event, soonest first. A list, not a date: an event normally
   *  collects several (docs/01 §מצב פגישה), which is why `meetingDate` stopped being a column. */
  appointments: Appointment[];
  onClose: () => void;
  /** Opens the event on one of its own surfaces — the meeting flow by default, the print
   *  screen when the footer asks for it. Both need the same "this device has this event open"
   *  pointer set first, so it is one prop with a destination, not two. */
  onContinue: (e: EventSummary, to?: "/meeting" | "/outputs" | "/studio") => void;
  onOpenAppointment: (a: Appointment) => void;
  onCreateAppointment: (e: EventSummary) => void;
  /** Asks the screen to delete this event. The QUESTION is not asked here — the drawer hands the
   *  event over and closes, and the screen's own ConfirmDialog is what appears, exactly as the
   *  catalog's edit drawer hands its מחיקה to the catalog screen. One dialog per surface, so the
   *  same delete cannot be worded two ways. */
  onDelete: (e: EventSummary) => void;
  /** The client answered. The card writes `confirmedAt` itself and shows it immediately; this asks
   *  the screen to re-read the list, so the calendar and the statistics agree with the drawer. */
  onEventChanged: () => void;
}) {
  // Every hook stays above the `!event` bail-out below — this component renders with a null event
  // whenever the drawer is closed, so a hook called after the early return would appear and
  // disappear with the selection and trip React's "order of Hooks changed" error.
  const flow = useMeetingFlow();

  if (!event) return null;

  const status = eventStatus(event, flow);
  const progress = eventProgress(event, flow);
  // The stage the event is actually parked on, so the primary action can NAME where it resumes.
  // "מעבר לסקיצה" was a promise the button could not keep — it went to /meeting, which lands on
  // whatever stage this event left off at, and for a fresh one that is the details form.
  const resumeAt = stepAt(flow, event.step);
  // The event's zones under the venue that owns them — "חוות רונית אמארה · אולם גדול · חופה".
  const venueZones = venueName ? `${venueName} · ${zonesLabelOf(event)}` : zonesLabelOf(event);

  const go = (to?: "/meeting" | "/outputs" | "/studio") => {
    onContinue(event, to);
    onClose();
  };

  return (
    <Drawer
      title={event.clientName}
      onClose={onClose}
      // The rest of what you can do to an event, folded behind the one trigger this codebase uses
      // everywhere else for exactly that (components/menu.tsx). The studio is here rather than
      // beside the two buttons below because it is the THIRD destination — redrawing a plan between
      // meetings, which is not what this drawer gets opened for. מחיקה is `danger`, and the drawer
      // closes on the way out: the question belongs to the screen, which owns the one dialog.
      actions={
        <Menu
          label={`אפשרויות לאירוע של ${event.clientName}`}
          items={[
            { label: "פתיחה בסטודיו", icon: PenTool, onSelect: () => go("/studio") },
            {
              label: "מחיקת האירוע",
              icon: Trash2,
              danger: true,
              onSelect: () => {
                onDelete(event);
                onClose();
              },
            },
          ]}
        />
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* ⚠ THE ACTIONS ARE AT THE TOP, and inside the progress card rather than under the
              panel. They were a footer of three buttons pinned below a scrolling body, which put the
              two things a designer opens this drawer to DO underneath the client's phone number and
              read as chrome. Here they finish the sentence the card starts: this event is 60%
              through and parked on the design sketch — continue it, or print its sheets. */}
          <div className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <StatusChip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusChip>
              <span className="nums text-sm font-semibold text-ink-soft">{progress}%</span>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full border border-border bg-canvas">
              <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
            </div>

            <div className="mt-4 flex items-center gap-2">
              {/* Names where it lands. "מעבר לסקיצה" was a promise this button could not keep: it
                  goes to /meeting, which resumes at whatever stage the event was left on — the
                  details form, for one nobody has drawn yet. */}
              <Button className="min-w-0 flex-1" onClick={() => go()}>
                <span className="truncate">{event.step === 0 ? "התחלת פגישה" : `המשך · ${resumeAt.label}`}</span>
                <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2.5} />
              </Button>
              {/* Outputs in its OWN frame, not the meeting's closing stage. A designer preparing a
                  crew's sheets the week before is not running a meeting, and routing them through
                  the client-facing stepper to reach a packing list is the same mistake in the other
                  direction. Same screen either way — see app/(app)/outputs/outputs-screen.tsx. */}
              <Button variant="outline" className="shrink-0" onClick={() => go("/outputs")}>
                <Printer className="h-4 w-4" strokeWidth={2} />
                פלטים
              </Button>
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
                // Same glyph and same ink the day cell gives this kind (KIND_CARD_THEME) — the
                // colour has to mean one thing in both places or it teaches nothing. There is no
                // tint fill here: these rows are a list on white, and eight fills stacked in a
                // hairline-ruled table is a paint chart, not a diary.
                appointments.map((a, i) => {
                  const theme = kindTheme(a.kind, a.done);
                  const KindIcon = a.done ? CheckCircle2 : KIND_ICON[a.kind];
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onOpenAppointment(a)}
                      className={
                        "flex w-full items-center gap-2.5 px-4 py-3 text-start transition-colors hover:bg-accent-tint " +
                        (i > 0 ? "border-t border-border-soft" : "")
                      }
                    >
                      <KindIcon className={"h-4 w-4 shrink-0 " + theme.text} strokeWidth={1.75} />
                      <span className={"min-w-0 flex-1 truncate " + (a.done ? "text-muted" : "text-ink")}>
                        {formatEventDate(a.date)}
                        <span className={"font-medium " + theme.text}> · {APPOINTMENT_KIND_LABEL[a.kind]}</span>
                      </span>
                      {a.time && (
                        <span className="nums shrink-0 text-xs font-semibold text-ink-soft" dir="ltr">
                          {appointmentTimeLabel(a)}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <EventBookingCard key={event.id} event={event} onConfirmed={onEventChanged} />

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

      </div>
    </Drawer>
  );
}
