"use server";
// Scheduled meetings with clients, in Postgres. See lib/appointments/types.ts for why the code word
// is "appointment" and the screen word is "פגישה".
//
// Same rules as every other actions module here: each export is a public POST endpoint, so each one
// starts with currentOrg() and scopes every statement by it, and nothing trusts an id it was handed.
// That last part does real work in this file — an appointment carries two foreign keys, an event and
// a venue, and a foreign key checks that a row EXISTS, never that it belongs to you. assertLinks()
// is that check; without it a caller could hang their meeting off another studio's event and the
// database would agree.
//
// SCOPED BY ORGANISATION, NOT BY VENUE GRANT — deliberately, and the same way lib/events/actions.ts
// is. These are the studio's own diary entries: a meeting may name no venue at all (a prospect), and
// filtering the diary by which properties you may open would hide exactly those. What a venue grant
// gates is the property and its plan, which is a different question and is answered in
// lib/venues/actions.ts.
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentOrg } from "@/lib/db/org";
import { appointments, events, venues } from "@/lib/db/schema";
import type { Appointment } from "./types";
import { isAppointmentKind } from "./types";
import { toAppointment, toAppointmentRow } from "./db-mapping";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const NOTE_MAX = 2000;
const NAME_MAX = 200;

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${field} must be a uuid`);
}

/** A calendar day, and one that exists. The shape test alone accepts 2026-02-31, which Postgres then
 *  rejects mid-transaction with a message the user never sees. */
function assertISODate(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) throw new Error(`${field} must be yyyy-mm-dd`);
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d)
    throw new Error(`${field} is not a real date`);
}

function assertAppointment(value: unknown): asserts value is Appointment {
  if (!value || typeof value !== "object") throw new Error("appointment must be an object");
  const a = value as Partial<Appointment>;
  assertId(a.id, "appointment.id");
  assertISODate(a.date, "appointment.date");
  if (a.eventId !== undefined) assertId(a.eventId, "appointment.eventId");
  if (a.venueId !== undefined) assertId(a.venueId, "appointment.venueId");
  if (a.time !== undefined && !HHMM.test(a.time)) throw new Error("appointment.time must be HH:mm");
  if (!Number.isInteger(a.durationMin) || a.durationMin! < 0 || a.durationMin! > 24 * 60)
    throw new Error("appointment.durationMin must be 0–1440 minutes");
  if (!isAppointmentKind(a.kind)) throw new Error("appointment.kind is not one of the four kinds");
  // The name may be empty — a meeting booked before the couple gave one is the normal first row.
  if (typeof a.clientName !== "string" || a.clientName.length > NAME_MAX)
    throw new Error("appointment.clientName must be a string under 200 characters");
  if (typeof a.phone !== "string" || a.phone.length > NAME_MAX)
    throw new Error("appointment.phone must be a string under 200 characters");
  if (typeof a.note !== "string" || a.note.length > NOTE_MAX)
    throw new Error("appointment.note must be a string under 2000 characters");
  if (typeof a.createdAt !== "number") throw new Error("appointment.createdAt must be epoch ms");
}

/** The event and the venue an appointment points at, if any, both owned by this studio. */
async function assertLinks(
  organizationId: string,
  eventId: string | undefined,
  venueId: string | undefined,
): Promise<void> {
  const database = db();
  if (eventId) {
    const [row] = await database
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.organizationId, organizationId)))
      .limit(1);
    if (!row) throw new Error("event not found");
  }
  if (venueId) {
    const [row] = await database
      .select({ id: venues.id })
      .from(venues)
      .where(and(eq(venues.id, venueId), eq(venues.organizationId, organizationId)))
      .limit(1);
    if (!row) throw new Error("venue not found");
  }
}

/** Every meeting this studio has, soonest first — the order the calendar and Today's Focus read in.
 *
 *  ASCENDING, unlike fetchEvents(). An event list is a backlog you scan from the newest thing added;
 *  a diary is read forward from today, and the index (organization_id, date) is built for that. */
export async function fetchAppointments(): Promise<Appointment[]> {
  const organizationId = await currentOrg();
  const rows = await db()
    .select()
    .from(appointments)
    .where(eq(appointments.organizationId, organizationId))
    .orderBy(asc(appointments.date), asc(appointments.startTime));
  return rows.map(toAppointment);
}

/** Create or replace one meeting. Returns the whole list, because every caller re-renders one. */
export async function saveAppointment(appointment: Appointment): Promise<Appointment[]> {
  assertAppointment(appointment);
  const organizationId = await currentOrg();
  await assertLinks(organizationId, appointment.eventId, appointment.venueId);

  const row = toAppointmentRow(appointment, organizationId);
  await db()
    .insert(appointments)
    .values(row)
    .onConflictDoUpdate({
      target: appointments.id,
      // Without this, a caller who knows another studio's appointment id could overwrite it: the
      // conflict target is the primary key alone, so the INSERT arm's org column never gets tested.
      setWhere: eq(appointments.organizationId, organizationId),
      // Column by column, never a spread of the payload — organizationId is the tenant boundary and
      // must not be writable. createdAt is absent too: re-saving must not move when it was booked.
      set: {
        eventId: row.eventId,
        clientName: row.clientName,
        phone: row.phone,
        venueId: row.venueId,
        date: row.date,
        startTime: row.startTime,
        durationMin: row.durationMin,
        kind: row.kind,
        note: row.note,
        done: row.done,
        updatedAt: row.updatedAt,
      },
    });
  return fetchAppointments();
}

/** Mark a meeting held, or un-mark it. Its own action rather than a saveAppointment round trip: this
 *  is one click on a calendar chip, and reading the whole record back to send it again would let two
 *  devices in the same studio overwrite each other's edits with stale fields. */
export async function setAppointmentDone(id: string, done: boolean): Promise<Appointment[]> {
  assertId(id, "id");
  if (typeof done !== "boolean") throw new Error("done must be a boolean");
  const organizationId = await currentOrg();
  await db()
    .update(appointments)
    .set({ done, updatedAt: new Date() })
    .where(and(eq(appointments.id, id), eq(appointments.organizationId, organizationId)));
  return fetchAppointments();
}

/** Cancel a meeting outright. A real delete, not an archive flag: an appointment carries no work —
 *  no drawing, no quote, nothing downstream depends on the row existing — so there is nothing for a
 *  tombstone to protect, and a diary that keeps every cancellation is a diary nobody can read. */
export async function deleteAppointment(id: string): Promise<Appointment[]> {
  assertId(id, "id");
  const organizationId = await currentOrg();
  await db()
    .delete(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.organizationId, organizationId)));
  return fetchAppointments();
}
