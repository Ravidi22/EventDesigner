// The production runway — what is coming, and what about it is late.
//
// Pure, with the facts injected, exactly like procurement.ts and quote.ts: no database, no React,
// no catalog import at runtime, so the self-check at the bottom runs under plain node.
//
// ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────────────────────────
//
// The screen this feeds used to ask "which stage is this event on", rendered as a board with one
// column per meeting stage. That was the wrong question twice over. The meeting stages are the
// stages of ONE SITTING (docs/01 F-1.2: "לעיתים הכול קורה בישיבה אחת") — an event crosses all five
// of them in ninety minutes, inside /meeting, without anyone touching a board. And a designer with
// eight events a month does not need a screen to tell them which stage each one is on; they can
// name all eight from memory.
//
// The question that costs them money is "what is about to go wrong, and how long do I have". An
// event date is a deadline that has never moved. So everything here is BACKWARD-PLANNED from it.
//
// ── THE RULE: DERIVED, NEVER TYPED ─────────────────────────────────────────────────────────────
//
// Every checkpoint below is a fact the database already holds — zones chosen, a design document,
// an issued quote, an export. Nothing on this screen is a status someone has to remember to set,
// because this codebase has twice learned what happens when it is: the "mark meeting as held"
// switch nobody ever flipped (today-focus.tsx), and procurement's refusal to accept typed usage.
// A designer walking out of a meeting is holding a bag, not a laptop. A board they must drag is a
// board that is confidently wrong within a month, which is worse than an empty one.
//
// The ONE exception is `confirmedAt`, and it earns it: "the client said yes" is not derivable from
// anything. It is also the fact this data model was missing entirely — see the note on the column.
import { isMain } from "@/lib/self-check";

// ── Dates ──────────────────────────────────────────────────────────────────────────────────────
//
// ISO `yyyy-mm-dd` throughout, and never a `new Date(string)`. `new Date("2026-08-09")` parses as
// midnight UTC, so formatting it anywhere west of Greenwich prints the 8th — the same trap
// db-mapping.ts documents on the event date column. Day arithmetic goes through Date.UTC on parsed
// integer parts, where both sides are UTC and the offset cancels.

/** Midnight-UTC epoch for a `yyyy-mm-dd`. Not exported: nothing outside should hold one. */
function utcDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

const DAY_MS = 86_400_000;

/** Whole days from `from` to `to`. Negative = `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / DAY_MS);
}

/** `iso` shifted by `delta` days, back as `yyyy-mm-dd`. */
export function shiftDays(iso: string, delta: number): string {
  return new Date(utcDay(iso) + delta * DAY_MS).toISOString().slice(0, 10);
}

// ── Checkpoints ────────────────────────────────────────────────────────────────────────────────

export type CheckpointId = "zones" | "gallery" | "design" | "quote" | "confirm" | "crew" | "orders" | "packing" | "map";

export interface CheckpointDef {
  id: CheckpointId;
  /** The dot's label on the runway row. */
  label: string;
  /** What being late on this one actually means, in the designer's words. */
  lateLine: (days: number) => string;
}

/** The nine, in the order they must happen. Fixed, like AppointmentKind and for the same reason: a
 *  studio-defined checkpoint would need a settings surface, a table and a migration to earn a label
 *  these already cover. What IS configurable is WHEN each is due — see CheckpointOffsets.
 *
 *  They are two plans, not one (SALES_CHECKPOINTS / PRODUCTION_CHECKPOINTS below). Before the client
 *  says yes the event is being SOLD, and what can slip is the funnel: zones, a gallery pass, a
 *  drawing, a price, an answer. After the yes those five are history — a row that still showed them
 *  was five ticks and a ring on every event in the lane the screen is named after — and what can
 *  slip is the PRODUCTION: a crew, the suppliers' answers, the crew's two sheets. */
