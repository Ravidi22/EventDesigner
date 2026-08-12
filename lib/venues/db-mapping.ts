// Rows ↔ venue types. Pure, no I/O, no directive — separate file because a "use server" module may
// only export async functions.
//
// This mapping is far thinner than the catalog's, and for a good reason: the plan, the wall graph
// and a zone's source are all held as JSONB exactly as the app shapes them (ADR-4's habit, applied
// to geometry). Only three things actually need translating — the epoch-millisecond timestamps the
// app uses, and the two directions of null/undefined.
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { venues, zones, venueStructures, venueGrants } from "@/lib/db/schema";
import type { GrantKind, VenueGrant, VenueRole } from "./access";
import type { Venue, VenuePlan } from "./types";
import type { Zone, ZoneKind, ZoneSource, ZoneCapacity } from "./zone";
import type { VenueStructure } from "./structure";
import type { ElementStyle } from "@/lib/element-style";

export type VenueRow = InferSelectModel<typeof venues>;
export type ZoneRow = InferSelectModel<typeof zones>;
export type StructureRow = InferSelectModel<typeof venueStructures>;
export type VenueInsert = InferInsertModel<typeof venues>;
export type ZoneInsert = InferInsertModel<typeof zones>;
export type StructureInsert = InferInsertModel<typeof venueStructures>;

const orUndefined = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

export function toVenue(row: VenueRow): Venue {
  return {
    id: row.id,
    name: row.name,
    logoUrl: orUndefined(row.logoUrl),
    plan: row.plan as VenuePlan,
  };
}

export function toVenueRow(v: Venue, organizationId: string): VenueInsert {
  return {
    id: v.id,
    organizationId,
    name: v.name,
    logoUrl: v.logoUrl ?? null,
    plan: v.plan,
  };
}

export function toZone(row: ZoneRow): Zone {
  return {
    id: row.id,
    venueId: row.venueId,
    name: row.name,
    kind: row.kind as ZoneKind,
    source: row.source as ZoneSource,
    ceilingHeightMm: row.ceilingHeightMm,
    capacity: orUndefined(row.capacity) as ZoneCapacity | undefined,
    style: orUndefined(row.style) as ElementStyle | undefined,
    // The app carries createdAt as epoch milliseconds (it sorts and compares, never formats a
    // timezone), while the column is timestamptz so the database can reason about it too.
    createdAt: row.createdAt.getTime(),
  };
}

export function toZoneRow(z: Zone, organizationId: string): ZoneInsert {
  return {
    id: z.id,
    organizationId,
    venueId: z.venueId,
    name: z.name,
    kind: z.kind,
    source: z.source,
    ceilingHeightMm: z.ceilingHeightMm,
    capacity: z.capacity ?? null,
    style: z.style ?? null,
    createdAt: new Date(z.createdAt),
  };
}

export type GrantRow = InferSelectModel<typeof venueGrants>;

/** A grant row as the sharing screen reads it.
 *
 *  Two column names change meaning on the way out. `granteeUserId` becomes `memberId` — from the
 *  screen's side the interesting fact is "this is one of my people", not which table the id came
 *  from. And `state` becomes `status`, whose two words are the same two values (schema note on
 *  inviteStateEnum). */
export function toGrant(row: GrantRow): VenueGrant {
  return {
    id: row.id,
    venueId: row.venueId,
    memberId: orUndefined(row.granteeUserId),
    // An address invited before it has an account has no name of its own to show.
    name: row.granteeName?.trim() || row.granteeEmail.split("@")[0],
    email: row.granteeEmail,
    kind: row.kind as GrantKind,
    role: row.role as VenueRole,
    status: row.state === "active" ? "active" : "pending",
    invitedAt: row.invitedAt ?? "",
  };
}

export function toStructureRow(
  venueId: string,
  structure: VenueStructure,
  organizationId: string,
): StructureInsert {
  return { venueId, organizationId, structure, updatedAt: new Date() };
}
