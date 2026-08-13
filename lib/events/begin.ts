// Start a new event from the meeting-flow details form (F-1.3): create the record, mark it active,
// and seed its own empty design document (per-event keys — B).
//
// No geometry is copied here. The event names its venue and zones; the walls stay at the venue and
// resolve on read (lib/events/plan.ts). Tables aren't copied either (F-3.1) — they are drawn per
// event, in the meeting's hall-sketch stage.
import { emptyDocument } from "@/lib/design-document/types";
import { saveDocument } from "@/lib/studio/actions";
import { saveEvent } from "./actions";
import { setActiveEventId } from "./storage";
import type { EventSummary } from "./types";

export async function beginEvent(input: {
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
}): Promise<EventSummary> {
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
  // The id is minted here, in the browser, and the row is written with it — so the document below
  // and the event it belongs to agree on an id without waiting to be told one.
  await saveEvent(ev);
  setActiveEventId(ev.id);
  // Seeded under this event's own id, explicitly — not dependent on setActiveEventId having run
  // first, which was an ordering rule enforced only by a comment. Awaited now that it is a round
  // trip: the hall-sketch stage opens straight after this returns, and it reads what this wrote.
  await saveDocument(ev.id, emptyDocument(input.mmPerUnit ?? 1));
  return ev;
}
