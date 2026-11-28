// npm run check:waiting — the self-check of ./waiting.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import type { EventSummary } from "./types";
import type { Appointment } from "@/lib/appointments/types";
import { waitingItems, type WaitingItem } from "./waiting";

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
