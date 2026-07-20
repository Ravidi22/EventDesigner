// Start a new event from the meeting-flow details form (F-1.3): create the dashboard record,
// mark it active, and seed the event's own hall + empty design document (per-event keys — B).
// Tables are NOT copied from the template (F-3.1): they arrive per event via the sketch import,
// or are placed directly on the shell for small events.
import type { Hall } from "@/lib/studio/hall";
import { openEvent } from "@/lib/setup/storage";
import { addEvent, setActiveEventId } from "./storage";
import type { EventSummary } from "./types";

export function beginEvent(input: {
  clientName: string;
  phone: string;
  date: string;
  guests: number;
  hallTemplateId?: string;
  hallName: string;
  hall: Hall;
  mmPerUnit?: number;
}): EventSummary {
  const ev: EventSummary = {
    id: crypto.randomUUID(),
    clientName: input.clientName,
    phone: input.phone,
    date: input.date,
    hallTemplateId: input.hallTemplateId,
    hallName: input.hallName,
    guests: input.guests,
    step: 0,
    createdAt: Date.now(),
  };
  addEvent(ev);
  setActiveEventId(ev.id);
  openEvent(input.hall, input.mmPerUnit ?? 1);
  return ev;
}
