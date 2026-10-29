"use client";

import type { ReactNode } from "react";
import { ArrowLeft, CheckCircle2, PenTool, Pencil, Phone, Plus, Printer, Trash2, User } from "lucide-react";
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
import { DrawerSection, SectionAction } from "./drawer-section";
import { EventBookingCard } from "./event-booking-card";
import { ClientAccessCard } from "./client-access-card";
import { ProductionSection } from "./production-section";

// The shell — the floating left-anchored <dialog>, its header and its one scrollbar — is
// components/drawer.tsx, shared with the catalog's product form. What stays here is what this
// drawer is ABOUT, in the order an event happens:
//
//   where it stands and the way on   (status, the meeting to continue, its studio and outputs)
//   the brief                         (פרטי האירוע — everything the details form asks — and who to call)
//   the sittings                      (פגישות)
//   the client's side                 (the sketch shared with them, then the quote and their yes)
//
// It used to run status → details → meetings → quote → sharing → contacts: the phone number last,
// the sketch the client looks at AFTER the quote they agree to, and no way to fix a detail without
// walking into the client-facing stepper. The details are edited in place now (onEdit), and each
// section is the same DrawerSection.
export function EventDetailDrawer({
  event,
  venueName,
  appointments,
  onClose,
  onContinue,
  onEdit,
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
  /** Opens the event on one of its own surfaces — the meeting flow by default, its studio or its
   *  outputs from the two buttons beside it. All three need the same "this device has this event
   *  open" pointer set first, so it is one prop with a destination. */
  onContinue: (e: EventSummary, to?: "/meeting" | "/outputs" | "/studio") => void;
  /** Opens the details form on this event (the screen's EventDialog), over the drawer. */
  onEdit: (e: EventSummary) => void;
  onOpenAppointment: (a: Appointment) => void;
  onCreateAppointment: (e: EventSummary) => void;
  /** Asks the screen to delete this event. The QUESTION is the screen's (one ConfirmDialog per
   *  surface), and it opens OVER the drawer — the drawer leaves when the event does, so answering
   *  "ביטול" leaves you where you were. */
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
  // The meeting's progress means something while the event is being SOLD. Once the client has
  // answered (or it is archived) the chip says the thing that matters, and "מאושר · 50%" said two
  // contradicting things at once.
  const selling = status !== "confirmed" && status !== "lost" && status !== "archived";
  const progress = eventProgress(event, flow);
  // The stage the event is actually parked on, so the primary action can NAME where it resumes.
  const resumeAt = stepAt(flow, event.step);
  // The event's zones under the venue that owns them — "חוות רונית אמארה · אולם גדול · חופה".
  const venueZones = venueName ? `${venueName} · ${zonesLabelOf(event)}` : zonesLabelOf(event);

  const go = (to?: "/meeting" | "/outputs" | "/studio") => {
    onContinue(event, to);
    onClose();
  };

  const contacts = [
    { name: event.contactName || event.clientName, phone: event.phone },
    ...(event.contact2Name || event.contact2Phone ? [{ name: event.contact2Name || "איש קשר נוסף", phone: event.contact2Phone ?? "" }] : []),
  ];

  return (
    <Drawer
      title={event.clientName}
      onClose={onClose}
      // What you do TO the event, behind the one trigger this codebase uses for it everywhere
      // (components/menu.tsx). Where you GO with it is on the card below, in plain sight.
      actions={
        <Menu
          label={`אפשרויות לאירוע של ${event.clientName}`}
          items={[
            { label: "עריכת פרטי האירוע", icon: Pencil, onSelect: () => onEdit(event) },
            { label: "מחיקת האירוע", icon: Trash2, danger: true, onSelect: () => onDelete(event) },
          ]}
        />
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Where it stands, and the way on. The meeting is the one filled button; the event's two
              working screens sit under it as equals — the studio used to be hidden in the "…" while
              the outputs had a button. */}
          <div className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <StatusChip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusChip>
              {selling && <span className="nums text-sm font-semibold text-ink-soft">{progress}%</span>}
            </div>

            {selling && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full border border-border bg-canvas">
                <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
              </div>
            )}

            {/* Names where it lands: /meeting resumes at whatever stage the event was left on. */}
            <Button className="mt-4 w-full" onClick={() => go()}>
              <span className="truncate">{event.step === 0 ? "התחלת פגישה" : `המשך · ${resumeAt.label}`}</span>
              <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            </Button>
            {/* The event's own frames, not the meeting's stages — a designer redrawing between
                sittings or preparing the crew's sheets is not running a meeting. */}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => go("/studio")}>
                <PenTool className="h-4 w-4" strokeWidth={2} />
                סטודיו
              </Button>
              <Button variant="outline" onClick={() => go("/outputs")}>
                <Printer className="h-4 w-4" strokeWidth={2} />
                פלטים
              </Button>
            </div>
          </div>

          {/* Once the client has said yes the event is being PRODUCED, and that is the first thing
              to read about it: the crew, the equipment, the suppliers' answers, the printed sheets
              (./production-section.tsx). Before the yes the drawer is about selling, and the
              booking card at the foot is where the yes is recorded. */}
          {status === "confirmed" && <ProductionSection key={`production-${event.id}`} event={event} onChanged={onEventChanged} />}

          {/* Everything the details form asks, read back with its own words — the form's סוג, יום
              ההקמה and גוונים were never shown here, and the event's created-at was (it moved to the
              foot of the drawer, where record-keeping goes). */}
          <DrawerSection
            title="פרטי האירוע"
            action={
              <SectionAction icon={Pencil} onClick={() => onEdit(event)}>
                עריכה
              </SectionAction>
            }
          >
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Fact label="תאריך">
                {formatEventDate(event.date)}
                {event.time && <span className="nums"> · {event.time}</span>}
              </Fact>
              <Fact label="יום ההקמה">{event.setupDate ? formatEventDate(event.setupDate) : "ביום האירוע"}</Fact>
              <Fact label="מקום" wide>
                {venueZones}
              </Fact>
              <Fact label="סוג האירוע">{event.eventType || "לא צוין"}</Fact>
              <Fact label="אורחים">
                <span className="nums">{event.guests || "—"}</span>
              </Fact>
              {!!event.shades?.length && (
                <Fact label="גווני האירוע" wide>
                  {event.shades.join(" · ")}
                </Fact>
              )}
            </dl>
          </DrawerSection>

          <DrawerSection title="אנשי קשר">
            <ul className="space-y-3">
              {contacts.map((c, i) => (
                <li
                  key={i}
                  className={"flex items-center justify-between gap-2.5 " + (i > 0 ? "border-t border-border-soft pt-3" : "")}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <User className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
                    <span className="truncate font-medium text-ink">{c.name}</span>
                  </span>
                  {/* A link: the drawer is opened to make exactly this call, often from a phone. */}
                  {c.phone && (
                    <a
                      href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}
                      dir="ltr"
                      className="nums flex shrink-0 items-center gap-1.5 rounded-sm px-1 text-ink-soft transition-colors hover:text-accent-hover"
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={1.75} />
                      {c.phone}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </DrawerSection>

          {/* The whole diary for this event, plus the way to add to it — a second meeting is part of
              the process, not an exception (docs/01 §מצב פגישה). */}
          <DrawerSection
            title="פגישות"
            flush
            action={
              <SectionAction icon={Plus} onClick={() => onCreateAppointment(event)}>
                קביעת פגישה
              </SectionAction>
            }
          >
            {appointments.length === 0 ? (
              <p className="px-4 py-3.5 text-ink-soft">לא נקבעו פגישות לאירוע הזה.</p>
            ) : (
              // Same glyph and same ink the day cell gives this kind (KIND_CARD_THEME) — the colour
              // has to mean one thing in both places or it teaches nothing.
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
          </DrawerSection>

          {/* The client's side, in the order it happens: they see the sketch, then the price, then
              they say yes. */}
          <ClientAccessCard key={`clients-${event.id}`} event={event} />

          <EventBookingCard key={event.id} event={event} onConfirmed={onEventChanged} />

          <p className="nums text-center text-caption text-faint">
            נוצר ב־{new Date(event.createdAt).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
      </div>
    </Drawer>
  );
}

/** One fact of the brief: its name over its value. */
function Fact({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={"min-w-0 " + (wide ? "col-span-2" : "")}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{children}</dd>
    </div>
  );
}
