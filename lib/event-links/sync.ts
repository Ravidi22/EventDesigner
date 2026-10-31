// The designer's event FOLLOWS the venue's booking on the facts both hold (SHARED_FACTS in
// ./types.ts): date, start time, venue, zones, guests. The hall is the authority on its own date,
// rooms and head count, so while a link is active every save of the booking writes them onto the
// linked event and tells the studio what moved. Nothing else on the designer's event is touched —
// not its drawing, its quote, its palette or its load-in day.
//
// ⚠ A PLAIN MODULE ON PURPOSE, never "use server": it writes a row in ANOTHER organisation, and
// "write these facts onto that event" must not be a POST endpoint. Only the venue's own booking
// actions call it, after they have saved — the link row (venue org, studio org, both event ids) is
// what entitles the write, and it is re-read here rather than taken from the caller.
//
// Best-effort, like a notification: the booking is already saved, and a failure here must not turn
// the venue's save into an error on its screen. It logs; the next save tries again.
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventHosting, eventLinks, eventZones, events } from "@/lib/db/schema";
import { notify, studioRecipients } from "@/lib/notifications/write";
import { revalidateBookings } from "@/lib/db/revalidate";
import { changedFacts, followedPatch, SHARED_FACT_LABEL } from "./types";

async function factsOf(eventId: string, organizationId: string) {
  const [[row], zoneRows, [hosting]] = await Promise.all([
    db()
      .select({ date: events.eventDate, time: events.startTime, venueId: events.venueId, zonesLabel: events.zonesLabel, guests: events.guests, clientName: events.clientName })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.organizationId, organizationId)))
      .limit(1),
    db().select({ zoneId: eventZones.zoneId }).from(eventZones).where(eq(eventZones.eventId, eventId)).orderBy(asc(eventZones.position)),
    db().select({ finalGuests: eventHosting.finalGuests }).from(eventHosting).where(eq(eventHosting.eventId, eventId)).limit(1),
  ]);
  if (!row) return null;
  return {
    date: row.date ?? "",
    time: row.time?.slice(0, 5) || undefined,
    venueId: row.venueId ?? undefined,
    zoneIds: zoneRows.map((z) => z.zoneId),
    zonesLabel: row.zonesLabel,
    // Once the hall has closed the count, the closed count is the one to design for.
    guests: hosting?.finalGuests ?? row.guests,
    clientName: row.clientName,
  };
}

/** Carry the booking's shared facts onto the linked designer event, if there is an active link and
 *  anything moved. `hostName` is printed in the studio's notification. */
export async function followBooking(venueEventId: string, hostName: string): Promise<void> {
  try {
    const [link] = await db().select().from(eventLinks).where(eq(eventLinks.venueEventId, venueEventId)).limit(1);
    if (!link || link.state !== "active" || !link.studioEventId || !link.studioOrgId) return;
    const [booking, before] = await Promise.all([factsOf(venueEventId, link.venueOrgId), factsOf(link.studioEventId, link.studioOrgId)]);
    if (!booking || !before) return;
    const after = followedPatch(booking);
    const moved = changedFacts(before, after);
    if (moved.length === 0) return;

    const studioEventId = link.studioEventId;
    const studioOrgId = link.studioOrgId;
    await db().transaction(async (tx) => {
      await tx
        .update(events)
        .set({
          eventDate: after.date || null,
          startTime: after.time ?? null,
          venueId: after.venueId ?? null,
          zonesLabel: after.zonesLabel,
          guests: after.guests,
        })
        .where(and(eq(events.id, studioEventId), eq(events.organizationId, studioOrgId)));
      await tx.delete(eventZones).where(eq(eventZones.eventId, studioEventId));
      if (after.zoneIds.length) {
        await tx.insert(eventZones).values(after.zoneIds.map((zoneId, position) => ({ eventId: studioEventId, zoneId, position })));
      }
    });
    await notify(await studioRecipients(studioOrgId), {
      kind: "link.updated",
      organizationId: studioOrgId,
      eventId: studioEventId,
      payload: { actorName: hostName, eventLabel: before.clientName, facts: moved.map((f) => SHARED_FACT_LABEL[f]) },
    });
    revalidateBookings();
  } catch (err) {
    console.error("followBooking failed", venueEventId, err);
  }
}

/** On accepting a link: the designer's event takes the booking's shared facts once, silently — the
 *  designer has just chosen to follow them. */
export async function adoptBookingFacts(venueEventId: string, venueOrgId: string, studioEventId: string, studioOrgId: string): Promise<void> {
  const booking = await factsOf(venueEventId, venueOrgId);
  if (!booking) return;
  const after = followedPatch(booking);
  await db().transaction(async (tx) => {
    await tx
      .update(events)
      .set({ eventDate: after.date || null, startTime: after.time ?? null, venueId: after.venueId ?? null, zonesLabel: after.zonesLabel, guests: after.guests })
      .where(and(eq(events.id, studioEventId), eq(events.organizationId, studioOrgId)));
    await tx.delete(eventZones).where(eq(eventZones.eventId, studioEventId));
    if (after.zoneIds.length) {
      await tx.insert(eventZones).values(after.zoneIds.map((zoneId, position) => ({ eventId: studioEventId, zoneId, position })));
    }
  });
}

/** An invitation sent to an address before it had a studio, adopted the day that address opens one
 *  — called from completeOnboarding, where the session has just proved the address is theirs. */
export async function adoptLinkInvites(email: string, studioOrgId: string): Promise<void> {
  await db()
    .update(eventLinks)
    .set({ studioOrgId })
    .where(and(eq(eventLinks.invitedEmail, email.toLowerCase()), eq(eventLinks.state, "pending"), isNull(eventLinks.studioOrgId)));
}
