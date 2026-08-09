// Continuous autosave of the design document (F-5.5 — no save button).
// The swap to a server action lives here and nowhere else.
//
// Keyed by EVENT (F-1.2): each event's document parks and resumes independently, so leaving
// mid-flow and reopening another event is always safe.
//
// The event id is a PARAMETER, not something this module goes and looks up. It used to call
// activeEvent() itself, which read well but coupled the document store to the event store: two
// storage seams that have to become server calls independently, where one reached into the other
// on every read. It also meant the key depended on hidden global state — beginEvent() had to call
// setActiveEventId() *before* saveDoc() or the new document was written under the previous event's
// key, an ordering rule that lived only in a comment. Passing the id makes the dependency visible
// and that ordering rule unnecessary.
//
// Only the DOCUMENT lives here. The hall used to be snapshotted alongside it, per event; it isn't
// any more — geometry belongs to the venue and resolves on read (lib/events/plan.ts), so there is
// nothing here that could go stale against the property it draws.
import { storageKey } from "@/lib/storage-keys";
import type { DesignDocumentContent } from "@/lib/design-document/types";

/** An event with no id yet (the details step hasn't saved) still gets a scratch document, under the
 *  same "default" key it always used — so a drawing started before the event exists isn't lost. */
const docKey = (eventId: string | null) => storageKey(`studio.doc.${eventId ?? "default"}`);

export function loadDoc(eventId: string | null): DesignDocumentContent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(docKey(eventId));
    return raw ? (JSON.parse(raw) as DesignDocumentContent) : null;
  } catch {
    return null;
  }
}

// Returns whether the write landed. The studio surfaces a failed save rather than claiming "saved" —
// a plan that silently didn't persist is the exact drift this tool exists to prevent.
export function saveDoc(eventId: string | null, content: DesignDocumentContent): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(docKey(eventId), JSON.stringify(content));
    return true;
  } catch {
    // Storage full, blocked, or private-mode — non-fatal; the in-memory doc is still the source of truth.
    return false;
  }
}

export function clearDoc(eventId: string | null): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(docKey(eventId));
}
