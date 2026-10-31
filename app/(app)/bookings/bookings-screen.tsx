"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarHeart, Link2, Pencil, Plus, Presentation, Trash2 } from "lucide-react";
import { fetchBookings, type Booking } from "@/lib/hosting/actions";
import { BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE, SLOT_LABEL, bookingStatus, type BookingStatus } from "@/lib/hosting/types";
import type { Dish, MenuPackage } from "@/lib/menus/types";
import type { Appointment } from "@/lib/appointments/types";
import { useAppointments } from "@/lib/appointments/use-appointments";
import { deleteEvent } from "@/lib/events/actions";
import { useVenues } from "@/lib/venues/use-venues";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, NoResults } from "@/components/empty-state";
import { Menu } from "@/components/menu";
import { useNewEventRequest } from "@/components/new-event-request";
import { PAGE_GUTTER } from "@/components/page-gutter";
import { PageTabs } from "@/components/page-tabs";
import { SearchInput } from "@/components/search-input";
import { StatusChip } from "@/components/status-chip";
import { AppointmentDialog } from "../dashboard/appointment-dialog";
import { toISODate } from "../dashboard/dashboard-view-utils";
import { daysUntilLabel, rowDateLabel } from "../production/view-utils";
import { BookingDialog, type BookingSeed } from "./booking-dialog";
import { BookingDrawer } from "./booking-drawer";

type Filter = "open" | "booked" | "held" | "lost" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "הכל" },
  { id: "open", label: "פניות ואופציות" },
  { id: "booked", label: "הוזמנו" },
  { id: "held", label: "התקיימו" },
  { id: "lost", label: "לא נסגרו" },
];

const IN_FILTER: Record<Filter, (s: BookingStatus) => boolean> = {
  open: (s) => s === "inquiry" || s === "hold" || s === "hold_expired",
  booked: (s) => s === "booked" || s === "closed",
  held: (s) => s === "held",
  lost: (s) => s === "lost" || s === "archived",
  all: () => true,
};

const monthLabel = (iso: string) =>
  iso ? new Date(`${iso}-01T12:00:00`).toLocaleDateString("he-IL", { month: "long", year: "numeric" }) : "ללא תאריך";

/** Whole days from today to an ISO date, or null without one. */
function daysUntil(iso: string, today: string): number | null {
  if (!iso) return null;
  const at = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((at(iso) - at(today)) / 86_400_000);
}

/**
 * A venue's book of evenings: every booking by month, in the designer's production list's shape
 * (app/(app)/production/production-screen.tsx) — lanes as a filter, a search, month headers that
 * stick, one card per evening with its date and how far off it is. The header's "+ יצירת אירוע
 * חדש" opens the booking dialog here (components/new-event-request.tsx).
 */