export const CHECKPOINTS: readonly CheckpointDef[] = [
  { id: "zones", label: "אזורים", lateLine: () => "לא נבחרו אזורים באולם" },
  { id: "gallery", label: "גלריה", lateLine: () => "לא נעשה מעבר גלריה" },
  { id: "design", label: "סקיצה", lateLine: (d) => `אין סקיצה — ${d} ימים לאירוע` },
  { id: "quote", label: "הצעה", lateLine: (d) => `לא נשלחה הצעה — ${d} ימים לאירוע` },
  { id: "confirm", label: "אישור", lateLine: (d) => `ההצעה לא אושרה — ${d} ימים לאירוע` },
  { id: "crew", label: "צוות", lateLine: (d) => `לא נבחר צוות הקמה — ${d} ימים לאירוע` },
  { id: "orders", label: "הזמנות", lateLine: (d) => `הזמנות לספקים עוד לא אושרו — ${d} ימים לאירוע` },
  { id: "packing", label: "ציוד", lateLine: (d) => `לא הופקה רשימת ציוד — ${d} ימים לאירוע` },
  { id: "map", label: "מפות", lateLine: (d) => `לא הודפסו מפות הצבה — ${d} ימים לאירוע` },
];

/** What has to be true while the event is being sold. */
export const SALES_CHECKPOINTS: readonly CheckpointId[] = ["zones", "gallery", "design", "quote", "confirm"];
/** What has to be true once it is being produced. The drawing is in both: it is what everything
 *  after it is counted off. */
export const PRODUCTION_CHECKPOINTS: readonly CheckpointId[] = ["design", "crew", "orders", "packing", "map"];

export const CHECKPOINT_BY_ID: Record<CheckpointId, CheckpointDef> = Object.fromEntries(
  CHECKPOINTS.map((c) => [c.id, c]),
) as Record<CheckpointId, CheckpointDef>;

/** Days BEFORE the event each checkpoint is due. Per studio (studio_settings.checkpointOffsets):
 *  a designer who books six months out and one who books six weeks out do not share a schedule. */
export type CheckpointOffsets = Record<CheckpointId, number>;

/** A working backward-plan for a wedding-scale event. Every number is "how long before the day does
 *  this have to be true", and each is spaced by what the NEXT one needs: the packing list is
 *  counted off the drawing, so the drawing has to be settled a week before the list is pulled. */
export const DEFAULT_OFFSETS: CheckpointOffsets = {
  zones: 45,
  gallery: 35,
  design: 21,
  quote: 30,
  confirm: 21,
  crew: 14,
  orders: 10,
  packing: 7,
  map: 3,
};

/** Whatever came out of the database — or an older version of this app — made safe to compute with:
 *  known ids only, integers only, defaults for anything missing. */
export function normalizeOffsets(value: unknown): CheckpointOffsets {
  const raw = (value ?? {}) as Partial<Record<string, unknown>>;
  const out = { ...DEFAULT_OFFSETS };
  for (const { id } of CHECKPOINTS) {
    const v = raw[id];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[id] = Math.round(v);
  }
  return out;
}

// ── The facts one event contributes ────────────────────────────────────────────────────────────

/** What the runway needs to know about one event. Assembled by lib/production/actions.ts from the
 *  rows that already exist; nothing here is a new thing for anyone to maintain. */
