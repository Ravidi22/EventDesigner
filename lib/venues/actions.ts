"use server";
// Venues, their wall graph, their zones — and who may open them.
//
// Same rules as the catalog's actions: every export is a public POST endpoint, so every one starts
// with currentActor() and scopes every statement by the organisation, and nothing trusts an id it
// was handed.
//
// WHAT CHANGED HERE: the organisation is no longer the whole answer. A venue is the one thing in
// this app that differs BETWEEN members of one studio — the owner reaches every property, a
// designer reaches the ones they drew or were given (lib/team/types.ts, ROLE_CAPABILITIES.venues) —
// so every function below asks requireVenueAccess() as well. That policy existed as a shape in
// lib/venues/access.ts for a while with nothing behind it; this file is the behind.
//
// WHAT IS *NOT* HERE: which venue you are currently looking at. That is a per-device UI preference,
// not studio data — it belongs in this browser, changes when you click the switcher, and would be
// actively wrong to share between a designer's laptop and their tablet mid-setup. It stays in
// lib/venues/storage.ts.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentActor, type Actor } from "@/lib/db/org";
import { revalidateSettings, revalidateShell } from "@/lib/db/revalidate";
import { users, venues, venueGrants, zones, venueStructures, events, eventZones } from "@/lib/db/schema";
import { reachesAllVenues } from "@/lib/team/types";
import { ownedFileUrl, removeReplacedFile } from "@/lib/files/owned";
import {
  atLeast,
  isGrantKind,
  isVenueRole,
  type GrantKind,
  type ShareResult,
  type VenueGrant,
  type VenueRole,
} from "./access";
import { grantedVenueIds } from "./granted";
import { emptyStructure, type VenueStructure } from "./structure";
import { emptyPlan, type Venue, type VenueGeometry } from "./types";
import type { Zone } from "./zone";
import { toGrant, toVenue, toVenueRow, toZone, toZoneRow, toStructureRow } from "./db-mapping";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${field} must be a uuid`);
}

function assertName(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
}

/** The server's calendar day. `toISOString().slice(0,10)` would be the UTC day, which is yesterday
 *  for anyone working after 9pm in Israel. Same helper, same reason, as lib/auth/actions.ts. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── Access ─────────────────────────────────────────────────────────────────────────────────────

/**
 * What this caller may do to this property, or null for "nothing, and do not say why".
 *
 * The org check comes first and applies to everyone including the owner: a grant is only ever
 * consulted for a property this studio actually holds, so a stolen venue id from another tenant
 * fails on the same line whatever role the caller has.
 */
async function venueRoleFor(actor: Actor, venueId: string): Promise<VenueRole | null> {
  const database = db();

  const [venue] = await database
    .select({ id: venues.id })
    .from(venues)
    .where(and(eq(venues.id, venueId), eq(venues.organizationId, actor.organizationId)))
    .limit(1);
  if (!venue) return null;

  // The owner's access comes from their role, not from a row. Giving them grant rows too would put
  // them in the share list of every property they own, where "revoke" would be a button that does
  // nothing.
  if (reachesAllVenues(actor.role)) return "manager";
  if (!actor.userId) return null;

  const [grant] = await database
    .select({ role: venueGrants.role })
    .from(venueGrants)
    .where(
      and(
        eq(venueGrants.venueId, venueId),
        eq(venueGrants.granteeUserId, actor.userId),
        eq(venueGrants.kind, "member"),
        eq(venueGrants.state, "active"),
      ),
    )
    .limit(1);
  return (grant?.role as VenueRole | undefined) ?? null;
}

/**
 * Gate for everything below. Throws ONE message whether the property belongs to another studio,
 * does not exist, or simply was never shared with this person — a different message for each is a
 * way to ask the server which venue ids are real.
 */
async function requireVenueAccess(
  venueId: string,
  min: VenueRole,
): Promise<{ actor: Actor; role: VenueRole }> {
  assertId(venueId, "venueId");
  const actor = await currentActor();
  const role = await venueRoleFor(actor, venueId);
  if (!role || !atLeast(role, min)) throw new Error("אין לך גישה למתחם הזה");
  return { actor, role };
}

// `grantedVenueIds` moved to ./granted.ts — procurement needs the same answer, and a "use server"
// module cannot share a helper that takes an Actor without turning it into an endpoint that lets
// the caller name themselves. See the note in that file.

// ── Venues ─────────────────────────────────────────────────────────────────────────────────────

/** The venues this person may open, oldest first — the switcher's order, stable across reloads.
 *
 *  For the owner that is every property the studio holds. For a designer or the crew it is the ones
 *  they were granted, which is what makes "every member can have different venues" true rather than
 *  merely described. */
export async function fetchVenues(): Promise<Venue[]> {
  const actor = await currentActor();
  const allowed = await grantedVenueIds(actor);
  // Nobody's grants, nobody's venues. `inArray` with an empty list is a SQL error in some drivers
  // and an always-false condition in others; returning early is neither.
  if (allowed?.length === 0) return [];

  const rows = await db()
    .select()
    .from(venues)
    .where(
      allowed
        ? and(eq(venues.organizationId, actor.organizationId), inArray(venues.id, allowed))
        : eq(venues.organizationId, actor.organizationId),
    )
    .orderBy(asc(venues.createdAt));
  return rows.map(toVenue);
}

/** The plan editor's whole working set for one property: the wall graph and every zone on it.
 *
 *  One call rather than two, because the editor loads them together, holds them in one undo history
 *  together, and saves them together — a zone is a named region OF that graph, so fetching them
 *  apart invites a moment where one has loaded and the other has not. */
export async function fetchVenuePlan(
  venueId: string,
): Promise<{ structure: VenueStructure; zones: Zone[] }> {
  const { actor } = await requireVenueAccess(venueId, "viewer");
  return venuePlanFor(actor.organizationId, venueId);
}

/**
 * The plan itself, for a caller that has ALREADY established access.
 *
 * Not exported, and that is the point of it: in a "use server" module every export is a public POST
 * endpoint, so a function that skips the access check must be unreachable from outside this file.
 * The two callers below both check first — fetchVenuePlan through requireVenueAccess, and
 * fetchVenueGeometry through the venueRoleFor it already ran.
 *
 * Splitting it out is what stopped the check happening TWICE per geometry read: fetchVenueGeometry
 * resolved the role, then called fetchVenuePlan, which resolved it again — two extra queries on the
 * path of every studio and outputs screen, to re-answer a question already answered.
 *
 * The two reads are independent, so they go out together rather than one after the other.
 */
async function venuePlanFor(
  organizationId: string,
  venueId: string,
): Promise<{ structure: VenueStructure; zones: Zone[] }> {
  const database = db();
  const [[structureRow], zoneRows] = await Promise.all([
    database
      .select()
      .from(venueStructures)
      .where(and(eq(venueStructures.venueId, venueId), eq(venueStructures.organizationId, organizationId)))
      .limit(1),
    database
      .select()
      .from(zones)
      .where(and(eq(zones.venueId, venueId), eq(zones.organizationId, organizationId)))
      .orderBy(asc(zones.createdAt)),
  ]);

  return {
    // A property nobody has drawn yet has no structure row at all — an empty graph, not an error.
    structure: (structureRow?.structure as VenueStructure) ?? emptyStructure(),
    zones: zoneRows.map(toZone),
  };
}

/**
 * Everything eventPlan() needs to draw an event on its property (VenueGeometry): the walls, every
 * zone on the plane, and the scale they are measured in.
 *
 * ⚠ Returns an EMPTY geometry rather than throwing when the caller has no grant on the event's
 * venue. Events belong to the whole studio while venues do not, so this combination is reachable:
 * a designer opens an event booked into a hall nobody shared with them. Throwing would take down
 * the studio screen mid-meeting, which is the last thing anyone needs with a client in the room.
 *
 * But an empty plane on its own was a LIE by omission, and an expensive one — a drape with no wall
 * to measure falls back to its catalog width, so the quote silently under-charges (see
 * VenueGeometry.access). So the answer now carries its reason: `access` says whether this is a
 * property nobody picked, a property you may see, or a property that is not yours to open. The
 * screens render that; nothing has to infer it from an empty room.
 */
export async function fetchVenueGeometry(venueId: string | undefined): Promise<VenueGeometry> {
  const empty = { structure: emptyStructure(), zones: [], mmPerUnit: 1 };
  // An event whose details step has not picked a venue yet is a normal state, not a bad request.
  if (!venueId) return { ...empty, access: "none" };
  assertId(venueId, "venueId");
  const actor = await currentActor();
  const role = await venueRoleFor(actor, venueId);
  if (!role) return { ...empty, access: "denied" };

  // venuePlanFor, not fetchVenuePlan: the access check is the two queries directly above, and going
  // back through the public entry point would run venueRoleFor a second time for the same answer.
  // The scale lives on the venue row and the geometry in its own tables, so both go out at once.
  const [[venueRow], { structure, zones: zoneList }] = await Promise.all([
    db()
      .select({ plan: venues.plan })
      .from(venues)
      .where(and(eq(venues.id, venueId), eq(venues.organizationId, actor.organizationId)))
      .limit(1),
    venuePlanFor(actor.organizationId, venueId),
  ]);

  return {
    structure,
    zones: zoneList,
    mmPerUnit: (venueRow?.plan as { mmPerUnit?: number } | undefined)?.mmPerUnit ?? 1,
    access: "granted",
  };
}

/** A zone the save refused to delete, and who is standing on it. */
export interface BlockedZone {
  /** The zone's name, as it reads in the editor's list. */
  name: string;
  /** Every event booked into it. `archived` is called out because that is the case the designer
   *  cannot see from the dashboard, and so the one that reads as the app being wrong.
   *
   *  CAN BE EMPTY while the zone is still blocked — see the left join below. The editor words that
   *  case generically rather than pretending to a name it was not given. */
  events: { name: string; archived: boolean }[];
}

/** Save the plan editor's current state. Structure and zones move together, in ONE transaction.
 *
 *  The zone list is a SNAPSHOT — stepping back over "I named that room" leaves it simply shorter
 *  than what is stored, with no per-zone delete to replay — so this has to derive the difference
 *  itself: upsert everything in the list, delete only what has actually left it.
 *
 *  ⚠ IT USED TO DELETE EVERY ZONE OF THE VENUE AND RE-INSERT THE LIST, and that is a bug worth
 *  naming because it was invisible until a studio had done some work. `event_zones.zone_id` is ON
 *  DELETE RESTRICT — deliberately, so a region four events are booked into cannot be deleted out
 *  from under them (see the schema note on that table). The wholesale delete therefore hit RESTRICT
 *  on a zone NOBODY WAS REMOVING, the transaction aborted, and the WALLS went down with it: the
 *  moment one event booked one zone, that property's plan silently stopped saving forever. Every
 *  edit after that looked accepted on screen and reached nothing.
 *
 *  A zone that HAS left the list but still has events standing on it is not deleted either, and
 *  does not take the save down: it comes back in `blocked` — WITH THE EVENTS THAT ARE STANDING ON
 *  IT — so the editor can say why it is still there. Unbooking it is a change to those events,
 *  which is not this endpoint's to make.
 *
 *  ⚠ NAMING THE EVENTS IS THE POINT, not decoration. `blocked` used to carry zone names alone, and
 *  the refusal it produced ("there are events assigned to this area") was unanswerable: an event
 *  that is ARCHIVED is filtered off the dashboard, so a designer who had cleared every event they
 *  could see was told, correctly and uselessly, that one was still there. Naming it turns that into
 *  a two-step job — restore it from /production's ״הסתיים״ lane, then unbook or delete it.
 *
 *  Needs `editor`: there is one wall graph per property and no private copy, so saving over it is a
 *  real permission — see VENUE_ROLE_SUMMARY.
 *
 *  ⚠ Callers must debounce. The editor writes on every history entry — every wall dragged — and one
 *  request per mouse-up would be both slow and pointless. See the editor's autosave. */
export async function saveVenuePlan(
  venueId: string,
  structure: VenueStructure,
  zoneList: Zone[],
): Promise<{ blocked: BlockedZone[] }> {
  const { actor } = await requireVenueAccess(venueId, "editor");
  if (!structure || typeof structure !== "object") throw new Error("structure must be an object");
  if (!Array.isArray(zoneList)) throw new Error("zones must be an array");
  for (const z of zoneList) {
    assertId(z?.id, "zone.id");
    if (z.venueId !== venueId) throw new Error("zone belongs to another venue");
  }
  const organizationId = actor.organizationId;

  return db().transaction(async (tx) => {
    const row = toStructureRow(venueId, structure, organizationId);
    await tx
      .insert(venueStructures)
      .values(row)
      .onConflictDoUpdate({
        target: venueStructures.venueId,
        setWhere: eq(venueStructures.organizationId, organizationId),
        set: { structure: row.structure, updatedAt: row.updatedAt },
      });

    // What this property holds today, so "what left the list" is a set difference rather than a
    // delete of everything.
    const stored = await tx
      .select({ id: zones.id, name: zones.name })
      .from(zones)
      .where(and(eq(zones.venueId, venueId), eq(zones.organizationId, organizationId)));

    const inList = new Set(zoneList.map((z) => z.id));
    const gone = stored.filter((z) => !inList.has(z.id));
    const blocked: BlockedZone[] = [];

    if (gone.length) {
      // The reverse lookup the schema's note on event_zones asks for, done BEFORE the delete rather
      // than discovered as a constraint violation that would roll the walls back too.
      //
      // Joined to `events` for the client name the refusal is going to have to say out loud.
      //
      // ⚠ A **LEFT** JOIN, AND THE SCOPE SITS ON THE JOIN RATHER THAN IN THE WHERE. What decides
      // whether a zone may be deleted has to stay exactly what it was — "is there ANY row in
      // event_zones pointing at it" — because that is the question the FOREIGN KEY asks a few lines
      // below, and it asks it without a tenant filter. Move the organisation test into the where
      // clause with an inner join, and a row this studio cannot see would stop appearing here, the
      // zone would go into `deletable`, and the delete would hit ON DELETE RESTRICT and abort the
      // transaction — taking the WALL GRAPH down with it, which is precisely the catastrophe the
      // note above this function exists to record. So the scope narrows the NAME and never the
      // verdict: a row with no visible event still blocks, just anonymously.
      const booked = await tx
        .select({ zoneId: eventZones.zoneId, name: events.clientName, archived: events.archived })
        .from(eventZones)
        .leftJoin(events, and(eq(events.id, eventZones.eventId), eq(events.organizationId, organizationId)))
        .where(inArray(eventZones.zoneId, gone.map((z) => z.id)));
      const bookedIds = new Set(booked.map((b) => b.zoneId));

      for (const z of gone) {
        if (!bookedIds.has(z.id)) continue;
        blocked.push({
          name: z.name,
          events: booked
            .filter((b) => b.zoneId === z.id && b.name !== null)
            .map((b) => ({ name: b.name as string, archived: b.archived ?? false })),
        });
      }
      const deletable = gone.filter((z) => !bookedIds.has(z.id)).map((z) => z.id);
      if (deletable.length) {
        await tx
          .delete(zones)
          .where(
            and(
              eq(zones.venueId, venueId),
              eq(zones.organizationId, organizationId),
              inArray(zones.id, deletable),
            ),
          );
      }
    }

    if (zoneList.length) {
      // Upsert, so a zone that already exists is EDITED rather than deleted and re-created. Its id
      // is what event_zones points at; re-creating it under the same id inside one transaction
      // happened to work, but only because nothing looked in between.
      //
      // `setWhere` pins the update to a row already on THIS venue of THIS studio: an id belonging
      // to another property would otherwise be quietly moved here by naming it in the list.
      await tx
        .insert(zones)
        .values(zoneList.map((z) => toZoneRow(z, organizationId)))
        .onConflictDoUpdate({
          target: zones.id,
          setWhere: and(eq(zones.organizationId, organizationId), eq(zones.venueId, venueId)),
          set: {
            name: sql`excluded.name`,
            kind: sql`excluded.kind`,
            source: sql`excluded.source`,
            ceilingHeightMm: sql`excluded.ceiling_height_mm`,
            capacity: sql`excluded.capacity`,
            style: sql`excluded.style`,
          },
        });
    }

    return { blocked };
  });
}

/**
 * A new, unnamed property with an empty plan. Returns the full list plus the id to switch to.
 *
 * The creator gets a `manager` grant on it — unless they are the owner, whose access already covers
 * every property (see venueRoleFor). Without this row a designer would draw a site plan and then
 * watch it vanish from their own switcher on the next load, because they hold no grant to the thing
 * they just made.
 */
export async function createVenue(): Promise<{ venues: Venue[]; id: string }> {
  const actor = await currentActor();
  const id = crypto.randomUUID();

  await db().transaction(async (tx) => {
    await tx
      .insert(venues)
      .values(toVenueRow({ id, name: "מתחם חדש", plan: emptyPlan() }, actor.organizationId));

    if (!reachesAllVenues(actor.role) && actor.userId) {
      const [me] = await tx
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, actor.userId))
        .limit(1);
      if (me) {
        await tx.insert(venueGrants).values({
          venueId: id,
          grantorOrgId: actor.organizationId,
          granteeOrgId: actor.organizationId,
          granteeUserId: actor.userId,
          granteeEmail: me.email,
          granteeName: me.name,
          kind: "member",
          role: "manager",
          // Nothing to accept: they are already in this studio and already standing in this venue.
          state: "active",
          invitedAt: today(),
        });
      }
    }
  });

  revalidateShell();
  return { venues: await fetchVenues(), id };
}

export async function renameVenue(id: string, name: string): Promise<Venue[]> {
  assertName(name, "name");
  const { actor } = await requireVenueAccess(id, "manager");
  await db()
    .update(venues)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(and(eq(venues.id, id), eq(venues.organizationId, actor.organizationId)));
  revalidateShell();
  return fetchVenues();
}

/** Set or clear a venue's picture — the round mark the switcher shows in place of the initial.
 *  Same rules as the letterhead logo (lib/settings/actions.ts): only a file THIS studio uploaded is
 *  kept, and the file it replaces is deleted after the write, read before it. */
export async function setVenueLogo(id: string, logoUrl: string | null): Promise<Venue[]> {
  const { actor } = await requireVenueAccess(id, "manager");
  const scope = and(eq(venues.id, id), eq(venues.organizationId, actor.organizationId));
  const [before] = await db().select({ logoUrl: venues.logoUrl }).from(venues).where(scope).limit(1);
  const next = ownedFileUrl(logoUrl, actor.organizationId);
  await db().update(venues).set({ logoUrl: next, updatedAt: new Date() }).where(scope);
  await removeReplacedFile(before?.logoUrl, next, actor.organizationId);
  revalidateShell();
  return fetchVenues();
}

/** Delete a venue and everything that is only its own — the wall graph, its zones, and any grants
 *  handed out on it all cascade with it (ON DELETE CASCADE in the schema).
 *
 *  Checked up front rather than left to the database: `events.venue_id` is ON DELETE RESTRICT on
 *  purpose, so a venue with a real event on it would otherwise fail with a stack trace instead of a
 *  sentence — the record of where that event happened is a bigger loss than the click that
 *  triggered this one.
 *
 *  The refusal carries the COUNT, not only the sentence: the switcher turns it into a link to
 *  exactly those events (/production?venue=…). A refusal that names no way out is a dead end, and an
 *  undated event on the venue is otherwise easy to lose track of. */
export async function deleteVenue(id: string): Promise<Venue[] | { error: string; eventCount: number }> {
  const { actor } = await requireVenueAccess(id, "manager");
  const database = db();

  const [booked] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(events)
    .where(and(eq(events.venueId, id), eq(events.organizationId, actor.organizationId)));
  const eventCount = booked?.count ?? 0;
  if (eventCount > 0) {
    return {
      error:
        eventCount === 1
          ? "יש במתחם אירוע אחד — יש למחוק אותו לפני מחיקת המתחם"
          : `יש במתחם ${eventCount} אירועים — יש למחוק אותם לפני מחיקת המתחם`,
      eventCount,
    };
  }

  await database.delete(venues).where(and(eq(venues.id, id), eq(venues.organizationId, actor.organizationId)));
  revalidateShell();
  return fetchVenues();
}

/** Persist a venue record itself — its name, logo, and the plan's calibration/underlay.
 *
 *  ⚠ Insert-or-update, so this is also the one path that could CREATE a property from an id the
 *  caller chose. requireVenueAccess() refuses an id that does not already exist, which is what
 *  keeps it an update: new properties come from createVenue(), where the creator's grant is written
 *  in the same transaction. */
export async function saveVenue(venue: Venue): Promise<Venue[]> {
  if (!venue || typeof venue !== "object") throw new Error("venue must be an object");
  assertName(venue.name, "venue.name");
  const { actor } = await requireVenueAccess(venue.id, "manager");
  const row = toVenueRow(venue, actor.organizationId);
  await db()
    .insert(venues)
    .values(row)
    .onConflictDoUpdate({
      target: venues.id,
      setWhere: eq(venues.organizationId, actor.organizationId),
      set: { name: row.name, logoUrl: row.logoUrl, plan: row.plan, updatedAt: new Date() },
    });
  revalidateShell();
  return fetchVenues();
}

// ── Sharing ────────────────────────────────────────────────────────────────────────────────────

async function grantsOf(venueId: string): Promise<VenueGrant[]> {
  const rows = await db()
    .select()
    .from(venueGrants)
    .where(eq(venueGrants.venueId, venueId))
    .orderBy(asc(venueGrants.createdAt));
  return rows.map(toGrant);
}

/** Who has access to one property. Readable by anyone who can open it: knowing who else is standing
 *  in the hall is part of working in it, and it is the studio's own list either way. */
export async function fetchVenueGrants(venueId: string): Promise<VenueGrant[]> {
  await requireVenueAccess(venueId, "viewer");
  return grantsOf(venueId);
}

/**
 * Give someone access to one property.
 *
 * Two kinds, and the difference is not cosmetic (grantScope): a `member` is one of your own people
 * and the grant only adds a property to what their studio role already allows; a `guest` is outside
 * the studio and gets the plan and anonymous availability — never events, clients or prices.
 *
 * A member grant is `active` immediately. There is nothing for them to accept: they already have an
 * account in this studio, and a pending row would mean the owner shares a venue, the designer sees
 * nothing, and neither has a screen that explains why. A guest, who may have no account at all,
 * stays `pending` until sign-up exists for them.
 */
export async function shareVenue(input: {
  venueId: string;
  name: string;
  email: string;
  kind: GrantKind;
  role: VenueRole;
}): Promise<ShareResult> {
  const venueId = input?.venueId;
  const { actor } = await requireVenueAccess(venueId, "manager");

  if (!isGrantKind(input?.kind)) throw new Error("kind must be member | guest");
  if (!isVenueRole(input?.role)) throw new Error("role must be viewer | editor | manager");
  const address = String(input?.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(address)) {
    return { error: "כתובת אימייל לא תקינה", grants: await grantsOf(venueId) };
  }

  // For a member the address must be one of THIS studio's people — the id is looked up here rather
  // than accepted from the caller, so a hand-made POST cannot attach a grant to someone else's user
  // row and call it a teammate.
  let granteeUserId: string | null = null;
  if (input.kind === "member") {
    const [member] = await db()
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(
        and(
          eq(users.email, address),
          eq(users.organizationId, actor.organizationId),
          eq(users.kind, "studio"),
        ),
      )
      .limit(1);
    if (!member) return { error: "האדם הזה אינו חבר בסטודיו", grants: await grantsOf(venueId) };
    granteeUserId = member.id;
    if (granteeUserId === actor.userId) {
      return { error: "כבר יש לך גישה למתחם הזה", grants: await grantsOf(venueId) };
    }
  }

  try {
    await db().insert(venueGrants).values({
      venueId,
      grantorOrgId: actor.organizationId,
      granteeOrgId: input.kind === "member" ? actor.organizationId : null,
      granteeUserId,
      granteeEmail: address,
      granteeName: String(input?.name ?? "").trim() || null,
      kind: input.kind,
      role: input.role,
      state: input.kind === "member" ? "active" : "pending",
      invitedAt: today(),
    });
  } catch {
    // venue_grants_venue_email_key: one person, one grant per venue. Re-inviting an address that
    // already holds one is a role change, which has its own call.
    return { error: "הכתובת הזו כבר קיבלה גישה למתחם", grants: await grantsOf(venueId) };
  }

  revalidateSettings();
  return { grants: await grantsOf(venueId) };
}

/** The venue a grant belongs to — every mutation below needs it before it may check anything, and
 *  a grant id on its own says nothing about who is allowed to touch it. */
async function venueOfGrant(id: string): Promise<string> {
  assertId(id, "id");
  const [row] = await db().select({ venueId: venueGrants.venueId }).from(venueGrants).where(eq(venueGrants.id, id)).limit(1);
  if (!row) throw new Error("אין לך גישה למתחם הזה");
  return row.venueId;
}

export async function setGrantRole(id: string, role: VenueRole): Promise<VenueGrant[]> {
  if (!isVenueRole(role)) throw new Error("role must be viewer | editor | manager");
  const venueId = await venueOfGrant(id);
  await requireVenueAccess(venueId, "manager");
  await db().update(venueGrants).set({ role }).where(eq(venueGrants.id, id));
  revalidateSettings();
  return grantsOf(venueId);
}

/** Take access away.
 *
 *  You cannot revoke your own grant: for a designer that is the row holding up their access to the
 *  property they are standing in, and the click would lock them out of it with no way back in
 *  except asking the owner. Same shape as "you cannot remove yourself" on the team screen. */
export async function revokeGrant(id: string): Promise<VenueGrant[]> {
  const venueId = await venueOfGrant(id);
  const { actor } = await requireVenueAccess(venueId, "manager");

  const [row] = await db()
    .select({ granteeUserId: venueGrants.granteeUserId })
    .from(venueGrants)
    .where(eq(venueGrants.id, id))
    .limit(1);
  if (row?.granteeUserId && row.granteeUserId === actor.userId) {
    throw new Error("אי אפשר לבטל את הגישה של עצמכם");
  }

  await db().delete(venueGrants).where(eq(venueGrants.id, id));
  revalidateSettings();
  return grantsOf(venueId);
}
