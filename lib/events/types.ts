// An event (docs/02 §4, v0.3): client (name+phone), date, hall, guest estimate. Status is
// DERIVED from the furthest meeting-flow step reached (F-1.1) — no separate status machine.

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
  phone: string;
  date: string; // ISO yyyy-mm-dd ("" = not set yet)
  hallTemplateId?: string;
  hallName: string;
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

// 2-letter monogram for avatar chips, derived (not stored).
export function monogram(name: string): string {
  return name.replace(/[^֐-׿\w]/g, "").slice(0, 2) || "אר";
}

export function formatEventDate(iso: string): string {
  if (!iso) return "טרם נקבע";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "טרם נקבע" : d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}
