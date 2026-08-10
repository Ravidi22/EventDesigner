"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EventSummary } from "@/lib/events/types";
import { setActiveEventId } from "@/lib/events/storage";
import { useEvents } from "@/lib/events/use-events";
import { venueSwatchClass } from "@/lib/venues/storage";
import { useVenues } from "@/lib/venues/use-venues";
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
  const { events } = useEvents();
  const [greeting, setGreeting] = useState("שלום");
  const [selectedEvent, setSelectedEvent] = useState<EventSummary | null>(null);
  const { activeVenueId } = useActiveVenueScope();
  const { venues } = useVenues();

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
