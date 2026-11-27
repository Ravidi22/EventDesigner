// "ממתין לכם" — the event drawer's answer to "why did I open this" (2026-11-10, the board's 3b).
//
// Four things that wait on the DESIGNER, each read off a row that already exists — never a flag
// somebody has to remember to clear (the "meeting was held" switch nobody flipped is why):
//
//   proposal  the client sent changes to the sketch and nobody answered (sketch_proposals, status
//             "submitted" — an answered one is never handed in)
//   meeting   the NEXT sitting: today or later, not held, and not already over today. One row, not
//             the diary — the diary is the פגישות fold under it
//   quote     sent more than QUOTE_WAIT_DAYS ago and the client has said neither yes nor no (the
//             runway nags a week in; the drawer, opened about this one event, says it sooner)
//   payment   the earliest installment the order says should be in by now and is not
//             (lib/billing/rules.ts lateInstallment — the caller reads the ledger)
//
// In that order: what the client is waiting on first, then the next date in the diary, then money
// the studio is waiting on. An empty list means the section is not drawn at all.
//
// Pure — `now` is an argument — so the clock is asserted, not trusted: `npm run check:waiting`.
import type { EventSummary } from "./types";
import { formatEventDate } from "./types";
import type { Appointment } from "@/lib/appointments/types";
import { APPOINTMENT_KIND_LABEL, appointmentTimeLabel, byStartTime, hasPassed } from "@/lib/appointments/types";
import { formatPrice } from "@/lib/catalog/format";

export type WaitingKind = "proposal" | "meeting" | "quote" | "payment";

/** One row of the section: what it is, a bold line and a muted one, and what the row opens. */
export type WaitingItem =
  | { kind: "proposal"; key: string; proposalId: string; title: string; detail: string }
  | { kind: "meeting"; key: string; appointment: Appointment; title: string; detail: string }
  | { kind: "quote"; key: string; title: string; detail: string }
  | { kind: "payment"; key: string; title: string; detail: string };

/** The proposal waiting for review. Structural on purpose: `fetchPendingProposals`' row (counted on
 *  the server) and `fetchSubmittedProposal`'s (who pressed send) both fit, and only these fields are
 *  read. */
export interface WaitingProposal {
  id: string;
  /** Checked when given — a proposal is this event's or nothing. */
  eventId?: string;
  submittedAt: string;
  changes?: number;
  submittedBy?: string;
}

/** The earliest late installment; `amount` is what is still missing from it, not its face value. */
export interface LateInstallment {
  label: string;
  amount: number;
  dueDate: string;
}

/** A quote this many days unanswered is worth a row; one younger is the client still thinking. */
export const QUOTE_WAIT_DAYS = 5;

const DAY_MS = 86_400_000;

/** The local calendar day, ISO — the diary's dates are local days, not UTC instants. */
function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "היום", "מחר", else "יום ה׳ 19 בנוב׳" — how far off the sitting is, in the words a diary uses.
 *  The drawer's פגישות fold says its "הבאה" with it too, so the row and the summary agree. */
export function dayWord(iso: string, now: Date): string {
  if (iso === localISO(now)) return "היום";
  if (iso === localISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))) return "מחר";
  const [y, m, d] = iso.split("-").map(Number);
  return `${new Date(y, m - 1, d).toLocaleDateString("he-IL", { weekday: "short" })} ${formatEventDate(iso)}`;
}

/** "לפני 12 דק׳", "לפני 3 שע׳", "אתמול", "לפני 4 ימים". */
function ago(iso: string, now: Date): string {
  const s = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 60) return "עכשיו";
  if (s < 3600) return `לפני ${Math.floor(s / 60)} דק׳`;
  if (s < 86400) return `לפני ${Math.floor(s / 3600)} שע׳`;
  const days = Math.floor(s / 86400);
  return days === 1 ? "אתמול" : `לפני ${days} ימים`;
}

/** "1.11" — a due date the way a Hebrew note writes it. */
function dayMonth(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)}.${Number(m)}`;
}

/** The event's next sitting: today or later, not held, not over. Today's entries are measured
 *  against the clock (hasPassed — an untimed one never passes), every later day counts whole; `done`
 *  is the designer saying it was held, and a held meeting waits on no one. Earliest day, then hour. */
export function nextMeeting(appointments: readonly Appointment[], eventId: string, now: Date): Appointment | undefined {
  const today = localISO(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  return appointments
    .filter((a) => (!a.eventId || a.eventId === eventId) && !a.done && (a.date > today || (a.date === today && !hasPassed(a, minutes))))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : byStartTime(a, b)))[0];
}

export function waitingItems({
  event,
  proposal,
  appointments,
  lateInstallment,
  now,
}: {
  event: EventSummary;
  proposal: WaitingProposal | null;
  /** This event's diary, any order. */
  appointments: Appointment[];
  lateInstallment?: LateInstallment | null;
  now: Date;
}): WaitingItem[] {
  const out: WaitingItem[] = [];

  if (proposal && (!proposal.eventId || proposal.eventId === event.id)) {
    const n = proposal.changes;
    // Who sent it when the read knows (a name is not a gender guess); else the role.
    const from = `מ${proposal.submittedBy?.trim() || "הלקוח"}`;
    const what = n === 1 ? "שינוי אחד בסקיצה" : n ? `${n} שינויים בסקיצה` : "שינויים בסקיצה";
    out.push({ kind: "proposal", key: `proposal:${proposal.id}`, proposalId: proposal.id, title: `${what} ${from}`, detail: ago(proposal.submittedAt, now) });
  }

  const next = nextMeeting(appointments, event.id, now);
  if (next) {
    const detail = [appointmentTimeLabel(next), next.note.trim()].filter(Boolean).join(" · ") || "טרם נקבעה שעה";
    out.push({ kind: "meeting", key: `meeting:${next.id}`, appointment: next, title: `${APPOINTMENT_KIND_LABEL[next.kind]} · ${dayWord(next.date, now)}`, detail });
  }

  // Unanswered = neither a yes (confirmedAt) nor a no (lostAt); archived is filed, not chased.
  const sent = event.quoteSentAt;
  if (sent !== undefined && !event.confirmedAt && !event.lostAt && !event.archived && now.getTime() - sent > QUOTE_WAIT_DAYS * DAY_MS) {
    const days = Math.floor((now.getTime() - sent) / DAY_MS);
    out.push({ kind: "quote", key: "quote", title: "הצעת המחיר ממתינה לתשובה", detail: `נשלחה לפני ${days} ימים` });
  }

  if (lateInstallment) {
    out.push({
      kind: "payment",
      key: "payment",
      title: `${lateInstallment.label} באיחור`,
      detail: `${formatPrice(Math.round(lateInstallment.amount))} טרם התקבלו · היה עד ${dayMonth(lateInstallment.dueDate)}`,
    });
  }

  return out;
}
