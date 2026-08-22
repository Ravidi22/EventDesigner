// Which venue you are currently working in — and nothing else.
//
// The venues themselves, their wall graphs and their zones moved to Postgres (./actions). What is
// left is the one fact about venues that genuinely belongs to THIS BROWSER: the switcher's current
// selection. It is a view preference, not studio data. Syncing it to the server would mean opening
// the tablet at a venue and changing what the laptop back at the office is looking at.
//
// `null` is a real answer, and the common one on a fresh install: a studio with no venues yet has
// no active venue, and every caller has to render that state rather than dereference a default.
import { storageKey } from "@/lib/storage-keys";

const ACTIVE_KEY = storageKey("activeVenueId");

// Event name for cross-component sync: any mounted screen scoped to "the active venue" (the venue
// plan, the Gantt, the meeting flow's picker) listens for this instead of polling — storage events
// don't fire within the same tab, so switching venues in the sidebar needs its own signal to reach
// screens already on screen.
//
// One event, deliberately. Two channels for one fact is how half the screens end up redrawing and
// the other half quietly don't.
export const VENUE_CHANGED_EVENT = "eve:venue-changed";

export function loadActiveVenueId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveVenueId(id: string): void {
  try {
    window.localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // non-fatal — the in-memory selection still drives this session
  }
  window.dispatchEvent(new CustomEvent(VENUE_CHANGED_EVENT, { detail: id }));
}

export function onActiveVenueChange(fn: (id: string | null) => void): () => void {
  const handler = () => fn(loadActiveVenueId());
  window.addEventListener(VENUE_CHANGED_EVENT, handler);
  return () => window.removeEventListener(VENUE_CHANGED_EVENT, handler);
}

// Per-venue accent, derived from the id so it is stable without being stored. Used by the dashboard
// calendar and the switcher to tell two properties apart at a glance.
const VENUE_SWATCHES = [
  "bg-indigo-500",
  "bg-magenta",
  "bg-amber",
  "bg-success",
  "bg-indigo-300",
  "bg-blush",
];

export function venueSwatchClass(venueId: string | undefined): string {
  if (!venueId) return VENUE_SWATCHES[0];
  let hash = 0;
  for (let i = 0; i < venueId.length; i++) hash = (hash * 31 + venueId.charCodeAt(i)) >>> 0;
  return VENUE_SWATCHES[hash % VENUE_SWATCHES.length];
}

// Types keep flowing through here so the many `from "@/lib/venues/storage"` imports across the app
// don't all have to move on the same day.
export type { Venue, VenuePlan, PlanUnderlay, VenueGeometry } from "./types";
export type { Zone, ZoneKind } from "./zone";
export type { VenueStructure } from "./structure";