export interface EventFacts {
  id: string;
  clientName: string;
  zonesLabel: string;
  guests: number;
  /** ISO `yyyy-mm-dd`; "" = no date yet, which keeps an event OFF the runway (see laneOf). */
  date: string;
  /** Load-in day, when it is not the event day. An event is a window, not a day. */
  setupDate?: string;
  venueId?: string;
  hasZones: boolean;
  hasGallery: boolean;
  hasDesign: boolean;
  /** Epoch ms. A price left the studio. NOT the same fact as the client agreeing to it. */
  quoteSentAt?: number;
  /** Epoch ms. The client said yes. */
  confirmedAt?: number;
  /** Epoch ms. The client said no, or went quiet. */
  lostAt?: number;
  archived?: boolean;
  /** A packing list has been exported at least once. */
  packingExportedAt?: number;
  /** A placement-map set has been exported at least once. */
  mapExportedAt?: number;
  /** Epoch ms. The client sent changes to the sketch (lib/proposals) and nobody has answered them.
   *  Derived — the proposal row's own status. */
  proposalPendingSince?: number;
  /** F-7.4: the drawing has moved on since the quote was issued off it. */
  designChangedSinceQuote?: boolean;
  /** The last issued quote's total, for the runway's money column. Owner-visible only — this type
   *  is never handed to /present, /client, /meeting or /outputs (npm run check:costs). */
  quoteTotal?: number;
  /** Who is on the truck (event_crew). The second typed fact after `confirmedAt`, and it earns it
   *  the same way: an assignment is a decision, derivable from nothing. */
  crew?: { id: string; name: string }[];
  /** Orders (lib/orders/) whose window covers this event's day, counted by the supplier's answer.
   *  Derived — nothing here is a status the designer sets. */
  orders?: { confirmed: number; open: number; declined: number };
  /** An installment of the order's payment schedule (lib/billing) due before today and not fully
   *  paid — derived from the receipts, never a status. */
  paymentLate?: { label: string; amount: number };
}

/** The one line a row shows about its orders, or nothing when there are none. */
export function ordersLine(o: EventFacts["orders"]): string | undefined {
  if (!o || o.confirmed + o.open + o.declined === 0) return undefined;
  const parts: string[] = [];
  if (o.confirmed) parts.push(`${o.confirmed} אושרו`);
  if (o.open) parts.push(`${o.open} ממתינות`);
  if (o.declined) parts.push(`${o.declined} נדחו`);
  return `הזמנות: ${parts.join(" · ")}`;
}

/** The people two events both want. */
export function sharedCrew(a: EventFacts, b: EventFacts): string[] {
  const ids = new Set((a.crew ?? []).map((c) => c.id));
  return (b.crew ?? []).filter((c) => ids.has(c.id)).map((c) => c.name);
}

// ── Lanes ──────────────────────────────────────────────────────────────────────────────────────

/** The three states of a designer's book of business, plus the one that has left it.
 *
 *  These replaced the five meeting-stage columns, and the difference is the whole point: a stage is
 *  a place in a conversation, a lane is a place in the BUSINESS, and each of these is derived from
 *  a fact rather than from how far a sitting got. They are a filter, never columns — one lane at
 *  full content width beats five at 288px, and nothing here scrolls sideways. */
export type LaneId = "production" | "proposal" | "early" | "closed";

export const LANE_LABEL: Record<LaneId, string> = {
  production: "בהפקה",
  proposal: "בהצעה",
  // `early` is the id; the word is what is happening there. "מוקדם" read as "too soon to look at".
  early: "בעיצוב",
  closed: "הסתיים",
};

/** One line each, for the empty state of a lane that has nothing in it. */
export const LANE_HINT: Record<LaneId, string> = {
  production: "אירועים שהלקוח אישר ושעוד לא קרו — העבודה שצריך להפיק.",
  proposal: "הצעה נשלחה והלקוח עוד לא אישר. אלה האירועים שמחכים לתשובה.",
  early: "אירועים בעבודה שעוד לא נשלחה עליהם הצעה — פרטים, גלריה, סקיצה.",
  closed: "אירועים שכבר התקיימו, שהלקוח לא סגר, או שהועברו לארכיון.",
};

/** Why a closed row is closed. Three different endings share one lane, and a wedding that happened
 *  next to a client who said no is a win filed beside a loss — so each row says which it is. */
export type ClosedReason = "held" | "lost" | "archived";

export const CLOSED_LABEL: Record<ClosedReason, string> = {
  held: "התקיים",
  lost: "לא נסגר",
  archived: "בארכיון",
};

export function closedReason(e: EventFacts): ClosedReason {
  // Archive is a filing decision and outranks the outcome: a lost event filed away reads "בארכיון".
  if (e.archived) return "archived";
  if (e.lostAt) return "lost";
  return "held";
}

