"use client";

import { useEffect, useState } from "react";
import { DEFAULT_FLOW, type MeetingStepId } from "./steps";
import { loadFlow } from "./storage";

/** The configured meeting flow, hydrated after mount — localStorage is client-only, and every
 *  surface that shows an event's stage or progress has to measure it against the same list the
 *  meeting itself walks. Renders as the default flow until the store answers, which is also what
 *  the server renders, so there is nothing to mismatch. */
export function useMeetingFlow(): MeetingStepId[] {
  const [flow, setFlow] = useState<MeetingStepId[]>(DEFAULT_FLOW);
  useEffect(() => setFlow(loadFlow()), []);
  return flow;
}
