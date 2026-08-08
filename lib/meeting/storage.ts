// The configured meeting flow (Settings → מצב פגישה). localStorage for now; the swap to a server
// action lives here and nowhere else, same seam as lib/settings/storage.ts.
//
// Studio-level, not per event or per venue: a designer runs their meeting the same way at every
// property, and an event mid-flow follows whatever the flow says today (its `step` is clamped).
import { storageKey } from "@/lib/storage-keys";
import { DEFAULT_FLOW, normalizeFlow, type MeetingStepId } from "./steps";

const KEY = storageKey("meeting.flow");

export function loadFlow(): MeetingStepId[] {
  if (typeof window === "undefined") return DEFAULT_FLOW;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_FLOW;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? normalizeFlow(parsed) : DEFAULT_FLOW;
  } catch {
    return DEFAULT_FLOW;
  }
}

/** Normalises before writing, so a bad list can never be persisted in the first place. */
export function saveFlow(flow: readonly MeetingStepId[]): MeetingStepId[] {
  const next = normalizeFlow(flow);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // non-fatal — the flow still switched for this session
  }
  return next;
}

/** Back to the flow the app ships with. Drops the key rather than writing the default, so a later
 *  change to DEFAULT_FLOW reaches a studio that never customised it. */
export function resetFlow(): MeetingStepId[] {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // non-fatal
  }
  return DEFAULT_FLOW;
}