export function BookingsScreen({
  initialBookings,
  initialAppointments,
  dishes,
  packages,
  openEventId,
}: {
  initialBookings: Booking[];
  initialAppointments: Appointment[];
  dishes: Dish[];
  packages: MenuPackage[];
  /** ?event= — a notification about a booking, or the end of a meeting, opens it. */
  openEventId?: string;
}) {
  const router = useRouter();
  const [bookings, setBookings] = useState(initialBookings);
  const { appointments, save, remove } = useAppointments(initialAppointments);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(openEventId ?? null);
  const [editing, setEditing] = useState<{ booking: Booking | null; seed?: BookingSeed } | null>(null);
  const [deleting, setDeleting] = useState<Booking | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [sitting, setSitting] = useState<{ editing: Appointment | null; date: string; eventId?: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const { venues } = useVenues();
  const today = toISODate(new Date());

  useNewEventRequest(() => setEditing({ booking: null }));

  const reload = async () => setBookings(await fetchBookings());

  const statusOf = (b: Booking) => bookingStatus(b.event, b.hosting, today);
  // Plain derivations — the React Compiler memoises them; a hand-written useMemo over `today` (a
  // clock read) is one it refuses to keep.
  const counts = { all: 0, open: 0, booked: 0, held: 0, lost: 0 } as Record<Filter, number>;
  for (const b of bookings) for (const f of FILTERS) if (IN_FILTER[f.id](statusOf(b))) counts[f.id]++;

  const q = query.trim().toLowerCase();
  const list = bookings.filter(
    (b) =>
      IN_FILTER[filter](statusOf(b)) &&
      (!q || b.event.clientName.toLowerCase().includes(q) || (b.event.zonesLabel ?? "").toLowerCase().includes(q)),
  );
  // Upcoming first, soonest first; then the past, latest first; undated last.
  const shown = [
    ...list.filter((b) => b.event.date && b.event.date >= today).sort((a, b) => a.event.date.localeCompare(b.event.date)),
    ...list.filter((b) => b.event.date && b.event.date < today).sort((a, b) => b.event.date.localeCompare(a.event.date)),
    ...list.filter((b) => !b.event.date),
  ];
  const groups: { key: string; items: Booking[] }[] = [];
  for (const b of shown) {
    const key = b.event.date ? b.event.date.slice(0, 7) : "";
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(b);
    else groups.push({ key, items: [b] });
  }

  const open = bookings.find((b) => b.event.id === openId) ?? null;
  const venueName = (id?: string) => venues.find((v) => v.id === id)?.name;
  const bookOn = (date: string, eventId?: string) => setSitting({ editing: null, date, eventId });

  return (
    <div className={`flex h-full flex-col ${PAGE_GUTTER}`}>
      {deleteError && (
        <p role="alert" className="mb-3 rounded-md border border-alert bg-alert-tint px-4 py-2.5 text-sm text-ink">
          {deleteError}
        </p>
      )}

      {bookings.length === 0 ? (
        <EmptyState
          icon={CalendarHeart}
          title="עוד אין אירועים באולם"
          body="כל ערב שנקבע — פנייה, אופציה או הזמנה — נרשם כאן, עם התפריט, הלו״ז וכמות האורחים."
          action={
            <Button onClick={() => setEditing({ booking: null })}>
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              אירוע ראשון
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
            <PageTabs label="מה מוצג ברשימה" value={filter} options={FILTERS.map((f) => ({ ...f, count: counts[f.id] }))} onChange={setFilter} />
            <SearchInput className="min-w-56 flex-1" value={query} onChange={setQuery} placeholder="חיפוש לפי לקוח או אולם…" aria-label="חיפוש אירועים" />
            <span className="nums shrink-0 text-sm text-muted">{shown.length} אירועים</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {shown.length === 0 ? (
              <NoResults
                icon={CalendarHeart}
                title="לא נמצאו אירועים"
                body={q ? `אין אירוע שתואם ל״${query.trim()}״ בסינון הזה.` : "אין אירועים בסינון הזה."}
                onClear={q ? () => setQuery("") : () => setFilter("all")}
                clearLabel={q ? "נקה חיפוש" : "הצגת הכל"}
              />
            ) : (
              groups.map((g) => (
                <section key={g.key || "undated"} aria-label={monthLabel(g.key)}>
                  <h2 className="sticky top-0 z-10 flex items-baseline gap-2 bg-bg py-2 text-caption font-bold text-muted">
                    {monthLabel(g.key)}
                    <span className="nums font-semibold text-quiet">{g.items.length}</span>
                  </h2>
                  <ul className="flex flex-col gap-2.5 pb-4">
                    {g.items.map((b) => {
                      const status = statusOf(b);
                      const e = b.event;
                      const guests = b.hosting.finalGuests ?? e.guests;
                      return (
                        <li key={e.id} className={"relative " + (menuOpen === e.id ? "z-30" : "")}>
                          <article className="rounded-md border border-border bg-surface px-4 py-3.5">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                              <div className="w-[104px] shrink-0">
                                <div className="nums text-sm font-bold leading-tight text-ink">{rowDateLabel(e.date)}</div>
                                <div className="nums mt-0.5 text-[11px] leading-tight text-muted">
                                  {daysUntilLabel(daysUntil(e.date, today))}
                                  {e.date && ` · ${SLOT_LABEL[b.hosting.slot]}`}
                                </div>
                              </div>
                              <span className="h-9 w-px shrink-0 bg-border-soft" aria-hidden />
                              <div className="min-w-[180px] flex-1">
                                <button
                                  type="button"
                                  onClick={() => setOpenId(e.id)}
                                  aria-label={`פתיחת האירוע של ${e.clientName}`}
                                  className="block max-w-full truncate rounded-sm text-start text-sm font-bold text-ink transition-colors hover:text-accent-hover"
                                >
                                  {e.clientName}
                                </button>
                                <div className="nums mt-0.5 truncate text-[13px] text-muted">
                                  {[e.eventType, e.zonesLabel || venueName(e.venueId), guests ? `${guests} אורחים` : ""].filter(Boolean).join(" · ")}
                                </div>
                              </div>
                              {b.link?.state === "active" && (
                                <span className="hidden shrink-0 items-center gap-1 text-xs text-muted sm:inline-flex" title="מקושר למעצב">
                                  <Link2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                                  {b.link.studioName}
                                </span>
                              )}
                              <StatusChip tone={BOOKING_STATUS_TONE[status]}>{BOOKING_STATUS_LABEL[status]}</StatusChip>
                              <Menu
                                label={`אפשרויות לאירוע של ${e.clientName}`}
                                className="-me-1 shrink-0"
                                onOpenChange={(o) => setMenuOpen(o ? e.id : null)}
                                items={[
                                  { label: "מצב פגישה", icon: Presentation, onSelect: () => router.push(`/meeting?event=${e.id}`) },
                                  { label: "עריכת פרטי האירוע", icon: Pencil, onSelect: () => setEditing({ booking: b }) },
                                  { label: "מחיקת האירוע", icon: Trash2, danger: true, separated: true, onSelect: () => setDeleting(b) },
                                ]}
                              />
                            </div>
                          </article>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>
        </>
      )}

      <BookingDrawer
        booking={open}
        venueName={venueName(open?.event.venueId)}
        dishes={dishes}
        packages={packages}
        appointments={open ? appointments.filter((a) => a.eventId === open.event.id) : []}
        onOpenAppointment={(a) => setSitting({ editing: a, date: a.date })}
        onCreateAppointment={(b) => bookOn(today, b.event.id)}
        onClose={() => setOpenId(null)}
        onEdit={(b) => setEditing({ booking: b })}
        onDelete={(b) => {
          setDeleteError(null);
          setDeleting(b);
        }}
        onChanged={() => void reload()}
      />

      <BookingDialog
        open={!!editing}
        booking={editing?.booking ?? null}
        seed={editing?.seed}
        dishes={dishes}
        packages={packages}
        onClose={() => setEditing(null)}
        onSaved={(list, id) => {
          setBookings(list);
          setEditing(null);
          setOpenId(id);
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        title={`למחוק את האירוע של ${deleting?.event.clientName ?? ""}?`}
        body="האירוע, התפריט שנבחר והלו״ז יימחקו. מעצב שקושר לאירוע ימשיך לעבוד על האירוע שלו."
        confirmLabel="מחיקה"
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (!target) return;
          void deleteEvent(target.event.id).then((r) => {
            if (!Array.isArray(r)) return setDeleteError(r.error);
            setOpenId(null);
            void reload();
          });
        }}
        onClose={() => setDeleting(null)}
      />

      <AppointmentDialog
        open={sitting !== null}
        appointment={sitting?.editing ?? null}
        defaultDate={sitting?.date ?? ""}
        defaultEventId={sitting?.eventId}
        events={bookings.map((b) => b.event)}
        onSave={save}
        onDelete={remove}
        onClose={() => setSitting(null)}
      />
    </div>
  );
}