export function laneOf(e: EventFacts, today: string): LaneId {
  if (e.archived || e.lostAt) return "closed";
  // A dateless event cannot be planned backward from anything, so it sits in the early lane until
  // the details stage gives it a day. It is NOT closed — it is the most open thing there is.
  if (e.date && daysBetween(today, e.date) < 0) return "closed";
  if (e.confirmedAt) return "production";
  if (e.quoteSentAt) return "proposal";
  return "early";
}

// ── One row on the runway ──────────────────────────────────────────────────────────────────────

export interface Checkpoint {
  id: CheckpointId;
  label: string;
  done: boolean;
  /** ISO date this was due — the event date minus the studio's offset. Absent when the event has
   *  no date, which is the one case where a backward plan has nothing to count back from. */
  dueDate?: string;
  /** Not done, and its due date is behind us. Never true in the closed lane: an event that already
   *  happened cannot be chased, and lighting up six alerts on it is noise about a settled fact. */
  late: boolean;
}

export interface RunwayRow {
  event: EventFacts;
  lane: LaneId;
  /** Whole days from today to the event. Negative = past. Null = no date set. */
  daysUntil: number | null;
  checkpoints: Checkpoint[];
  /** THE one line the row shows when something is wrong. One, not a list: a row that reports six
   *  problems is a row nobody reads. It is the earliest-due late checkpoint, because that is the
   *  one whose slip makes every checkpoint after it late too. */
  alert?: string;
  /** The one thing to do about `alert`. Present exactly when the alert is. */
  action?: NextAction;
  /** Late checkpoints, for the "דורשים טיפול" count in the filter bar. */
  lateCount: number;
}

/** Which plan a row is measured against. Confirmed = producing; otherwise selling. A closed row
 *  keeps whichever plan it closed under, so a held wedding still reads as the production it was. */
export function checkpointSetFor(e: EventFacts): readonly CheckpointId[] {
  return e.confirmedAt ? PRODUCTION_CHECKPOINTS : SALES_CHECKPOINTS;
}

function checkpointsFor(e: EventFacts, offsets: CheckpointOffsets, today: string, lane: LaneId): Checkpoint[] {
  const done: Record<CheckpointId, boolean> = {
    zones: e.hasZones,
    gallery: e.hasGallery,
    design: e.hasDesign,
    quote: e.quoteSentAt !== undefined,
    confirm: e.confirmedAt !== undefined,
    crew: (e.crew?.length ?? 0) > 0,
    // Every order the suppliers have answered yes to — and NO orders at all is also nothing to wait
    // on: a studio that owns its whole stock never sends one. A declined order is not "done": the
    // equipment is not coming, and the row's alert says so in words.
    orders: !e.orders || (e.orders.open === 0 && e.orders.declined === 0),
    packing: e.packingExportedAt !== undefined,
    map: e.mapExportedAt !== undefined,
  };

  return checkpointSetFor(e).map((id) => {
    const { label } = CHECKPOINT_BY_ID[id];
    const dueDate = e.date ? shiftDays(e.date, -offsets[id]) : undefined;
    return {
      id,
      label,
      done: done[id],
      dueDate,
      late: !done[id] && lane !== "closed" && dueDate !== undefined && daysBetween(today, dueDate) < 0,
    };
  });
}

// ── The next action ────────────────────────────────────────────────────────────────────────────

/** Where the row's one button goes. Named by WHAT is reached, and the screen decides how: a route,
 *  a view on /outputs, a dialog, or the one mutation (`confirm`) this screen owns. */
export type ActionTarget =
  | "details"
  | "meeting"
  | "studio"
  | "proposal"
  | "quote"
  | "confirm"
  | "crew"
  | "orders"
  | "packing"
  | "map"
  | "billing";

export interface NextAction {
  label: string;
  target: ActionTarget;
}

/** The verb that answers each late checkpoint. The alert names the slip; this is the way to fix it,
 *  and it sits beside the alert so the designer never has to go looking in a menu. */
