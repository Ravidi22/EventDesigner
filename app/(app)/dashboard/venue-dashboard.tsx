"use client";

import { useMemo, useState } from "react";
import { CalendarClock, CalendarHeart } from "lucide-react";
import { fetchBookings, type Booking } from "@/lib/hosting/actions";
import { BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE, bookingStatus, type BookingStatus } from "@/lib/hosting/types";
import type { Dish, MenuPackage } from "@/lib/menus/types";
import type { Appointment } from "@/lib/appointments/types";
import { useAppointments } from "@/lib/appointments/use-appointments";
import type { BusyBlock } from "@/lib/google/types";
import { useBusy } from "@/lib/google/use-busy";
import type { EventSummary } from "@/lib/events/types";
import { deleteEvent } from "@/lib/events/actions";
import { useVenues } from "@/lib/venues/use-venues";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PAGE_GUTTER } from "@/components/page-gutter";
import { useNewEventRequest } from "@/components/new-event-request";
import { BookingDialog, type BookingSeed } from "../bookings/booking-dialog";
import { BookingDrawer } from "../bookings/booking-drawer";
import { AppointmentDialog } from "./appointment-dialog";
import { CalendarCard, type EventLook } from "./calendar-card";
import { TodayFocus } from "./today-focus";
import { toISODate } from "./dashboard-view-utils";


/**
 * A venue's home — THE SAME SCREEN AS THE DESIGNER'S (./dashboard-screen.tsx; the user, 2026-10-30:
 * "why are the calendars different? should be the same", "owner also has meetings"). Today's evening and sittings beside the month's figures, and the one calendar (./calendar-card.tsx)
 * — its cards in the booking's status (lib/hosting bookingStatus), a free day offering an evening or a
 * meeting. A booking opens the hall's drawer; a sitting (a tasting, a tour, a first meeting) the
 * diary's own dialog, exactly as a designer's does.
 */
export function VenueDashboard({
  initialBookings,
  initialAppointments,
  initialBusy,
  busyWindow,
  googleConnected,
  suggestGoogle = false,
  dishes,
  packages,
}: {
  initialBookings: Booking[];
  initialAppointments: Appointment[];
  initialBusy: BusyBlock[];
  busyWindow: { from: string; to: string };
  googleConnected: boolean;
  /** Google is set up on this deployment and this person's calendar pull is off — the calendar's
   *  header offers the way to turn it on (CalendarCard). */
  suggestGoogle?: boolean;
  dishes: Dish[];
  packages: MenuPackage[];
}) {
  const [bookings, setBookings] = useState(initialBookings);
  const { appointments, save, remove } = useAppointments(initialAppointments);
  const busy = useBusy(initialBusy, busyWindow, googleConnected);
  const { venues, activeVenueId } = useVenues();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ booking: Booking | null; seed?: BookingSeed } | null>(null);
  const [deleting, setDeleting] = useState<Booking | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [sitting, setSitting] = useState<{ editing: Appointment | null; date: string; eventId?: string } | null>(null);
  const today = toISODate(new Date());

  // The header's "+ יצירת אירוע חדש" (components/app-shell.tsx) opens the booking dialog here.
  useNewEventRequest(() => setEditing({ booking: null }));

  const reload = async () => setBookings(await fetchBookings());

  // Scoped to the venue in the sidebar, like the designer's — and a booking with no room yet (an
  // inquiry) shows on every one of the hall's properties rather than on none.
  const live = useMemo(
    () => bookings.filter((b) => !b.event.archived && (!b.event.venueId || b.event.venueId === activeVenueId)),
    [bookings, activeVenueId],
  );
  const events = useMemo(() => live.map((b) => b.event), [live]);
  const byId = useMemo(() => new Map(live.map((b) => [b.event.id, b])), [live]);
  const statusOf = (e: EventSummary): BookingStatus => {
    const b = byId.get(e.id);
    return b ? bookingStatus(e, b.hosting, today) : "inquiry";
  };
  const visibleAppointments = useMemo(
    () => appointments.filter((a) => !a.venueId || a.venueId === activeVenueId),
    [appointments, activeVenueId],
  );

  const look = (e: EventSummary): EventLook => {
    const s = statusOf(e);
    return { label: BOOKING_STATUS_LABEL[s], tone: BOOKING_STATUS_TONE[s], struck: s === "hold_expired" || s === "lost" };
  };
  // A hall reads its month in evenings: what is taken, what is held, what lapsed.
  const summary = ({ events: inRange }: { events: EventSummary[] }) => {
    const statuses = inRange.map(statusOf);
    const taken = statuses.filter((s) => s === "booked" || s === "closed" || s === "held").length;
    const held = statuses.filter((s) => s === "hold").length;
    const lapsed = statuses.filter((s) => s === "hold_expired").length;
    return (
      <>
        {taken} ערבים מוזמנים · {held} באופציה
        {lapsed > 0 && <span className="text-alert-ink"> · {lapsed} אופציות פגו</span>}
      </>
    );
  };

  const open = bookings.find((b) => b.event.id === openId) ?? null;
  const bookOn = (date: string, eventId?: string) => setSitting({ editing: null, date, eventId });
  const editSitting = (a: Appointment) => setSitting({ editing: a, date: a.date });

  return (
    <div className={PAGE_GUTTER}>
      {deleteError && (
        <p role="status" className="mb-6 rounded-md border border-alert bg-alert-tint px-4 py-2.5 text-sm font-medium text-alert-ink">
          {deleteError}
        </p>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <TodayFocus
          events={events}
          appointments={visibleAppointments}
          busy={busy.byDate.get(today) ?? []}
          onOpenEvent={(e) => setOpenId(e.id)}
          onOpenAppointment={editSitting}
          onCreateAppointment={() => bookOn(today)}
        />
      </div>

      <CalendarCard
        suggestGoogle={suggestGoogle}
        events={events}
        appointments={visibleAppointments}
        busy={busy}
        onOpenEvent={(e) => setOpenId(e.id)}
        onOpenAppointment={editSitting}
        onCreateAppointment={(iso) => bookOn(iso)}
        look={look}
        summary={summary}
        addItems={(iso) => [
          { label: "אירוע באולם", icon: CalendarHeart, onSelect: () => setEditing({ booking: null, seed: { date: iso } }) },
          { label: "פגישה או טעימה", icon: CalendarClock, onSelect: () => bookOn(iso) },
        ]}
      />

      <BookingDrawer
        booking={open}
        venueName={venues.find((v) => v.id === open?.event.venueId)?.name}
        dishes={dishes}
        packages={packages}
        appointments={open ? appointments.filter((a) => a.eventId === open.event.id) : []}
        onOpenAppointment={editSitting}
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
        defaultVenueId={activeVenueId ?? undefined}
        events={events}
        onSave={save}
        onDelete={remove}
        onClose={() => setSitting(null)}
      />
    </div>
  );
}
