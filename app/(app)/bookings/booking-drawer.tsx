"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Link2, Link2Off, Pencil, Phone, Plus, Presentation, Trash2, Users } from "lucide-react";
import type { Appointment } from "@/lib/appointments/types";
import { APPOINTMENT_KIND_LABEL, appointmentTimeLabel } from "@/lib/appointments/types";
import type { Booking } from "@/lib/hosting/actions";
import { closeFinalCount } from "@/lib/hosting/actions";
import {
  BOOKING_STATUS_LABEL,
  BOOKING_STATUS_TONE,
  SERVICE_STYLE_LABEL,
  SLOT_LABEL,
  SPECIAL_MEALS,
  SPECIAL_MEAL_LABEL,
  bookingStatus,
  linesTotal,
  packageLines,
} from "@/lib/hosting/types";
import { COURSE_LABEL, servedDishes, type Dish, type MenuPackage } from "@/lib/menus/types";
import { confirmEvent, markEventLost, reopenEvent } from "@/lib/events/actions";
import { formatEventDate } from "@/lib/events/types";
import { cancelDesignerLink, inviteDesigner } from "@/lib/event-links/actions";
import { LINK_STATE_LABEL } from "@/lib/event-links/types";
import { formatPrice } from "@/lib/catalog/format";
import { Drawer } from "@/components/drawer";
import { Button } from "@/components/button";
import { Menu } from "@/components/menu";
import { NumberField } from "@/components/number-field";
import { StatusChip } from "@/components/status-chip";
import { TextField } from "@/components/text-field";
import { DrawerSection, SectionAction } from "../dashboard/drawer-section";
import { KIND_ICON, kindTheme } from "../dashboard/dashboard-view-utils";
import { EventBillingSection } from "../dashboard/event-billing-section";

