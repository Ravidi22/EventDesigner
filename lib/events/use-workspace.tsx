"use client";
// One resolution of "which event am I in, and what hangs off it", shared by everything on an event
// surface.
//
// The studio screen, the outputs screen and the surface header (components/event-surface.tsx) all
// need the open event. Before this, each asked for it separately — so opening /outputs resolved the
// same event twice, in two serialized POSTs, for one answer that could not differ between them.
// EventSurface resolves it once now and hands it down, in the same shape as MeetingFlowProvider and
// VenuesProvider.
//
// ⚠ IT MUST WORK WITHOUT THE PROVIDER. StudioScreen is embedded BARE inside the meeting flow's
// שיבוץ step (app/meeting/meeting-screen.tsx), where there is no EventSurface — the flow's own
// header already says which event this is. So the hook falls back to fetching for itself when there
// is no provider above it. Whether one exists is fixed for a component's lifetime, so the effect
// below either never runs or runs exactly once; it is not a conditional hook.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { whenSaved } from "@/lib/studio/save-queue";
import { loadActiveEventId } from "./storage";
import { fetchEventWorkspace, type EventWorkspace } from "./workspace";

export interface WorkspaceHandle {
  workspace: EventWorkspace | null;
  /** False until the one round trip lands. Every consumer already had this state — the studio drew
   *  an empty plane, the header said "אין אירוע פעיל" — because the active-event pointer is in this
   *  browser and resolving it was always a request. */
  ready: boolean;
}

/** `null` means "no provider above me", which is a different thing from a provider that has not
 *  resolved yet — that one is `{ workspace: null, ready: false }`. */
const WorkspaceContext = createContext<WorkspaceHandle | null>(null);

/** The one read, for a whole event surface. */
export function EventWorkspaceProvider({ children }: { children: ReactNode }) {
  const handle = useResolvedWorkspace();
  return <WorkspaceContext.Provider value={handle}>{children}</WorkspaceContext.Provider>;
}

/**
 * The open event and its working set.
 *
 * Reads the provider's copy when there is one, and resolves its own when there is not.
 */
export function useEventWorkspace(): WorkspaceHandle {
  const provided = useContext(WorkspaceContext);
  const own = useResolvedWorkspace(provided !== null);
  return provided ?? own;
}

/** The actual fetch. `skip` is set when a provider above has already done it, so the fallback path
 *  in useEventWorkspace costs nothing beyond two unused useState calls. */
function useResolvedWorkspace(skip = false): WorkspaceHandle {
  const [workspace, setWorkspace] = useState<EventWorkspace | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (skip) return;
    let live = true;
    // AFTER THE LAST SAVE, never in front of it (QA 2026-11-20, SK-7). The studio a meeting stage
    // just stepped away from may still be writing its last edit — its queue outlives it
    // (lib/studio/save-queue.ts) — and Next sends server actions one at a time: a read sent now
    // could be queued before that write, open the drawing as it was, and the next edit here would
    // write that over the designer's last one.
    // loadActiveEventId reads localStorage, so it can only run after mount — on the server there is
    // no such thing as "the event this device has open".
    void whenSaved()
      .then(() => fetchEventWorkspace(loadActiveEventId()))
      .then((w) => {
        if (live) setWorkspace(w);
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [skip]);

  return { workspace, ready };
}
