// Hall-template persistence + the hand-off into the studio. All localStorage for now; the swap
// to a server action lives here and nowhere else (same seam pattern as lib/studio/storage.ts).
import { storageKey } from "@/lib/storage-keys";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { emptyDocument } from "@/lib/design-document/types";
import type { Hall } from "@/lib/studio/hall";
import { saveDoc, saveHall } from "@/lib/studio/storage";
import type { HallTemplate } from "./types";
import { SEED_TEMPLATES } from "./sample-data";

const KEY = storageKey("setup.templates");

export function loadTemplates(): HallTemplate[] {
  if (typeof window === "undefined") return SEED_TEMPLATES;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return SEED_TEMPLATES;
    const saved = JSON.parse(raw) as HallTemplate[];
    return saved.length ? saved : SEED_TEMPLATES;
  } catch {
    return SEED_TEMPLATES;
  }
}

export function saveTemplate(template: HallTemplate): HallTemplate[] {
  const next = [template, ...loadTemplates().filter((t) => t.id !== template.id)];
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // non-fatal: the in-memory list is still returned so the flow completes
  }
  return next;
}

export function deleteTemplate(id: string): HallTemplate[] {
  const next = loadTemplates().filter((t) => t.id !== id);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // non-fatal
  }
  return next;
}

// Open an event on a hall shell: seed the event's hall + an empty document (F-3.1 — no table
// layouts on templates; tables arrive per event from the sketch import or direct placement).
export function openEvent(hall: Hall, mmPerUnit = 1): void {
  const doc: DesignDocumentContent = emptyDocument(mmPerUnit);
  saveHall(hall);
  saveDoc(doc);
}
