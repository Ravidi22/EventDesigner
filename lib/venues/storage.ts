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
  { id: "venue-ronit", name: "חוות רונית" },
  { id: "venue-hadar", name: "אחוזת הדר" },
  { id: "venue-zayit", name: "גן הזית" },
];

const VENUES_KEY = storageKey("venues");
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

export function setActiveVenueId(id: string): void {
  try {
    window.localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // non-fatal
  }
}

// Appends a new venue with a placeholder name the designer renames later from settings.
export function addVenue(): Venue[] {
  const venues = loadVenues();
  const ordinal = venues.length + 1;
  const venue: Venue = { id: `venue-${Date.now()}`, name: `אולם חדש ${ordinal}` };
  const next = [...venues, venue];
  saveVenues(next);
  setActiveVenueId(venue.id);
  return next;
}
