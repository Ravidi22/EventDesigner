"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EventSummary } from "@/lib/events/types";
import { setActiveEventId } from "@/lib/events/storage";
import { useEvents } from "@/lib/events/use-events";
import type { Appointment } from "@/lib/appointments/types";
import { useAppointments } from "@/lib/appointments/use-appointments";
import { venueSwatchClass } from "@/lib/venues/storage";
import { useVenues } from "@/lib/venues/use-venues";
import { useActiveVenueScope } from "@/lib/venues/use-active-venue-scope";
import { CalendarCard } from "./calendar-card";
import { TodayFocus } from "./today-focus";
import { EventStats } from "./event-stats";
import { EventDetailDrawer } from "./event-detail-drawer";
import { AppointmentDialog } from "./appointment-dialog";
import { toISODate } from "./dashboard-view-utils";

// F-1.1: the Dashboard's old event-card grid (filters, search, sort) moved to the Gantt tab.
// This screen is "my week" at a glance — Today's Focus + Statistics up top (each half-width),
// the week/month calendar below. There's no venue picker on this page anymore — every section
// scopes to whichever venue is active in the sidebar (useActiveVenueScope), the one shared
// source of truth also used by /gantt, so switching venues in the sidebar updates everything.
//
// It is also the only screen in the app that WRITES a meeting. Everything else here navigates:
// clicking an event opens its drawer or jumps into the meeting flow. Booking a meeting happens
// here, on the day it belongs to, because that is where a designer is standing when a client asks
// "can you do the 12th?".
export function DashboardScreen() {
  const router = useRouter();
  const { events } = useEvents();
  const { appointments, save, remove } = useAppointments();
  const [greeting, setGreeting] = useState("שלום");
  const [selectedEvent, setSelectedEvent] = useState<EventSummary | null>(null);
  const { activeVenueId } = useActiveVenueScope();
  const { venues } = useVenues();

  // The meeting dialog's state: which record it is editing (null = booking a new one) and, for a new
  // one, which day was clicked. Kept as one object so opening for a new meeting can't leave a stale
  // `editing` behind — the bug where clicking "+" on the 12th silently edits the meeting you opened
  // a minute ago.
  const [booking, setBooking] = useState<{
    editing: Appointment | null;
    date: string;
    /** Pre-attach the new meeting to this event — set when booking from an event's own drawer. */
    eventId?: string;
  } | null>(null);

  // After mount, so the server and the first client render agree — the hour is not the same fact
  // in both places.
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "בוקר טוב" : h < 18 ? "צהריים טובים" : "ערב טוב");
  }, []);

  // An event names its venue directly now (it occupies zones OF a venue), so scoping to the
  // sidebar's active venue is a field read — no hall→venue lookup table in between.
  const visibleEvents = useMemo(
    () => events.filter((e) => !e.archived && e.venueId === activeVenueId),
    [events, activeVenueId],
  );

  // Meetings scope the same way, with one deliberate difference: a meeting that names NO venue shows
  // on every venue's dashboard rather than on none. That is the prospect case — a first meeting
  // booked before anyone has decided where the wedding will be — and hiding it until a property is
  // chosen would lose exactly the meeting where the property gets chosen.
  const visibleAppointments = useMemo(
    () => appointments.filter((a) => !a.venueId || a.venueId === activeVenueId),
    [appointments, activeVenueId],
  );

  // Calendar clicks open the drawer for a quick look; Today's Focus keeps jumping straight
  // into the meeting flow (its own, separately-scoped interaction — unchanged here).
  const openInMeeting = (e: EventSummary) => {
    setActiveEventId(e.id);
    router.push("/meeting");
  };

  // Color by zone, not venue — every visible event already belongs to the one active venue, so a
  // venue-level color would be uniform and pointless; the zone it occupies is what still varies.
  // Multi-zone events key off the first, the designer's own primary.
  const getVenueColor = (e: EventSummary) => venueSwatchClass(e.zoneIds[0]);

  // Every event reaching the drawer already belongs to activeVenueId (visibleEvents is filtered
  // to it), so there's one venue name to resolve, not one per event.
  // The one venue read in the app that used to happen during render. It is state now, because the
  // list comes from the server — the drawer shows the name once it arrives.
  const activeVenueName = useMemo(
    () => venues.find((v) => v.id === activeVenueId)?.name,
    [venues, activeVenueId],
  );

  // The open event's own diary, for the drawer. Off `appointments` rather than the venue-filtered
  // list: a meeting attached to this event belongs in its drawer whichever venue it was booked
  // under, and the event is the tighter filter anyway.
  const selectedEventAppointments = useMemo(
    () => (selectedEvent ? appointments.filter((a) => a.eventId === selectedEvent.id) : []),
    [appointments, selectedEvent],
  );

  const bookOn = (iso: string) => setBooking({ editing: null, date: iso });
  const bookToday = () => bookOn(toISODate(new Date()));
  const editAppointment = (a: Appointment) => setBooking({ editing: a, date: a.date });

  // From an event's drawer: a new meeting already attached to it. Dated TODAY, not on the event's
  // own day — you book the next sit-down for some time soon; the wedding is months out and is not
  // when you meet about it.
  const bookForEvent = (e: EventSummary) =>
    setBooking({ editing: null, date: toISODate(new Date()), eventId: e.id });

  return (
    <div className="px-8 py-8">
      <div className="mb-6">
        <p className="text-sm text-muted">{greeting}, דניאל</p>
        <h2 className="mt-1 font-display text-h1 text-ink text-balance">האירועים שלך</h2>
      </div>

      {/* `lg:`, not `sm:`. The two-up row is measured against the CONTENT width, and the sidebar
          takes a fixed 258px out of it before this grid sees anything — so at the sm breakpoint
          (640px viewport) each of these cards got about 147px, which is narrower than the statistics
          tiles inside one of them. They stack until there is genuinely room for two. */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <TodayFocus
          events={visibleEvents}
          appointments={visibleAppointments}
          venueColor={getVenueColor}
          onOpenEvent={openInMeeting}
          onOpenAppointment={editAppointment}
          onCreateAppointment={bookToday}
        />
        <EventStats events={visibleEvents} />
      </div>

      <CalendarCard
        events={visibleEvents}
        appointments={visibleAppointments}
        onOpenEvent={setSelectedEvent}
        onOpenAppointment={editAppointment}
        onCreateAppointment={bookOn}
      />

      <EventDetailDrawer
        event={selectedEvent}
        venueName={activeVenueName}
        appointments={selectedEventAppointments}
        onClose={() => setSelectedEvent(null)}
        onContinue={openInMeeting}
        onOpenAppointment={editAppointment}
        onCreateAppointment={bookForEvent}
      />

      <AppointmentDialog
        open={booking !== null}
        appointment={booking?.editing ?? null}
        defaultDate={booking?.date ?? ""}
        defaultEventId={booking?.eventId}
        defaultVenueId={activeVenueId ?? undefined}
        events={visibleEvents}
        onSave={save}
        onDelete={remove}
        onClose={() => setBooking(null)}
      />
    </div>
  );
}
