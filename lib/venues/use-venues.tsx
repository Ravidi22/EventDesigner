"use client";
// The studio's venues, fetched ONCE per navigation — on the server — and shared from there.
//
// WHAT CHANGED, AND WHY IT MATTERS MORE THAN IT LOOKS. This used to be a plain hook that fetched on
// mount, and two components called it: the sidebar's switcher (components/app-shell.tsx) and the
// dashboard (which needs the active venue's NAME for the event drawer). Two callers meant two
// requests for one studio-level list that cannot differ between them — and because Next dispatches
// server actions one at a time per client, the second waited for the first before it even started.
//
// So it is a provider now, in the same shape and for the same reason as MeetingFlowProvider
// (lib/meeting/use-flow.tsx): the (app) layout reads the list server-side, hands it down, and every
// consumer reads the one copy. No mount fetch, no duplicate, and no hydration flash — the first
// paint already names the right property instead of rendering an empty switcher and correcting it.
//
// It also owns the ACTIVE venue id, which used to live in a second hook (./use-active-venue-scope).
// That split was a real bug and not merely untidy: this hook resolved the stored id against the
// list and fell back to the first venue, while the other returned the raw stored value. On a device
// whose remembered venue had since been deleted, the sidebar showed a property while the dashboard
// filtered by a dead id — a switcher pointing at one venue and an empty screen beside it. One
// value, resolved in one place, cannot disagree with itself.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Venue } from "./types";
import { createVenue, renameVenue as renameVenueAction, fetchVenues } from "./actions";
import { VENUE_CHANGED_EVENT, loadActiveVenueId, setActiveVenueId } from "./storage";

export interface VenuesHandle {
  venues: Venue[];
  /** False until the first list is in hand — "no venues yet" and "not loaded yet" look identical
   *  in the data and mean opposite things to a screen deciding whether to show an empty state.
   *  True from the first render when the server sent the list, which is the normal case now. */
  ready: boolean;
  error: string | null;
  /** The switcher's selection, resolved against what actually exists: a stored id pointing at a
   *  deleted venue falls back to the first one rather than to a blank screen. */
  activeVenueId: string | null;
  add: () => Promise<string>;
  rename: (id: string, name: string) => Promise<void>;
  reload: () => Promise<void>;
}

const EMPTY: VenuesHandle = {
  venues: [],
  ready: false,
  error: null,
  activeVenueId: null,
  add: async () => {
    throw new Error("VenuesProvider is missing");
  },
  rename: async () => {
    throw new Error("VenuesProvider is missing");
  },
  reload: async () => {},
};

const VenuesContext = createContext<VenuesHandle>(EMPTY);

/** localStorage does not notify within a tab, so the switcher dispatches its own event — see
 *  ./storage. This is the subscribe half of useSyncExternalStore. */
function subscribeToActiveVenue(onChange: () => void): () => void {
  window.addEventListener(VENUE_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(VENUE_CHANGED_EVENT, onChange);
}

/**
 * Holds the studio's venue list for the whole (app) tree.
 *
 * `initialVenues` comes from the layout's server-side read. It is not optional in practice — every
 * screen that reads venues renders inside this provider — but the context still carries a safe
 * empty default so a component rendered outside one (a preview, a test) degrades to "no venues"
 * rather than crashing.
 */
export function VenuesProvider({
  initialVenues,
  children,
}: {
  initialVenues: Venue[];
  children: ReactNode;
}) {
  const [venues, setVenues] = useState<Venue[]>(initialVenues);
  const [seed, setSeed] = useState(initialVenues);
  const [error, setError] = useState<string | null>(null);

  // The list the server sent is authoritative on every navigation — a venue renamed in another tab
  // must not be overwritten by this component's older copy of it. Adjusted during render rather
  // than in an effect, which is React's own pattern for state derived from a prop.
  if (initialVenues !== seed) {
    setSeed(initialVenues);
    setVenues(initialVenues);
  }

  // Which venue this BROWSER has open is external state — it lives in localStorage and changes
  // through a window event — so it is subscribed to rather than copied into state. That is exactly
  // what useSyncExternalStore is for, and it is the reason this is not an effect: the server
  // snapshot is `null` (there is no such thing as "the venue this device has open" on the server),
  // so the first client render matches the markup that was sent instead of correcting it after.
  const storedId = useSyncExternalStore(subscribeToActiveVenue, loadActiveVenueId, () => null);

  // The one resolution of "which venue am I in", derived rather than stored — so it cannot drift
  // from the list it is resolved against.
  const activeVenueId = useMemo(
    () => (venues.some((v) => v.id === storedId) ? storedId : (venues[0]?.id ?? null)),
    [venues, storedId],
  );

  const reload = useCallback(async () => {
    try {
      setVenues(await fetchVenues());
      setError(null);
    } catch {
      setError("לא ניתן לטעון את המתחמים");
    }
  }, []);

  const add = useCallback(async () => {
    const { venues: next, id } = await createVenue();
    setVenues(next);
    // A brand-new property becomes the active one — you created it to draw on it. setActiveVenueId
    // fires VENUE_CHANGED_EVENT, which the subscription above is listening for, so storedId follows
    // without being set from two places.
    setActiveVenueId(id);
    return id;
  }, []);

  const rename = useCallback(async (id: string, name: string) => {
    setVenues(await renameVenueAction(id, name));
  }, []);

  const value = useMemo<VenuesHandle>(
    () => ({ venues, ready: true, error, activeVenueId, add, rename, reload }),
    [venues, error, activeVenueId, add, rename, reload],
  );

  return <VenuesContext.Provider value={value}>{children}</VenuesContext.Provider>;
}

/** The studio's venues, plus which one this browser is working in. */
export function useVenues(): VenuesHandle {
  return useContext(VenuesContext);
}