const ACTION_FOR: Record<CheckpointId, NextAction> = {
  zones: { label: "להשלמת הפרטים", target: "details" },
  gallery: { label: "למעבר גלריה", target: "meeting" },
  design: { label: "לסקיצה", target: "studio" },
  quote: { label: "להצעת המחיר", target: "quote" },
  confirm: { label: "אישור הזמנה", target: "confirm" },
  crew: { label: "לבחירת צוות", target: "crew" },
  orders: { label: "להזמנות", target: "orders" },
  packing: { label: "לרשימת הציוד", target: "packing" },
  map: { label: "למפות ההצבה", target: "map" },
};

/** The line the row leads with when something is wrong, and the one thing to do about it.
 *
 *  In order of who is waiting:
 *    1. The CLIENT is waiting — they sent changes to the sketch and nobody has answered. Someone is
 *       looking at their phone for a reply right now.
 *    2. The client is being MISLED — "העיצוב השתנה": a quote they are holding no longer matches the
 *       drawing (F-7.4). Outranks any schedule slip: a late checkpoint is merely behind.
 *    3. A SUPPLIER said no. Nothing on the calendar is late yet, but the equipment the plan counts
 *       on is not coming, and the sooner that is seen the more suppliers are still an option.
 *    4. The earliest-due late checkpoint — the root slip, not the last domino.
 *    5. Silence: a quote sitting unanswered a week. The single most common way a designer loses a
 *       booking, and invisible on every other screen. */
function alertFor(
  row: Omit<RunwayRow, "alert" | "action" | "lateCount">,
  today: string,
): { alert?: string; action?: NextAction } {
  const { event: e, lane, checkpoints, daysUntil } = row;
  if (lane === "closed") return {};
  if (e.proposalPendingSince !== undefined) {
    return { alert: "הלקוח שלח שינויים לסקיצה — ממתינים לתשובה", action: { label: "לבדיקת השינויים", target: "proposal" } };
  }
  if (e.designChangedSinceQuote && e.quoteSentAt) {
    return { alert: "העיצוב השתנה מאז ההצעה שנשלחה", action: { label: "לעדכון ההצעה", target: "quote" } };
  }
  // Money the order says should be in by now and is not (lib/billing): before a supplier's refusal
  // because the studio buys with it, after the client's own waiting and a misleading quote.
  if (e.paymentLate) {
    return {
      alert: `${e.paymentLate.label} באיחור — ${Math.round(e.paymentLate.amount).toLocaleString("he-IL")} ₪ טרם התקבלו`,
      action: { label: "לתשלומים", target: "billing" },
    };
  }
  if (e.orders?.declined) {
    return {
      alert: e.orders.declined === 1 ? "ספק דחה הזמנה — צריך ספק אחר" : `${e.orders.declined} הזמנות נדחו — צריך ספק אחר`,
      action: { label: "להזמנות", target: "orders" },
    };
  }

  const late = checkpoints
    .filter((c) => c.late)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))[0];
  if (late) return { alert: CHECKPOINT_BY_ID[late.id].lateLine(daysUntil ?? 0), action: ACTION_FOR[late.id] };

  if (lane === "proposal" && e.quoteSentAt) {
    const sent = new Date(e.quoteSentAt).toISOString().slice(0, 10);
    const waiting = daysBetween(sent, today);
    if (waiting >= 7) return { alert: `ההצעה נשלחה לפני ${waiting} ימים — עוד לא אושרה`, action: ACTION_FOR.confirm };
  }
  return {};
}

export function buildRow(e: EventFacts, offsets: CheckpointOffsets, today: string): RunwayRow {
  const lane = laneOf(e, today);
  const daysUntil = e.date ? daysBetween(today, e.date) : null;
  const checkpoints = checkpointsFor(e, offsets, today, lane);
  const base = { event: e, lane, daysUntil, checkpoints };
  return {
    ...base,
    ...alertFor(base, today),
    lateCount: checkpoints.filter((c) => c.late).length,
  };
}

