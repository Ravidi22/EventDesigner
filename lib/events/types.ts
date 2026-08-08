// An event (docs/02 §4, v0.3): client (name+phone), date, zones, guest estimate. Status is
// DERIVED from the furthest meeting-flow step reached (F-1.1) — no separate status machine.
//
// An event occupies ZONES of one venue, not "a hall": the ceremony is at the חופה and the dinner
// in the hall next to it, and both are regions of the same site plan (lib/venues). It stores their
// ids and resolves the geometry live — nothing about the walls is copied onto the event, so a wall
// corrected at the venue reaches every event standing on it.
import { DEFAULT_FLOW, stepAt, type MeetingStepId, type StepStatus } from "@/lib/meeting/steps";

export interface EventSummary {
  id: string;
  clientName: string;
  phone: string; // primary contact's phone
  contactName?: string; // primary contact's own name, when it differs from clientName (the couple)
  contact2Name?: string; // a second contact person, if the couple gave one (e.g. a parent, planner)
  contact2Phone?: string;
  date: string; // ISO yyyy-mm-dd ("" = not set yet) — the wedding/event day itself
  time?: string; // HH:mm — start time on `date` (or on `meetingDate`, if that's what's shown)
  meetingDate?: string; // ISO yyyy-mm-dd — a scheduled client consultation, distinct from `date`
  venueId?: string; // the property; absent until the details step picks one
  zoneIds: string[]; // the regions of that venue this event occupies (F-1.3) — order is the designer's
  /** The zones' names, joined — denormalised for the lists, headers and the quote, which need a
   *  label without loading the venue plan. Rewritten whenever the selection changes; a zone renamed
   *  at the venue does not chase it, same trade as GalleryImage.productName. */
  zonesLabel: string;
  guests: number; // estimate (F-1.3)
  /** Furthest meeting stage reached — an index into the studio's CONFIGURED flow
   *  (lib/meeting/storage.ts), not into a fixed list. Always clamped on read: the designer may have
   *  shortened the flow since this event was opened. */
  step: number;
  quoteSentAt?: number; // stamped when a quote is issued (F-1.9)
  archived?: boolean;
  createdAt: number;
}

/** The stage statuses, plus the two that are facts about the event rather than about its stage. */
export type EventStatus = StepStatus | "sent" | "archived";

export const STATUS_LABEL: Record<EventStatus, string> = {
  details: "פרטים",
  gallery: "גלריה",
  design: "בעיצוב",
  sent: "נשלחה הצעה",
  archived: "בארכיון",
};

// F-1.1: the dashboard status is a pure derivation of flow progress — the stage the event is parked
// on says what it is. The flow is a parameter, not a constant: a studio that reordered its meeting
// (Settings → מצב פגישה) must read its own list here, so callers hand it in (useMeetingFlow).
export function eventStatus(e: EventSummary, flow: readonly MeetingStepId[] = DEFAULT_FLOW): EventStatus {
  if (e.archived) return "archived";
  if (e.quoteSentAt) return "sent";
  return stepAt(flow, e.step).status;
}

// Chip tone per stage — shared by every surface that shows a status (the event grid on
// /gantt, the calendar view on /dashboard). Colour never carries the meaning alone; it
// always rides with the label (StatusChip / STATUS_LABEL).
export type StatusTone = "neutral" | "accent" | "success" | "warn";
export const STATUS_TONE: Record<EventStatus, StatusTone> = {
  details: "neutral",
  gallery: "neutral",
  design: "accent",
  sent: "success",
  archived: "neutral",
};

// F-1.1: progress = the furthest stage reached, against the length of the studio's own flow. A
// one-stage flow is either 0% or done — never a division by zero.
export function eventProgress(e: EventSummary, flow: readonly MeetingStepId[] = DEFAULT_FLOW): number {
  const last = flow.length - 1;
  if (last <= 0) return e.step > 0 ? 100 : 0;
  return Math.round((Math.min(e.step, last) / last) * 100);
}

// 2-letter monogram for avatar chips, derived (not stored).
export function monogram(name: string): string {
  return name.replace(/[^֐-׿\w]/g, "").slice(0, 2) || "אר";
}

/** What to print where the event's zones are named — every surface wants the same placeholder for
 *  an event whose details step hasn't picked any yet. */
export function zonesLabelOf(e: Pick<EventSummary, "zonesLabel">): string {
  return e.zonesLabel || "טרם נבחר";
}

export function formatEventDate(iso: string): string {
  if (!iso) return "טרם נקבע";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "טרם נקבע" : d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}
