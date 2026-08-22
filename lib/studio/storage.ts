"use client";
// The SCRATCH drawing — the one design document that has no event to belong to.
//
// This file used to be the document store: per-event keys in localStorage, autosaved by the studio.
// It isn't any more. Postgres is, behind lib/studio/actions.ts, and every drawing that belongs to an
// event lives there — which was the whole point, since a plan in a browser profile does not survive
// the laptop it was drawn on.
//
// What survives here is the case the database cannot hold. design_documents.event_id is NOT NULL
// with a foreign key, so a drawing made before any event exists has nothing to hang off: a studio
// with no events at all opens /studio on a blank plane, and someone sketching there is sketching
// against a row that cannot be written yet. That drawing stayed local before this migration, and it
// stays local now — under the same "default" key it always used, so a sketch started before the
// crossing is still there after it.
//
// It is the same kind of thing as `events.active` (lib/events/storage.ts): per-device state, not
// studio data. The moment the event exists, beginEvent() writes the real document to the server and
// this key stops being consulted.
import { storageKey } from "@/lib/storage-keys";
import type { DesignDocumentContent } from "@/lib/design-document/types";

const SCRATCH_KEY = storageKey("studio.doc.default");

export function loadScratch(): DesignDocumentContent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SCRATCH_KEY);
    return raw ? (JSON.parse(raw) as DesignDocumentContent) : null;
  } catch {
    return null;
  }
}

/** Returns whether the write landed — the studio surfaces a failed save rather than claiming
 *  "saved", here for the same reason it does for the server path. A plan that silently didn't
 *  persist is the exact drift this tool exists to prevent. */
export function saveScratch(content: DesignDocumentContent): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(SCRATCH_KEY, JSON.stringify(content));
    return true;
  } catch {
    // Storage full, blocked, or private-mode — non-fatal; the in-memory doc is still what renders.
    return false;
  }
}

// There is no clearScratch(). Nothing called the old clearDoc() either, and the one place that
// wants this gone — "ניקוי נתוני המכשיר" in settings — drops every `eve.*` key at once
// (lib/settings/data.ts). A second way to delete the same thing is a second thing to keep correct.