// ── Collisions ─────────────────────────────────────────────────────────────────────────────────

/** Two events close enough together that one of them is a problem.
 *
 *  Named rather than drawn, and that is a deliberate choice against a Gantt: a bar chart makes you
 *  SPOT an overlap and then work out what it means. A band that says "חופה אחת, שתי דרישות" has
 *  already done the thinking. */
export interface Collision {
  kind: "proximity";
  /** In runway order — the earlier event first. */
  eventIds: [string, string];
  message: string;
}

/** The window an event actually occupies: load-in through the day itself. The truck is at the hall
 *  the afternoon before, so two events whose DATES differ by two days can still want the same
 *  chuppah, the same carpet and the same pair of hands at the same hour. */
export function windowOf(e: EventFacts): { from: string; to: string } {
  const to = e.date;
  const from = e.setupDate && e.setupDate < to ? e.setupDate : to;
  return { from, to };
}

/** How many clear days two events need between them before they stop being one problem. */
export const PROXIMITY_DAYS = 1;

/** Every pair of live, dated events whose windows touch or nearly touch.
 *
 *  Only `production` and `proposal` — an event with no quote out is not yet a demand on anything,
 *  and warning about a collision with something that may never happen is how a warning gets
 *  ignored. Same reasoning procurement uses to keep uncommitted work out of the order. */
export function collisionsIn(rows: readonly RunwayRow[]): Collision[] {
  const live = rows
    .filter((r) => r.event.date && (r.lane === "production" || r.lane === "proposal"))
    .sort((a, b) => (a.event.date < b.event.date ? -1 : 1));

  const out: Collision[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = windowOf(live[i].event);
      const b = windowOf(live[j].event);
      // Sorted by date, so b starts no earlier than a. Once b is clear of a, every later j is too.
      const gap = daysBetween(a.to, b.from);
      if (gap > PROXIMITY_DAYS) break;
      const days = daysBetween(live[i].event.date, live[j].event.date);
      // Named when it can be: "ציוד וצוות משותפים" is a guess until someone is on both trucks.
      const people = sharedCrew(live[i].event, live[j].event);
      const who = people.length ? ` — ${people.join(", ")} בשניהם` : "";
      out.push({
        kind: "proximity",
        eventIds: [live[i].event.id, live[j].event.id],
        message:
          days === 0
            ? `שני אירועים באותו יום — ציוד וצוות משותפים${who}`
            : `שני אירועים בהפרש ${days} ימים — ההקמה של השני חופפת לפירוק של הראשון${who}`,
      });
    }
  }
  return out;
}

// ── The whole runway ───────────────────────────────────────────────────────────────────────────

export interface Runway {
  /** Chronological, always. A timeline you can re-sort is not a timeline — urgency is a FILTER
   *  here (`needsAttention`), never a sort, so a row never moves out from under the eye. */
  rows: RunwayRow[];
  collisions: Collision[];
  counts: Record<LaneId, number>;
  /** Rows carrying an alert, across every lane. The one number in the filter bar. */
  needsAttention: number;
}

export function buildRunway(
  facts: readonly EventFacts[],
  offsets: CheckpointOffsets,
  today: string,
): Runway {
  const rows = facts
    .map((e) => buildRow(e, offsets, today))
    // Dated events first, soonest to furthest; undated ones last, since they have no place on a
    // time axis but still have to be reachable.
    .sort((a, b) => {
      if (!a.event.date) return b.event.date ? 1 : 0;
      if (!b.event.date) return -1;
      return a.event.date < b.event.date ? -1 : a.event.date > b.event.date ? 1 : 0;
    });

  const counts: Record<LaneId, number> = { production: 0, proposal: 0, early: 0, closed: 0 };
  for (const r of rows) counts[r.lane]++;

  return {
    rows,
    collisions: collisionsIn(rows),
    counts,
    needsAttention: rows.filter((r) => r.alert).length,
  };
}

// ── Self-check ─────────────────────────────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`runway: ${message}`);
}

if (isMain(import.meta.url)) {
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
}
