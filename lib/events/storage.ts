// Event list + the active-event pointer. localStorage for now; the swap to a server action
// lives here and nowhere else (same seam as lib/studio/storage.ts).
import { storageKey } from "@/lib/storage-keys";
import type { EventSummary } from "./types";
import { SAMPLE_EVENTS } from "./sample-data";

// .v2: sample events now reference the renamed hall IDs (hall-main → hall-ronit-big, etc.) —
// bumped so a browser with pre-venue saved events falls back to the new seed data instead of
// keeping events whose hallTemplateId points at a hall that no longer exists.
const KEY = storageKey("events.v2");
const ACTIVE_KEY = storageKey("events.active");

// Legacy (pre-v0.3) records stored status/progress instead of a flow step — patch them so
// old localStorage never crashes the dashboard.
function normalize(e: Partial<EventSummary> & { id: string; clientName: string; status?: string }): EventSummary {
  return {
    id: e.id,
    clientName: e.clientName,
    phone: e.phone ?? "",
    date: e.date ?? "",
    hallTemplateId: e.hallTemplateId,
    hallName: e.hallName ?? "",
    guests: e.guests ?? 0,
    step: e.step ?? (e.status === "sent" ? 6 : e.status === "design" ? 5 : 0),
    quoteSentAt: e.quoteSentAt ?? (e.status === "sent" ? e.createdAt : undefined),
    archived: e.archived,
    createdAt: e.createdAt ?? Date.now(),
  };
}

export function loadEvents(): EventSummary[] {
  if (typeof window === "undefined") return SAMPLE_EVENTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return SAMPLE_EVENTS;
    const saved = JSON.parse(raw) as (Partial<EventSummary> & { id: string; clientName: string })[];
    return saved.length ? saved.map(normalize) : SAMPLE_EVENTS;
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
