// Venue switcher (sidebar): which physical location the studio is currently working from.
// Distinct from lib/setup (hall shell templates) — a venue is the business location itself.
// localStorage for now; the swap to a server action lives here and nowhere else.
import { storageKey } from "@/lib/storage-keys";

export interface Venue {
  id: string;
  name: string;
  /** Optional custom venue logo (data URL or remote URL); falls back to initials when unset. */
  logoUrl?: string;
}

export const DEFAULT_VENUES: Venue[] = [
  { id: "venue-ronit", name: "חוות רונית אמארה" },
  { id: "venue-hadar", name: "אחוזת הדר" },
  { id: "venue-zayit", name: "גן הזית" },
];

// .v2: venue-ronit's display name changed ("חוות רונית" → "חוות רונית אמארה") — bumped so a
// browser with the old saved name picks up the rename.
const VENUES_KEY = storageKey("venues.v2");
const ACTIVE_KEY = storageKey("activeVenueId");

export function loadVenues(): Venue[] {
  if (typeof window === "undefined") return DEFAULT_VENUES;
  try {
    const raw = window.localStorage.getItem(VENUES_KEY);
    return raw ? (JSON.parse(raw) as Venue[]) : DEFAULT_VENUES;
  } catch {
    return DEFAULT_VENUES;
  }
}

function saveVenues(venues: Venue[]): void {
  try {
    window.localStorage.setItem(VENUES_KEY, JSON.stringify(venues));
  } catch {
    // non-fatal
  }
}

export function loadActiveVenueId(): string {
  if (typeof window === "undefined") return DEFAULT_VENUES[0].id;
  try {
    return window.localStorage.getItem(ACTIVE_KEY) ?? DEFAULT_VENUES[0].id;
  } catch {
    return DEFAULT_VENUES[0].id;
  }
}

// Event name for cross-component sync: any mounted screen scoped to "the active venue"
// (Halls, Gantt, the meeting flow's hall picker) listens for this instead of polling —
// storage events don't fire within the same tab, so switching venues in the sidebar needs
// its own signal to reach screens already on screen.
export const VENUE_CHANGED_EVENT = "eve:venue-changed";

export function setActiveVenueId(id: string): void {
  try {
    window.localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // non-fatal
  }
  window.dispatchEvent(new CustomEvent(VENUE_CHANGED_EVENT, { detail: id }));
}

// Appends a new venue with a placeholder name the designer renames inline from the switcher.
export function addVenue(): Venue[] {
  const venues = loadVenues();
  const ordinal = venues.length + 1;
  const venue: Venue = { id: `venue-${Date.now()}`, name: `מתחם חדש ${ordinal}` };
  const next = [...venues, venue];
  saveVenues(next);
  setActiveVenueId(venue.id);
  return next;
}

export function renameVenue(id: string, name: string): Venue[] {
  const trimmed = name.trim();
  const next = loadVenues().map((v) => (v.id === id ? { ...v, name: trimmed || v.name } : v));
  saveVenues(next);
  return next;
}
