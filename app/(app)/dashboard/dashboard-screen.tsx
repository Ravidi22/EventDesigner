"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EventSummary } from "@/lib/events/types";
import { SAMPLE_EVENTS } from "@/lib/events/sample-data";
import { loadEvents, setActiveEventId } from "@/lib/events/storage";
import { loadVenues, venueSwatchClass } from "@/lib/venues/storage";
import { useActiveVenueScope } from "@/lib/venues/use-active-venue-scope";
import { CalendarCard } from "./calendar-card";
import { TodayFocus } from "./today-focus";
import { EventStats } from "./event-stats";
import { EventDetailDrawer } from "./event-detail-drawer";

// F-1.1: the Dashboard's old event-card grid (filters, search, sort) moved to the Gantt tab.
// This screen is "my week" at a glance — Today's Focus + Statistics up top (each half-width),
// the week/month calendar below. There's no venue picker on this page anymore — every section
// scopes to whichever venue is active in the sidebar (useActiveVenueScope), the one shared
// source of truth also used by /gantt, so switching venues in the sidebar updates everything.
export function DashboardScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<EventSummary[]>(SAMPLE_EVENTS);
  const [greeting, setGreeting] = useState("שלום");
  const [selectedEvent, setSelectedEvent] = useState<EventSummary | null>(null);
  const { activeVenueId, eventVenueId } = useActiveVenueScope();

  useEffect(() => {
    setEvents(loadEvents());
    const h = new Date().getHours();
    setGreeting(h < 12 ? "בוקר טוב" : h < 18 ? "צהריים טובים" : "ערב טוב");
  }, []);

  const visibleEvents = useMemo(() => {
    const active = events.filter((e) => !e.archived);
    return active.filter((e) => eventVenueId(e) === activeVenueId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, activeVenueId]);

  // Calendar clicks open the drawer for a quick look; Today's Focus keeps jumping straight
  // into the meeting flow (its own, separately-scoped interaction — unchanged here).
  const openInMeeting = (e: EventSummary) => {
    setActiveEventId(e.id);
    router.push("/meeting");
  };

  // Color by hall, not venue — every visible event already belongs to the one active venue,
  // so a venue-level color would be uniform and pointless; the hall is what still varies.
  const getVenueColor = (e: EventSummary) => venueSwatchClass(e.hallTemplateId);

  // Every event reaching the drawer already belongs to activeVenueId (visibleEvents is filtered
  // to it), so there's one venue name to resolve, not one per event.
  const activeVenueName = useMemo(() => loadVenues().find((v) => v.id === activeVenueId)?.name, [activeVenueId]);

  return (
    <div className="px-8 py-8">
      <div className="mb-6">
        <p className="text-sm text-muted">{greeting}, דניאל</p>
        <h2 className="mt-1 font-display text-h1 text-ink text-balance">האירועים שלך</h2>
      </div>

      <div className="mb-6 grid gap-6 sm:grid-cols-2">
        <TodayFocus events={visibleEvents} venueColor={getVenueColor} onOpenEvent={openInMeeting} />
        <EventStats events={visibleEvents} />
      </div>

      <CalendarCard events={visibleEvents} onOpenEvent={setSelectedEvent} />

      <EventDetailDrawer
        event={selectedEvent}
        venueName={activeVenueName}
        onClose={() => setSelectedEvent(null)}
        onContinue={openInMeeting}
      />
    </div>
  );
}
