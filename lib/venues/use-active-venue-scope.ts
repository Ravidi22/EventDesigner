"use client";

import { useEffect, useMemo, useState } from "react";
import type { EventSummary } from "@/lib/events/types";
import type { HallTemplate } from "@/lib/setup/types";
import { loadTemplates } from "@/lib/setup/storage";
import { SEED_TEMPLATES } from "@/lib/setup/sample-data";
import { DEFAULT_VENUES, VENUE_CHANGED_EVENT, loadActiveVenueId } from "./storage";

// The sidebar's globally-active venue, plus the hall→venue lookup needed to tell which venue
// an event belongs to (an event only knows its hall, not its venue directly). Shared by every
// screen that scopes to "the venue you're currently working in" (Dashboard, Gantt) so they
// can never drift apart, and so switching venues in the sidebar reaches them all the same way.
export function useActiveVenueScope() {
  const [activeVenueId, setActiveVenueIdState] = useState(DEFAULT_VENUES[0].id);
  const [templates, setTemplates] = useState<HallTemplate[]>(SEED_TEMPLATES);

  useEffect(() => {
    setTemplates(loadTemplates());
    setActiveVenueIdState(loadActiveVenueId());
    const onVenueChanged = () => setActiveVenueIdState(loadActiveVenueId());
    window.addEventListener(VENUE_CHANGED_EVENT, onVenueChanged);
    return () => window.removeEventListener(VENUE_CHANGED_EVENT, onVenueChanged);
  }, []);

  const hallVenue = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of templates) map.set(t.id, t.venueId);
    return map;
  }, [templates]);

  const eventVenueId = (e: EventSummary): string | undefined => (e.hallTemplateId ? hallVenue.get(e.hallTemplateId) : undefined);

  return { activeVenueId, eventVenueId };
}
