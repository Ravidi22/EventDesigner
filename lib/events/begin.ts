// Start a new event from the meeting-flow details form (F-1.3): create the dashboard record, mark
// it active, and seed its own empty design document (per-event keys — B).
//
// No geometry is copied here. The event names its venue and zones; the walls stay at the venue and
// resolve on read (lib/events/plan.ts). Tables aren't copied either (F-3.1) — they are drawn per
// event, in the meeting's hall-sketch stage.
import { emptyDocument } from "@/lib/design-document/types";
import { saveDoc } from "@/lib/studio/storage";
import { addEvent, setActiveEventId } from "./storage";
import type { EventSummary } from "./types";

export function beginEvent(input: {
  clientName: string;
  phone: string;
  contactName?: string;
  contact2Name?: string;
  contact2Phone?: string;
  date: string;
  guests: number;
  venueId?: string;
  zoneIds: string[];
  zonesLabel: string;
  mmPerUnit?: number;
}): EventSummary {
  const ev: EventSummary = {
    id: crypto.randomUUID(),
    clientName: input.clientName,
    phone: input.phone,
    // The details form asks for these on the same screen — dropping them here made the couple's own
    // contact people vanish between "פתיחת האירוע" and the next time the event was opened.
    contactName: input.contactName,
    contact2Name: input.contact2Name,
    contact2Phone: input.contact2Phone,
    date: input.date,
    venueId: input.venueId,
    zoneIds: input.zoneIds,
    zonesLabel: input.zonesLabel,
    guests: input.guests,
    step: 0,
    createdAt: Date.now(),
  };
  addEvent(ev);
  setActiveEventId(ev.id); // before saveDoc — the document's storage key derives from the active event
  saveDoc(emptyDocument(input.mmPerUnit ?? 1));
  return ev;
}
