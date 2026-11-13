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
import { isMain } from "../self-check";
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

if (isMain(import.meta.url)) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const DAY = 86_400_000;
  // Thursday 12 November 2026, 14:30 local.
  const now = new Date(2026, 10, 12, 14, 30);
  const ev = (patch: Partial<EventSummary> = {}): EventSummary => ({
    id: "e1",
    clientName: "מיכל ודניאל",
    phone: "",
    date: "2026-12-20",
    zoneIds: [],
    zonesLabel: "",
    guests: 240,
    step: 4,
    createdAt: 0,
    ...patch,
  });
  const meet = (id: string, patch: Partial<Appointment>): Appointment => ({
    id,
    eventId: "e1",
    clientName: "מיכל ודניאל",
    phone: "",
    date: "2026-11-12",
    durationMin: 60,
    kind: "followup",
    note: "",
    createdAt: 0,
    ...patch,
  });
  const kinds = (items: WaitingItem[]) => items.map((i) => i.kind).join(",");
  const of = (patch: Partial<Parameters<typeof waitingItems>[0]> = {}) =>
    waitingItems({ event: ev(), proposal: null, appointments: [], lateInstallment: null, now, ...patch });

  // Nothing waiting: nothing at all — the section is not drawn.
  assert(of().length === 0, "nothing in, nothing out");

  // A submitted proposal waits, names its changes, and says how long ago.
  const sent = new Date(now.getTime() - 12 * 60_000).toISOString();
  const proposal = of({ proposal: { id: "p1", eventId: "e1", submittedAt: sent, changes: 3 } });
  assert(kinds(proposal) === "proposal", "a proposal waits — " + kinds(proposal));
  const p = proposal[0];
  assert(p.kind === "proposal" && p.proposalId === "p1", "the proposal's id travels to the review link");
  assert(p.title === "3 שינויים בסקיצה מהלקוח", "the changes, neutral — " + p.title);
  assert(p.detail === "לפני 12 דק׳", "how long ago — " + p.detail);
  assert(of({ proposal: { id: "p1", submittedAt: sent, changes: 1, submittedBy: "דנה לוי" } })[0].title === "שינוי אחד בסקיצה מדנה לוי", "one change, by name");
  assert(of({ proposal: { id: "p1", eventId: "other", submittedAt: sent } }).length === 0, "another event's proposal is not this one's");

  // The next meeting: today or later, not held, not over.
  const later = of({ appointments: [meet("m1", { time: "16:00", durationMin: 90, note: "בחירת מפות ופרחים" })] });
  assert(kinds(later) === "meeting", "a meeting later today waits");
  const m = later[0];
  assert(m.kind === "meeting" && m.appointment.id === "m1", "it carries the appointment to open");
  assert(m.title === "פגישת המשך · היום", "kind and day — " + m.title);
  assert(m.detail === "‎16:00–17:30 · בחירת מפות ופרחים", "time and note — " + m.detail);
  assert(of({ appointments: [meet("m1", { time: "12:00", durationMin: 60 })] }).length === 0, "a meeting that ended earlier today is past");
  assert(of({ appointments: [meet("m1", { time: "14:00", durationMin: 60 })] }).length === 1, "a meeting still running is not past");
  assert(of({ appointments: [meet("m1", { date: "2026-11-11", time: "16:00" })] }).length === 0, "yesterday's meeting is past");
  assert(of({ appointments: [meet("m1", { time: "16:00", done: true })] }).length === 0, "a held meeting is not waiting");
  const untimed = of({ appointments: [meet("m1", { date: "2026-11-13", kind: "tasting" })] });
  assert(untimed[0]?.title === "טעימה · מחר", "tomorrow, untimed — " + untimed[0]?.title);
  assert(untimed[0]?.detail === "טרם נקבעה שעה", "untimed says so — " + untimed[0]?.detail);
  const next = of({
    appointments: [
      meet("far", { date: "2026-11-30", time: "10:00" }),
      meet("old", { date: "2026-11-01", time: "10:00" }),
      meet("soon", { date: "2026-11-19", time: "18:00" }),
      meet("soonest", { date: "2026-11-19", time: "09:00" }),
    ],
  });
  assert(next.length === 1 && next[0].kind === "meeting" && next[0].appointment.id === "soonest", "only the NEXT meeting, earliest hour first");
  assert(next[0].title === "פגישת המשך · יום ה׳ 19 בנוב׳", "a later day by weekday and date — " + next[0].title);
  assert(of({ appointments: [meet("x", { eventId: "other", time: "16:00" })] }).length === 0, "another event's meeting is not this one's");

  // A quote unanswered for more than five days.
  const quote = (days: number, patch: Partial<EventSummary> = {}) => of({ event: ev({ quoteSentAt: now.getTime() - days * DAY, ...patch }) });
  assert(kinds(quote(6)) === "quote", "six days unanswered waits");
  assert(quote(6)[0].title === "הצעת המחיר ממתינה לתשובה" && quote(6)[0].detail === "נשלחה לפני 6 ימים", "the quote's words — " + quote(6)[0].detail);
  assert(quote(4).length === 0, "four days is not waiting yet");
  assert(quote(5).length === 0, "five days exactly is not MORE than five");
  assert(quote(9, { confirmedAt: now.getTime() - DAY }).length === 0, "an answered (yes) quote is not waiting");
  assert(quote(9, { lostAt: now.getTime() - DAY }).length === 0, "a lost event's quote is not waiting");
  assert(quote(9, { archived: true }).length === 0, "an archived event's quote is not waiting");
  assert(of({ event: ev() }).length === 0, "no quote, nothing to wait for");

  // The earliest late installment.
  const late = of({ lateInstallment: { label: "תשלום שני", amount: 12000, dueDate: "2026-11-01" } });
  assert(kinds(late) === "payment", "a late installment waits");
  assert(late[0].title === "תשלום שני באיחור", "the installment — " + late[0].title);
  assert(late[0].detail === "₪12,000 טרם התקבלו · היה עד 1.11", "how much and since when — " + late[0].detail);

  // All four, in the board's order.
  const all = of({
    event: ev({ quoteSentAt: now.getTime() - 8 * DAY }),
    proposal: { id: "p1", submittedAt: sent, changes: 2 },
    appointments: [meet("m1", { date: "2026-11-15", time: "10:00" })],
    lateInstallment: { label: "מקדמה", amount: 5000, dueDate: "2026-11-10" },
  });
  assert(kinds(all) === "proposal,meeting,quote,payment", "proposal, meeting, quote, payment — " + kinds(all));
  assert(new Set(all.map((i) => i.key)).size === all.length, "every row has its own key");

  console.log("waiting: ok");
}
