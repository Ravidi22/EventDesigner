"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EventSummary } from "@/lib/events/types";
import { SAMPLE_EVENTS } from "@/lib/events/sample-data";
import { loadEvents, setActiveEventId } from "@/lib/events/storage";
import type { HallTemplate } from "@/lib/setup/types";
import { loadTemplates } from "@/lib/setup/storage";
import { SEED_TEMPLATES } from "@/lib/setup/sample-data";
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
  const [templates, setTemplates] = useState<HallTemplate[]>(SEED_TEMPLATES);
  const [venues, setVenues] = useState<Venue[]>(DEFAULT_VENUES);
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>([DEFAULT_VENUES[0].id]);
  const [greeting, setGreeting] = useState("שלום");

  useEffect(() => {
    setEvents(loadEvents());
    setTemplates(loadTemplates());
    setVenues(loadVenues());
    setSelectedVenueIds([loadActiveVenueId()]);
    const h = new Date().getHours();
    setGreeting(h < 12 ? "בוקר טוב" : h < 18 ? "צהריים טובים" : "ערב טוב");
  }, []);

  // An event only knows its hall (hallTemplateId); the hall is what actually belongs to a
  // venue, so filtering/coloring by venue has to go through this lookup.
  const hallVenue = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of templates) map.set(t.id, t.venueId);
    return map;
  }, [templates]);

  const eventVenueId = (e: EventSummary): string | undefined => (e.hallTemplateId ? hallVenue.get(e.hallTemplateId) : undefined);

  const visibleEvents = useMemo(() => {
    const active = events.filter((e) => !e.archived);
    return active.filter((e) => selectedVenueIds.includes(eventVenueId(e) ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, selectedVenueIds, hallVenue]);

  const openEvent = (e: EventSummary) => {
    setActiveEventId(e.id);
    router.push("/meeting");
  };

  const getVenueColor = (e: EventSummary) => venueSwatchClass(eventVenueId(e));

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
