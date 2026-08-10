"use server";
// What a CLIENT may see: their own events, and nothing else.
//
// This is the mirror of the studio's actions and the rules are inverted. Those start with
// currentOrg() and scope by organisation; a client has no organisation, so currentOrg() throws for
// them by design. Here the scope is the event_clients table — the rows a designer created when they
// deliberately shared an event — and it is applied as a JOIN rather than a filter added afterwards,
// so there is no version of these queries that forgets it.
//
// ⚠ WHAT IS RETURNED IS CLIENT-FACING. The same rule as /present and meeting mode: no prices, no
// costs, no quantities on hand, no other client's anything. That is why this returns a hand-built
// shape rather than the EventSummary the studio uses — the studio's type carries a quote timestamp
// and a meeting-flow step, which are facts about the designer's process and none of the client's
// business. A narrower type cannot leak a field nobody remembered to strip.
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth/session";
import { eventClients, events, organizations, venues } from "@/lib/db/schema";

/** One event, as its client sees it. */
export interface ClientEvent {
  id: string;
  /** "" until the designer sets one — the client's own event may genuinely have no date yet. */
  date: string;
  time?: string;
  /** The zones, already joined into a label by the studio. */
  where: string;
  guests: number;
  venueName?: string;
  /** Which studio is designing it. A client can, in principle, have events with two. */
  studioName: string;
}

/**
 * The events shared with the signed-in client, soonest first.
 *
 * Returns an empty list for anyone who is not a client — a studio account calling this is not an
 * error, it simply has no events *as a client*, and throwing would make the shared header awkward
 * for no security gain.
 */
export async function fetchMyEvents(): Promise<ClientEvent[]> {
  const session = await currentSession();
  if (!session || session.kind !== "client") return [];

  const rows = await db()
    .select({
      id: events.id,
      date: events.eventDate,
      time: events.startTime,
      where: events.zonesLabel,
      guests: events.guests,
      venueName: venues.name,
      studioName: organizations.name,
    })
    .from(eventClients)
    // The join IS the permission check. An event with no row in event_clients for this user simply
    // does not appear — there is no branch that could skip the test.
    .innerJoin(events, eq(events.id, eventClients.eventId))
    .leftJoin(venues, eq(venues.id, events.venueId))
    .leftJoin(organizations, eq(organizations.id, events.organizationId))
    .where(and(eq(eventClients.userId, session.userId), eq(events.archived, false)))
    .orderBy(asc(events.eventDate));

  return rows.map((r) => ({
    id: r.id,
    date: r.date ?? "",
    time: r.time ? r.time.slice(0, 5) : undefined,
    where: r.where,
    guests: r.guests,
    venueName: r.venueName ?? undefined,
    studioName: r.studioName ?? "",
  }));
}
