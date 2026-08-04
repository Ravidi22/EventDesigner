// Continuous autosave of the design document to localStorage (F-5.5 — no save button).
// The swap to a server action lives here and nowhere else.
// Keys are derived from the ACTIVE EVENT (F-1.2): each event's document + hall park and
// resume independently, so leaving mid-flow and reopening another event is always safe.
// Only the DOCUMENT lives here. The hall used to be snapshotted alongside it, per event; it isn't
// any more — geometry belongs to the venue and resolves on read (lib/events/plan.ts), so there is
// nothing here that could go stale against the property it draws.
import { storageKey } from "@/lib/storage-keys";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { activeEvent } from "@/lib/events/storage";

// activeEvent() (not the raw id) so the fallback event resolves to the same key the
// gallery folder uses — one notion of "the active event" everywhere.
const docKey = () => storageKey(`studio.doc.${activeEvent()?.id ?? "default"}`);

export function loadDoc(): DesignDocumentContent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(docKey());
    return raw ? (JSON.parse(raw) as DesignDocumentContent) : null;
  } catch {
    return null;
  }
}

// Returns whether the write landed. The studio surfaces a failed save rather than
// claiming "saved" — a plan that silently didn't persist is the exact drift this tool exists to prevent.
export function saveDoc(content: DesignDocumentContent): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(docKey(), JSON.stringify(content));
    return true;
  } catch {
    // Storage full, blocked, or private-mode — non-fatal; the in-memory doc is still the source of truth.
    return false;
  }
}

export function clearDoc(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(docKey());
}
