// npm run check:runway — the self-check of ./runway.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { buildRow, buildRunway, CHECKPOINT_BY_ID, closedReason, daysBetween, DEFAULT_OFFSETS, laneOf, normalizeOffsets, ordersLine, shiftDays, type EventFacts } from "./runway";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`runway: ${message}`);
}

const TODAY = "2026-09-01";
const base: EventFacts = {
  id: "e0",
  clientName: "בסיס",
  zonesLabel: "אולם ראשי",
  guests: 100,
  date: "2026-12-01",
  hasZones: true,
  hasGallery: true,
  hasDesign: true,
};

// Dates never round-trip through a local Date.
assert(daysBetween("2026-09-01", "2026-09-11") === 10, "ten days apart");
assert(daysBetween("2026-09-11", "2026-09-01") === -10, "backwards is negative");
assert(daysBetween("2026-02-28", "2026-03-01") === 1, "non-leap February rolls to March");
assert(daysBetween("2024-02-28", "2024-03-01") === 2, "a leap day is a day");
assert(shiftDays("2026-01-01", -1) === "2025-12-31", "shifting back crosses the year");
assert(shiftDays("2026-12-01", -30) === "2026-11-01", "an offset lands on the due date");

// Lanes are derived from facts, and confirmation is the line between selling and producing.
assert(laneOf(base, TODAY) === "early", "no quote out = early");
assert(laneOf({ ...base, quoteSentAt: 1 }, TODAY) === "proposal", "a sent quote is a proposal");
assert(
  laneOf({ ...base, quoteSentAt: 1, confirmedAt: 2 }, TODAY) === "production",
  "confirmation moves it into production",
);
assert(laneOf({ ...base, lostAt: 3 }, TODAY) === "closed", "a lost event leaves the runway");
assert(laneOf({ ...base, archived: true }, TODAY) === "closed", "so does an archived one");
assert(laneOf({ ...base, date: "2026-08-01" }, TODAY) === "closed", "a past event is closed");
assert(laneOf({ ...base, date: "" }, TODAY) === "early", "an undated event is open, not closed");
assert(
  laneOf({ ...base, date: TODAY, confirmedAt: 1 }, TODAY) === "production",
  "the event's own day still counts as ahead",
);

// Checkpoints are due backward from the event date.
const soon = buildRow({ ...base, id: "e1", date: "2026-09-10" }, DEFAULT_OFFSETS, TODAY);
assert(soon.daysUntil === 9, "nine days out");
const quote = soon.checkpoints.find((c) => c.id === "quote")!;
assert(quote.dueDate === "2026-08-11", "the quote was due 30 days before the event");
assert(quote.late, "no quote nine days out is late");
assert(soon.alert === CHECKPOINT_BY_ID.quote.lateLine(9), "the alert names the late checkpoint");
assert(soon.action?.target === "quote", "and its button goes to the quote");

// The earliest-due late checkpoint wins, not the last one to slip.
const bare = buildRow(
  { ...base, id: "e2", date: "2026-09-10", hasZones: false, hasDesign: false },
  DEFAULT_OFFSETS,
  TODAY,
);
assert(bare.alert === CHECKPOINT_BY_ID.zones.lateLine(9), "zones are due first, so zones is the alert");
// zones, design, quote and confirm are behind; gallery is done. The packing list is not on an
// unconfirmed event's plan at all — there is nothing to pack for a wedding nobody has booked.
assert(bare.lateCount === 4, "only the four already behind are late");
assert(!bare.checkpoints.some((c) => c.id === "packing"), "packing is a production checkpoint");

// The selling plan while selling; the production plan once confirmed; the design is in both.
assert(soon.checkpoints.map((c) => c.id).join(",") === "zones,gallery,design,quote,confirm", "unconfirmed = the sales plan");
const producing = buildRow({ ...base, id: "p1", date: "2026-09-10", quoteSentAt: 1, confirmedAt: 2 }, DEFAULT_OFFSETS, TODAY);
assert(producing.checkpoints.map((c) => c.id).join(",") === "design,crew,orders,packing,map", "confirmed = the production plan");
// Nine days out with no crew (due D-14), no packing list (D-7) and no maps (D-3): the crew is the
// earliest slip, so it is the alert, and its button opens the crew dialog.
assert(producing.alert === CHECKPOINT_BY_ID.crew.lateLine(9), "the crew is the first production slip");
assert(producing.action?.target === "crew", "and the action is to pick one");
assert(!producing.checkpoints.find((c) => c.id === "map")!.late, "maps are not due for six days");
// No orders at all is nothing to wait on; an open one is; a declined one is the alert.
assert(producing.checkpoints.find((c) => c.id === "orders")!.done, "no orders = nothing outstanding");
const waitingOnSupplier = buildRow(
  { ...base, id: "p2", date: "2026-09-10", confirmedAt: 2, crew: [{ id: "u1", name: "דנה" }], orders: { confirmed: 1, open: 1, declined: 0 } },
  DEFAULT_OFFSETS,
  TODAY,
);
assert(!waitingOnSupplier.checkpoints.find((c) => c.id === "orders")!.done, "an open order is outstanding");
assert(waitingOnSupplier.action?.target === "orders", "and the way to it is the orders tab");

// A client waiting on an answer outranks everything else on the row.
const asked = buildRow(
  { ...base, id: "p3", date: "2026-09-10", quoteSentAt: 1, designChangedSinceQuote: true, proposalPendingSince: 5 },
  DEFAULT_OFFSETS,
  TODAY,
);
assert(asked.alert === "הלקוח שלח שינויים לסקיצה — ממתינים לתשובה" && asked.action?.target === "proposal", "the client's changes come first");

