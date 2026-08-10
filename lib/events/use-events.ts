"use client";
// The studio's events, for the two screens that show the whole list (the Dashboard's calendar and
// the Gantt's grid).
//
// No client-side cache, same as venues and for the same reason: every read here lands in state
// before anything renders. Only the catalog needs one, because the canvas resolves a placement's
// product while drawing.
import { useCallback, useEffect, useState } from "react";
import type { EventSummary } from "./types";
import { fetchEvents, patchEvent, type EventPatch } from "./actions";

export interface EventsHandle {
  events: EventSummary[];
  /** False until the first fetch resolves. "No events yet" and "not loaded yet" are identical in
   *  the data and mean opposite things to a screen deciding whether to show an empty state. */
  ready: boolean;
  error: string | null;
  patch: (id: string, patch: EventPatch) => Promise<void>;
  reload: () => Promise<void>;
}

export function useEvents(): EventsHandle {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setEvents(await fetchEvents());
  }, []);

  useEffect(() => {
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
  }, [load]);

  const patch = useCallback(async (id: string, fields: EventPatch) => {
    setEvents(await patchEvent(id, fields));
  }, []);

  return { events, ready, error, patch, reload: load };
}
