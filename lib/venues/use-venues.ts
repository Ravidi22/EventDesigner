"use client";
// The studio's venues, fetched once per screen that needs them.
//
// There is no client-side cache here, and that is a deliberate difference from the catalog. The
// catalog needed one because the studio resolves a placement's product WHILE RENDERING the canvas
// and looks one up MID-DRAG — neither can await. Every venue read in the app happens inside an
// effect and lands in state before anything draws, so a plain fetch is enough. Caching it anyway
// would add a second source of truth to keep honest for no benefit.
import { useCallback, useEffect, useState } from "react";
import type { Venue } from "./types";
import { fetchVenues, createVenue, renameVenue as renameVenueAction } from "./actions";
import { loadActiveVenueId, setActiveVenueId } from "./storage";

export interface VenuesHandle {
  venues: Venue[];
  /** False until the first fetch resolves — "no venues yet" and "not loaded yet" look identical
   *  in the data and mean opposite things to a screen deciding whether to show an empty state. */
  ready: boolean;
  error: string | null;
  /** The switcher's selection, resolved against what actually exists: a stored id pointing at a
   *  deleted venue falls back to the first one rather than to a blank screen. */
  activeVenueId: string | null;
  add: () => Promise<string>;
  rename: (id: string, name: string) => Promise<void>;
  reload: () => Promise<void>;
}

export function useVenues(): VenuesHandle {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await fetchVenues();
    setVenues(list);
    const stored = loadActiveVenueId();
    setActiveId(list.some((v) => v.id === stored) ? stored : (list[0]?.id ?? null));
    return list;
  }, []);

  useEffect(() => {
    let live = true;
    load()
      .catch(() => {
        if (live) setError("לא ניתן לטעון את המתחמים");
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [load]);

  const add = useCallback(async () => {
    const { venues: next, id } = await createVenue();
    setVenues(next);
    // A brand-new property becomes the active one — you created it to draw on it.
    setActiveVenueId(id);
    setActiveId(id);
    return id;
  }, []);

  const rename = useCallback(async (id: string, name: string) => {
    setVenues(await renameVenueAction(id, name));
  }, []);

  const reload = useCallback(async () => {
    await load();
  }, [load]);

  return { venues, ready, error, activeVenueId: activeId, add, rename, reload };
}
