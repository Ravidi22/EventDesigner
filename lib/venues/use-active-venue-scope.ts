"use client";

import { useEffect, useState } from "react";
import { VENUE_CHANGED_EVENT, loadActiveVenueId } from "./storage";

// The sidebar's globally-active venue, live. Shared by every screen that scopes to "the venue
// you're currently working in" (Dashboard, Gantt) so they can never drift apart, and so switching
// venues in the sidebar reaches them all the same way.
//
// An event names its venue directly (`e.venueId` — it occupies zones OF a venue), so scoping is a
// field read against this id; there's no hall→venue lookup table in between.
//
// It starts NULL rather than at a first sample venue, because on a fresh studio there is genuinely
// no active venue until one is created. Screens read this as "show everything / show the empty
// state", never as "something went wrong".
export function useActiveVenueScope() {
  const [activeVenueId, setActiveVenueId] = useState<string | null>(null);

  useEffect(() => {
    setActiveVenueId(loadActiveVenueId());
    const onVenueChanged = () => setActiveVenueId(loadActiveVenueId());
    window.addEventListener(VENUE_CHANGED_EVENT, onVenueChanged);
    return () => window.removeEventListener(VENUE_CHANGED_EVENT, onVenueChanged);
  }, []);

  return { activeVenueId };
}
