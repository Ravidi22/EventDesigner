"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EventSummary } from "@/lib/events/types";
import { SAMPLE_EVENTS } from "@/lib/events/sample-data";
import { loadEvents, setActiveEventId } from "@/lib/events/storage";
import { DEFAULT_VENUES, loadActiveVenueId, loadVenues, venueSwatchClass, type Venue } from "@/lib/venues/storage";
import { CalendarCard } from "./calendar-card";
import { TodayFocus } from "./today-focus";
import { EventStats } from "./event-stats";

// F-1.1: the Dashboard's old event-card grid (filters, search, sort) moved to the Gantt tab.
// This screen is "my week" at a glance — Today's Focus + Statistics up top (each half-width),
// the week/month calendar below with its own venue filter. Everything downstream of
// `selectedVenueIds` (default: the sidebar's currently-active venue) shares the same scope.
export function DashboardScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<EventSummary[]>(SAMPLE_EVENTS);
  const [venues, setVenues] = useState<Venue[]>(DEFAULT_VENUES);
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>([DEFAULT_VENUES[0].id]);
  const [greeting, setGreeting] = useState("שלום");

  useEffect(() => {
    setEvents(loadEvents());
    setVenues(loadVenues());
    setSelectedVenueIds([loadActiveVenueId()]);
    const h = new Date().getHours();
    setGreeting(h < 12 ? "בוקר טוב" : h < 18 ? "צהריים טובים" : "ערב טוב");
  }, []);

  // An event names its venue directly now (it occupies zones OF a venue), so filtering and
  // colouring by venue is a field read — no hall→venue lookup table in between.
  const visibleEvents = useMemo(
    () => events.filter((e) => !e.archived && selectedVenueIds.includes(e.venueId ?? "")),
    [events, selectedVenueIds],
  );

  const openEvent = (e: EventSummary) => {
    setActiveEventId(e.id);
    router.push("/meeting");
  };

  const getVenueColor = (e: EventSummary) => venueSwatchClass(e.venueId);

  return (
    <div className="px-8 py-8">
      <div className="mb-6">
        <p className="text-sm text-muted">{greeting}, דניאל</p>
        <h2 className="mt-1 font-display text-h1 text-ink text-balance">האירועים שלך</h2>
      </div>

      <div className="mb-6 grid gap-6 sm:grid-cols-2">
        <TodayFocus events={visibleEvents} venueColor={getVenueColor} onOpenEvent={openEvent} />
        <EventStats events={visibleEvents} />
      </div>

      <CalendarCard
        events={visibleEvents}
        venueColor={getVenueColor}
        onOpenEvent={openEvent}
        venues={venues}
        selectedVenueIds={selectedVenueIds}
        onChangeSelectedVenueIds={setSelectedVenueIds}
      />
    </div>
  );
}
