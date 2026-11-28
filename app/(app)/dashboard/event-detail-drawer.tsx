"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Box,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  HandCoins,
  PenTool,
  Pencil,
  Phone,
  Plus,
  Printer,
  ReceiptText,
  Share2,
  Trash2,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import { STATUS_LABEL, STATUS_TONE, eventProgress, eventStatus, formatEventDate, zonesLabelOf } from "@/lib/events/types";
import { DEFAULT_DRAWER_FOLDS, loadDrawerFolds, setActiveEventId, setDrawerFold, subscribeDrawerFolds } from "@/lib/events/storage";
import { dayWord, nextMeeting, waitingItems, type WaitingItem } from "@/lib/events/waiting";
import { fetchEventClients, type EventClientRow } from "@/lib/events/client-actions";
import { fetchPendingProposals, type PendingProposal } from "@/lib/proposals/actions";
import { fetchEventBilling, type EventBilling } from "@/lib/billing/actions";
import { lateInstallment, type Installment } from "@/lib/billing/rules";
import { formatPrice } from "@/lib/catalog/format";
import { STEP_BY_ID, stepAt } from "@/lib/meeting/steps";
import type { Appointment } from "@/lib/appointments/types";
import { APPOINTMENT_KIND_LABEL } from "@/lib/appointments/types";
import { useMeetingFlow } from "@/lib/meeting/use-flow";
import { StatusChip } from "@/components/status-chip";
import { Drawer } from "@/components/drawer";
import { Button } from "@/components/button";
import { Menu } from "@/components/menu";
import { FoldRow } from "@/components/fold-row";
import { KIND_ICON, kindTheme, toISODate } from "./dashboard-view-utils";
import { DrawerSection, SectionAction } from "./drawer-section";
import { EventBillingSection } from "./event-billing-section";
import { ClientAccessCard } from "./client-access-card";
import { ProductionSection } from "./production-section";
import { VenueHostingSection } from "./venue-hosting-section";

// The shell — the floating left-anchored <dialog>, its header and its one scrollbar — is
// components/drawer.tsx, shared with the catalog's product form. What stays here is what this
// drawer is ABOUT, in the order a designer opening it wants it (2026-11-10, the board's 3b — "A ·
// same drawer, tightened", Ravid's pick):
//
//   which event                       (the header: name, then type · day · guests under it)
//   where it stands and the way on    (status, the meeting's stages as a bar, the meeting to
//                                      continue, its studio · outputs · 3D)
//   הפקה                              (once the client said yes — the first thing about it then)
//   ממתין לכם                         (only when something waits: lib/events/waiting.ts)
//   the brief and who to call         (three facts, the palette, the contacts with a call button)
//   the rest, FOLDED                  (פגישות · שיתוף · הצעת מחיר ותשלומים · הפקה-to-come, each
//                                      reading its value back on its row; open state per device)
//
// It used to be seven stacked sections with half of them below the fold, a title that did not say
// which wedding, and the client's waiting changes invisible. The details are still edited in place
// (onEdit), and the folds hold the same section components the drawer always had, `bare`.

type Destination = "/meeting" | "/outputs" | "/studio" | "/scene";

/** What the drawer reads for itself — the folds' summaries and "ממתין לכם" — tagged with the event
 *  it was read for, so a drawer switched to another event never shows the last one's facts.
 *  `undefined` = still reading, `null` = nothing there (or the read was refused). */
