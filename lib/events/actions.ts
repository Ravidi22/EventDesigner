"use server";
// Events, in Postgres.
//
// Same rules as the catalog's and the venues' actions: every export is a public POST endpoint, so
// every one starts with currentOrg() and scopes every statement by it, and nothing trusts an id it
// was handed. Here that matters more than usual, because an event carries FOREIGN KEYS — a venue and
// its zones — and a foreign key checks that a row EXISTS, never that it belongs to you. Without the
// ownership check below, a caller could attach their event to another studio's property and the
// database would happily agree. assertPlacement() is that check.
//
// WHAT IS *NOT* HERE: which event you currently have open. Like the active venue, that is a
// per-device pointer — it belongs in this browser and stays in lib/events/storage.ts.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentOrg } from "@/lib/db/org";
import { revalidateEvents } from "@/lib/db/revalidate";
import { events, eventZones, venues, zones } from "@/lib/db/schema";
import type { EventSummary } from "./types";
import { toEvent, toEvents, toEventRow, toEventZoneRows } from "./db-mapping";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${field} must be a uuid`);
}

function assertIdList(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  for (const v of value) assertId(v, `${field}[]`);
}

/** A calendar day, the app's way: "yyyy-mm-dd", or the empty string / an absent key for "not set
 *  yet" (both spellings reach here — the date field holds "" and a patch simply omits it).
 *
 *  SHAPE ONLY, deliberately. "2026-02-31" passes this and is then refused by Postgres, which is the
 *  right division of labour: a regex that also validated month lengths and leap years would be a
 *  second calendar implementation to keep in step with the first. What this stops is the class of
 *  thing that would otherwise reach a `date` column and produce a five-frames-deep driver error —
 *  "next tuesday", an epoch number, a Date that stringified to "Sun Aug 09 2026". */
function assertDay(value: unknown, field: string): asserts value is string | undefined {
  if (value === undefined || value === "") return;
  if (typeof value !== "string" || !ISO_DATE.test(value)) throw new Error(`${field} must be yyyy-mm-dd`);
}

/** An instant, as the app carries them: epoch milliseconds. Negative is refused rather than clamped —
 *  a quote sent before 1970 is a bug in the caller, not a date to reason about. */
function assertStamp(value: unknown, field: string): asserts value is number | undefined {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error(`${field} must be epoch ms`);
}

/** The event fields a caller may set. Everything else about a row — its id, its organisation, when
 *  it was created — is either fixed at creation or the server's to decide. */
export type EventPatch = Omit<Partial<EventSummary>, "id" | "createdAt">;

function assertEvent(value: unknown): asserts value is EventSummary {
  if (!value || typeof value !== "object") throw new Error("event must be an object");
  const e = value as Partial<EventSummary>;
  assertId(e.id, "event.id");
  if (typeof e.clientName !== "string" || e.clientName.trim() === "")
    throw new Error("event.clientName is required");
  assertIdList(e.zoneIds ?? [], "event.zoneIds");
  if (e.venueId !== undefined) assertId(e.venueId, "event.venueId");
  // The two calendar days and the three instants. They were unchecked until the production runway
  // gave the studio three more of them, and unchecked is a worse deal than it looks: every one of
  // these columns is now something a BACKWARD PLAN counts from (lib/production/runway.ts), so a
  // malformed value does not fail loudly at the boundary, it produces a screen full of confidently
  // wrong deadlines.
  assertDay(e.date, "event.date");
  assertDay(e.setupDate, "event.setupDate");
  assertStamp(e.quoteSentAt, "event.quoteSentAt");
  assertStamp(e.confirmedAt, "event.confirmedAt");
  assertStamp(e.lostAt, "event.lostAt");
  if (typeof e.createdAt !== "number") throw new Error("event.createdAt must be epoch ms");
}

/** A venue and zones this studio actually owns, and zones that are actually ON that venue.
 *
 *  Both halves matter. The first stops an event being attached to another studio's property; the
 *  second stops a plan being assembled out of rooms from two different sites, which the geometry
 *  layer has no way to draw and no way to report. */
async function assertPlacement(
  organizationId: string,
  venueId: string | undefined,
  zoneIds: string[],
): Promise<void> {
  if (!venueId) {
    if (zoneIds.length) throw new Error("zones were given without a venue");
    return;
  }
  const database = db();
  const [venue] = await database
    .select({ id: venues.id })
    .from(venues)
    .where(and(eq(venues.id, venueId), eq(venues.organizationId, organizationId)))
    .limit(1);
  if (!venue) throw new Error("venue not found");

  if (!zoneIds.length) return;
  const unique = [...new Set(zoneIds)];
  const found = await database
    .select({ id: zones.id })
    .from(zones)
    .where(
      and(
        inArray(zones.id, unique),
        eq(zones.venueId, venueId),
        eq(zones.organizationId, organizationId),
      ),
    );
  if (found.length !== unique.length) throw new Error("zone not found on this venue");
}

/** Every event this studio has, newest first — the order the dashboard reads in, and the order the
 *  list was in when it lived in this browser.
 *
 *  ⚠ NOT what the production runway reads. That screen is chronological by EVENT DATE rather than by
 *  when a file was opened, it needs facts from five other tables per row, and it is filtered by
 *  venue grant — so it assembles its own set (lib/production/actions.ts) instead of taking this one
 *  and decorating it. Two lists of the same events, answering two different questions. */
export async function fetchEvents(): Promise<EventSummary[]> {
  const organizationId = await currentOrg();
  const database = db();

  // One join-table read for the whole page rather than one per event: the N+1 that turns a season's
  // worth of events into a season's worth of round trips.
  //
  // The zone read names its events with a SUBQUERY rather than with the ids from the first result,
  // which is what lets the two go out together instead of one after the other. Passing the ids in
  // would have made this a waterfall — a second round trip that cannot start until the first lands —
  // and against a hosted database that round trip is the expensive part, not the query.
  const [rows, zoneRows] = await Promise.all([
    database
      .select()
      .from(events)
      .where(eq(events.organizationId, organizationId))
      .orderBy(desc(events.createdAt)),
    database
      .select()
      .from(eventZones)
      .where(
        inArray(
          eventZones.eventId,
          database.select({ id: events.id }).from(events).where(eq(events.organizationId, organizationId)),
        ),
      ),
  ]);

  if (!rows.length) return [];
  return toEvents(rows, zoneRows);
}

export async function fetchEvent(id: string): Promise<EventSummary | null> {
  assertId(id, "id");
  const organizationId = await currentOrg();
  const database = db();

  // Both reads key off the id we were handed rather than off each other's results, so they go out
  // together. The zone read is scoped by the event's own id and the row below is scoped by the
  // organisation — an event belonging to another studio is simply not found, and its zones are
  // discarded unread.
  const [[row], zoneRows] = await Promise.all([
    database
      .select()
      .from(events)
      .where(and(eq(events.id, id), eq(events.organizationId, organizationId)))
      .limit(1),
    database.select().from(eventZones).where(eq(eventZones.eventId, id)),
  ]);
  if (!row) return null;
  return toEvent(
    row,
    zoneRows.sort((a, b) => a.position - b.position).map((z) => z.zoneId),
  );
}

/** The event a device currently has open, resolved against what exists.
 *
 *  The id comes from the browser (lib/events/storage.ts), so it can name an event that was archived
 *  on another device, or belonged to a studio this user has left — hence "resolved". Falling back to
 *  the newest event keeps the studio and outputs screens usable on a device that has never picked
 *  one; a studio with no events at all gets null, which those screens already render. */
export async function fetchActiveEvent(id: string | null): Promise<EventSummary | null> {
  if (id) {
    const found = await fetchEvent(id);
    if (found) return found;
  }
  const list = await fetchEvents();
  return list[0] ?? null;
}

/** Create or replace an event, with its zone list, in ONE transaction.
 *
 *  Zones are replaced wholesale for the same reason the venue plan's are: the details form hands
 *  back the selection it is holding, and a selection that got SHORTER cannot be expressed as a
 *  series of adds. Returns the whole list, because every caller re-renders one. */
export async function saveEvent(event: EventSummary): Promise<EventSummary[]> {
  assertEvent(event);
  const organizationId = await currentOrg();
  const zoneIds = event.zoneIds ?? [];
  await assertPlacement(organizationId, event.venueId, zoneIds);

  const row = toEventRow(event, organizationId);
  await db().transaction(async (tx) => {
    await tx
      .insert(events)
      .values(row)
      .onConflictDoUpdate({
        target: events.id,
        setWhere: eq(events.organizationId, organizationId),
        // createdAt is deliberately absent: re-saving an event must not move the day it was opened.
        set: {
          clientName: row.clientName,
          phone: row.phone,
          contactName: row.contactName,
          contact2Name: row.contact2Name,
          contact2Phone: row.contact2Phone,
          eventDate: row.eventDate,
          startTime: row.startTime,
          // The load-in day is a details field like the event date, and it has to be listed here or
          // a patch that sets it would be accepted, revalidated, and silently dropped — a column
          // missing from this list is invisible on the way in and only shows up as "the truck day I
          // typed did not stick".
          setupDate: row.setupDate,
          venueId: row.venueId,
          zonesLabel: row.zonesLabel,
          guests: row.guests,
          step: row.step,
          quoteSentAt: row.quoteSentAt,
          // ⚠ THE CLIENT'S ANSWER GOES THROUGH HERE TOO, and it is the one pair on this list that a
          // form should never send. confirmEvent/markEventLost/reopenEvent below own these columns:
          // they are idempotent, they resolve the two against each other, and they are single
          // statements that two devices in one meeting cannot race. This path is a whole-row
          // overwrite, so a screen holding an event it loaded BEFORE a confirmation would un-confirm
          // it on the next unrelated save. They stay writable because clearing a stamp has to be
          // expressible — `{ confirmedAt: undefined }` is how an event returns to open, and
          // db:verify asserts exactly that round trip — but every caller in the app patches the one
          // field it changed (lib/events/use-events.ts), which is what keeps the hazard theoretical.
          confirmedAt: row.confirmedAt,
          lostAt: row.lostAt,
          archived: row.archived,
        },
      });
    await tx.delete(eventZones).where(eq(eventZones.eventId, event.id));
    if (zoneIds.length) await tx.insert(eventZones).values(toEventZoneRows(event.id, zoneIds));
  });
  revalidateEvents();
  return fetchEvents();
}

/** Patch an event in place — a details edit, an archive, a quote stamp.
 *
 *  The fields are copied across ONE BY ONE rather than spread. `patch` arrives over HTTP from
 *  whoever chose to POST it, and spreading it into .set() would let a caller write any column in the
 *  table, including organization_id — which is the whole tenant boundary. */
export async function patchEvent(id: string, patch: EventPatch): Promise<EventSummary[]> {
  assertId(id, "id");
  if (!patch || typeof patch !== "object") throw new Error("patch must be an object");
  // No currentOrg() call of its own: fetchEvent scopes the read and saveEvent scopes the write, so
  // an event belonging to another studio is simply not found here.
  const current = await fetchEvent(id);
  if (!current) throw new Error("event not found");

  const next: EventSummary = { ...current, ...patch, id, createdAt: current.createdAt };
  if (patch.zoneIds !== undefined) assertIdList(patch.zoneIds, "patch.zoneIds");
  return saveEvent(next);
}

/** F-1.2: the meeting flow only ever moves the furthest-reached stage FORWARD; revisiting an earlier
 *  one never regresses it.
 *
 *  GREATEST in SQL rather than read-modify-write, so two devices in the same meeting — the laptop
 *  driving and the tablet the client is holding — cannot race one another back down a stage. */
export async function reachStep(id: string, step: number): Promise<EventSummary[]> {
  assertId(id, "id");
  if (!Number.isInteger(step) || step < 0) throw new Error("step must be a non-negative integer");
  const organizationId = await currentOrg();
  await db()
    .update(events)
    .set({ step: sql`greatest(${events.step}, ${step})` })
    .where(and(eq(events.id, id), eq(events.organizationId, organizationId)));
  revalidateEvents();
  return fetchEvents();
}

// ── The client's answer ────────────────────────────────────────────────────────────────────────
//
// Three actions for two columns, and they are the ONE thing on the production runway that a person
// types. Everything else there is derived from a row the work produced (lib/production/runway.ts);
// "the client said yes" is derivable from nothing, which is exactly why it earns a button.
//
// They return ONE event rather than the whole list, unlike everything above. The runway can hold a
// season of events, and re-reading all of them — with their zones — to report that one of them was
// confirmed is a payload out of all proportion to the change; the screen splices the row it got.

/** What a confirm / lost / reopen did.
 *
 *  `event` is always present, INCLUDING when the change was refused, so the screen can re-render
 *  the row either way without a second read — the same shape and the same reason as InviteResult
 *  (lib/team/types.ts). `error` is a Hebrew line to show; authorization failures and ids that name
 *  nothing still throw, because those are not corrections a designer can make. */
export interface EventOutcome {
  event: EventSummary;
  error?: string;
}

/**
 * The client said yes.
 *
 * ── WHY THIS REFUSES WITHOUT A QUOTE ───────────────────────────────────────────────────────────
 *
 * Said yes to WHAT? A confirmation is an answer, and with no quote out there was no question. The
 * refusal is not pedantry about record-keeping — it is about what this column now drives:
 *
 *   • fetchProcurement reads `confirmed_at` as the commitment to BUY (lib/suppliers/actions.ts).
 *     That read exists because reading `quote_sent_at` as commitment was ordering stock against
 *     events nobody had agreed to; confirming with no price ever quoted would put the same class of
 *     unpriced work back into the purchase order by a different door.
 *   • The runway would show a row contradicting itself — a green "אישור" dot sitting after a red
 *     "הצעה" one that can never turn green, on a screen whose whole premise is that the dots are
 *     the truth about the event.
 *
 * And it is a correction the designer can actually make in one click: /outputs issues the quote and
 * stamps `quoteSentAt` on the way out (app/(app)/outputs/quote.tsx), after which this succeeds. A
 * refusal you cannot act on would be worth arguing about; this one is a two-minute detour through
 * the screen that produces the thing being agreed to.
 *
 * The counter-argument, recorded because it is a real one: clients say yes on the phone before the
 * paperwork, and a system that refuses to record what happened teaches people to lie to it. What
 * makes the refusal safe here is that "send the quote" is not paperwork the designer was skipping —
 * it is the artefact the yes refers to, and the studio wanted it in writing anyway.
 *
 * ⚠ It is a PRODUCT guard, not a security control. A caller can still write the column through
 * patchEvent, exactly as they can stamp quoteSentAt and then confirm. What it protects is the
 * studio's own data from its own fastest path, which is all a guard on your own tenant can be.
 */
export async function confirmEvent(id: string): Promise<EventOutcome> {
  assertId(id, "id");
  const organizationId = await currentOrg();
  const current = await fetchEvent(id);
  if (!current) throw new Error("event not found");
  if (!current.quoteSentAt) {
    return { event: current, error: "אי אפשר לאשר אירוע לפני שנשלחה הצעת מחיר." };
  }

  const [row] = await db()
    .update(events)
    .set({
      // COALESCE, not now(): confirming twice must not move the date the client said yes.
      //
      // In SQL rather than read-modify-write, for the same reason reachStep uses GREATEST — the
      // laptop and the tablet in one meeting are two requests, and the second one arriving must be
      // a no-op rather than a quiet rewrite of the first. The stamp is also what the "ההצעה נשלחה
      // לפני N ימים" line and every future report count from, so it has to mean the first yes.
      confirmedAt: sql`coalesce(${events.confirmedAt}, now())`,
      // Confirming CLEARS a loss. The two are mutually exclusive answers to one question, and lost
      // wins in laneOf() — so leaving both set would file a booked event under "הסתיים" and nobody
      // would ever produce it. A client who went quiet and came back is a normal week.
      lostAt: null,
    })
    .where(and(eq(events.id, id), eq(events.organizationId, organizationId)))
    .returning();
  if (!row) throw new Error("event not found");

  revalidateEvents();
  // The zone list is untouched by this statement, so the copy read above is still current — one
  // round trip saved over re-reading the join table to answer a question nothing asked.
  return { event: toEvent(row, current.zoneIds) };
}

/**
 * The client said no, or stopped answering.
 *
 * NO PRECONDITION, unlike confirming, and the asymmetry is the point: a lead can evaporate at any
 * stage, including before a price was ever quoted — that is the most common way it happens. There
 * is nothing to refuse and nobody to send anywhere.
 *
 * It deliberately does NOT clear `confirmedAt`. An event that was booked and then fell through is a
 * different and more expensive story than one that never closed — the studio may have spent money
 * on it — and erasing the confirmation would erase the only record of that. Nothing renders wrong
 * as a result: laneOf() reads the loss first and procurement filters on `lost_at IS NULL`, so the
 * event leaves the runway and leaves the purchase order either way. reopenEvent is what clears
 * both, which is precisely why it clears both.
 */
export async function markEventLost(id: string): Promise<EventOutcome> {
  assertId(id, "id");
  const organizationId = await currentOrg();
  const current = await fetchEvent(id);
  if (!current) throw new Error("event not found");

  const [row] = await db()
    .update(events)
    // Idempotent for the same reason as the confirmation: a second click must not move the day the
    // client stopped answering.
    .set({ lostAt: sql`coalesce(${events.lostAt}, now())` })
    .where(and(eq(events.id, id), eq(events.organizationId, organizationId)))
    .returning();
  if (!row) throw new Error("event not found");

  revalidateEvents();
  return { event: toEvent(row, current.zoneIds) };
}

/**
 * Back to open — a client who came back, or a button pressed by mistake.
 *
 * Clears BOTH stamps, which puts the event back wherever its own facts say it belongs: it falls to
 * the proposal lane if a quote is out and to early if not, because laneOf() derives the lane and
 * this is simply the absence of an answer. Landing in "awaiting an answer" rather than back in
 * production is the correct destination even for an event that was previously confirmed — the whole
 * reason it is being reopened is that the answer is in doubt again.
 *
 * Re-creating the event instead is the alternative this exists to prevent: one wedding, two rows,
 * and the drawings and quotes stranded on the first of them.
 */
export async function reopenEvent(id: string): Promise<EventOutcome> {
  assertId(id, "id");
  const organizationId = await currentOrg();
  const current = await fetchEvent(id);
  if (!current) throw new Error("event not found");

  const [row] = await db()
    .update(events)
    .set({ confirmedAt: null, lostAt: null })
    .where(and(eq(events.id, id), eq(events.organizationId, organizationId)))
    .returning();
  if (!row) throw new Error("event not found");

  revalidateEvents();
  return { event: toEvent(row, current.zoneIds) };
}
