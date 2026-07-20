// Continuous autosave of the design document to localStorage (F-5.5 — no save button).
// The swap to a server action lives here and nowhere else.
// Keys are derived from the ACTIVE EVENT (F-1.2): each event's document + hall park and
// resume independently, so leaving mid-flow and reopening another event is always safe.
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { activeEvent } from "@/lib/events/storage";
import type { Hall } from "./hall";

// activeEvent() (not the raw id) so the fallback event resolves to the same key the
// gallery folder uses — one notion of "the active event" everywhere.
const docKey = () => `idesign.studio.doc.${activeEvent()?.id ?? "default"}`;
const hallKey = () => `idesign.studio.hall.${activeEvent()?.id ?? "default"}`;

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

// The hall the studio renders behind the document. Written when an event's sketch import
// (F-1.6) opens it; the studio falls back to SAMPLE_HALL when none is set.
export function loadHall(): Hall | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(hallKey());
    return raw ? (JSON.parse(raw) as Hall) : null;
  } catch {
    return null;
  }
}

export function saveHall(hall: Hall): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(hallKey(), JSON.stringify(hall));
    return true;
  } catch {
    return false;
  }
}
