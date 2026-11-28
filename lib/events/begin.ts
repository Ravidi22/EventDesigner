// Start a new event from the meeting-flow details form (F-1.3): create the record, mark it active,
// and seed its own design document (per-event keys — B).
//
// No geometry is copied here. The event names its venue and zones; the walls stay at the venue and
// resolve on read (lib/events/plan.ts). The venue's DEFAULT TABLE LAYOUT, when it has one, is the
// one thing a new drawing starts with — copied in as the event's own tables by the seed below
// (lib/studio/sketch-actions.ts seedEventDocument); everything else is drawn per event, in the
// meeting's sketch stages.
import { seedEventDocument } from "@/lib/studio/sketch-actions";
import { saveEvent } from "./actions";
import { setActiveEventId } from "./storage";
import type { EventSummary } from "./types";

export async function beginEvent(input: {
  /** The id to create it under — the details form mints ONE per create and sends it again on a retry,
   *  so a create that failed half-way (the row written, its drawing not) is finished, never doubled
   *  (QA 2026-11-20, SK-6). Absent = a fresh one. */
  id?: string;
  clientName: string;
  phone: string;
  contactName?: string;
  contact2Name?: string;
  contact2Phone?: string;
  date: string;
  /** Load-in day (ISO yyyy-mm-dd). Absent = the event day itself — see EventSummary.setupDate. */
  setupDate?: string;
  guests: number;
  venueId?: string;
  zoneIds: string[];
  zonesLabel: string;
  /** גווני האירוע — see EventSummary.shades. */
  shades?: string[];
  eventType?: string;
  mmPerUnit?: number;
  /** A saved sketch to open the event on (lib/studio/sketch-actions.ts); absent = a blank plan. */
  sketchTemplateId?: string;
}): Promise<EventSummary | { error: string }> {
  const ev: EventSummary = {
    id: input.id ?? crypto.randomUUID(),
    clientName: input.clientName,
    phone: input.phone,
    // The details form asks for these on the same screen — dropping them here made the couple's own
    // contact people vanish between "פתיחת האירוע" and the next time the event was opened.
    contactName: input.contactName,
    contact2Name: input.contact2Name,
    contact2Phone: input.contact2Phone,
    date: input.date,
    setupDate: input.setupDate,
    venueId: input.venueId,
    zoneIds: input.zoneIds,
    zonesLabel: input.zonesLabel,
    guests: input.guests,
    shades: input.shades,
    eventType: input.eventType,
    step: 0,
    createdAt: Date.now(),
  };
  // The id is minted in the browser, and the row is written with it — so the document below and the
  // event it belongs to agree on an id without waiting to be told one. saveEvent is an upsert on the
  // id: a retry under the same id writes the same row again, never a second event.
  // A refusal the designer can act on (a venue whose business closed) comes back to the form.
  const saved = await saveEvent(ev);
  if (!Array.isArray(saved)) return saved;
  setActiveEventId(ev.id);
  // Seeded under this event's own id, explicitly — not dependent on setActiveEventId having run
  // first, which was an ordering rule enforced only by a comment. Awaited now that it is a round
  // trip: the next stage opens straight after this returns, and it reads what this wrote. ONE round
  // trip for every case — a saved sketch, the venue's tables, or an empty plan — and a no-op for an
  // event that already has its drawing (a retry after the seed's answer was lost).
  await seedEventDocument(ev.id, input.sketchTemplateId, input.mmPerUnit ?? 1);
  return ev;
}