// The closed lane says which ending it was.
assert(closedReason({ ...base, lostAt: 3 }) === "lost", "a no is a no");
assert(closedReason({ ...base, lostAt: 3, archived: true }) === "archived", "filing outranks the outcome");
assert(closedReason({ ...base, date: "2026-08-01" }) === "held", "a past event happened");

// A design that moved on after the quote outranks any schedule slip.
const changed = buildRow(
  { ...base, id: "e3", date: "2026-09-10", quoteSentAt: 1, designChangedSinceQuote: true },
  DEFAULT_OFFSETS,
  TODAY,
);
assert(changed.alert === "העיצוב השתנה מאז ההצעה שנשלחה", "a stale quote is the loudest thing");
assert(changed.action?.target === "quote", "and the way to fix it is to re-issue");

// A quote sitting unanswered is surfaced even when nothing is late by the calendar.
const waiting = buildRow(
  { ...base, id: "e4", date: "2026-12-01", quoteSentAt: Date.parse("2026-08-20T00:00:00Z") },
  DEFAULT_OFFSETS,
  TODAY,
);
assert(waiting.lane === "proposal" && waiting.lateCount === 0, "far out, nothing late yet");
assert(waiting.alert === "ההצעה נשלחה לפני 12 ימים — עוד לא אושרה", "silence is reported");

// A closed event is never chased.
const past = buildRow({ ...base, id: "e5", date: "2026-08-01", hasDesign: false }, DEFAULT_OFFSETS, TODAY);
assert(past.lane === "closed" && past.lateCount === 0 && !past.alert && !past.action, "a settled fact raises nothing");

// Collisions read the load-in window, not just the date.
const pair = buildRunway(
  [
    { ...base, id: "a", date: "2026-10-10", confirmedAt: 1 },
    { ...base, id: "b", date: "2026-10-12", setupDate: "2026-10-11", confirmedAt: 1 },
    { ...base, id: "c", date: "2026-11-20", confirmedAt: 1 },
  ],
  DEFAULT_OFFSETS,
  TODAY,
);
assert(pair.collisions.length === 1, "only the two that touch collide");
assert(pair.collisions[0].eventIds[0] === "a" && pair.collisions[0].eventIds[1] === "b", "earlier first");

const sameDay = buildRunway(
  [
    { ...base, id: "a", date: "2026-10-10", confirmedAt: 1 },
    { ...base, id: "b", date: "2026-10-10", confirmedAt: 1 },
  ],
  DEFAULT_OFFSETS,
  TODAY,
);
assert(sameDay.collisions[0].message.includes("אותו יום"), "same-day says so plainly");

// A person on both trucks is named; a crew that differs is not.
const dana = { id: "u1", name: "דנה" };
const crewed = buildRunway(
  [
    { ...base, id: "a", date: "2026-10-10", confirmedAt: 1, crew: [dana, { id: "u2", name: "יוסי" }] },
    { ...base, id: "b", date: "2026-10-10", confirmedAt: 1, crew: [dana] },
  ],
  DEFAULT_OFFSETS,
  TODAY,
);
assert(crewed.collisions[0].message.endsWith("דנה בשניהם"), "the shared person is named");
assert(!sameDay.collisions[0].message.includes("בשניהם"), "nobody shared, nobody named");

// Orders are a line, and a refusal is the alert.
assert(ordersLine(undefined) === undefined && ordersLine({ confirmed: 0, open: 0, declined: 0 }) === undefined, "no orders, no line");
assert(ordersLine({ confirmed: 2, open: 1, declined: 0 }) === "הזמנות: 2 אושרו · 1 ממתינות", "the line counts by answer");
const refused = buildRow({ ...base, id: "e6", quoteSentAt: 1, confirmedAt: 2, orders: { confirmed: 1, open: 0, declined: 1 } }, DEFAULT_OFFSETS, TODAY);
assert(refused.alert === "ספק דחה הזמנה — צריך ספק אחר", "a declined order is the row's alert");

// Work nobody has committed to is not a collision.
const uncommitted = buildRunway(
  [
    { ...base, id: "a", date: "2026-10-10", confirmedAt: 1 },
    { ...base, id: "b", date: "2026-10-10" },
  ],
  DEFAULT_OFFSETS,
  TODAY,
);
assert(uncommitted.collisions.length === 0, "an event with no quote out is not yet a demand");

// The runway is chronological, always.
const ordered = buildRunway(
  [
    { ...base, id: "late", date: "2026-11-01" },
    { ...base, id: "none", date: "" },
    { ...base, id: "soon", date: "2026-09-20" },
  ],
  DEFAULT_OFFSETS,
  TODAY,
);
assert(
  ordered.rows.map((r) => r.event.id).join(",") === "soon,late,none",
  "soonest first, undated last",
);
assert(ordered.counts.early === 3, "three events with no quote out");

// Offsets survive whatever is in the column.
assert(normalizeOffsets(null).design === DEFAULT_OFFSETS.design, "a missing record is the default");
assert(normalizeOffsets({ design: 40 }).design === 40, "a set offset is kept");
assert(normalizeOffsets({ design: -5 }).design === DEFAULT_OFFSETS.design, "a negative one is not");
assert(normalizeOffsets({ nonsense: 3 }).quote === DEFAULT_OFFSETS.quote, "unknown ids are ignored");

console.log("runway: all checks passed");
