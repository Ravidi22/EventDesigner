"use client";
// Which event THIS DEVICE currently has open. That is all that is left here.
//
// The events themselves moved to Postgres (lib/events/actions.ts) — the list, the details, the
// meeting-flow progress. What stayed is the pointer, and it stayed for the same reason the active
// venue did: it is a per-device UI position, not studio data. The designer opens an event on the
// laptop they are driving the meeting from; the tablet the client is holding is on the gallery, and
// syncing the two would yank one of them somewhere nobody asked to go.
//
// The localStorage MIGRATIONS that used to live here (events.v3 → v4, and a normalize() that
// patched pre-v0.3 records field by field on every read) are gone with the records they repaired.
// A shape change is a schema migration now — one that runs once, against the database, instead of
// a repair re-applied on every read forever.
import { storageKey } from "@/lib/storage-keys";
import { fetchActiveEvent } from "./actions";
import type { EventSummary } from "./types";

const ACTIVE_KEY = storageKey("events.active");

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
    // Private mode or a full store — non-fatal. The screen you just navigated to still resolves an
    // event (the newest), it just isn't the one you clicked.
  }
}

/** Forget which event this device had open.
 *
 *  Called when the open event is DELETED, and only then. fetchActiveEvent already survives a
 *  pointer at a row that is gone — it falls back to the newest event — so this is not what keeps
 *  the app working; it is what stops the browser carrying a dead id around forever and re-resolving
 *  it on every screen that asks. */
export function clearActiveEventId(): void {
  try {
    window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Same non-fatal story as setActiveEventId: the fallback above covers it.
  }
}

/** The active event, resolved against the server.
 *
 *  ⚠ ASYNC NOW. It used to be a synchronous read of two localStorage keys, and every caller could
 *  treat "which event am I in" as a fact already in hand. It is a round trip today, so each of them
 *  awaits it inside the effect it was already calling this from — and renders whatever it renders
 *  for "no event yet" for the moment in between, which is a state they all already had.
 */
export function activeEvent(): Promise<EventSummary | null> {
  return fetchActiveEvent(loadActiveEventId());
}
