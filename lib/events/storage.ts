// Event list + the active-event pointer. localStorage for now; the swap to a server action
// lives here and nowhere else (same seam as lib/studio/storage.ts).
import { storageKey } from "@/lib/storage-keys";
import type { EventSummary } from "./types";
import { SAMPLE_EVENTS } from "./sample-data";

// .v3: events reference venue ZONES now, not a HallTemplate. A saved v2 event's hallTemplateId
// points at a model that no longer exists and cannot be mapped to a zone id, so the bump drops
// those records to the seed rather than carrying an event whose geometry resolves to nothing.
//
// .v4: `step` indexes the CONFIGURED meeting flow (lib/meeting/steps.ts), which is five stages and
// no longer has the two that waited on an outside table-layout tool. A v3 record's number means a
// different stage under the new list, and nothing in the record itself says which vintage it is —
// hence a key, and a migrating read rather than a silent reinterpretation.
const KEY = storageKey("events.v4");
const V3_KEY = storageKey("events.v3");
const ACTIVE_KEY = storageKey("events.active");

/** v3 step index → v4. The old flow was details / gallery / wait-for-a-sketch / import-the-sketch /
 *  gallery / placement / quote: the two stages that waited on an outside tool are gone, and the hall
 *  sketch is drawn in the meeting itself now. Anything that had reached the first gallery pass had
 *  passed it, so those all land on the gallery — the hall stage in front of it stays reachable
 *  either way, since `step` is a furthest mark and not a position. */
const V3_STEP: number[] = [0, 2, 2, 2, 2, 3, 4];

function migrateV3(): unknown[] | null {
  try {
    const raw = window.localStorage.getItem(V3_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { step?: number }[];
    if (!Array.isArray(saved)) return null;
    const next = saved.map((e) => ({ ...e, step: V3_STEP[e.step ?? 0] ?? 0 }));
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.localStorage.removeItem(V3_KEY);
    return next;
  } catch {
    return null; // a blocked store just falls through to the seed
  }
}

// Legacy (pre-v0.3) records stored status/progress instead of a flow step — patch them so
// old localStorage never crashes the dashboard.
function normalize(e: Partial<EventSummary> & { id: string; clientName: string; status?: string }): EventSummary {
  return {
    id: e.id,
    clientName: e.clientName,
    phone: e.phone ?? "",
    // The contact block and start time are part of the record, not decoration: a normalize that
    // rebuilds the event field by field has to carry them, or a reload quietly empties them.
    contactName: e.contactName,
    contact2Name: e.contact2Name,
    contact2Phone: e.contact2Phone,
    date: e.date ?? "",
    time: e.time,
    meetingDate: e.meetingDate,
    venueId: e.venueId,
    zoneIds: e.zoneIds ?? [],
    zonesLabel: e.zonesLabel ?? "",
    guests: e.guests ?? 0,
    step: e.step ?? (e.status === "sent" ? 4 : e.status === "design" ? 3 : 0),
    quoteSentAt: e.quoteSentAt ?? (e.status === "sent" ? e.createdAt : undefined),
    archived: e.archived,
    createdAt: e.createdAt ?? Date.now(),
  };
}

export function loadEvents(): EventSummary[] {
  if (typeof window === "undefined") return SAMPLE_EVENTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    const saved = (raw ? JSON.parse(raw) : migrateV3()) as
      | (Partial<EventSummary> & { id: string; clientName: string })[]
      | null;
    return saved?.length ? saved.map(normalize) : SAMPLE_EVENTS;
  } catch {
    return SAMPLE_EVENTS;
  }
}

export function saveEvents(events: EventSummary[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(events));
  } catch {
    // non-fatal
  }
}

export function addEvent(event: EventSummary): EventSummary[] {
  const next = [event, ...loadEvents().filter((e) => e.id !== event.id)];
  saveEvents(next);
  return next;
}

// Patch an event in place (details edit, flow progress, archive). Returns the new list.
export function updateEvent(id: string, patch: Partial<EventSummary>): EventSummary[] {
  const next = loadEvents().map((e) => (e.id === id ? { ...e, ...patch } : e));
  saveEvents(next);
  return next;
}

// F-1.2: the flow only ever moves the furthest-reached step forward; revisiting never regresses it.
export function reachStep(id: string, step: number): EventSummary[] {
  const next = loadEvents().map((e) => (e.id === id ? { ...e, step: Math.max(e.step, step) } : e));
  saveEvents(next);
  return next;
}

export function loadActiveEventId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveEventId(id: string): void {
  try {
    window.localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // non-fatal
  }
}

// The active event, resolved against the list — for the shell's "active event" context.
export function activeEvent(): EventSummary | null {
  const id = loadActiveEventId();
  const events = loadEvents();
  return (id && events.find((e) => e.id === id)) || events[0] || null;
}
