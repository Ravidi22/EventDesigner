"use client";
// The studio's events, for the two screens that show the whole list (the Dashboard's calendar and
// the Gantt's grid).
//
// No client-side cache, same as venues and for the same reason: every read here lands in state
// before anything renders. Only the catalog needs one, because the canvas resolves a placement's
// product while drawing.
//
// ⚠ PASS `initial` FROM THE SERVER. Both screens that use this now receive the list as a prop from
// their page.tsx, which fetched it during the same request that rendered them. The mount fetch below
// is the fallback for a caller that has none — it is not the normal path, and reinstating it as the
// normal path would put the list back behind a POST that cannot start until React has mounted.
import { useCallback, useEffect, useState } from "react";
import type { EventSummary } from "./types";
import { fetchEvents, patchEvent, type EventPatch } from "./actions";

export interface EventsHandle {
  events: EventSummary[];
  /** False until the first fetch resolves. "No events yet" and "not loaded yet" are identical in
   *  the data and mean opposite things to a screen deciding whether to show an empty state.
   *  True from the first render when the server sent the list. */
  ready: boolean;
  error: string | null;
  patch: (id: string, patch: EventPatch) => Promise<void>;
  reload: () => Promise<void>;
}

export function useEvents(initial?: EventSummary[]): EventsHandle {
  const [events, setEvents] = useState<EventSummary[]>(initial ?? []);
  const [seed, setSeed] = useState(initial);
  const [ready, setReady] = useState(initial !== undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setEvents(await fetchEvents());
  }, []);

  // A newer list from the server wins over what this component was holding — after a router.refresh()
  // following a write, say.
  //
  // Adjusted DURING RENDER rather than in an effect, which is React's own pattern for state derived
  // from a prop. React re-runs this component immediately with the new value and never commits the
  // render in between, so there is no extra paint showing the previous list. An effect would show
  // the stale one for a frame and cost a second render to correct it.
  if (initial !== seed) {
    setSeed(initial);
    setEvents(initial ?? []);
  }

  useEffect(() => {
    if (initial !== undefined) return;
    let live = true;
    load()
      .catch(() => {
        if (live) setError("לא ניתן לטעון את האירועים");
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
    // `initial` is read only to decide whether the server already answered; a caller that passes a
    // list never reaches this effect at all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const patch = useCallback(async (id: string, fields: EventPatch) => {
    setEvents(await patchEvent(id, fields));
  }, []);

  return { events, ready, error, patch, reload: load };
}
