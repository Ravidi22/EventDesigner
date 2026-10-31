"use server";
// One evening, two businesses — the endpoints of the join (./types.ts says what may cross).
//
// Every export is a public POST endpoint, so each one establishes WHICH SIDE of a link the caller is
// on before it reads anything: the venue through its own booking (venue_org_id on the link and the
// event's organisation), the designer through studio_org_id. Only then does it call the trusting
// reads in ./reads.ts. A caller on neither side gets the same refusal whether the link exists or not.
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentActor } from "@/lib/db/org";
import { eventLinks, events, organizations, users } from "@/lib/db/schema";
import { revalidateBookings, revalidateEvents } from "@/lib/db/revalidate";
import { notify, studioRecipients } from "@/lib/notifications/write";
import { requireVenueActor } from "@/lib/hosting/guard";
import { businessName, designerHallSketch, hostingForDesigner, linkRowOf, studioSideLinks, venueSideLinks } from "./reads";
import { adoptBookingFacts } from "./sync";
import type { HallSketch, HostingForDesigner, StudioSideLink, VenueSideLink } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DENIED = "אין לך גישה לאירוע הזה";

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${field} must be a uuid`);
}

/** A designer's studio — the other side of every link. */
async function requireStudioActor(write = false) {
  const actor = await currentActor();
  if (actor.organizationKind !== "studio") throw new Error(DENIED);
  if (write && actor.role === "crew") throw new Error("אין לך הרשאה לשנות את זה");
  return actor;
}

/** The venue's own booking, or a refusal. */
async function ownBooking(venueOrgId: string, venueEventId: string) {
  assertId(venueEventId, "venueEventId");
  const [row] = await db()
    .select({ id: events.id, clientName: events.clientName })
    .from(events)
    .where(and(eq(events.id, venueEventId), eq(events.organizationId, venueOrgId)))
    .limit(1);
  if (!row) throw new Error(DENIED);
  return row;
}

// ── the venue's side ───────────────────────────────────────────────────────────────────────────

/** Name the designer of this evening by the address they sign in with. If that address is a
 *  designer's studio already, the invitation lands in its bell at once; if not, it waits for the
 *  address to open one (adoptLinkInvites, at /welcome). A second invitation replaces a declined,
 *  ended or still-pending one — never an active link, which is cancelled first. */
export async function inviteDesigner(venueEventId: string, email: string): Promise<VenueSideLink | { error: string }> {
  const actor = await requireVenueActor(true);
  const booking = await ownBooking(actor.organizationId, venueEventId);
  const address = String(email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(address)) return { error: "כתובת אימייל לא תקינה" };

  const existing = await linkRowOf(venueEventId);
  if (existing?.state === "active") return { error: "האירוע כבר מקושר למעצב — יש לבטל את הקישור קודם" };

  const [designer] = await db()
    .select({ orgId: users.organizationId, orgKind: organizations.kind })
    .from(users)
    .leftJoin(organizations, eq(organizations.id, users.organizationId))
    .where(and(eq(users.email, address), eq(users.kind, "studio")))
    .limit(1);
  if (designer?.orgId && designer.orgKind !== "studio") return { error: "הכתובת הזו שייכת לעסק שאינו סטודיו לעיצוב" };
  if (designer?.orgId === actor.organizationId) return { error: "זו כתובת של האולם עצמו" };
  const studioOrgId = designer?.orgId ?? null;

  const values = {
    venueEventId,
    venueOrgId: actor.organizationId,
    studioOrgId,
    studioEventId: null,
    invitedEmail: address,
    invitedBy: actor.userId,
    state: "pending" as const,
    createdAt: new Date(),
    acceptedAt: null,
  };
  await db()
    .insert(eventLinks)
    .values(values)
    .onConflictDoUpdate({ target: eventLinks.venueEventId, set: values });

  if (studioOrgId) {
    await notify(await studioRecipients(studioOrgId), {
      kind: "link.invited",
      organizationId: studioOrgId,
      eventId: null,
      payload: { actorName: (await businessName(actor.organizationId)).name, eventLabel: booking.clientName },
    });
  }
  revalidateBookings();
  revalidateEvents();
  return (await venueSideLinks([venueEventId])).get(venueEventId)!;
}

/** End the link from the venue's side. The designer's event stays theirs, and simply stops
 *  following the booking. */
export async function cancelDesignerLink(venueEventId: string): Promise<void> {
  const actor = await requireVenueActor(true);
  await ownBooking(actor.organizationId, venueEventId);
  await db()
    .update(eventLinks)
    .set({ state: "ended" })
    .where(and(eq(eventLinks.venueEventId, venueEventId), eq(eventLinks.venueOrgId, actor.organizationId)));
  revalidateBookings();
  revalidateEvents();
}

/** The designer's plain hall sketch for this booking — tables, chairs, stage, bars; never the
 *  design, never a price. Null while there is no active link. */
export async function fetchDesignerSketch(venueEventId: string): Promise<HallSketch | null> {
  const actor = await requireVenueActor();
  await ownBooking(actor.organizationId, venueEventId);
  const link = await linkRowOf(venueEventId);
  if (!link || link.state !== "active" || !link.studioEventId || !link.studioOrgId) return null;
  return designerHallSketch(link.studioOrgId, link.studioEventId);
}

// ── the designer's side ────────────────────────────────────────────────────────────────────────

/** The invitations waiting for this studio, and the bookings behind its linked events. */
export async function fetchStudioLinks(): Promise<StudioSideLink[]> {
  const actor = await requireStudioActor();
  return studioSideLinks(actor.organizationId);
}

async function ownLink(studioOrgId: string, linkId: string) {
  assertId(linkId, "linkId");
  const [link] = await db()
    .select()
    .from(eventLinks)
    .where(and(eq(eventLinks.id, linkId), eq(eventLinks.studioOrgId, studioOrgId)))
    .limit(1);
  if (!link) throw new Error(DENIED);
  return link;
}

/** Accept an invitation — onto an event this studio already has, or a new one opened from the
 *  booking (the client's name and phone, the event type and the shared facts). Either way the event
 *  takes the booking's date, rooms and guests now, and follows them from here on. */
export async function acceptLinkInvite(linkId: string, studioEventId: string | null): Promise<{ eventId: string } | { error: string }> {
  const actor = await requireStudioActor(true);
  const link = await ownLink(actor.organizationId, linkId);
  if (link.state !== "pending") return { error: "ההזמנה כבר לא ממתינה" };

  let eventId = studioEventId;
  if (eventId) {
    assertId(eventId, "studioEventId");
    const [own] = await db()
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.organizationId, actor.organizationId)))
      .limit(1);
    if (!own) throw new Error(DENIED);
    const [taken] = await db().select({ id: eventLinks.id }).from(eventLinks).where(and(eq(eventLinks.studioEventId, eventId), eq(eventLinks.state, "active"))).limit(1);
    if (taken) return { error: "האירוע הזה כבר מקושר לאולם אחר" };
  } else {
    // A new event, opened from the booking's own card: who it is for and how to reach them. The
    // shared facts follow just below, with every other accept.
    const [booking] = await db()
      .select({ clientName: events.clientName, phone: events.phone, contactName: events.contactName, eventType: events.eventType })
      .from(events)
      .where(and(eq(events.id, link.venueEventId), eq(events.organizationId, link.venueOrgId)))
      .limit(1);
    if (!booking) return { error: "האירוע באולם כבר לא קיים" };
    eventId = crypto.randomUUID();
    await db().insert(events).values({
      id: eventId,
      organizationId: actor.organizationId,
      clientName: booking.clientName,
      phone: booking.phone,
      contactName: booking.contactName,
      eventType: booking.eventType,
    });
  }

  await adoptBookingFacts(link.venueEventId, link.venueOrgId, eventId, actor.organizationId);
  await db().update(eventLinks).set({ state: "active", studioEventId: eventId, acceptedAt: new Date() }).where(eq(eventLinks.id, link.id));

  const [booking] = await db().select({ clientName: events.clientName }).from(events).where(eq(events.id, link.venueEventId)).limit(1);
  await notify(await studioRecipients(link.venueOrgId), {
    kind: "link.accepted",
    organizationId: link.venueOrgId,
    eventId: link.venueEventId,
    payload: { actorName: (await businessName(actor.organizationId)).name, eventLabel: booking?.clientName },
  });
  revalidateEvents();
  revalidateBookings();
  return { eventId };
}

export async function declineLinkInvite(linkId: string): Promise<void> {
  const actor = await requireStudioActor(true);
  const link = await ownLink(actor.organizationId, linkId);
  if (link.state !== "pending") return;
  await db().update(eventLinks).set({ state: "declined" }).where(eq(eventLinks.id, link.id));
  const [booking] = await db().select({ clientName: events.clientName }).from(events).where(eq(events.id, link.venueEventId)).limit(1);
  await notify(await studioRecipients(link.venueOrgId), {
    kind: "link.declined",
    organizationId: link.venueOrgId,
    eventId: link.venueEventId,
    payload: { actorName: (await businessName(actor.organizationId)).name, eventLabel: booking?.clientName },
  });
  revalidateBookings();
  revalidateEvents();
}

/** The venue's card for one of this studio's events, when it is linked — every detail but the
 *  money (2026-10-30, the user: "the designer can see all the details in the event card"). */
export async function fetchHostingForEvent(studioEventId: string): Promise<HostingForDesigner | null> {
  const actor = await requireStudioActor();
  assertId(studioEventId, "studioEventId");
  const [link] = await db()
    .select()
    .from(eventLinks)
    .where(and(eq(eventLinks.studioEventId, studioEventId), eq(eventLinks.studioOrgId, actor.organizationId), eq(eventLinks.state, "active")))
    .limit(1);
  if (!link) return null;
  return hostingForDesigner(link.venueEventId, link.venueOrgId);
}

/** End the link from the designer's side. Their event stays, and stops following. */
export async function unlinkFromVenue(studioEventId: string): Promise<void> {
  const actor = await requireStudioActor(true);
  assertId(studioEventId, "studioEventId");
  const rows = await db()
    .update(eventLinks)
    .set({ state: "ended" })
    .where(and(eq(eventLinks.studioEventId, studioEventId), eq(eventLinks.studioOrgId, actor.organizationId), eq(eventLinks.state, "active")))
    .returning({ venueOrgId: eventLinks.venueOrgId });
  if (rows.length) revalidateBookings();
  revalidateEvents();
}
