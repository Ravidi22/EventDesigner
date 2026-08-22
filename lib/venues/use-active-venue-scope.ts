"use client";

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
//
// ⚠ IT NO LONGER READS localStorage ITSELF. It delegates to VenuesProvider, which resolves the
// stored id against the list that actually exists. Reading the raw stored value here — which is
// what this file used to do — meant a device whose remembered venue had been deleted got a live
// switcher pointing at the first property and a dashboard filtering by the dead id, i.e. an empty
// screen next to a populated sidebar. The two answers are one answer now; see use-venues.tsx.
import { useVenues } from "./use-venues";

export function useActiveVenueScope() {
  const { activeVenueId } = useVenues();
  return { activeVenueId };
}
