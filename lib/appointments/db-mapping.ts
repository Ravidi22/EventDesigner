// Rows ↔ Appointment. Pure, no I/O, no directive — its own file because a "use server" module may
// only export async functions.
//
// The date/time columns follow lib/events/db-mapping.ts exactly, and for the same reason: neither
// value may round-trip through a `Date`. `new Date("2026-08-16")` is midnight UTC, so formatting it
// anywhere west of Greenwich prints the 15th — and a meeting on the wrong day is the one bug this
// whole feature cannot afford.
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { appointments } from "@/lib/db/schema";
import type { Appointment } from "./types";

export type AppointmentRow = InferSelectModel<typeof appointments>;
export type AppointmentInsert = InferInsertModel<typeof appointments>;

const orUndefined = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

/** Postgres `time` is HH:MM:SS; the app carries HH:mm. Trimmed rather than parsed — see above. */
const toClock = (v: string | null): string | undefined => (v ? v.slice(0, 5) : undefined);
const toTimeColumn = (v: string | undefined): string | null =>
  v ? (v.length === 5 ? `${v}:00` : v) : null;

export function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    eventId: orUndefined(row.eventId),
    clientName: row.clientName,
    phone: row.phone,
    venueId: orUndefined(row.venueId),
    date: row.date,
    time: toClock(row.startTime),
    durationMin: row.durationMin,
    kind: row.kind,
    note: row.note,
    // NOT NULL DEFAULT false in the column, optional in the type — absent and false are one value
    // spelled twice, so folding it back keeps the round-trip lossless (same as events.archived).
    done: row.done || undefined,
    createdAt: row.createdAt.getTime(),
  };
}

export function toAppointmentRow(a: Appointment, organizationId: string): AppointmentInsert {
  return {
    id: a.id,
    organizationId,
    eventId: a.eventId ?? null,
    clientName: a.clientName.trim(),
    phone: a.phone.trim(),
    venueId: a.venueId ?? null,
    date: a.date,
    startTime: toTimeColumn(a.time),
    durationMin: a.durationMin,
    kind: a.kind,
    note: a.note,
    done: a.done ?? false,
    createdAt: new Date(a.createdAt),
    // Touched on every write, unlike createdAt — this is the column that says "someone moved this
    // meeting", which is the question asked when a client and a calendar disagree.
    updatedAt: new Date(),
  };
}
