"use client";

import { useEffect, useState } from "react";
import { DEFAULT_VENUES, VENUE_CHANGED_EVENT, loadActiveVenueId } from "./storage";

// The sidebar's globally-active venue, live. Shared by every screen that scopes to "the venue
// you're currently working in" (Dashboard, Gantt) so they can never drift apart, and so switching
// venues in the sidebar reaches them all the same way.
//
// An event names its venue directly (`e.venueId` — it occupies zones OF a venue), so scoping is a
// field read against this id; there's no hall→venue lookup table in between anymore.
export function useActiveVenueScope() {
  const [activeVenueId, setActiveVenueId] = useState(DEFAULT_VENUES[0].id);

  useEffect(() => {
    setActiveVenueId(loadActiveVenueId());
    const onVenueChanged = () => setActiveVenueId(loadActiveVenueId());
    window.addEventListener(VENUE_CHANGED_EVENT, onVenueChanged);
    return () => window.removeEventListener(VENUE_CHANGED_EVENT, onVenueChanged);
  }, []);

  return { activeVenueId };
}
