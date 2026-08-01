// Venue + zone persistence, and the active-venue selection the sidebar switcher drives.
// localStorage for now; the swap to server actions lives here and nowhere else (same seam pattern
// as lib/studio/storage.ts). This module is the public entry point for the venue model — callers
// import Venue/Zone through here rather than reaching past it into ./types or ./zone.
import { storageKey } from "@/lib/storage-keys";
import { DEFAULT_VENUES, DEFAULT_ZONES, structureForVenue } from "./sample-data";
import { emptyPlan } from "./types";
import type { Venue, VenuePlan, PlanUnderlay } from "./types";
import type { Zone, ZoneKind } from "./zone";
import type { VenueStructure } from "./structure";

export type { Venue, VenuePlan, PlanUnderlay, Zone, ZoneKind, VenueStructure };
export { DEFAULT_VENUES, DEFAULT_ZONES, structureForVenue };

// .v2: venue-ronit's display name changed ("חוות רונית" → "חוות רונית אמארה") — bumped so a
// browser with the old saved name picks up the rename.
const VENUES_KEY = storageKey("venues.v2");
const ZONES_KEY = storageKey("venues.zones");
const STRUCTURE_KEY = storageKey("venues.structure");
const ACTIVE_KEY = storageKey("activeVenueId");

function read<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as T[];
    return saved.length ? saved : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // non-fatal: the in-memory list is still returned so the flow completes
  }
}

// --- venues ----------------------------------------------------------------

// A venue saved before the site plan existed carries no `plan` — the sidebar's addVenue could
// always create one, and did. Filling it in on read keeps that one missing field from reaching
// the plan editor as a crash, and costs nothing for records that already have it.
const withPlan = (v: Venue): Venue => (v.plan ? v : { ...v, plan: emptyPlan() });

export function loadVenues(): Venue[] {
  return read<Venue>(VENUES_KEY, DEFAULT_VENUES).map(withPlan);
}

function writeVenues(venues: Venue[]): void {
  write(VENUES_KEY, venues);
}

export function saveVenue(venue: Venue): Venue[] {
  const next = loadVenues().map((v) => (v.id === venue.id ? venue : v));
  if (!next.some((v) => v.id === venue.id)) next.push(venue);
  writeVenues(next);
  return next;
}

export function findVenue(id: string): Venue | undefined {
  return loadVenues().find((v) => v.id === id);
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
// (the venue plan, Gantt, the meeting flow's hall picker) listens for this instead of polling —
// storage events don't fire within the same tab, so switching venues in the sidebar needs
// its own signal to reach screens already on screen.
//
// One event, deliberately. The plan editor subscribes through onActiveVenueChange below rather
// than declaring a second name of its own: two channels for one fact is how half the screens end
// up redrawing and the other half quietly don't.
export const VENUE_CHANGED_EVENT = "eve:venue-changed";

export function setActiveVenueId(id: string): void {
  try {
    window.localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // non-fatal
  }
  try {
    window.dispatchEvent(new CustomEvent(VENUE_CHANGED_EVENT, { detail: id }));
  } catch {
    // non-fatal (SSR / no window)
  }
}

/** Subscribe to venue switches. Returns an unsubscribe for the effect's cleanup.
 *  The id comes off the event when it carries one and is re-read from storage otherwise, so a
 *  caller that dispatches the bare event still gets the right answer. */
export function onActiveVenueChange(fn: (id: string) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<string>).detail ?? loadActiveVenueId());
  window.addEventListener(VENUE_CHANGED_EVENT, handler);
  return () => window.removeEventListener(VENUE_CHANGED_EVENT, handler);
}

// Appends a new venue with a placeholder name and an empty plan, and makes it active.
// A venue with no zones is not a real end state — the caller is expected to land the designer on
// the plan editor to draw the first zone rather than leave a bare venue sitting in the switcher.
export function addVenue(): Venue[] {
  const venues = loadVenues();
  const venue: Venue = {
    id: `venue-${Date.now()}`,
    name: `מתחם חדש ${venues.length + 1}`,
    plan: emptyPlan(),
  };
  const next = [...venues, venue];
  writeVenues(next);
  setActiveVenueId(venue.id);
  return next;
}

export function renameVenue(id: string, name: string): Venue[] {
  const trimmed = name.trim();
  const next = loadVenues().map((v) => (v.id === id ? { ...v, name: trimmed || v.name } : v));
  writeVenues(next);
  return next;
}

// Deterministic per-venue color, for calendar/timeline surfaces that need to distinguish
// venues by color alongside (not instead of) their name — cycles through existing design-
// system swatches (globals.css @theme) rather than introducing new hues.
const VENUE_SWATCHES = ["bg-accent", "bg-success", "bg-warn", "bg-magenta", "bg-indigo-300", "bg-peach"];
export function venueSwatchClass(venueId: string | undefined): string {
  if (!venueId) return "bg-faint";
  let hash = 0;
  for (let i = 0; i < venueId.length; i++) hash = (hash * 31 + venueId.charCodeAt(i)) >>> 0;
  return VENUE_SWATCHES[hash % VENUE_SWATCHES.length];
}

// --- zones -----------------------------------------------------------------
// Stored as one flat list across all venues and filtered by venueId, rather than nested inside
// each Venue: a zone is edited far more often than the venue that owns it, and this is the shape
// the eventual `zones` table has anyway.

export function loadZones(): Zone[] {
  return read(ZONES_KEY, DEFAULT_ZONES);
}

export function zonesForVenue(venueId: string): Zone[] {
  return loadZones().filter((z) => z.venueId === venueId);
}

export function findZone(id: string): Zone | undefined {
  return loadZones().find((z) => z.id === id);
}

export function saveZone(zone: Zone): Zone[] {
  const zones = loadZones();
  const next = zones.some((z) => z.id === zone.id) ? zones.map((z) => (z.id === zone.id ? zone : z)) : [...zones, zone];
  write(ZONES_KEY, next);
  return next;
}

export function deleteZone(id: string): Zone[] {
  const next = loadZones().filter((z) => z.id !== id);
  write(ZONES_KEY, next);
  return next;
}

/** Replaces this venue's zones wholesale, leaving every other venue's alone.
 *
 *  The per-zone save/delete pair can't express an undo: stepping back over "I named that room"
 *  means the list is simply *shorter* than what is on disk, and there is no delete call to derive
 *  from a snapshot. An editor holding the whole list in history writes the whole list. */
export function saveZonesForVenue(venueId: string, zones: Zone[]): Zone[] {
  const next = [...loadZones().filter((z) => z.venueId !== venueId), ...zones];
  write(ZONES_KEY, next);
  return next;
}

// --- structure -------------------------------------------------------------
// One structure per venue, keyed by venue id. Stored apart from the Venue record because it is the
// thing that changes constantly while the venue's name and calibration sit still.

export function loadStructure(venueId: string): VenueStructure {
  const seed = structureForVenue(venueId);
  if (typeof window === "undefined") return seed;
  try {
    const raw = window.localStorage.getItem(`${STRUCTURE_KEY}.${venueId}`);
    return raw ? (JSON.parse(raw) as VenueStructure) : seed;
  } catch {
    return seed;
  }
}

export function saveStructure(venueId: string, structure: VenueStructure): void {
  try {
    window.localStorage.setItem(`${STRUCTURE_KEY}.${venueId}`, JSON.stringify(structure));
  } catch {
    // non-fatal: the in-memory structure the editor holds is still authoritative for this session
  }
}