interface Reads {
  eventId: string;
  proposal?: PendingProposal | null;
  billing?: EventBilling | null;
  clients?: EventClientRow[] | null;
}

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
  /** "navigate" when it closes because one of its buttons is leaving the screen. */
  onClose: (reason?: "navigate") => void;
  /** Opens the event on one of its own surfaces — the meeting flow by default, its studio, outputs
   *  or 3D room from the three buttons under it. All need the same "this device has this event
   *  open" pointer set first, so it is one prop with a destination. */
  onContinue: (e: EventSummary, to?: Destination) => void;
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
  const router = useRouter();
  // The device's open folds, read straight from storage (lib/events/storage.ts) — the server and the
  // hydrating render take the default, so the two agree.
  const folds = useSyncExternalStore(subscribeDrawerFolds, loadDrawerFolds, () => DEFAULT_DRAWER_FOLDS);
  const [reads, setReads] = useState<Reads | null>(null);
  // Bumped when something the summaries read may have moved: a billing document issued, a booking
  // saved, the sharing fold closed after its people changed.
  const [tick, setTick] = useState(0);
  const billingEl = useRef<HTMLDivElement | null>(null);
  const revealBilling = useRef(false);
  const id = event?.id;

  useEffect(() => {
    if (!id) return;
    let live = true;
    const put = (patch: Omit<Reads, "eventId">) => {
      if (live) setReads((r) => ({ ...(r?.eventId === id ? r : { eventId: id }), ...patch }));
    };
    // The PENDING list rather than fetchSubmittedProposal: it is counted on the server (the number
    // of changes is the line) and carries no drawings, where the other sends two whole documents
    // over the wire to say "3".
    fetchPendingProposals().then(
      (list) => put({ proposal: list.find((p) => p.eventId === id) ?? null }),
      () => put({ proposal: null }),
    );
    fetchEventBilling(id).then(
      (billing) => put({ billing }),
      () => put({ billing: null }),
    );
    fetchEventClients(id).then(
      (clients) => put({ clients }),
      () => put({ clients: null }),
    );
    return () => {
      live = false;
    };
  }, [id, tick]);

  if (!event) return null;

  const mine = reads?.eventId === event.id ? reads : null;
  const now = new Date();
  const status = eventStatus(event, flow);
  // The meeting's progress means something while the event is being SOLD. Once the client has
  // answered (or it is archived) the chip says the thing that matters, and "מאושר · 50%" said two
  // contradicting things at once.
  const selling = status !== "confirmed" && status !== "lost" && status !== "archived";
  const progress = eventProgress(event, flow);
  // The stage the event is actually parked on, so the primary action can NAME where it resumes —
  // and the bar can mark it (clamped like stepAt: a flow shortened since may not read past its end).
  const resumeAt = stepAt(flow, event.step);
  const current = Math.min(Math.max(event.step, 0), flow.length - 1);

  const reread = () => setTick((t) => t + 1);
  const changed = () => {
    reread();
    onEventChanged();
  };

  // "navigate": the screen must not rewrite its own address on this close (dashboard-screen's
  // closeDrawer) — a second navigation would discard this one.
  const go = (to?: Destination) => {
    onContinue(event, to);
    onClose("navigate");
  };

  const late = mine?.billing ? lateInstallment(mine.billing.ledger.installments) : undefined;
  const waiting = waitingItems({
    event,
    proposal: mine?.proposal ?? null,
    appointments,
    lateInstallment: late ? { label: late.label, amount: late.amount - late.paid, dueDate: late.dueDate } : null,
    now,
  });

  const toggle = (key: string) => {
    const open = !!folds[key];
    setDrawerFold(key, !open);
    // Who it is shared with is read back on the row; what was changed inside is read on the way out.
    if (open && key === "sharing") reread();
  };

  // A quote or a payment waiting is answered in the billing fold: open it and bring it into view.
  // Already open, it scrolls now; folded, it scrolls when its content mounts (billingRef).
  const reveal = (el: HTMLElement) =>
    el.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const showBilling = () => {
    if (billingEl.current) return reveal(billingEl.current);
    revealBilling.current = true;
    setDrawerFold("billing", true);
  };
  const billingRef = (el: HTMLDivElement | null) => {
    billingEl.current = el;
    if (el && revealBilling.current) {
      revealBilling.current = false;
      reveal(el);
    }
  };

  const act = (item: WaitingItem) => {
    if (item.kind === "proposal") {
      // The studio opens the review straight from `?review=` (studio-screen.tsx) — on THIS event.
      setActiveEventId(event.id);
      router.push(`/studio?review=${item.proposalId}`);
      onClose("navigate");
    } else if (item.kind === "meeting") onOpenAppointment(item.appointment);
    else showBilling();
  };

  const contacts = [
    { name: event.contactName || event.clientName, phone: event.phone },
    ...(event.contact2Name || event.contact2Phone ? [{ name: event.contact2Name || "איש קשר נוסף", phone: event.contact2Phone ?? "" }] : []),
  ];

  // "N · הבאה היום 14:00" — the same next sitting "ממתין לכם" names (nextMeeting), so the two agree.
  const next = nextMeeting(appointments, event.id, now);
  const meetingsSummary =
    appointments.length === 0
      ? "לא נקבעו"
      : `${appointments.length} · ${next ? `הבאה ${dayWord(next.date, now)}${next.time ? ` ${next.time}` : ""}` : "אין פגישה קרובה"}`;
  const money = billingSummary(mine ? mine.billing : undefined, late, event.confirmedAt);
  const todayISO = toISODate(now);

  return (
    <Drawer
      title={event.clientName}
      subtitle={[event.eventType, event.date ? dayWord(event.date, now) : "טרם נקבע תאריך", event.guests ? `${event.guests} אורחים` : null]
        .filter(Boolean)
        .join(" · ")}
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
        <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-5 pt-4">
          {/* Where it stands, and the way on. The meeting is the one filled button; the event's
              three working screens sit under it as equals — 3D was missing from the drawer. */}
          <div className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center gap-2.5">
              <StatusChip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusChip>
              {selling && (
                <>
                  <span className="nums min-w-0 flex-1 truncate text-[13px] text-ink-soft">
                    שלב {current + 1} מתוך {flow.length}
                  </span>
                  <span className="nums text-sm font-semibold text-ink-soft">{progress}%</span>
                </>
              )}
            </div>

            {/* The studio's OWN flow, one segment a stage (a hover names it) — an anonymous %
                said how far, never what is left. The text above says it for a screen reader. */}
            {selling && (
              <div aria-hidden className="mt-3 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${flow.length}, minmax(0, 1fr))` }}>
                {flow.map((stage, i) => (
                  <span
                    key={stage}
                    title={STEP_BY_ID[stage].label}
                    className={"h-1.5 rounded-pill " + (i < current ? "bg-accent" : i === current ? "bg-accent/45" : "bg-inset-border")}
                  />
                ))}
              </div>
            )}

            {/* Names where it lands: /meeting resumes at whatever stage the event was left on. */}
            <Button className="mt-3.5 w-full" onClick={() => go()}>
              <span className="truncate">{event.step === 0 ? "התחלת פגישה" : `המשך · ${resumeAt.label}`}</span>
              <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            </Button>
            {/* The event's own frames, not the meeting's stages — a designer redrawing between
                sittings or preparing the crew's sheets is not running a meeting. */}
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Button variant="outline" size="sm" onClick={() => go("/studio")}>
                <PenTool className="h-[15px] w-[15px] shrink-0" strokeWidth={2} />
                סטודיו
              </Button>
              <Button variant="outline" size="sm" onClick={() => go("/outputs")}>
                <Printer className="h-[15px] w-[15px] shrink-0" strokeWidth={2} />
                פלטים
              </Button>
              <Button variant="outline" size="sm" onClick={() => go("/scene")}>
                <Box className="h-[15px] w-[15px] shrink-0" strokeWidth={2} />
                תלת־ממד
              </Button>
            </div>
          </div>

          {/* Once the client has said yes the event is being PRODUCED, and that is the first thing
              to read about it: the crew, the equipment, the suppliers' answers, the printed sheets
              (./production-section.tsx). Before the yes it is the quiet fold at the foot. */}
          {status === "confirmed" && <ProductionSection key={`production-${event.id}`} event={event} onChanged={changed} />}

          {/* Why the drawer was opened, when there is a why. Nothing waiting, nothing drawn. */}
          {waiting.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-muted">ממתין לכם</h3>
              {waiting.map((item) => (
                <WaitingRow key={item.key} item={item} onAct={() => act(item)} />
              ))}
            </section>
          )}

          {/* The brief and who to call, in one card: what the header line does not already say
              (type · day · guests are up there), the palette, and a call button per contact. */}
          <DrawerSection
            title="פרטים ואנשי קשר"
            flush
            action={
              <SectionAction icon={Pencil} onClick={() => onEdit(event)}>
                עריכה
              </SectionAction>
            }
          >
            <dl className="grid grid-cols-3 gap-3 px-4 py-3.5">
              <Fact label="שעה">
                <span className="nums">{event.time || "—"}</span>
              </Fact>
              <Fact label="הקמה">{event.setupDate ? formatEventDate(event.setupDate) : "ביום האירוע"}</Fact>
              {/* The zones, with the venue under them — on /production the drawer opens events of
                  every venue, and three columns have no room for both on one line. */}
              <Fact label="מקום" sub={venueName}>
                {zonesLabelOf(event)}
              </Fact>
            </dl>
            {/* Names only: a shade's swatch lives on the catalog row it names, which this drawer
                does not read. */}
            {!!event.shades?.length && (
              <div className="flex items-center gap-2 border-t border-border-soft px-4 py-2.5">
                <span className="shrink-0 text-xs text-muted">גוונים</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft" title={event.shades.join(" · ")}>
                  {event.shades.join(" · ")}
                </span>
              </div>
            )}
            {contacts.map((c, i) => (
              <div key={i} className="flex items-center gap-2.5 border-t border-border-soft px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">{c.name}</span>
                {c.phone && (
                  <>
                    <span dir="ltr" className="nums shrink-0 text-[13px] text-ink-soft">
                      {c.phone}
                    </span>
                    {/* A link: the drawer is opened to make exactly this call, often from a phone. */}
                    <a
                      href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}
                      aria-label={`התקשרות ל${c.name}`}
                      title={`התקשרות ל${c.name}`}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent transition-colors hover:bg-accent-wash hover:text-accent-hover"
                    >
                      <Phone className="h-[15px] w-[15px]" strokeWidth={2} />
                    </a>
                  </>
                )}
              </div>
            ))}
          </DrawerSection>

          {/* The hall's card, when a venue linked this evening (lib/event-links). */}
          <VenueHostingSection key={`venue-${event.id}`} event={event} onChanged={changed} />

          {/* The rest, folded — each row says what it holds before it is opened. The client's side
              in the order it happens: the sittings, the sketch shared with them, the price and
              their yes. The inner hover reaches the card's rounded corners (13px = 14 less the
              border) without `overflow-hidden`, which would clip the rows' menus. */}
          <div className="rounded-md border border-border bg-surface [&>*:first-child>button]:rounded-t-[13px] [&>*:last-child>button:last-child]:rounded-b-[13px]">
            <FoldRow icon={CalendarDays} title="פגישות" summary={meetingsSummary} open={!!folds.meetings} onToggle={() => toggle("meetings")}>
              {/* Same glyph and same ink the day cell gives this kind (KIND_CARD_THEME) — the colour
                  has to mean one thing in both places or it teaches nothing. */}
              <div className="flex flex-col text-[13px]">
                {appointments.length === 0 ? (
                  <p className="py-1 text-ink-soft">לא נקבעו פגישות לאירוע הזה.</p>
                ) : (
                  appointments.map((a) => {
                    const theme = kindTheme(a.kind, a.done);
                    const KindIcon = a.done ? CheckCircle2 : KIND_ICON[a.kind];
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => onOpenAppointment(a)}
                        className="-mx-2 flex items-center gap-2 rounded-sm px-2 py-1.5 text-start transition-colors hover:bg-accent-tint"
                      >
                        <KindIcon className={"h-3.5 w-3.5 shrink-0 " + theme.text} strokeWidth={1.75} />
                        <span className={"min-w-0 flex-1 truncate " + (a.done ? "text-muted" : "text-ink")}>
                          {a.date === todayISO ? "היום" : formatEventDate(a.date)}
                          <span className={"font-semibold " + theme.text}> · {APPOINTMENT_KIND_LABEL[a.kind]}</span>
                        </span>
                        {a.time && (
                          <span dir="ltr" className={"nums shrink-0 " + (a.done ? "text-muted" : "text-ink-soft")}>
                            {a.time}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
                {/* A second meeting is part of the process, not an exception (docs/01 §מצב פגישה). */}
                <button
                  type="button"
                  onClick={() => onCreateAppointment(event)}
                  className="mt-2 inline-flex items-center gap-1 self-start rounded-sm text-xs font-semibold text-accent transition-colors hover:text-accent-hover"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
                  קביעת פגישה
                </button>
              </div>
            </FoldRow>

            <FoldRow icon={Share2} title="שיתוף עם הלקוח" summary={sharingSummary(mine ? mine.clients : undefined)} open={!!folds.sharing} onToggle={() => toggle("sharing")}>
              <ClientAccessCard key={`clients-${event.id}`} event={event} bare />
            </FoldRow>

            {/* A late installment warns on the closed row — the money is short before anyone opens it. */}
            <FoldRow
              icon={ReceiptText}
              title="הצעת מחיר ותשלומים"
              tone={money.warn ? "warn" : "default"}
              summary={money.text}
              open={!!folds.billing}
              onToggle={() => toggle("billing")}
            >
              {/* scroll-mt keeps the fold's own row in view when "ממתין לכם" scrolls here. */}
              <div ref={billingRef} className="scroll-mt-14">
                <EventBillingSection key={`billing-${event.id}`} event={event} onChanged={changed} bare />
              </div>
            </FoldRow>

            {/* What opens after the yes, said while there is still a yes to come. Confirmed, it is
                the section under the status card; lost or archived, there is nothing to come. */}
            {selling && (
              <FoldRow
                icon={Truck}
                title="הפקה"
                summary={<span className="text-quiet">אחרי אישור הלקוח</span>}
                open={!!folds.production}
                onToggle={() => toggle("production")}
              >
                <p className="text-[13px] text-muted">נפתח אחרי שהלקוח אישר: צוות, ציוד, תשובות ספקים ודפי העבודה.</p>
              </FoldRow>
            )}
          </div>

          <p className="nums text-center text-caption text-muted">
            נוצר ב־{new Date(event.createdAt).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
      </div>
    </Drawer>
  );
}

/** One fact of the brief: its name over its value — and, for the place, the venue under it. */
function Fact({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate font-semibold text-ink">{children}</dd>
      {sub && <dd className="truncate text-xs text-muted">{sub}</dd>}
    </div>
  );
}

/** Each kind of waiting in its subject's tint: the client's changes and an unanswered quote are a
 *  warning, a late payment an alert, a meeting the colour its kind wears in the calendar. */
function tileOf(item: WaitingItem): { tile: string; Icon: LucideIcon } {
  switch (item.kind) {
    case "proposal":
      return { tile: "bg-warn-tint text-warn-ink", Icon: PenTool };
    case "meeting": {
      const theme = kindTheme(item.appointment.kind);
      return { tile: `${theme.bg} ${theme.text}`, Icon: KIND_ICON[item.appointment.kind] };
    }
    case "quote":
      return { tile: "bg-warn-tint text-warn-ink", Icon: ReceiptText };
    case "payment":
      return { tile: "bg-alert-tint text-alert-ink", Icon: HandCoins };
  }
}

/** One thing waiting: its tile, a bold line and a muted one, and where it goes — the proposal's
 *  review is a named verb, the rest open in place. */
function WaitingRow({ item, onAct }: { item: WaitingItem; onAct: () => void }) {
  const { tile, Icon } = tileOf(item);
  return (
    <button
      type="button"
      onClick={onAct}
      className="flex w-full items-center gap-2.5 rounded-md border border-border bg-surface px-3.5 py-3 text-start transition-colors hover:bg-inset"
    >
      <span className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-sm " + tile}>
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
        <span className="nums block truncate text-xs text-muted">{item.detail}</span>
      </span>
      {item.kind === "proposal" ? (
        <span className="inline-flex h-8 shrink-0 items-center rounded-pill border-[1.5px] border-accent-line px-3 text-[13px] font-bold text-accent">
          סקירה
        </span>
      ) : (
        <ChevronLeft className="h-4 w-4 shrink-0 text-quiet" strokeWidth={2} />
      )}
    </button>
  );
}

/** "דנה לוי · הצעת שינויים", "דנה לוי ועוד 1", "לא שותף". The permission as a noun, never "יכול/ה":
 *  the summary does not guess anybody's gender. */
function sharingSummary(clients: EventClientRow[] | null | undefined): string {
  if (clients === undefined) return "…";
  if (clients === null) return "—";
  if (clients.length === 0) return "לא שותף";
  const [first] = clients;
  const name = first.name || first.email;
  if (clients.length > 1) return `${name} ועוד ${clients.length - 1}`;
  return `${name} · ${!first.joined ? "ההזמנה פתוחה" : first.role === "editor" ? "הצעת שינויים" : "צפייה בלבד"}`;
}

/** The money in one line, in the order it happens: what is late, else the order and its balance,
 *  else what came in, else the quote, else that there is none yet. Prices, never costs. */
function billingSummary(
  billing: EventBilling | null | undefined,
  late: Installment | undefined,
  confirmedAt: number | undefined,
): { text: string; warn?: boolean } {
  if (billing === undefined) return { text: "…" };
  if (billing === null) return { text: "—" };
  if (late) return { text: `${late.label} באיחור`, warn: true };
  const { order, balance, paid } = billing.ledger;
  if (order) return { text: `הזמנה ${order.number} · ${balance !== undefined && balance > 0.005 ? `יתרה ${formatPrice(balance)}` : "שולם במלואו"}` };
  if (paid > 0) return { text: `התקבלו ${formatPrice(paid)}` };
  if (billing.quote) {
    const when = confirmedAt ? "אושרה בעל-פה" : `נשלחה ${formatEventDate(toISODate(new Date(billing.quote.issuedAt)))}`;
    return { text: `הצעה ${formatPrice(billing.quote.total)} · ${when}` };
  }
  return { text: "טרם הונפקה הצעה" };
}
