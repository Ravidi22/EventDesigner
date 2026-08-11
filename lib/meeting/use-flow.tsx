"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_FLOW, type MeetingStepId } from "./steps";

// The configured meeting flow, for every surface that shows an event's stage or progress — the
// dashboard's calendar, its focus card, its statistics, the drawer, the Gantt grid.
//
// CONTEXT, NOT A FETCH PER COMPONENT. Five components on the dashboard alone ask this question, and
// when the flow lived in localStorage each one answering it for itself cost nothing. It is a server
// read now, so five hooks would be five requests for one small studio-level list that cannot differ
// between them. The (app) layout reads it once, on the server, and hands it down — which also means
// no hydration flash: the first paint already measures progress against the right list, instead of
// rendering the default flow and correcting itself.
//
// /meeting is outside the (app) group and does its own read (see meeting-screen), because resuming
// has to land on the right stage in the same pass that resolves the event.
const MeetingFlowContext = createContext<MeetingStepId[]>(DEFAULT_FLOW);

export function MeetingFlowProvider({ flow, children }: { flow: MeetingStepId[]; children: ReactNode }) {
  return <MeetingFlowContext.Provider value={flow}>{children}</MeetingFlowContext.Provider>;
}

/** The studio's meeting flow. Falls back to the default outside a provider — a status chip rendered
 *  somewhere unexpected should show a slightly generic stage, not crash. */
export function useMeetingFlow(): MeetingStepId[] {
  return useContext(MeetingFlowContext);
}
