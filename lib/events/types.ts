// An event (docs/02 §4, v0.3): client (name+phone), date, zones, guest estimate. Status is
// DERIVED from the furthest meeting-flow step reached (F-1.1) — no separate status machine.
//
// An event occupies ZONES of one venue, not "a hall": the ceremony is at the חופה and the dinner
// in the hall next to it, and both are regions of the same site plan (lib/venues). It stores their
// ids and resolves the geometry live — nothing about the walls is copied onto the event, so a wall
// corrected at the venue reaches every event standing on it.

// The guided meeting flow, in order (F-1.1–F-1.9).
export const FLOW_STEPS = [
  { id: "details", label: "פרטי אירוע" },
  { id: "gallery1", label: "גלריה — השראה" },
  { id: "waiting", label: "ממתין לסקיצה" },
  { id: "import", label: "ייבוא הסקיצה" },
  { id: "gallery2", label: "גלריה — בחירה" },
  { id: "placement", label: "שיבוץ" },
  { id: "quote", label: "הצעת מחיר" },
] as const;

export type FlowStepId = (typeof FLOW_STEPS)[number]["id"];

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
  step: number; // furthest flow step reached — index into FLOW_STEPS
  quoteSentAt?: number; // stamped when a quote is issued (F-1.9)
  archived?: boolean;
  createdAt: number;
}

export type EventStatus = "details" | "gallery" | "waiting" | "design" | "sent" | "archived";

export const STATUS_LABEL: Record<EventStatus, string> = {
  details: "פרטים",
  gallery: "גלריה",
  waiting: "ממתין לסקיצה",
  design: "בעיצוב",
  sent: "נשלחה הצעה",
  archived: "בארכיון",
};

// F-1.1: the dashboard status is a pure derivation of flow progress.
export function eventStatus(e: EventSummary): EventStatus {
  if (e.archived) return "archived";
  if (e.quoteSentAt) return "sent";
  if (e.step <= 0) return "details";
  if (e.step === 1) return "gallery";
  if (e.step === 2) return "waiting";
  return "design";
}

// Chip tone per stage — shared by every surface that shows a status (the event grid on
// /gantt, the calendar view on /dashboard). Colour never carries the meaning alone; it
// always rides with the label (StatusChip / STATUS_LABEL).
export type StatusTone = "neutral" | "accent" | "success" | "warn";
export const STATUS_TONE: Record<EventStatus, StatusTone> = {
  details: "neutral",
  gallery: "neutral",
  waiting: "warn",
  design: "accent",
  sent: "success",
  archived: "neutral",
};

// F-1.1: progress = the furthest flow step reached, shown against the whole flow.
export function eventProgress(e: EventSummary): number {
  return Math.round((Math.min(e.step, FLOW_STEPS.length - 1) / (FLOW_STEPS.length - 1)) * 100);
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