const todayIso = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * One evening at the venue, read back in the order it happens: where it stands (and the two answers
 * a booking waits for — the client's yes and the closed count), the brief, the menu, the evening,
 * the vendors and the linked designer, the notes. Edited through BookingDialog; the client's answer
 * and the count are single actions here, like the designer's event drawer.
 */
export function BookingDrawer({
  booking,
  venueName,
  dishes,
  packages,
  appointments = [],
  onOpenAppointment,
  onCreateAppointment,
  onClose,
  onEdit,
  onDelete,
  onChanged,
}: {
  booking: Booking | null;
  venueName?: string;
  dishes: Dish[];
  packages: MenuPackage[];
  /** The sittings booked against this evening — a tasting, a tour (the designer's drawer's פגישות). */
  appointments?: Appointment[];
  onOpenAppointment?: (a: Appointment) => void;
  /** Present = the drawer offers "קביעת פגישה" for this evening. */
  onCreateAppointment?: (b: Booking) => void;
  onClose: () => void;
  onEdit: (b: Booking) => void;
  onDelete: (b: Booking) => void;
  /** Re-read the list — a status, a count or a link moved. */
  onChanged: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  if (!booking) return null;
  const { event, hosting, link } = booking;
  const status = bookingStatus(event, hosting, todayIso());
  const pkg = packages.find((p) => p.id === hosting.packageId);
  const lines = pkg ? packageLines(pkg, hosting, event.guests) : [];

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    setLinkError(null);
    setBusy(true);
    try {
      const r = await inviteDesigner(event.id, email);
      if ("error" in r) setLinkError(r.error);
      else {
        setEmail("");
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  const where = [venueName, event.zonesLabel].filter(Boolean).join(" · ");
  const linkable = !link || link.state === "declined" || link.state === "ended";

  return (
    <Drawer
      title={event.clientName}
      onClose={onClose}
      actions={
        <Menu
          label={`אפשרויות לאירוע של ${event.clientName}`}
          items={[
            { label: "עריכת פרטי האירוע", icon: Pencil, onSelect: () => onEdit(booking) },
            { label: "מחיקת האירוע", icon: Trash2, danger: true, onSelect: () => onDelete(booking) },
          ]}
        />
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Where it stands, and the way on — the designer's drawer's card: the meeting is the one
              filled button (the hall's meeting mode, app/meeting/hall-meeting-screen.tsx), the
              client's answer sits under it as two equals. */}
          <div className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <StatusChip tone={BOOKING_STATUS_TONE[status]}>{BOOKING_STATUS_LABEL[status]}</StatusChip>
              {status === "hold" && hosting.holdUntil && <span className="text-xs text-muted">שמור עד {formatEventDate(hosting.holdUntil)}</span>}
            </div>
            <Button className="mt-4 w-full" onClick={() => router.push(`/meeting?event=${event.id}`)}>
              <Presentation className="h-4 w-4" strokeWidth={2} />
              מצב פגישה
            </Button>
            {/* The client's answer — the same three stamps the designer's event has. */}
            {!event.confirmedAt && !event.lostAt ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button variant="outline" disabled={busy} onClick={() => void run(() => confirmEvent(event.id))}>
                  <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
                  הלקוח סגר
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => void run(() => markEventLost(event.id))}>
                  לא נסגר
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="mt-2 w-full" disabled={busy} onClick={() => void run(() => reopenEvent(event.id))}>
                פתיחה מחדש
              </Button>
            )}
            {/* The closed count — what the kitchen cooks for and the balance is figured from. */}
            {event.confirmedAt && (
              <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border-soft pt-3">
                {hosting.finalGuests !== undefined ? (
                  <>
                    <p className="flex-1 text-sm text-ink-soft">
                      כמות סופית: <span className="nums font-bold text-ink">{hosting.finalGuests}</span>
                      {hosting.finalClosedAt && (
                        <span className="text-xs text-muted"> · נסגרה {new Date(hosting.finalClosedAt).toLocaleDateString("he-IL")}</span>
                      )}
                    </p>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => closeFinalCount(event.id, null))}>
                      פתיחת הכמות
                    </Button>
                  </>
                ) : (
                  <>
                    <NumberField label="כמות סופית" value={count ?? event.guests} onChange={setCount} min={0} className="w-28" />
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => closeFinalCount(event.id, count ?? event.guests))}>
                      סגירת כמות
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          <DrawerSection
            title="פרטי האירוע"
            action={
              <SectionAction icon={Pencil} onClick={() => onEdit(booking)}>
                עריכה
              </SectionAction>
            }
          >
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Fact label="תאריך">
                {formatEventDate(event.date)}
                {event.time && <span className="nums"> · {event.time}</span>}
              </Fact>
              <Fact label="משמרת">{SLOT_LABEL[hosting.slot]}</Fact>
              <Fact label="מקום" wide>
                {where || "לא נבחר"}
              </Fact>
              <Fact label="סוג האירוע">{event.eventType || "לא צוין"}</Fact>
              <Fact label="מוזמנים">
                <span className="nums">{event.guests || "—"}</span>
                {hosting.children > 0 && <span className="nums text-muted"> · {hosting.children} ילדים</span>}
              </Fact>
              {(hosting.guaranteedMin ?? pkg?.minGuests) ? (
                <Fact label="מינימום">
                  <span className="nums">{hosting.guaranteedMin ?? pkg?.minGuests}</span>
                </Fact>
              ) : null}
              {hosting.vendorMeals > 0 && (
                <Fact label="מנות ספקים">
                  <span className="nums">{hosting.vendorMeals}</span>
                </Fact>
              )}
              {SPECIAL_MEALS.some((k) => hosting.specialMeals[k]) && (
                <Fact label="ארוחות מיוחדות" wide>
                  {SPECIAL_MEALS.filter((k) => hosting.specialMeals[k])
                    .map((k) => `${SPECIAL_MEAL_LABEL[k]} ${hosting.specialMeals[k]}`)
                    .join(" · ")}
                  {hosting.specialNote && <span className="block text-xs text-muted">{hosting.specialNote}</span>}
                </Fact>
              )}
              {event.phone && (
                <Fact label="טלפון">
                  <a href={`tel:${event.phone.replace(/[^\d+]/g, "")}`} dir="ltr" className="nums inline-flex items-center gap-1 hover:text-accent-hover">
                    <Phone className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} />
                    {event.phone}
                  </a>
                </Fact>
              )}
              {hosting.onSiteName && <Fact label="מנהל האירוע">{hosting.onSiteName}</Fact>}
            </dl>
          </DrawerSection>

          {/* The diary for this evening, and the way to add to it — a tasting, a tour of the hall. */}
          {onCreateAppointment && (
            <DrawerSection
              title="פגישות"
              flush
              action={
                <SectionAction icon={Plus} onClick={() => onCreateAppointment(booking)}>
                  קביעת פגישה
                </SectionAction>
              }
            >
              {appointments.length === 0 ? (
                <p className="px-4 py-3.5 text-ink-soft">לא נקבעו פגישות לאירוע הזה.</p>
              ) : (
                appointments.map((a, i) => {
                  const theme = kindTheme(a.kind, a.done);
                  const KindIcon = a.done ? CheckCircle2 : KIND_ICON[a.kind];
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onOpenAppointment?.(a)}
                      className={"flex w-full items-center gap-2.5 px-4 py-3 text-start transition-colors hover:bg-accent-tint " + (i > 0 ? "border-t border-border-soft" : "")}
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
          )}

          <DrawerSection title="תפריט">
            {!pkg ? (
              <p className="text-ink-soft">לא נבחרה חבילה.</p>
            ) : (
              <div className="space-y-3">
                <p className="font-semibold text-ink">
                  {pkg.name}
                  {hosting.serviceStyle && <span className="font-normal text-muted"> · {SERVICE_STYLE_LABEL[hosting.serviceStyle]}</span>}
                </p>
                {pkg.courses.map((c) => {
                  const served = servedDishes(c, hosting.menuChoices[c.id], dishes);
                  if (!served.length) return null;
                  return (
                    <div key={c.id}>
                      <p className="text-xs text-muted">{COURSE_LABEL[c.course]}</p>
                      <p className="text-ink">{served.map((d) => d.name).join(" · ")}</p>
                    </div>
                  );
                })}
                {lines.length > 0 && (
                  <table className="w-full text-[13px]">
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={i} className="border-t border-border-soft">
                          <td className="py-1.5 text-ink-soft">{l.label}</td>
                          <td className="nums py-1.5 text-muted">
                            {l.qty} × {formatPrice(l.unit)}
                          </td>
                          <td className="nums py-1.5 text-end font-medium text-ink">{formatPrice(l.total)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-border">
                        <td colSpan={2} className="py-2 font-semibold text-ink">
                          סה״כ לפי החבילה
                        </td>
                        <td className="nums py-2 text-end font-bold text-ink">{formatPrice(linesTotal(lines))}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </DrawerSection>

          {/* The money: the order written from the package figure, its schedule, what came in
              (lib/billing — the same section and dialogs a designer's event uses). */}
          <EventBillingSection
            key={`billing-${event.id}`}
            event={event}
            onChanged={onChanged}
            orderLines={lines.map((l) => ({ label: `${l.label} — ${l.qty} × ${formatPrice(l.unit)}`, amount: l.total }))}
          />

          {hosting.runOfShow.length > 0 && (
            <DrawerSection title="לו״ז הערב">
              <ol className="space-y-1.5">
                {hosting.runOfShow.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="nums w-12 shrink-0 font-semibold text-ink" dir="ltr">
                      {s.time}
                    </span>
                    <span className="text-ink-soft">{s.label}</span>
                  </li>
                ))}
              </ol>
            </DrawerSection>
          )}

          {/* The designer of this evening (lib/event-links): once linked they read this card — all
              but the money — and the venue sees their plain hall sketch. */}
          <DrawerSection title="המעצב">
            {link && !linkable ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{link.studioName ?? link.invitedEmail}</span>
                    <span className="block text-xs text-muted">{LINK_STATE_LABEL[link.state]}</span>
                  </span>
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => void run(() => cancelDesignerLink(event.id))}>
                    <Link2Off className="h-4 w-4" strokeWidth={1.75} />
                    ביטול הקישור
                  </Button>
                </div>
                {link.state === "active" && (
                  <Link
                    href={`/bookings/${event.id}/sketch`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-hover"
                  >
                    <Users className="h-4 w-4" strokeWidth={1.75} />
                    סקיצת האולם של המעצב
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {link && <p className="text-xs text-muted">{LINK_STATE_LABEL[link.state]} · {link.studioName ?? link.invitedEmail}</p>}
                <p className="text-ink-soft">מזמינים את המעצב לפי האימייל שלו. אחרי שיאשר — הוא יראה את פרטי האירוע (בלי מחירים), ואתם את סקיצת האולם שלו.</p>
                <div className="flex items-end gap-2">
                  <TextField value={email} onChange={setEmail} type="email" dir="ltr" placeholder="designer@studio.co.il" wrapperClassName="min-w-0 flex-1" />
                  <Button size="sm" disabled={busy || !email.trim()} onClick={() => void invite()}>
                    <Link2 className="h-4 w-4" strokeWidth={1.75} />
                    קישור
                  </Button>
                </div>
                {linkError && <p className="text-xs text-alert">{linkError}</p>}
              </div>
            )}
          </DrawerSection>

          {hosting.vendors.length > 0 && (
            <DrawerSection title="ספקים באירוע" flush>
              {hosting.vendors.map((v, i) => (
                <div key={v.id} className={"flex items-center justify-between gap-2 px-4 py-2.5 " + (i > 0 ? "border-t border-border-soft" : "")}>
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{v.name || v.role}</span>
                    <span className="block text-xs text-muted">
                      {v.role}
                      {v.arrival && <span className="nums"> · הגעה {v.arrival}</span>}
                    </span>
                  </span>
                  {v.phone && (
                    <a href={`tel:${v.phone.replace(/[^\d+]/g, "")}`} dir="ltr" className="nums shrink-0 text-ink-soft hover:text-accent-hover">
                      {v.phone}
                    </a>
                  )}
                </div>
              ))}
            </DrawerSection>
          )}

          {(hosting.kitchenNotes || hosting.floorNotes) && (
            <DrawerSection title="הערות">
              {hosting.kitchenNotes && <Note label="למטבח">{hosting.kitchenNotes}</Note>}
              {hosting.floorNotes && <Note label="לאולם">{hosting.floorNotes}</Note>}
            </DrawerSection>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function Fact({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={"min-w-0 " + (wide ? "col-span-2" : "")}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{children}</dd>
    </div>
  );
}

function Note({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="whitespace-pre-line text-ink-soft [&+&]:mt-2">
      <span className="text-xs font-semibold text-muted">{label}: </span>
      {children}
    </p>
  );
}
